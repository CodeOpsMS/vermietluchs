import type { Router } from 'express';
import { tenancyInputSchema, type TenancyInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';
import { optionalId, parseId, requireRevision, revisionFromIfMatch } from '../http';
import { centsToEuros, eurosToCents } from '../money';
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

const tenancyColumns = [
  'unit_id',
  'tenant_name',
  'tenant_address',
  'start_date',
  'end_date',
  'persons',
  'base_rent_cents',
  'utility_prepayment_cents',
  'garage_prepayment_cents',
  'payment_day',
  'notes',
] as const;

function encodeTenancy(value: TenancyInput): DatabaseValues {
  return {
    unit_id: value.unitId,
    tenant_name: value.tenantName,
    tenant_address: value.tenantAddress,
    start_date: value.startDate,
    end_date: value.endDate,
    persons: value.persons,
    base_rent_cents: eurosToCents(value.baseRent),
    utility_prepayment_cents: eurosToCents(value.utilityPrepayment),
    garage_prepayment_cents: eurosToCents(value.garagePrepayment),
    payment_day: value.paymentDay,
    notes: value.notes,
  };
}

function validateExistingPaymentPeriod(db: SqliteDatabase, id: number, input: TenancyInput): void {
  const row = db
    .prepare(
      `
      SELECT due_date FROM payments
      WHERE tenancy_id = ?
        AND (due_date < ? OR due_date > COALESCE(?, '9999-12-31'))
      ORDER BY due_date
      LIMIT 1
    `,
    )
    .get(id, input.startDate, input.endDate) as { due_date: string } | undefined;
  if (row) {
    throw new ApiError(
      409,
      `Die Monatsbuchung vom ${row.due_date} liegt außerhalb des neuen Mietzeitraums.`,
    );
  }
}

export function decodeTenancy(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    unitId: Number(row.unit_id),
    tenantName: String(row.tenant_name),
    tenantAddress: String(row.tenant_address),
    startDate: String(row.start_date),
    endDate: row.end_date === null ? null : String(row.end_date),
    persons: Number(row.persons),
    baseRent: centsToEuros(Number(row.base_rent_cents)),
    utilityPrepayment: centsToEuros(Number(row.utility_prepayment_cents)),
    garagePrepayment: centsToEuros(Number(row.garage_prepayment_cents)),
    paymentDay: Number(row.payment_day),
    notes: String(row.notes),
  };
}

export function registerTenancyRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/tenancies', (request, response) => {
    const unitId = optionalId(request.query.unitId);
    const propertyId = optionalId(request.query.propertyId);

    let rows: DatabaseRow[];
    if (unitId !== undefined) {
      rows = listRows(db, 'SELECT * FROM tenancies WHERE unit_id = ? ORDER BY start_date, id', [
        unitId,
      ]);
    } else if (propertyId !== undefined) {
      rows = listRows(
        db,
        `SELECT tenancy.* FROM tenancies tenancy
         JOIN units unit ON unit.id = tenancy.unit_id
         WHERE unit.property_id = ? ORDER BY tenancy.start_date, tenancy.id`,
        [propertyId],
      );
    } else {
      rows = listRows(db, 'SELECT * FROM tenancies ORDER BY id');
    }

    response.json(rows.map(decodeTenancy));
  });

  router.get('/tenancies/:id', (request, response) => {
    const row = findRow(db, 'tenancies', parseId(request.params.id));
    response.json(decodeTenancy(row));
  });

  router.post('/tenancies', (request, response) => {
    const input = tenancyInputSchema.parse(request.body);
    const row = insertRow(db, 'tenancies', tenancyColumns, encodeTenancy(input));
    response.status(201).json(decodeTenancy(row));
  });

  router.put('/tenancies/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = tenancyInputSchema.parse(request.body);
    const current = findRow(db, 'tenancies', id);
    if (Number(current.unit_id) !== input.unitId) {
      throw new ApiError(
        400,
        'Ein bestehendes Mietverhältnis kann nicht in eine andere Wohnung verschoben werden.',
      );
    }
    validateExistingPaymentPeriod(db, id, input);
    const row = updateRow(
      db,
      'tenancies',
      tenancyColumns,
      id,
      requireRevision(input.revision),
      encodeTenancy(input),
    );
    response.json(decodeTenancy(row));
  });

  router.delete('/tenancies/:id', (request, response) => {
    deleteRow(db, 'tenancies', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
