import type { Router } from 'express';
import { meterInputSchema, type MeterInput } from '../../shared/schemas';
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

const meterColumns = ['unit_id', 'name', 'meter_number', 'type', 'unit_label'] as const;

function encodeMeter(value: MeterInput): DatabaseValues {
  return {
    unit_id: value.unitId,
    name: value.name,
    meter_number: value.meterNumber,
    type: value.type,
    unit_label: value.unitLabel,
  };
}

export function decodeMeter(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    unitId: Number(row.unit_id),
    name: String(row.name),
    meterNumber: String(row.meter_number),
    type: String(row.type),
    unitLabel: String(row.unit_label),
  };
}

export function registerMeterRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/meters', (request, response) => {
    const unitId = optionalId(request.query.unitId);
    const propertyId = optionalId(request.query.propertyId);

    let rows: DatabaseRow[];
    if (unitId !== undefined) {
      rows = listRows(db, 'SELECT * FROM meters WHERE unit_id = ? ORDER BY id', [unitId]);
    } else if (propertyId !== undefined) {
      rows = listRows(
        db,
        `SELECT meter.* FROM meters meter
         JOIN units unit ON unit.id = meter.unit_id
         WHERE unit.property_id = ? ORDER BY meter.id`,
        [propertyId],
      );
    } else {
      rows = listRows(db, 'SELECT * FROM meters ORDER BY id');
    }

    response.json(rows.map(decodeMeter));
  });

  router.get('/meters/:id', (request, response) => {
    const row = findRow(db, 'meters', parseId(request.params.id));
    response.json(decodeMeter(row));
  });

  router.post('/meters', (request, response) => {
    const input = meterInputSchema.parse(request.body);
    const row = insertRow(db, 'meters', meterColumns, encodeMeter(input));
    response.status(201).json(decodeMeter(row));
  });

  router.put('/meters/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = meterInputSchema.parse(request.body);
    const row = updateRow(
      db,
      'meters',
      meterColumns,
      id,
      requireRevision(input.revision),
      encodeMeter(input),
    );
    response.json(decodeMeter(row));
  });

  router.delete('/meters/:id', (request, response) => {
    deleteRow(db, 'meters', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
