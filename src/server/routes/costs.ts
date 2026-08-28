import type { Router } from 'express';
import { costInputSchema, type CostInput } from '../../shared/schemas';
import type { SqliteDatabase } from '../database';
import { ApiError } from '../errors';
import { optionalId, optionalYear, parseId, requireRevision, revisionFromIfMatch } from '../http';
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

const costColumns = [
  'property_id',
  'year',
  'description_internal',
  'description_tenant',
  'source_amount_cents',
  'tenant_status',
  'allocable_amount_cents',
  'statement_group',
  'allocation_mode',
  'allocation_key',
  'direct_unit_id',
  'direct_tenancy_id',
  'meter_type',
  'labor_35a_cents',
  'notes',
] as const;

function encodeCost(value: CostInput): DatabaseValues {
  return {
    property_id: value.propertyId,
    year: value.year,
    description_internal: value.descriptionInternal,
    description_tenant: value.descriptionTenant,
    source_amount_cents: eurosToCents(value.sourceAmount),
    tenant_status: value.tenantStatus,
    allocable_amount_cents: eurosToCents(value.allocableAmount),
    statement_group: value.statementGroup,
    allocation_mode: value.allocationMode,
    allocation_key: value.allocationKey,
    direct_unit_id: value.directUnitId,
    direct_tenancy_id: value.directTenancyId,
    meter_type: value.meterType,
    labor_35a_cents: eurosToCents(value.labor35a),
    notes: value.notes,
  };
}

export function decodeCost(row: DatabaseRow) {
  return {
    ...decodeBase(row),
    propertyId: Number(row.property_id),
    year: Number(row.year),
    descriptionInternal: String(row.description_internal),
    descriptionTenant: String(row.description_tenant),
    sourceAmount: centsToEuros(Number(row.source_amount_cents)),
    tenantStatus: String(row.tenant_status),
    allocableAmount: centsToEuros(Number(row.allocable_amount_cents)),
    statementGroup: String(row.statement_group),
    allocationMode: String(row.allocation_mode),
    allocationKey: String(row.allocation_key),
    directUnitId: row.direct_unit_id === null ? null : Number(row.direct_unit_id),
    directTenancyId: row.direct_tenancy_id === null ? null : Number(row.direct_tenancy_id),
    meterType: row.meter_type === null ? null : String(row.meter_type),
    labor35a: centsToEuros(Number(row.labor_35a_cents)),
    notes: String(row.notes),
  };
}

export function registerCostRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/costs', (request, response) => {
    const propertyId = optionalId(request.query.propertyId);
    const year = optionalYear(request.query.year);
    const clauses: string[] = [];
    const parameters: unknown[] = [];

    if (propertyId !== undefined) {
      clauses.push('property_id = ?');
      parameters.push(propertyId);
    }
    if (year !== undefined) {
      clauses.push('year = ?');
      parameters.push(year);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = listRows(db, `SELECT * FROM costs${where} ORDER BY year, id`, parameters);
    response.json(rows.map(decodeCost));
  });

  router.get('/costs/:id', (request, response) => {
    const row = findRow(db, 'costs', parseId(request.params.id));
    response.json(decodeCost(row));
  });

  router.post('/costs', (request, response) => {
    const input = costInputSchema.parse(request.body);
    const values = encodeCost(input);
    validateCostReferences(db, values);
    const row = insertRow(db, 'costs', costColumns, values);
    response.status(201).json(decodeCost(row));
  });

  router.put('/costs/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = costInputSchema.parse(request.body);
    const values = encodeCost(input);
    validateCostReferences(db, values);
    const row = updateRow(db, 'costs', costColumns, id, requireRevision(input.revision), values);
    response.json(decodeCost(row));
  });

  router.delete('/costs/:id', (request, response) => {
    deleteRow(db, 'costs', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}

function validateCostReferences(db: SqliteDatabase, values: DatabaseValues): void {
  const propertyId = Number(values.property_id);
  if (values.direct_unit_id !== null) {
    const unit = db
      .prepare('SELECT property_id FROM units WHERE id = ?')
      .get(values.direct_unit_id) as { property_id: number } | undefined;
    if (!unit) {
      throw new ApiError(400, 'Die direkt zugeordnete Wohnung existiert nicht.');
    }
    if (unit.property_id !== propertyId) {
      throw new ApiError(400, 'Die direkt zugeordnete Wohnung gehört zu einem anderen Objekt.');
    }
  }

  if (values.direct_tenancy_id !== null) {
    const row = db
      .prepare(
        `SELECT unit.property_id, tenancy.start_date, tenancy.end_date
        FROM tenancies tenancy
        JOIN units unit ON unit.id = tenancy.unit_id
        WHERE tenancy.id = ?`,
      )
      .get(values.direct_tenancy_id) as
      { property_id: number; start_date: string; end_date: string | null } | undefined;
    if (!row) {
      throw new ApiError(400, 'Das direkt zugeordnete Mietverhältnis existiert nicht.');
    }
    if (row.property_id !== propertyId) {
      throw new ApiError(
        400,
        'Das direkt zugeordnete Mietverhältnis gehört zu einem anderen Objekt.',
      );
    }
    const selectedYear = Number(values.year);
    if (
      row.start_date > `${selectedYear}-12-31` ||
      (row.end_date !== null && row.end_date < `${selectedYear}-01-01`)
    ) {
      throw new ApiError(400, 'Das direkt zugeordnete Mietverhältnis liegt nicht im Kostenjahr.');
    }
  }
}
