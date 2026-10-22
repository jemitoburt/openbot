// Frozen optional dashboards-archive-v1 wire contract. Do not import IPC types or limits.
// Members can list and read active or archived dashboards of visible agents. Chat access permits revision-checked restore.
// The list includes active and archived dashboards only when includeArchived is true.
// Ordinary dashboards-v1 list and read requests keep their active-only behavior.
import { boolean, fields, identifier, type OptionalRouteCodec } from "./admin-wire";
import { DASHBOARD_CODECS, DASHBOARD_ROUTES } from "./dashboards-v1";

export const DASHBOARDS_ARCHIVE_CAPABILITY = "dashboards-archive-v1";
export const DASHBOARD_ARCHIVE_ROUTES = {
  list: "/v1/dashboards/archive/list",
  read: "/v1/dashboards/archive/read",
  restore: "/v1/dashboards/restore",
} as const;

const listCodec = DASHBOARD_CODECS.get(DASHBOARD_ROUTES.list);
const readCodec = DASHBOARD_CODECS.get(DASHBOARD_ROUTES.read);
const archiveCodec = DASHBOARD_CODECS.get(DASHBOARD_ROUTES.archive);
if (!listCodec || !readCodec || !archiveCodec) throw new Error("Missing frozen dashboard codec.");

export const DASHBOARD_ARCHIVE_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [
    DASHBOARD_ARCHIVE_ROUTES.list,
    { request: fields({}, { agentId: identifier, includeArchived: boolean }), response: listCodec.response },
  ],
  [DASHBOARD_ARCHIVE_ROUTES.read, { request: readCodec.request, response: readCodec.response }],
  [DASHBOARD_ARCHIVE_ROUTES.restore, { request: archiveCodec.request, response: readCodec.response }],
]);
