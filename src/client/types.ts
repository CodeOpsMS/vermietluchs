import type {
  CostInput,
  MeterInput,
  OperatingCostPlanInput,
  PaymentInput,
  PropertyInput,
  ReadingInput,
  SettingsInput,
  TenancyInput,
  UnitInput,
} from '../shared/schemas';

export type EntityMeta = {
  id: number;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Property = PropertyInput & EntityMeta;
export type Unit = UnitInput & EntityMeta;
export type Tenancy = TenancyInput & EntityMeta;
export type Cost = CostInput & EntityMeta;
export type Meter = MeterInput & EntityMeta;
export type Reading = ReadingInput & EntityMeta;
export type Payment = PaymentInput & EntityMeta;
export type OperatingCostPlan = OperatingCostPlanInput &
  EntityMeta & {
    annualTotal: number;
    calculatedMonthlyAmount: number;
    monthlyDifference: number | null;
  };
export type Settings = SettingsInput;

export type TenantStatus = CostInput['tenantStatus'];
export type AllocationMode = CostInput['allocationMode'];
export type AllocationKey = CostInput['allocationKey'];
export type MeterType = MeterInput['type'];

export type Dashboard = {
  propertyCount?: number;
  unitCount?: number;
  activeTenancyCount?: number;
  openCostCount?: number;
  pendingCostCount?: number;
  missingReadingCount?: number;
  openPaymentAmount?: number;
};

export type SettlementRow = {
  id: number | string | null;
  description: string;
  statementGroup: string;
  allocationLabel: string;
  sourceAmount: number;
  allocableAmount: number;
  tenantShare: number;
  labor35a: number;
  allocationRounding: number;
  /** Nur bei alten, vor der automatischen Centverteilung gespeicherten Snapshots wahr. */
  isRoundingDifference: boolean;
};

export type SettlementPreview = {
  /** Kennzeichnet Snapshots, deren externe Texte bereits vor dem Hash finalisiert wurden. */
  payloadVersion?: 2;
  propertyId: number;
  tenancyId: number;
  year: number;
  propertyName: string;
  propertyAddress: string;
  landlordName: string;
  landlordAddress: string;
  bankAccountHolder: string;
  bankIban: string;
  paymentDeadlineDays: number;
  unitName: string;
  tenantName: string;
  tenantAddress: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  isPartialYear: boolean;
  notes: string[];
  rows: SettlementRow[];
  totalTenantShare: number;
  totalPrepayments: number;
  utilityPrepayments: number;
  garagePrepayments: number;
  prepaymentsByGroup: Record<string, number>;
  balance: number;
  labor35a: number;
  /** Nur zur Anzeige alter Snapshots; neue Berechnungen liefern immer 0. */
  roundingDifference: number;
  warnings: string[];
  blockingReasons: string[];
  canClose: boolean;
  /** Fehlt nur bei alten, bereits gespeicherten Snapshots. */
  calculationToken?: string;
  closed: boolean;
  closedAt: string | null;
  snapshotId: number | null;
};

export type PaymentLedgerRow = {
  payment: Payment;
  tenancy?: Tenancy;
  unit?: Unit;
};

export type AppData = {
  properties: Property[];
  units: Unit[];
  tenancies: Tenancy[];
  costs: Cost[];
  meters: Meter[];
  readings: Reading[];
  payments: Payment[];
  operatingCostPlans: OperatingCostPlan[];
};
