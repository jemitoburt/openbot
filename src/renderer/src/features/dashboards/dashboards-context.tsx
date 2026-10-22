import type {
  DashboardDocument,
  DashboardReport,
  DashboardSummary,
  EditDashboardWidgetInput,
  PluginState,
} from "@openbot/contracts/ipc";
import type { MarketplaceModel } from "@openbot/ui/features/marketplace/marketplace-model";
import { currentText } from "@openbot/ui/text";
import { createEffect, createStore, onCleanup, untrack } from "solid-js";
import { createScopeGuard } from "../../scope-lifetime";
import { createSimpleContext } from "../../simple-context";
import { useTurns } from "../../turns";
import { useAgents } from "../agents/agents-context";
import { serverCanAdminister, serverSupportsCapability } from "../servers/server-capabilities";
import { useServers } from "../servers/servers-context";
import { useWindowPage } from "../window/window-page-context";
import { createDashboardRequests } from "./dashboard-requests";
import { dashboardsPort } from "./dashboards-port";

interface DashboardsState {
  plugin: PluginState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  selectedId: string;
  selectedAgentId: string;
  documents: DashboardSummary[];
  selected: DashboardDocument | null;
  reports: Record<string, DashboardReport>;
  routines: Array<{ id: string; name: string; agentId: string }>;
}

