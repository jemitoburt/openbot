// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrateOpenBotDatabase } from "./openbot-database-schema";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function databaseAt(version: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  advance(db, version);
  return db;
}
function advance(db: DatabaseSync, version: number): void {
  db.exec(
    `CREATE TEMP TRIGGER stop_at_version BEFORE INSERT ON schema_migrations WHEN new.version > ${version} BEGIN SELECT RAISE(ABORT, 'fixture stop'); END;`,
  );
  expect(() => migrateOpenBotDatabase(db)).toThrow(`migration to version ${version + 1} failed`);
  db.exec("DROP TRIGGER stop_at_version");
}
function contents(db: DatabaseSync): Record<string, unknown[]> {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' AND name NOT LIKE 'agent_memory_search%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map((row) => [String(row.name), db.prepare(`SELECT * FROM "${String(row.name)}"`).all()]),
  );
}
function healthy(db: DatabaseSync): void {
  expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 45 });
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
}
describe("dashboard migration", () => {
  it.each(Array.from({ length: 37 }, (_, index) => index + 8))(
    "preserves all data from released schema %i",
    (version) => {
      const db = databaseAt(version);
      db.prepare(
        "INSERT INTO projection_threads VALUES ('openbot-thread-chief','chief','News 界',NULL,'2026-10-01','2026-10-01',1)",
      ).run();
      if (version < 44) advance(db, 44);
      const before = contents(db);
      migrateOpenBotDatabase(db);
      expect(contents(db)).toEqual({ ...before, installed_plugins: [], agent_dashboards: [] });
      healthy(db);
    },
  );
  it("rolls back all tables and the marker on failure, then retries", () => {
    const db = databaseAt(44);
    const before = contents(db);
    db.exec(
      "CREATE TEMP TRIGGER fail_marker BEFORE INSERT ON schema_migrations WHEN new.version=45 BEGIN SELECT RAISE(ABORT, 'late failure'); END;",
    );
    expect(() => migrateOpenBotDatabase(db)).toThrow("migration to version 45 failed");
    expect(contents(db)).toEqual(before);
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version=45").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    db.exec("DROP TRIGGER fail_marker");
    migrateOpenBotDatabase(db);
    healthy(db);
  });
  it("rejects a future schema and missing history without writes", () => {
    const db = databaseAt(44);
    const before = contents(db);
    db.exec("INSERT INTO schema_migrations VALUES(46,'now')");
    expect(() => migrateOpenBotDatabase(db)).toThrow("newer than this application supports");
    db.exec("DELETE FROM schema_migrations WHERE version=46; DELETE FROM schema_migrations WHERE version=20");
    expect(() => migrateOpenBotDatabase(db)).toThrow("missing version 20");
    expect(contents(db)).toEqual(before);
  });
  it("rejects invalid saved values and retains data across removal", () => {
    const db = databaseAt(44);
    migrateOpenBotDatabase(db);
    expect(() => db.prepare("INSERT INTO installed_plugins VALUES ('dashboards',2,1)").run()).toThrow();
    expect(() =>
      db.prepare("INSERT INTO agent_dashboards VALUES ('d','chief',1,'invalid','now','now',NULL)").run(),
    ).toThrow();
    db.prepare("INSERT INTO agent_dashboards VALUES ('d','chief',1,'{}','now','now',NULL)").run();
    db.prepare("INSERT INTO installed_plugins VALUES ('dashboards',1,1)").run();
    db.prepare("UPDATE installed_plugins SET installed=0").run();
    expect(db.prepare("SELECT dashboard_id FROM agent_dashboards").all()).toEqual([{ dashboard_id: "d" }]);
    healthy(db);
  });
});
