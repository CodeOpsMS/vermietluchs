import type { Router } from 'express';
import { unitInputSchema, type UnitInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';
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

const unitColumns = ['property_id', 'name', 'floor', 'area_sqm', 'unit_weight', 'notes'] as const;

function encodeUnit(value: UnitInput): DatabaseValues {
  return {
    property_id: value.propertyId,
    name: value.name,
    floor: value.floor,
    area_sqm: value.areaSqm,
    unit_weight: value.unitWeight,
    notes: value.notes,
  };
}

export function decodeUnit(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    propertyId: Number(row.property_id),
    name: String(row.name),
    floor: String(row.floor),
    areaSqm: Number(row.area_sqm),
    unitWeight: Number(row.unit_weight),
    notes: String(row.notes),
  };
}

export function registerUnitRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/units', (request, response) => {
    const propertyId = optionalId(request.query.propertyId);
    const rows =
      propertyId === undefined
        ? listRows(db, 'SELECT * FROM units ORDER BY id')
        : listRows(db, 'SELECT * FROM units WHERE property_id = ? ORDER BY id', [propertyId]);
    response.json(rows.map(decodeUnit));
  });

  router.get('/units/:id', (request, response) => {
    const row = findRow(db, 'units', parseId(request.params.id));
    response.json(decodeUnit(row));
  });

  router.post('/units', (request, response) => {
    const input = unitInputSchema.parse(request.body);
    const row = insertRow(db, 'units', unitColumns, encodeUnit(input));
    response.status(201).json(decodeUnit(row));
  });

  router.put('/units/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = unitInputSchema.parse(request.body);
    const current = findRow(db, 'units', id);
    if (Number(current.property_id) !== input.propertyId) {
      throw new ApiError(
        400,
        'Eine bestehende Wohnung kann nicht in ein anderes Objekt verschoben werden.',
      );
    }
    const row = updateRow(
      db,
      'units',
      unitColumns,
      id,
      requireRevision(input.revision),
      encodeUnit(input),
    );
    response.json(decodeUnit(row));
  });

  router.delete('/units/:id', (request, response) => {
    deleteRow(db, 'units', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
