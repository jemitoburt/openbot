import { integerInRange, isBoundedString, isFiniteNumber, isIdentifier } from "./ipc-bounded-values";
import { isDynamicRecord } from "./runtime-values";

export const DASHBOARD_LIMITS = {
  blocks: 64,
  items: 200,
  title: 200,
  text: 20_000,
  cell: 2_000,
  columns: 24,
  documents: 500,
  documentBytes: 262_144,
  publicDocumentBytes: 524_288,
} as const;
export interface PluginState {
  id: "dashboards";
  installed: boolean;
  version: 1;
}
export const DASHBOARD_TONES = ["surface", "lavender", "mustard", "sky", "green"] as const;
export const DASHBOARD_SIZES = ["S", "M", "L", "XL", "FULL"] as const;
export type DashboardTone = (typeof DASHBOARD_TONES)[number];
export type DashboardSize = (typeof DASHBOARD_SIZES)[number];
export interface DashboardAction {
  label: string;
  icon?: string;
  target: { type: "chat" } | { type: "routine"; routineId: string } | { type: "url"; url: string };
}
export interface DashboardSource {
  label: string;
  url: string;
}
export interface DashboardWidgetHistory {
  at: string;
  agent: string;
  text: string;
}
export interface DashboardBlockBase {
  id: string;
  title: string;
  presentation?: {
    size: DashboardSize;
    tone: DashboardTone;
    state?: "ready" | "loading" | "empty" | "error";
    message?: string;
    badge?: string;
    visibleCount?: number;
  };
  footer?: { agent?: string; source?: string; updatedAt?: string };
  detail?: { meta?: Array<{ label: string; value: string }>; history?: DashboardWidgetHistory[] };
}
export interface DashboardChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  meta?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  source?: "recipe" | "chat";
  checkedAt?: string | null;
  status?: "todo" | "doing" | "waiting" | "done";
  assignee?: string;
}
export interface DashboardCalendarEntry {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  detail?: string;
}
export interface DashboardDetailContent {
  text: string;
  metrics: Array<{ label: string; value: string }>;
  items: string[];
}
export interface DashboardStatItem {
  label: string;
  value: string;
  unit?: string;
  trend?: { direction: "up" | "down" | "flat"; value: string };
  caption?: string;
}
export interface DashboardTimelineEvent {
  id: string;
  time: string;
  title: string;
  agent?: string;
  status?: string;
  duration?: number;
  location?: string;
  detail?: string;
  routineId?: string;
  selected?: boolean;
}
export interface DashboardIngredient {
  id?: string;
  label: string;
  quantity: number;
  unit?: string;
  category?: string;
}
export interface DashboardValuesTable {
  columns: string[];
  rows: string[][];
}
export type DashboardBlock =
  | (DashboardBlockBase & {
      type: "text";
      text: string;
      heading?: string;
      bodyFull?: string;
      sources?: DashboardSource[];
    })
  | (DashboardBlockBase & { type: "metric"; value: string; description?: string })
  | (DashboardBlockBase &
      DashboardStatItem & {
        type: "stat";
        history?: Array<{ at: string; value: number; delta?: string }>;
        periods?: string[];
        target?: number;
      })
  | (DashboardBlockBase & { type: "stat-group"; items: DashboardStatItem[] })
  | (DashboardBlockBase & {
      type: "list";
      items: Array<{
        id: string;
        title: string;
        subtitle?: string;
        meta?: string;
        lead?: { type: "agent" | "icon"; value: string };
        action?: DashboardAction;
        group?: string;
        at?: string;
        url?: string;
      }>;
      total?: number;
    })
  | (DashboardBlockBase & {
      type: "news";
      items: Array<{
        id: string;
        category: string;
        source: string;
        headline: string;
        summary: string;
        url: string;
        summaryFull?: string;
        publishedAt?: string;
        sources?: DashboardSource[];
      }>;
      categories?: string[];
    })
  | (DashboardBlockBase & {
      type: "checklist";
      items: DashboardChecklistItem[];
      allowAdd?: boolean;
      groupsOrder?: string[];
      sharedWith?: string[];
    })
  | (DashboardBlockBase & { type: "progress"; label: string; value: number; unit?: string; caption?: string })
  | (DashboardBlockBase & {
      type: "project";
      ref?: string;
      progress: number;
      tasks: DashboardChecklistItem[];
      activity?: DashboardWidgetHistory[];
      links?: DashboardSource[];
      repoUrl?: string;
    })
  | (DashboardBlockBase & {
      type: "timeline";
      dateLabel: string;
      events: DashboardTimelineEvent[];
      note?: string;
      date?: string;
      hours?: { from: number; to: number };
    })
  | (DashboardBlockBase & {
      type: "week";
      days: Array<{ weekday: string; date: string; today: boolean; events: DashboardTimelineEvent[] }>;
      range?: { start: string; end: string; mode: "week" | "month" };
    })
  | (DashboardBlockBase & {
      type: "weather";
      location: string;
      temp: number;
      condition: string;
      min: number;
      max: number;
      hourly: Array<{ time: string; temp: number; condition?: string }>;
      daily?: Array<{ day: string; condition: string; min: number; max: number; precip?: number }>;
      feelsLike?: number;
      wind?: string;
    })
  | (DashboardBlockBase & {
      type: "callout";
      eyebrow: string;
      headline: string;
      body?: string;
      bodyFull?: string;
      action?: DashboardAction;
      related?: Array<{ title: string; subtitle?: string; at?: string }>;
    })
  | (DashboardBlockBase & {
      type: "rich";
      heading?: string;
      media?: { icon?: string; imageUrl?: string };
      meta?: string;
      sections: Array<{ index: number; text: string }>;
      action?: DashboardAction;
      portions?: number;
      ingredients?: DashboardIngredient[];
      steps?: Array<{ index: number; text: string; timerSec?: number }>;
      nutrition?: { kcal: number; protein: number };
      targetChecklistId?: string;
    })
  | (DashboardBlockBase & {
      type: "table";
      columns: string[];
      rows: string[][];
      columnMeta?: Array<{ key: string; label: string; align: "left" | "center" | "right" }>;
      rowIds?: string[];
      sort?: { key: string; dir: "asc" | "desc" };
      page?: { index: number; size: number; total: number };
      exportable?: boolean;
    })
  | (DashboardBlockBase & {
      type: "chart";
      chartType: "line" | "bar" | "donut";
      points: Array<{ label: string; value: number; tone?: DashboardTone; note?: string }>;
      periods?: string[];
      activePeriod?: string;
      series?: Array<{ label: string; points: Array<{ x: string; y: number; note?: string }> }>;
      axisLabels?: string[];
      highlight?: string;
      valuesTable?: DashboardValuesTable;
    })
  | (DashboardBlockBase & { type: "calendar"; entries: DashboardCalendarEntry[] })
  | (DashboardBlockBase & { type: "detail"; content: DashboardDetailContent })
  | (DashboardBlockBase & {
      type: "media";
      imageUrl: string;
      caption?: string;
      alt?: string;
      width?: number;
      height?: number;
      source?: string;
    })
  | (DashboardBlockBase & {
      type: "actions";
      heading: string;
      status?: { label: string; tone: DashboardTone };
      description?: string;
      buttons: DashboardAction[];
      schedule?: string;
      steps?: string[];
      runs?: Array<{ at: string; status: string; durationMs?: number; trigger?: string; outputRef?: string }>;
    })
  | (DashboardBlockBase & { type: "report"; routineId: string });
