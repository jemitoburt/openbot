import type {
  AgentSummary,
  DashboardAction,
  DashboardBlock,
  DashboardDocument,
  DashboardReport,
  DashboardTimelineEvent,
  EditDashboardWidgetInput,
} from "@openbot/contracts/ipc";
import {
  ArrowUp,
  Button,
  Dialog,
  Download,
  Heading,
  IconButton,
  Input,
  MessageSquare,
  NativeSelect,
  Search,
  Share2,
  Sparkles,
  Text,
  X,
} from "@openbot/ui";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { useText } from "@openbot/ui/text";
import { createStore, For, Show, untrack } from "solid-js";
import { DashboardDetailContent } from "./DashboardDetailContent";
import { DashboardWidgetIcon } from "./DashboardWidgetContent";
import "./dashboard-detail.css";

export interface DashboardWidgetDetailProps {
  dashboard: DashboardDocument;
  block: DashboardBlock;
  reports?: Readonly<Record<string, DashboardReport>> | undefined;
  agent?: Pick<AgentSummary, "name" | "avatarSeed" | "avatarHue" | "avatarUrl"> | undefined;
  busy?: boolean | undefined;
  onClose: () => void;
  onToggleChecklist: (dashboard: DashboardDocument, blockId: string, itemId: string, checked: boolean) => void;
  onOpenConversation: (agentId: string, messageId?: string) => void;
  onOpenLink?: ((url: string) => void) | undefined;
  onAskAgent?: ((dashboard: DashboardDocument, prompt: string) => Promise<boolean>) | undefined;
  onEditWidget?:
    | ((dashboard: DashboardDocument, edit: EditDashboardWidgetInput["edit"]) => Promise<boolean>)
    | undefined;
  onExport?: ((dashboard: DashboardDocument, block: DashboardBlock) => void) | undefined;
  onShare?: ((dashboard: DashboardDocument, block: DashboardBlock) => void) | undefined;
  onAction?: ((action: DashboardAction) => void) | undefined;
  onRequestUpdate?: (() => void) | undefined;
}

