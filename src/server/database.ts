import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export type DatabaseOptions = {
  migrationsDir?: string;
  readonly?: boolean;
};

export function openDatabase(filename: string, options: DatabaseOptions = {}): SqliteDatabase {
  if (filename !== ':memory:' && !options.readonly) {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const db = new Database(filename, { readonly: options.readonly ?? false });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
    runMigrations(db, options.migrationsDir ?? path.resolve(process.cwd(), 'migrations'));
  }
  return db;
}

export function runMigrations(db: SqliteDatabase, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

  for (const name of files) {
    const version = Number.parseInt(name, 10);
    if (!Number.isSafeInteger(version)) throw new Error(`Ungültiger Migrationsname: ${name}`);
    if (applied.get(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(version, name);
    })();
  }

  const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeyErrors.length > 0) {
    throw new Error('Die Datenbank enthält nach der Migration ungültige Fremdschlüssel.');
  }
}
