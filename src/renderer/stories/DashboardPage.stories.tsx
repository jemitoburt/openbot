import type { DashboardChecklistItem, DashboardReport } from "@openbot/contracts/ipc";
import { DashboardPage } from "@openbot/ui/features/dashboards/DashboardPage";
import "@openbot/ui/features/dashboards/dashboards.css";
import { createStore, untrack } from "solid-js";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { dashboardStoryDocuments as documents, dashboardStoryReport as report } from "./dashboard-fixtures";

type Scenario = "morning" | "fitness" | "coding" | "catalogue" | "empty" | "generating";
function DashboardStory(props: {
  scenario?: Scenario;
  browser?: boolean;
  reportStatus?: DashboardReport["status"];
  truncated?: boolean;
}) {
  const initial = untrack(() => ({
    scenario: props.scenario ?? "morning",
    browser: props.browser,
    reportStatus: props.reportStatus,
    truncated: props.truncated,
  }));
  const [state, setState] = createStore({
    documents: structuredClone(documents),
    selectedId:
      initial.browser || initial.scenario === "empty" || initial.scenario === "generating" ? "" : initial.scenario,
    selectedAgentId: initial.scenario === "empty" || initial.scenario === "generating" ? "finance" : "jarvis",
    generating: initial.scenario === "generating",
  });
  return (
    <div style={{ height: "100vh" }}>
      <DashboardPage
        agents={[
          { id: "jarvis", name: "Jarvis", avatarSeed: "jarvis", avatarHue: 150 },
          { id: "fitness", name: "Fitness", avatarSeed: "fitness", avatarHue: 30 },
          { id: "coding", name: "CTO", avatarSeed: "coding", avatarHue: 215 },
          { id: "finance", name: "Finance", avatarSeed: "finance", avatarHue: 280 },
          { id: "catalogue", name: "Widget Kit", avatarSeed: "catalogue" },
        ]}
        dashboards={state.documents}
        selectedDashboardId={state.selectedId}
        selectedDashboard={state.documents.find((entry) => entry.id === state.selectedId)}
        selectedAgentId={state.selectedAgentId}
        generatingAgentIds={state.generating ? ["finance"] : []}
        modelLabel="GPT-6-Luna"
        reports={{
          morning: {
            ...report,
            truncated: initial.truncated === true,
            status: initial.reportStatus ?? "completed",
            available: initial.reportStatus !== "unavailable",
            text: initial.reportStatus === "idle" ? null : report.text,
          },
        }}
        routines={[{ id: "morning", name: "Morning report", agentId: "jarvis" }]}
        onOpenDashboard={(id) =>
          setState((draft) => {
            draft.selectedId = id;
          })
        }
        onSelectAgent={(id) =>
          setState((draft) => {
            draft.selectedAgentId = id;
            draft.selectedId = "";
          })
        }
        onCreateDashboard={(id) =>
          setState((draft) => {
            draft.selectedAgentId = id;
            draft.generating = true;
          })
        }
        onStopGeneration={() =>
          setState((draft) => {
            draft.generating = false;
          })
        }
        onAskUpdate={fn()}
        onOpenConversation={fn()}
        onOpenLink={fn()}
        onAddReport={fn()}
        onAskAgent={async () => true}
        onRunRoutine={fn()}
        onExportDashboard={fn()}
        onExportWidget={fn()}
        onShareWidget={fn()}
        onEditWidget={async (doc, edit) => {
          const document = state.documents.find((entry) => entry.id === doc.id);
          if (!document || document.revision !== doc.revision) return false;
          if (edit.type === "addChecklistItems") {
            const checklist = document.blocks.find((entry) => entry.id === edit.blockId);
            if (checklist?.type !== "checklist") return false;
          }
          if (edit.type === "addRecipeIngredients") {
            const recipe = document.blocks.find((entry) => entry.id === edit.recipeBlockId);
            if (recipe?.type !== "rich" || !recipe.ingredients?.length) return false;
            if (!document.blocks.some((entry) => entry.type === "checklist" && entry.id === recipe.targetChecklistId))
              return false;
          }
          if (
            edit.type === "addReport" &&
            document.blocks.some((entry) => entry.type === "report" && entry.routineId === edit.routineId)
          )
            return false;
          setState((draft) => {
            const target = draft.documents.find((entry) => entry.id === doc.id);
            if (!target) return;
            switch (edit.type) {
              case "addChecklistItems": {
                const checklist = target.blocks.find((entry) => entry.id === edit.blockId);
                if (checklist?.type !== "checklist") return;
                checklist.items.push(...structuredClone(edit.items));
                break;
              }
              case "addRecipeIngredients": {
                const recipe = target.blocks.find((entry) => entry.id === edit.recipeBlockId);
                if (recipe?.type !== "rich") return;
                const checklist = target.blocks.find((entry) => entry.id === recipe.targetChecklistId);
                if (checklist?.type !== "checklist") return;
                const items = (recipe.ingredients ?? []).map(
                  (ingredient): DashboardChecklistItem => ({
                    id: crypto.randomUUID(),
                    text: ingredient.label,
                    checked: false,
                    quantity: (ingredient.quantity * edit.portions) / (recipe.portions ?? 1),
                    source: "recipe",
                    ...(ingredient.unit ? { unit: ingredient.unit } : {}),
                    ...(ingredient.category ? { category: ingredient.category } : {}),
                  }),
                );
                checklist.items.push(...items);
                break;
              }
              case "addReport": {
                target.blocks.push({
                  id: crypto.randomUUID(),
                  type: "report",
                  title: "Morning report",
                  routineId: edit.routineId,
                });
                break;
              }
            }
            target.revision += 1;
          });
          return true;
        }}
        onToggleChecklist={(doc, blockId, itemId, checked) =>
          setState((draft) => {
            const target = draft.documents
              .find((entry) => entry.id === doc.id)
              ?.blocks.find((entry) => entry.id === blockId);
            const items =
              target?.type === "checklist" ? target.items : target?.type === "project" ? target.tasks : undefined;
            const item = items?.find((entry) => entry.id === itemId);
            if (item) item.checked = checked;
          })
        }
      />
    </div>
  );
}
const meta = {
  title: "Dashboards/DashboardPage",
  component: DashboardStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DashboardStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MorningOverview: Story = { args: { scenario: "morning" } };
export const Fitness: Story = { args: { scenario: "fitness" } };
export const Coding: Story = { args: { scenario: "coding" } };
export const AllBlocks: Story = { args: { scenario: "catalogue" } };
export const Browser: Story = { args: { browser: true } };
export const Empty: Story = { args: { scenario: "empty" } };
export const Generating: Story = { args: { scenario: "generating" } };
export const ReportPending: Story = { args: { reportStatus: "pending" } };
export const ReportRunning: Story = { args: { reportStatus: "running" } };
export const ReportFailed: Story = { args: { reportStatus: "failed" } };
export const ReportUnavailable: Story = { args: { reportStatus: "unavailable" } };
export const FirstReport: Story = { args: { reportStatus: "idle" } };
export const ShortenedReport: Story = { args: { truncated: true } };
