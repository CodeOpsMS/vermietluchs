import type { Router } from 'express';
import { readingInputSchema, type ReadingInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { optionalId, parseId, requireRevision, revisionFromIfMatch } from '../http';
import {
  decodeBase,
  deleteRow,
  findRow,
  insertRow,
  listRows,
  updateRow,
  type DatabaseRow,
  type DatabaseValues,
} from './shared';

const readingColumns = ['meter_id', 'date', 'value', 'note'] as const;

function encodeReading(value: ReadingInput): DatabaseValues {
  return {
    meter_id: value.meterId,
    date: value.date,
    value: value.value,
    note: value.note,
  };
}

export function decodeReading(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    meterId: Number(row.meter_id),
    date: String(row.date),
    value: Number(row.value),
    note: String(row.note),
  };
}

export function registerReadingRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/readings', (request, response) => {
    const meterId = optionalId(request.query.meterId);
    const rows =
      meterId === undefined
        ? listRows(db, 'SELECT * FROM readings ORDER BY id')
        : listRows(db, 'SELECT * FROM readings WHERE meter_id = ? ORDER BY date, id', [meterId]);
    response.json(rows.map(decodeReading));
  });

  router.get('/readings/:id', (request, response) => {
    const row = findRow(db, 'readings', parseId(request.params.id));
    response.json(decodeReading(row));
  });

  router.post('/readings', (request, response) => {
    const input = readingInputSchema.parse(request.body);
    const row = insertRow(db, 'readings', readingColumns, encodeReading(input));
    response.status(201).json(decodeReading(row));
  });

  router.put('/readings/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = readingInputSchema.parse(request.body);
    const row = updateRow(
      db,
      'readings',
      readingColumns,
      id,
      requireRevision(input.revision),
      encodeReading(input),
    );
    response.json(decodeReading(row));
  });

  router.delete('/readings/:id', (request, response) => {
    deleteRow(db, 'readings', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
