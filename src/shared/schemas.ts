import { z } from 'zod';
import {
  ALLOCATION_KEYS,
  ALLOCATION_MODES,
  BACKUP_SCHEMA_VERSION,
  METER_TYPES,
  TENANT_STATUSES,
} from './constants';

export const idSchema = z.number().int().positive();
export const revisionSchema = z.number().int().nonnegative();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss JJJJ-MM-TT entsprechen.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Das Datum existiert nicht.');
export const yearSchema = z.number().int().min(1900).max(2200);
export const moneySchema = z.number().finite().min(0);

const optionalText = z.string().trim().max(500).default('');

export const settingsInputSchema = z.object({
  landlordName: z.string().trim().max(200).default(''),
  landlordAddress: optionalText,
  bankAccountHolder: z.string().trim().max(200).default(''),
  bankIban: z.string().trim().max(64).default(''),
  paymentDeadlineDays: z.number().int().min(1).max(365).default(30),
  revision: revisionSchema,
});

export const propertyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).default(''),
  landlordName: z.string().trim().max(200).nullable().default(null),
  landlordAddress: z.string().trim().max(500).nullable().default(null),
  bankAccountHolder: z.string().trim().max(200).nullable().default(null),
  bankIban: z.string().trim().max(64).nullable().default(null),
  paymentDeadlineDays: z.number().int().min(1).max(365).nullable().default(null),
  revision: revisionSchema.optional(),
});

export const unitInputSchema = z.object({
  propertyId: idSchema,
  name: z.string().trim().min(1).max(200),
  floor: z.string().trim().max(100).default(''),
  areaSqm: z.number().finite().positive(),
  unitWeight: z.number().finite().positive().default(1),
  notes: optionalText,
  revision: revisionSchema.optional(),
});

const tenancyObjectSchema = z.object({
  unitId: idSchema,
  tenantName: z.string().trim().min(1).max(200),
  tenantAddress: z.string().trim().max(500).default(''),
  startDate: dateSchema,
  endDate: dateSchema.nullable().default(null),
  persons: z.number().finite().positive().default(1),
  baseRent: moneySchema,
  utilityPrepayment: moneySchema,
  garagePrepayment: moneySchema.default(0),
  paymentDay: z.number().int().min(1).max(31).default(3),
  notes: optionalText,
  revision: revisionSchema.optional(),
});

const hasValidTenancyPeriod = (value: { startDate: string; endDate: string | null }) =>
  value.endDate === null || value.endDate >= value.startDate;

export const tenancyInputSchema = tenancyObjectSchema.refine(hasValidTenancyPeriod, {
  message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
  path: ['endDate'],
});

const nextTenancySchema = tenancyObjectSchema
  .omit({ unitId: true, revision: true })
  .refine(hasValidTenancyPeriod, {
    message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
    path: ['endDate'],
  });

export const changeoverInputSchema = z.object({
  previousTenancyId: idSchema,
  previousRevision: revisionSchema,
  endDate: dateSchema,
  nextTenancy: nextTenancySchema,
  readings: z
    .array(
      z.object({ meterId: idSchema, date: dateSchema, value: z.number().finite().nonnegative() }),
    )
    .default([]),
});

export const costInputSchema = z
  .object({
    propertyId: idSchema,
    year: yearSchema,
    descriptionInternal: z.string().trim().min(1).max(300),
    descriptionTenant: z.string().trim().max(300).default(''),
    sourceAmount: moneySchema,
    tenantStatus: z.enum(TENANT_STATUSES),
    allocableAmount: moneySchema,
    statementGroup: z.string().trim().min(1).max(100),
    allocationMode: z.enum(ALLOCATION_MODES),
    allocationKey: z.enum(ALLOCATION_KEYS),
    directUnitId: idSchema.nullable().default(null),
    directTenancyId: idSchema.nullable().default(null),
    meterType: z.enum(METER_TYPES).nullable().default(null),
    labor35a: moneySchema.default(0),
    notes: optionalText,
    revision: revisionSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.allocableAmount > value.sourceAmount) {
      context.addIssue({
        code: 'custom',
        message: 'Der umlagefähige Betrag darf den Originalbetrag nicht überschreiten.',
        path: ['allocableAmount'],
      });
    }
    if (value.labor35a > value.allocableAmount) {
      context.addIssue({
        code: 'custom',
        message: 'Der §35a-Anteil darf den umlagefähigen Betrag nicht überschreiten.',
        path: ['labor35a'],
      });
    }
    if (value.allocationKey === 'direct' && !value.directUnitId && !value.directTenancyId) {
      context.addIssue({
        code: 'custom',
        message:
          'Für eine Direktzuordnung muss eine Wohnung oder ein Mietverhältnis gewählt werden.',
        path: ['directUnitId'],
      });
    }
    if (value.directUnitId && value.directTenancyId) {
      context.addIssue({
        code: 'custom',
        message:
          'Bitte entweder eine Wohnung oder ein Mietverhältnis direkt zuordnen, nicht beides.',
        path: ['directTenancyId'],
      });
    }
    if (value.allocationMode === 'fixedTenancy' && !value.directTenancyId) {
      context.addIssue({
        code: 'custom',
        message: 'Ein fester Mieteranteil braucht ein Mietverhältnis.',
        path: ['directTenancyId'],
      });
    }
    if (value.allocationMode === 'fixedTenancy' && value.allocationKey !== 'direct') {
      context.addIssue({
        code: 'custom',
        message: 'Ein fester Mieteranteil wird immer direkt zugeordnet.',
        path: ['allocationKey'],
      });
    }
    if (value.allocationKey === 'meter' && !value.meterType) {
      context.addIssue({
        code: 'custom',
        message: 'Für die Verbrauchsverteilung muss eine Zählerart gewählt werden.',
        path: ['meterType'],
      });
    }
  });

