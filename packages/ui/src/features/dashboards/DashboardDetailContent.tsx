import type { DashboardBlock, DashboardChecklistItem } from "@openbot/contracts/ipc";
import type { AppTextKey } from "@openbot/i18n";
import {
  Button,
  Checkbox,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Heading,
  IconButton,
  Input,
  Link as LinkIcon,
  Minus,
  Plus,
  Progress,
  Text,
} from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { createStore, For, Match, Show, Switch, untrack } from "solid-js";
import { safeBrowserUrl } from "../conversation/RichMessageText";
import { DashboardWidgetContent } from "./DashboardWidgetContent";
import type { DashboardWidgetDetailProps } from "./DashboardWidgetDetail";

type DetailProps = DashboardWidgetDetailProps & {
  query: string;
  filters: { status: string; sort: string; category: string };
  selectedEventId?: string | undefined;
  onSelectEvent: (id: string) => void;
};
type Checklist = Extract<DashboardBlock, { type: "checklist" }>;
type Rich = Extract<DashboardBlock, { type: "rich" }>;
type Table = Extract<DashboardBlock, { type: "table" }>;
type Week = Extract<DashboardBlock, { type: "week" }>;
type Project = Extract<DashboardBlock, { type: "project" }>;
type News = Extract<DashboardBlock, { type: "news" }>;

export function DashboardDetailContent(props: DetailProps) {
  const filtered = (): DashboardBlock => {
    const block = props.block;
    const query = props.query.trim().toLowerCase();
    if (block.type === "news")
      return {
        ...block,
        items: block.items.filter(
          (item) =>
            (!props.filters.category || item.category === props.filters.category) &&
            `${item.headline} ${item.summaryFull ?? item.summary} ${item.source}`.toLowerCase().includes(query),
        ),
      };
    if (block.type === "list")
      return {
        ...block,
        items: block.items.filter((item) =>
          `${item.title} ${item.subtitle ?? ""} ${item.group ?? ""}`.toLowerCase().includes(query),
        ),
      };
    if (block.type === "project")
      return {
        ...block,
        tasks: block.tasks.filter((item) => `${item.text} ${item.assignee ?? ""}`.toLowerCase().includes(query)),
      };
    return block;
  };
  return (
    <Switch fallback={<DashboardWidgetContent {...props} block={filtered()} detailed />}>
      <Match when={props.block.type === "checklist" && props.block} keyed>
        {(block) => <ChecklistDetail {...props} block={block} />}
      </Match>
      <Match when={props.block.type === "rich" && props.block} keyed>
        {(block) => <RecipeDetail {...props} block={block} />}
      </Match>
      <Match when={props.block.type === "table" && props.block} keyed>
        {(block) => <TableDetail {...props} block={block} />}
      </Match>
      <Match when={props.block.type === "week" && props.block} keyed>
        {(block) => <WeekDetail {...props} block={block} />}
      </Match>
      <Match when={props.block.type === "project" && props.block} keyed>
        {(block) => <ProjectDetail {...props} block={block} />}
      </Match>
      <Match when={props.block.type === "news" && props.block} keyed>
        {(block) => <NewsDetail {...props} block={block} />}
      </Match>
    </Switch>
  );
}

