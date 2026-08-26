import { describe, expect, test } from 'vitest';
import { calculateSettlement, distributeCents } from '../src/domain';
import type { SettlementCost, SettlementInput } from '../src/domain';

function singleTenancyInput(year = 2024): SettlementInput {
  return {
    year,
    units: [{ id: 1, name: 'DG', areaSqm: 47.46 }],
    tenancies: [
      {
        id: 1,
        unitId: 1,
        tenantName: 'Mieter A',
        startDate: `${year}-01-01`,
        endDate: `${year}-07-31`,
        persons: 1,
        prepayments: [{ fromMonth: `${year}-01`, monthlyCents: 15_000 }],
      },
    ],
    costs: [],
  };
}

function fixedCost(
  id: number,
  amountCents: number,
  group: string,
  overrides: Partial<SettlementCost> = {},
): SettlementCost {
  return {
    id,
    year: 2024,
    descriptionInternal: `${group} intern`,
    descriptionTenant: group,
    sourceAmountCents: amountCents,
    allocableAmountCents: amountCents,
    tenantStatus: 'included',
    statementGroup: group,
    allocationMode: 'fixedTenancy',
    allocationKey: 'direct',
    directTenancyId: 1,
    labor35aCents: 0,
    ...overrides,
  };
}

describe('Interne und externe Kostensicht', () => {
  test('nur der umlagefähige Teil geht an den Mieter', () => {
    const input = singleTenancyInput();
    input.costs.push(fixedCost(1, 10_000, 'Wohnung', { allocableAmountCents: 6_000 }));
    const result = calculateSettlement(input);
    expect(result.totalSourceCostsCents).toBe(10_000);
    expect(result.totalTenantShareCents).toBe(6_000);
    expect(result.owner.totalCents).toBe(4_000);
    expect(result.owner.rows[0].reason).toBe('not-allocable');
  });

  test('pending bleibt extern unsichtbar und blockiert den Abschluss', () => {
    const input = singleTenancyInput();
    input.costs.push(fixedCost(1, 50_000, 'Wohnung', { tenantStatus: 'pending' }));
    const result = calculateSettlement(input);
    expect(result.statements[0].totalShareCents).toBe(0);
    expect(result.pendingCostsCents).toBe(50_000);
    expect(result.canClose).toBe(false);
    expect(result.blockingReasons).toHaveLength(1);
  });

  test('included und excluded können in derselben internen Abrechnung stehen', () => {
    const input = singleTenancyInput();
    input.costs.push(
      fixedCost(1, 20_000, 'Wohnung'),
      fixedCost(2, 30_000, 'Wohnung', { tenantStatus: 'excluded' }),
    );
    const result = calculateSettlement(input);
    expect(result.totalSourceCostsCents).toBe(50_000);
    expect(result.totalTenantShareCents).toBe(20_000);
    expect(result.owner.totalCents).toBe(30_000);
    expect(result.canClose).toBe(true);
  });
});

describe('Feste Mieteranteile und Teiljahr', () => {
  test('fixedTenancy wird nicht ein zweites Mal zeitanteilig gekürzt', () => {
    const input = singleTenancyInput();
    input.costs.push(fixedCost(1, 110_270, 'Wohnung'));
    const result = calculateSettlement(input);
    const statement = result.statements[0];
    expect(statement.days).toBe(213);
    expect(statement.totalShareCents).toBe(110_270);
    expect(statement.rows[0].basisText).toContain('berechneter Mieteranteil');
  });

  test('Teiljahr zeigt Hinweis und keine automatische 1/12-Empfehlung', () => {
    const input = singleTenancyInput();
    input.costs.push(fixedCost(1, 110_270, 'Wohnung'));
    const statement = calculateSettlement(input).statements[0];
    expect(statement.isPartialYear).toBe(true);
    expect(statement.notes.some((note) => note.includes('Teiljahresabrechnung'))).toBe(true);
    expect(statement.suggestedMonthlyPrepaymentCents).toBeNull();
    expect(statement.prepaymentCents).toBe(105_000);
  });

  test('volles Mietjahr erhält weiterhin eine auf volle Euro gerundete Empfehlung', () => {
    const input = singleTenancyInput(2025);
    input.tenancies[0].endDate = null;
    input.costs.push(fixedCost(1, 145_025, 'Wohnung', { year: 2025 }));
    const statement = calculateSettlement(input).statements[0];
    expect(statement.isPartialYear).toBe(false);
    expect(statement.suggestedMonthlyPrepaymentCents).toBe(12_100);
  });
});