export const meterInputSchema = z.object({
  unitId: idSchema,
  name: z.string().trim().min(1).max(200),
  meterNumber: z.string().trim().max(100).default(''),
  type: z.enum(METER_TYPES),
  unitLabel: z.string().trim().min(1).max(30).default('Einheiten'),
  revision: revisionSchema.optional(),
});

export const readingInputSchema = z.object({
  meterId: idSchema,
  date: dateSchema,
  value: z.number().finite().nonnegative(),
  note: optionalText,
  revision: revisionSchema.optional(),
});

export const paymentInputSchema = z
  .object({
    tenancyId: idSchema,
    dueDate: dateSchema,
    paidDate: dateSchema.nullable().default(null),
    baseRentDue: moneySchema,
    utilityDue: moneySchema,
    garageDue: moneySchema.default(0),
    amountPaid: moneySchema,
    // Bei älteren Clients darf die Aufteilung fehlen. Der Server verteilt dann
    // nachvollziehbar in der Reihenfolge Kaltmiete → Betriebskosten → Garage.
    baseRentPaid: moneySchema.optional(),
    utilityPaid: moneySchema.optional(),
    garagePaid: moneySchema.optional(),
    note: optionalText,
    revision: revisionSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.amountPaid > 0 && value.paidDate === null) {
      context.addIssue({
        code: 'custom',
        message: 'Zu einem Zahlungseingang muss ein Zahlungsdatum angegeben werden.',
        path: ['paidDate'],
      });
    }
  });

export const settlementCreateSchema = z
  .object({
    propertyId: idSchema,
    tenancyId: idSchema,
    year: yearSchema,
  })
  .strict();

export const operatingCostPlanInputSchema = z.object({
  propertyId: idSchema,
  tenancyId: idSchema,
  year: yearSchema,
  housingCosts: moneySchema,
  garageCosts: moneySchema.default(0),
  propertyTax: moneySchema.default(0),
  months: z.number().int().min(1).max(12).default(12),
  monthlyPrepayment: moneySchema.nullable().default(null),
  notes: optionalText,
  revision: revisionSchema.optional(),
});

export const settlementCloseSchema = z
  .object({
    propertyId: idSchema,
    tenancyId: idSchema,
    year: yearSchema,
    expectedCalculationToken: z.string().regex(/^[a-f0-9]{64}$/),
    correctionSnapshotId: idSchema.optional(),
    correctionRevision: revisionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.correctionSnapshotId === undefined) !== (value.correctionRevision === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Snapshot-ID und Revision müssen für eine Korrektur gemeinsam angegeben werden.',
      });
    }
  });

export const backupSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  app: z.literal('Vermietluchs'),
  tables: z.record(z.array(z.record(z.unknown()))),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type UnitInput = z.infer<typeof unitInputSchema>;
export type TenancyInput = z.infer<typeof tenancyInputSchema>;
export type CostInput = z.infer<typeof costInputSchema>;
export type MeterInput = z.infer<typeof meterInputSchema>;
export type ReadingInput = z.infer<typeof readingInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type OperatingCostPlanInput = z.infer<typeof operatingCostPlanInputSchema>;
export type Backup = z.infer<typeof backupSchema>;
