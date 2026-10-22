import { useText } from "@openbot/ui/text";
import { Loading, Match, Show, Switch } from "solid-js";
import { AgentUsagePanel } from "../../lazy-views";
import { WorkspaceDashboards } from "../dashboards/WorkspaceDashboards";
import { SchedulePanel } from "../schedule/SchedulePanel";
import { useServers } from "../servers/servers-context";
import { TasksPanel } from "../tasks/TasksPanel";
import { useUsage } from "../usage/usage-context";
import { SettingsPage } from "./SettingsPage";
import { type SettingsKind, useWindowPage } from "./window-page-context";

/** The desktop page that covers the conversation: settings, usage, schedule, tasks or a plugin. */
export function WindowPageView() {
  const { t } = useText();
  const windowPage = useWindowPage();
  const usage = useUsage();
  const { servers } = useServers();
  const settingsKind = (): SettingsKind | null => {
    const page = windowPage.page();
    if (page === "settings") return "personal";
    return page === "server-settings" ? "server" : null;
  };
  const hostName = (serverId: string) =>
    servers().find((server) => server.id === serverId)?.name ?? t("app.page.serverFallback");
  return (
    <Show
      when={windowPage.page() === "plugin"}
      fallback={
        <Show
          when={settingsKind() ? null : usage.state.serverId}
          fallback={
            <Show when={settingsKind()} keyed>
              {(kind) => <SettingsPage kind={kind} />}
            </Show>
          }
        >
          {(serverId) => (
            <Switch
              fallback={
                <Loading>
                  <AgentUsagePanel
                    serverId={serverId()}
                    hostName={hostName(serverId())}
                    agentId={usage.state.agentId}
                    onBack={usage.closeUsage}
                  />
                </Loading>
              }
            >
              <Match when={usage.state.view === "schedule"}>
                <SchedulePanel serverId={serverId()} hostName={hostName(serverId())} onBack={usage.closeUsage} />
              </Match>
              <Match when={usage.state.view === "tasks"}>
                <TasksPanel serverId={serverId()} hostName={hostName(serverId())} onBack={usage.closeUsage} />
              </Match>
            </Switch>
          )}
        </Show>
      }
    >
      <WorkspaceDashboards />
    </Show>
  );
}
