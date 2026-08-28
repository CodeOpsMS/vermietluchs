import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runMigrations, type SqliteDatabase } from '../src/server/database';

describe('Datenbankmigrationen', () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-migrations-'));
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function migration(name: string, sql: string): void {
    fs.writeFileSync(path.join(directory, name), sql);
  }

  test('lehnt doppelte numerische Versionen ab, bevor eine davon ausgeführt wird', () => {
    migration('002_first.sql', 'CREATE TABLE first_candidate (id INTEGER PRIMARY KEY) STRICT;');
    migration('002_second.sql', 'CREATE TABLE second_candidate (id INTEGER PRIMARY KEY) STRICT;');

    expect(() => runMigrations(db, directory)).toThrow(
      /Doppelte Migrationsversion 2: .*002_first\.sql.*002_second\.sql/,
    );
    const createdTables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('first_candidate', 'second_candidate')`,
      )
      .all();
    expect(createdTables).toEqual([]);
  });

  test('führt nicht aufgefüllte Versionsnummern in numerischer Reihenfolge aus', () => {
    migration('2_create.sql', 'CREATE TABLE migration_order (value TEXT NOT NULL) STRICT;');
    migration('10_insert.sql', "INSERT INTO migration_order (value) VALUES ('zehn');");

    runMigrations(db, directory);

    expect(db.prepare('SELECT value FROM migration_order').all()).toEqual([{ value: 'zehn' }]);
    expect(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
    ).toEqual([
      { version: 2, name: '2_create.sql' },
      { version: 10, name: '10_insert.sql' },
    ]);
  });

  test('lehnt das Umbenennen einer bereits angewendeten Migration ab', () => {
    migration('001_original.sql', 'CREATE TABLE original (id INTEGER PRIMARY KEY) STRICT;');
    runMigrations(db, directory);
    fs.renameSync(
      path.join(directory, '001_original.sql'),
      path.join(directory, '001_renamed.sql'),
    );

    expect(() => runMigrations(db, directory)).toThrow(
      /Migrationsversion 1 wurde als 001_original\.sql angewendet, heißt jetzt aber 001_renamed\.sql/,
    );
    expect(db.prepare('SELECT name FROM schema_migrations WHERE version = 1').get()).toEqual({
      name: '001_original.sql',
    });
  });

  test('bleibt bei unverändertem Namen idempotent', () => {
    migration('001_once.sql', 'CREATE TABLE once_only (id INTEGER PRIMARY KEY) STRICT;');

    runMigrations(db, directory);
    runMigrations(db, directory);

    expect(db.prepare('SELECT count(*) AS total FROM schema_migrations').get()).toEqual({
      total: 1,
    });
  });
});