export interface DashboardDocument {
  id: string;
  agentId: string;
  title: string;
  schemaVersion: 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  blocks: DashboardBlock[];
}
export type DashboardSummary = Omit<DashboardDocument, "blocks">;
export interface DashboardListInput {
  agentId?: string;
}
export interface CreateDashboardInput {
  agentId: string;
  title: string;
  blocks: DashboardBlock[];
}
export interface UpdateDashboardInput {
  id: string;
  revision: number;
  title: string;
  blocks: DashboardBlock[];
}
export interface DashboardRevisionInput {
  id: string;
  revision: number;
}
export interface ToggleDashboardItemInput extends DashboardRevisionInput {
  blockId: string;
  itemId: string;
  checked: boolean;
}
export type DashboardWidgetEdit =
  | { type: "addChecklistItems"; blockId: string; items: DashboardChecklistItem[] }
  | { type: "addRecipeIngredients"; recipeBlockId: string; portions: number }
  | { type: "addReport"; routineId: string };
export interface EditDashboardWidgetInput extends DashboardRevisionInput {
  edit: DashboardWidgetEdit;
}
export interface DashboardChange {
  kind: "installation" | "dashboard";
  dashboardId?: string;
  agentId?: string;
}
export interface DashboardReportInput {
  dashboardId: string;
  blockId: string;
}
export interface DashboardReport {
  routineId: string;
  status: "idle" | "pending" | "running" | "completed" | "failed" | "unavailable";
  text: string | null;
  messageId: string | null;
  updatedAt: string | null;
  available: boolean;
  truncated?: boolean;
}
const title = (value: unknown) => isBoundedString(value, DASHBOARD_LIMITS.title) && value.trim().length > 0;
const revision = (value: unknown) => integerInRange(value, 1, Number.MAX_SAFE_INTEGER);
const date = (value: unknown): value is string => isBoundedString(value, 64) && Number.isFinite(Date.parse(value));
const uniqueIds = (values: Array<{ id: string }>) => new Set(values.map((value) => value.id)).size === values.length;
export function isDashboardBlock(value: unknown): value is DashboardBlock {
  return dashboardBlock(value, false);
}
export function isPublicDashboardBlock(value: unknown): value is DashboardBlock {
  return dashboardBlock(value, true);
}
function dashboardBlock(value: unknown, publicOutput: boolean): value is DashboardBlock {
  const factor = publicOutput ? 10 : 1;
  const text = (entry: unknown) => isBoundedString(entry, DASHBOARD_LIMITS.text * factor);
  const cell = (entry: unknown) => isBoundedString(entry, DASHBOARD_LIMITS.cell * factor);
  const label = (entry: unknown) => isBoundedString(entry, DASHBOARD_LIMITS.title * factor);
  const nonemptyLabel = (entry: unknown) =>
    isBoundedString(entry, DASHBOARD_LIMITS.title * factor) && entry.trim().length > 0;
  const number = isFiniteNumber;
  const nonnegative = (entry: unknown) => number(entry) && entry >= 0;
  const percent = (entry: unknown) => number(entry) && entry >= 0 && entry <= 100;
  const count = (entry: unknown) => integerInRange(entry, 0, Number.MAX_SAFE_INTEGER);
  const bool = (entry: unknown) => typeof entry === "boolean";
  const tone = (entry: unknown) => DASHBOARD_TONES.some((candidate) => candidate === entry);
  const icon = (entry: unknown) => typeof entry === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(entry);
  const url = (entry: unknown) => {
    if (publicOutput && entry === "[redacted]") return true;
    if (!isBoundedString(entry, 2_048 * factor)) return false;
    try {
      const parsed = new URL(entry);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  };
  const source = (entry: unknown) => dashboardFields(entry, { label, url });
  const history = (entry: unknown) => dashboardFields(entry, { at: date, agent: cell, text });
  const action = (entry: unknown) =>
    dashboardFields(
      entry,
      {
        label,
        target: (target) => {
          if (!isDynamicRecord(target)) return false;
          switch (target.type) {
            case "chat":
              return dashboardFields(target, { type: (type) => type === "chat" });
            case "routine":
              return dashboardFields(target, { type: (type) => type === "routine", routineId: isIdentifier });
            case "url":
              return dashboardFields(target, { type: (type) => type === "url", url });
            default:
              return false;
          }
        },
      },
      { icon },
    );
  const checklistItem = (entry: unknown) =>
    dashboardFields(
      entry,
      { id: isIdentifier, text: cell, checked: bool },
      {
        meta: cell,
        category: cell,
        quantity: nonnegative,
        unit: label,
        source: (item) => item === "recipe" || item === "chat",
        checkedAt: (item) => item === null || date(item),
        status: (item) => ["todo", "doing", "waiting", "done"].includes(String(item)),
        assignee: cell,
      },
    );
  const checklist = (entry: unknown) => dashboardArray(entry, checklistItem) && uniqueIdsFromRecords(entry);
  const stat = (entry: unknown, permitOtherKeys = false) =>
    dashboardFields(
      entry,
      { label, value: cell },
      {
        unit: label,
        trend: (item) =>
          dashboardFields(item, {
            direction: (direction) => ["up", "down", "flat"].includes(String(direction)),
            value: cell,
          }),
        caption: text,
      },
      permitOtherKeys,
    );
  const event = (entry: unknown) =>
    dashboardFields(
      entry,
      { id: isIdentifier, time: label, title: label },
      {
        agent: cell,
        status: label,
        duration: nonnegative,
        location: cell,
        detail: text,
        routineId: isIdentifier,
        selected: bool,
      },
    );
  const events = (entry: unknown) => dashboardArray(entry, event) && uniqueIdsFromRecords(entry);
  const table = (entry: unknown, permitOtherKeys = false) => {
    if (
      !isDynamicRecord(entry) ||
      !Array.isArray(entry.columns) ||
      entry.columns.length < 1 ||
      entry.columns.length > DASHBOARD_LIMITS.columns ||
      !entry.columns.every(cell)
    )
      return false;
    if (!permitOtherKeys && Object.keys(entry).some((key) => key !== "columns" && key !== "rows")) return false;
    const columns = entry.columns;
    return dashboardArray(entry.rows, (row) => Array.isArray(row) && row.length === columns.length && row.every(cell));
  };
  const fields = (
    required: Readonly<Record<string, DashboardValueGuard>>,
    optional: Readonly<Record<string, DashboardValueGuard>> = {},
  ) => dashboardFields(value, required, optional, true);
  if (!isDynamicRecord(value) || !isIdentifier(value.id) || !label(value.title)) return false;
  if (
    !dashboardFields(
      value,
      {},
      {
        presentation: (entry) =>
          dashboardFields(
            entry,
            { size: (size) => DASHBOARD_SIZES.some((candidate) => candidate === size), tone },
            {
              state: (state) => ["ready", "loading", "empty", "error"].includes(String(state)),
              message: text,
              badge: label,
              visibleCount: (visible) => integerInRange(visible, 1, DASHBOARD_LIMITS.items),
            },
          ),
        footer: (entry) => dashboardFields(entry, {}, { agent: cell, source: cell, updatedAt: date }),
        detail: (entry) =>
          dashboardFields(
            entry,
            {},
            {
              meta: (meta) => dashboardArray(meta, (item) => dashboardFields(item, { label, value: cell })),
              history: (items) => dashboardArray(items, history),
            },
          ),
      },
      true,
    )
  )
    return false;
  switch (value.type) {
    case "text":
      return fields({ text }, { heading: label, bodyFull: text, sources: (entry) => dashboardArray(entry, source) });
    case "metric":
      return fields({ value: cell }, { description: text });
    case "stat":
      return (
        stat(value, true) &&
        fields(
          {},
          {
            history: (entry) =>
              dashboardArray(entry, (item) => dashboardFields(item, { at: date, value: number }, { delta: cell })),
            periods: (entry) => dashboardArray(entry, label),
            target: number,
          },
        )
      );
    case "stat-group":
      return (
        Array.isArray(value.items) && value.items.length >= 2 && dashboardArray(value.items, (entry) => stat(entry), 6)
      );
    case "list":
      return fields(
        {
          items: (entry) =>
            dashboardArray(entry, (item) =>
              dashboardFields(
                item,
                { id: isIdentifier, title: label },
                {
                  subtitle: text,
                  meta: cell,
                  lead: (lead) =>
                    dashboardFields(lead, { type: (type) => type === "agent" || type === "icon", value: cell }),
                  action,
                  group: cell,
                  at: date,
                  url,
                },
              ),
            ) && uniqueIdsFromRecords(entry),
        },
        { total: count },
      );
    case "news":
      return fields(
        {
          items: (entry) =>
            dashboardArray(entry, (item) =>
              dashboardFields(
                item,
                { id: isIdentifier, category: label, source: cell, headline: label, summary: text, url },
                { summaryFull: text, publishedAt: date, sources: (sources) => dashboardArray(sources, source) },
              ),
            ) && uniqueIdsFromRecords(entry),
        },
        { categories: (entry) => dashboardArray(entry, label) },
      );
    case "checklist":
      return fields(
        { items: checklist },
        {
          allowAdd: bool,
          groupsOrder: (entry) => dashboardArray(entry, cell),
          sharedWith: (entry) => dashboardArray(entry, cell),
        },
      );
    case "progress":
      return fields({ label, value: percent }, { unit: label, caption: text });
    case "project":
      return fields(
        { progress: percent, tasks: checklist },
        {
          ref: cell,
          activity: (entry) => dashboardArray(entry, history),
          links: (entry) => dashboardArray(entry, source),
          repoUrl: url,
        },
      );
    case "timeline":
      return fields(
        { dateLabel: label, events },
        {
          note: text,
          date,
          hours: (entry) =>
            dashboardFields(entry, {
              from: (hour) => number(hour) && hour >= 0 && hour <= 24,
              to: (hour) => number(hour) && hour >= 0 && hour <= 24,
            }) &&
            isDynamicRecord(entry) &&
            isFiniteNumber(entry.from) &&
            isFiniteNumber(entry.to) &&
            entry.from <= entry.to,
        },
      );
    case "week":
      return fields(
        {
          days: (entry) =>
            dashboardArray(entry, (day) => dashboardFields(day, { weekday: label, date, today: bool, events }), 31),
        },
        {
          range: (entry) =>
            dashboardFields(entry, { start: date, end: date, mode: (mode) => mode === "week" || mode === "month" }),
        },
      );
    case "weather":
      return fields(
        {
          location: label,
          temp: number,
          condition: label,
          min: number,
          max: number,
          hourly: (entry) =>
            dashboardArray(
              entry,
              (hour) => dashboardFields(hour, { time: label, temp: number }, { condition: label }),
              24,
            ),
        },
        {
          daily: (entry) =>
            dashboardArray(
              entry,
              (day) =>
                dashboardFields(
                  day,
                  { day: label, condition: label, min: number, max: number },
                  { precip: nonnegative },
                ),
              7,
            ),
          feelsLike: number,
          wind: cell,
        },
      );
    case "callout":
      return fields(
        { eyebrow: label, headline: label },
        {
          body: text,
          bodyFull: text,
          action,
          related: (entry) =>
            dashboardArray(entry, (item) => dashboardFields(item, { title: label }, { subtitle: text, at: date })),
        },
      );
    case "rich":
      return fields(
        { sections: (entry) => dashboardArray(entry, (section) => dashboardFields(section, { index: count, text })) },
        {
          heading: label,
          media: (entry) => dashboardFields(entry, {}, { icon, imageUrl: url }),
          meta: cell,
          action,
          portions: (entry) => number(entry) && entry > 0 && entry <= 1_000,
          ingredients: (entry) =>
            dashboardArray(entry, (item) =>
              dashboardFields(
                item,
                { label, quantity: nonnegative },
                { id: isIdentifier, unit: label, category: cell },
              ),
            ),
          steps: (entry) =>
            dashboardArray(entry, (step) => dashboardFields(step, { index: count, text }, { timerSec: nonnegative })),
          nutrition: (entry) => dashboardFields(entry, { kcal: nonnegative, protein: nonnegative }),
          targetChecklistId: isIdentifier,
        },
      );
    case "table":
      return (
        table(value, true) &&
        fields(
          {},
          {
            columnMeta: (entry) =>
              dashboardArray(
                entry,
                (column) =>
                  dashboardFields(column, {
                    key: label,
                    label,
                    align: (align) => ["left", "center", "right"].includes(String(align)),
                  }),
                DASHBOARD_LIMITS.columns,
              ) &&
              Array.isArray(entry) &&
              Array.isArray(value.columns) &&
              entry.length === value.columns.length,
            rowIds: (entry) =>
              dashboardArray(entry, isIdentifier) &&
              Array.isArray(entry) &&
              Array.isArray(value.rows) &&
              entry.length === value.rows.length &&
              new Set(entry).size === entry.length,
            sort: (entry) => dashboardFields(entry, { key: label, dir: (dir) => dir === "asc" || dir === "desc" }),
            page: (entry) =>
              dashboardFields(entry, {
                index: count,
                size: (size) => integerInRange(size, 1, DASHBOARD_LIMITS.items),
                total: count,
              }),
            exportable: bool,
          },
        )
      );
    case "chart":
      return fields(
        {
          chartType: (entry) => entry === "line" || entry === "bar" || entry === "donut",
          points: (entry) =>
            dashboardArray(
              entry,
              (point) => dashboardFields(point, { label: cell, value: number }, { tone, note: text }),
              value.chartType === "donut" ? 5 : DASHBOARD_LIMITS.items,
            ),
        },
        {
          periods: (entry) => dashboardArray(entry, label),
          activePeriod: label,
          series: (entry) =>
            dashboardArray(entry, (series) =>
              dashboardFields(series, {
                label,
                points: (points) =>
                  dashboardArray(points, (point) => dashboardFields(point, { x: cell, y: number }, { note: text })),
              }),
            ),
          axisLabels: (entry) => dashboardArray(entry, label),
          highlight: label,
          valuesTable: (entry) => table(entry),
        },
      );
    case "calendar":
      return fields({
        entries: (entry) =>
          dashboardArray(entry, (item) =>
            dashboardFields(
              item,
              { id: isIdentifier, title: nonemptyLabel, startsAt: date },
              { endsAt: date, detail: text },
            ),
          ) && uniqueIdsFromRecords(entry),
      });
    case "detail":
      return fields({
        content: (entry) =>
          dashboardFields(entry, {
            text,
            metrics: (metrics) =>
              dashboardArray(metrics, (metric) => dashboardFields(metric, { label: cell, value: cell })),
            items: (items) => dashboardArray(items, cell),
          }),
      });
    case "media":
      return fields(
        { imageUrl: url },
        { caption: text, alt: text, width: nonnegative, height: nonnegative, source: cell },
      );
    case "actions":
      return fields(
        { heading: label, buttons: (entry) => dashboardArray(entry, action, 12) },
        {
          status: (entry) => dashboardFields(entry, { label, tone }),
          description: text,
          schedule: cell,
          steps: (entry) => dashboardArray(entry, text),
          runs: (entry) =>
            dashboardArray(entry, (run) =>
              dashboardFields(
                run,
                { at: date, status: label },
                { durationMs: nonnegative, trigger: cell, outputRef: cell },
              ),
            ),
        },
      );
    case "report":
      return fields({ routineId: isIdentifier });
    default:
      return false;
  }
}
type DashboardValueGuard = (value: unknown) => boolean;
function dashboardFields(
  value: unknown,
  required: Readonly<Record<string, DashboardValueGuard>>,
  optional: Readonly<Record<string, DashboardValueGuard>> = {},
  permitOtherKeys = false,
): boolean {
  return (
    isDynamicRecord(value) &&
    (permitOtherKeys ||
      Object.keys(value).every((key) => Object.hasOwn(required, key) || Object.hasOwn(optional, key))) &&
    Object.entries(required).every(([key, guard]) => guard(value[key])) &&
    Object.entries(optional).every(([key, guard]) => value[key] === undefined || guard(value[key]))
  );
}
function dashboardArray(value: unknown, guard: DashboardValueGuard, maximum: number = DASHBOARD_LIMITS.items): boolean {
  return Array.isArray(value) && value.length <= maximum && value.every(guard);
}
function uniqueIdsFromRecords(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const identifiers = value.map((item) => (isDynamicRecord(item) ? item.id : undefined));
  return identifiers.every(isIdentifier) && new Set(identifiers).size === identifiers.length;
}
export function isDashboardBlocks(value: unknown): value is DashboardBlock[] {
  if (
    !Array.isArray(value) ||
    value.length > DASHBOARD_LIMITS.blocks ||
    !value.every(isDashboardBlock) ||
    !uniqueIds(value)
  )
    return false;
  return boundedJsonBytes(value, DASHBOARD_LIMITS.documentBytes);
}
export function isPluginState(value: unknown): value is PluginState {
  return (
    isDynamicRecord(value) && value.id === "dashboards" && value.version === 1 && typeof value.installed === "boolean"
  );
}
export function isDashboardListInput(value: unknown): value is DashboardListInput {
  return isDynamicRecord(value) && (value.agentId === undefined || isIdentifier(value.agentId));
}
export function isCreateDashboardInput(value: unknown): value is CreateDashboardInput {
  return isDynamicRecord(value) && isIdentifier(value.agentId) && title(value.title) && isDashboardBlocks(value.blocks);
}
export function isDashboardRevisionInput(value: unknown): value is DashboardRevisionInput {
  return isDynamicRecord(value) && isIdentifier(value.id) && revision(value.revision);
}
export function isUpdateDashboardInput(value: unknown): value is UpdateDashboardInput {
  return (
    isDashboardRevisionInput(value) && isDynamicRecord(value) && title(value.title) && isDashboardBlocks(value.blocks)
  );
}
export function isToggleDashboardItemInput(value: unknown): value is ToggleDashboardItemInput {
  return (
    isDashboardRevisionInput(value) &&
    isDynamicRecord(value) &&
    isIdentifier(value.blockId) &&
    isIdentifier(value.itemId) &&
    typeof value.checked === "boolean"
  );
}
export function isEditDashboardWidgetInput(value: unknown): value is EditDashboardWidgetInput {
  const edit = (entry: unknown) => {
    if (!isDynamicRecord(entry)) return false;
    switch (entry.type) {
      case "addChecklistItems":
        return dashboardFields(entry, {
          type: (type) => type === "addChecklistItems",
          blockId: isIdentifier,
          items: (items) =>
            Array.isArray(items) &&
            items.length > 0 &&
            isDashboardBlock({ id: "edit-checklist", title: "", type: "checklist", items }),
        });
      case "addRecipeIngredients":
        return dashboardFields(entry, {
          type: (type) => type === "addRecipeIngredients",
          recipeBlockId: isIdentifier,
          portions: (portions) => isFiniteNumber(portions) && portions > 0 && portions <= 1_000,
        });
      case "addReport":
        return dashboardFields(entry, { type: (type) => type === "addReport", routineId: isIdentifier });
      default:
        return false;
    }
  };
  return (
    dashboardFields(value, { id: isIdentifier, revision, edit }) &&
    boundedJsonBytes(value, DASHBOARD_LIMITS.documentBytes)
  );
}
export function isDashboardSummary(value: unknown): value is DashboardSummary {
  return (
    isDynamicRecord(value) &&
    isIdentifier(value.id) &&
    isIdentifier(value.agentId) &&
    isBoundedString(value.title, DASHBOARD_LIMITS.title * 10) &&
    value.title.trim().length > 0 &&
    value.schemaVersion === 1 &&
    revision(value.revision) &&
    date(value.createdAt) &&
    date(value.updatedAt) &&
    (value.archivedAt === null || date(value.archivedAt))
  );
}
export function isDashboardDocument(value: unknown): value is DashboardDocument {
  return (
    isCreateDashboardInput(value) &&
    isDynamicRecord(value) &&
    isIdentifier(value.id) &&
    value.schemaVersion === 1 &&
    revision(value.revision) &&
    date(value.createdAt) &&
    date(value.updatedAt) &&
    (value.archivedAt === null || date(value.archivedAt))
  );
}
/** Output can grow when short secrets become redaction markers. Input limits do not change. */
export function isPublicDashboardDocument(value: unknown): value is DashboardDocument {
  return (
    isDashboardSummary(value) &&
    isDynamicRecord(value) &&
    "blocks" in value &&
    Array.isArray(value.blocks) &&
    value.blocks.length <= DASHBOARD_LIMITS.blocks &&
    value.blocks.every(isPublicDashboardBlock) &&
    uniqueIds(value.blocks) &&
    boundedJsonBytes(value, DASHBOARD_LIMITS.publicDocumentBytes)
  );
}
export function isDashboardChange(value: unknown): value is DashboardChange {
  return (
    isDynamicRecord(value) &&
    (value.kind === "installation" || value.kind === "dashboard") &&
    (value.dashboardId === undefined || isIdentifier(value.dashboardId)) &&
    (value.agentId === undefined || isIdentifier(value.agentId))
  );
}
export function isDashboardReportInput(value: unknown): value is DashboardReportInput {
  return isDynamicRecord(value) && isIdentifier(value.dashboardId) && isIdentifier(value.blockId);
}
export function isDashboardReport(value: unknown): value is DashboardReport {
  return (
    isDynamicRecord(value) &&
    isIdentifier(value.routineId) &&
    ["idle", "pending", "running", "completed", "failed", "unavailable"].includes(String(value.status)) &&
    (value.text === null ||
      (isBoundedString(value.text, 131_072) && new TextEncoder().encode(value.text).byteLength <= 131_072)) &&
    (value.messageId === null || isIdentifier(value.messageId)) &&
    (value.updatedAt === null || date(value.updatedAt)) &&
    typeof value.available === "boolean" &&
    (value.truncated === undefined || typeof value.truncated === "boolean")
  );
}

/** Count escaped UTF-8 JSON a value at a time; stop before a large document can allocate a serialized copy. */
function boundedJsonBytes(value: unknown, maximum: number): boolean {
  let remaining = maximum;
  const encoder = new TextEncoder();
  const active = new WeakSet<object>();
  const take = (bytes: number): boolean => {
    remaining -= bytes;
    return remaining >= 0;
  };
  const string = (text: string): boolean =>
    text.length <= remaining && take(encoder.encode(JSON.stringify(text)).byteLength);
  function visit(entry: unknown, depth: number): boolean {
    if (depth > 8) return false;
    if (entry === null) return take(4);
    if (typeof entry === "string") return string(entry);
    if (typeof entry === "boolean") return take(entry ? 4 : 5);
    if (typeof entry === "number") return Number.isFinite(entry) && take(String(entry).length);
    if (typeof entry !== "object" || active.has(entry)) return false;
    active.add(entry);
    if (!take(2)) return false;
    let count = 0;
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (count > 0 && !take(1)) return false;
        if (!visit(item, depth + 1)) return false;
        count += 1;
      }
    } else {
      if (!isDynamicRecord(entry)) return false;
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== null && prototype !== Object.prototype) return false;
      for (const key of Object.keys(entry)) {
        const item = entry[key];
        if (item === undefined) continue;
        if (count > 0 && !take(1)) return false;
        if (!string(key) || !take(1) || !visit(item, depth + 1)) return false;
        count += 1;
      }
    }
    active.delete(entry);
    return true;
  }
  return visit(value, 0);
}
