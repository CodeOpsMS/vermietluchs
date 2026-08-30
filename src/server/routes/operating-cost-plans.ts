import type { Router } from 'express';
import { calculateOperatingCostPlan } from '../../domain/operating-cost-plan';
import { operatingCostPlanInputSchema, type OperatingCostPlanInput } from '../../shared/schemas';
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

const planColumns = [
  'property_id',
  'tenancy_id',
  'year',
  'housing_costs_cents',
  'garage_costs_cents',
  'property_tax_cents',
  'months',
  'monthly_prepayment_cents',
  'notes',
] as const;

function encodePlan(value: OperatingCostPlanInput): DatabaseValues {
  return {
    property_id: value.propertyId,
    tenancy_id: value.tenancyId,
    year: value.year,
    housing_costs_cents: eurosToCents(value.housingCosts),
    garage_costs_cents: eurosToCents(value.garageCosts),
    property_tax_cents: eurosToCents(value.propertyTax),
    months: value.months,
    monthly_prepayment_cents:
      value.monthlyPrepayment === null ? null : eurosToCents(value.monthlyPrepayment),
    notes: value.notes,
  };
}

export function decodeOperatingCostPlan(row: DatabaseRow) {
  const monthlyPrepaymentCents =
    row.monthly_prepayment_cents === null ? null : Number(row.monthly_prepayment_cents);
  const calculation = calculateOperatingCostPlan({
    housingCostsCents: Number(row.housing_costs_cents),
    garageCostsCents: Number(row.garage_costs_cents),
    propertyTaxCents: Number(row.property_tax_cents),
    months: Number(row.months),
    monthlyPrepaymentCents,
  });

  return {
    ...decodeBase(row),
    propertyId: Number(row.property_id),
    tenancyId: Number(row.tenancy_id),
    year: Number(row.year),
    housingCosts: centsToEuros(Number(row.housing_costs_cents)),
    garageCosts: centsToEuros(Number(row.garage_costs_cents)),
    propertyTax: centsToEuros(Number(row.property_tax_cents)),
    months: Number(row.months),
    monthlyPrepayment:
      monthlyPrepaymentCents === null ? null : centsToEuros(monthlyPrepaymentCents),
    notes: String(row.notes),
    annualTotal: centsToEuros(calculation.annualTotalCents),
    calculatedMonthlyAmount: centsToEuros(calculation.calculatedMonthlyAmountCents),
    monthlyDifference:
      calculation.monthlyDifferenceCents === null
        ? null
        : centsToEuros(calculation.monthlyDifferenceCents),
  };
}

function validatePlanReferences(db: SqliteDatabase, values: DatabaseValues): void {
  const row = db
    .prepare(
      `SELECT unit.property_id, tenancy.start_date, tenancy.end_date
       FROM tenancies tenancy
       JOIN units unit ON unit.id = tenancy.unit_id
       WHERE tenancy.id = ?`,
    )
    .get(values.tenancy_id) as
    { property_id: number; start_date: string; end_date: string | null } | undefined;
  if (!row) throw new ApiError(400, 'Das Mietverhältnis existiert nicht.');
  if (row.property_id !== Number(values.property_id)) {
    throw new ApiError(400, 'Das Mietverhältnis gehört zu einem anderen Objekt.');
  }

  const selectedYear = Number(values.year);
  if (
    row.start_date > `${selectedYear}-12-31` ||
    (row.end_date !== null && row.end_date < `${selectedYear}-01-01`)
  ) {
    throw new ApiError(400, 'Das Mietverhältnis liegt nicht im Jahr des Wirtschaftsplans.');
  }
}

export function registerOperatingCostPlanRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/operating-cost-plans', (request, response) => {
    const propertyId = optionalId(request.query.propertyId);
    const tenancyId = optionalId(request.query.tenancyId);
    const year = optionalYear(request.query.year);
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    if (propertyId !== undefined) {
      clauses.push('property_id = ?');
      parameters.push(propertyId);
    }
    if (tenancyId !== undefined) {
      clauses.push('tenancy_id = ?');
      parameters.push(tenancyId);
    }
    if (year !== undefined) {
      clauses.push('year = ?');
      parameters.push(year);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = listRows(
      db,
      `SELECT * FROM operating_cost_plans${where} ORDER BY year, tenancy_id, id`,
      parameters,
    );
    response.json(rows.map(decodeOperatingCostPlan));
  });

  router.get('/operating-cost-plans/:id', (request, response) => {
    response.json(
      decodeOperatingCostPlan(findRow(db, 'operating_cost_plans', parseId(request.params.id))),
    );
  });

  router.post('/operating-cost-plans', (request, response) => {
    const input = operatingCostPlanInputSchema.parse(request.body);
    const values = encodePlan(input);
    validatePlanReferences(db, values);
    const row = insertRow(db, 'operating_cost_plans', planColumns, values);
    response.status(201).json(decodeOperatingCostPlan(row));
  });

  router.put('/operating-cost-plans/:id', (request, response) => {
    const id = parseId(request.params.id);
    const input = operatingCostPlanInputSchema.parse(request.body);
    const values = encodePlan(input);
    validatePlanReferences(db, values);
    const row = updateRow(
      db,
      'operating_cost_plans',
      planColumns,
      id,
      requireRevision(input.revision),
      values,
    );
    response.json(decodeOperatingCostPlan(row));
  });

  router.delete('/operating-cost-plans/:id', (request, response) => {
    deleteRow(db, 'operating_cost_plans', parseId(request.params.id), revisionFromIfMatch(request));
    response.status(204).end();
  });
}
