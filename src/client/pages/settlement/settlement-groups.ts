import { STATEMENT_GROUPS } from '../../../shared/constants';
import type { SettlementRow } from '../../types';

export type TenantStatementGroup = {
  name: string;
  sourceAmount: number;
  allocableAmount: number;
  tenantShare: number;
  allocationLabels: string[];
  isLegacyRounding: boolean;
};

export function createTenantStatementGroups(rows: SettlementRow[]): TenantStatementGroup[] {
  const groups = new Map<string, TenantStatementGroup>();
  for (const row of rows) {
    const name = row.isRoundingDifference ? 'Alter Excel-Rundungsausgleich' : row.statementGroup;
    const current = groups.get(name) ?? {
      name,
      sourceAmount: 0,
      allocableAmount: 0,
      tenantShare: 0,
      allocationLabels: [],
      isLegacyRounding: row.isRoundingDifference,
    };
    current.sourceAmount += row.sourceAmount;
    current.allocableAmount += row.allocableAmount;
    current.tenantShare += row.tenantShare;
    if (row.allocationLabel && !current.allocationLabels.includes(row.allocationLabel)) {
      current.allocationLabels.push(row.allocationLabel);
    }
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