const context = createSimpleContext({
  name: "DashboardsProvider",
  init: () => {
    const { activeServer, activeServerId } = useServers();
    const { agentList, agentStatus } = useAgents();
    const windowPage = useWindowPage();
    const turns = useTurns();
    const current = createScopeGuard();
    const [state, setState] = createStore<DashboardsState>({
      plugin: null,
      loading: false,
      busy: false,
      error: null,
      selectedId: "",
      selectedAgentId: "",
      documents: [],
      selected: null,
      reports: {},
      routines: [],
    });
    const requests = createDashboardRequests({
      serverId: activeServerId,
      queues: turns.queues,
      queueSnapshotRequests: turns.queueSnapshotRequests,
      onError: (error) =>
        setState((draft) => {
          draft.error = currentText().errorMessage(error, currentText().t("app.dashboards.error"));
        }),
    });
    const supported = () =>
      serverSupportsCapability(activeServer(), "plugins-v1") &&
      serverSupportsCapability(activeServer(), "dashboards-v1");
    const installed = () => supported() && state.plugin?.installed === true;
    const canManage = () => supported() && serverCanAdminister(activeServer(), "plugins-v1");
    let request = 0;
    let refreshing = false;
    let again = false;

    async function refresh(): Promise<void> {
      if (!supported() || !current()) return;
      if (refreshing) {
        again = true;
        return;
      }
      refreshing = true;
      const revision = ++request;
      const serverId = activeServerId();
      setState((draft) => {
        draft.loading = draft.plugin === null;
      });
      try {
        const plugin = await dashboardsPort().plugins.state(serverId);
        if (!current() || revision !== request) return;
        setState((draft) => {
          draft.plugin = plugin;
        });
        if (!plugin?.installed) {
          setState((draft) => {
            draft.documents = [];
            draft.selected = null;
            draft.reports = {};
            draft.routines = [];
          });
          if (windowPage.page() === "plugin") windowPage.showAgents();
          return;
        }
        if (windowPage.page() !== "plugin") return;
        const documents = await dashboardsPort().dashboards.list({}, serverId);
        if (!current() || revision !== request) return;
        setState((draft) => {
          draft.documents = documents;
        });
        const visibleDocuments = documents.filter((document) => document.archivedAt === null);
        const selectedSummary =
          visibleDocuments.find((document) => document.id === state.selectedId) ??
          (state.selectedAgentId
            ? visibleDocuments.find((document) => document.agentId === state.selectedAgentId)
            : visibleDocuments[0]);
        if (!selectedSummary) {
          setState((draft) => {
            draft.selectedId = "";
            draft.selected = null;
            draft.reports = {};
            draft.routines = [];
          });
          return;
        }
        const selectedId = selectedSummary.id;
        setState((draft) => {
          draft.selectedId = selectedId;
          draft.selectedAgentId = selectedSummary.agentId;
        });
        const selected = await dashboardsPort().dashboards.read(selectedId, serverId);
        if (!current() || revision !== request || state.selectedId !== selectedId) return;
        setState((draft) => {
          draft.selected = selected;
        });
        const routines = await dashboardsPort().agent.listRoutines(selected.agentId, serverId);
        if (!current() || revision !== request || state.selectedId !== selectedId) return;
        const reports: Record<string, DashboardReport> = {};
        for (const block of selected.blocks) {
          if (block.type !== "report") continue;
          reports[block.routineId] = await dashboardsPort().dashboards.report(
            { dashboardId: selected.id, blockId: block.id },
            serverId,
          );
          if (!current() || revision !== request || state.selectedId !== selectedId) return;
        }
        setState((draft) => {
          draft.routines = routines.map((routine) => ({
            id: routine.id,
            name: routine.name,
            agentId: selected.agentId,
          }));
          draft.reports = reports;
        });
      } catch (error) {
        if (!current() || revision !== request) return;
        setState((draft) => {
          draft.error = currentText().errorMessage(error, currentText().t("app.dashboards.error"));
        });
      } finally {
        if (current() && revision === request)
          setState((draft) => {
            draft.loading = false;
          });
        refreshing = false;
        if (again && current()) {
          again = false;
          void refresh();
        }
      }
    }

    async function mutate(work: () => Promise<unknown>): Promise<boolean> {
      if (state.busy || !current()) return false;
      setState((draft) => {
        draft.busy = true;
        draft.error = null;
      });
      try {
        await work();
        return current();
      } catch (error) {
        if (current())
          setState((draft) => {
            draft.error = currentText().errorMessage(error, currentText().t("app.dashboards.error"));
          });
        return false;
      } finally {
        if (current()) {
          setState((draft) => {
            draft.busy = false;
          });
          await refresh();
        }
      }
    }
    function open() {
      if (installed()) {
        windowPage.openPlugin("dashboards");
        void refresh();
      }
    }
    const model: Pick<
      MarketplaceModel,
      "plugins" | "pluginBusy" | "canManagePlugins" | "setPluginInstalled" | "openPlugin" | "error" | "clearError"
    > = {
      plugins: () => [
        {
          id: "dashboards",
          name: currentText().t("marketplace.feature.dashboards.name"),
          description: supported()
            ? currentText().t("marketplace.feature.dashboards.description")
            : currentText().t("app.dashboards.unavailable"),
          version: "1",
          installed: installed(),
        },
      ],
      error: () => state.error,
      clearError: () =>
        setState((draft) => {
          draft.error = null;
        }),
      pluginBusy: () => state.busy,
      canManagePlugins: canManage,
      setPluginInstalled: async (_id, value) => {
        await mutate(() => dashboardsPort().plugins.setInstalled(value, activeServerId()));
      },
      openPlugin: open,
    };
    createEffect(
      () => ({ server: activeServer(), phase: agentStatus().phase, supported: supported() }),
      ({ server, phase, supported: available }) => {
        if (!available) {
          request++;
          again = false;
          setState((draft) => {
            draft.plugin = null;
            draft.loading = false;
            draft.error = null;
            draft.selectedId = "";
            draft.selectedAgentId = "";
            draft.documents = [];
            draft.selected = null;
            draft.reports = {};
            draft.routines = [];
          });
          if (windowPage.page() === "plugin") windowPage.showAgents();
          return;
        }
        if ((server?.kind !== "remote" || server.state === "online") && phase === "ready") void refresh();
      },
    );
    createEffect(
      () => windowPage.page(),
      (page) => {
        if (page === "plugin") untrack(() => void refresh());
      },
    );
    const changed = (event: { serverId: string; change: { kind: string } }) => {
      if (
        event.serverId === activeServerId() &&
        (event.change.kind === "installation" || windowPage.page() === "plugin")
      )
        void refresh();
    };
    const stopPlugins = dashboardsPort().plugins.onChanged(changed);
    const stopDashboards = dashboardsPort().dashboards.onChanged(changed);
    onCleanup(() => {
      request++;
      stopPlugins();
      stopDashboards();
    });
    return {
      state,
      model,
      installed,
      supported,
      open,
      agents: () => agentList(),
      trackRequest: requests.trackRequest,
      generatingAgentIds: requests.generatingAgentIds,
      stopRequest: requests.stopRequest,
      select(id: string) {
        request++;
        setState((draft) => {
          draft.selectedId = id;
          draft.selectedAgentId = draft.documents.find((document) => document.id === id)?.agentId ?? "";
          draft.selected = null;
          draft.reports = {};
          draft.routines = [];
        });
        void refresh();
      },
      selectAgent(agentId: string) {
        request++;
        setState((draft) => {
          draft.selectedId = "";
          draft.selectedAgentId = agentId;
          draft.selected = null;
          draft.reports = {};
          draft.routines = [];
        });
        void refresh();
      },
      editWidget(document: DashboardDocument, edit: EditDashboardWidgetInput["edit"]): Promise<boolean> {
        return mutate(() =>
          dashboardsPort().dashboards.editWidget(
            { id: document.id, revision: document.revision, edit },
            activeServerId(),
          ),
        );
      },
      toggle(document: DashboardDocument, blockId: string, itemId: string, checked: boolean) {
        void mutate(() =>
          dashboardsPort().dashboards.toggleItem(
            { id: document.id, revision: document.revision, blockId, itemId, checked },
            activeServerId(),
          ),
        );
      },
      addReport(document: DashboardDocument, routineId: string) {
        if (document.blocks.some((block) => block.type === "report" && block.routineId === routineId)) return;
        void mutate(() =>
          dashboardsPort().dashboards.editWidget(
            { id: document.id, revision: document.revision, edit: { type: "addReport", routineId } },
            activeServerId(),
          ),
        );
      },
    };
  },
});
export const DashboardsProvider = context.provider;
export const useDashboards = context.use;
