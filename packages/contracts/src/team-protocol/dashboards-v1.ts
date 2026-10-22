// Frozen optional plugins-v1 and dashboards-v1 wire contracts. Do not import IPC types or limits.
// Members read visible agents. Chat access permits dashboard writes. Only administrators install.
import { isDynamicRecord, isString } from "../runtime-values";
import {
  type AdminDecoder,
  adminRoute,
  boolean,
  count,
  empty,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  oneOf,
  string,
} from "./admin-wire";

export const PLUGINS_CAPABILITY = "plugins-v1";
export const DASHBOARDS_CAPABILITY = "dashboards-v1";
export const PLUGIN_ROUTES = { state: "/v1/plugins/state", setInstalled: "/v1/plugins/set-installed" } as const;
export const DASHBOARD_ROUTES = {
  list: "/v1/dashboards/list",
  read: "/v1/dashboards/read",
  create: "/v1/dashboards/create",
  update: "/v1/dashboards/update",
  editWidget: "/v1/dashboards/edit-widget",
  archive: "/v1/dashboards/archive",
  toggleItem: "/v1/dashboards/toggle-item",
  report: "/v1/dashboards/report",
} as const;
const timestamp = string(64);
const version: AdminDecoder = (value) => {
  if (value !== 1) throw new Error("Invalid dashboard version.");
  return 1;
};
const finite: AdminDecoder = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid dashboard value.");
  return value;
};
const positive: AdminDecoder = (value) => {
  const result = count(value);
  if (result === 0) throw new Error("Invalid dashboard revision.");
  return result;
};
/** Frozen input and redacted output share the same block vocabulary but keep separate limits. */
function dashboardBlocksCodec(scale: 1 | 10, maximumBytes: number): AdminDecoder {
  const text = string(20_000 * scale);
  const cell = string(2_000 * scale);
  const label = string(200 * scale);
  const date: AdminDecoder = (value) => {
    const decoded = timestamp(value);
    if (!isString(decoded) || !Number.isFinite(Date.parse(decoded))) throw new Error("Invalid dashboard date.");
    return decoded;
  };
  const icon: AdminDecoder = (value) => {
    const decoded = string(64)(value);
    if (!isString(decoded) || !/^[a-z][a-z0-9-]{0,63}$/.test(decoded)) throw new Error("Invalid dashboard icon.");
    return decoded;
  };
  const itemCount: AdminDecoder = (value) => {
    const decoded = positive(value);
    if (typeof decoded !== "number" || decoded > 200) throw new Error("Invalid dashboard count.");
    return decoded;
  };
  const nonnegative: AdminDecoder = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid dashboard value.");
    return value;
  };
  const positiveNumber: AdminDecoder = (value) => {
    if (typeof value !== "number" || value === 0 || value > 1_000) throw new Error("Invalid dashboard value.");
    return nonnegative(value);
  };
  const percentage: AdminDecoder = (value) => {
    if (typeof value !== "number" || value > 100) throw new Error("Invalid dashboard progress.");
    return nonnegative(value);
  };
  const hour: AdminDecoder = (value) => {
    if (typeof value !== "number" || value > 24) throw new Error("Invalid dashboard hour.");
    return nonnegative(value);
  };
  const url: AdminDecoder = (value) => {
    const decoded = string(2_048 * scale)(value);
    if (scale === 10 && decoded === "[redacted]") return decoded;
    if (!isString(decoded)) throw new Error("Invalid dashboard URL.");
    let parsed: URL;
    try {
      parsed = new URL(decoded);
    } catch {
      throw new Error("Invalid dashboard URL.");
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password)
      throw new Error("Invalid dashboard URL.");
    return decoded;
  };
  const base = { id: identifier, title: label };
  const tone = oneOf("surface", "lavender", "mustard", "sky", "green");
  const source = fields({ label, url });
  const history = fields({ at: date, agent: cell, text });
  const metric = fields({ label: cell, value: cell });
  const common = {
    presentation: fields(
      { size: oneOf("S", "M", "L", "XL", "FULL"), tone },
      { state: oneOf("ready", "loading", "empty", "error"), message: text, badge: label, visibleCount: itemCount },
    ),
    footer: fields({}, { agent: cell, source: cell, updatedAt: date }),
    detail: fields({}, { meta: list(fields({ label, value: cell }), 200), history: list(history, 200) }),
  };
  const blockFields = (
    type: string,
    required: Record<string, AdminDecoder>,
    optional: Record<string, AdminDecoder> = {},
  ) => fields({ ...base, type: oneOf(type), ...required }, { ...common, ...optional });
  const actionTarget: AdminDecoder = (value) => {
    if (!isDynamicRecord(value)) throw new Error("Invalid dashboard action.");
    switch (value.type) {
      case "chat":
        return fields({ type: oneOf("chat") })(value);
      case "routine":
        return fields({ type: oneOf("routine"), routineId: identifier })(value);
      case "url":
        return fields({ type: oneOf("url"), url })(value);
      default:
        throw new Error("Invalid dashboard action.");
    }
  };
  const action = fields({ label, target: actionTarget }, { icon });
  const stat = fields(
    { label, value: cell },
    { unit: label, trend: fields({ direction: oneOf("up", "down", "flat"), value: cell }), caption: text },
  );
  const checklistItem = fields(
    { id: identifier, text: cell, checked: boolean },
    {
      meta: cell,
      category: cell,
      quantity: nonnegative,
      unit: label,
      source: oneOf("recipe", "chat"),
      checkedAt: nullable(date),
      status: oneOf("todo", "doing", "waiting", "done"),
      assignee: cell,
    },
  );
  const uniqueItems = (decodeItem: AdminDecoder, maximum: number): AdminDecoder => {
    const decode = list(decodeItem, maximum);
    return (value) => {
      const decoded = decode(value);
      if (!Array.isArray(decoded)) throw new Error("Invalid dashboard items.");
      const ids = decoded.map((item) => (isDynamicRecord(item) ? item.id : undefined));
      if (new Set(ids).size !== ids.length) throw new Error("Invalid dashboard item identifiers.");
      return decoded;
    };
  };
  const timelineEvent = fields(
    { id: identifier, time: label, title: label },
    {
      agent: cell,
      status: label,
      duration: nonnegative,
      location: cell,
      detail: text,
      routineId: identifier,
      selected: boolean,
    },
  );
  const timelineEvents = uniqueItems(timelineEvent, 200);
  const valuesTable: AdminDecoder = (value) => {
    const decoded = fields({ columns: list(cell, 24), rows: list(list(cell, 24), 200) })(value);
    if (!isDynamicRecord(decoded) || !Array.isArray(decoded.columns) || !Array.isArray(decoded.rows))
      throw new Error("Invalid dashboard values table.");
    const columnCount = decoded.columns.length;
    if (columnCount < 1 || !decoded.rows.every((row) => Array.isArray(row) && row.length === columnCount))
      throw new Error("Invalid dashboard values table.");
    return decoded;
  };
  const content = fields({ text, metrics: list(metric, 200), items: list(cell, 200) });
  const blockCases: ReadonlyMap<string, AdminDecoder> = new Map([
    ["text", blockFields("text", { text }, { heading: label, bodyFull: text, sources: list(source, 200) })],
    ["metric", blockFields("metric", { value: cell }, { description: text })],
    [
      "stat",
      blockFields(
        "stat",
        { label, value: cell },
        {
          unit: label,
          trend: fields({ direction: oneOf("up", "down", "flat"), value: cell }),
          caption: text,
          history: list(fields({ at: date, value: finite }, { delta: cell }), 200),
          periods: list(label, 200),
          target: finite,
        },
      ),
    ],
    ["stat-group", blockFields("stat-group", { items: list(stat, 6) })],
    [
      "list",
      blockFields(
        "list",
        {
          items: uniqueItems(
            fields(
              { id: identifier, title: label },
              {
                subtitle: text,
                meta: cell,
                lead: fields({ type: oneOf("agent", "icon"), value: cell }),
                action,
                group: cell,
                at: date,
                url,
              },
            ),
            200,
          ),
        },
        { total: count },
      ),
    ],
    [
      "news",
      blockFields(
        "news",
        {
          items: uniqueItems(
            fields(
              { id: identifier, category: label, source: cell, headline: label, summary: text, url },
              { summaryFull: text, publishedAt: date, sources: list(source, 200) },
            ),
            200,
          ),
        },
        { categories: list(label, 200) },
      ),
    ],
    [
      "checklist",
      blockFields(
        "checklist",
        { items: list(checklistItem, 200) },
        { allowAdd: boolean, groupsOrder: list(cell, 200), sharedWith: list(cell, 200) },
      ),
    ],
    ["progress", blockFields("progress", { label, value: percentage }, { unit: label, caption: text })],
    [
      "project",
      blockFields(
        "project",
        { progress: percentage, tasks: uniqueItems(checklistItem, 200) },
        { ref: cell, activity: list(history, 200), links: list(source, 200), repoUrl: url },
      ),
    ],
    [
      "timeline",
      blockFields(
        "timeline",
        { dateLabel: label, events: timelineEvents },
        { note: text, date, hours: fields({ from: hour, to: hour }) },
      ),
    ],
    [
      "week",
      blockFields(
        "week",
        { days: list(fields({ weekday: label, date, today: boolean, events: timelineEvents }), 31) },
        { range: fields({ start: date, end: date, mode: oneOf("week", "month") }) },
      ),
    ],
    [
      "weather",
      blockFields(
        "weather",
        {
          location: label,
          temp: finite,
          condition: label,
          min: finite,
          max: finite,
          hourly: list(fields({ time: label, temp: finite }, { condition: label }), 24),
        },
        {
          daily: list(fields({ day: label, condition: label, min: finite, max: finite }, { precip: nonnegative }), 7),
          feelsLike: finite,
          wind: cell,
        },
      ),
    ],
    [
      "callout",
      blockFields(
        "callout",
        { eyebrow: label, headline: label },
        {
          body: text,
          bodyFull: text,
          action,
          related: list(fields({ title: label }, { subtitle: text, at: date }), 200),
        },
      ),
    ],
    [
      "rich",
      blockFields(
        "rich",
        { sections: list(fields({ index: count, text }), 200) },
        {
          heading: label,
          media: fields({}, { icon, imageUrl: url }),
          meta: cell,
          action,
          portions: positiveNumber,
          ingredients: list(
            fields({ label, quantity: nonnegative }, { id: identifier, unit: label, category: cell }),
            200,
          ),
          steps: list(fields({ index: count, text }, { timerSec: nonnegative }), 200),
          nutrition: fields({ kcal: nonnegative, protein: nonnegative }),
          targetChecklistId: identifier,
        },
      ),
    ],
    [
      "table",
      blockFields(
        "table",
        { columns: list(cell, 24), rows: list(list(cell, 24), 200) },
        {
          columnMeta: list(fields({ key: label, label, align: oneOf("left", "center", "right") }), 24),
          rowIds: list(identifier, 200),
          sort: fields({ key: label, dir: oneOf("asc", "desc") }),
          page: fields({ index: count, size: itemCount, total: count }),
          exportable: boolean,
        },
      ),
    ],
    [
      "chart",
      blockFields(
        "chart",
        {
          chartType: oneOf("line", "bar", "donut"),
          points: list(fields({ label: cell, value: finite }, { tone, note: text }), 200),
        },
        {
          periods: list(label, 200),
          activePeriod: label,
          series: list(fields({ label, points: list(fields({ x: cell, y: finite }, { note: text }), 200) }), 200),
          axisLabels: list(label, 200),
          highlight: label,
          valuesTable,
        },
      ),
    ],
    [
      "calendar",
      blockFields("calendar", {
        entries: list(
          fields(
            { id: identifier, title: string(200 * scale), startsAt: timestamp },
            { endsAt: timestamp, detail: text },
          ),
          200,
        ),
      }),
    ],
    ["detail", blockFields("detail", { content })],
    [
      "media",
      blockFields(
        "media",
        { imageUrl: url },
        { caption: text, alt: text, width: nonnegative, height: nonnegative, source: cell },
      ),
    ],
    [
      "actions",
      blockFields(
        "actions",
        { heading: label, buttons: list(action, 12) },
        {
          status: fields({ label, tone }),
          description: text,
          schedule: cell,
          steps: list(text, 200),
          runs: list(
            fields({ at: date, status: label }, { durationMs: nonnegative, trigger: cell, outputRef: cell }),
            200,
          ),
        },
      ),
    ],
    ["report", blockFields("report", { routineId: identifier })],
  ]);
  const block: AdminDecoder = (value) => {
    const decode = isDynamicRecord(value) && isString(value.type) ? blockCases.get(value.type) : undefined;
    if (!decode) throw new Error("Invalid dashboard block.");
    const decoded = decode(value);
    if (!isDynamicRecord(decoded)) throw new Error("Invalid dashboard block.");
    if (decoded.type === "stat-group" && Array.isArray(decoded.items) && decoded.items.length < 2)
      throw new Error("Invalid dashboard stat group.");
    if (
      decoded.type === "chart" &&
      decoded.chartType === "donut" &&
      Array.isArray(decoded.points) &&
      decoded.points.length > 5
    )
      throw new Error("Invalid dashboard chart.");
    if (
      decoded.type === "timeline" &&
      isDynamicRecord(decoded.hours) &&
      typeof decoded.hours.from === "number" &&
      typeof decoded.hours.to === "number" &&
      decoded.hours.from > decoded.hours.to
    )
      throw new Error("Invalid dashboard hours.");
    if (decoded.type === "table") {
      if (Array.isArray(decoded.rowIds) && Array.isArray(decoded.rows) && decoded.rowIds.length !== decoded.rows.length)
        throw new Error("Invalid dashboard row identifiers.");
      if (Array.isArray(decoded.rowIds) && new Set(decoded.rowIds).size !== decoded.rowIds.length)
        throw new Error("Invalid dashboard row identifiers.");
      if (
        Array.isArray(decoded.columnMeta) &&
        Array.isArray(decoded.columns) &&
        decoded.columnMeta.length !== decoded.columns.length
      )
        throw new Error("Invalid dashboard column metadata.");
    }
    return decoded;
  };
  const decodeBlocks = list(block, 64);
  const blocks: AdminDecoder = (value) => {
    const decoded = decodeBlocks(value);
    if (new TextEncoder().encode(JSON.stringify(decoded)).byteLength > maximumBytes)
      throw new Error("Invalid dashboard size.");
    return decoded;
  };
  return blocks;
}
const blocks = dashboardBlocksCodec(1, 262_144);
const publicBlocks = dashboardBlocksCodec(10, 524_288);
function boundedResponse(decode: AdminDecoder, maximumBytes: number): AdminDecoder {
  return (value) => {
    const decoded = decode(value);
    if (new TextEncoder().encode(JSON.stringify(decoded)).byteLength > maximumBytes)
      throw new Error("Invalid dashboard response size.");
    return decoded;
  };
}
const reportText: AdminDecoder = (value) => {
  const decoded = string(131_072)(value);
  if (!isString(decoded) || new TextEncoder().encode(decoded).byteLength > 131_072)
    throw new Error("Invalid dashboard report size.");
  return decoded;
};
const summaryFields = {
  id: identifier,
  agentId: identifier,
  title: string(200),
  schemaVersion: version,
  revision: positive,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: nullable(timestamp),
};
const summary = boundedResponse(fields({ ...summaryFields, title: string(2_000) }), 4_096);
const document = boundedResponse(fields({ ...summaryFields, title: string(2_000), blocks: publicBlocks }), 524_288);
const widgetEditNumber: AdminDecoder = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid widget edit number.");
  return value;
};
const widgetEditDate: AdminDecoder = (value) => {
  const decoded = timestamp(value);
  if (!isString(decoded) || !Number.isFinite(Date.parse(decoded))) throw new Error("Invalid widget edit date.");
  return decoded;
};
const widgetEditItem = fields(
  { id: identifier, text: string(2_000), checked: boolean },
  {
    meta: string(2_000),
    category: string(2_000),
    quantity: widgetEditNumber,
    unit: string(200),
    source: oneOf("recipe", "chat"),
    checkedAt: nullable(widgetEditDate),
    status: oneOf("todo", "doing", "waiting", "done"),
    assignee: string(2_000),
  },
);
const widgetEdit: AdminDecoder = (value) => {
  if (!isDynamicRecord(value)) throw new Error("Invalid dashboard widget edit.");
  switch (value.type) {
    case "addChecklistItems":
      return fields({ type: oneOf("addChecklistItems"), blockId: identifier, items: list(widgetEditItem, 200) })(value);
    case "addRecipeIngredients":
      return fields({
        type: oneOf("addRecipeIngredients"),
        recipeBlockId: identifier,
        portions: (count) => {
          const decoded = widgetEditNumber(count);
          if (typeof decoded !== "number" || decoded <= 0 || decoded > 1_000)
            throw new Error("Invalid recipe portions.");
          return decoded;
        },
      })(value);
    case "addReport":
      return fields({ type: oneOf("addReport"), routineId: identifier })(value);
    default:
      throw new Error("Invalid dashboard widget edit.");
  }
};
const plugin = fields({ id: oneOf("dashboards"), installed: boolean, version });
export const DASHBOARD_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [PLUGIN_ROUTES.state, adminRoute(empty, plugin)],
  [PLUGIN_ROUTES.setInstalled, adminRoute(fields({ installed: boolean }), plugin)],
  [DASHBOARD_ROUTES.list, adminRoute(fields({}, { agentId: identifier }), list(summary, 500))],
  [DASHBOARD_ROUTES.read, adminRoute(fields({ id: identifier }), document)],
  [DASHBOARD_ROUTES.create, adminRoute(fields({ agentId: identifier, title: string(200), blocks }), document)],
  [
    DASHBOARD_ROUTES.update,
    adminRoute(fields({ id: identifier, revision: positive, title: string(200), blocks }), document),
  ],
  [DASHBOARD_ROUTES.editWidget, adminRoute(fields({ id: identifier, revision: positive, edit: widgetEdit }), document)],
  [DASHBOARD_ROUTES.archive, adminRoute(fields({ id: identifier, revision: positive }), document)],
  [
    DASHBOARD_ROUTES.toggleItem,
    adminRoute(
      fields({ id: identifier, revision: positive, blockId: identifier, itemId: identifier, checked: boolean }),
      document,
    ),
  ],
  [
    DASHBOARD_ROUTES.report,
    adminRoute(
      fields({ dashboardId: identifier, blockId: identifier }),
      fields(
        {
          routineId: identifier,
          status: oneOf("idle", "pending", "running", "completed", "failed", "unavailable"),
          text: nullable(reportText),
          messageId: nullable(identifier),
          updatedAt: nullable(timestamp),
          available: boolean,
        },
        { truncated: boolean },
      ),
    ),
  ],
]);
export interface DashboardsEvent {
  type: "dashboards-changed";
  change: { kind: "installation" | "dashboard"; dashboardId?: string; agentId?: string };
}
const change = fields({ kind: oneOf("installation", "dashboard") }, { dashboardId: identifier, agentId: identifier });
export function dashboardsEvent(value: unknown): DashboardsEvent | null {
  if (!isDynamicRecord(value) || value.type !== "dashboards-changed") return null;
  const decoded = change(value.change);
  if (!isDynamicRecord(decoded) || (decoded.kind !== "installation" && decoded.kind !== "dashboard"))
    throw new Error("Invalid dashboard event.");
  return {
    type: "dashboards-changed",
    change: {
      kind: decoded.kind,
      ...(isString(decoded.agentId) ? { agentId: decoded.agentId } : {}),
      ...(isString(decoded.dashboardId) ? { dashboardId: decoded.dashboardId } : {}),
    },
  };
}
