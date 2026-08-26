import {
  calculateSettlement,
  type MeterType,
  type SettlementInput,
  type StatementGroup,
} from '../domain';
import type { SqliteDatabase } from './database';
import type { SettlementCalculator } from './settlements';

type Row = Record<string, unknown>;

type BuiltSettlementInput = {
  input: SettlementInput;
  missingPaymentTenantNames: string[];
};

function group(value: unknown): StatementGroup {
  return String(value) as StatementGroup;
}

function buildInput(
  db: SqliteDatabase,
  request: {
    propertyId: number;
    tenancyId: number;
    year: number;
  },
): BuiltSettlementInput {
  const { propertyId, year } = request;
  const units = db
    .prepare('SELECT * FROM units WHERE property_id = ? ORDER BY id')
    .all(propertyId) as Row[];
  const tenancies = db
    .prepare(
      `
    SELECT tenancy.* FROM tenancies tenancy
    JOIN units unit ON unit.id = tenancy.unit_id
    WHERE unit.property_id = ? ORDER BY tenancy.id
  `,
    )
    .all(propertyId) as Row[];
  const costs = db
    .prepare('SELECT * FROM costs WHERE property_id = ? AND year = ? ORDER BY id')
    .all(propertyId, year) as Row[];
  const meters = db
    .prepare(
      `
    SELECT meter.* FROM meters meter
    JOIN units unit ON unit.id = meter.unit_id
    WHERE unit.property_id = ? ORDER BY meter.id
  `,
    )
    .all(propertyId) as Row[];
  const readings = db
    .prepare(
      `
    SELECT reading.* FROM readings reading
    JOIN meters meter ON meter.id = reading.meter_id
    JOIN units unit ON unit.id = meter.unit_id
    WHERE unit.property_id = ? ORDER BY reading.date, reading.id
  `,
    )
    .all(propertyId) as Row[];
  const paymentTotals = db
    .prepare(
      `
    SELECT payment.tenancy_id,
      count(*) AS payment_count,
      COALESCE(sum(payment.utility_paid_cents), 0) AS utility_paid_cents,
      COALESCE(sum(payment.garage_paid_cents), 0) AS garage_paid_cents
    FROM payments payment
    JOIN tenancies tenancy ON tenancy.id = payment.tenancy_id
    JOIN units unit ON unit.id = tenancy.unit_id
    WHERE unit.property_id = ?
      AND payment.due_date BETWEEN ? AND ?
      AND payment.due_date >= tenancy.start_date
      AND payment.due_date <= COALESCE(tenancy.end_date, '9999-12-31')
    GROUP BY payment.tenancy_id
  `,
    )
    .all(propertyId, `${year}-01-01`, `${year}-12-31`) as Array<{
    tenancy_id: number;
    payment_count: number;
    utility_paid_cents: number;
    garage_paid_cents: number;
  }>;
  const paymentByTenancy = new Map(paymentTotals.map((row) => [row.tenancy_id, row]));

  const missingPaymentTenantNames = tenancies
    .filter((row) => Number(row.id) === request.tenancyId)
    .filter(
      (row) =>
        String(row.start_date) <= `${year}-12-31` &&
        (row.end_date === null || String(row.end_date) >= `${year}-01-01`),
    )
    .filter((row) => !paymentByTenancy.has(Number(row.id)))
    .map((row) => String(row.tenant_name));

  return {
    input: {
      year,
      units: units.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        areaSqm: Number(row.area_sqm),
        unitWeight: Number(row.unit_weight),
      })),
      tenancies: tenancies.map((row) => {
        const actual = paymentByTenancy.get(Number(row.id));
        return {
          id: Number(row.id),
          unitId: Number(row.unit_id),
          tenantName: String(row.tenant_name),
          startDate: String(row.start_date),
          endDate: row.end_date === null ? null : String(row.end_date),
          persons: Number(row.persons),
          prepaymentOverridesByGroupCents: actual
            ? {
                Wohnung: Number(actual.utility_paid_cents),
                Garage: Number(actual.garage_paid_cents),
              }
            : {},
        };
      }),
      costs: costs.map((row) => ({
        id: Number(row.id),
        year: Number(row.year),
        descriptionInternal: String(row.description_internal),
        descriptionTenant: String(row.description_tenant),
        sourceAmountCents: Number(row.source_amount_cents),
        allocableAmountCents: Number(row.allocable_amount_cents),
        tenantStatus: String(row.tenant_status) as SettlementInput['costs'][number]['tenantStatus'],
        statementGroup: group(row.statement_group),
        allocationMode: String(
          row.allocation_mode,
        ) as SettlementInput['costs'][number]['allocationMode'],
        allocationKey: String(
          row.allocation_key,
        ) as SettlementInput['costs'][number]['allocationKey'],
        directUnitId: row.direct_unit_id === null ? null : Number(row.direct_unit_id),
        directTenancyId: row.direct_tenancy_id === null ? null : Number(row.direct_tenancy_id),
        meterType:
          row.meter_type === null
            ? null
            : (String(row.meter_type) as SettlementInput['costs'][number]['meterType']),
        labor35aCents: Number(row.labor_35a_cents),
      })),
      meters: meters.map((row) => ({
        id: Number(row.id),
        unitId: Number(row.unit_id),
        type: String(row.type) as MeterType,
        name: String(row.name),
        unitLabel: String(row.unit_label),
      })),
      readings: readings.map((row) => ({
        meterId: Number(row.meter_id),
        date: String(row.date),
        value: Number(row.value),
      })),
    },
    missingPaymentTenantNames,
  };
}

export const sqliteSettlementCalculator: SettlementCalculator = (db, request) => {
  const { input, missingPaymentTenantNames } = buildInput(db, request);
  const result = calculateSettlement(input);

  // Die Fachberechnung kennt für die Verteilung alle Mietverhältnisse des
  // Hauses. In das Schreiben für einen Mieter gehören aber keine namentlichen
  // Zählerhinweise zu anderen Mietern.
  const otherTenantNames = input.tenancies
    .filter((tenancy) => Number(tenancy.id) !== request.tenancyId)
    .map((tenancy) => tenancy.tenantName);
  result.warnings = result.warnings.filter(
    (warning) => !otherTenantNames.some((tenantName) => warning.includes(`, ${tenantName}:`)),
  );

  // Auch in Warnungen wird die externe Bezeichnung verwendet. Die interne
  // Rechnungsbezeichnung bleibt damit in einer Mieterabrechnung unsichtbar.
  for (const cost of input.costs) {
    const tenantDescription = cost.descriptionTenant?.trim();
    if (!tenantDescription || tenantDescription === cost.descriptionInternal) continue;
    const internalName = `„${cost.descriptionInternal}“`;
    const externalName = `„${tenantDescription}“`;
    result.warnings = result.warnings.map((warning) =>
      warning.replaceAll(internalName, externalName),
    );
    result.blockingReasons = result.blockingReasons.map((reason) =>
      reason.replaceAll(internalName, externalName),
    );
  }

  for (const tenantName of missingPaymentTenantNames) {
    result.warnings.push(
      `Im Mietkonto sind für „${tenantName}“ keine Zahlungen erfasst; Vorauszahlungen werden mit 0,00 € berücksichtigt.`,
    );
  }
  return result;
};
