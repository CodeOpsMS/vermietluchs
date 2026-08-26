import type { Router } from 'express';
import { z } from 'zod';
import type { CostCalculationResult, SettlementResult, TenancyStatement } from '../domain';
import { dateSchema, settlementCreateSchema } from '../shared/schemas';
import type { SqliteDatabase } from './database';
import { ApiError } from './errors';
import { optionalId, optionalYear, parseId } from './http';

export type SettlementRequest = {
  propertyId: number;
  tenancyId: number;
  year: number;
  roundingDifference: number;
  roundingGroup: string;
};

export type SettlementCalculator = (
  db: SqliteDatabase,
  input: SettlementRequest,
) => SettlementResult;

const settlementRowPayloadSchema = z
  .object({
    id: z.union([z.number().int().positive(), z.string().min(1), z.null()]),
    description: z.string(),
    statementGroup: z.string().min(1).max(100),
    allocationLabel: z.string(),
    sourceAmount: z.number().finite().nonnegative(),
    allocableAmount: z.number().finite().nonnegative(),
    tenantShare: z.number().finite(),
    labor35a: z.number().finite().nonnegative(),
    allocationRounding: z.number().finite(),
    isRoundingDifference: z.boolean(),
  })
  .strict();

export const settlementPayloadSchema = z
  .object({
    propertyId: z.number().int().positive(),
    tenancyId: z.number().int().positive(),
    year: z.number().int().min(1900).max(2200),
    propertyName: z.string(),
    propertyAddress: z.string(),
    landlordName: z.string(),
    landlordAddress: z.string(),
    bankAccountHolder: z.string(),
    bankIban: z.string(),
    paymentDeadlineDays: z.number().int().min(1).max(365),
    unitName: z.string(),
    tenantName: z.string(),
    tenantAddress: z.string(),
    periodStart: dateSchema,
    periodEnd: dateSchema,
    days: z.number().int().positive(),
    isPartialYear: z.boolean(),
    notes: z.array(z.string()),
    rows: z.array(settlementRowPayloadSchema),
    totalTenantShare: z.number().finite(),
    totalPrepayments: z.number().finite().nonnegative(),
    utilityPrepayments: z.number().finite().nonnegative(),
    garagePrepayments: z.number().finite().nonnegative(),
    prepaymentsByGroup: z.record(z.number().finite().nonnegative()),
    balance: z.number().finite(),
    labor35a: z.number().finite().nonnegative(),
    roundingDifference: z.number().finite(),
    warnings: z.array(z.string()),
    blockingReasons: z.array(z.string()),
    canClose: z.boolean(),
    closed: z.boolean(),
    closedAt: z.string().datetime().nullable(),
    snapshotId: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.closed !== (payload.closedAt !== null && payload.snapshotId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Abschlussstatus, Zeitpunkt und Snapshot-ID sind inkonsistent.',
      });
    }
  });