describe('Abrechnungsgruppen, §35a und Rundung', () => {
  test('Wohnung, Garage und Grundsteuer bleiben einzeln gruppiert', () => {
    const input = singleTenancyInput();
    input.costs.push(
      fixedCost(1, 110_270, 'Wohnung'),
      fixedCost(2, 499, 'Garage'),
      fixedCost(3, 6_200, 'Grundsteuer'),
    );
    const statement = calculateSettlement(input).statements[0];
    expect(statement.groups.find((group) => group.group === 'Wohnung')!.totalShareCents).toBe(
      110_270,
    );
    expect(statement.groups.find((group) => group.group === 'Garage')!.totalShareCents).toBe(499);
    expect(statement.groups.find((group) => group.group === 'Grundsteuer')!.totalShareCents).toBe(
      6_200,
    );
    expect(statement.totalShareCents).toBe(116_969);
  });

  test('benutzerdefinierte Gruppe Aufzug folgt stabil nach vorhandenen Standardgruppen', () => {
    const input = singleTenancyInput();
    input.costs.push(
      fixedCost(1, 499, 'Garage'),
      fixedCost(2, 2_500, 'Aufzug'),
      fixedCost(3, 110_270, 'Wohnung'),
    );
    input.tenancies[0].prepaymentOverridesByGroupCents = {
      Wohnung: 105_000,
      Aufzug: 1_000,
    };
    const statement = calculateSettlement(input).statements[0];
    expect(statement.groups.map((group) => group.group)).toEqual(['Wohnung', 'Garage', 'Aufzug']);
    expect(statement.groups.find((group) => group.group === 'Aufzug')?.totalShareCents).toBe(2_500);
    expect(statement.prepaymentsByGroup).toEqual({
      Wohnung: 105_000,
      Garage: 0,
      Grundsteuer: 0,
      Aufzug: 1_000,
    });
    expect(statement.prepaymentCents).toBe(106_000);
  });

  test('Excel-Einzelwerte ergeben ohne künstlichen Zusatzcent exakt 1.169,69 Euro', () => {
    const input = singleTenancyInput();
    input.costs.push(
      fixedCost(1, 110_270, 'Wohnung'),
      fixedCost(2, 499, 'Garage'),
      fixedCost(3, 6_200, 'Grundsteuer'),
    );
    const result = calculateSettlement(input);
    const statement = result.statements[0];
    expect(statement.totalShareCents).toBe(116_969);
    expect(statement.prepaymentCents).toBe(105_000);
    expect(statement.balanceCents).toBe(-11_969);
    expect(result.totalTenantShareCents).toBe(116_969);
  });

  test('§35a-Anteil folgt dem Mieteranteil centgenau', () => {
    const input: SettlementInput = {
      year: 2025,
      units: [
        { id: 1, name: 'Links', areaSqm: 50 },
        { id: 2, name: 'Rechts', areaSqm: 50 },
      ],
      tenancies: [
        { id: 1, unitId: 1, tenantName: 'A', startDate: '2025-01-01' },
        { id: 2, unitId: 2, tenantName: 'B', startDate: '2025-01-01' },
      ],
      costs: [
        {
          id: 1,
          year: 2025,
          descriptionInternal: 'Gartenpflege',
          sourceAmountCents: 60_000,
          allocableAmountCents: 60_000,
          tenantStatus: 'included',
          statementGroup: 'Wohnung',
          allocationMode: 'standard',
          allocationKey: 'units',
          labor35aCents: 30_000,
        },
      ],
    };
    const result = calculateSettlement(input);
    expect(result.statements[0].total35aCents).toBe(15_000);
    expect(result.statements[1].total35aCents).toBe(15_000);
    expect(result.statements.reduce((sum, item) => sum + item.total35aCents, 0)).toBe(30_000);
  });

  test('Hare-Verfahren verteilt Centbetrag exakt und weist Rundungskorrektur aus', () => {
    const shares = distributeCents(1, [0.5, 0.5, 0]);
    expect(shares.reduce((sum, share) => sum + share.cents, 0)).toBe(1);
    expect(shares.some((share) => share.allocationRoundingCents !== 0)).toBe(true);
  });
});
