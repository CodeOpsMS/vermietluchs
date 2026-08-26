import type {
  ALLOCATION_KEYS,
  ALLOCATION_MODES,
  METER_TYPES,
  TENANT_STATUSES,
} from '../shared/constants';

export type DomainId = number | string;
/** Frei benennbare Gruppe; bekannte Standardwerte sind Wohnung, Garage und Grundsteuer. */
export type StatementGroup = string;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type AllocationMode = (typeof ALLOCATION_MODES)[number];
export type AllocationKey = (typeof ALLOCATION_KEYS)[number];
export type MeterType = (typeof METER_TYPES)[number];

export interface SettlementUnit {
  id: DomainId;
  name: string;
  areaSqm: number;
  /** Gewicht für den Schlüssel „Einheiten“, normalerweise 1. */
  unitWeight?: number;
  /** Selten benötigter Ausschluss aus allen Verteilbasen. Standard: true. */
  participates?: boolean;
}

export interface PersonLevel {
  from: string;
  persons: number;
}

export interface PrepaymentLevel {
  /** Monat ab dem der Betrag gilt, Format YYYY-MM. */
  fromMonth: string;
  monthlyCents: number;
  /** Nur zur nachvollziehbaren Aufschlüsselung; Standard ist Wohnung. */
  group?: StatementGroup;
}

export interface SettlementTenancy {
  id: DomainId;
  unitId: DomainId;
  tenantName: string;
  startDate: string;
  endDate?: string | null;
  persons?: number;
  personHistory?: PersonLevel[];
  prepayments?: PrepaymentLevel[];
  /**
   * Tatsächlich geleistete Jahressummen je Abrechnungsgruppe. Sobald das Feld
   * vorhanden ist, ersetzen die angegebenen Gruppen die Vertragsstaffeln;
   * nicht angegebene Gruppen gelten dabei bewusst als 0 Cent.
   */
  prepaymentOverridesByGroupCents?: Partial<Record<string, number>>;
  /** Tatsächlich geleistete Jahressumme; ersetzt die errechnete Staffel. */
  prepaymentOverrideCents?: number;
}

export interface SettlementCost {
  id: DomainId;
  year: number;
  descriptionInternal: string;
  descriptionTenant?: string;
  /** Vollständiger interner Rechnungsbetrag. */
  sourceAmountCents: number;
  /** Davon als Betriebskosten zu verteilender Betrag. */
  allocableAmountCents: number;
  tenantStatus: TenantStatus;
  statementGroup: StatementGroup;
  allocationMode: AllocationMode;
  allocationKey: AllocationKey;
  directUnitId?: DomainId | null;
  directTenancyId?: DomainId | null;
  meterType?: MeterType | null;
  labor35aCents?: number;
}

export interface SettlementMeter {
  id: DomainId;
  unitId: DomainId;
  type: MeterType;
  name?: string;
  unitLabel?: string;
}

export interface SettlementReading {
  meterId: DomainId;
  date: string;
  value: number;
  /** Zählerwechsel: value ist der Startwert des neuen Zählers. */
  replacement?: boolean;
  /** Endwert des alten Zählers beim Zählerwechsel. */
  oldEndValue?: number;
}

export interface SettlementInput {
  year: number;
  units: SettlementUnit[];
  tenancies: SettlementTenancy[];
  costs: SettlementCost[];
  meters?: SettlementMeter[];
  readings?: SettlementReading[];
}

export interface SettlementRow {
  costId: DomainId | null;
  group: StatementGroup;
  description: string;
  allocationMode: AllocationMode;
  allocationKey: AllocationKey;
  basisText: string;
  rawShareCents: number;
  shareCents: number;
  /** Abweichung zur normalen kaufmännischen Rundung durch centgenaue Restverteilung. */
  allocationRoundingCents: number;
  labor35aCents: number;
}

export interface SettlementGroupResult {
  group: StatementGroup;
  rows: SettlementRow[];
  totalShareCents: number;
  total35aCents: number;
}

export interface TenancyStatement {
  tenancyId: DomainId;
  unitId: DomainId;
  tenantName: string;
  unitName: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  personsAtPeriodEnd: number;
  isPartialYear: boolean;
  notes: string[];
  rows: SettlementRow[];
  groups: SettlementGroupResult[];
  prepaymentCents: number;
  prepaymentsByGroup: Record<string, number>;
  totalShareCents: number;
  total35aCents: number;
  /** Positiv = Guthaben, negativ = Nachzahlung. */
  balanceCents: number;
  /** Bei Teiljahresabrechnungen immer null. */
  suggestedMonthlyPrepaymentCents: number | null;
}

export type OwnerReason = 'excluded' | 'pending' | 'not-allocable' | 'vacancy' | 'missing-basis';

export interface OwnerRow {
  costId: DomainId;
  description: string;
  group: StatementGroup;
  reason: OwnerReason;
  shareCents: number;
  labor35aCents: number;
}

export interface CostCalculationResult {
  costId: DomainId;
  status: TenantStatus;
  sourceAmountCents: number;
  allocableAmountCents: number;
  tenantShareCents: number;
  ownerShareCents: number;
  pendingCents: number;
}

export interface SettlementResult {
  year: number;
  periodStart: string;
  periodEnd: string;
  daysInYear: number;
  statements: TenancyStatement[];
  owner: {
    rows: OwnerRow[];
    totalCents: number;
    total35aCents: number;
  };
  costs: CostCalculationResult[];
  totalSourceCostsCents: number;
  totalIncludedAllocableCents: number;
  totalTenantShareCents: number;
  pendingCostsCents: number;
  canClose: boolean;
  blockingReasons: string[];
  warnings: string[];
}