export function DashboardWidgetDetail(props: DashboardWidgetDetailProps) {
  const { t, format } = useText();
  const opener = untrack(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const openerLabel = opener?.getAttribute("aria-label");
  const [state, setState] = createStore({
    query: "",
    prompt: "",
    sending: false,
    failed: false,
    status: "all",
    sort: "category",
    category: "",
    selectedEventId: "",
  });
  let promptInput: HTMLInputElement | undefined;
  const owner = () => props.agent?.name ?? props.block.footer?.agent ?? props.dashboard.agentId;
  const updatedAt = () => props.block.footer?.updatedAt ?? props.dashboard.updatedAt;
  const searchable = () => ["checklist", "rich", "news", "list", "project", "table", "week"].includes(props.block.type);
  const selectedEvent = (): DashboardTimelineEvent | undefined => {
    if (props.block.type !== "week") return undefined;
    const events = props.block.days.flatMap((day) => day.events);
    return events.find((event) => event.id === state.selectedEventId) ?? events.find((event) => event.selected);
  };
  const newsCategories = () =>
    props.block.type === "news" ? [...new Set(props.block.items.map((item) => item.category))] : [];
  const date = (value: string) => format.date(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const submit = async () => {
    const prompt = state.prompt.trim();
    if (!prompt || !props.onAskAgent || state.sending || props.busy) return;
    setState((draft) => {
      draft.sending = true;
      draft.failed = false;
    });
    try {
      const sent = await props.onAskAgent(
        props.dashboard,
        `For widget "${props.block.title}" (block ${props.block.id}) in dashboard "${props.dashboard.title}" (id ${props.dashboard.id}):\n${prompt}`,
      );
      setState((draft) => {
        if (sent) draft.prompt = "";
        draft.failed = !sent;
      });
    } catch {
      setState((draft) => {
        draft.failed = true;
      });
    } finally {
      setState((draft) => {
        draft.sending = false;
      });
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="dashboard-detail-overlay">
          <Dialog.Content
            as="section"
            class="dashboard-widget-detail"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const replacement = openerLabel
                ? Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-label]")).find(
                    (button) => button.getAttribute("aria-label") === openerLabel && !button.closest("[role=dialog]"),
                  )
                : undefined;
              const target = opener?.isConnected ? opener : replacement;
              target?.focus({ preventScroll: true });
            }}
          >
            <header class="dashboard-widget-detail-header">
              <span class="dashboard-widget-detail-icon">
                <DashboardWidgetIcon block={props.block} />
              </span>
              <div class="dashboard-widget-detail-heading">
                <Dialog.Title as="h2">{props.block.title}</Dialog.Title>
                <div class="dashboard-widget-detail-owner">
                  <AgentAvatar agent={props.agent} seed={props.agent?.avatarSeed ?? props.dashboard.agentId} />
                  <span>{owner()}</span>
                  <Show when={props.block.footer?.source}>
                    <span>· {props.block.footer?.source}</span>
                  </Show>
                  <time datetime={updatedAt()}>{t("app.dashboards.updated", { date: date(updatedAt()) })}</time>
                </div>
              </div>
              <div class="dashboard-widget-detail-actions">
                <Show when={props.onShare}>
                  <Button variant="outline" size="sm" onClick={() => props.onShare?.(props.dashboard, props.block)}>
                    <Share2 aria-hidden="true" />
                    {t("app.dashboards.detail.share")}
                  </Button>
                </Show>
                <Show when={props.onExport}>
                  <Button variant="outline" size="sm" onClick={() => props.onExport?.(props.dashboard, props.block)}>
                    <Download aria-hidden="true" />
                    {t("app.dashboards.detail.export")}
                  </Button>
                </Show>
                <Show when={props.onAskAgent || props.onRequestUpdate}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (props.onRequestUpdate ? props.onRequestUpdate() : promptInput?.focus())}
                  >
                    <Sparkles aria-hidden="true" />
                    {t("app.dashboards.detail.askUpdate", { agent: owner() })}
                  </Button>
                </Show>
                <IconButton
                  label={t("app.dashboards.openChat")}
                  variant="ghost"
                  onClick={() => props.onOpenConversation(props.dashboard.agentId)}
                >
                  <MessageSquare />
                </IconButton>
              </div>
              <IconButton label={t("common.close")} variant="outline" onClick={props.onClose}>
                <X />
              </IconButton>
            </header>
            <Show when={searchable()}>
              <div class="dashboard-widget-detail-toolbar">
                <label class="dashboard-widget-detail-search">
                  <Search aria-hidden="true" />
                  <Input
                    type="search"
                    value={state.query}
                    aria-label={t("app.dashboards.detail.search")}
                    placeholder={t("app.dashboards.detail.search")}
                    onValueChange={(value) =>
                      setState((draft) => {
                        draft.query = value;
                      })
                    }
                  />
                </label>
                <Show when={props.block.type === "checklist"}>
                  <NativeSelect
                    aria-label={t("app.dashboards.detail.all")}
                    value={state.status}
                    onChange={(event) =>
                      setState((draft) => {
                        draft.status = event.currentTarget.value;
                      })
                    }
                  >
                    <option value="all">{t("app.dashboards.detail.all")}</option>
                    <option value="pending">{t("app.dashboards.detail.pending")}</option>
                    <option value="completed">{t("app.dashboards.detail.completed")}</option>
                  </NativeSelect>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setState((draft) => {
                        draft.sort = draft.sort === "category" ? "name" : "category";
                      })
                    }
                  >
                    {state.sort === "category"
                      ? t("app.dashboards.detail.sortCategory")
                      : t("app.dashboards.detail.sortName")}
                  </Button>
                </Show>
                <Show when={props.block.type === "news"}>
                  <NativeSelect
                    aria-label={t("app.dashboards.detail.category")}
                    value={state.category}
                    onChange={(event) =>
                      setState((draft) => {
                        draft.category = event.currentTarget.value;
                      })
                    }
                  >
                    <option value="">{t("app.dashboards.detail.all")}</option>
                    <For each={newsCategories()}>{(category) => <option value={category}>{category}</option>}</For>
                  </NativeSelect>
                </Show>
                <Show when={props.block.type === "project"}>
                  <NativeSelect
                    aria-label={t("app.dashboards.detail.all")}
                    value={state.status}
                    onChange={(event) =>
                      setState((draft) => {
                        draft.status = event.currentTarget.value;
                      })
                    }
                  >
                    <option value="all">{t("app.dashboards.detail.all")}</option>
                    <option value="todo">{t("app.dashboards.detail.todo")}</option>
                    <option value="doing">{t("app.dashboards.detail.doing")}</option>
                    <option value="waiting">{t("app.dashboards.detail.waiting")}</option>
                    <option value="done">{t("app.dashboards.detail.completed")}</option>
                  </NativeSelect>
                </Show>
              </div>
            </Show>
            <div class="dashboard-widget-detail-main">
              <div class="dashboard-widget-detail-body" data-block-type={props.block.type}>
                <DashboardDetailContent
                  {...props}
                  query={state.query}
                  filters={{ status: state.status, sort: state.sort, category: state.category }}
                  selectedEventId={selectedEvent()?.id}
                  onSelectEvent={(id) =>
                    setState((draft) => {
                      draft.selectedEventId = id;
                    })
                  }
                />
              </div>
              <aside class="dashboard-widget-detail-sidebar">
                <Show when={selectedEvent()}>
                  {(event) => (
                    <section class="dashboard-detail-selected-event">
                      <h3>{t("app.dashboards.showDetails")}</h3>
                      <Heading as="h4" size="sm">
                        {event().title}
                      </Heading>
                      <time>{event().time}</time>
                      <Show when={event().location}>
                        <Text as="p" variant="body-sm">
                          {t("app.dashboards.detail.location")}: {event().location}
                        </Text>
                      </Show>
                      <Show when={event().detail}>
                        <Text as="p" variant="body-sm">
                          {event().detail}
                        </Text>
                      </Show>
                    </section>
                  )}
                </Show>
                <h3>{t("app.dashboards.detail.metadata")}</h3>
                <dl class="dashboard-widget-detail-metadata">
                  <div>
                    <dt>{t("app.dashboards.detail.agent")}</dt>
                    <dd>{owner()}</dd>
                  </div>
                  <Show when={props.block.footer?.source}>
                    <div>
                      <dt>{t("app.dashboards.detail.source")}</dt>
                      <dd>{props.block.footer?.source}</dd>
                    </div>
                  </Show>
                  <div>
                    <dt>{t("app.dashboards.detail.updated")}</dt>
                    <dd>{date(updatedAt())}</dd>
                  </div>
                  <For each={props.block.detail?.meta}>
                    {(item) => (
                      <div>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    )}
                  </For>
                </dl>
                <Show when={props.block.detail?.history?.length}>
                  <h3>{t("app.dashboards.detail.history")}</h3>
                  <ol class="dashboard-widget-detail-history">
                    <For each={props.block.detail?.history}>
                      {(item) => (
                        <li>
                          <div>
                            <strong>{item.agent}</strong>
                            <p>{item.text}</p>
                          </div>
                          <time datetime={item.at}>{date(item.at)}</time>
                        </li>
                      )}
                    </For>
                  </ol>
                </Show>
              </aside>
            </div>
            <Show when={props.onAskAgent}>
              <footer class="dashboard-widget-detail-footer">
                <form
                  class="dashboard-widget-detail-ask"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <AgentAvatar agent={props.agent} seed={props.agent?.avatarSeed ?? props.dashboard.agentId} />
                  <Input
                    ref={(element) => {
                      promptInput = element;
                    }}
                    value={state.prompt}
                    aria-label={t("app.dashboards.detail.ask", { agent: owner() })}
                    placeholder={t("app.dashboards.detail.ask", { agent: owner() })}
                    disabled={state.sending || props.busy}
                    onValueChange={(value) =>
                      setState((draft) => {
                        draft.prompt = value;
                      })
                    }
                  />
                  <IconButton
                    type="submit"
                    label={t("app.dashboards.detail.send")}
                    disabled={!state.prompt.trim() || state.sending || props.busy}
                  >
                    <ArrowUp />
                  </IconButton>
                </form>
                <Show when={state.failed}>
                  <Text as="p" role="alert" variant="caption">
                    {t("app.dashboards.detail.requestFailed")}
                  </Text>
                </Show>
              </footer>
            </Show>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
