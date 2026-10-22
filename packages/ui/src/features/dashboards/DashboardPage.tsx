import type {
  AgentSummary,
  DashboardAction,
  DashboardBlock,
  DashboardDocument,
  DashboardReport,
  DashboardSummary,
  EditDashboardWidgetInput,
} from "@openbot/contracts/ipc";
import {
  ArrowRight,
  ArrowUp,
  Brain,
  Button,
  Download,
  Heading,
  IconButton,
  Input,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Skeleton,
  Sparkles,
  Square,
  Text,
  Workflow,
} from "@openbot/ui";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { useText } from "@openbot/ui/text";
import { createEffect, createStore, For, Show } from "solid-js";
import { DashboardBlocks } from "./DashboardBlocks";
import { DashboardWidgetDetail } from "./DashboardWidgetDetail";
import "./dashboard-shell.css";

type DashboardAgent = Pick<AgentSummary, "id" | "name"> &
  Partial<Pick<AgentSummary, "avatarSeed" | "avatarHue" | "avatarUrl">>;

export interface DashboardPageProps {
  agents: readonly DashboardAgent[];
  dashboards: readonly DashboardSummary[];
  selectedDashboard?: DashboardDocument | null | undefined;
  selectedDashboardId?: string | null | undefined;
  selectedAgentId?: string | null | undefined;
  generatingAgentIds?: readonly string[] | undefined;
  modelLabel?: string | undefined;
  reports?: Readonly<Record<string, DashboardReport>> | undefined;
  routines?: readonly { id: string; name: string; agentId: string }[] | undefined;
  loading?: boolean | undefined;
  error?: string | null | undefined;
  busy?: boolean | undefined;
  onOpenDashboard: (id: string) => void;
  onSelectAgent?: ((agentId: string) => void) | undefined;
  onCreateDashboard: (agentId: string) => void;
  onAskUpdate: (dashboard: DashboardDocument) => void;
  onOpenConversation: (agentId: string, messageId?: string) => void;
  onToggleChecklist: (dashboard: DashboardDocument, blockId: string, itemId: string, checked: boolean) => void;
  onAddReport?: ((dashboard: DashboardDocument, routineId: string) => void) | undefined;
  onAskAgent?: ((agentId: string, prompt: string) => Promise<boolean>) | undefined;
  onStopGeneration?: ((agentId: string) => void) | undefined;
  onExportDashboard?: ((dashboard: DashboardDocument) => void) | undefined;
  onOpenRoutine?: ((agentId: string, routineId: string) => void) | undefined;
  onRunRoutine?: ((agentId: string, routineId: string) => void) | undefined;
  onEditWidget?:
    | ((dashboard: DashboardDocument, edit: EditDashboardWidgetInput["edit"]) => Promise<boolean>)
    | undefined;
  onExportWidget?: ((dashboard: DashboardDocument, block: DashboardBlock) => void) | undefined;
  onShareWidget?: ((dashboard: DashboardDocument, block: DashboardBlock) => void) | undefined;
  onOpenLink?: ((url: string) => void) | undefined;
}

