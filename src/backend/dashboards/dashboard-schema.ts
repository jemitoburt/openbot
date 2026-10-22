// Shared by migration v45 and the latest schema. Existing host data is unchanged.
export const DASHBOARD_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS installed_plugins (
    plugin_id TEXT PRIMARY KEY CHECK(plugin_id = 'dashboards'),
    installed INTEGER NOT NULL CHECK(installed IN (0, 1)),
    version INTEGER NOT NULL CHECK(version = 1)
  );
  CREATE TABLE IF NOT EXISTS agent_dashboards (
    dashboard_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    document_json TEXT NOT NULL CHECK(json_valid(document_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  );
  CREATE INDEX IF NOT EXISTS agent_dashboards_agent ON agent_dashboards(agent_id, updated_at DESC);
`;
