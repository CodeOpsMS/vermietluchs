import { describe, expect, test } from 'vitest';
import { createExternalCostGroups } from '../src/client/pages/costs/cost-model';
import type { Cost, TenantStatus } from '../src/client/types';

function cost(
  id: number,
  statementGroup: string,
  allocableAmount: number,
  tenantStatus: TenantStatus,
): Cost {
  return {
    id,
    revision: 0,
    propertyId: 1,
    year: 2024,
    descriptionInternal: `Interne Position ${id}`,
    descriptionTenant: '',
    sourceAmount: allocableAmount,
    allocableAmount,
    tenantStatus,
    statementGroup,
    allocationMode: 'standard',
    allocationKey: 'area',
    directUnitId: null,
    directTenancyId: null,
    meterType: null,
    labor35a: 0,
    notes: '',
  };
}

describe('Externe Sammelpositionen', () => {
  test('fasst nur freigegebene Kosten nach Mieterposition zusammen', () => {
    const groups = createExternalCostGroups([
      cost(1, 'Wohnung', 300, 'included'),
      cost(2, 'Wohnung', 200, 'included'),
      cost(3, 'Wohnung', 100, 'pending'),
      cost(4, 'Garage', 4.99, 'included'),
      cost(5, 'Grundsteuer', 62, 'included'),
      cost(6, 'Grundsteuer', 10, 'excluded'),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Wohnung', 'Garage', 'Grundsteuer']);
    expect(groups[0]).toMatchObject({
      costCount: 2,
      allocableAmount: 500,
    });
    expect(groups[2]).toMatchObject({
      costCount: 1,
      allocableAmount: 62,
    });
  });

  test('zeigt offene und nicht umlagefähige Gruppen extern nicht an', () => {
    expect(
      createExternalCostGroups([
        cost(1, 'Prüfung', 100, 'pending'),
        cost(2, 'Eigentümer', 100, 'excluded'),
      ]),
    ).toEqual([]);
  });
});
