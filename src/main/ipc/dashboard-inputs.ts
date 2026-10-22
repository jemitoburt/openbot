import {
  type CreateDashboardInput,
  type DashboardListInput,
  type DashboardReportInput,
  type DashboardRevisionInput,
  type EditDashboardWidgetInput,
  isCreateDashboardInput,
  isDashboardListInput,
  isDashboardReportInput,
  isDashboardRevisionInput,
  isEditDashboardWidgetInput,
  isToggleDashboardItemInput,
  isUpdateDashboardInput,
  type ToggleDashboardItemInput,
  type UpdateDashboardInput,
} from "@openbot/contracts/ipc";

export function parseDashboardList(value: unknown): DashboardListInput {
  if (!isDashboardListInput(value)) throw new Error("Invalid dashboard list input.");
  return value;
}
export function parseDashboardCreate(value: unknown): CreateDashboardInput {
  if (!isCreateDashboardInput(value)) throw new Error("Invalid dashboard create input.");
  return value;
}
export function parseDashboardUpdate(value: unknown): UpdateDashboardInput {
  if (!isUpdateDashboardInput(value)) throw new Error("Invalid dashboard update input.");
  return value;
}
export function parseDashboardRevision(value: unknown): DashboardRevisionInput {
  if (!isDashboardRevisionInput(value)) throw new Error("Invalid dashboard revision input.");
  return value;
}
export function parseDashboardToggle(value: unknown): ToggleDashboardItemInput {
  if (!isToggleDashboardItemInput(value)) throw new Error("Invalid dashboard checklist input.");
  return value;
}
export function parseDashboardReport(value: unknown): DashboardReportInput {
  if (!isDashboardReportInput(value)) throw new Error("Invalid dashboard report input.");
  return value;
}
export function parsePluginInstalled(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid plugin installation input.");
  return value;
}

export function parseDashboardWidgetEdit(value: unknown): EditDashboardWidgetInput {
  if (!isEditDashboardWidgetInput(value)) throw new Error("Invalid dashboard widget edit input.");
  return value;
}
