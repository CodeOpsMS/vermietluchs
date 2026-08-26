import type { Router } from 'express';
import { z } from 'zod';
import type { SqliteDatabase } from './database';
import { ApiError } from './errors';
import { centsToEuros } from './money';

const querySchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(1900).max(2200),
});

type DashboardRow = {
  units: number;
  tenancies: number;
  meters: number;
  readings: number;
  costs: number;
  pending_costs: number;
  closed_settlements: number;
  source_costs_cents: number;
  allocable_costs_cents: number;
  labor_35a_cents: number;
  base_rent_due_cents: number;
  utility_due_cents: number;
  garage_due_cents: number;
  paid_cents: number;
};

export function registerDashboardRoute(router: Router, db: SqliteDatabase): void {
  router.get('/dashboard', (request, response) => {
    const { propertyId, year } = querySchema.parse(request.query);
    const property = db.prepare('SELECT id, name FROM properties WHERE id = ?').get(propertyId) as
      { id: number; name: string } | undefined;
    if (!property) throw new ApiError(404, 'Objekt nicht gefunden.');
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const row = db
      .prepare(
        `
      SELECT
        (SELECT count(*) FROM units WHERE property_id = @propertyId) AS units,
        (SELECT count(*) FROM tenancies tenancy
          JOIN units unit ON unit.id = tenancy.unit_id
          WHERE unit.property_id = @propertyId
            AND tenancy.start_date <= @to
            AND COALESCE(tenancy.end_date, '9999-12-31') >= @from) AS tenancies,
        (SELECT count(*) FROM meters meter
          JOIN units unit ON unit.id = meter.unit_id
          WHERE unit.property_id = @propertyId) AS meters,
        (SELECT count(*) FROM readings reading
          JOIN meters meter ON meter.id = reading.meter_id
          JOIN units unit ON unit.id = meter.unit_id
          WHERE unit.property_id = @propertyId AND reading.date BETWEEN @from AND @to) AS readings,
        (SELECT count(*) FROM costs WHERE property_id = @propertyId AND year = @year) AS costs,
        (SELECT count(*) FROM costs WHERE property_id = @propertyId AND year = @year AND tenant_status = 'pending') AS pending_costs,
        (SELECT count(*) FROM settlement_snapshots WHERE property_id = @propertyId AND year = @year) AS closed_settlements,
        COALESCE((SELECT sum(source_amount_cents) FROM costs WHERE property_id = @propertyId AND year = @year), 0) AS source_costs_cents,
        COALESCE((SELECT sum(allocable_amount_cents) FROM costs WHERE property_id = @propertyId AND year = @year), 0) AS allocable_costs_cents,
        COALESCE((SELECT sum(labor_35a_cents) FROM costs WHERE property_id = @propertyId AND year = @year), 0) AS labor_35a_cents,
        COALESCE((SELECT sum(payment.base_rent_due_cents) FROM payments payment
          JOIN tenancies tenancy ON tenancy.id = payment.tenancy_id
          JOIN units unit ON unit.id = tenancy.unit_id
          WHERE unit.property_id = @propertyId AND payment.due_date BETWEEN @from AND @to), 0) AS base_rent_due_cents,
        COALESCE((SELECT sum(payment.utility_due_cents) FROM payments payment
          JOIN tenancies tenancy ON tenancy.id = payment.tenancy_id
          JOIN units unit ON unit.id = tenancy.unit_id
          WHERE unit.property_id = @propertyId AND payment.due_date BETWEEN @from AND @to), 0) AS utility_due_cents,
        COALESCE((SELECT sum(payment.garage_due_cents) FROM payments payment
          JOIN tenancies tenancy ON tenancy.id = payment.tenancy_id
          JOIN units unit ON unit.id = tenancy.unit_id
          WHERE unit.property_id = @propertyId AND payment.due_date BETWEEN @from AND @to), 0) AS garage_due_cents,
        COALESCE((SELECT sum(payment.amount_paid_cents) FROM payments payment
          JOIN tenancies tenancy ON tenancy.id = payment.tenancy_id
          JOIN units unit ON unit.id = tenancy.unit_id
          WHERE unit.property_id = @propertyId AND payment.due_date BETWEEN @from AND @to), 0) AS paid_cents
    `,
      )
      .get({ propertyId, year, from, to }) as DashboardRow;

    const totalDueCents = row.base_rent_due_cents + row.utility_due_cents + row.garage_due_cents;
    response.json({
      property,
      year,
      counts: {
        units: row.units,
        tenancies: row.tenancies,
        meters: row.meters,
        readings: row.readings,
        costs: row.costs,
        pendingCosts: row.pending_costs,
        closedSettlements: row.closed_settlements,
      },
      amounts: {
        sourceCosts: centsToEuros(row.source_costs_cents),
        allocableCosts: centsToEuros(row.allocable_costs_cents),
        labor35a: centsToEuros(row.labor_35a_cents),
        baseRentDue: centsToEuros(row.base_rent_due_cents),
        utilityDue: centsToEuros(row.utility_due_cents),
        garageDue: centsToEuros(row.garage_due_cents),
        totalDue: centsToEuros(totalDueCents),
        paid: centsToEuros(row.paid_cents),
        outstanding: centsToEuros(totalDueCents - row.paid_cents),
      },
    });
  });
}
