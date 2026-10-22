// Run: node --import tsx scripts/dashboard-reports-e2e.ts
// Report: .openbot-build/dashboard-reports-e2e.json
// Drives report reads over a real SQLite profile, with saved routine, delivery and answer records.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ConversationMessage, latestTurnAnswer } from "@openbot/contracts/ipc";
import { registerSecretValue } from "@openbot/logging";
import { Effect } from "effect";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { DashboardReportReader } from "../src/main/dashboard-report-reader";

const root = await mkdtemp(join(tmpdir(), "openbot-dashboard-reports-e2e-"));
let database = new OpenBotDatabase(root);
const cases: string[] = [];
let ordinal = 0;
const timestamp = () => new Date(Date.UTC(2026, 9, 1, 7, ordinal)).toISOString();
function routine(id: string): void {
  const stamp = timestamp();
  database.connection
    .prepare(`INSERT INTO projection_agent_routines
    (routine_id,agent_id,name,instruction,active,timezone,created_at,updated_at,last_event_sequence)
    VALUES (?,'chief','Morning report','Report the news.',1,'Europe/Prague',?,?,1)`)
    .run(id, stamp, stamp);
}
function run(routineId: string, status: string, text?: string): { id: string; messageId: string; stamp: string } {
  ordinal += 1;
  const id = `run-${ordinal}`;
  const deliveryId = `delivery-${ordinal}`;
  const turnId = `turn-${ordinal}`;
  const messageId = `answer-${ordinal}`;
  const stamp = timestamp();
  database.connection
    .prepare(`INSERT INTO projection_routine_runs
    (run_id,routine_id,agent_id,trigger_id,run_kind,scheduled_for,routine_name,instruction,delivery_id,status,error,created_at,updated_at,last_event_sequence)
    VALUES (?,?,'chief',NULL,'scheduled',?,'Morning report','Report the news.',?,?,NULL,?,?,1)`)
    .run(id, routineId, stamp, deliveryId, status, stamp, stamp);
  const mailboxId = `request-${ordinal}`;
  database.connection
    .prepare(`INSERT INTO projection_mailbox_messages
    (message_id,sender_kind,sender_agent_id,text,reply_to_message_id,created_at,message_json,last_event_sequence)
    VALUES (?,'system',NULL,'Report the news.',NULL,?,'{}',1)`)
    .run(mailboxId, stamp);
  database.connection
    .prepare(`INSERT INTO projection_deliveries
    (delivery_id,message_id,recipient_agent_id,status,turn_id,error,created_at,delivery_json,last_event_sequence)
    VALUES (?,?,'chief','completed',?,NULL,?,'{}',1)`)
    .run(deliveryId, mailboxId, turnId, stamp);
  if (text !== undefined) {
    const message: ConversationMessage = {
      id: messageId,
      turnId,
      author: "assistant",
      text,
      createdAt: stamp,
      status: "completed",
    };
    database.connection
      .prepare(`INSERT INTO projection_thread_messages
      (thread_id,message_id,turn_id,author,status,item_type,created_at,ordinal,message_json,last_event_sequence)
      VALUES ('thread-chief',?,?,'assistant','completed',NULL,?,?,?,1)`)
      .run(messageId, turnId, stamp, ordinal, JSON.stringify(message));
  }
  return { id, messageId, stamp };
}
function reader(): DashboardReportReader {
  return new DashboardReportReader({
    database,
    answer: (agentId, deliveryId) => {
      const delivery = database.connection
        .prepare("SELECT turn_id FROM projection_deliveries WHERE delivery_id=? AND recipient_agent_id=?")
        .get(deliveryId, agentId);
      if (typeof delivery?.turn_id !== "string") return null;
      const answer = latestTurnAnswer(
        database.readTurnAssistantMessages(agentId, "thread-chief", delivery.turn_id),
        delivery.turn_id,
      );
      return answer ? { text: answer.text, messageId: answer.id } : null;
    },
  });
}
try {
  await runCauseEffect(database.initialize());
  database.connection
    .prepare("INSERT INTO projection_threads VALUES ('thread-chief','chief','Chief',NULL,'2026-10-01','2026-10-01',1)")
    .run();
  routine("morning");
  routine("source-removal");
  routine("long-report");
  let reports = reader();
  assert.deepEqual(await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" })), {
    routineId: "morning",
    status: "idle",
    available: true,
    text: null,
    messageId: null,
    updatedAt: null,
  });
  const first = run(
    "morning",
    "succeeded",
    "# Morning\n\n## World\nNews [source](https://example.com/news).\n\n## TLDR\nA short summary.",
  );
  const initial = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }));
  assert.equal(initial.messageId, first.messageId);
  assert.equal(initial.updatedAt, first.stamp);
  assert.equal(
    initial.text,
    "# Morning\n\n## World\nNews [source](https://example.com/news).\n\n## TLDR\nA short summary.",
  );
  cases.push("original formatted response and source message identity");
  const longText = "界🙂".repeat(30_000);
  const longRun = run("long-report", "succeeded", longText);
  const preview = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "long-report" }));
  assert.equal(preview.truncated, true);
  assert.equal(preview.messageId, longRun.messageId);
  assert.ok(new TextEncoder().encode(preview.text ?? "").byteLength <= 128 * 1024);
  assert.equal(preview.text?.includes("\uFFFD"), false);
  assert.ok(longText.startsWith(preview.text ?? ""));
  cases.push("long UTF-8 reports keep valid text and their full source link");

  run("morning", "queued");
  const pending = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }));
  assert.equal(pending.status, "pending");
  assert.equal(pending.messageId, first.messageId);
  run("morning", "failed");
  const failed = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }));
  assert.equal(failed.status, "failed");
  assert.equal(failed.messageId, first.messageId);
  run("morning", "succeeded", "[[no-update]]");
  assert.equal(
    (await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }))).messageId,
    first.messageId,
  );
  for (let index = 0; index < 55; index += 1) run("morning", "succeeded");
  assert.equal(
    (await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }))).messageId,
    first.messageId,
  );
  cases.push("pending, failed and more than fifty quiet runs retain the last report");
  const secret = "report-secret-value-123456";
  registerSecretValue(secret);
  const latest = run("morning", "succeeded", `# Morning\nBearer example-token-123456\n${secret}`);
  const redacted = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }));
  assert.equal(redacted.messageId, latest.messageId);
  assert.equal(redacted.text?.includes(secret), false);
  assert.equal(redacted.text?.includes("example-token-123456"), false);
  const raw = database.connection
    .prepare("SELECT message_json FROM projection_thread_messages WHERE message_id=?")
    .get(latest.messageId);
  assert.equal(String(raw?.message_json).includes(secret), true);
  cases.push("pattern and registered secret redaction leaves the saved answer unchanged");
  const foreign = await Effect.runPromise(reports.read({ agentId: "fitness", routineId: "morning" }));
  assert.equal(foreign.available, false);
  assert.equal(foreign.text, null);
  const removedSource = run("source-removal", "succeeded", "Disposable saved answer.");
  database.connection.prepare("DELETE FROM projection_thread_messages WHERE message_id=?").run(removedSource.messageId);
  assert.equal((await Effect.runPromise(reports.read({ agentId: "chief", routineId: "source-removal" }))).text, null);
  database.connection.prepare("DELETE FROM projection_agent_routines WHERE routine_id='source-removal'").run();
  const removed = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "source-removal" }));
  assert.equal(removed.available, false);
  assert.equal(removed.status, "unavailable");
  cases.push("removed sources, removed routines and cross-agent access");
  database.close();
  database = new OpenBotDatabase(root);
  await runCauseEffect(database.initialize());
  reports = reader();
  const reopened = await Effect.runPromise(reports.read({ agentId: "chief", routineId: "morning" }));
  assert.equal(reopened.messageId, latest.messageId);
  assert.equal(reopened.text, redacted.text);
  cases.push("restart reads the same saved report without generation");
  await mkdir(".openbot-build", { recursive: true });
  await writeFile(".openbot-build/dashboard-reports-e2e.json", JSON.stringify({ status: "pass", cases }, null, 2));
} finally {
  database.close();
  await rm(root, { recursive: true, force: true });
}
