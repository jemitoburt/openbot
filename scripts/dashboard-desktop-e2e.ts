// Drives only this worktree's registered dev app. Never starts an agent run or a routine.
// Run: bun scripts/dashboard-desktop-e2e.ts --allow-mutations.
// Creates sample dashboards, archives them in finally, and writes repeatable review artifacts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DashboardBlock, DashboardDocument } from "@openbot/contracts/ipc";
import { isDashboardBlock } from "@openbot/contracts/ipc";
import { createOpenBotLogger } from "@openbot/logging";
import { dashboardStoryDocuments } from "../src/renderer/stories/dashboard-fixtures";
import { assertMutationAllowed, connectToDevApp } from "./dev-automation/cdp-client";
import { readDevInstanceRecords } from "./dev-automation/instance-registry";

const OUT = resolve(import.meta.dirname, "../.openbot-build/dashboard-desktop-e2e");
const instances = readDevInstanceRecords().filter(
  (record) => record.service === "app" && resolve(record.projectRoot) === resolve(process.cwd()),
);
assert.equal(instances.length, 1, "Start one dev app for this worktree first.");
const instance = instances[0];
assert.ok(instance);
assertMutationAllowed({
  command: "dashboard-desktop-e2e",
  allowMutations: process.argv.includes("--allow-mutations"),
  instanceNamed: true,
  target: instance.instanceId,
});
const session = await connectToDevApp(instance.remoteDebuggingPort, createOpenBotLogger("dashboard-desktop-e2e"), {
  expectedRendererPort: instance.rendererPort,
  ownerPid: instance.pid,
});
mkdirSync(OUT, { recursive: true });
const page = session.page;
const cases: string[] = [];
const errors: string[] = [];
const warnings: string[] = [];
const limitations: string[] = [];
const captures: string[] = [];
const cleanupErrors: string[] = [];
const widths: Array<{ width: number; documentOverflow: number; dashboardOverflow: number }> = [];
const detailWidths: Array<{ width: number; documentOverflow: number; dialogOverflow: number }> = [];
const fixtures: DashboardDocument[] = [];
let originalInstalled: boolean | undefined;
let failure: unknown;
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
  if (message.type() === "warning") warnings.push(message.text());
});
const rail = page.getByRole("navigation", { name: "Pages", exact: true, includeHidden: true });
const marketplace = page.getByRole("dialog", { name: "Marketplace", exact: true });
const dashboard = page.getByRole("region", { name: "Dashboards", exact: true });
const railButton = (name: string) => rail.getByRole("button", { name, exact: true, includeHidden: true });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function capture(name: string) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false, animations: "disabled" });
  captures.push(`${name}.png`);
}
async function read(id: string) {
  return page.evaluate((dashboardId) => window.openbot.dashboards.read(dashboardId), id);
}
async function openDashboard(document: DashboardDocument) {
  await dashboard
    .getByRole("navigation", { name: "Filter by agent", exact: true })
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(document.title)}`) })
    .click();
  await dashboard.getByRole("heading", { name: document.title, exact: true }).waitFor();
}
async function openWidget(title: string) {
  const opener = dashboard.getByRole("button", { name: `Open ${title}`, exact: true }).last();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor();
  return dialog;
}
async function closeWidget(title: string) {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.waitForFunction((label) => document.activeElement?.getAttribute("aria-label") === label, `Open ${title}`);
}
type FixtureValue = string | number | boolean | null | undefined | FixtureValue[] | { [key: string]: FixtureValue };
function rewriteRoutines(value: FixtureValue, routineId: string | undefined): FixtureValue {
  if (Array.isArray(value)) return value.map((entry) => rewriteRoutines(entry, routineId));
  if (value === null || typeof value !== "object") return value;
  const rewritten: Record<string, FixtureValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "routineId") {
      if (routineId) rewritten[key] = routineId;
      continue;
    }
    rewritten[key] = rewriteRoutines(entry, routineId);
  }
  if (rewritten.type === "routine" && !routineId) return { type: "chat" };
  return rewritten;
}
function fixtureBlocks(blocks: DashboardBlock[], routineId: string | undefined): DashboardBlock[] {
  return blocks
    .filter((block) => routineId || block.type !== "report")
    .map((block) => {
      const rewritten = rewriteRoutines(JSON.parse(JSON.stringify(block)), routineId);
      assert.ok(isDashboardBlock(rewritten), `Invalid sample block: ${block.id}`);
      return rewritten;
    });
}
try {
  await page.keyboard.press("Escape");
  originalInstalled = (await page.evaluate(() => window.openbot.plugins.state()))?.installed ?? false;
  await page.evaluate(() => window.openbot.plugins.setInstalled(false));
  await railButton("Dashboards").waitFor({ state: "detached" });
  await railButton("Marketplace").click();
  await marketplace.getByRole("tab", { name: /^Plugins(?: New)?$/ }).click();
  await page.setViewportSize({ width: 1650, height: 1100 });
  await capture("D01-plugins-marketplace");
  await marketplace.getByRole("button", { name: "Open Dashboards", exact: true }).click();
  await marketplace.getByRole("button", { name: "Install", exact: true }).waitFor();
  await capture("D02-dashboards-plugin");
  await marketplace.getByRole("button", { name: "Install", exact: true }).click();
  await railButton("Dashboards").waitFor();
  assert.equal((await page.evaluate(() => window.openbot.plugins.state()))?.installed, true);
  cases.push("Marketplace installation adds the Dashboards sidebar entry");

  const agents = await page.evaluate(() => window.openbot.agent.listAgents());
  const agent = agents[0];
  assert.ok(agent, "Create a development agent before this check.");
  const routines = await page.evaluate((agentId) => window.openbot.agent.listRoutines(agentId), agent.id);
  const routine = routines[0];
  if (!routine)
    limitations.push(
      "No existing routine was available. Report blocks were removed and routine actions became chat actions. No routine was run.",
    );
  const runId = Date.now();
  for (const sample of dashboardStoryDocuments) {
    const created = await page.evaluate((input) => window.openbot.dashboards.create(input), {
      agentId: agent.id,
      title: `${sample.title} · E2E ${runId}`,
      blocks: fixtureBlocks(sample.blocks, routine?.id),
    });
    fixtures.push(created);
  }
  const morning = fixtures[0],
    fitness = fixtures[1],
    coding = fixtures[2],
    catalogue = fixtures[3];
  assert.ok(morning && fitness && coding && catalogue);
  await marketplace.getByRole("button", { name: "Open Dashboards", exact: true }).click();
  await marketplace.waitFor({ state: "hidden" });
  await openDashboard(morning);
  await capture("D03-morning-overview");
  await openDashboard(fitness);
  await capture("D04-fitness");
  await openDashboard(coding);
  await capture("D05-coding");
  await openDashboard(catalogue);
  await capture("D11-widget-catalogue");
  const catalogueMain = dashboard.getByRole("main");
  const catalogueScroll = await catalogueMain.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Dashboard must have a main content element.");
    return { height: element.clientHeight, maximum: element.scrollHeight - element.clientHeight };
  });
  let cataloguePage = 1;
  const catalogueStep = Math.max(1, catalogueScroll.height - 120);
  for (let top = catalogueStep; top < catalogueScroll.maximum + catalogueStep; top += catalogueStep) {
    const position = Math.min(top, catalogueScroll.maximum);
    await catalogueMain.evaluate((element, value) => {
      if (!(element instanceof HTMLElement)) throw new Error("Dashboard must have a main content element.");
      element.scrollTo({ top: value, behavior: "instant" });
    }, position);
    await page.waitForFunction(
      (value) => document.querySelector(".dashboard-main-scroll")?.scrollTop === value,
      position,
    );
    await capture(`D11-catalogue-${String(cataloguePage).padStart(2, "0")}`);
    cataloguePage += 1;
    if (position === catalogueScroll.maximum) break;
  }

  cases.push("Morning, Fitness, Coding, and all widget types open from saved sample documents");

  await openDashboard(fitness);
  const salmon = dashboard.getByRole("checkbox", { name: /^Salmon fillets\b/ });
  await salmon.click();
  await page.waitForFunction(async (id) => {
    const doc = await window.openbot.dashboards.read(id);
    const block = doc.blocks.find((entry) => entry.id === "shopping");
    return block?.type === "checklist" && block.items.find((item) => item.id === "salmon")?.checked === true;
  }, fitness.id);
  await salmon.click();
  await page.waitForFunction(async (id) => {
    const doc = await window.openbot.dashboards.read(id);
    const block = doc.blocks.find((entry) => entry.id === "shopping");
    return block?.type === "checklist" && block.items.find((item) => item.id === "salmon")?.checked === false;
  }, fitness.id);
  cases.push("Card checkbox check and uncheck both persist without opening a detail");
  assert.equal(await page.getByRole("dialog").count(), 0);

  const shoppingDialog = await openWidget("Shopping list");
  await capture("D12-shopping-list");
  await shoppingDialog.getByRole("textbox", { name: "Item name", exact: true }).fill("E2E apples");
  await shoppingDialog.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("3");
  await shoppingDialog.getByRole("textbox", { name: "Unit", exact: true }).fill("pieces");
  await shoppingDialog.getByRole("textbox", { name: "Category", exact: true }).fill("Fruit");
  await shoppingDialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction(async (id) => {
    const doc = await window.openbot.dashboards.read(id);
    const block = doc.blocks.find((entry) => entry.id === "shopping");
    return (
      block?.type === "checklist" &&
      block.items.some(
        (item) =>
          item.text === "E2E apples" && item.quantity === 3 && item.unit === "pieces" && item.category === "Fruit",
      )
    );
  }, fitness.id);
  const apples = shoppingDialog.getByRole("checkbox", { name: /^E2E apples\b/ });
  await apples.click();
  await page.waitForFunction(async (id) => {
    const doc = await window.openbot.dashboards.read(id);
    const block = doc.blocks.find((entry) => entry.id === "shopping");
    return block?.type === "checklist" && block.items.find((item) => item.text === "E2E apples")?.checked === true;
  }, fitness.id);
  cases.push("Detail adds an item with quantity and category, then saves its completion");

  // Capture the real export's Blob at the browser download boundary. Restore the native method
  // in the same call. No save dialog opens and no file is written outside the artifact directory.
  const exported = await shoppingDialog
    .getByRole("button", { name: "Export", exact: true })
    .evaluate(async (button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Export must be a button.");
      const nativeClick = HTMLAnchorElement.prototype.click;
      const nativeCreateObjectURL = URL.createObjectURL;
      const blobs = new Map<string, Blob>();
      const downloads: Array<{ url: string; name: string }> = [];
      URL.createObjectURL = (blob) => {
        const url = nativeCreateObjectURL.call(URL, blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.download && this.href.startsWith("blob:")) downloads.push({ url: this.href, name: this.download });
        else nativeClick.call(this);
      };
      try {
        button.click();
      } finally {
        HTMLAnchorElement.prototype.click = nativeClick;
        URL.createObjectURL = nativeCreateObjectURL;
      }
      const download = downloads[0];
      if (!download) return null;
      const blob = blobs.get(download.url);
      if (!blob) throw new Error("Export must create a file Blob.");
      return { name: download.name, text: await blob.text() };
    });
  assert.ok(exported, "Export must provide a download.");
  assert.equal(exported.name, "shopping.json");
  const exportedBlock = JSON.parse(exported.text);
  assert.ok(isDashboardBlock(exportedBlock));
  assert.equal(exportedBlock.id, "shopping");
  assert.ok(
    exportedBlock.type === "checklist" &&
      exportedBlock.items.some((item) => item.text === "E2E apples" && item.checked),
  );
  writeFileSync(resolve(OUT, "exported-shopping.json"), exported.text);
  cases.push("Export produces the current widget JSON at the download boundary");
  limitations.push(
    "Export was captured before the native download action; the operating system save dialog was not tested.",
  );

  const clipboard = await page.evaluate(async () => {
    try {
      return { available: true, text: await navigator.clipboard.readText() };
    } catch {
      return { available: false, text: "" };
    }
  });
  if (clipboard.available) {
    try {
      await shoppingDialog.getByRole("button", { name: "Share", exact: true }).click();
      await page.waitForFunction(async () => {
        try {
          const value = JSON.parse(await navigator.clipboard.readText());
          return value !== null && typeof value === "object" && "id" in value && value.id === "shopping";
        } catch {
          return false;
        }
      });
      cases.push("Share copies the current widget to the clipboard; prior clipboard content is restored");
    } finally {
      await page.evaluate((text) => navigator.clipboard.writeText(text), clipboard.text);
    }
  } else
    limitations.push(
      "Clipboard read access was unavailable. Share was not clicked, to preserve the prior clipboard content.",
    );
  await closeWidget("Shopping list");
  cases.push("Escape closes the detail and restores focus to its widget button");

  const beforeRecipe = await read(fitness.id);
  const beforeShopping = beforeRecipe.blocks.find((entry) => entry.id === "shopping");
  assert.ok(beforeShopping?.type === "checklist");
  const beforeCount = beforeShopping.items.length;
  const recipeDialog = await openWidget("Salmon, potatoes and green beans");
  await capture("D13-recipe");
  await recipeDialog.getByRole("button", { name: "Next", exact: true }).click();
  await recipeDialog.getByRole("button", { name: "Add to shopping list", exact: true }).click();
  await page.waitForFunction(
    async ({ id, count }) => {
      const doc = await window.openbot.dashboards.read(id);
      const block = doc.blocks.find((entry) => entry.id === "shopping");
      return (
        block?.type === "checklist" &&
        block.items.length === count + 3 &&
        block.items[count]?.quantity === 3 &&
        block.items.slice(count).every((item) => item.source === "recipe" && !item.checked)
      );
    },
    { id: fitness.id, count: beforeCount },
  );
  cases.push("Recipe portions scale ingredients and append them to the existing checklist");
  await closeWidget("Salmon, potatoes and green beans");
  await openWidget("Weekly training plan");
  await capture("D14-weekly-training");
  await closeWidget("Weekly training plan");
  await openDashboard(morning);
  await openWidget("Top world news");
  await capture("D15-world-news");
  await closeWidget("Top world news");
  await openDashboard(coding);
  await openWidget("OpenBot improvements");
  await capture("D16-project");
  await closeWidget("OpenBot improvements");
  cases.push("Checklist, recipe, week, news, and project details open and close from their cards");

  await openDashboard(catalogue);
  for (const [index, width] of [1360, 980, 720, 1360].entries()) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".dashboard-page");
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dashboardOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
      };
    });
    widths.push({ width, ...overflow });
    await capture(`responsive-${index + 1}-${width}`);
  }
  const beforeUninstall = await read(fitness.id);
  await openDashboard(fitness);
  await page.setViewportSize({ width: 720, height: 900 });
  await openWidget("Shopping list");
  await capture("D12-shopping-list-720");
  detailWidths.push(
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>(".dashboard-widget-detail");
      return {
        width: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialogOverflow: dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
      };
    }),
  );
  await closeWidget("Shopping list");
  await page.setViewportSize({ width: 1360, height: 900 });
  await railButton("Marketplace").click();
  await marketplace.getByRole("tab", { name: /^Plugins(?: New)?$/ }).click();
  const uninstall = marketplace.getByRole("button", { name: "Uninstall", exact: true });
  if (!(await uninstall.count()))
    await marketplace.getByRole("button", { name: "Open Dashboards", exact: true }).click();
  await uninstall.click();
  await railButton("Dashboards").waitFor({ state: "detached" });
  await marketplace.getByRole("button", { name: "Install", exact: true }).click();
  await railButton("Dashboards").waitFor();
  await marketplace.getByRole("button", { name: "Open Dashboards", exact: true }).click();
  await marketplace.waitFor({ state: "hidden" });
  await openDashboard(fitness);
  const restored = await read(fitness.id);
  assert.deepEqual(restored.blocks, beforeUninstall.blocks);
  cases.push("Uninstall hides navigation; reinstall preserves completed and appended checklist data");
  assert.deepEqual(errors, [], "The renderer must have no new errors.");
} catch (error) {
  failure = error;
  await capture("failure").catch(() => undefined);
} finally {
  if (fixtures.length) {
    try {
      await page.evaluate(() => window.openbot.plugins.setInstalled(true));
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
    for (const fixture of fixtures) {
      try {
        await page.evaluate(async (id) => {
          const current = await window.openbot.dashboards.read(id);
          if (current.archivedAt === null) await window.openbot.dashboards.archive({ id, revision: current.revision });
        }, fixture.id);
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (originalInstalled !== undefined) {
    try {
      await page.evaluate((installed) => window.openbot.plugins.setInstalled(installed), originalInstalled);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  writeFileSync(
    resolve(OUT, "report.json"),
    JSON.stringify(
      {
        status: failure || cleanupErrors.length ? "fail" : "pass",
        cases,
        captures,
        widths,
        detailWidths,
        errors,
        warnings: [...new Set(warnings)],
        limitations,
        cleanupErrors,
        fixtureIds: fixtures.map((entry) => entry.id),
        failure: failure instanceof Error ? failure.message : failure === undefined ? null : String(failure),
      },
      null,
      2,
    ),
  );
  await session.close();
}
if (failure) throw failure;
assert.deepEqual(cleanupErrors, [], "All sample dashboards must be archived and installation state restored.");
