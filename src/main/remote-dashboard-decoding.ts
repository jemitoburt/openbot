import {
  type DashboardDocument,
  type DashboardReport,
  type DashboardSummary,
  isDashboardReport,
  isDashboardSummary,
  isPluginState,
  isPublicDashboardDocument,
  type PluginState,
} from "@openbot/contracts/ipc";

export function decodePluginStateFromHost(value: unknown): PluginState {
  if (!isPluginState(value)) throw new Error("Invalid plugin state from host.");
  return value;
}
export function decodeDashboardFromHost(value: unknown): DashboardDocument {
  if (!isPublicDashboardDocument(value)) throw new Error("Invalid dashboard from host.");
  return value;
}
export function decodeDashboardSummariesFromHost(value: unknown): DashboardSummary[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid dashboards from host.");
  return value.map((entry) => {
    if (!isDashboardSummary(entry)) throw new Error("Invalid dashboard summary.");
    return {
      id: entry.id,
      agentId: entry.agentId,
      title: entry.title,
      schemaVersion: entry.schemaVersion,
      revision: entry.revision,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      archivedAt: entry.archivedAt,
    };
  });
}
export function decodeDashboardReportFromHost(value: unknown): DashboardReport {
  if (!isDashboardReport(value)) throw new Error("Invalid dashboard report from host.");
  return value;
}
