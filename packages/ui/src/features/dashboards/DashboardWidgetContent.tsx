import type {
  DashboardAction,
  DashboardBlock,
  DashboardChecklistItem,
  DashboardDocument,
  DashboardReport,
  DashboardStatItem,
} from "@openbot/contracts/ipc";
import {
  Activity,
  Button,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartLine,
  ChartPie,
  Checkbox,
  ChefHat,
  CloudSun,
  FileText,
  FolderGit2,
  Gauge,
  Image as ImageIcon,
  Inbox,
  List,
  ListChecks,
  MessageSquare,
  Newspaper,
  Play,
  Progress,
  Sparkles,
  Table2,
  Text,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Zap,
} from "@openbot/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "@openbot/ui/chart";
import { useText } from "@openbot/ui/text";
import { For, Match, Show, Switch } from "solid-js";
import { AgentAvatar } from "../agents/AgentAvatar";
import { MarkdownMessageText } from "../conversation/MarkdownMessageText";
import { safeBrowserUrl } from "../conversation/RichMessageText";
import "./dashboard-widgets.css";

export interface DashboardWidgetContentProps {
  dashboard: DashboardDocument;
  block: DashboardBlock;
  reports?: Readonly<Record<string, DashboardReport>> | undefined;
  busy?: boolean | undefined;
  detailed?: boolean | undefined;
  onToggleChecklist: (dashboard: DashboardDocument, blockId: string, itemId: string, checked: boolean) => void;
  onOpenConversation: (agentId: string, messageId?: string) => void;
  onOpenLink?: ((url: string) => void) | undefined;
  onAction?: ((action: DashboardAction) => void) | undefined;
  onRequestUpdate?: (() => void) | undefined;
}

function WidgetGlyph(props: { name?: string | undefined }) {
  return (
    <Switch fallback={<Sparkles aria-hidden="true" />}>
      <Match when={props.name === "chef-hat"}>
        <ChefHat aria-hidden="true" />
      </Match>
      <Match when={props.name === "activity"}>
        <Activity aria-hidden="true" />
      </Match>
      <Match when={props.name === "folder-git-2"}>
        <FolderGit2 aria-hidden="true" />
      </Match>
      <Match when={props.name === "calendar" || props.name === "calendar-days"}>
        <CalendarDays aria-hidden="true" />
      </Match>
      <Match when={props.name === "list-checks"}>
        <ListChecks aria-hidden="true" />
      </Match>
      <Match when={props.name === "newspaper"}>
        <Newspaper aria-hidden="true" />
      </Match>
      <Match when={props.name === "image"}>
        <ImageIcon aria-hidden="true" />
      </Match>
    </Switch>
  );
}

export function DashboardWidgetIcon(props: { block: DashboardBlock }) {
  return (
    <Switch fallback={<Sparkles aria-hidden="true" />}>
      <Match when={props.block.type === "stat" || props.block.type === "metric"}>
        <Activity aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "stat-group"}>
        <Gauge aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "text" || props.block.type === "detail"}>
        <FileText aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "list"}>
        <List aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "news" || props.block.type === "report"}>
        <Newspaper aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "checklist"}>
        <ListChecks aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "progress"}>
        <Gauge aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "project"}>
        <FolderGit2 aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "timeline" || props.block.type === "calendar"}>
        <CalendarClock aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "week"}>
        <CalendarDays aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "weather"}>
        <CloudSun aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "rich"}>
        <ChefHat aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "table"}>
        <Table2 aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "chart" && props.block.chartType === "line"}>
        <ChartLine aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "chart" && props.block.chartType === "bar"}>
        <ChartColumn aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "chart"}>
        <ChartPie aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "media"}>
        <ImageIcon aria-hidden="true" />
      </Match>
      <Match when={props.block.type === "actions"}>
        <Zap aria-hidden="true" />
      </Match>
    </Switch>
  );
}

export function dashboardWidgetItemCount(block: DashboardBlock): number {
  switch (block.type) {
    case "list":
      return block.total ?? block.items.length;
    case "news":
    case "checklist":
      return block.items.length;
    case "project":
      return block.tasks.length;
    case "timeline":
      return block.events.length;
    case "calendar":
      return block.entries.length;
    case "table":
      return block.rows.length;
    case "rich":
      return block.sections.length;
    default:
      return 0;
  }
}
export function dashboardWidgetVisibleCount(block: DashboardBlock): number {
  return block.presentation?.visibleCount ?? (block.type === "checklist" || block.type === "table" ? 5 : 3);
}

