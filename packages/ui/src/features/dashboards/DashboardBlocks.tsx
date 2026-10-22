import type {
  AgentSummary,
  DashboardAction,
  DashboardBlock,
  DashboardDocument,
  DashboardReport,
} from "@openbot/contracts/ipc";
import { ArrowRight, Button, DropdownMenu, Ellipsis, Maximize2, Sparkles, Text } from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { For, Show } from "solid-js";
import { AgentAvatar } from "../agents/AgentAvatar";
import {
  DashboardWidgetContent,
  DashboardWidgetIcon,
  dashboardWidgetItemCount,
  dashboardWidgetVisibleCount,
} from "./DashboardWidgetContent";

export interface DashboardBlocksProps {
  dashboard: DashboardDocument;
  reports?: Readonly<Record<string, DashboardReport>> | undefined;
  busy?: boolean | undefined;
  agent?: Pick<AgentSummary, "name" | "avatarSeed" | "avatarHue" | "avatarUrl"> | undefined;
  onToggleChecklist: (dashboard: DashboardDocument, blockId: string, itemId: string, checked: boolean) => void;
  onOpenConversation: (agentId: string, messageId?: string) => void;
  onOpenLink?: ((url: string) => void) | undefined;
  onOpenWidget?: ((block: DashboardBlock) => void) | undefined;
  onAction?: ((action: DashboardAction) => void) | undefined;
  onRequestUpdate?: (() => void) | undefined;
}

function defaultWidgetSize(block: DashboardBlock) {
  if (block.type === "stat" || block.type === "metric" || block.type === "progress") return "S";
  if (block.type === "week" || block.type === "stat-group") return "FULL";
  if (block.type === "table" || block.type === "report") return "L";
  return "M";
}
function defaultWidgetTone(block: DashboardBlock) {
  if (block.type === "weather") return "sky";
  if (block.type === "rich") return "lavender";
  if (block.type === "callout") return "mustard";
  return "surface";
}

export function DashboardBlocks(props: DashboardBlocksProps) {
  const { t, format } = useText();
  return (
    <div class="dashboard-blocks dashboard-widget-grid">
      <For
        each={props.dashboard.blocks}
        fallback={
          <Text as="p" tone="muted">
            {t("app.dashboards.emptyBlocks")}
          </Text>
        }
      >
        {(block) => (
          <section
            class={[
              "dashboard-widget",
              `dashboard-widget-tone-${block.presentation?.tone ?? defaultWidgetTone(block)}`,
            ]}
            data-block-type={block.type}
            data-size={block.presentation?.size ?? defaultWidgetSize(block)}
            data-tone={block.presentation?.tone ?? defaultWidgetTone(block)}
            data-state={block.presentation?.state ?? "ready"}
            aria-labelledby={`dashboard-widget-title-${block.id}`}
          >
            <Show when={props.onOpenWidget}>
              <Button
                type="button"
                variant="ghost"
                class="dashboard-widget-open"
                aria-label={t("app.dashboards.widget.openDetail", { title: block.title })}
                onClick={() => props.onOpenWidget?.(block)}
              />
            </Show>
            <header class="dashboard-widget-header">
              <DashboardWidgetIcon block={block} />
              <h2 id={`dashboard-widget-title-${block.id}`}>{block.title}</h2>
              <Show when={block.presentation?.badge}>
                <span class="dashboard-widget-badge">{block.presentation?.badge}</span>
              </Show>
              <div class="dashboard-widget-header-actions">
                <Show when={props.onOpenWidget}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="dashboard-widget-expand"
                    aria-label={t("app.dashboards.widget.openDetail", { title: block.title })}
                    onClick={() => props.onOpenWidget?.(block)}
                  >
                    <Maximize2 aria-hidden="true" />
                  </Button>
                </Show>
                <DropdownMenu.Root placement="bottom-end">
                  <DropdownMenu.Trigger
                    as={Button}
                    variant="ghost"
                    size="icon-sm"
                    class="dashboard-widget-menu"
                    aria-label={t("app.dashboards.widget.menu")}
                  >
                    <Ellipsis aria-hidden="true" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="ui-action-menu">
                      <Show when={props.onOpenWidget}>
                        <DropdownMenu.Item onSelectAfterClose={() => props.onOpenWidget?.(block)}>
                          <Maximize2 aria-hidden="true" />
                          {t("app.dashboards.showDetails")}
                        </DropdownMenu.Item>
                      </Show>
                      <DropdownMenu.Item onSelectAfterClose={() => props.onOpenConversation(props.dashboard.agentId)}>
                        {t("app.dashboards.openChat")}
                      </DropdownMenu.Item>
                      <Show when={props.onRequestUpdate}>
                        <DropdownMenu.Item disabled={props.busy} onSelectAfterClose={() => props.onRequestUpdate?.()}>
                          <Sparkles aria-hidden="true" />
                          {t("app.dashboards.askUpdate")}
                        </DropdownMenu.Item>
                      </Show>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </header>
            <DashboardWidgetContent
              dashboard={props.dashboard}
              block={block}
              reports={props.reports}
              busy={props.busy}
              onToggleChecklist={props.onToggleChecklist}
              onOpenConversation={props.onOpenConversation}
              onOpenLink={props.onOpenLink}
              onAction={props.onAction}
              onRequestUpdate={props.onRequestUpdate}
            />
            <Show when={props.onOpenWidget && dashboardWidgetItemCount(block) > dashboardWidgetVisibleCount(block)}>
              <Button
                type="button"
                variant="link"
                size="sm"
                class="dashboard-widget-show-all"
                onClick={() => props.onOpenWidget?.(block)}
              >
                {t("app.dashboards.widget.showAll", { count: dashboardWidgetItemCount(block) })}
                <ArrowRight aria-hidden="true" />
              </Button>
            </Show>
            <footer class="dashboard-widget-footer">
              <AgentAvatar
                agent={props.agent}
                seed={props.dashboard.agentId}
                motion="idle"
                class="dashboard-widget-source-avatar"
              />
              <span>
                {block.footer?.agent ?? props.agent?.name ?? props.dashboard.agentId}
                <Show when={block.footer?.source}> · {block.footer?.source}</Show>
              </span>
              <time datetime={block.footer?.updatedAt ?? props.dashboard.updatedAt}>
                {t("app.dashboards.widget.updated", {
                  time: format.date(new Date(block.footer?.updatedAt ?? props.dashboard.updatedAt), {
                    hour: "numeric",
                    minute: "2-digit",
                  }),
                })}
              </time>
            </footer>
          </section>
        )}
      </For>
    </div>
  );
}
