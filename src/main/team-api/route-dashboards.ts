import { canAdministerServer } from "@openbot/contracts/ipc";
import {
  DASHBOARD_ROUTES,
  DASHBOARDS_CAPABILITY,
  PLUGIN_ROUTES,
  PLUGINS_CAPABILITY,
} from "@openbot/contracts/team-protocol/dashboards-v1";
import { sourceText } from "@openbot/i18n/source";
import { Effect, Result } from "effect";
import type { DashboardActor } from "../../backend/dashboards/dashboard-service";
import {
  parseDashboardCreate,
  parseDashboardList,
  parseDashboardReport,
  parseDashboardRevision,
  parseDashboardToggle,
  parseDashboardUpdate,
  parseDashboardWidgetEdit,
  parsePluginInstalled,
} from "../ipc/dashboard-inputs";
import type { TeamApiDashboardReports, TeamApiDashboards } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, stringField } from "./request-helpers";

async function run<A>(operation: Effect.Effect<A, { readonly message: string; readonly code?: string }>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(operation));
  if (Result.isSuccess(result)) return result.success;
  const failure = result.failure;
  const status =
    failure.code === "notFound" ? 404 : failure.code === "forbidden" ? 403 : failure.code === "invalid" ? 400 : 409;
  throw new HttpError(status, failure.message);
}
function parse<A>(decode: (value: unknown) => A, value: unknown): A {
  try {
    return decode(value);
  } catch {
    throw new HttpError(400, "Invalid dashboard request.");
  }
}
/** Frozen optional routes. Domain operations enforce the member's current agent access. */
export async function routeDashboards(
  context: TeamApiRequestContext,
  dashboards: TeamApiDashboards | undefined,
  reports: TeamApiDashboardReports | undefined,
  hiddenAgentIds: ReadonlySet<string>,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, json, member } = context;
  const pluginRoute = Object.values(PLUGIN_ROUTES).some((path) => path === url.pathname);
  const dashboardRoute = Object.values(DASHBOARD_ROUTES).some((path) => path === url.pathname);
  if (method !== "POST" || (!pluginRoute && !dashboardRoute)) return "unmatched";
  if (!dashboards || !capabilities.has(pluginRoute ? PLUGINS_CAPABILITY : DASHBOARDS_CAPABILITY))
    throw new HttpError(400, sourceText("error.dashboard.unsupported"));
  const actor: DashboardActor = {
    administrator: canAdministerServer(member.role),
    canReadAgent: (id) => !hiddenAgentIds.has(id) && context.agentLevel(id) !== "none",
    canWriteAgent: (id) =>
      !hiddenAgentIds.has(id) && (context.agentLevel(id) === "chat" || context.agentLevel(id) === "manage"),
  };
  const body = await readJson(request);
  switch (url.pathname) {
    case PLUGIN_ROUTES.state:
      return json(200, await run(dashboards.pluginState()));
    case PLUGIN_ROUTES.setInstalled:
      return json(200, await run(dashboards.setInstalled(parse(parsePluginInstalled, body.installed), actor)));
    case DASHBOARD_ROUTES.list:
      return json(200, await run(dashboards.list(parse(parseDashboardList, body), actor)));
    case DASHBOARD_ROUTES.read:
      return json(200, await run(dashboards.read(stringField(body, "id"), actor)));
    case DASHBOARD_ROUTES.create:
      return json(200, await run(dashboards.create(parse(parseDashboardCreate, body), actor)));
    case DASHBOARD_ROUTES.update:
      return json(200, await run(dashboards.update(parse(parseDashboardUpdate, body), actor)));
    case DASHBOARD_ROUTES.editWidget:
      return json(200, await run(dashboards.editWidget(parse(parseDashboardWidgetEdit, body), actor)));
    case DASHBOARD_ROUTES.archive:
      return json(200, await run(dashboards.archive(parse(parseDashboardRevision, body), actor)));
    case DASHBOARD_ROUTES.toggleItem:
      return json(200, await run(dashboards.toggleItem(parse(parseDashboardToggle, body), actor)));
    case DASHBOARD_ROUTES.report: {
      if (!reports) throw new HttpError(400, sourceText("error.dashboard.unsupported"));
      const input = parse(parseDashboardReport, body);
      const document = await run(dashboards.read(input.dashboardId, actor));
      const block = document.blocks.find((candidate) => candidate.id === input.blockId);
      if (block?.type !== "report") throw new HttpError(404, sourceText("error.dashboard.notFound"));
      return json(200, await run(reports.read({ agentId: document.agentId, routineId: block.routineId })));
    }
  }
  return "unmatched";
}
