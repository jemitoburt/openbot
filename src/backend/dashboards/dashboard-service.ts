import { randomUUID } from "node:crypto";
import {
  type CreateDashboardInput,
  DASHBOARD_LIMITS,
  type DashboardAction,
  type DashboardBlock,
  type DashboardChange,
  type DashboardChecklistItem,
  type DashboardDocument,
  type DashboardListInput,
  type DashboardRevisionInput,
  type DashboardSummary,
  type EditDashboardWidgetInput,
  isCreateDashboardInput,
  isDashboardDocument,
  isDashboardListInput,
  isDashboardRevisionInput,
  isEditDashboardWidgetInput,
  isPublicDashboardDocument,
  isToggleDashboardItemInput,
  isUpdateDashboardInput,
  type PluginState,
  type ToggleDashboardItemInput,
  type UpdateDashboardInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { sourceText } from "@openbot/i18n/source";
import { redactText } from "@openbot/logging";
import { Effect, Schema } from "effect";
import {
  databaseRow,
  databaseRows,
  optionalStringColumn,
  requiredNumberColumn,
  requiredStringColumn,
} from "../database/database-rows";
import type { OpenBotDatabase } from "../openbot-database";

export class DashboardOperationFailed extends Schema.TaggedError<DashboardOperationFailed>()(
  "DashboardOperationFailed",
  {
    code: Schema.Literals(["unavailable", "forbidden", "notFound", "conflict", "invalid", "storage", "limit"]),
    message: Schema.String,
  },
) {}
export interface DashboardActor {
  administrator: boolean;
  canReadAgent(agentId: string): boolean;
  canWriteAgent(agentId: string): boolean;
}
export const LOCAL_DASHBOARD_ACTOR: DashboardActor = {
  administrator: true,
  canReadAgent: () => true,
  canWriteAgent: () => true,
};
export interface DashboardServiceOptions {
  database: OpenBotDatabase;
  agentExists(agentId: string): boolean;
  routineBelongsToAgent(routineId: string, agentId: string): boolean;
  changed(change: DashboardChange): void;
}
function failure(code: DashboardOperationFailed["code"]): DashboardOperationFailed {
  const keys = {
    unavailable: "error.dashboard.unavailable",
    forbidden: "error.dashboard.forbidden",
    notFound: "error.dashboard.notFound",
    conflict: "error.dashboard.conflict",
    invalid: "error.dashboard.invalid",
    storage: "error.dashboard.storage",
    limit: "error.dashboard.limit",
  } as const;
  return new DashboardOperationFailed({ code, message: sourceText(keys[code]) });
}
function operation<A>(run: () => A): Effect.Effect<A, DashboardOperationFailed> {
  return Effect.try({
    try: run,
    catch: (error) => (error instanceof DashboardOperationFailed ? error : failure("storage")),
  });
}
/** Host-local saved documents. Effects execute synchronous SQLite operations at the service boundary. */
export class DashboardService {
  readonly #options: DashboardServiceOptions;
  constructor(options: DashboardServiceOptions) {
    this.#options = options;
  }
  readonly pluginState = Effect.fn("Dashboards.pluginState")(() => operation(() => this.#pluginState()));
  readonly setInstalled = Effect.fn("Dashboards.setInstalled")(
    (installed: boolean, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!actor.administrator) throw failure("forbidden");
        if (typeof installed !== "boolean") throw failure("invalid");
        this.#options.database.connection
          .prepare(
            "INSERT INTO installed_plugins(plugin_id, installed, version) VALUES ('dashboards', ?, 1) ON CONFLICT(plugin_id) DO UPDATE SET installed = excluded.installed",
          )
          .run(installed ? 1 : 0);
        this.#options.changed({ kind: "installation" });
        return this.#pluginState();
      }),
  );
  readonly list = Effect.fn("Dashboards.list")(
    (input: DashboardListInput = {}, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        this.#requireInstalled();
        if (!isDashboardListInput(input)) throw failure("invalid");
        if (input.agentId && !actor.canReadAgent(input.agentId)) throw failure("forbidden");
        const db = this.#options.database.connection;
        const rows = input.agentId
          ? db
              .prepare(
                "SELECT dashboard_id, agent_id, revision, created_at, updated_at, archived_at FROM agent_dashboards WHERE (? = 1 OR archived_at IS NULL) AND agent_id = ? ORDER BY updated_at DESC, dashboard_id LIMIT ?",
              )
              .all(input.includeArchived === true ? 1 : 0, input.agentId, DASHBOARD_LIMITS.documents)
          : db
              .prepare(
                "SELECT dashboard_id, agent_id, revision, created_at, updated_at, archived_at FROM agent_dashboards WHERE (? = 1 OR archived_at IS NULL) ORDER BY updated_at DESC, dashboard_id LIMIT ?",
              )
              .all(input.includeArchived === true ? 1 : 0, DASHBOARD_LIMITS.documents);
        const summaries: DashboardSummary[] = [];
        for (const row of databaseRows(rows)) {
          const agentId = requiredStringColumn(row, "agent_id");
          if (!this.#options.agentExists(agentId) || !actor.canReadAgent(agentId)) continue;
          const id = requiredStringColumn(row, "dashboard_id");
          // Content is never loaded for a list. Authorize the owner before SQLite reads its saved title.
          const titleRow = databaseRow(
            db
              .prepare(
                "SELECT json_extract(document_json, '$.title') AS title FROM agent_dashboards WHERE dashboard_id = ?",
              )
              .get(id),
          );
          if (!titleRow) continue;
          summaries.push({
            id,
            agentId,
            title: redactText(requiredStringColumn(titleRow, "title")),
            schemaVersion: 1,
            revision: requiredNumberColumn(row, "revision"),
            createdAt: requiredStringColumn(row, "created_at"),
            updatedAt: requiredStringColumn(row, "updated_at"),
            archivedAt: optionalStringColumn(row, "archived_at"),
          });
        }
        return summaries;
      }),
  );
  readonly read = Effect.fn("Dashboards.read")((id: string, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
    operation(() => publicDashboard(this.#read(id, actor, false))),
  );
  /** Explicit archive access keeps ordinary reads and updates limited to active documents. */
  readonly readArchived = Effect.fn("Dashboards.readArchived")(
    (id: string, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => publicDashboard(this.#read(id, actor, false, true))),
  );
  readonly create = Effect.fn("Dashboards.create")(
    (input: CreateDashboardInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        this.#requireInstalled();
        if (!isCreateDashboardInput(input)) throw failure("invalid");
        if (!actor.canWriteAgent(input.agentId)) throw failure("forbidden");
        if (!this.#options.agentExists(input.agentId)) throw failure("notFound");
        this.#checkReports(input.blocks, input.agentId);
        const db = this.#options.database.connection;
        const count = databaseRow(
          db.prepare("SELECT COUNT(*) AS total FROM agent_dashboards WHERE archived_at IS NULL").get(),
        );
        if (Number(count?.total) >= DASHBOARD_LIMITS.documents) throw failure("limit");
        const now = new Date().toISOString();
        const document: DashboardDocument = {
          id: `dashboard-${randomUUID()}`,
          agentId: input.agentId,
          title: input.title.trim(),
          schemaVersion: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          blocks: input.blocks,
        };
        const publicDocument = publicDashboard(document);
        db.prepare(
          "INSERT INTO agent_dashboards(dashboard_id, agent_id, revision, document_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(document.id, document.agentId, document.revision, JSON.stringify(document), now, now);
        this.#changed(document);
        return publicDocument;
      }),
  );
  readonly update = Effect.fn("Dashboards.update")(
    (input: UpdateDashboardInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!isUpdateDashboardInput(input)) throw failure("invalid");
        const document = this.#read(input.id, actor, true);
        this.#checkReports(input.blocks, document.agentId);
        return this.#save({ ...document, title: input.title.trim(), blocks: input.blocks }, input.revision);
      }),
  );
  readonly editWidget = Effect.fn("Dashboards.editWidget")(
    (input: EditDashboardWidgetInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!isEditDashboardWidgetInput(input)) throw failure("invalid");
        const document = this.#read(input.id, actor, true);
        if (document.revision !== input.revision) throw failure("conflict");
        const edit = input.edit;
        if (edit.type === "addReport") {
          if (!this.#options.routineBelongsToAgent(edit.routineId, document.agentId)) throw failure("forbidden");
          if (document.blocks.some((block) => block.type === "report" && block.routineId === edit.routineId))
            return publicDashboard(document);
          if (document.blocks.length >= DASHBOARD_LIMITS.blocks) throw failure("limit");
          const routine = databaseRow(
            this.#options.database.connection
              .prepare("SELECT name FROM projection_agent_routines WHERE routine_id = ? AND agent_id = ?")
              .get(edit.routineId, document.agentId),
          );
          if (!routine) throw failure("notFound");
          const title = requiredStringColumn(routine, "name");
          if (!title.trim() || title.length > DASHBOARD_LIMITS.title) throw failure("invalid");
          const block: DashboardBlock = {
            id: `dashboard-widget-${randomUUID()}`,
            type: "report",
            title,
            routineId: edit.routineId,
          };
          return this.#save({ ...document, blocks: [...document.blocks, block] }, input.revision);
        }
        const recipe =
          edit.type === "addRecipeIngredients"
            ? document.blocks.find((block) => block.id === edit.recipeBlockId)
            : null;
        if (
          edit.type === "addRecipeIngredients" &&
          (recipe?.type !== "rich" || !recipe.targetChecklistId || !recipe.ingredients?.length)
        )
          throw failure("notFound");
        const blockId =
          edit.type === "addChecklistItems" ? edit.blockId : recipe?.type === "rich" ? recipe.targetChecklistId : null;
        const checklist = document.blocks.find((block) => block.id === blockId);
        if (checklist?.type !== "checklist") throw failure("notFound");
        if (checklist.allowAdd === false) throw failure("forbidden");
        const additions: DashboardChecklistItem[] =
          edit.type === "addChecklistItems"
            ? edit.items
            : recipe?.type === "rich"
              ? (recipe.ingredients ?? []).map((ingredient) => {
                  const quantity = (ingredient.quantity * edit.portions) / (recipe.portions ?? 1);
                  if (!Number.isFinite(quantity)) throw failure("invalid");
                  return {
                    id: `dashboard-item-${randomUUID()}`,
                    text: ingredient.label,
                    checked: false,
                    source: "recipe",
                    quantity,
                    ...(ingredient.unit === undefined ? {} : { unit: ingredient.unit }),
                    ...(ingredient.category === undefined ? {} : { category: ingredient.category }),
                  };
                })
              : [];
        if (!additions.length || checklist.items.length + additions.length > DASHBOARD_LIMITS.items)
          throw failure("limit");
        if (additions.some((item) => checklist.items.some((existing) => existing.id === item.id)))
          throw failure("conflict");
        return this.#save(
          {
            ...document,
            blocks: document.blocks.map((block) =>
              block.id === checklist.id ? { ...checklist, items: [...checklist.items, ...additions] } : block,
            ),
          },
          input.revision,
        );
      }),
  );
  readonly archive = Effect.fn("Dashboards.archive")(
    (input: DashboardRevisionInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!isDashboardRevisionInput(input)) throw failure("invalid");
        const document = this.#read(input.id, actor, true);
        return this.#save({ ...document, archivedAt: new Date().toISOString() }, input.revision);
      }),
  );
  readonly restore = Effect.fn("Dashboards.restore")(
    (input: DashboardRevisionInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!isDashboardRevisionInput(input)) throw failure("invalid");
        const document = this.#read(input.id, actor, true, true);
        if (document.archivedAt === null || document.revision !== input.revision) throw failure("conflict");
        const count = databaseRow(
          this.#options.database.connection
            .prepare("SELECT COUNT(*) AS total FROM agent_dashboards WHERE archived_at IS NULL")
            .get(),
        );
        if (Number(count?.total) >= DASHBOARD_LIMITS.documents) throw failure("limit");
        return this.#save({ ...document, archivedAt: null }, input.revision, document.archivedAt);
      }),
  );
  readonly toggleItem = Effect.fn("Dashboards.toggleItem")(
    (input: ToggleDashboardItemInput, actor: DashboardActor = LOCAL_DASHBOARD_ACTOR) =>
      operation(() => {
        if (!isToggleDashboardItemInput(input)) throw failure("invalid");
        const document = this.#read(input.id, actor, true);
        const block = document.blocks.find((entry) => entry.id === input.blockId);
        const items = block?.type === "checklist" ? block.items : block?.type === "project" ? block.tasks : null;
        if (!items?.some((entry) => entry.id === input.itemId)) throw failure("notFound");
        const toggle = (item: DashboardChecklistItem) =>
          item.id === input.itemId
            ? { ...item, checked: input.checked, checkedAt: input.checked ? new Date().toISOString() : null }
            : item;
        const blocks = document.blocks.map((entry) => {
          if (entry.id !== input.blockId) return entry;
          if (entry.type === "checklist") return { ...entry, items: entry.items.map(toggle) };
          if (entry.type === "project") return { ...entry, tasks: entry.tasks.map(toggle) };
          return entry;
        });
        return this.#save({ ...document, blocks }, input.revision);
      }),
  );
  #pluginState(): PluginState {
    const row = databaseRow(
      this.#options.database.connection
        .prepare("SELECT installed FROM installed_plugins WHERE plugin_id = 'dashboards'")
        .get(),
    );
    return { id: "dashboards", version: 1, installed: row?.installed === 1 };
  }
  #requireInstalled(): void {
    if (!this.#pluginState().installed) throw failure("unavailable");
  }
  #read(id: string, actor: DashboardActor, write: boolean, includeArchived = false): DashboardDocument {
    this.#requireInstalled();
    const db = this.#options.database.connection;
    const owner = databaseRow(
      db
        .prepare("SELECT agent_id FROM agent_dashboards WHERE dashboard_id = ? AND (? = 1 OR archived_at IS NULL)")
        .get(id, includeArchived ? 1 : 0),
    );
    if (!owner) throw failure("notFound");
    const agentId = requiredStringColumn(owner, "agent_id");
    if (!actor.canReadAgent(agentId)) throw failure("notFound");
    if (write && !actor.canWriteAgent(agentId)) throw failure("forbidden");
    if (!this.#options.agentExists(agentId)) throw failure("notFound");
    const row = databaseRow(
      db
        .prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id = ? AND (? = 1 OR archived_at IS NULL)")
        .get(id, includeArchived ? 1 : 0),
    );
    if (!row) throw failure("notFound");
    const document = this.#decode(requiredStringColumn(row, "document_json"));
    if (document.agentId !== agentId || document.id !== id) throw failure("storage");
    return document;
  }
  #decode(json: string): DashboardDocument {
    const document = JSON.parse(json);
    if (!isDashboardDocument(document)) throw failure("storage");
    return document;
  }
  #checkReports(blocks: DashboardBlock[], agentId: string): void {
    const routine = (routineId: string) => {
      if (!this.#options.routineBelongsToAgent(routineId, agentId)) throw failure("invalid");
    };
    const action = (entry: DashboardAction | undefined) => {
      if (entry?.target.type === "routine") routine(entry.target.routineId);
    };
    for (const block of blocks) {
      if (block.type === "report") routine(block.routineId);
      if (block.type === "actions") for (const button of block.buttons) action(button);
      if (block.type === "callout" || block.type === "rich") action(block.action);
      if (block.type === "list") for (const item of block.items) action(item.action);
      if (block.type === "timeline") for (const event of block.events) if (event.routineId) routine(event.routineId);
      if (block.type === "week")
        for (const day of block.days) for (const event of day.events) if (event.routineId) routine(event.routineId);
      if (
        block.type === "rich" &&
        block.targetChecklistId &&
        !blocks.some((candidate) => candidate.id === block.targetChecklistId && candidate.type === "checklist")
      )
        throw failure("invalid");
    }
  }
  #save(document: DashboardDocument, revision: number, expectedArchivedAt: string | null = null): DashboardDocument {
    if (document.revision !== revision) throw failure("conflict");
    const next = { ...document, revision: revision + 1, updatedAt: new Date().toISOString() };
    if (new TextEncoder().encode(JSON.stringify(next.blocks)).byteLength > DASHBOARD_LIMITS.documentBytes)
      throw failure("invalid");
    const publicDocument = publicDashboard(next);
    const result = this.#options.database.connection
      .prepare(
        "UPDATE agent_dashboards SET revision = ?, document_json = ?, updated_at = ?, archived_at = ? WHERE dashboard_id = ? AND revision = ? AND archived_at IS ?",
      )
      .run(next.revision, JSON.stringify(next), next.updatedAt, next.archivedAt, next.id, revision, expectedArchivedAt);
    if (result.changes !== 1) throw failure("conflict");
    this.#changed(next);
    return publicDocument;
  }
  #changed(document: DashboardDocument): void {
    this.#options.changed({ kind: "dashboard", dashboardId: document.id, agentId: document.agentId });
  }
}

