import { PLUGIN_ROUTES, PLUGINS_CAPABILITY } from "@openbot/contracts/team-protocol/dashboards-v1";
import { sourceText } from "@openbot/i18n/source";
import type { DashboardService } from "../../backend/dashboards/dashboard-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { runDashboardEffect } from "../dashboard-boundary";
import { decodePluginStateFromHost } from "../remote-dashboard-decoding";
import type { DashboardIpcDependencies } from "./dashboard-handlers";
import { parsePluginInstalled } from "./dashboard-inputs";
import { handler, type IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler, scopedQueryHandler } from "./scoped-handler";

interface PluginIpcDependencies {
  dashboards: Pick<DashboardService, "pluginState" | "setInstalled">;
  remoteServers: DashboardIpcDependencies["remoteServers"];
  /** A listing link received before the renderer loaded, taken exactly once. */
  takePendingPluginSlug: () => string | null;
}

/** Host plugins and existing integration listing links. A link never installs software. */
export function pluginIpcHandlers({
  dashboards,
  remoteServers,
  takePendingPluginSlug,
}: PluginIpcDependencies): Pick<IpcGroupHandlers, "plugins"> {
  return {
    plugins: {
      takePendingListing: handler(takePendingPluginSlug),
      state: scopedQueryHandler({
        local: () => runDashboardEffect(dashboards.pluginState()),
        remote: (serverId) =>
          remoteServers.supportsCapability(serverId, PLUGINS_CAPABILITY)
            ? runCauseEffect(
                remoteServers.request(serverId, PLUGIN_ROUTES.state, decodePluginStateFromHost, {
                  method: "POST",
                  body: {},
                }),
              )
            : null,
      }),
      setInstalled: scopedHandler(parsePluginInstalled, {
        local: (installed) => runDashboardEffect(dashboards.setInstalled(installed)),
        remote: (installed, serverId) => {
          if (!remoteServers.supportsCapability(serverId, PLUGINS_CAPABILITY))
            throw new Error(sourceText("error.dashboard.unsupported"));
          return runCauseEffect(
            remoteServers.request(serverId, PLUGIN_ROUTES.setInstalled, decodePluginStateFromHost, {
              method: "POST",
              body: { installed },
            }),
          );
        },
      }),
    },
  };
}