type SnapshotRow = {
  id: number;
  property_id: number;
  tenancy_id: number;
  year: number;
  payload_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type SettlementContext = {
  property_name: string;
  property_address: string;
  property_landlord_name: string | null;
  property_landlord_address: string | null;
  property_bank_account_holder: string | null;
  property_bank_iban: string | null;
  property_payment_deadline_days: number | null;
  global_landlord_name: string;
  global_landlord_address: string;
  global_bank_account_holder: string;
  global_bank_iban: string;
  global_payment_deadline_days: number;
  unit_name: string;
  tenant_name: string;
  tenant_address: string;
};

function findSnapshot(
  db: SqliteDatabase,
  input: Pick<SettlementRequest, 'propertyId' | 'tenancyId' | 'year'>,
): SnapshotRow | undefined {
  return db
    .prepare(
      `
    SELECT * FROM settlement_snapshots
    WHERE property_id = ? AND tenancy_id = ? AND year = ?
  `,
    )
    .get(input.propertyId, input.tenancyId, input.year) as SnapshotRow | undefined;
}

function snapshotPayload(row: SnapshotRow) {
  return settlementPayloadSchema.parse(JSON.parse(row.payload_json));
}

function contextFor(db: SqliteDatabase, input: SettlementRequest): SettlementContext {
  const context = db
    .prepare(
      `
    SELECT
      property.name AS property_name,
      property.address AS property_address,
      property.landlord_name AS property_landlord_name,
      property.landlord_address AS property_landlord_address,
      property.bank_account_holder AS property_bank_account_holder,
      property.bank_iban AS property_bank_iban,
      property.payment_deadline_days AS property_payment_deadline_days,
      settings.landlord_name AS global_landlord_name,
      settings.landlord_address AS global_landlord_address,
      settings.bank_account_holder AS global_bank_account_holder,
      settings.bank_iban AS global_bank_iban,
      settings.payment_deadline_days AS global_payment_deadline_days,
      unit.name AS unit_name,
      tenancy.tenant_name AS tenant_name,
      tenancy.tenant_address AS tenant_address
    FROM tenancies tenancy
    JOIN units unit ON unit.id = tenancy.unit_id
    JOIN properties property ON property.id = unit.property_id
    JOIN app_settings settings ON settings.id = 1
    WHERE tenancy.id = ? AND property.id = ?
  `,
    )
    .get(input.tenancyId, input.propertyId) as SettlementContext | undefined;
  if (!context) throw new ApiError(400, 'Das Mietverhältnis gehört nicht zum ausgewählten Objekt.');
  return context;
}

function calculate(
  db: SqliteDatabase,
  calculator: SettlementCalculator | undefined,
  input: SettlementRequest,
): { result: SettlementResult; statement: TenancyStatement; context: SettlementContext } {
  if (!calculator) throw new ApiError(503, 'Das Abrechnungsmodul ist noch nicht verbunden.');
  const context = contextFor(db, input);
  const result = calculator(db, input);
  const statement = result.statements.find(
    (entry) => String(entry.tenancyId) === String(input.tenancyId),
  );
  if (!statement)
    throw new ApiError(422, 'Für dieses Mietverhältnis konnte keine Abrechnung berechnet werden.');
  return { result, statement, context };
}

function money(cents: number): number {
  return cents / 100;
}

function buildPayload(
  input: SettlementRequest,
  result: SettlementResult,
  statement: TenancyStatement,
  context: SettlementContext,
  closure: { closed: boolean; closedAt: string | null; snapshotId: number | null },
) {
  const calculatedCost = new Map<string, CostCalculationResult>(
    result.costs.map((cost) => [String(cost.costId), cost]),
  );
  return settlementPayloadSchema.parse({
    propertyId: input.propertyId,
    tenancyId: input.tenancyId,
    year: input.year,
    propertyName: context.property_name,
    propertyAddress: context.property_address,
    landlordName: context.property_landlord_name ?? context.global_landlord_name,
    landlordAddress: context.property_landlord_address ?? context.global_landlord_address,
    bankAccountHolder: context.property_bank_account_holder ?? context.global_bank_account_holder,
    bankIban: context.property_bank_iban ?? context.global_bank_iban,
    paymentDeadlineDays:
      context.property_payment_deadline_days ?? context.global_payment_deadline_days,
    unitName: context.unit_name,
    tenantName: context.tenant_name,
    tenantAddress: context.tenant_address,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    days: statement.days,
    isPartialYear: statement.isPartialYear,
    notes: statement.notes,
    rows: statement.rows.map((row) => {
      const cost = row.costId === null ? undefined : calculatedCost.get(String(row.costId));
      return {
        id: row.costId,
        description: row.description,
        statementGroup: row.group,
        allocationLabel: row.basisText,
        sourceAmount: money(cost?.sourceAmountCents ?? 0),
        allocableAmount: money(cost?.allocableAmountCents ?? 0),
        tenantShare: money(row.shareCents),
        labor35a: money(row.labor35aCents),
        allocationRounding: money(row.allocationRoundingCents),
        isRoundingDifference: row.isRoundingDifference,
      };
    }),
    totalTenantShare: money(statement.totalShareCents),
    totalPrepayments: money(statement.prepaymentCents),
    utilityPrepayments: money(statement.prepaymentsByGroup.Wohnung ?? 0),
    garagePrepayments: money(statement.prepaymentsByGroup.Garage ?? 0),
    prepaymentsByGroup: Object.fromEntries(
      Object.entries(statement.prepaymentsByGroup).map(([group, amount]) => [group, money(amount)]),
    ),
    // API-Konvention: Positiv bedeutet Nachzahlung, negativ bedeutet Guthaben.
    balance: money(-statement.balanceCents),
    labor35a: money(statement.total35aCents),
    roundingDifference: money(statement.roundingDifferenceCents),
    warnings: result.warnings,
    blockingReasons: result.blockingReasons,
    canClose: result.canClose,
    ...closure,
  });
}

export function registerSettlementRoutes(
  router: Router,
  db: SqliteDatabase,
  calculator?: SettlementCalculator,
): void {
  router.post('/settlements/preview', (request, response) => {
    const input = settlementCreateSchema.parse(request.body);
    const existing = findSnapshot(db, input);
    if (existing) {
      response.json(snapshotPayload(existing));
      return;
    }
    const { result, statement, context } = calculate(db, calculator, input);
    response.json(
      buildPayload(input, result, statement, context, {
        closed: false,
        closedAt: null,
        snapshotId: null,
      }),
    );
  });

  router.post('/settlements/close', (request, response) => {
    const input = settlementCreateSchema.parse(request.body);
    const existing = findSnapshot(db, input);
    if (existing) {
      response.json(snapshotPayload(existing));
      return;
    }
    const { result, statement, context } = calculate(db, calculator, input);
    if (!result.canClose) {
      throw new ApiError(409, 'Die Abrechnung kann noch nicht abgeschlossen werden.', {
        blockingReasons: result.blockingReasons,
        warnings: result.warnings,
      });
    }
    const payload = db.transaction(() => {
      const closedAt = new Date().toISOString();
      const row = db
        .prepare(
          `
        INSERT INTO settlement_snapshots (
          property_id, tenancy_id, year, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, '{}', ?, ?)
        RETURNING *
      `,
        )
        .get(input.propertyId, input.tenancyId, input.year, closedAt, closedAt) as SnapshotRow;
      const immutable = buildPayload(input, result, statement, context, {
        closed: true,
        closedAt,
        snapshotId: row.id,
      });
      db.prepare('UPDATE settlement_snapshots SET payload_json = ? WHERE id = ?').run(
        JSON.stringify(immutable),
        row.id,
      );
      return immutable;
    })();
    response.status(201).json(payload);
  });

  router.get('/settlements', (request, response) => {
    const propertyId = optionalId(request.query.propertyId);
    const selectedYear = optionalYear(request.query.year);
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (propertyId !== undefined) {
      clauses.push('property_id = ?');
      values.push(propertyId);
    }
    if (selectedYear !== undefined) {
      clauses.push('year = ?');
      values.push(selectedYear);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM settlement_snapshots${where} ORDER BY year DESC, id`)
      .all(...values) as SnapshotRow[];
    response.json(
      rows.map((row) => ({
        snapshotId: row.id,
        propertyId: row.property_id,
        tenancyId: row.tenancy_id,
        year: row.year,
        closedAt: row.created_at,
      })),
    );
  });

  router.get('/settlements/:id', (request, response) => {
    const row = db
      .prepare('SELECT * FROM settlement_snapshots WHERE id = ?')
      .get(parseId(request.params.id)) as SnapshotRow | undefined;
    const propertyId = optionalId(request.query.propertyId);
    if (!row || (propertyId !== undefined && row.property_id !== propertyId)) {
      throw new ApiError(404, 'Abrechnungssnapshot nicht gefunden.');
    }
    response.json(snapshotPayload(row));
  });
}