/** Keep the stored source intact; redact content when it leaves the host. */
function publicDashboard(document: DashboardDocument): DashboardDocument {
  const output = {
    id: document.id,
    agentId: document.agentId,
    title: redactText(document.title),
    schemaVersion: 1,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    archivedAt: document.archivedAt,
    blocks: document.blocks.map((block) => {
      const keys = new Set([
        "id",
        "title",
        "type",
        "presentation",
        "footer",
        "detail",
        ...DASHBOARD_CONTENT_FIELDS[block.type],
      ]);
      return redactDashboardValue(Object.fromEntries(Object.entries(block).filter(([key]) => keys.has(key))));
    }),
  };
  if (!isPublicDashboardDocument(output)) throw failure("invalid");
  return output;
}
const DASHBOARD_CONTENT_FIELDS: Readonly<Record<DashboardBlock["type"], readonly string[]>> = {
  text: ["text", "heading", "bodyFull", "sources"],
  metric: ["value", "description"],
  stat: ["label", "value", "unit", "trend", "caption", "history", "periods", "target"],
  "stat-group": ["items"],
  list: ["items", "total"],
  news: ["items", "categories"],
  checklist: ["items", "allowAdd", "groupsOrder", "sharedWith"],
  progress: ["label", "value", "unit", "caption"],
  project: ["ref", "progress", "tasks", "activity", "links", "repoUrl"],
  timeline: ["dateLabel", "events", "note", "date", "hours"],
  week: ["days", "range"],
  weather: ["location", "temp", "condition", "min", "max", "hourly", "daily", "feelsLike", "wind"],
  callout: ["eyebrow", "headline", "body", "bodyFull", "action", "related"],
  rich: [
    "heading",
    "media",
    "meta",
    "sections",
    "action",
    "portions",
    "ingredients",
    "steps",
    "nutrition",
    "targetChecklistId",
  ],
  table: ["columns", "rows", "columnMeta", "rowIds", "sort", "page", "exportable"],
  chart: ["chartType", "points", "periods", "activePeriod", "series", "axisLabels", "highlight", "valuesTable"],
  calendar: ["entries"],
  detail: ["content"],
  media: ["imageUrl", "caption", "alt", "width", "height", "source"],
  actions: ["heading", "status", "description", "buttons", "schedule", "steps", "runs"],
  report: ["routineId"],
};
const DASHBOARD_PROTOCOL_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "routineId",
  "targetChecklistId",
  "rowIds",
  "type",
  "size",
  "tone",
  "state",
  "chartType",
  "direction",
  "align",
  "dir",
  "mode",
  "icon",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "at",
  "date",
  "startsAt",
  "endsAt",
  "publishedAt",
  "checkedAt",
  "start",
  "end",
]);
type DashboardContentValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DashboardContentValue[]
  | { [key: string]: DashboardContentValue };
function redactDashboardValue(value: unknown, key = ""): DashboardContentValue {
  if (typeof value === "string") {
    if (DASHBOARD_PROTOCOL_FIELDS.has(key)) return value;
    if (key === "source" && (value === "recipe" || value === "chat")) return value;
    if (key === "status" && ["todo", "doing", "waiting", "done"].includes(value)) return value;
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactDashboardValue(item, key));
  if (isDynamicRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [redactText(field), redactDashboardValue(item, field)]),
    );
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  throw failure("invalid");
}
