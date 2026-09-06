import os from 'node:os';
import path from 'node:path';
import type { Router } from 'express';
import { z } from 'zod';
import { BACKUP_SCHEMA_VERSION } from '../shared/constants';
import { backupSchema, dateSchema } from '../shared/schemas';
import type { SqliteDatabase } from './database';
import { ApiError, asyncHandler } from './errors';
import { settlementPayloadSchema } from './settlements';

const id = z.number().int().positive();
const revision = z.number().int().nonnegative();
const timestamp = z.string().min(1).max(50);
const date = dateSchema;
const cents = z.number().int().nonnegative();
const base = {
  id,
  revision,
  created_at: timestamp,
  updated_at: timestamp,
};

const tablesSchema = z
  .object({
    app_settings: z
      .array(
        z
          .object({
            id: z.literal(1),
            landlord_name: z.string(),
            landlord_address: z.string(),
            bank_account_holder: z.string(),
            bank_iban: z.string(),
            payment_deadline_days: z.number().int().min(1).max(365),
            revision,
            updated_at: timestamp,
          })
          .strict(),
      )
      .length(1),
    properties: z.array(
      z
        .object({
          ...base,
          name: z.string().min(1),
          address: z.string(),
          landlord_name: z.string().nullable(),
          landlord_address: z.string().nullable(),
          bank_account_holder: z.string().nullable(),
          bank_iban: z.string().nullable(),
          payment_deadline_days: z.number().int().min(1).max(365).nullable(),
        })
        .strict(),
    ),
    units: z.array(
      z
        .object({
          ...base,
          property_id: id,
          name: z.string().min(1),
          floor: z.string(),
          area_sqm: z.number().finite().positive(),
          unit_weight: z.number().finite().positive(),
          notes: z.string(),
        })
        .strict(),
    ),
    tenancies: z.array(
      z
        .object({
          ...base,
          unit_id: id,
          tenant_name: z.string().min(1),
          tenant_address: z.string(),
          start_date: date,
          end_date: date.nullable(),
          persons: z.number().finite().positive(),
          base_rent_cents: cents,
          utility_prepayment_cents: cents,
          garage_prepayment_cents: cents,
          payment_day: z.number().int().min(1).max(31),
          notes: z.string(),
        })
        .strict()
        .refine((row) => row.end_date === null || row.end_date >= row.start_date),
    ),
    costs: z.array(
      z
        .object({
          ...base,
          property_id: id,
          year: z.number().int().min(1900).max(2200),
          description_internal: z.string().min(1),
          description_tenant: z.string(),
          source_amount_cents: cents,
          tenant_status: z.enum(['included', 'excluded', 'pending']),
          allocable_amount_cents: cents,
          statement_group: z
            .string()
            .max(100)
            .refine((value) => value.trim().length > 0),
          allocation_mode: z.enum(['standard', 'fixedTenancy']),
          allocation_key: z.enum(['area', 'persons', 'units', 'direct', 'meter']),
          direct_unit_id: id.nullable(),
          direct_tenancy_id: id.nullable(),
          meter_type: z.enum(['heating', 'hotWater', 'coldWater', 'other']).nullable(),
          labor_35a_cents: cents,
          notes: z.string(),
        })
        .strict()
        .superRefine((row, context) => {
          if (row.allocable_amount_cents > row.source_amount_cents)
            context.addIssue({
              code: 'custom',
              message: 'Umlagebetrag übersteigt Originalbetrag.',
            });
          if (row.labor_35a_cents > row.allocable_amount_cents)
            context.addIssue({ code: 'custom', message: '§35a-Anteil übersteigt Umlagebetrag.' });
          if (
            row.allocation_key === 'direct' &&
            row.direct_unit_id === null &&
            row.direct_tenancy_id === null
          )
            context.addIssue({ code: 'custom', message: 'Direktzuordnung ohne Ziel.' });
          if (row.direct_unit_id !== null && row.direct_tenancy_id !== null)
            context.addIssue({ code: 'custom', message: 'Direktzuordnung hat zwei Ziele.' });
          if (row.allocation_mode === 'fixedTenancy' && row.direct_tenancy_id === null)
            context.addIssue({
              code: 'custom',
              message: 'Fester Mieteranteil ohne Mietverhältnis.',
            });
          if (row.allocation_mode === 'fixedTenancy' && row.allocation_key !== 'direct')
            context.addIssue({
              code: 'custom',
              message: 'Fester Mieteranteil ist nicht direkt zugeordnet.',
            });
          if (row.allocation_key === 'meter' && row.meter_type === null)
            context.addIssue({ code: 'custom', message: 'Verbrauchskosten ohne Zählerart.' });
        }),
    ),
    operating_cost_plans: z
      .array(
        z
          .object({
            ...base,
            property_id: id,
            tenancy_id: id,
            year: z.number().int().min(1900).max(2200),
            housing_costs_cents: cents,
            garage_costs_cents: cents,
            property_tax_cents: cents,
            months: z.number().int().min(1).max(12),
            monthly_prepayment_cents: cents.nullable(),
            notes: z.string(),
          })
          .strict(),
      )
      .default([]),
    meters: z.array(
      z
        .object({
          ...base,
          unit_id: id,
          name: z.string().min(1),
          meter_number: z.string(),
          type: z.enum(['heating', 'hotWater', 'coldWater', 'other']),
          unit_label: z.string().min(1),
        })
        .strict(),
    ),
    readings: z.array(
      z
        .object({
          ...base,
          meter_id: id,
          date,
          value: z.number().finite().nonnegative(),
          note: z.string(),
        })
        .strict(),
    ),
    payments: z.array(
      z
        .object({
          ...base,
          tenancy_id: id,
          due_date: date,
          paid_date: date.nullable(),
          base_rent_due_cents: cents,
          utility_due_cents: cents,
          garage_due_cents: cents,
          amount_paid_cents: cents,
          base_rent_paid_cents: cents,
          utility_paid_cents: cents,
          garage_paid_cents: cents,
          note: z.string(),
        })
        .strict()
        .refine(
          (row) =>
            row.base_rent_paid_cents + row.utility_paid_cents + row.garage_paid_cents ===
            row.amount_paid_cents,
          'Bezahlte Teilbeträge ergeben nicht den Gesamtbetrag.',
        )
        .refine(
          (row) => row.amount_paid_cents === 0 || row.paid_date !== null,
          'Zu einem Zahlungseingang fehlt das Zahlungsdatum.',
        ),
    ),
    settlement_snapshots: z.array(
      z
        .object({
          ...base,
          property_id: id,
          tenancy_id: id,
          year: z.number().int().min(1900).max(2200),
          payload_json: z.string(),
        })
        .strict()
        .superRefine((row, context) => {
          let payload: z.infer<typeof settlementPayloadSchema>;
          try {
            payload = settlementPayloadSchema.parse(JSON.parse(row.payload_json));
          } catch {
            context.addIssue({
              code: 'custom',
              message: 'Snapshot enthält kein gültiges Abrechnungs-Payload.',
              path: ['payload_json'],
            });
            return;
          }
          if (
            !payload.closed ||
            payload.snapshotId !== row.id ||
            payload.propertyId !== row.property_id ||
            payload.tenancyId !== row.tenancy_id ||
            payload.year !== row.year ||
            payload.closedAt !== row.created_at
          ) {
            context.addIssue({
              code: 'custom',
              message: 'Snapshot-Payload und Tabellenmetadaten widersprechen sich.',
              path: ['payload_json'],
            });
          }
        }),
    ),
  })
  .strict();

