// Run: node --import tsx scripts/dashboard-transport-e2e.ts
// Uses real HTTP requests, frozen codecs, route authorization, and SQLite dashboard services.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentAccessLevel, DashboardChange, DashboardDocument, TeamMemberSummary } from "@openbot/contracts/ipc";
import {
  DASHBOARD_ARCHIVE_ROUTES,
  DASHBOARDS_ARCHIVE_CAPABILITY,
} from "@openbot/contracts/team-protocol/dashboards-archive-v1";
import {
  DASHBOARD_CODECS,
  DASHBOARD_ROUTES,
  DASHBOARDS_CAPABILITY,
  PLUGIN_ROUTES,
  PLUGINS_CAPABILITY,
} from "@openbot/contracts/team-protocol/dashboards-v1";
import { optionalRouteCodec } from "@openbot/contracts/team-protocol/optional-routes";
import { registerSecretValue } from "@openbot/logging";
import { Effect } from "effect";
import { DashboardService } from "../src/backend/dashboards/dashboard-service";
import { databaseRow, requiredStringColumn } from "../src/backend/database/database-rows";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { DashboardReportReader } from "../src/main/dashboard-report-reader";
import {
  decodeDashboardFromHost,
  decodeDashboardSummariesFromHost,
  decodePluginStateFromHost,
} from "../src/main/remote-dashboard-decoding";
import { HttpError } from "../src/main/team-api/http-error";
import type { TeamApiRequestContext } from "../src/main/team-api/request-context";
import { routeDashboards } from "../src/main/team-api/route-dashboards";