function ChecklistDetail(props: DetailProps & { block: Checklist }) {
  const { t, format } = useText();
  const [state, setState] = createStore({
    text: "",
    quantity: "",
    unit: "",
    category: "",
    saving: false,
    failed: false,
  });
  const matches = (item: DashboardChecklistItem) =>
    `${item.text} ${item.category ?? ""}`.toLowerCase().includes(props.query.trim().toLowerCase());
  const pending = () => props.block.items.filter((item) => !item.checked && matches(item));
  const completed = () => props.block.items.filter((item) => item.checked && matches(item));
  const categories = () => {
    const found = [...new Set(pending().map((item) => item.category ?? ""))];
    const ordered = props.block.groupsOrder ?? [];
    return found.sort((a, b) => {
      const ai = ordered.indexOf(a);
      const bi = ordered.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? ordered.length : ai) - (bi < 0 ? ordered.length : bi);
      return a.localeCompare(b);
    });
  };
  const rows = (items: DashboardChecklistItem[]) => (
    <ul class="dashboard-detail-checklist">
      <For each={[...items].sort((a, b) => (props.filters.sort === "name" ? a.text.localeCompare(b.text) : 0))}>
        {(item) => (
          <li data-checked={item.checked ? "true" : undefined}>
            <label for={`dashboard-detail-check-${props.dashboard.id}-${props.block.id}-${item.id}`}>
              <Checkbox
                id={`dashboard-detail-check-${props.dashboard.id}-${props.block.id}-${item.id}`}
                checked={item.checked}
                disabled={props.busy || state.saving}
                onChange={(event) =>
                  props.onToggleChecklist(props.dashboard, props.block.id, item.id, event.currentTarget.checked)
                }
              />
              <span class="dashboard-detail-checklist-text">{item.text}</span>
              <small>
                <Show when={item.quantity !== undefined}>
                  {format.number(item.quantity ?? 0)} {item.unit}
                </Show>
                <Show when={item.meta}> · {item.meta}</Show>
                <Show when={item.source}>
                  {" "}
                  · {item.source === "recipe" ? t("app.dashboards.detail.recipe") : t("app.dashboards.detail.chat")}
                </Show>
              </small>
            </label>
          </li>
        )}
      </For>
    </ul>
  );
  const add = async () => {
    if (!props.onEditWidget || !state.text.trim() || state.saving || props.busy) return;
    const quantity = state.quantity.trim() ? Number(state.quantity) : undefined;
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0)) return;
    const item: DashboardChecklistItem = {
      id: crypto.randomUUID(),
      text: state.text.trim(),
      checked: false,
      source: "chat",
      ...(quantity !== undefined ? { quantity } : {}),
      ...(state.unit.trim() ? { unit: state.unit.trim() } : {}),
      ...(state.category.trim() ? { category: state.category.trim() } : {}),
    };
    setState((draft) => {
      draft.saving = true;
      draft.failed = false;
    });
    try {
      const saved = await props.onEditWidget(props.dashboard, {
        type: "addChecklistItems",
        blockId: props.block.id,
        items: [item],
      });
      setState((draft) => {
        if (saved) {
          draft.text = "";
          draft.quantity = "";
          draft.unit = "";
          draft.category = "";
        }
        draft.failed = !saved;
      });
    } catch {
      setState((draft) => {
        draft.failed = true;
      });
    } finally {
      setState((draft) => {
        draft.saving = false;
      });
    }
  };
  return (
    <>
      <Show when={props.filters.status !== "completed"}>
        <Show when={props.filters.sort === "category"} fallback={rows(pending())}>
          <For each={categories()}>
            {(category) => (
              <section class="dashboard-detail-group">
                <h3>
                  {category || t("app.dashboards.detail.uncategorized")}
                  <span>{format.number(pending().filter((item) => (item.category ?? "") === category).length)}</span>
                </h3>
                {rows(pending().filter((item) => (item.category ?? "") === category))}
              </section>
            )}
          </For>
        </Show>
      </Show>
      <Show when={completed().length && props.filters.status !== "pending"}>
        <section class="dashboard-detail-group">
          <h3>
            {t("app.dashboards.detail.completed")}
            <span>{format.number(completed().length)}</span>
          </h3>
          {rows(completed())}
        </section>
      </Show>
      <Show when={!pending().length && !completed().length}>
        <Text tone="muted">{t("app.dashboards.detail.emptySearch")}</Text>
      </Show>
      <Show when={props.block.allowAdd !== false && props.onEditWidget}>
        <form
          class="dashboard-detail-add"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            required
            maxlength={2000}
            value={state.text}
            placeholder={t("app.dashboards.detail.itemName")}
            aria-label={t("app.dashboards.detail.itemName")}
            onValueChange={(value) =>
              setState((draft) => {
                draft.text = value;
              })
            }
          />
          <Input
            type="number"
            min="0"
            step="any"
            value={state.quantity}
            placeholder={t("app.dashboards.detail.quantity")}
            aria-label={t("app.dashboards.detail.quantity")}
            onValueChange={(value) =>
              setState((draft) => {
                draft.quantity = value;
              })
            }
          />
          <Input
            maxlength={2000}
            value={state.unit}
            placeholder={t("app.dashboards.detail.unit")}
            aria-label={t("app.dashboards.detail.unit")}
            onValueChange={(value) =>
              setState((draft) => {
                draft.unit = value;
              })
            }
          />
          <Input
            maxlength={200}
            value={state.category}
            placeholder={t("app.dashboards.detail.category")}
            aria-label={t("app.dashboards.detail.category")}
            onValueChange={(value) =>
              setState((draft) => {
                draft.category = value;
              })
            }
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!state.text.trim() || state.saving || props.busy || props.block.items.length >= 200}
          >
            <Plus aria-hidden="true" />
            {t("app.dashboards.detail.add")}
          </Button>
        </form>
      </Show>
      <Show when={state.failed}>
        <Text role="alert">{t("app.dashboards.detail.requestFailed")}</Text>
      </Show>
    </>
  );
}

