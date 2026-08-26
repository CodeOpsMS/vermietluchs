import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';

export type DatabaseRow = Record<string, unknown>;
export type DatabaseValues = Record<string, string | number | null>;

export type ResourceTable =
  'properties' | 'units' | 'tenancies' | 'costs' | 'meters' | 'readings' | 'payments';

/**
 * Diese vier Felder haben alle fachlichen Datensätze gemeinsam.
 * Die Datenbank verwendet snake_case, die API camelCase.
 */
export function decodeBase(row: DatabaseRow) {
  return {
    id: Number(row.id),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listRows(
  db: SqliteDatabase,
  sql: string,
  parameters: unknown[] = [],
): DatabaseRow[] {
  return db.prepare(sql).all(...parameters) as DatabaseRow[];
}

export function findRow(db: SqliteDatabase, table: ResourceTable, id: number): DatabaseRow {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as DatabaseRow | undefined;
  if (!row) throw new ApiError(404, 'Datensatz nicht gefunden.');
  return row;
}

export function insertRow(
  db: SqliteDatabase,
  table: ResourceTable,
  columns: readonly string[],
  values: DatabaseValues,
): DatabaseRow {
  const placeholders = columns.map((column) => `@${column}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  return db.prepare(sql).get(values) as DatabaseRow;
}

export function updateRow(
  db: SqliteDatabase,
  table: ResourceTable,
  columns: readonly string[],
  id: number,
  expectedRevision: number,
  values: DatabaseValues,
): DatabaseRow {
  const assignments = columns.map((column) => `${column} = @${column}`).join(', ');
  const row = db
    .prepare(
      `
    UPDATE ${table}
    SET ${assignments}, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND revision = @expected_revision
    RETURNING *
  `,
    )
    .get({ ...values, id, expected_revision: expectedRevision }) as DatabaseRow | undefined;

  if (row) return row;
  throwNotFoundOrRevisionConflict(db, table, id);
}

export function deleteRow(
  db: SqliteDatabase,
  table: ResourceTable,
  id: number,
  expectedRevision: number,
): void {
  const result = db
    .prepare(`DELETE FROM ${table} WHERE id = ? AND revision = ?`)
    .run(id, expectedRevision);
  if (result.changes > 0) return;
  throwNotFoundOrRevisionConflict(db, table, id);
}

function throwNotFoundOrRevisionConflict(
  db: SqliteDatabase,
  table: ResourceTable,
  id: number,
): never {
  const current = db.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(id) as
    { revision: number } | undefined;
  if (!current) throw new ApiError(404, 'Datensatz nicht gefunden.');
  throw new ApiError(409, 'Der Datensatz wurde zwischenzeitlich geändert.', {
    currentRevision: current.revision,
  });
}
