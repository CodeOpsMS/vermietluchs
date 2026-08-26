import { STATEMENT_GROUPS } from '../../../shared/constants';
import type { AllocationKey, AllocationMode, Cost, MeterType, TenantStatus } from '../../types';

export type CostView = 'internal' | 'external' | 'pending';

export type CostForm = {
  id?: number;
  revision?: number;
  descriptionInternal: string;
  descriptionTenant: string;
  sourceAmount: string;
  tenantStatus: TenantStatus;
  allocableAmount: string;
  statementGroup: string;
  allocationMode: AllocationMode;
  allocationKey: AllocationKey;
  directUnitId: string;
  directTenancyId: string;
  meterType: MeterType | '';
  labor35a: string;
  notes: string;
};

export type ExternalCostGroup = {
  name: string;
  costCount: number;
  allocableAmount: number;
};

export const STATUS_LABEL: Record<TenantStatus, string> = {
  included: 'umlagefähig',
  excluded: 'nicht umlagefähig',
  pending: 'Prüfung offen',
};

export const KEY_LABEL: Record<AllocationKey, string> = {
  area: 'Wohnfläche',
  persons: 'Personen',
  units: 'Wohneinheiten',
  direct: 'Direktzuordnung',
  meter: 'Verbrauch',
};

export const METER_LABEL: Record<MeterType, string> = {
  heating: 'Heizung',
  hotWater: 'Warmwasser',
  coldWater: 'Kaltwasser',
  other: 'Sonstige',
};

/**
 * Fasst interne Kosten nur für die externe Vorschau zusammen. Die eigentliche
 * Verteilung rechnet weiterhin jede Kostenposition mit ihrem eigenen Schlüssel.
 */
export function createExternalCostGroups(costs: Cost[]): ExternalCostGroup[] {
  const groups = new Map<string, ExternalCostGroup>();

  for (const cost of costs) {
    if (cost.tenantStatus !== 'included') continue;
    const name = cost.statementGroup.trim();
    const current = groups.get(name) ?? {
      name,
      costCount: 0,
      allocableAmount: 0,
    };
    current.costCount += 1;
    current.allocableAmount += cost.allocableAmount;
    groups.set(name, current);
  }

  const standardOrder = new Map<string, number>(
    STATEMENT_GROUPS.map((name, index) => [name, index]),
  );
  return [...groups.values()].sort((left, right) => {
    const leftOrder = standardOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = standardOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.name.localeCompare(right.name, 'de');
  });
}

export function createEmptyCostForm(): CostForm {
  return {
    descriptionInternal: '',
    descriptionTenant: '',
    sourceAmount: '',
    tenantStatus: 'included',
    allocableAmount: '',
    statementGroup: 'Wohnung',
    allocationMode: 'standard',
    allocationKey: 'area',
    directUnitId: '',
    directTenancyId: '',
    meterType: '',
    labor35a: '0',
    notes: '',
  };
}

export function createCostFormForEditing(cost: Cost): CostForm {
  return {
    id: cost.id,
    revision: cost.revision,
    descriptionInternal: cost.descriptionInternal,
    descriptionTenant: cost.descriptionTenant,
    sourceAmount: String(cost.sourceAmount).replace('.', ','),
    tenantStatus: cost.tenantStatus,
    allocableAmount: String(cost.allocableAmount).replace('.', ','),
    statementGroup: cost.statementGroup,
    allocationMode: cost.allocationMode,
    allocationKey: cost.allocationKey,
    directUnitId: cost.directUnitId ? String(cost.directUnitId) : '',
    directTenancyId: cost.directTenancyId ? String(cost.directTenancyId) : '',
    meterType: cost.meterType ?? '',
    labor35a: String(cost.labor35a).replace('.', ','),
    notes: cost.notes,
  };
}