export function DashboardPage(props: DashboardPageProps) {
  const { t, format } = useText();
  const [state, setState] = createStore({
    query: "",
    emptyAgentId: "",
    choosingAgent: false,
    choosingReport: false,
    blockId: "",
    prompt: "",
    sending: false,
    sendFailed: false,
  });
  let main: HTMLElement | undefined;
  const selected = () =>
    props.selectedDashboard?.id === props.selectedDashboardId ? props.selectedDashboard : undefined;
  const agent = () => {
    const id = selected()?.agentId ?? props.selectedAgentId ?? state.emptyAgentId;
    return id ? props.agents.find((entry) => entry.id === id) : props.agents[0];
  };
  const owner = () => {
    const value = agent();
    return value
      ? {
          name: value.name,
          avatarSeed: value.avatarSeed ?? value.id,
          avatarHue: value.avatarHue ?? null,
          avatarUrl: value.avatarUrl ?? null,
        }
      : undefined;
  };
  const generating = () => props.generatingAgentIds?.includes(agent()?.id ?? "") === true;
  const title = () => selected()?.title ?? agent()?.name ?? t("app.dashboards.title");
  const date = (value: string) => format.date(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const summaries = () => props.dashboards.filter((dashboard) => dashboard.archivedAt === null);
  const matches = (name: string) => name.toLowerCase().includes(state.query.trim().toLowerCase());
  const visible = () =>
    summaries().filter((dashboard) =>
      matches(`${dashboard.title} ${props.agents.find((entry) => entry.id === dashboard.agentId)?.name ?? ""}`),
    );
  const emptyAgents = () =>
    props.agents.filter(
      (entry) => !summaries().some((dashboard) => dashboard.agentId === entry.id) && matches(entry.name),
    );
  const block = () => selected()?.blocks.find((entry) => entry.id === state.blockId);
  const sourceRoutine = () => selected()?.blocks.find((entry) => entry.type === "report");
  const widgetAsk = () => {
    const ask = props.onAskAgent;
    return ask ? (document: DashboardDocument, prompt: string) => ask(document.agentId, prompt) : undefined;
  };
  createEffect(
    () => (props.loading ? null : `${selected()?.id ?? ""}:${agent()?.id ?? ""}`),
    (id, previous) => {
      if (id === null || id === previous) return;
      setState((draft) => {
        draft.blockId = "";
        draft.choosingReport = false;
        draft.prompt = "";
        draft.sendFailed = false;
      });
      queueMicrotask(() => {
        if (!main?.isConnected) return;
        main.scrollTo({ top: 0 });
        main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      });
    },
  );
  function selectAgent(id: string) {
    setState((draft) => {
      draft.emptyAgentId = id;
      draft.choosingAgent = false;
    });
    if (props.onSelectAgent) props.onSelectAgent(id);
    else props.onOpenDashboard("");
  }
  function action(value: DashboardAction) {
    const target = value.target;
    if (target.type === "url") props.onOpenLink?.(target.url);
    else if (target.type === "routine") props.onRunRoutine?.(agent()?.id ?? "", target.routineId);
    else if (agent()) props.onOpenConversation(agent()?.id ?? "");
  }
  async function submit() {
    const prompt = state.prompt.trim();
    const currentAgent = agent();
    if (!prompt || !currentAgent || !props.onAskAgent || state.sending) return;
    setState((draft) => {
      draft.sending = true;
      draft.sendFailed = false;
    });
    try {
      const document = selected();
      const sent = await props.onAskAgent(
        currentAgent.id,
        document ? `For dashboard "${document.title}" (id ${document.id}):\n${prompt}` : prompt,
      );
      setState((draft) => {
        if (sent) draft.prompt = "";
        draft.sendFailed = !sent;
      });
    } catch {
      setState((draft) => {
        draft.sendFailed = true;
      });
    } finally {
      setState((draft) => {
        draft.sending = false;
      });
    }
  }
  return (
    <section
      class="dashboard-shell"
      aria-label={t("app.dashboards.title")}
      aria-busy={props.loading ? "true" : "false"}
    >
      <aside class="dashboard-sidebar" aria-label={t("app.dashboards.title")}>
        <header class="dashboard-sidebar-heading">
          <Heading as="h2" size="sm">
            {t("app.dashboards.title")}
          </Heading>
          <IconButton
            label={t("app.dashboards.create")}
            variant="ghost"
            size="icon-sm"
            aria-expanded={state.choosingAgent ? "true" : "false"}
            onClick={() =>
              setState((draft) => {
                draft.choosingAgent = !draft.choosingAgent;
              })
            }
          >
            <Plus />
          </IconButton>
        </header>
        <label class="dashboard-sidebar-search" for="dashboard-sidebar-query">
          <Search aria-hidden="true" />
          <Input
            id="dashboard-sidebar-query"
            type="search"
            aria-label={t("app.dashboards.search")}
            placeholder={t("common.search")}
            value={state.query}
            onInput={(event) =>
              setState((draft) => {
                draft.query = event.currentTarget.value;
              })
            }
          />
        </label>
        <Show when={state.choosingAgent}>
          <div class="dashboard-new-agent">
            <Text as="p" variant="caption" tone="muted">
              {t("app.dashboards.selectAgent")}
            </Text>
            <For each={props.agents}>
              {(entry) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    selectAgent(entry.id);
                    props.onCreateDashboard(entry.id);
                  }}
                >
                  {entry.name}
                  <Plus aria-hidden="true" />
                </Button>
              )}
            </For>
          </div>
        </Show>
        <nav class="dashboard-sidebar-lists" aria-label={t("app.dashboards.filter")}>
          <Show when={visible().length > 0}>
            <p class="dashboard-sidebar-label">{t("app.dashboards.agentDashboards")}</p>
            <For each={visible()}>
              {(dashboard) => {
                const entry = () => props.agents.find((value) => value.id === dashboard.agentId);
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    class="dashboard-sidebar-item"
                    aria-current={selected()?.id === dashboard.id ? "page" : undefined}
                    onClick={() => {
                      setState((draft) => {
                        draft.emptyAgentId = "";
                      });
                      props.onOpenDashboard(dashboard.id);
                    }}
                  >
                    <span class="dashboard-sidebar-avatar">
                      <AgentAvatar
                        seed={entry()?.avatarSeed ?? dashboard.agentId}
                        hue={entry()?.avatarHue ?? null}
                        url={entry()?.avatarUrl}
                      />
                    </span>
                    <span class="dashboard-sidebar-copy">
                      <strong>{dashboard.title}</strong>
                      <span>
                        {entry()?.name ?? dashboard.agentId} · {date(dashboard.updatedAt)}
                      </span>
                    </span>
                  </Button>
                );
              }}
            </For>
          </Show>
          <Show when={emptyAgents().length > 0}>
            <p class="dashboard-sidebar-label">{t("app.dashboards.withoutDashboard")}</p>
            <For each={emptyAgents()}>
              {(entry) => (
                <Button
                  type="button"
                  variant="ghost"
                  class="dashboard-sidebar-item dashboard-sidebar-item-empty"
                  aria-current={!selected() && agent()?.id === entry.id ? "page" : undefined}
                  onClick={() => selectAgent(entry.id)}
                >
                  <span class="dashboard-sidebar-avatar">
                    <AgentAvatar
                      seed={entry.avatarSeed ?? entry.id}
                      hue={entry.avatarHue ?? null}
                      url={entry.avatarUrl}
                    />
                  </span>
                  <span class="dashboard-sidebar-copy">
                    <strong>{entry.name}</strong>
                    <span class="dashboard-sidebar-generate">
                      {t("app.dashboards.generate")} <ArrowRight aria-hidden="true" />
                    </span>
                  </span>
                </Button>
              )}
            </For>
          </Show>
          <Show when={visible().length === 0 && emptyAgents().length === 0}>
            <Text as="p" variant="body-sm" tone="muted">
              {t("app.dashboards.emptySearch")}
            </Text>
          </Show>
        </nav>
      </aside>
      <div class="dashboard-main">
        <header class="dashboard-topbar">
          <nav aria-label={t("app.dashboards.breadcrumb")}>
            <LayoutDashboard aria-hidden="true" />
            <span>{t("app.dashboards.title")}</span>
            <span aria-hidden="true">/</span>
            <strong>{title()}</strong>
          </nav>
          <Show when={props.modelLabel}>
            <span class="dashboard-model">
              <Brain aria-hidden="true" />
              {props.modelLabel}
            </span>
          </Show>
        </header>
        <main
          class="dashboard-page dashboard-main-scroll"
          ref={(element) => {
            main = element;
          }}
          data-empty={!selected() && !generating() ? "true" : undefined}
        >
          <Show when={props.error}>
            <Text as="p" variant="body-sm" tone="muted" role="alert">
              {props.error}
            </Text>
          </Show>
          <Show
            when={!props.loading}
            fallback={
              <div class="dashboard-page-loading" role="status">
                <LoaderCircle aria-hidden="true" />
                <Text>{t("app.dashboards.loading")}</Text>
              </div>
            }
          >
            <Show
              when={selected() || generating()}
              fallback={
                <section class="dashboard-empty-card" aria-labelledby="dashboard-empty-title">
                  <header>
                    <Sparkles aria-hidden="true" />
                    <span>{agent()?.name ?? t("app.dashboards.title")}</span>
                  </header>
                  <div class="dashboard-empty-body">
                    <Sparkles aria-hidden="true" />
                    <Heading as="h1" size="lg" id="dashboard-empty-title" tabindex={-1}>
                      {t("app.dashboards.emptyTitle", { agent: agent()?.name ?? t("app.dashboards.title") })}
                    </Heading>
                    <Text as="p" variant="body-sm" tone="muted">
                      {t("app.dashboards.emptyDescription")}
                    </Text>
                    <Show when={agent()}>
                      {(entry) => (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => props.onCreateDashboard(entry().id)}
                        >
                          <Sparkles aria-hidden="true" />
                          {t("app.dashboards.generate")}
                        </Button>
                      )}
                    </Show>
                  </div>
                  <footer>
                    <span class="dashboard-source-avatar">
                      <AgentAvatar
                        seed={agent()?.avatarSeed ?? agent()?.id}
                        hue={agent()?.avatarHue ?? null}
                        url={agent()?.avatarUrl}
                      />
                    </span>
                    <span>{agent()?.name}</span>
                    <span>{t("app.dashboards.notGenerated")}</span>
                  </footer>
                </section>
              }
            >
              <header class="dashboard-header">
                <span class="dashboard-header-avatar">
                  <AgentAvatar agent={owner()} />
                </span>
                <div class="dashboard-header-copy">
                  <Heading as="h1" size="lg" tabindex={-1}>
                    {title()}
                  </Heading>
                  <p>
                    {agent()?.name}
                    <span aria-hidden="true"> · </span>
                    <Show when={!generating()} fallback={t("app.dashboards.generating")}>
                      <Show when={selected()}>
                        {(document) => t("app.dashboards.updated", { date: date(document().updatedAt) })}
                      </Show>
                    </Show>
                  </p>
                </div>
                <div class="dashboard-header-actions">
                  <Show when={agent()}>
                    {(entry) => (
                      <Button variant="outline" size="sm" onClick={() => props.onOpenConversation(entry().id)}>
                        <MessageCircle aria-hidden="true" />
                        {generating() ? t("app.dashboards.watchChat") : t("app.dashboards.openChat")}
                      </Button>
                    )}
                  </Show>
                  <Show when={props.onOpenRoutine && sourceRoutine()}>
                    {(routine) => (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (routine().type === "report")
                            props.onOpenRoutine?.(agent()?.id ?? "", routine().routineId);
                        }}
                      >
                        <Workflow aria-hidden="true" />
                        {t("app.dashboards.openRoutine")}
                      </Button>
                    )}
                  </Show>
                  <Show
                    when={!generating()}
                    fallback={
                      <Show when={props.onStopGeneration}>
                        <Button variant="outline" size="sm" onClick={() => props.onStopGeneration?.(agent()?.id ?? "")}>
                          <Square aria-hidden="true" />
                          {t("app.dashboards.stop")}
                        </Button>
                      </Show>
                    }
                  >
                    <Show when={selected()}>
                      {(document) => (
                        <Button
                          variant="default"
                          size="sm"
                          disabled={props.busy}
                          onClick={() => props.onAskUpdate(document())}
                        >
                          {t("app.dashboards.regenerate")}
                          <RefreshCw aria-hidden="true" />
                        </Button>
                      )}
                    </Show>
                  </Show>
                  <Show when={selected() && props.onExportDashboard}>
                    <IconButton
                      label={t("app.dashboards.export")}
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        const document = selected();
                        if (document) props.onExportDashboard?.(document);
                      }}
                    >
                      <Download />
                    </IconButton>
                  </Show>
                  <Show when={selected() && props.onAddReport}>
                    <IconButton
                      label={t("app.dashboards.addReport")}
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={state.choosingReport ? "true" : "false"}
                      onClick={() =>
                        setState((draft) => {
                          draft.choosingReport = !draft.choosingReport;
                        })
                      }
                    >
                      <Plus />
                    </IconButton>
                  </Show>
                </div>
              </header>
              <Show when={generating()}>
                <div class="dashboard-generation-banner" role="status">
                  <LoaderCircle aria-hidden="true" />
                  <Text as="p" variant="body-sm">
                    {t("app.dashboards.generationDescription", { agent: agent()?.name ?? "" })}
                  </Text>
                </div>
              </Show>
              <Show when={state.choosingReport && selected()}>
                {(document) => (
                  <section class="dashboard-report-picker">
                    <Heading as="h2" size="sm">
                      {t("app.dashboards.chooseRoutine")}
                    </Heading>
                    <Text as="p" variant="body-sm" tone="muted">
                      {t("app.dashboards.reportHelp")}
                    </Text>
                    <div class="dashboard-actions">
                      <For
                        each={props.routines?.filter((routine) => routine.agentId === document().agentId)}
                        fallback={
                          <Text as="p" tone="muted">
                            {t("app.dashboards.noRoutines")}
                          </Text>
                        }
                      >
                        {(routine) => (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={props.busy}
                            onClick={() => {
                              props.onAddReport?.(document(), routine.id);
                              setState((draft) => {
                                draft.choosingReport = false;
                              });
                            }}
                          >
                            {routine.name}
                          </Button>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </Show>
              <Show
                when={selected()}
                fallback={
                  <div class="dashboard-generating-widgets" aria-hidden="true">
                    <For each={[1, 2, 3]}>
                      {() => (
                        <div>
                          <Skeleton />
                          <Skeleton />
                          <Skeleton />
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                {(document) => (
                  <DashboardBlocks
                    dashboard={document()}
                    agent={owner()}
                    reports={props.reports}
                    busy={props.busy}
                    onToggleChecklist={props.onToggleChecklist}
                    onOpenConversation={props.onOpenConversation}
                    onOpenLink={props.onOpenLink}
                    onOpenWidget={(entry) =>
                      setState((draft) => {
                        draft.blockId = entry.id;
                      })
                    }
                    onAction={action}
                    onRequestUpdate={() => props.onAskUpdate(document())}
                  />
                )}
              </Show>
            </Show>
          </Show>
        </main>
        <Show when={(selected() || generating()) && props.onAskAgent && agent()}>
          <div class="dashboard-ask-dock">
            <Show when={state.sendFailed}>
              <Text as="p" variant="caption" role="alert">
                {t("app.dashboards.detail.requestFailed")}
              </Text>
            </Show>
            <form
              class="dashboard-ask-bar"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <span class="dashboard-ask-avatar">
                <AgentAvatar agent={owner()} />
              </span>
              <Input
                value={state.prompt}
                aria-label={t("app.dashboards.ask", { agent: agent()?.name ?? "" })}
                placeholder={t("app.dashboards.ask", { agent: agent()?.name ?? "" })}
                onInput={(event) =>
                  setState((draft) => {
                    draft.prompt = event.currentTarget.value;
                  })
                }
              />
              <IconButton
                label={t("app.dashboards.detail.send")}
                variant="default"
                size="icon"
                type="submit"
                disabled={!state.prompt.trim() || state.sending}
                loading={state.sending}
              >
                <ArrowUp />
              </IconButton>
            </form>
          </div>
        </Show>
      </div>
      <Show when={selected() && block()}>
        {(entry) => {
          const document = () => selected();
          return (
            <Show when={document()}>
              {(value) => (
                <DashboardWidgetDetail
                  dashboard={value()}
                  block={entry()}
                  agent={owner()}
                  reports={props.reports}
                  busy={props.busy}
                  onClose={() =>
                    setState((draft) => {
                      draft.blockId = "";
                    })
                  }
                  onToggleChecklist={props.onToggleChecklist}
                  onOpenConversation={props.onOpenConversation}
                  onOpenLink={props.onOpenLink}
                  onAskAgent={widgetAsk()}
                  onEditWidget={props.onEditWidget}
                  onExport={props.onExportWidget}
                  onShare={props.onShareWidget}
                  onAction={action}
                  onRequestUpdate={() => props.onAskUpdate(value())}
                />
              )}
            </Show>
          );
        }}
      </Show>
    </section>
  );
}
