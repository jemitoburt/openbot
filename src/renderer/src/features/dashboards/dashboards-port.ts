import type { OpenBotDesktopApi } from "@openbot/contracts/ipc";

/** The desktop bridge reads the selected host; it never falls back from a remote host. */
export function dashboardsPort(): Pick<OpenBotDesktopApi, "plugins" | "dashboards" | "agent" | "servers"> {
  return window.openbot;
}
