import { ArrowRight, Badge, Button, Check, ChevronLeft, Heading, LayoutDashboard, Plus, Text } from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { For, Show } from "solid-js";
import type { MarketplaceFeaturePlugin } from "./marketplace-model";
import type { MarketplaceScope } from "./marketplace-view";

function PluginMark(props: { large?: boolean }) {
  return (
    <span class="feature-plugin-mark" data-size={props.large ? "large" : "default"} aria-hidden="true">
      <LayoutDashboard />
    </span>
  );
}

function InstalledStatus() {
  const { t } = useText();
  return (
    <Badge variant="success-light" class="feature-plugin-installed">
      <Check aria-hidden="true" />
      {t("marketplace.feature.installed")}
    </Badge>
  );
}

function PluginActions(props: { scope: MarketplaceScope; plugin: MarketplaceFeaturePlugin; detail?: boolean }) {
  const { t } = useText();
  const model = () => props.scope.model;
  return (
    <div class="feature-plugin-actions">
      <Show
        when={props.plugin.installed}
        fallback={
          <Button
            type="button"
            variant={props.detail ? "default" : "outline"}
            size="sm"
            class="feature-plugin-action"
            disabled={!model().canManagePlugins?.()}
            loading={model().pluginBusy?.(props.plugin.id)}
            onClick={() => void model().setPluginInstalled?.(props.plugin.id, true)}
          >
            <Plus aria-hidden="true" />
            {t("marketplace.feature.install")}
          </Button>
        }
      >
        <InstalledStatus />
        <Show when={props.detail}>
          <Button
            type="button"
            size="sm"
            class="feature-plugin-action"
            onClick={() => model().openPlugin?.(props.plugin.id)}
          >
            {t("marketplace.feature.openNamed", { name: props.plugin.name })}
            <ArrowRight aria-hidden="true" />
          </Button>
        </Show>
      </Show>
    </div>
  );
}

function PluginCard(props: { scope: MarketplaceScope; plugin: MarketplaceFeaturePlugin }) {
  const { t } = useText();
  return (
    <article class="marketplace-card feature-plugin-card" aria-labelledby={`feature-plugin-${props.plugin.id}`}>
      <Button
        type="button"
        variant="ghost"
        class="marketplace-hitarea"
        aria-label={t("marketplace.open", { name: props.plugin.name })}
        onClick={() => props.scope.nav.go({ kind: "feature-plugin", id: props.plugin.id })}
      />
      <div class="feature-plugin-card-head">
        <PluginMark />
        <div class="feature-plugin-card-name">
          <Heading as="h3" size="sm" id={`feature-plugin-${props.plugin.id}`}>
            {props.plugin.name}
          </Heading>
          <Text as="p" variant="caption" tone="muted">
            {t("marketplace.category.productivity")}
          </Text>
        </div>
        <div class="marketplace-card-action">
          <PluginActions scope={props.scope} plugin={props.plugin} />
        </div>
      </div>
      <Text as="p" variant="body-sm" class="feature-plugin-card-description">
        {props.plugin.description}
      </Text>
      <Text as="p" variant="caption" tone="muted" class="feature-plugin-meta">
        {t("marketplace.feature.meta", { version: props.plugin.version })}
      </Text>
    </article>
  );
}

