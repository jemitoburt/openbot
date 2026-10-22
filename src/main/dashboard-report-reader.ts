import type { DashboardReport } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { redactText } from "@openbot/logging";
import { Effect, Schema } from "effect";
import { isNoUpdateAnswer } from "../backend/agent/routine-quiet-runs";
import { databaseRow, requiredStringColumn } from "../backend/database/database-rows";
import type { OpenBotDatabase } from "../backend/openbot-database";

export class DashboardReportFailed extends Schema.TaggedError<DashboardReportFailed>()("DashboardReportFailed", {
  message: Schema.String,
}) {}

interface DashboardReportDependencies {
  database: OpenBotDatabase;
  /** Reads the saved final answer for this delivery; never starts a provider. */
  answer(agentId: string, deliveryId: string): { text: string; messageId: string } | null;
}

/** Reads routine reports from their original run, delivery, and conversation records. */
export class DashboardReportReader {
  readonly #dependencies: DashboardReportDependencies;

  constructor(dependencies: DashboardReportDependencies) {
    this.#dependencies = dependencies;
  }

  readonly read = Effect.fn("DashboardReports.read")((input: { agentId: string; routineId: string }) =>
    Effect.try({
      try: (): DashboardReport => {
        const { database, answer } = this.#dependencies;
        const result: DashboardReport = {
          routineId: input.routineId,
          status: "unavailable",
          available: false,
          text: null,
          messageId: null,
          updatedAt: null,
        };
        const routine = database.connection
          .prepare("SELECT routine_id FROM projection_agent_routines WHERE routine_id = ? AND agent_id = ?")
          .get(input.routineId, input.agentId);
        if (!routine) return result;
        result.available = true;
        const latest = databaseRow(
          database.connection
            .prepare(
              `SELECT status FROM projection_routine_runs WHERE routine_id = ? AND agent_id = ?
               ORDER BY created_at DESC, run_id DESC LIMIT 1`,
            )
            .get(input.routineId, input.agentId),
        );
        result.status = reportStatus(latest ? requiredStringColumn(latest, "status") : null);
        // Iterate rather than cap the run history: any number of quiet or failed runs can follow a report.
        const runs = database.connection
          .prepare(
            `SELECT delivery_id, updated_at FROM projection_routine_runs
             WHERE routine_id = ? AND agent_id = ? AND status = 'succeeded' AND delivery_id IS NOT NULL
             ORDER BY created_at DESC, run_id DESC`,
          )
          .iterate(input.routineId, input.agentId);
        let missingSource = false;
        for (const value of runs) {
          const run = databaseRow(value);
          if (!run) continue;
          const saved = answer(input.agentId, requiredStringColumn(run, "delivery_id"));
          if (!saved) {
            missingSource = true;
            continue;
          }
          if (!saved.text.trim() || isNoUpdateAnswer(saved.text)) continue;
          const text = redactText(saved.text);
          const preview = reportPreview(text);
          return {
            ...result,
            text: preview.text,
            ...(preview.truncated ? { truncated: true } : {}),
            messageId: saved.messageId,
            updatedAt: requiredStringColumn(run, "updated_at"),
          };
        }
        return missingSource ? { ...result, status: "unavailable", available: false } : result;
      },
      catch: () => new DashboardReportFailed({ message: sourceText("error.dashboard.storage") }),
    }),
  );
}

function reportStatus(status: string | null): DashboardReport["status"] {
  switch (status) {
    case null:
      return "idle";
    case "queued":
      return "pending";
    case "running":
    case "needs-attention":
      return "running";
    case "succeeded":
      return "completed";
    default:
      return "failed";
  }
}

/** Keep the reply below the remote frame limit without splitting a Unicode character. */
function reportPreview(text: string): { text: string; truncated: boolean } {
  const limit = 128 * 1024;
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= limit) return { text, truncated: false };
  let end = limit;
  while (((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
  return { text: new TextDecoder().decode(bytes.subarray(0, end)), truncated: true };
}
