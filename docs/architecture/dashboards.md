# Dashboards

Dashboards is the first built-in desktop feature plugin. The Marketplace Plugins tab enables it on the selected host.
Only host administrators install or uninstall it. Each agent can have several dashboards. Uninstall retains their data.
External plugin packages, Kanban, and web and mobile plugin interfaces are outside this release.

## Ownership and boundaries

`DashboardService` owns installation state and saved documents in the host's `openbot.db`.
Migration 45 adds `installed_plugins` and `agent_dashboards`; the latest schema uses the same additive SQL.
The SQLite database is the source of truth. The account Worker and Signal do not store dashboard content.

Dashboard documents use schema version 1, stable block and item IDs, agent ownership, and a revision.
Updates, widget edits, checklist actions, and archive operations require the current revision. A stale revision fails without writing.
Desktop widget edits send only new checklist items, a recipe ID and portion count, or a routine ID.
The service applies these changes to the saved source. It does not replace source content with a redacted display value.
Lists contain metadata summaries. Opening one dashboard reads its content separately, within the UTF-8 size limit.
The service checks agent access before reading content and redacts secret values before sending content to callers.

The renderer uses typed IPC through its domain port. Main and preload use separate decoders.
The optional frozen Team API capabilities `plugins-v1` and `dashboards-v1` expose the same domain operations.
A remote request never falls back to local storage. Existing agent read/chat permissions apply; hidden agents remain hidden.
Only the session's own agent can use the dashboard agent tools.

Shared Solid components receive typed data and callbacks. The widget kit includes statistics, text, lists, news,
checklists, progress, projects, timelines, week schedules, weather, callouts, recipes, tables,
line, bar and donut charts, media links, actions, and routine reports. Existing metric, calendar, and detail blocks remain supported.
Cards open a detail dialog. Direct checkboxes and actions keep their own behavior.
The components execute no agent-supplied code. Weather and news come from saved agent data; opening a dashboard does not fetch them.
Calendar entries and checklist items are dashboard data, not bookings or application task records.

The Ask bar sends a normal message to the dashboard's agent. Generation state follows that delivery;
Stop cancels the queued delivery or interrupts its exact running turn. Opening the chat preserves this state.
Export saves public, redacted JSON locally. Share copies public widget JSON to the clipboard; it does not publish a link.

## Routine reports

A report block names an existing routine of the owning agent. The desktop routine picker adds the reference;
an agent can also add it with a dashboard update. Existing routine instructions and delivery remain unchanged.

`DashboardReportReader` resolves completed runs through their delivery records to the original saved final answer.
It uses the same answer selection as routine result delivery. It never starts a provider or generates another summary.
The block preserves Markdown content and source links, shows the saved report date, and opens the source message.
A pending, failed, or quiet run retains the last available report. Missing routines and removed report sources have an unavailable state.
The latest run state is separate from the last report's timestamp. History stays in the conversation.

Reports update after routine and conversation changes. Long reports use a marked 128 KiB UTF-8 preview;
the full response remains in the conversation. Images render as links and report link favicons are disabled.

## Verification

Run focused checks sequentially:

- `node --import tsx scripts/dashboards-e2e.ts`
- `node --import tsx scripts/dashboard-reports-e2e.ts`
- `node --import tsx scripts/dashboard-transport-e2e.ts`
- `bun run test:desktop -- src/backend/dashboard-migration.test.ts src/backend/openbot-database-schema-parity.test.ts`
- `bun run test:desktop -- src/preload/dashboard-decoding.test.ts src/main/ipc-channel-coverage.test.ts`

The scripts write JSON reports under `.openbot-build/`. CI selects them in the reverse-actions lane.
Dashboard and Marketplace stories cover visual states without story play functions.

For desktop integration, start this worktree's dev stack and run
`bun scripts/dashboard-desktop-e2e.ts --allow-mutations` with the required Bun version.
It uses the registered dev:automation connection, creates and archives sample dashboards,
and records viewport metrics, console output, and screenshots in `.openbot-build/dashboard-desktop-e2e/`.
It does not start an agent or run a routine.