export function MarketplaceFeaturePlugins(props: { scope: MarketplaceScope }) {
  const { t } = useText();
  const plugins = () =>
    props.scope.model
      .plugins?.()
      .filter((plugin) =>
        `${plugin.name} ${plugin.description}`.toLowerCase().includes(props.scope.nav.state.query.trim().toLowerCase()),
      ) ?? [];
  const groups = () =>
    [
      {
        id: "feature-plugins-yours",
        title: t("marketplace.feature.yourPlugins"),
        plugins: plugins().filter((plugin) => plugin.installed),
      },
      {
        id: "feature-plugins-more",
        title: t("marketplace.feature.morePlugins"),
        plugins: plugins().filter((plugin) => !plugin.installed),
      },
    ].filter((group) => group.plugins.length > 0);
  return (
    <div class="feature-plugins-browse">
      <Text as="p" variant="body-sm" tone="muted" class="feature-plugins-intro">
        {t("marketplace.feature.intro")}
      </Text>
      <Show
        when={plugins().length > 0}
        fallback={
          <div class="marketplace-empty">
            <Text as="p" tone="muted">
              {props.scope.nav.state.query.trim() ? t("marketplace.noMatch.plugins") : t("marketplace.empty.plugins")}
            </Text>
          </div>
        }
      >
        <For each={groups()} keyed={(group) => group.id}>
          {(group) => (
            <section class="feature-plugin-group" aria-labelledby={group().id}>
              <Heading as="h3" size="sm" class="feature-plugin-section-label" id={group().id}>
                {group().title}
              </Heading>
              <div class="feature-plugin-grid">
                <For each={group().plugins} keyed={(plugin) => plugin.id}>
                  {(plugin) => <PluginCard scope={props.scope} plugin={plugin()} />}
                </For>
              </div>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}

function DashboardPreview() {
  const { t } = useText();
  return (
    <figure class="feature-plugin-preview">
      <figcaption class="feature-plugin-section-label">{t("marketplace.feature.preview")}</figcaption>
      <div class="feature-plugin-preview-layout" aria-hidden="true">
        <div class="feature-plugin-preview-blue" />
        <div class="feature-plugin-preview-amber" />
        <div />
        <div class="feature-plugin-preview-wide" />
        <div class="feature-plugin-preview-purple" />
      </div>
    </figure>
  );
}

export function MarketplaceFeaturePluginPage(props: { scope: MarketplaceScope; id: string }) {
  const { t } = useText();
  const plugin = () => props.scope.model.plugins?.().find((entry) => entry.id === props.id);
  const capabilities = [
    "marketplace.feature.capability.navigation",
    "marketplace.feature.capability.generate",
    "marketplace.feature.capability.widgets",
    "marketplace.feature.capability.reports",
  ] as const;
  const permissions = ["marketplace.feature.permission.visibility", "marketplace.feature.permission.agent"] as const;
  const back = () => {
    props.scope.nav.set((draft) => {
      draft.tab = "plugins";
    });
    props.scope.nav.backTo(0);
  };
  return (
    <div class="marketplace-view feature-plugin-detail">
      <Button type="button" variant="ghost" size="sm" class="feature-plugin-back" onClick={back}>
        <ChevronLeft aria-hidden="true" />
        {t("marketplace.tab.plugins")}
      </Button>
      <Show
        when={plugin()}
        fallback={
          <Text as="p" tone="muted">
            {t("marketplace.empty.plugins")}
          </Text>
        }
      >
        {(entry) => (
          <>
            <div class="feature-plugin-hero">
              <PluginMark large />
              <div class="feature-plugin-hero-copy">
                <Heading as="h3" size="lg" class="feature-plugin-title">
                  {entry().name}
                </Heading>
                <Text as="p" variant="caption" tone="muted" class="feature-plugin-meta">
                  {t("marketplace.feature.meta", { version: entry().version })}
                </Text>
              </div>
              <PluginActions scope={props.scope} plugin={entry()} detail />
            </div>
            <div class="feature-plugin-columns">
              <div class="feature-plugin-copy">
                <Text as="p" class="feature-plugin-description">
                  {t("marketplace.feature.dashboards.about")}
                </Text>
                <section aria-labelledby="feature-plugin-capabilities">
                  <Heading as="h4" size="sm" class="feature-plugin-section-label" id="feature-plugin-capabilities">
                    {t("marketplace.feature.capabilities")}
                  </Heading>
                  <ul class="feature-plugin-points">
                    <For each={capabilities}>
                      {(key) => (
                        <li>
                          <Check aria-hidden="true" />
                          <Text as="span" variant="body-sm">
                            {t(key)}
                          </Text>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
                <section aria-labelledby="feature-plugin-permissions">
                  <Heading as="h4" size="sm" class="feature-plugin-section-label" id="feature-plugin-permissions">
                    {t("marketplace.feature.permissions")}
                  </Heading>
                  <ul class="feature-plugin-points">
                    <For each={permissions}>
                      {(key) => (
                        <li>
                          <Check aria-hidden="true" />
                          <Text as="span" variant="body-sm">
                            {t(key)}
                          </Text>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
                <Text as="p" variant="body-sm" tone="muted">
                  {t("marketplace.feature.retained")}
                </Text>
                <Show when={!props.scope.model.canManagePlugins?.()}>
                  <Text as="p" variant="body-sm" tone="muted">
                    {t("marketplace.feature.adminOnly")}
                  </Text>
                </Show>
                <Show when={entry().installed && props.scope.model.canManagePlugins?.()}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="feature-plugin-uninstall"
                    loading={props.scope.model.pluginBusy?.(entry().id)}
                    onClick={() => void props.scope.model.setPluginInstalled?.(entry().id, false)}
                  >
                    {t("marketplace.feature.uninstall")}
                  </Button>
                </Show>
              </div>
              <DashboardPreview />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
