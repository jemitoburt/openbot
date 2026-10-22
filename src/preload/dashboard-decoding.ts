import {
  type DashboardChange,
  type DashboardDocument,
  type DashboardReport,
  type DashboardSummary,
  isDashboardChange,
  isDashboardReport,
  isDashboardSummary,
  isPluginState,
  isPublicDashboardDocument,
  type PluginState,
} from "@openbot/contracts/ipc";
import { decodeRecord, requiredString } from "@openbot/contracts/ipc-decoding";

export function decodePluginStateFromMain(value: unknown): PluginState {
  if (!isPluginState(value)) throw new Error("Invalid plugin state from main.");
  return value;
}
export function decodeNullablePluginState(value: unknown): PluginState | null {
  return value === null ? null : decodePluginStateFromMain(value);
}
export function decodeDashboardFromMain(value: unknown): DashboardDocument {
  if (!isPublicDashboardDocument(value)) throw new Error("Invalid dashboard from main.");
  return value;
}
export function decodeDashboardSummariesFromMain(value: unknown): DashboardSummary[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid dashboards from main.");
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
export function decodeDashboardReportFromMain(value: unknown): DashboardReport {
  if (!isDashboardReport(value)) throw new Error("Invalid dashboard report from main.");
  return value;
}
export function decodeDashboardChange(value: unknown): { serverId: string; change: DashboardChange } {
  const record = decodeRecord(value, "dashboard change");
  if (!isDashboardChange(record.change)) throw new Error("Invalid dashboard change from main.");
  return { serverId: requiredString(record, "serverId"), change: record.change };
}