type Tables = z.infer<typeof tablesSchema>;
type TableName = keyof Tables;

const exportOrder: TableName[] = [
  'app_settings',
  'properties',
  'units',
  'tenancies',
  'costs',
  'operating_cost_plans',
  'meters',
  'readings',
  'payments',
  'settlement_snapshots',
];
const deleteOrder = [...exportOrder].reverse();

function exportTables(db: SqliteDatabase): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(
    exportOrder.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[],
    ]),
  );
}

function insertRows(db: SqliteDatabase, table: TableName, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((column) => `@${column}`).join(', ');
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
  );
  for (const row of rows) statement.run(row);
}

function verifySemanticLinks(db: SqliteDatabase): void {
  const invalidCost = db
    .prepare(
      `
    SELECT cost.id FROM costs cost
    LEFT JOIN units direct_unit ON direct_unit.id = cost.direct_unit_id
    LEFT JOIN tenancies direct_tenancy ON direct_tenancy.id = cost.direct_tenancy_id
    LEFT JOIN units tenancy_unit ON tenancy_unit.id = direct_tenancy.unit_id
    WHERE (cost.direct_unit_id IS NOT NULL AND direct_unit.property_id <> cost.property_id)
       OR (cost.direct_tenancy_id IS NOT NULL AND tenancy_unit.property_id <> cost.property_id)
    LIMIT 1
  `,
    )
    .get() as { id: number } | undefined;
  if (invalidCost)
    throw new ApiError(400, `Kostenposition ${invalidCost.id} verweist auf ein anderes Objekt.`);

  const invalidPlan = db
    .prepare(
      `
    SELECT plan.id FROM operating_cost_plans plan
    JOIN tenancies tenancy ON tenancy.id = plan.tenancy_id
    JOIN units unit ON unit.id = tenancy.unit_id
    WHERE unit.property_id <> plan.property_id
       OR tenancy.start_date > printf('%04d-12-31', plan.year)
       OR (tenancy.end_date IS NOT NULL AND tenancy.end_date < printf('%04d-01-01', plan.year))
    LIMIT 1
  `,
    )
    .get() as { id: number } | undefined;
  if (invalidPlan)
    throw new ApiError(
      400,
      `Betriebskosten-Wirtschaftsplan ${invalidPlan.id} passt nicht zum Objekt oder Mietzeitraum.`,
    );

  const invalidSnapshot = db
    .prepare(
      `
    SELECT snapshot.id FROM settlement_snapshots snapshot
    JOIN tenancies tenancy ON tenancy.id = snapshot.tenancy_id
    JOIN units unit ON unit.id = tenancy.unit_id
    WHERE unit.property_id <> snapshot.property_id LIMIT 1
  `,
    )
    .get() as { id: number } | undefined;
  if (invalidSnapshot)
    throw new ApiError(
      400,
      `Abrechnungssnapshot ${invalidSnapshot.id} verweist auf ein anderes Objekt.`,
    );
}

