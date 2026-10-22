import type { TeamCurrentCapability } from "@openbot/contracts/team-protocol/current";
import {
  DASHBOARD_ARCHIVE_ROUTES,
  DASHBOARDS_ARCHIVE_CAPABILITY,
} from "@openbot/contracts/team-protocol/dashboards-archive-v1";
import { DASHBOARD_ROUTES, DASHBOARDS_CAPABILITY } from "@openbot/contracts/team-protocol/dashboards-v1";
import { sourceText } from "@openbot/i18n/source";
import type { Effect } from "effect";
import type { DashboardService } from "../../backend/dashboards/dashboard-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { runDashboardEffect } from "../dashboard-boundary";
import type { DashboardReportReader } from "../dashboard-report-reader";
import {
  decodeDashboardFromHost,
  decodeDashboardReportFromHost,
  decodeDashboardSummariesFromHost,
} from "../remote-dashboard-decoding";
import type { ResponseDecoder } from "../remote-host-decoding";
import type { RemoteRequestInit } from "../remote-server-client";
import type { RemoteWorkflowError } from "../remote-service-effects";
import {
  parseDashboardCreate,
  parseDashboardList,
  parseDashboardReport,
  parseDashboardRevision,
  parseDashboardToggle,
  parseDashboardUpdate,
  parseDashboardWidgetEdit,
} from "./dashboard-inputs";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";
import { stringPayload } from "./validation";

interface DashboardRemoteServers {
  supportsCapability(serverId: string, capability: TeamCurrentCapability): boolean;
  request<T>(
    serverId: string,
    path: string,
    decoder: ResponseDecoder<T>,
    init?: RemoteRequestInit,
  ): Effect.Effect<T, RemoteWorkflowError>;
}
export interface DashboardIpcDependencies {
  dashboards: Pick<
    DashboardService,
    | "pluginState"
    | "setInstalled"
    | "list"
    | "read"
    | "readArchived"
    | "create"
    | "update"
    | "archive"
    | "restore"
    | "toggleItem"
    | "editWidget"
  >;
  dashboardReports: Pick<DashboardReportReader, "read">;
  remoteServers: DashboardRemoteServers;
}
export function dashboardIpcHandlers({
  dashboards,
  dashboardReports,
  remoteServers,
}: DashboardIpcDependencies): Pick<IpcGroupHandlers, "dashboards"> {
  function remote<A>(
    serverId: string,
    path: string,
    decode: ResponseDecoder<A>,
    body: unknown,
    capability: TeamCurrentCapability = DASHBOARDS_CAPABILITY,
  ): Promise<A> {
    if (!remoteServers.supportsCapability(serverId, capability))
      throw new Error(sourceText("error.dashboard.unsupported"));
    return runCauseEffect(remoteServers.request(serverId, path, decode, { method: "POST", body }));
  }
  return {
    dashboards: {
      list: scopedHandler(parseDashboardList, {
        local: (input) => runDashboardEffect(dashboards.list(input)),
        remote: (input, serverId) =>
          input.includeArchived
            ? remote(
                serverId,
                DASHBOARD_ARCHIVE_ROUTES.list,
                decodeDashboardSummariesFromHost,
                input,
                DASHBOARDS_ARCHIVE_CAPABILITY,
              )
            : remote(
                serverId,
                DASHBOARD_ROUTES.list,
                decodeDashboardSummariesFromHost,
                input.agentId === undefined ? {} : { agentId: input.agentId },
              ),
      }),
      read: scopedHandler(stringPayload("dashboardId"), {
        local: (id) => runDashboardEffect(dashboards.read(id)),
        remote: (id, serverId) => remote(serverId, DASHBOARD_ROUTES.read, decodeDashboardFromHost, { id }),
      }),
      readArchived: scopedHandler(stringPayload("dashboardId"), {
        local: (id) => runDashboardEffect(dashboards.readArchived(id)),
        remote: (id, serverId) =>
          remote(
            serverId,
            DASHBOARD_ARCHIVE_ROUTES.read,
            decodeDashboardFromHost,
            { id },
            DASHBOARDS_ARCHIVE_CAPABILITY,
          ),
      }),
      create: scopedHandler(parseDashboardCreate, {
        local: (input) => runDashboardEffect(dashboards.create(input)),
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.create, decodeDashboardFromHost, input),
      }),
      update: scopedHandler(parseDashboardUpdate, {
        local: (input) => runDashboardEffect(dashboards.update(input)),
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.update, decodeDashboardFromHost, input),
      }),
      editWidget: scopedHandler(parseDashboardWidgetEdit, {
        local: (input) => runDashboardEffect(dashboards.editWidget(input)),
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.editWidget, decodeDashboardFromHost, input),
      }),
      archive: scopedHandler(parseDashboardRevision, {
        local: (input) => runDashboardEffect(dashboards.archive(input)),
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.archive, decodeDashboardFromHost, input),
      }),
      restore: scopedHandler(parseDashboardRevision, {
        local: (input) => runDashboardEffect(dashboards.restore(input)),
        remote: (input, serverId) =>
          remote(
            serverId,
            DASHBOARD_ARCHIVE_ROUTES.restore,
            decodeDashboardFromHost,
            input,
            DASHBOARDS_ARCHIVE_CAPABILITY,
          ),
      }),
      toggleItem: scopedHandler(parseDashboardToggle, {
        local: (input) => runDashboardEffect(dashboards.toggleItem(input)),
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.toggleItem, decodeDashboardFromHost, input),
      }),
      report: scopedHandler(parseDashboardReport, {
        local: async (input) => {
          const doc = await runDashboardEffect(dashboards.read(input.dashboardId));
          const block = doc.blocks.find((candidate) => candidate.id === input.blockId);
          if (block?.type !== "report") throw new Error(sourceText("error.dashboard.notFound"));
          return runDashboardEffect(dashboardReports.read({ agentId: doc.agentId, routineId: block.routineId }));
        },
        remote: (input, serverId) => remote(serverId, DASHBOARD_ROUTES.report, decodeDashboardReportFromHost, input),
      }),
    },
  };
}
