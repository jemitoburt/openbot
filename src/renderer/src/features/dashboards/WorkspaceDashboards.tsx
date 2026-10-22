import type { DashboardBlock, DashboardDocument } from "@openbot/contracts/ipc";
import { DashboardPage } from "@openbot/ui/features/dashboards/DashboardPage";
import { useText } from "@openbot/ui/text";
import { actionToast } from "../../action-toast";
import { appPort } from "../../app-port";
import { writeClipboardText } from "../../clipboard";
import { useNavigation } from "../../navigation";
import { createScopeGuard } from "../../scope-lifetime";
import { useAgents } from "../agents/agents-context";
import { useConversation } from "../conversation/conversation-context";
import { useServers } from "../servers/servers-context";
import { createWebFileSaver } from "../web-client/web-file-download";
import { useDashboards } from "./dashboards-context";
import { dashboardsPort } from "./dashboards-port";

export function WorkspaceDashboards() {
  const dashboards = useDashboards();
  const navigation = useNavigation();
  const conversation = useConversation();
  const agents = useAgents();
  const { activeServerId } = useServers();
  const { t, errorMessage } = useText();
  const current = createScopeGuard();
  const saveFile = createWebFileSaver();
  const selectedAgent = () => dashboards.agents().find((agent) => agent.id === dashboards.state.selectedAgentId);
  function fail(error: unknown) {
    actionToast.error(errorMessage(error, t("app.dashboards.error")));
  }
  async function request(agentId: string, prompt: string): Promise<boolean> {
    const serverId = activeServerId();
    const result = await conversation.sendMessage(prompt, [], null, { agentId, serverId });
    if ("error" in result) {
      if (current()) fail(result.error);
      return false;
    }
    dashboards.trackRequest(agentId, result.messageId);
    return true;
  }
  function exportData(document: DashboardDocument, block?: DashboardBlock) {
    const text = JSON.stringify(block ?? document, null, 2);
    const binary = Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join("");
    saveFile({ name: `${block?.id ?? document.id}.json`, base64: btoa(binary) });
  }
  async function share(_document: DashboardDocument, block: DashboardBlock) {
    try {
      await writeClipboardText(JSON.stringify(block, null, 2));
      actionToast.success(t("common.copied"));
    } catch (error) {
      fail(error);
    }
  }
  async function runRoutine(agentId: string, routineId: string) {
    try {
      await dashboardsPort().agent.testRoutine({ agentId, routineId }, activeServerId());
    } catch (error) {
      if (current()) fail(error);
    }
  }
  return (
    <DashboardPage
      agents={dashboards.agents()}
      dashboards={dashboards.state.documents}
      selectedAgentId={dashboards.state.selectedAgentId}
      selectedDashboardId={dashboards.state.selectedId}
      selectedDashboard={dashboards.state.selected}
      modelLabel={selectedAgent()?.model ?? undefined}
      reports={dashboards.state.reports}
      routines={dashboards.state.routines}
      loading={dashboards.state.loading}
      error={dashboards.state.error}
      busy={dashboards.state.busy}
      generatingAgentIds={dashboards.generatingAgentIds()}
      onOpenDashboard={dashboards.select}
      onSelectAgent={dashboards.selectAgent}
      onCreateDashboard={(agentId) => void request(agentId, t("app.dashboards.createPrompt"))}
      onAskUpdate={(document) =>
        void request(document.agentId, t("app.dashboards.updatePrompt", { title: document.title, id: document.id }))
      }
      onAskAgent={request}
      onStopGeneration={(id) => void dashboards.stopRequest(id)}
      onExportDashboard={exportData}
      onExportWidget={exportData}
      onShareWidget={(document, block) => void share(document, block)}
      onEditWidget={dashboards.editWidget}
      onOpenRoutine={(agentId, routineId) => {
        navigation.selectAgent(agentId);
        agents.setSettingsRequest({
          agentId,
          nonce: Date.now(),
          routine: {
            routineId,
            name: dashboards.state.routines.find((routine) => routine.id === routineId)?.name ?? "",
          },
        });
      }}
      onRunRoutine={(agentId, routineId) => void runRoutine(agentId, routineId)}
      onOpenConversation={(agentId, messageId) =>
        messageId ? navigation.selectGlobalSearchMessage(agentId, messageId) : navigation.selectAgent(agentId)
      }
      onToggleChecklist={dashboards.toggle}
      onAddReport={dashboards.addReport}
      onOpenLink={(url) => void appPort().openUrl(url)}
    />
  );
}