const root = await mkdtemp(join(tmpdir(), "openbot-dashboard-transport-"));
const database = new OpenBotDatabase(root);
const changes: DashboardChange[] = [];
const service = new DashboardService({
  database,
  agentExists: (id) => id === "fitness" || id === "chief",
  routineBelongsToAgent: (routineId, agentId) => routineId === "morning" && agentId === "chief",
  changed: (change) => changes.push(change),
});
const reports = new DashboardReportReader({ database, answer: () => null });
const cases: string[] = [];
const member: TeamMemberSummary = {
  id: "member",
  username: "member",
  email: null,
  name: null,
  role: "member",
  createdAt: "2026-10-22T00:00:00.000Z",
  disabled: false,
};
const server = createServer((request, response) => {
  void (async () => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const codec = optionalRouteCodec(pathname);
    const role = request.headers["x-check-role"] === "owner" ? "owner" : "member";
    const level: AgentAccessLevel = request.headers["x-check-access"] === "view" ? "view" : "chat";
    const capabilities =
      request.headers["x-check-old"] === "true"
        ? new Set<string>()
        : new Set([PLUGINS_CAPABILITY, DASHBOARDS_CAPABILITY, DASHBOARDS_ARCHIVE_CAPABILITY]);
    if (request.headers["x-check-no-archive"] === "true") capabilities.delete(DASHBOARDS_ARCHIVE_CAPABILITY);
    const context: TeamApiRequestContext = {
      request,
      response,
      method: request.method ?? "GET",
      url: new URL(pathname, "http://localhost"),
      protocol: 7,
      capabilities,
      member: { ...member, role },
      token: "test",
      sessionId: "session",
      sessionExpiresAt: "2026-10-23T00:00:00.000Z",
      agentLevel: (id) => (role === "owner" ? "manage" : id === "fitness" ? level : "none"),
      json: (status, value) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(codec ? codec.response(status, value) : value));
        return "handled";
      },
      empty: (status) => {
        response.writeHead(status);
        response.end();
        return "handled";
      },
    };
    try {
      const result = await routeDashboards(context, service, reports, new Set(role === "owner" ? [] : ["chief"]));
      if (result !== "handled") {
        response.writeHead(404);
        response.end();
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }));
    }
  })();
});
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
async function call(path: string, body: { [key: string]: Json }, headers: Record<string, string> = {}) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const value: Json = await response.json();
  return { status: response.status, value };
}
function document(value: unknown): DashboardDocument {
  return decodeDashboardFromHost(value);
}
try {
  await runCauseEffect(database.initialize());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  assert.equal((await call(PLUGIN_ROUTES.state, {})).status, 200);
  assert.equal((await call(PLUGIN_ROUTES.setInstalled, { installed: true })).status, 403);
  assert.equal(decodePluginStateFromHost((await call(PLUGIN_ROUTES.state, {})).value).installed, false);
  assert.equal((await call(PLUGIN_ROUTES.setInstalled, { installed: true }, { "x-check-role": "owner" })).status, 200);
  cases.push("host administrator installs; member cannot install");
  const first = await call(DASHBOARD_ROUTES.create, {
    agentId: "fitness",
    title: "Training",
    blocks: [
      { id: "shopping", title: "Shopping", type: "checklist", items: [{ id: "eggs", text: "Eggs", checked: false }] },
    ],
  });
  assert.equal(first.status, 200);
  const fitness = document(first.value);
  // The owner can create an agent's document even when this fixture's member cannot see it.
  const chief = await Effect.runPromise(
    service.create({
      agentId: "chief",
      title: "News",
      blocks: [{ id: "report", title: "Morning", type: "report", routineId: "morning" }],
    }),
  );
  const summaries = decodeDashboardSummariesFromHost((await call(DASHBOARD_ROUTES.list, {})).value);
  assert.equal(summaries.length, 1);
  const firstSummary = summaries[0];
  assert.ok(firstSummary);
  assert.equal("blocks" in firstSummary, false);
  assert.notEqual((await call(DASHBOARD_ROUTES.read, { id: chief.id })).status, 200);
  assert.notEqual((await call(DASHBOARD_ROUTES.report, { dashboardId: chief.id, blockId: "report" })).status, 200);
  cases.push("agent access filters documents and report reads");
  const secret = "dashkey1";
  registerSecretValue(secret);
  const expanded = await call(DASHBOARD_ROUTES.create, {
    agentId: "fitness",
    title: `${secret} `.repeat(22),
    blocks: [{ id: "expanded", type: "text", title: "Redaction", text: `${secret} `.repeat(2_222) }],
  });
  assert.equal(expanded.status, 200);
  const expandedDocument = document(expanded.value);
  assert.ok(expandedDocument.title.length > 200);
  assert.ok(expandedDocument.blocks[0]?.type === "text" && expandedDocument.blocks[0].text.length > 20_000);
  assert.equal(JSON.stringify(expandedDocument).includes(secret), false);
  assert.equal(
    document((await call(DASHBOARD_ROUTES.read, { id: expandedDocument.id })).value).id,
    expandedDocument.id,
  );
  assert.ok(
    decodeDashboardSummariesFromHost((await call(DASHBOARD_ROUTES.list, {})).value).some(
      (summary) => summary.id === expandedDocument.id,
    ),
  );
  cases.push("expanded redaction survives frozen response codecs and remote decoders");
  database.connection
    .prepare(
      "INSERT INTO projection_agent_routines (routine_id,agent_id,name,instruction,active,timezone,created_at,updated_at,last_event_sequence) VALUES ('morning','chief',?,'Write news.',1,'Europe/Prague',?,?,0)",
    )
    .run(`Morning ${secret}`, "2026-10-22T06:00:00.000Z", "2026-10-22T06:00:00.000Z");
  const editable = document(
    (
      await call(DASHBOARD_ROUTES.create, {
        agentId: "fitness",
        title: `Private ${secret}`,
        blocks: [
          { id: "private", type: "text", title: "Keep source", text: `Keep ${secret}` },
          {
            id: "shopping-edit",
            type: "checklist",
            title: `Shopping ${secret}`,
            items: [{ id: "original", text: `Original ${secret}`, checked: false }],
          },
          {
            id: "recipe-edit",
            type: "rich",
            title: "Recipe",
            sections: [],
            portions: 1,
            targetChecklistId: "shopping-edit",
            ingredients: [{ label: `Ingredient ${secret}`, quantity: 2, unit: "g" }],
          },
        ],
      })
    ).value,
  );
  const manualEdit = {
    id: editable.id,
    revision: 1,
    edit: {
      type: "addChecklistItems",
      blockId: "shopping-edit",
      items: [{ id: "manual", text: "Milk", checked: false }],
    },
  };
  assert.equal((await call(DASHBOARD_ROUTES.editWidget, manualEdit, { "x-check-access": "view" })).status, 403);
  const appended = await call(DASHBOARD_ROUTES.editWidget, manualEdit);
  assert.equal(appended.status, 200);
  assert.equal(document(appended.value).revision, 2);
  assert.equal((await call(DASHBOARD_ROUTES.editWidget, manualEdit)).status, 409);
  const recipeEdit = await call(DASHBOARD_ROUTES.editWidget, {
    id: editable.id,
    revision: 2,
    edit: { type: "addRecipeIngredients", recipeBlockId: "recipe-edit", portions: 2 },
  });
  assert.equal(recipeEdit.status, 200);
  const recipeResult = document(recipeEdit.value);
  const shopping = recipeResult.blocks.find((block) => block.id === "shopping-edit");
  assert.ok(shopping?.type === "checklist");
  assert.equal(shopping.items.at(-1)?.quantity, 4);
  const rawEdited = databaseRow(
    database.connection.prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id = ?").get(editable.id),
  );
  assert.ok(rawEdited);
  const rawSource = requiredStringColumn(rawEdited, "document_json");
  assert.ok(rawSource.includes(`Original ${secret}`));
  assert.ok(rawSource.includes(`Keep ${secret}`));
  assert.ok(rawSource.includes(`Ingredient ${secret}`));
  const reportTarget = await Effect.runPromise(
    service.create({
      agentId: "chief",
      title: `Chief ${secret}`,
      blocks: [{ id: "original-news", type: "text", title: "Source", text: `Keep news ${secret}` }],
    }),
  );
  const reportEdit = { id: reportTarget.id, revision: 1, edit: { type: "addReport", routineId: "morning" } };
  assert.equal((await call(DASHBOARD_ROUTES.editWidget, reportEdit)).status, 404);
  const reportAdded = await call(DASHBOARD_ROUTES.editWidget, reportEdit, { "x-check-role": "owner" });
  assert.equal(reportAdded.status, 200);
  const reportDocument = document(reportAdded.value);
  const reportBlock = reportDocument.blocks.find((block) => block.type === "report");
  assert.ok(reportBlock?.type === "report");
  assert.ok(reportBlock.title.includes("[redacted]"));
  const rawReport = databaseRow(
    database.connection
      .prepare("SELECT document_json FROM agent_dashboards WHERE dashboard_id = ?")
      .get(reportTarget.id),
  );
  assert.ok(rawReport);
  assert.ok(requiredStringColumn(rawReport, "document_json").includes(`Keep news ${secret}`));
  cases.push(
    "remote widget edits preserve raw source, enforce access and revisions, and derive recipes and report titles on the host",
  );

  assert.equal(
    (
      await call(
        DASHBOARD_ROUTES.toggleItem,
        { id: fitness.id, revision: 1, blockId: "shopping", itemId: "eggs", checked: true },
        { "x-check-access": "view" },
      )
    ).status,
    403,
  );
  const changed = await call(DASHBOARD_ROUTES.toggleItem, {
    id: fitness.id,
    revision: 1,
    blockId: "shopping",
    itemId: "eggs",
    checked: true,
  });
  assert.equal(changed.status, 200);
  assert.equal(document(changed.value).revision, 2);
  assert.equal(
    (await call(DASHBOARD_ROUTES.update, { id: fitness.id, revision: 1, title: "Stale", blocks: [] })).status,
    409,
  );
  assert.equal(
    (
      await call(DASHBOARD_ROUTES.toggleItem, {
        id: fitness.id,
        revision: 1,
        blockId: "shopping",
        itemId: "eggs",
        checked: false,
      })
    ).status,
    409,
  );
  cases.push("checklist writes require chat access and reject stale writes");
  assert.equal(
    (
      await call(DASHBOARD_ROUTES.create, {
        agentId: "fitness",
        title: "Invalid",
        blocks: [{ id: "code", type: "html", title: "Unsafe", html: "<script/>" }],
      })
    ).status,
    400,
  );
  assert.equal((await call(DASHBOARD_ROUTES.list, {}, { "x-check-old": "true" })).status, 400);
  cases.push("malformed blocks and missing capabilities fail closed");
  const archived = await call(DASHBOARD_ROUTES.archive, { id: fitness.id, revision: 2 });
  assert.equal(archived.status, 200);
  const archivedFitness = document(archived.value);
  assert.equal(archivedFitness.revision, 3);
  assert.ok(archivedFitness.archivedAt);
  assert.equal((await call(DASHBOARD_ROUTES.read, { id: fitness.id })).status, 404);
  assert.equal(document((await call(DASHBOARD_ARCHIVE_ROUTES.read, { id: fitness.id })).value).revision, 3);
  const archivedSummary = decodeDashboardSummariesFromHost(
    (await call(DASHBOARD_ARCHIVE_ROUTES.list, { agentId: "fitness", includeArchived: true })).value,
  ).find((summary) => summary.id === fitness.id);
  assert.equal(archivedSummary?.archivedAt, archivedFitness.archivedAt);
  for (const path of [DASHBOARD_ROUTES.list, DASHBOARD_ARCHIVE_ROUTES.list]) {
    const active = decodeDashboardSummariesFromHost((await call(path, { agentId: "fitness" })).value);
    assert.equal(
      active.some((summary) => summary.id === fitness.id),
      false,
    );
  }
  const oldList = decodeDashboardSummariesFromHost(
    (await call(DASHBOARD_ROUTES.list, { includeArchived: true })).value,
  );
  assert.equal(
    oldList.some((summary) => summary.id === fitness.id),
    false,
  );
  const oldListCodec = DASHBOARD_CODECS.get(DASHBOARD_ROUTES.list);
  assert.ok(oldListCodec);
  assert.deepEqual(oldListCodec.request({ agentId: "fitness", includeArchived: true }), { agentId: "fitness" });
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.list, { includeArchived: "true" })).status, 400);
  for (const [path, input] of [
    [DASHBOARD_ARCHIVE_ROUTES.list, { includeArchived: true }],
    [DASHBOARD_ARCHIVE_ROUTES.read, { id: fitness.id }],
    [DASHBOARD_ARCHIVE_ROUTES.restore, { id: fitness.id, revision: 3 }],
  ] satisfies [string, { [key: string]: Json }][]) {
    assert.equal((await call(path, input, { "x-check-no-archive": "true" })).status, 400);
  }
  assert.equal((await call(DASHBOARD_ROUTES.list, {}, { "x-check-no-archive": "true" })).status, 200);
  cases.push("archive reads use a separate capability and leave frozen active-only list behavior unchanged");
  await Effect.runPromise(service.archive({ id: chief.id, revision: 1 }));
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.read, { id: chief.id })).status, 404);
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.restore, { id: chief.id, revision: 2 })).status, 404);
  assert.equal(
    decodeDashboardSummariesFromHost((await call(DASHBOARD_ARCHIVE_ROUTES.list, { includeArchived: true })).value).some(
      (summary) => summary.id === chief.id,
    ),
    false,
  );
  assert.equal(
    (await call(DASHBOARD_ARCHIVE_ROUTES.read, { id: fitness.id }, { "x-check-access": "view" })).status,
    200,
  );
  assert.equal(
    (await call(DASHBOARD_ARCHIVE_ROUTES.restore, { id: fitness.id, revision: 3 }, { "x-check-access": "view" }))
      .status,
    403,
  );
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.restore, { id: fitness.id, revision: 2 })).status, 409);
  const restored = await call(DASHBOARD_ARCHIVE_ROUTES.restore, { id: fitness.id, revision: 3 });
  assert.equal(restored.status, 200);
  const restoredFitness = document(restored.value);
  assert.equal(restoredFitness.revision, 4);
  assert.equal(restoredFitness.archivedAt, null);
  assert.deepEqual(restoredFitness.blocks, archivedFitness.blocks);
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.restore, { id: fitness.id, revision: 4 })).status, 409);
  assert.equal(document((await call(DASHBOARD_ROUTES.read, { id: fitness.id })).value).revision, 4);
  cases.push("archive recovery keeps blocks, enforces agent access, rejects stale writes, and restores active reads");
  await call(PLUGIN_ROUTES.setInstalled, { installed: false }, { "x-check-role": "owner" });
  assert.equal((await call(DASHBOARD_ROUTES.read, { id: fitness.id })).status, 409);
  assert.equal((await call(DASHBOARD_ARCHIVE_ROUTES.read, { id: fitness.id })).status, 409);
  await call(PLUGIN_ROUTES.setInstalled, { installed: true }, { "x-check-role": "owner" });
  assert.equal(document((await call(DASHBOARD_ROUTES.read, { id: fitness.id })).value).revision, 4);
  assert.ok(changes.some((change) => change.kind === "installation"));
  assert.ok(changes.some((change) => change.dashboardId === fitness.id));
  cases.push("uninstall disables reads; reinstall retains data and change events");
  await mkdir(".openbot-build", { recursive: true });
  await writeFile(".openbot-build/dashboard-transport-e2e.json", JSON.stringify({ status: "pass", cases }, null, 2));
} catch (error) {
  await mkdir(".openbot-build", { recursive: true });
  await writeFile(
    ".openbot-build/dashboard-transport-e2e.json",
    JSON.stringify(
      { status: "fail", cases, error: error instanceof Error ? error.message : "Transport check failed." },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (server.listening)
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  database.close();
  await rm(root, { recursive: true, force: true });
}