function WidgetStat(props: { item: DashboardStatItem }) {
  return (
    <div class="dashboard-widget-stat">
      <span class="dashboard-widget-eyebrow">{props.item.label}</span>
      <div class="dashboard-widget-value-row">
        <strong class="dashboard-widget-value">
          {props.item.value}
          <Show when={props.item.unit}>
            <small>{props.item.unit}</small>
          </Show>
        </strong>
        <Show when={props.item.trend}>
          {(trend) => (
            <span class="dashboard-widget-trend" data-direction={trend().direction}>
              <Show when={trend().direction !== "flat"}>
                <Show when={trend().direction === "up"} fallback={<TrendingDown aria-hidden="true" />}>
                  <TrendingUp aria-hidden="true" />
                </Show>
              </Show>
              {trend().value}
            </span>
          )}
        </Show>
      </div>
      <Show when={props.item.caption}>
        <p class="dashboard-widget-caption">{props.item.caption}</p>
      </Show>
    </div>
  );
}

function WidgetChart(props: { block: Extract<DashboardBlock, { type: "chart" }>; detailed?: boolean | undefined }) {
  const { format } = useText();
  const total = () => props.block.points.reduce((sum, point) => sum + Math.max(0, point.value), 0);
  const colours = [
    "var(--openbot-accent)",
    "var(--openbot-dashboard-tone-lavender)",
    "var(--openbot-dashboard-tone-mustard)",
    "var(--openbot-dashboard-tone-green)",
    "var(--openbot-dashboard-tone-sky)",
  ];
  const colour = (index: number) => colours[index % colours.length] ?? "var(--openbot-accent)";
  const stops = () => {
    let offset = 0;
    return props.block.points
      .map((point, index) => {
        const start = offset;
        offset += total() > 0 ? (Math.max(0, point.value) / total()) * 100 : 0;
        return `${colour(index)} ${start}% ${offset}%`;
      })
      .join(", ");
  };
  const seriesData = () => {
    const rows = new Map<string, Record<string, string | number>>();
    for (const [index, series] of (props.block.series ?? []).entries()) {
      for (const point of series.points) {
        const row = rows.get(point.x) ?? { label: point.x };
        row[`series${index}`] = point.y;
        rows.set(point.x, row);
      }
    }
    return [...rows.values()];
  };
  const tooltip = () => (
    <ChartTooltip
      content={(content) => <ChartTooltipContent {...content} formatValue={(value) => format.number(value)} />}
    />
  );
  return (
    <>
      <Show when={props.detailed && props.block.series?.length}>
        <ChartContainer label={props.block.title}>
          <LineChart data={seriesData()}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(value) => format.number(Number(value))} />
            {tooltip()}
            <For each={props.block.series}>
              {(series, index) => (
                <Line
                  name={series.label}
                  type="linear"
                  dataKey={`series${index()}`}
                  stroke={colour(index())}
                  dot={false}
                />
              )}
            </For>
          </LineChart>
        </ChartContainer>
        <div class="dashboard-widget-series-labels">
          <For each={props.block.series}>
            {(series, index) => (
              <span>
                <i style={{ background: colour(index()) }} />
                {series.label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={!(props.detailed && props.block.series?.length)}>
        <Show
          when={props.block.chartType === "donut"}
          fallback={
            <ChartContainer label={props.block.title}>
              <Show
                when={props.block.chartType === "line"}
                fallback={
                  <BarChart
                    data={props.block.points.map((point) => ({
                      ...point,
                      fill:
                        point.label === props.block.highlight
                          ? "var(--openbot-dashboard-tone-lavender)"
                          : "var(--openbot-accent)",
                    }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis hide={!props.detailed} tickFormatter={(value) => format.number(Number(value))} />
                    {tooltip()}
                    <Bar dataKey="value" fill="var(--openbot-accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                }
              >
                <LineChart data={props.block.points}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis hide={!props.detailed} tickFormatter={(value) => format.number(Number(value))} />
                  {tooltip()}
                  <Line type="linear" dataKey="value" stroke="var(--openbot-accent)" dot={false} />
                </LineChart>
              </Show>
            </ChartContainer>
          }
        >
          <div class="dashboard-widget-donut-layout">
            <div
              class="dashboard-widget-donut"
              role="img"
              aria-label={props.block.title}
              style={{ background: total() > 0 ? `conic-gradient(${stops()})` : "var(--openbot-bg-control-active)" }}
            />
            <dl class="dashboard-widget-legend">
              <For each={props.block.points}>
                {(point, index) => (
                  <div>
                    <span class="dashboard-widget-legend-dot" style={{ background: colour(index()) }} />
                    <dt>{point.label}</dt>
                    <dd>
                      {format.number(total() > 0 ? (point.value / total()) * 100 : 0, { maximumFractionDigits: 1 })}%
                    </dd>
                  </div>
                )}
              </For>
            </dl>
          </div>
        </Show>
      </Show>
      <Show when={props.detailed && props.block.activePeriod}>
        <p class="dashboard-widget-caption">{props.block.activePeriod}</p>
      </Show>
      <Show when={props.detailed}>
        <dl class="dashboard-chart-values">
          <For each={props.block.points}>
            {(point) => (
              <div>
                <dt>{point.label}</dt>
                <dd>{format.number(point.value)}</dd>
              </div>
            )}
          </For>
        </dl>
        <Show when={props.block.valuesTable}>
          <section class="dashboard-table-scroll" tabindex={0} aria-label={props.block.title}>
            <table class="dashboard-table">
              <thead>
                <tr>
                  <For each={props.block.valuesTable?.columns}>{(column) => <th scope="col">{column}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={props.block.valuesTable?.rows}>
                  {(row) => (
                    <tr>
                      <For each={row}>{(cell) => <td>{cell}</td>}</For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
        </Show>
      </Show>
    </>
  );
}

const REPORT_STATUS = {
  idle: "app.dashboards.report.idle",
  pending: "app.dashboards.report.pending",
  running: "app.dashboards.report.running",
  completed: "app.dashboards.report.completed",
  failed: "app.dashboards.report.failed",
  unavailable: "app.dashboards.report.unavailable",
} as const;

export function DashboardWidgetContent(props: DashboardWidgetContentProps) {
  const { t, format } = useText();
  const limit = () => (props.detailed ? Number.POSITIVE_INFINITY : dashboardWidgetVisibleCount(props.block));
  const openUrl = (value: string) => {
    const url = safeBrowserUrl(value);
    if (url) props.onOpenLink?.(url);
  };
  const action = (value: DashboardAction) => {
    if (props.onAction) props.onAction(value);
    else if (value.target.type === "chat") props.onOpenConversation(props.dashboard.agentId);
    else if (value.target.type === "url") openUrl(value.target.url);
  };
  const actionButton = (value: DashboardAction) => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      class="dashboard-widget-action"
      disabled={props.busy || (value.target.type === "routine" && !props.onAction)}
      onClick={() => action(value)}
    >
      <Switch fallback={<Sparkles aria-hidden="true" />}>
        <Match when={value.target.type === "chat"}>
          <MessageSquare aria-hidden="true" />
        </Match>
        <Match when={value.target.type === "routine"}>
          <Play aria-hidden="true" />
        </Match>
      </Switch>
      {value.label}
    </Button>
  );
  const markdown = (body: string) => (
    <div class="message-text dashboard-prose">
      <MarkdownMessageText
        body={body}
        agents={[]}
        onSelectAgent={props.onOpenConversation}
        onOpenLink={openUrl}
        imagesAsLinks
        linkFavicons={false}
      />
    </div>
  );
  const checklist = (items: DashboardChecklistItem[], blockId: string) => (
    <ul class="dashboard-widget-checklist">
      <For each={items.slice(0, limit())}>
        {(item) => (
          <li data-checked={item.checked ? "true" : "false"}>
            <label
              for={`dashboard-check-${props.detailed ? "detail" : "card"}-${props.dashboard.id}-${blockId}-${item.id}`}
            >
              <Checkbox
                id={`dashboard-check-${props.detailed ? "detail" : "card"}-${props.dashboard.id}-${blockId}-${item.id}`}
                checked={item.checked}
                disabled={props.busy}
                onChange={(event) =>
                  props.onToggleChecklist(props.dashboard, blockId, item.id, event.currentTarget.checked)
                }
              />
              <span>{item.text}</span>
              <Show when={item.meta}>
                <small>{item.meta}</small>
              </Show>
            </label>
          </li>
        )}
      </For>
    </ul>
  );
  return (
    <div class="dashboard-widget-content" data-detailed={props.detailed ? "true" : "false"}>
      <Show when={props.block.presentation?.state === "loading"}>
        <div class="dashboard-widget-skeleton" role="status" aria-label={t("app.dashboards.widget.loading")}>
          <span />
          <span />
          <span />
          <span />
        </div>
      </Show>
      <Show when={props.block.presentation?.state === "empty"}>
        <div class="dashboard-widget-state">
          <Inbox aria-hidden="true" />
          <strong>{t("app.dashboards.widget.emptyTitle")}</strong>
          <p>{props.block.presentation?.message ?? t("app.dashboards.widget.emptyBody")}</p>
          <Show when={props.onRequestUpdate}>
            <Button type="button" variant="secondary" size="sm" disabled={props.busy} onClick={props.onRequestUpdate}>
              <Sparkles aria-hidden="true" />
              {t("app.dashboards.widget.generate")}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={props.block.presentation?.state === "error"}>
        <div class="dashboard-widget-state dashboard-widget-error" role="status">
          <TriangleAlert aria-hidden="true" />
          <strong>{t("app.dashboards.widget.errorTitle")}</strong>
          <p>{props.block.presentation?.message ?? t("app.dashboards.widget.errorBody")}</p>
          <Show when={props.onRequestUpdate}>
            <Button type="button" variant="secondary" size="sm" disabled={props.busy} onClick={props.onRequestUpdate}>
              {t("app.dashboards.widget.retry")}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={props.block.presentation?.state !== "loading" && props.block.presentation?.state !== "empty"}>
        <Switch>
          <Match when={props.block.type === "text" && props.block} keyed>
            {(block) => (
              <>
                <Show when={block.heading}>
                  <h3 class="dashboard-widget-heading">{block.heading}</h3>
                </Show>
                {markdown(props.detailed ? (block.bodyFull ?? block.text) : block.text)}
              </>
            )}
          </Match>
          <Match when={props.block.type === "metric" && props.block} keyed>
            {(block) => (
              <>
                <strong class="dashboard-widget-value">{block.value}</strong>
                <Show when={block.description}>
                  <p class="dashboard-widget-caption">{block.description}</p>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "stat" && props.block} keyed>
            {(block) => (
              <>
                <WidgetStat item={block} />
                <Show when={props.detailed}>
                  <Show when={block.target !== undefined}>
                    <p class="dashboard-widget-caption">
                      {t("app.dashboards.widget.target")}: {format.number(block.target ?? 0)}
                    </p>
                  </Show>
                  <Show when={block.history?.length}>
                    <section class="dashboard-table-scroll" tabindex={0} aria-label={block.title}>
                      <table class="dashboard-table">
                        <tbody>
                          <For each={block.history}>
                            {(entry) => (
                              <tr>
                                <th scope="row">
                                  {format.date(new Date(entry.at), { dateStyle: "medium", timeStyle: "short" })}
                                </th>
                                <td>{format.number(entry.value)}</td>
                                <td>{entry.delta}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </section>
                  </Show>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "stat-group" && props.block} keyed>
            {(block) => (
              <div class="dashboard-widget-stat-group">
                <For each={block.items}>{(item) => <WidgetStat item={item} />}</For>
              </div>
            )}
          </Match>
          <Match when={props.block.type === "list" && props.block} keyed>
            {(block) => (
              <ul class="dashboard-widget-list">
                <For each={block.items.slice(0, limit())}>
                  {(item, index) => (
                    <>
                      <Show when={props.detailed && item.group && block.items[index() - 1]?.group !== item.group}>
                        <li class="dashboard-widget-list-group">{item.group}</li>
                      </Show>
                      <li>
                        <Show when={item.lead}>
                          <Show
                            when={item.lead?.type === "agent"}
                            fallback={
                              <span class="dashboard-widget-list-glyph">
                                <WidgetGlyph name={item.lead?.value} />
                              </span>
                            }
                          >
                            <AgentAvatar
                              seed={item.lead?.value ?? item.id}
                              motion="idle"
                              class="dashboard-widget-list-avatar"
                            />
                          </Show>
                        </Show>
                        <div>
                          <strong>{item.title}</strong>
                          <Show when={item.subtitle}>
                            <p>{item.subtitle}</p>
                          </Show>
                          <Show when={props.detailed && item.action}>{(value) => actionButton(value())}</Show>
                        </div>
                        <Show when={item.meta}>
                          <small>{item.meta}</small>
                        </Show>
                      </li>
                    </>
                  )}
                </For>
              </ul>
            )}
          </Match>
          <Match when={props.block.type === "news" && props.block} keyed>
            {(block) => (
              <ul class="dashboard-widget-news">
                <For each={block.items.slice(0, limit())}>
                  {(item) => (
                    <li>
                      <div class="dashboard-widget-eyebrow">
                        <span>{item.category}</span>
                        <span class="dashboard-widget-news-source">{item.source}</span>
                      </div>
                      <Button
                        type="button"
                        variant="link"
                        class="dashboard-widget-news-headline"
                        disabled={!safeBrowserUrl(item.url) || !props.onOpenLink}
                        onClick={() => openUrl(item.url)}
                      >
                        {item.headline}
                      </Button>
                      <p>{props.detailed ? (item.summaryFull ?? item.summary) : item.summary}</p>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Match>
          <Match when={props.block.type === "checklist" && props.block} keyed>
            {(block) => checklist(block.items, block.id)}
          </Match>
          <Match when={props.block.type === "progress" && props.block} keyed>
            {(block) => (
              <>
                <div class="dashboard-widget-value-row">
                  <strong class="dashboard-widget-value">
                    {format.number(block.value)}
                    <small>{block.unit ?? "%"}</small>
                  </strong>
                  <span class="dashboard-widget-caption">{block.label}</span>
                </div>
                <Progress value={block.value} aria-label={block.label} class="dashboard-widget-progress" />
                <Show when={block.caption}>
                  <p class="dashboard-widget-caption">{block.caption}</p>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "project" && props.block} keyed>
            {(block) => (
              <>
                <h3 class="dashboard-widget-heading">{block.title}</h3>
                <Show when={block.ref}>
                  <span class="dashboard-widget-project-ref">{block.ref}</span>
                </Show>
                <div class="dashboard-widget-progress-row">
                  <Progress value={block.progress} aria-label={block.title} class="dashboard-widget-progress" />
                  <span>{format.number(block.progress)}%</span>
                </div>
                {checklist(block.tasks, block.id)}
              </>
            )}
          </Match>
          <Match when={props.block.type === "timeline" && props.block} keyed>
            {(block) => (
              <>
                <span class="dashboard-widget-eyebrow">{block.dateLabel}</span>
                <ol class="dashboard-widget-timeline">
                  <For each={block.events.slice(0, limit())}>
                    {(item) => (
                      <li>
                        <time>{item.time}</time>
                        <div>
                          <strong>{item.title}</strong>
                          <Show when={props.detailed && item.detail}>{markdown(item.detail ?? "")}</Show>
                          <Show when={props.detailed && item.location}>
                            <p>{item.location}</p>
                          </Show>
                        </div>
                        <Show when={item.agent}>
                          <AgentAvatar seed={item.agent} motion="idle" class="dashboard-widget-list-avatar" />
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
                <Show when={block.note}>
                  <p class="dashboard-widget-note">{block.note}</p>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "week" && props.block} keyed>
            {(block) => (
              <div class="dashboard-widget-week">
                <For each={block.days}>
                  {(day) => (
                    <section class="dashboard-widget-day" data-today={day.today ? "true" : "false"}>
                      <header>
                        <span>{day.weekday}</span>
                        <strong>{format.date(new Date(day.date), { day: "numeric", timeZone: "UTC" })}</strong>
                      </header>
                      <For each={day.events.slice(0, props.detailed ? undefined : 2)}>
                        {(event) => (
                          <div class="dashboard-widget-event" data-selected={event.selected ? "true" : "false"}>
                            <time>{event.time}</time>
                            <strong>{event.title}</strong>
                          </div>
                        )}
                      </For>
                    </section>
                  )}
                </For>
              </div>
            )}
          </Match>
          <Match when={props.block.type === "weather" && props.block} keyed>
            {(block) => (
              <>
                <div class="dashboard-widget-weather-now">
                  <CloudSun aria-hidden="true" />
                  <strong>{t("app.dashboards.widget.temperature", { value: format.number(block.temp) })}</strong>
                </div>
                <p class="dashboard-widget-weather-condition">
                  {block.condition} · {format.number(block.min)}–{format.number(block.max)}°
                </p>
                <div class="dashboard-widget-weather-hours">
                  <For each={block.hourly.slice(0, props.detailed ? undefined : 4)}>
                    {(hour) => (
                      <div>
                        <time>{hour.time}</time>
                        <strong>{format.number(hour.temp)}°</strong>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={props.detailed}>
                  <p class="dashboard-widget-caption">{block.location}</p>
                  <dl class="dashboard-detail-metrics">
                    <Show when={block.feelsLike !== undefined}>
                      <div>
                        <dt>{t("app.dashboards.widget.feelsLike")}</dt>
                        <dd>
                          {t("app.dashboards.widget.temperature", { value: format.number(block.feelsLike ?? 0) })}
                        </dd>
                      </div>
                    </Show>
                    <Show when={block.wind}>
                      <div>
                        <dt>{t("app.dashboards.widget.wind")}</dt>
                        <dd>{block.wind}</dd>
                      </div>
                    </Show>
                  </dl>
                  <div class="dashboard-widget-weather-hours">
                    <For each={block.daily}>
                      {(day) => (
                        <div>
                          <span>{day.day}</span>
                          <CloudSun aria-hidden="true" />
                          <span>{day.condition}</span>
                          <strong>
                            {format.number(day.min)}–{format.number(day.max)}°
                          </strong>
                          <Show when={day.precip !== undefined}>
                            <span>
                              {t("app.dashboards.widget.precipitation")}: {format.number(day.precip ?? 0)}%
                            </span>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "callout" && props.block} keyed>
            {(block) => (
              <>
                <span class="dashboard-widget-eyebrow">{block.eyebrow}</span>
                <h3 class="dashboard-widget-callout-headline">{block.headline}</h3>
                <Show when={block.body}>
                  {markdown(props.detailed ? (block.bodyFull ?? block.body ?? "") : (block.body ?? ""))}
                </Show>
                <Show when={block.action}>{(value) => actionButton(value())}</Show>
                <Show when={props.detailed}>
                  <For each={block.related}>
                    {(item) => (
                      <div class="dashboard-widget-related">
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                        <time>{item.at}</time>
                      </div>
                    )}
                  </For>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "rich" && props.block} keyed>
            {(block) => (
              <>
                <div class="dashboard-widget-rich-heading">
                  <span class="dashboard-widget-rich-icon">
                    <WidgetGlyph name={block.media?.icon ?? "chef-hat"} />
                  </span>
                  <div>
                    <h3 class="dashboard-widget-heading">{block.title}</h3>
                    <Show when={block.meta}>
                      <span class="dashboard-widget-eyebrow">{block.meta}</span>
                    </Show>
                  </div>
                </div>
                <ol class="dashboard-widget-steps">
                  <For each={block.sections.slice(0, limit())}>
                    {(section) => (
                      <li>
                        <span>{String(section.index).padStart(2, "0")}</span>
                        <p>{section.text}</p>
                      </li>
                    )}
                  </For>
                </ol>
                <Show when={block.action}>{(value) => actionButton(value())}</Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "table" && props.block} keyed>
            {(block) => (
              <section class="dashboard-table-scroll" tabindex={0} aria-label={block.title}>
                <table class="dashboard-table">
                  <thead>
                    <tr>
                      <For each={block.columns}>{(column) => <th scope="col">{column}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={block.rows.slice(0, limit())}>
                      {(row) => (
                        <tr>
                          <For each={row}>{(cell) => <td>{cell}</td>}</For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>
            )}
          </Match>
          <Match when={props.block.type === "chart" && props.block} keyed>
            {(block) => <WidgetChart block={block} detailed={props.detailed} />}
          </Match>
          <Match when={props.block.type === "calendar" && props.block} keyed>
            {(block) => (
              <ol class="dashboard-widget-timeline">
                <For each={block.entries.slice(0, limit())}>
                  {(event) => (
                    <li>
                      <time>{format.date(new Date(event.startsAt), { dateStyle: "medium", timeStyle: "short" })}</time>
                      <div>
                        <strong>{event.title}</strong>
                        <Show when={props.detailed && event.detail}>{markdown(event.detail ?? "")}</Show>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
            )}
          </Match>
          <Match when={props.block.type === "detail" && props.block} keyed>
            {(block) => (
              <>
                {markdown(block.content.text)}
                <dl class="dashboard-detail-metrics">
                  <For each={block.content.metrics}>
                    {(item) => (
                      <div>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    )}
                  </For>
                </dl>
                <ul>
                  <For each={block.content.items.slice(0, limit())}>{(item) => <li>{item}</li>}</For>
                </ul>
              </>
            )}
          </Match>
          <Match when={props.block.type === "media" && props.block} keyed>
            {(block) => (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  class="dashboard-widget-media"
                  aria-label={block.alt ?? t("app.dashboards.widget.openMedia")}
                  disabled={!safeBrowserUrl(block.imageUrl) || !props.onOpenLink}
                  onClick={() => openUrl(block.imageUrl)}
                >
                  <ImageIcon aria-hidden="true" />
                  <span>{t("app.dashboards.widget.openMedia")}</span>
                </Button>
                <Show when={block.caption}>
                  <p class="dashboard-widget-caption">{block.caption}</p>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "actions" && props.block} keyed>
            {(block) => (
              <>
                <h3 class="dashboard-widget-heading">{block.heading}</h3>
                <Show when={block.status}>
                  <span class="dashboard-widget-status" data-tone={block.status?.tone}>
                    {block.status?.label}
                  </span>
                </Show>
                <Show when={block.description}>
                  <p class="dashboard-widget-caption">{block.description}</p>
                </Show>
                <div class="dashboard-widget-buttons">
                  <For each={block.buttons}>{actionButton}</For>
                </div>
                <Show when={props.detailed}>
                  <Show when={block.schedule}>
                    <p class="dashboard-widget-caption">{block.schedule}</p>
                  </Show>
                  <ol class="dashboard-widget-steps">
                    <For each={block.steps}>
                      {(step, index) => (
                        <li>
                          <span>{index() + 1}</span>
                          <p>{step}</p>
                        </li>
                      )}
                    </For>
                  </ol>
                  <For each={block.runs}>
                    {(run) => (
                      <div class="dashboard-widget-related">
                        <time>{format.date(new Date(run.at), { dateStyle: "medium", timeStyle: "short" })}</time>
                        <strong>{run.status}</strong>
                      </div>
                    )}
                  </For>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.block.type === "report" && props.block} keyed>
            {(block) => {
              const report = () => props.reports?.[block.routineId];
              return (
                <Show
                  when={report()}
                  fallback={
                    <Text as="p" tone="muted" role="status">
                      {t("app.dashboards.loading")}
                    </Text>
                  }
                >
                  {(value) => (
                    <>
                      <Show when={value().status !== "completed" || !value().text}>
                        <Text as="p" variant="caption" tone="muted" role="status">
                          {t(REPORT_STATUS[value().available ? value().status : "unavailable"])}
                        </Text>
                      </Show>
                      <Show when={value().updatedAt}>
                        {(date) => (
                          <Text as="p" variant="caption" tone="muted">
                            {t("app.dashboards.reportDate", {
                              date: format.date(new Date(date()), { dateStyle: "medium", timeStyle: "short" }),
                            })}
                          </Text>
                        )}
                      </Show>
                      <Show when={value().available && value().text}>{(body) => markdown(body())}</Show>
                      <Show when={value().truncated}>
                        <Text as="p" variant="caption" tone="muted">
                          {t("app.dashboards.reportTruncated")}
                        </Text>
                      </Show>
                      <Show when={value().available && value().messageId}>
                        {(id) => (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => props.onOpenConversation(props.dashboard.agentId, id())}
                          >
                            {t("app.dashboards.source")}
                          </Button>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              );
            }}
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
