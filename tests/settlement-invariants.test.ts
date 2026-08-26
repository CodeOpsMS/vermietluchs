import { describe, expect, test } from 'vitest';
import { calculateSettlement } from '../src/domain';
import type { AllocationKey, SettlementCost, SettlementInput } from '../src/domain';

function includedCost(
  id: number,
  amountCents: number,
  allocableAmountCents: number,
  labor35aCents: number,
  allocationKey: AllocationKey,
): SettlementCost {
  return {
    id,
    year: 2024,
    descriptionInternal: `Kosten ${id}`,
    sourceAmountCents: amountCents,
    allocableAmountCents,
    tenantStatus: 'included',
    statementGroup: id % 2 === 0 ? 'Wohnung' : 'Grundsteuer',
    allocationMode: 'standard',
    allocationKey,
    directUnitId: allocationKey === 'direct' ? 2 : null,
    labor35aCents,
  };
}

function scenario(seed: number): SettlementInput {
  const amount = (factor: number, offset: number) => ((seed + offset) * factor) % 250_000;
  const costs = [
    includedCost(1, amount(7919, 3) + 1, amount(3559, 3), amount(101, 1), 'area'),
    includedCost(2, amount(6151, 7) + 1, amount(2903, 7), amount(83, 2), 'persons'),
    includedCost(3, amount(4441, 11) + 1, amount(1999, 11), amount(67, 4), 'units'),
    includedCost(4, amount(3253, 13) + 1, amount(1597, 13), amount(53, 8), 'direct'),
  ];

  for (const cost of costs) {
    cost.allocableAmountCents = Math.min(cost.sourceAmountCents, cost.allocableAmountCents);
    cost.labor35aCents = Math.min(cost.allocableAmountCents, cost.labor35aCents ?? 0);
  }

  costs.push({
    ...includedCost(5, amount(2371, 17) + 1, 0, 0, 'area'),
    tenantStatus: seed % 2 === 0 ? 'excluded' : 'pending',
  });

  return {
    year: 2024,
    units: [
      { id: 1, name: 'Links', areaSqm: 41 + (seed % 17), unitWeight: 1 },
      { id: 2, name: 'Rechts', areaSqm: 59 + (seed % 23), unitWeight: 2 },
      { id: 3, name: 'Leerstand', areaSqm: 37 + (seed % 11), unitWeight: 1 },
    ],
    tenancies: [
      {
        id: 1,
        unitId: 1,
        tenantName: 'Ganzjahr',
        startDate: '2023-01-01',
        persons: 1 + (seed % 4),
        prepaymentOverridesByGroupCents: { Wohnung: amount(127, 2) },
      },
      {
        id: 2,
        unitId: 2,
        tenantName: 'Teiljahr',
        startDate: '2024-02-17',
        endDate: '2024-09-23',
        personHistory: [
          { from: '2024-02-17', persons: 1 },
          { from: '2024-06-01', persons: 2 + (seed % 3) },
        ],
        prepaymentOverridesByGroupCents: { Wohnung: amount(89, 5) },
      },
    ],
    costs,
  };
}

describe('Abrechnungsweite Cent-Invarianten', () => {
  test('erhält Kosten, Gruppen, Salden und §35a-Anteile in 500 gemischten Szenarien', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const input = scenario(seed);
      const result = calculateSettlement(input);

      for (const cost of result.costs) {
        expect(cost.tenantShareCents + cost.ownerShareCents).toBe(cost.sourceAmountCents);
        expect(Number.isSafeInteger(cost.tenantShareCents)).toBe(true);
        expect(Number.isSafeInteger(cost.ownerShareCents)).toBe(true);
      }

      for (const statement of result.statements) {
        expect(statement.rows.reduce((sum, row) => sum + row.shareCents, 0)).toBe(
          statement.totalShareCents,
        );
        expect(statement.groups.reduce((sum, group) => sum + group.totalShareCents, 0)).toBe(
          statement.totalShareCents,
        );
        for (const group of statement.groups) {
          expect(group.rows.reduce((sum, row) => sum + row.shareCents, 0)).toBe(
            group.totalShareCents,
          );
          expect(group.rows.reduce((sum, row) => sum + row.labor35aCents, 0)).toBe(
            group.total35aCents,
          );
        }
        expect(statement.prepaymentCents - statement.totalShareCents).toBe(statement.balanceCents);
      }

      expect(result.statements.reduce((sum, item) => sum + item.totalShareCents, 0)).toBe(
        result.totalTenantShareCents,
      );
      expect(result.totalTenantShareCents + result.owner.totalCents).toBe(
        result.totalSourceCostsCents,
      );

      const includedLabor = input.costs
        .filter((cost) => cost.tenantStatus === 'included')
        .reduce((sum, cost) => sum + (cost.labor35aCents ?? 0), 0);
      const tenantLabor = result.statements.reduce((sum, item) => sum + item.total35aCents, 0);
      expect(tenantLabor + result.owner.total35aCents).toBe(includedLabor);
    }
  });

  test('weist Centbeträge außerhalb des sicheren Zahlenbereichs zurück', () => {
    const input = scenario(1);
    input.costs[0].sourceAmountCents = Number.MAX_SAFE_INTEGER + 1;
    input.costs[0].allocableAmountCents = Number.MAX_SAFE_INTEGER + 1;
    expect(() => calculateSettlement(input)).toThrow(/sicherer ganzzahliger Centbetrag/);

    const unsafePrepayment = scenario(2);
    unsafePrepayment.tenancies[0].prepaymentOverridesByGroupCents = {
      Wohnung: Number.MAX_SAFE_INTEGER + 1,
    };
    expect(() => calculateSettlement(unsafePrepayment)).toThrow(/sicherer Centbetrag/);
  });
});
