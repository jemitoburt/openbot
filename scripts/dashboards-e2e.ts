// Run: node --import tsx scripts/dashboards-e2e.ts
// Report: .openbot-build/dashboards-e2e.json
// Drives the real SQLite service and agent tool adapter on a temporary host profile.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DASHBOARD_LIMITS,
  type DashboardBlock,
  type DashboardChange,
  isDashboardBlocks,
  isPublicDashboardDocument,
} from "@openbot/contracts/ipc";
import { DASHBOARD_CODECS, DASHBOARD_ROUTES } from "@openbot/contracts/team-protocol/dashboards-v1";
import { registerSecretValue } from "@openbot/logging";
import { Effect, Result } from "effect";
import { handleDashboardTool } from "../src/backend/agent/dashboard-tools";
import { type DashboardActor, DashboardService } from "../src/backend/dashboards/dashboard-service";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { OpenBotDatabase } from "../src/backend/openbot-database";

const root = await mkdtemp(join(tmpdir(), "openbot-dashboards-e2e-"));
let database = new OpenBotDatabase(root);
const changes: DashboardChange[] = [];
const agents = new Set(["fitness", "chief"]);
const options = () => ({
  database,
  agentExists: (id: string) => agents.has(id),
  routineBelongsToAgent: (routineId: string, agentId: string) => routineId === "morning" && agentId === "chief",
  changed: (event: DashboardChange) => changes.push(event),
});
const member: DashboardActor = {
  administrator: false,
  canReadAgent: (id) => id === "fitness",
  canWriteAgent: (id) => id === "fitness",
};
const cases: string[] = [];
try {
  await runCauseEffect(database.initialize());
  let service = new DashboardService(options());
  assert.equal((await Effect.runPromise(service.pluginState())).installed, false);
  assert.equal(Result.isFailure(await Effect.runPromise(Effect.result(service.list()))), true);
  assert.equal(Result.isFailure(await Effect.runPromise(Effect.result(service.setInstalled(true, member)))), true);
  await Effect.runPromise(service.setInstalled(true));
  database.connection
    .prepare(`INSERT INTO projection_agent_routines
    (routine_id,agent_id,name,instruction,active,timezone,created_at,updated_at,last_event_sequence)
    VALUES ('morning','chief','Morning brief','Report the news.',1,'Europe/Prague','2026-10-22','2026-10-22',1)`)
    .run();
  const dashboard = await Effect.runPromise(
    service.create({
      agentId: "fitness",
      title: "Training",
      blocks: [
        { id: "shopping", title: "Shopping", type: "checklist", items: [{ id: "eggs", text: "Eggs", checked: false }] },
      ],
    }),
  );
  const chief = await Effect.runPromise(
    service.create({
      agentId: "chief",
      title: "Morning",
      blocks: [{ id: "report", title: "News", type: "report", routineId: "morning" }],
    }),
  );
  const summaries = await Effect.runPromise(service.list({}, member));
  assert.equal(summaries.length, 1);
  assert.equal("blocks" in (summaries[0] ?? {}), false);
  const chiefSource = database.connection
    .prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id=?")
    .get(chief.id);
  database.connection.prepare("UPDATE agent_dashboards SET document_json='{}' WHERE dashboard_id=?").run(chief.id);
  assert.equal((await Effect.runPromise(service.list({}, member))).length, 1);
  database.connection
    .prepare("UPDATE agent_dashboards SET document_json=? WHERE dashboard_id=?")
    .run(String(chiefSource?.document_json), chief.id);
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.create({
            agentId: "fitness",
            title: "Oversized",
            blocks: Array.from({ length: 8 }, (_, index) => ({
              id: `utf8-${index}`,
              title: "UTF8",
              type: "text",
              text: "界".repeat(20_000),
            })),
          }),
        ),
      ),
    ),
    true,
  );
  assert.equal(Result.isFailure(await Effect.runPromise(Effect.result(service.read(chief.id, member)))), true);
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.create({
            agentId: "fitness",
            title: "Invalid report",
            blocks: [{ id: "report", title: "News", type: "report", routineId: "morning" }],
          }),
        ),
      ),
    ),
    true,
  );
  cases.push("installation and agent access");
  const widgetBlocks: DashboardBlock[] = [
    {
      id: "stat",
      title: "Cost",
      type: "stat",
      label: "Usage",
      value: "128",
      unit: "CZK",
      trend: { direction: "up", value: "+12%" },
      caption: "Today",
      history: [{ at: "2026-10-22T06:00:00Z", value: 128, delta: "+12" }],
      periods: ["Day"],
      target: 150,
      presentation: { size: "S", tone: "surface" },
    },
    {
      id: "stats",
      title: "Summary",
      type: "stat-group",
      items: [
        { label: "Tasks", value: "8" },
        { label: "Projects", value: "2" },
      ],
      presentation: { size: "L", tone: "surface" },
    },
    {
      id: "note",
      title: "Notes",
      type: "text",
      text: "Preview",
      heading: "Today",
      bodyFull: "Full saved text.",
      sources: [{ label: "Source", url: "https://example.com/source" }],
    },
    {
      id: "list",
      title: "Activity",
      type: "list",
      items: [
        {
          id: "activity-1",
          title: "A project update",
          subtitle: "Ready",
          meta: "Today",
          lead: { type: "agent", value: "Chief" },
          group: "Today",
          at: "2026-10-22T06:00:00Z",
          action: { label: "Open", target: { type: "chat" } },
          url: "https://example.com/project",
        },
      ],
      total: 1,
    },
    {
      id: "news",
      title: "World",
      type: "news",
      items: [
        {
          id: "news-1",
          category: "World",
          source: "Example",
          headline: "Morning news",
          summary: "Short summary.",
          summaryFull: "Full summary.",
          url: "https://example.com/news",
          publishedAt: "2026-10-22T06:00:00Z",
          sources: [{ label: "Original", url: "https://example.com/original" }],
        },
      ],
      categories: ["World"],
    },
    {
      id: "widget-shopping",
      title: "Shopping",
      type: "checklist",
      items: [
        {
          id: "milk",
          text: "Milk",
          checked: false,
          category: "Dairy",
          quantity: 2,
          unit: "l",
          meta: "For breakfast",
          source: "recipe",
        },
      ],
      allowAdd: true,
      groupsOrder: ["Dairy"],
      sharedWith: ["Family"],
    },
    { id: "progress", title: "Goal", type: "progress", label: "Training", value: 50, unit: "%", caption: "This week" },
    {
      id: "project",
      title: "Project",
      type: "project",
      ref: "owner/repo",
      progress: 50,
      tasks: [{ id: "task-1", text: "Review", checked: false, status: "doing", assignee: "Chief" }],
      activity: [{ at: "2026-10-22T06:00:00Z", agent: "Chief", text: "Prepared review." }],
      links: [{ label: "Pull request", url: "https://example.com/pr/1" }],
      repoUrl: "https://example.com/repo",
    },
    {
      id: "timeline",
      title: "Today",
      type: "timeline",
      dateLabel: "Thursday",
      events: [
        {
          id: "event-1",
          time: "06:00",
          title: "Morning report",
          agent: "Chief",
          status: "Ready",
          duration: 5,
          location: "Home",
          detail: "Read the morning report.",
          routineId: "morning",
        },
      ],
      note: "Daily plan",
      date: "2026-10-22",
      hours: { from: 6, to: 22 },
    },
    {
      id: "week",
      title: "Week",
      type: "week",
      days: [
        {
          weekday: "Thursday",
          date: "2026-10-22",
          today: true,
          events: [
            {
              id: "training",
              time: "18:00",
              title: "Training",
              selected: true,
              duration: 60,
              location: "Gym",
              detail: "Full session.",
            },
          ],
        },
      ],
      range: { start: "2026-10-19", end: "2026-10-25", mode: "week" },
    },
    {
      id: "weather",
      title: "Weather",
      type: "weather",
      location: "Brno",
      temp: 12,
      condition: "Cloudy",
      min: 8,
      max: 16,
      hourly: [{ time: "07:00", temp: 10, condition: "Cloudy" }],
      daily: [{ day: "Thursday", condition: "Cloudy", min: 8, max: 16, precip: 10 }],
      feelsLike: 11,
      wind: "12 km/h",
      presentation: { size: "S", tone: "sky" },
    },
    {
      id: "callout",
      title: "Notice",
      type: "callout",
      eyebrow: "Today",
      headline: "Ready for you",
      body: "Preview",
      bodyFull: "Full notice.",
      action: { label: "Open chat", icon: "message-circle", target: { type: "chat" } },
      related: [{ title: "Related note", subtitle: "Details", at: "2026-10-22T06:00:00Z" }],
      presentation: { size: "M", tone: "lavender", state: "error", message: "The last update failed." },
    },
    {
      id: "rich",
      title: "Recipe",
      type: "rich",
      heading: "Breakfast",
      media: { icon: "chef-hat", imageUrl: "https://example.com/recipe.png" },
      meta: "25 min",
      sections: [{ index: 1, text: "Prepare ingredients." }],
      portions: 2,
      ingredients: [{ id: "ingredient-1", label: "Milk", quantity: 1, unit: "l", category: "Dairy" }],
      steps: [{ index: 1, text: "Cook.", timerSec: 60 }],
      nutrition: { kcal: 600, protein: 30 },
      targetChecklistId: "widget-shopping",
    },
    {
      id: "table",
      title: "Costs",
      type: "table",
      columns: ["Agent", "Cost"],
      rows: [["Chief", "128"]],
      columnMeta: [
        { key: "agent", label: "Agent", align: "left" },
        { key: "cost", label: "Cost", align: "right" },
      ],
      rowIds: ["row-1"],
      sort: { key: "cost", dir: "desc" },
      page: { index: 0, size: 10, total: 1 },
      exportable: true,
    },
    {
      id: "bar",
      title: "Costs",
      type: "chart",
      chartType: "bar",
      points: [{ label: "Today", value: 128, tone: "lavender", note: "Current" }],
      periods: ["Day"],
      activePeriod: "Day",
      series: [{ label: "Cost", points: [{ x: "Today", y: 128, note: "Current" }] }],
      axisLabels: ["Today"],
      highlight: "Today",
      valuesTable: { columns: ["Date", "Cost"], rows: [["Today", "128"]] },
    },
    { id: "line", title: "Trend", type: "chart", chartType: "line", points: [{ label: "Today", value: 128 }] },
    {
      id: "donut",
      title: "Share",
      type: "chart",
      chartType: "donut",
      points: [
        { label: "Chief", value: 70, tone: "green" },
        { label: "Fitness", value: 30, tone: "mustard" },
      ],
    },
    {
      id: "media",
      title: "Map",
      type: "media",
      imageUrl: "https://example.com/map.png",
      caption: "Saved map",
      alt: "Location map",
      width: 800,
      height: 600,
      source: "Example",
    },
    {
      id: "actions",
      title: "Morning routine",
      type: "actions",
      heading: "Daily report",
      status: { label: "Ready", tone: "green" },
      description: "A saved routine.",
      buttons: [
        { label: "Run", icon: "play", target: { type: "routine", routineId: "morning" } },
        { label: "Source", target: { type: "url", url: "https://example.com" } },
      ],
      schedule: "Every morning",
      steps: ["Read news"],
      runs: [
        {
          at: "2026-10-22T06:00:00Z",
          status: "Completed",
          durationMs: 1000,
          trigger: "Schedule",
          outputRef: "Morning report",
        },
      ],
      footer: { agent: "Chief", source: "Routine", updatedAt: "2026-10-22T06:00:00Z" },
      detail: {
        meta: [{ label: "Schedule", value: "Daily" }],
        history: [{ at: "2026-10-22T06:00:00Z", agent: "Chief", text: "Reported completion." }],
      },
    },
  ];
  assert.equal(isDashboardBlocks(widgetBlocks), true);
  const widgetInput = { agentId: "chief", title: "D11 catalogue", blocks: widgetBlocks };
  const codec = DASHBOARD_CODECS.get(DASHBOARD_ROUTES.create);
  assert.ok(codec);
  assert.deepEqual(codec.request(widgetInput), widgetInput);
  const widgets = await Effect.runPromise(service.create(widgetInput));
  assert.deepEqual(codec.response(200, widgets), widgets);
  const projectChecked = await Effect.runPromise(
    service.toggleItem({ id: widgets.id, revision: 1, blockId: "project", itemId: "task-1", checked: true }),
  );
  const projectBlock = projectChecked.blocks.find((entry) => entry.id === "project");
  assert.equal(projectBlock?.type === "project" && projectBlock.tasks[0]?.checked, true);
  const projectUnchecked = await Effect.runPromise(
    service.toggleItem({ id: widgets.id, revision: 2, blockId: "project", itemId: "task-1", checked: false }),
  );
  const restoredProject = projectUnchecked.blocks.find((entry) => entry.id === "project");
  assert.equal(restoredProject?.type === "project" && restoredProject.tasks[0]?.checkedAt, null);
  assert.equal(
    isDashboardBlocks([{ id: "unsafe", title: "Unsafe", type: "media", imageUrl: "file:///private/data" }]),
    false,
  );
  assert.equal(
    isDashboardBlocks([
      {
        id: "unsafe",
        title: "Unsafe",
        type: "actions",
        heading: "Unsafe",
        buttons: [{ label: "Execute", target: { type: "url", url: "javascript:alert(1)" } }],
      },
    ]),
    false,
  );
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.create({
            agentId: "fitness",
            title: "Wrong routine owner",
            blocks: [
              {
                id: "action",
                title: "Action",
                type: "actions",
                heading: "Run",
                buttons: [{ label: "Run", target: { type: "routine", routineId: "morning" } }],
              },
            ],
          }),
        ),
      ),
    ),
    true,
  );
  cases.push(
    "D11 catalogue survives frozen wire and storage; project reverse actions and typed action access are enforced",
  );

  const secret = "dashboard-secret-value-123456";
  registerSecretValue(secret);
  const protectedDocument = await Effect.runPromise(
    service.create({
      agentId: "chief",
      title: "Secret check",
      blocks: [
        { id: "private", title: "Value", type: "text", text: secret },
        {
          id: "secret-shopping",
          title: "Shopping",
          type: "checklist",
          items: [{ id: "original-item", text: secret, checked: false, meta: secret }],
        },
        {
          id: "secret-recipe",
          title: "Recipe",
          type: "rich",
          sections: [],
          ingredients: [{ label: secret, quantity: 2, unit: "kg", category: "Pantry" }],
          portions: 2,
          targetChecklistId: "secret-shopping",
        },
      ],
    }),
  );
  assert.equal(protectedDocument.blocks[0]?.type === "text" && protectedDocument.blocks[0].text, "[redacted]");
  const stored = database.connection
    .prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id = ?")
    .get(protectedDocument.id);
  assert.equal(String(stored?.document_json).includes(secret), true);
  assert.equal(JSON.stringify(await Effect.runPromise(service.list())).includes(secret), false);
  assert.equal(
    isDashboardBlocks([
      {
        id: "nested-extra",
        title: "Source",
        type: "text",
        text: "Safe",
        sources: [{ label: "Source", url: "https://example.com", id: secret }],
      },
    ]),
    false,
  );
  assert.equal(
    isDashboardBlocks([
      {
        id: "nested-action",
        title: "Action",
        type: "actions",
        heading: "Open",
        buttons: [{ label: "Chat", target: { type: "chat", at: secret } }],
      },
    ]),
    false,
  );
  let protectedRevision = protectedDocument.revision;
  const manuallyAdded = await Effect.runPromise(
    service.editWidget({
      id: protectedDocument.id,
      revision: protectedRevision,
      edit: {
        type: "addChecklistItems",
        blockId: "secret-shopping",
        items: [{ id: "manual-item", text: "Apples", checked: false }],
      },
    }),
  );
  protectedRevision = manuallyAdded.revision;
  const recipeAdded = await Effect.runPromise(
    service.editWidget({
      id: protectedDocument.id,
      revision: protectedRevision,
      edit: { type: "addRecipeIngredients", recipeBlockId: "secret-recipe", portions: 4 },
    }),
  );
  protectedRevision = recipeAdded.revision;
  const reportAdded = await Effect.runPromise(
    service.editWidget({
      id: protectedDocument.id,
      revision: protectedRevision,
      edit: { type: "addReport", routineId: "morning" },
    }),
  );
  protectedRevision = reportAdded.revision;
  const protectedSource = database.connection
    .prepare(`SELECT
    json_extract(document_json,'$.blocks[0].text') AS original,
    json_extract(document_json,'$.blocks[1].items[0].meta') AS original_meta,
    json_extract(document_json,'$.blocks[1].items[2].text') AS recipe_text,
    json_extract(document_json,'$.blocks[1].items[2].quantity') AS recipe_quantity
    FROM agent_dashboards WHERE dashboard_id=?`)
    .get(protectedDocument.id);
  assert.equal(protectedSource?.original, secret);
  assert.equal(protectedSource?.original_meta, secret);
  assert.equal(protectedSource?.recipe_text, secret);
  assert.equal(protectedSource?.recipe_quantity, 4);
  assert.equal(
    reportAdded.blocks.some((block) => block.type === "report" && block.title === "Morning brief"),
    true,
  );
  assert.equal(JSON.stringify(reportAdded).includes(secret), false);
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.editWidget({
            id: protectedDocument.id,
            revision: 1,
            edit: { type: "addReport", routineId: "morning" },
          }),
        ),
      ),
    ),
    true,
  );
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.editWidget(
            {
              id: protectedDocument.id,
              revision: protectedRevision,
              edit: { type: "addReport", routineId: "morning" },
            },
            member,
          ),
        ),
      ),
    ),
    true,
  );
  cases.push("secret send redaction and narrow manual, recipe and report edits preserve the stored source");
  const shortSecret = "q9r8s7t6";
  registerSecretValue(shortSecret);
  const expansionBlocks: DashboardBlock[] = Array.from({ length: 13 }, (_, index) => ({
    id: `limit-${index}`,
    title: "",
    type: "text",
    text: `${`${shortSecret} `.repeat(2_222)}OK`,
  }));
  const padding: DashboardBlock = { id: "padding", title: "", type: "text", text: "" };
  expansionBlocks.push(padding);
  const paddingLength =
    DASHBOARD_LIMITS.documentBytes - new TextEncoder().encode(JSON.stringify(expansionBlocks)).byteLength;
  padding.text = "Z".repeat(paddingLength);
  assert.equal(new TextEncoder().encode(JSON.stringify(expansionBlocks)).byteLength, DASHBOARD_LIMITS.documentBytes);
  assert.equal(isDashboardBlocks(expansionBlocks), true);
  const expanded = await Effect.runPromise(
    service.create({ agentId: "chief", title: `${`${shortSecret} `.repeat(22)}OK`, blocks: expansionBlocks }),
  );
  assert.equal(isPublicDashboardDocument(expanded), true);
  assert.equal(expanded.title.includes(shortSecret), false);
  assert.equal(expanded.title.length > DASHBOARD_LIMITS.title, true);
  const expandedText = expanded.blocks[0];
  assert.equal(expandedText?.type === "text" && expandedText.text.length > DASHBOARD_LIMITS.text, true);
  assert.equal(JSON.stringify(expanded).includes(shortSecret), false);
  const expandedSource = database.connection
    .prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id=?")
    .get(expanded.id);
  assert.equal(String(expandedSource?.document_json).includes(`${shortSecret} `), true);
  assert.equal(
    (await Effect.runPromise(service.list())).find((summary) => summary.id === expanded.id)?.title,
    expanded.title,
  );
  registerSecretValue("Ω", { allowShort: true });
  const countBeforeRefusal = (await Effect.runPromise(service.list())).length;
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.create({
            agentId: "chief",
            title: "Overlarge redaction",
            blocks: Array.from({ length: 5 }, (_, index) => ({
              id: `overlarge-${index}`,
              title: "",
              type: "text",
              text: "Ω ".repeat(10_000),
            })),
          }),
        ),
      ),
    ),
    true,
  );
  assert.equal((await Effect.runPromise(service.list())).length, countBeforeRefusal);
  cases.push("exact input byte limit permits redaction expansion and oversized public output fails before a write");
  const checked = await Effect.runPromise(
    service.toggleItem({ id: dashboard.id, revision: 1, blockId: "shopping", itemId: "eggs", checked: true }, member),
  );
  assert.equal(checked.revision, 2);
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(service.update({ id: dashboard.id, revision: 1, title: "Old", blocks: [] }, member)),
      ),
    ),
    true,
  );
  assert.equal(
    Result.isFailure(
      await Effect.runPromise(
        Effect.result(
          service.toggleItem(
            { id: dashboard.id, revision: 1, blockId: "shopping", itemId: "eggs", checked: false },
            member,
          ),
        ),
      ),
    ),
    true,
  );
  cases.push("checklist persistence and stale write conflict");
  const toolRead = await Effect.runPromise(
    handleDashboardTool("read_dashboard", { id: dashboard.id }, "chief", service),
  );
  assert.equal(toolRead?.success, false);
  const toolList = await Effect.runPromise(handleDashboardTool("list_dashboards", {}, "chief", service));
  assert.equal(toolList?.success, true);
  const toolCreate = await Effect.runPromise(
    handleDashboardTool(
      "create_dashboard",
      { title: "Meals", blocks: [{ id: "note", title: "Meal", type: "text", text: "Vegetables" }] },
      "fitness",
      service,
    ),
  );
  assert.equal(toolCreate?.success, true);
  cases.push("agent tools use caller ownership");
  database.close();
  database = new OpenBotDatabase(root);
  await runCauseEffect(database.initialize());
  service = new DashboardService(options());
  const reopened = await Effect.runPromise(service.read(dashboard.id));
  const block = reopened.blocks[0];
  assert.equal(block?.type === "checklist" && block.items[0]?.checked, true);
  await Effect.runPromise(service.setInstalled(false));
  assert.equal(
    (await Effect.runPromise(handleDashboardTool("list_dashboards", {}, "fitness", service)))?.success,
    false,
  );
  await Effect.runPromise(service.setInstalled(true));
  assert.equal((await Effect.runPromise(service.read(dashboard.id))).revision, 2);
  const originalBlocks = database.connection
    .prepare("SELECT json_extract(document_json, '$.blocks') AS blocks FROM agent_dashboards WHERE dashboard_id=?")
    .get(dashboard.id)?.blocks;
  const archived = await Effect.runPromise(service.archive({ id: dashboard.id, revision: 2 }));
  assert.equal(
    (await Effect.runPromise(service.list())).some((document) => document.id === dashboard.id),
    false,
  );
  assert.equal(Result.isFailure(await Effect.runPromise(Effect.result(service.read(dashboard.id)))), true);
  const archivedSummary = (await Effect.runPromise(service.list({ includeArchived: true }))).find(
    (document) => document.id === dashboard.id,
  );
  assert.equal(archivedSummary?.archivedAt, archived.archivedAt);
  assert.equal(archivedSummary?.revision, 3);
  assert.equal((await Effect.runPromise(service.readArchived(dashboard.id))).revision, 3);
  const readOnly: DashboardActor = {
    administrator: false,
    canReadAgent: (id) => id === "fitness",
    canWriteAgent: () => false,
  };
  const hidden: DashboardActor = { administrator: false, canReadAgent: () => false, canWriteAgent: () => false };
  assert.equal((await Effect.runPromise(service.readArchived(dashboard.id, readOnly))).id, dashboard.id);
  const viewOnlyRestore = await Effect.runPromise(
    Effect.result(service.restore({ id: dashboard.id, revision: 3 }, readOnly)),
  );
  assert.equal(Result.isFailure(viewOnlyRestore) && viewOnlyRestore.failure.code, "forbidden");
  const hiddenRestore = await Effect.runPromise(
    Effect.result(service.restore({ id: dashboard.id, revision: 3 }, hidden)),
  );
  assert.equal(Result.isFailure(hiddenRestore) && hiddenRestore.failure.code, "notFound");
  assert.equal((await Effect.runPromise(service.list({ includeArchived: true }, hidden))).length, 0);
  const staleRestore = await Effect.runPromise(Effect.result(service.restore({ id: dashboard.id, revision: 2 })));
  assert.equal(Result.isFailure(staleRestore) && staleRestore.failure.code, "conflict");
  await Effect.runPromise(service.setInstalled(false));
  assert.equal(
    Result.isFailure(await Effect.runPromise(Effect.result(service.restore({ id: dashboard.id, revision: 3 })))),
    true,
  );
  await Effect.runPromise(service.setInstalled(true));
  database.close();
  database = new OpenBotDatabase(root);
  await runCauseEffect(database.initialize());
  service = new DashboardService(options());
  assert.equal((await Effect.runPromise(service.readArchived(dashboard.id))).revision, 3);
  const archivedToolList = await Effect.runPromise(
    handleDashboardTool("list_dashboards", { includeArchived: true }, "fitness", service),
  );
  assert.equal(archivedToolList?.success, true);
  assert.equal(JSON.stringify(archivedToolList).includes(dashboard.id), true);
  assert.equal(
    (
      await Effect.runPromise(
        handleDashboardTool("read_dashboard", { id: dashboard.id, includeArchived: true }, "fitness", service),
      )
    )?.success,
    true,
  );
  assert.equal(
    (
      await Effect.runPromise(
        handleDashboardTool("restore_dashboard", { id: dashboard.id, revision: 3 }, "chief", service),
      )
    )?.success,
    false,
  );
  assert.equal(
    (
      await Effect.runPromise(
        handleDashboardTool("restore_dashboard", { id: dashboard.id, revision: 3 }, "fitness", service),
      )
    )?.success,
    true,
  );
  const restored = await Effect.runPromise(service.read(dashboard.id));
  assert.equal(restored.id, dashboard.id);
  assert.equal(restored.createdAt, dashboard.createdAt);
  assert.equal(restored.archivedAt, null);
  assert.equal(restored.revision, 4);
  assert.equal(
    (await Effect.runPromise(service.list())).some((document) => document.id === dashboard.id),
    true,
  );
  assert.equal(
    database.connection
      .prepare("SELECT json_extract(document_json, '$.blocks') AS blocks FROM agent_dashboards WHERE dashboard_id=?")
      .get(dashboard.id)?.blocks,
    originalBlocks,
  );
  assert.equal(
    Result.isFailure(await Effect.runPromise(Effect.result(service.restore({ id: dashboard.id, revision: 4 })))),
    true,
  );
  cases.push(
    "archive and restore survive restart, preserve source blocks, and enforce revision, installation and agent access",
  );
  assert.equal(
    changes.some((event) => event.kind === "dashboard"),
    true,
  );
  cases.push("restart, uninstall and reinstall retain saved data");
  await mkdir(".openbot-build", { recursive: true });
  await writeFile(".openbot-build/dashboards-e2e.json", JSON.stringify({ status: "pass", cases }, null, 2));
} finally {
  database.close();
  await rm(root, { recursive: true, force: true });
}