async function createSafetyBackup(db: SqliteDatabase): Promise<string> {
  const directory =
    db.name && db.name !== ':memory:' ? path.dirname(path.resolve(db.name)) : os.tmpdir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(directory, `vermietluchs-before-restore-${stamp}.sqlite`);
  await db.backup(filename);
  return filename;
}

export function registerBackupRoutes(router: Router, db: SqliteDatabase): void {
  router.get('/backup/export', (_request, response) => {
    const backup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'Vermietluchs' as const,
      tables: exportTables(db),
    };
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="vermietluchs-backup-${backup.exportedAt.slice(0, 10)}.json"`,
    );
    response.json(backup);
  });

  router.post(
    '/backup/import',
    asyncHandler(async (request, response) => {
      const envelope = backupSchema.parse(request.body);
      const tables = tablesSchema.parse(envelope.tables);
      const safetyBackup = await createSafetyBackup(db);

      try {
        db.transaction(() => {
          for (const table of deleteOrder) db.prepare(`DELETE FROM ${table}`).run();
          for (const table of exportOrder)
            insertRows(db, table, tables[table] as Record<string, unknown>[]);
          const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];
          if (foreignKeyErrors.length > 0)
            throw new ApiError(
              400,
              'Das Backup enthält ungültige Verknüpfungen.',
              foreignKeyErrors,
            );
          verifySemanticLinks(db);
        })();
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (
          error instanceof Error &&
          (('code' in error && String(error.code).startsWith('SQLITE')) ||
            error.message.includes('TENANCY_OVERLAP'))
        ) {
          throw new ApiError(
            400,
            'Das Backup verletzt Datenbankregeln und wurde nicht eingespielt.',
          );
        }
        throw error;
      }

      response.json({ ok: true, safetyBackup: path.basename(safetyBackup) });
    }),
  );
}