function RecipeDetail(props: DetailProps & { block: Rich }) {
  const { t, format } = useText();
  const [state, setState] = createStore({
    portions: untrack(() => props.block.portions ?? 1),
    saving: false,
    saved: false,
    failed: false,
  });
  const quantity = (amount: number) => (amount * state.portions) / (props.block.portions ?? 1);
  const target = () =>
    props.dashboard.blocks.find(
      (block): block is Checklist => block.type === "checklist" && block.id === props.block.targetChecklistId,
    );
  const addIngredients = async () => {
    const checklist = target();
    if (!checklist || !props.onEditWidget || state.saving || props.busy) return;
    if (checklist.items.length + (props.block.ingredients?.length ?? 0) > 200) return;
    setState((draft) => {
      draft.saving = true;
      draft.failed = false;
    });
    try {
      const saved = await props.onEditWidget(props.dashboard, {
        type: "addRecipeIngredients",
        recipeBlockId: props.block.id,
        portions: state.portions,
      });
      setState((draft) => {
        draft.saved = saved;
        draft.failed = !saved;
      });
    } catch {
      setState((draft) => {
        draft.failed = true;
      });
    } finally {
      setState((draft) => {
        draft.saving = false;
      });
    }
  };
  return (
    <>
      <div class="dashboard-detail-recipe-hero">
        <span class="dashboard-detail-recipe-art">
          <ChefHat aria-hidden="true" />
        </span>
        <div class="dashboard-detail-recipe-copy">
          <Heading as="h3" size="lg" class="dashboard-detail-content-title">
            {props.block.heading ?? props.block.title}
          </Heading>
          <Show when={props.block.meta}>
            <Text as="p" variant="caption" tone="muted">
              {props.block.meta}
            </Text>
          </Show>
          <Show when={props.block.ingredients?.length}>
            <div class="dashboard-detail-portions">
              <span class="dashboard-detail-portions-label">{t("app.dashboards.detail.portions")}</span>
              <IconButton
                label={t("app.dashboards.detail.previous")}
                variant="outline"
                disabled={state.portions <= 1}
                onClick={() =>
                  setState((draft) => {
                    draft.portions -= 1;
                    draft.saved = false;
                  })
                }
              >
                <Minus />
              </IconButton>
              <output>{format.number(state.portions)}</output>
              <IconButton
                label={t("app.dashboards.detail.next")}
                variant="outline"
                disabled={state.portions >= 100}
                onClick={() =>
                  setState((draft) => {
                    draft.portions += 1;
                    draft.saved = false;
                  })
                }
              >
                <Plus />
              </IconButton>
            </div>
          </Show>
        </div>
      </div>
      <div class="dashboard-detail-recipe-columns">
        <Show when={props.block.ingredients?.length}>
          <section class="dashboard-detail-group">
            <h3>
              {t("app.dashboards.detail.ingredients")}
              <span>{format.number(props.block.ingredients?.length ?? 0)}</span>
            </h3>
            <ul class="dashboard-detail-ingredients">
              <For
                each={props.block.ingredients?.filter((ingredient) =>
                  ingredient.label.toLowerCase().includes(props.query.trim().toLowerCase()),
                )}
              >
                {(ingredient) => (
                  <li>
                    <span>{ingredient.label}</span>
                    <span>
                      {format.number(quantity(ingredient.quantity), { maximumFractionDigits: 2 })} {ingredient.unit}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
        <section class="dashboard-detail-group">
          <h3>{t("app.dashboards.detail.steps")}</h3>
          <ol class="dashboard-detail-steps">
            <For
              each={(props.block.steps ?? props.block.sections).filter((step) =>
                step.text.toLowerCase().includes(props.query.trim().toLowerCase()),
              )}
            >
              {(step) => (
                <li>
                  <span class="dashboard-detail-step-index">
                    {format.number(step.index, { minimumIntegerDigits: 2 })}
                  </span>
                  <p>{step.text}</p>
                </li>
              )}
            </For>
          </ol>
        </section>
      </div>
      <div class="dashboard-detail-controls">
        <Show when={target() && props.onEditWidget && props.block.ingredients?.length}>
          <Button
            variant="outline"
            disabled={
              state.saving ||
              state.saved ||
              props.busy ||
              (target()?.items.length ?? 0) + (props.block.ingredients?.length ?? 0) > 200
            }
            onClick={() => {
              void addIngredients();
            }}
          >
            <Plus aria-hidden="true" />
            {state.saved ? t("app.dashboards.detail.saved") : t("app.dashboards.detail.shoppingList")}
          </Button>
        </Show>
        <Button variant="outline" onClick={() => props.onOpenConversation(props.dashboard.agentId)}>
          {t("app.dashboards.detail.editChat")}
        </Button>
      </div>
      <Show when={state.failed}>
        <Text role="alert">{t("app.dashboards.detail.requestFailed")}</Text>
      </Show>
    </>
  );
}

function TableDetail(props: DetailProps & { block: Table }) {
  const { t, format } = useText();
  const [state, setState] = createStore({ column: -1, descending: false, page: 0 });
  const pageSize = 20;
  const rows = () => {
    const query = props.query.trim().toLowerCase();
    const found = props.block.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(query)));
    const column = state.column;
    if (column >= 0)
      found.sort((a, b) => {
        const left = a[column] ?? "";
        const right = b[column] ?? "";
        return (
          (Number.isFinite(Number(left)) && Number.isFinite(Number(right))
            ? Number(left) - Number(right)
            : left.localeCompare(right)) * (state.descending ? -1 : 1)
        );
      });
    return found;
  };
  const pages = () => Math.max(1, Math.ceil(rows().length / pageSize));
  const page = () => Math.min(state.page, pages() - 1);
  return (
    <>
      <section class="dashboard-table-scroll" tabindex={0} aria-label={props.block.title}>
        <table class="dashboard-table">
          <thead>
            <tr>
              <For each={props.block.columns}>
                {(column, index) => (
                  <th
                    scope="col"
                    aria-sort={state.column === index() ? (state.descending ? "descending" : "ascending") : "none"}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setState((draft) => {
                          draft.descending = draft.column === index() ? !draft.descending : false;
                          draft.column = index();
                          draft.page = 0;
                        })
                      }
                    >
                      {column}
                    </Button>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={rows().slice(page() * pageSize, (page() + 1) * pageSize)}>
              {(row) => (
                <tr>
                  <For each={row}>{(cell) => <td>{cell}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
      <div class="dashboard-detail-pagination">
        <Text tone="muted">
          {t("app.dashboards.detail.page", { page: format.number(page() + 1), total: format.number(pages()) })}
        </Text>
        <IconButton
          label={t("app.dashboards.detail.previous")}
          variant="outline"
          disabled={page() === 0}
          onClick={() =>
            setState((draft) => {
              draft.page = page() - 1;
            })
          }
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          label={t("app.dashboards.detail.next")}
          variant="outline"
          disabled={page() + 1 >= pages()}
          onClick={() =>
            setState((draft) => {
              draft.page = page() + 1;
            })
          }
        >
          <ChevronRight />
        </IconButton>
      </div>
    </>
  );
}

function WeekDetail(props: DetailProps & { block: Week }) {
  const { t, format } = useText();
  const [state, setState] = createStore({
    mode: untrack(() => props.block.range?.mode ?? "week"),
    weekIndex: 0,
  });
  const days = () =>
    state.mode === "month" ? props.block.days : props.block.days.slice(state.weekIndex * 7, (state.weekIndex + 1) * 7);
  const events = (day: Week["days"][number]) =>
    day.events.filter((event) =>
      `${event.title} ${event.detail ?? ""}`.toLowerCase().includes(props.query.trim().toLowerCase()),
    );
  return (
    <>
      <Show when={props.block.range}>
        {(range) => (
          <Text as="p" tone="muted">
            {format.date(new Date(range().start), { dateStyle: "medium" })} –{" "}
            {format.date(new Date(range().end), { dateStyle: "medium" })}
          </Text>
        )}
      </Show>
      <Show when={props.block.days.length > 7}>
        <div class="dashboard-detail-controls">
          <Button
            size="sm"
            variant={state.mode === "week" ? "secondary" : "ghost"}
            onClick={() =>
              setState((draft) => {
                draft.mode = "week";
              })
            }
          >
            {t("app.dashboards.detail.week")}
          </Button>
          <Button
            size="sm"
            variant={state.mode === "month" ? "secondary" : "ghost"}
            onClick={() =>
              setState((draft) => {
                draft.mode = "month";
              })
            }
          >
            {t("app.dashboards.detail.month")}
          </Button>
          <Show when={state.mode === "week"}>
            <IconButton
              label={t("app.dashboards.detail.previous")}
              variant="outline"
              disabled={state.weekIndex <= 0}
              onClick={() =>
                setState((draft) => {
                  draft.weekIndex -= 1;
                })
              }
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              label={t("app.dashboards.detail.next")}
              variant="outline"
              disabled={(state.weekIndex + 1) * 7 >= props.block.days.length}
              onClick={() =>
                setState((draft) => {
                  draft.weekIndex += 1;
                })
              }
            >
              <ChevronRight />
            </IconButton>
          </Show>
        </div>
      </Show>
      <div class="dashboard-detail-week" data-mode={state.mode}>
        <For each={days()}>
          {(day) => (
            <section data-today={day.today ? "true" : undefined}>
              <h3>
                {day.weekday}
                <span class="dashboard-detail-week-date">
                  {format.date(new Date(day.date), { day: "numeric", timeZone: "UTC" })}
                </span>
              </h3>
              <For each={events(day)}>
                {(event) => (
                  <Button
                    variant={event.id === props.selectedEventId ? "secondary" : "ghost"}
                    class="dashboard-detail-event"
                    data-selected={event.id === props.selectedEventId ? "true" : undefined}
                    onClick={() => props.onSelectEvent(event.id)}
                  >
                    <time>{event.time}</time>
                    <strong>{event.title}</strong>
                  </Button>
                )}
              </For>
            </section>
          )}
        </For>
      </div>
    </>
  );
}

const PROJECT_STATUS_LABELS = {
  todo: "app.dashboards.detail.todo",
  doing: "app.dashboards.detail.doing",
  waiting: "app.dashboards.detail.waiting",
  done: "app.dashboards.detail.completed",
} as const satisfies Record<string, AppTextKey>;

function ProjectDetail(props: DetailProps & { block: Project }) {
  const { t, format } = useText();
  const status = (item: DashboardChecklistItem) => item.status ?? (item.checked ? "done" : "todo");
  const tasks = (group: string) =>
    props.block.tasks.filter(
      (item) =>
        status(item) === group &&
        `${item.text} ${item.assignee ?? ""}`.toLowerCase().includes(props.query.trim().toLowerCase()),
    );
  const openLink = (value: string) => {
    const url = safeBrowserUrl(value);
    if (url) props.onOpenLink?.(url);
  };
  return (
    <>
      <div class="dashboard-detail-project-heading">
        <div>
          <Heading as="h3" size="lg" class="dashboard-detail-content-title">
            {props.block.title}
          </Heading>
          <Show when={props.block.ref}>
            <Text variant="caption" tone="muted">
              {props.block.ref}
            </Text>
          </Show>
        </div>
        <div class="dashboard-widget-progress-row dashboard-detail-project-progress">
          <Progress value={props.block.progress} aria-label={props.block.title} class="dashboard-widget-progress" />
          <span>{format.number(props.block.progress)}%</span>
        </div>
      </div>
      <div class="dashboard-detail-project-columns">
        <div>
          <For each={["todo", "doing", "waiting", "done"] as const}>
            {(group) => (
              <Show when={(props.filters.status === "all" || props.filters.status === group) && tasks(group).length}>
                <section class="dashboard-detail-group">
                  <h3>
                    {t(PROJECT_STATUS_LABELS[group])}
                    <span>{format.number(tasks(group).length)}</span>
                  </h3>
                  <ul class="dashboard-detail-checklist">
                    <For each={tasks(group)}>
                      {(item) => (
                        <li data-checked={item.checked ? "true" : undefined}>
                          <label for={`dashboard-detail-check-${props.dashboard.id}-${props.block.id}-${item.id}`}>
                            <Checkbox
                              id={`dashboard-detail-check-${props.dashboard.id}-${props.block.id}-${item.id}`}
                              checked={item.checked}
                              disabled={props.busy}
                              onChange={(event) =>
                                props.onToggleChecklist(
                                  props.dashboard,
                                  props.block.id,
                                  item.id,
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            <span class="dashboard-detail-checklist-text">{item.text}</span>
                            <small>{item.assignee}</small>
                          </label>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
            )}
          </For>
        </div>
        <div class="dashboard-detail-project-aside">
          <Show when={props.block.activity?.length}>
            <section class="dashboard-detail-group">
              <h3>{t("app.dashboards.detail.activity")}</h3>
              <ol class="dashboard-widget-detail-history">
                <For each={props.block.activity}>
                  {(item) => (
                    <li>
                      <div>
                        <strong>{item.agent}</strong>
                        <p>{item.text}</p>
                      </div>
                      <time datetime={item.at}>
                        {format.date(new Date(item.at), { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          </Show>
          <Show when={props.onOpenLink && (props.block.links?.length || props.block.repoUrl)}>
            <section class="dashboard-detail-group">
              <h3>{t("app.dashboards.detail.links")}</h3>
              <Show when={props.block.repoUrl}>
                <Button variant="link" onClick={() => openLink(props.block.repoUrl ?? "")}>
                  {props.block.ref ?? props.block.repoUrl}
                </Button>
              </Show>
              <For each={props.block.links}>
                {(link) => (
                  <Button variant="link" onClick={() => openLink(link.url)}>
                    {link.label}
                  </Button>
                )}
              </For>
            </section>
          </Show>
        </div>
      </div>
    </>
  );
}

function NewsDetail(props: DetailProps & { block: News }) {
  const { t, format } = useText();
  const items = () =>
    props.block.items.filter(
      (item) =>
        (!props.filters.category || item.category === props.filters.category) &&
        `${item.headline} ${item.summaryFull ?? item.summary} ${item.source}`
          .toLowerCase()
          .includes(props.query.trim().toLowerCase()),
    );
  const openLink = (value: string) => {
    const url = safeBrowserUrl(value);
    if (url) props.onOpenLink?.(url);
  };
  const host = (value: string) => {
    const url = safeBrowserUrl(value);
    return url ? new URL(url).hostname : "";
  };
  return (
    <ul class="dashboard-detail-news">
      <For
        each={items()}
        fallback={
          <li>
            <Text as="p" tone="muted">
              {t("app.dashboards.detail.emptySearch")}
            </Text>
          </li>
        }
      >
        {(item) => (
          <li>
            <div class="dashboard-widget-eyebrow">
              <span>{item.category}</span>
              <span class="dashboard-widget-news-source">
                {item.source}
                <Show when={item.publishedAt}>
                  {(at) => (
                    <>
                      {" "}
                      · <time datetime={at()}>{format.date(new Date(at()), { timeStyle: "short" })}</time>
                    </>
                  )}
                </Show>
              </span>
            </div>
            <Heading as="h3" size="sm">
              {item.headline}
            </Heading>
            <p>{item.summaryFull ?? item.summary}</p>
            <Show when={props.onOpenLink && safeBrowserUrl(item.url)}>
              <div class="dashboard-detail-source-link">
                <Button variant="link" onClick={() => openLink(item.url)}>
                  <LinkIcon aria-hidden="true" />
                  {item.source}
                </Button>
                <small>{host(item.url)}</small>
              </div>
            </Show>
            <For each={item.sources}>
              {(source) => (
                <Show when={props.onOpenLink && safeBrowserUrl(source.url)}>
                  <div class="dashboard-detail-source-link">
                    <Button variant="link" onClick={() => openLink(source.url)}>
                      <LinkIcon aria-hidden="true" />
                      {source.label}
                    </Button>
                    <small>{host(source.url)}</small>
                  </div>
                </Show>
              )}
            </For>
          </li>
        )}
      </For>
    </ul>
  );
}
