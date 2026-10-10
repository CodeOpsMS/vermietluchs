import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Im neuen Testcontainer vor dem ersten Serverstart einen Schema-4-Bestand anlegen.
const filename = path.join(process.env.VERMIETLUCHS_DATA_DIR ?? '/data', 'vermietluchs.sqlite');
assert.equal(fs.existsSync(filename), false, 'Die Testdatenbank darf noch nicht existieren.');
const db = new Database(filename);
try {
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;`);
  for (const name of fs
    .readdirSync('migrations')
    .filter((file) => /^00[1-4]_/.test(file))
    .sort()) {
    db.exec(fs.readFileSync(path.join('migrations', name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      Number.parseInt(name, 10),
      name,
    );
  }
  db.prepare(
    "INSERT INTO properties (id, name, address, revision) VALUES (17, 'Bestand vor Papra', 'Bleibt erhalten', 9)",
  ).run();
  db.prepare(
    `INSERT INTO costs (id, property_id, year, description_internal,
    source_amount_cents, tenant_status, allocable_amount_cents, statement_group,
    allocation_mode, allocation_key, revision)
    VALUES (29, 17, 2023, 'Bestandsbeleg', 123456, 'included', 123456,
    'Grundsteuer', 'standard', 'area', 7)`,
  ).run();
  db.prepare("UPDATE ai_settings SET model = 'existing-model', revision = 11").run();
  assert.deepEqual(db.prepare('SELECT max(version) AS version FROM schema_migrations').get(), {
    version: 4,
  });
} finally {
  db.close();
}
