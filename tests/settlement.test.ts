import { describe, expect, test } from 'vitest';
import {
  calculatePrepayments,
  calculateSettlement,
  consumptionInPeriod,
  daysInYear,
  meterSegments,
  overlapDays,
  personDaysInPeriod,
} from '../src/domain';
import type { SettlementCost, SettlementInput } from '../src/domain';

function baseInput(year = 2025): SettlementInput {
  return {
    year,
    units: [
      { id: 1, name: 'EG (Eigennutzung)', areaSqm: 80, participates: false },
      { id: 2, name: 'OG links', areaSqm: 90 },
      { id: 3, name: 'OG rechts', areaSqm: 60 },
    ],
    tenancies: [
      {
        id: 20,
        unitId: 2,
        tenantName: 'Familie A',
        persons: 4,
        startDate: '2020-01-01',
        prepayments: [{ fromMonth: '2020-01', monthlyCents: 15_000 }],
      },
      {
        id: 30,
        unitId: 3,
        tenantName: 'Familie B',
        persons: 3,
        startDate: '2020-01-01',
        prepayments: [{ fromMonth: '2020-01', monthlyCents: 10_000 }],
      },
    ],
    costs: [],
  };
}

function cost(overrides: Partial<SettlementCost> = {}): SettlementCost {
  return {
    id: 1,
    year: 2025,
    descriptionInternal: 'Betriebskosten',
    descriptionTenant: 'Betriebskosten',
    sourceAmountCents: 90_000,
    allocableAmountCents: 90_000,
    tenantStatus: 'included',
    statementGroup: 'Wohnung',
    allocationMode: 'standard',
    allocationKey: 'area',
    labor35aCents: 0,
    ...overrides,
  };
}

function statement(input: SettlementInput, tenancyId: number) {
  const result = calculateSettlement(input).statements.find(
    (entry) => entry.tenancyId === tenancyId,
  );
  if (!result) throw new Error(`Mietverhältnis ${tenancyId} fehlt.`);
  return result;
}

describe('Kalender- und Personenlogik', () => {
  test('volles Jahr, Teiljahr, kein Überlapp und Schaltjahr', () => {
    expect(overlapDays('2020-01-01', null, '2025-01-01', '2025-12-31')).toBe(365);
    expect(overlapDays('2025-07-01', null, '2025-01-01', '2025-12-31')).toBe(184);
    expect(overlapDays('2020-01-01', '2025-03-31', '2025-01-01', '2025-12-31')).toBe(90);
    expect(overlapDays('2026-01-01', null, '2025-01-01', '2025-12-31')).toBe(0);
    expect(daysInYear(2024)).toBe(366);
  });

  test('Personenstaffel ändert die Personentage ab dem exakten Datum', () => {
    const tenancy = {
      id: 1,
      unitId: 1,
      tenantName: 'A',
      startDate: '2024-01-01',
      personHistory: [
        { from: '2024-01-01', persons: 2 },
        { from: '2025-07-01', persons: 3 },
      ],
    };
    expect(personDaysInPeriod(tenancy, '2025-01-01', '2025-12-31')).toBe(914);
    expect(personDaysInPeriod(tenancy, '2024-01-01', '2024-12-31')).toBe(732);
  });
});

describe('Standard-Umlageschlüssel', () => {
  test('Fläche verteilt 90:60 und lässt ausgeschlossene Eigennutzung außen vor', () => {
    const input = baseInput();
    input.costs.push(cost({ descriptionInternal: 'Grundsteuer', statementGroup: 'Grundsteuer' }));
    const result = calculateSettlement(input);
    expect(statement(input, 20).totalShareCents).toBe(54_000);
    expect(statement(input, 30).totalShareCents).toBe(36_000);
    expect(result.owner.totalCents).toBe(0);
  });

  test('Personen verteilt einen krummen Centbetrag centgenau ohne Rest', () => {
    const input = baseInput();
    input.costs.push(
      cost({
        sourceAmountCents: 100_001,
        allocableAmountCents: 100_001,
        allocationKey: 'persons',
      }),
    );
    const result = calculateSettlement(input);
    const left = result.statements.find((entry) => entry.tenancyId === 20)!;
    const right = result.statements.find((entry) => entry.tenancyId === 30)!;
    expect(left.totalShareCents + right.totalShareCents).toBe(100_001);
    expect(Math.abs(left.totalShareCents - 57_143)).toBeLessThanOrEqual(1);
    expect(result.owner.totalCents).toBe(0);
  });

  test('Personenschlüssel berücksichtigt eine Personenstaffel', () => {
    const input = baseInput();
    input.tenancies[0].personHistory = [
      { from: '2020-01-01', persons: 4 },
      { from: '2025-07-01', persons: 5 },
    ];
    input.costs.push(
      cost({
        sourceAmountCents: 100_000,
        allocableAmountCents: 100_000,
        allocationKey: 'persons',
      }),
    );
    const result = calculateSettlement(input);
    const left = result.statements.find((entry) => entry.tenancyId === 20)!;
    const right = result.statements.find((entry) => entry.tenancyId === 30)!;
    const leftPersonDays = 181 * 4 + 184 * 5;
    const rightPersonDays = 365 * 3;
    expect(left.totalShareCents + right.totalShareCents).toBe(100_000);
    expect(left.totalShareCents).toBeCloseTo(
      Math.round((100_000 * leftPersonDays) / (leftPersonDays + rightPersonDays)),
      0,
    );
    expect(left.personsAtPeriodEnd).toBe(5);
  });

  test('Einheiten verteilen nach Einheitengewicht', () => {
    const input = baseInput();
    input.units[1].unitWeight = 2;
    input.units[2].unitWeight = 1;
    input.costs.push(cost({ allocationKey: 'units' }));
    expect(statement(input, 20).totalShareCents).toBe(60_000);
    expect(statement(input, 30).totalShareCents).toBe(30_000);
  });

  test('Direktzuordnung an eine Wohnung trifft nur deren Mietverhältnis', () => {
    const input = baseInput();
    input.costs.push(
      cost({
        sourceAmountCents: 12_345,
        allocableAmountCents: 12_345,
        allocationKey: 'direct',
        directUnitId: 2,
      }),
    );
    expect(statement(input, 20).totalShareCents).toBe(12_345);
    expect(statement(input, 30).totalShareCents).toBe(0);
  });

  test('Leerstand nach Auszug bleibt als Eigentümeranteil sichtbar', () => {
    const input = baseInput();
    input.tenancies[1].endDate = '2025-03-31';
    input.costs.push(cost({ sourceAmountCents: 60_000, allocableAmountCents: 60_000 }));
    const result = calculateSettlement(input);
    const left = result.statements.find((entry) => entry.tenancyId === 20)!;
    const right = result.statements.find((entry) => entry.tenancyId === 30)!;
    expect(left.totalShareCents).toBe(36_000);
    expect(right.totalShareCents).toBe(Math.round(24_000 * (90 / 365)));
    expect(left.totalShareCents + right.totalShareCents + result.owner.totalCents).toBe(60_000);
    expect(result.owner.rows.some((row) => row.reason === 'vacancy')).toBe(true);
  });
});

describe('Vorauszahlungen und Abrechnungsstatus', () => {
  test('Saldo nutzt zwölf Vorauszahlungen bei einem vollen Mietjahr', () => {
    const input = baseInput();
    input.costs.push(
      cost({
        sourceAmountCents: 300_000,
        allocableAmountCents: 300_000,
        allocationKey: 'units',
      }),
    );
    const left = statement(input, 20);
    expect(left.prepaymentCents).toBe(180_000);
    expect(left.totalShareCents).toBe(150_000);
    expect(left.balanceCents).toBe(30_000);
  });

  test('Vorauszahlungsstaffel erhöht den Betrag ab Juli', () => {
    const result = calculatePrepayments(
      {
        id: 1,
        unitId: 1,
        tenantName: 'A',
        startDate: '2024-01-01',
        prepayments: [
          { fromMonth: '2024-01', monthlyCents: 15_000 },
          { fromMonth: '2025-07', monthlyCents: 18_000 },
        ],
      },
      2025,
    );
    expect(result.totalCents).toBe(198_000);
  });

  test('Einzug Mitte März zählt Vorauszahlungen erst ab April', () => {
    const result = calculatePrepayments(
      {
        id: 1,
        unitId: 1,
        tenantName: 'A',
        startDate: '2025-03-15',
        prepayments: [{ fromMonth: '2025-03', monthlyCents: 10_000 }],
      },
      2025,
    );
    expect(result.totalCents).toBe(90_000);
  });

  test('Tatsächliche Jahreskorrektur hat Vorrang vor der Staffel', () => {
    const result = calculatePrepayments(
      {
        id: 1,
        unitId: 1,
        tenantName: 'A',
        startDate: '2024-01-01',
        prepayments: [{ fromMonth: '2024-01', monthlyCents: 15_000 }],
        prepaymentOverrideCents: 165_000,
      },
      2025,
    );
    expect(result).toMatchObject({ totalCents: 165_000, overridden: true });
  });

  test('tatsächliche Vorauszahlungen werden getrennt nach Wohnung und Garage summiert', () => {
    const result = calculatePrepayments(
      {
        id: 1,
        unitId: 1,
        tenantName: 'A',
        startDate: '2024-01-01',
        prepayments: [{ fromMonth: '2024-01', monthlyCents: 99_999 }],
        prepaymentOverridesByGroupCents: {
          Wohnung: 105_000,
          Garage: 3_500,
        },
      },
      2025,
    );
    expect(result).toEqual({
      totalCents: 108_500,
      byGroup: { Wohnung: 105_000, Garage: 3_500, Grundsteuer: 0 },
      overridden: true,
    });
  });

  test('explizite Nullzahlung verdrängt die vertragliche Vorauszahlungsstaffel', () => {
    const result = calculatePrepayments(
      {
        id: 1,
        unitId: 1,
        tenantName: 'A',
        startDate: '2024-01-01',
        prepayments: [{ fromMonth: '2024-01', monthlyCents: 15_000 }],
        prepaymentOverridesByGroupCents: {},
      },
      2025,
    );
    expect(result).toEqual({
      totalCents: 0,
      byGroup: { Wohnung: 0, Garage: 0, Grundsteuer: 0 },
      overridden: true,
    });
  });

  test('gruppierte Ist-Vorauszahlungen akzeptieren nur nichtnegative ganze Cent', () => {
    const tenancy = {
      id: 1,
      unitId: 1,
      tenantName: 'A',
      startDate: '2024-01-01',
      prepaymentOverridesByGroupCents: { Wohnung: -1 },
    };
    expect(() => calculatePrepayments(tenancy, 2025)).toThrow(/nichtnegativer Centbetrag/);
    expect(() =>
      calculatePrepayments(
        {
          ...tenancy,
          prepaymentOverridesByGroupCents: { Wohnung: 10.5 },
        },
        2025,
      ),
    ).toThrow(/nichtnegativer Centbetrag/);
  });

  test('Kosten anderer Kalenderjahre werden ignoriert', () => {
    const input = baseInput();
    input.costs.push(cost({ year: 2024 }));
    expect(calculateSettlement(input).totalSourceCostsCents).toBe(0);
  });

  test('Ausgeschlossene Kosten erscheinen nur intern beim Eigentümer', () => {
    const input = baseInput();
    input.costs.push(cost({ tenantStatus: 'excluded', descriptionInternal: 'Dachreparatur' }));
    const result = calculateSettlement(input);
    expect(result.totalTenantShareCents).toBe(0);
    expect(result.owner.totalCents).toBe(90_000);
    expect(result.owner.rows[0].reason).toBe('excluded');
  });
});

describe('Verbrauch und Zähler', () => {
  test('Verbrauch wird zwischen Jahresablesungen linear interpoliert', () => {
    const readings = [
      { meterId: 1, date: '2024-12-31', value: 100 },
      { meterId: 1, date: '2025-12-31', value: 200 },
    ];
    expect(consumptionInPeriod(readings, '2025-01-01', '2025-12-31').consumption).toBe(100);
    const half = consumptionInPeriod(readings, '2025-01-01', '2025-06-30');
    expect(half.consumption).toBeGreaterThan(49);
    expect(half.consumption).toBeLessThan(51);
    expect(half.interpolated).toBe(true);
    expect(half.warnings.some((warning) => warning.includes('interpoliert'))).toBe(true);
  });

  test('Exakte Wechselablesung teilt den Verbrauch ohne Interpolationswarnung', () => {
    const readings = [
      { meterId: 1, date: '2024-12-31', value: 0 },
      { meterId: 1, date: '2025-03-31', value: 30 },
      { meterId: 1, date: '2025-12-31', value: 100 },
    ];
    const first = consumptionInPeriod(readings, '2025-01-01', '2025-03-31');
    const second = consumptionInPeriod(readings, '2025-04-01', '2025-12-31');
    expect(first.consumption).toBe(30);
    expect(second.consumption).toBe(70);
    expect(first.warnings).toHaveLength(0);
    expect(second.warnings).toHaveLength(0);
  });

  test('Zählerwechsel nutzt Endstand alt und Startstand neu', () => {
    const readings = [
      { meterId: 1, date: '2024-12-31', value: 950 },
      { meterId: 1, date: '2025-06-30', value: 3, replacement: true, oldEndValue: 980 },
      { meterId: 1, date: '2025-12-31', value: 40 },
    ];
    expect(consumptionInPeriod(readings, '2025-01-01', '2025-12-31').consumption).toBe(67);
    expect(meterSegments(readings).warnings).toHaveLength(0);
    expect(
      meterSegments([
        { meterId: 1, date: '2024-12-31', value: 950 },
        { meterId: 1, date: '2025-06-30', value: 3 },
      ]).warnings,
    ).toHaveLength(1);
  });

  test('Verbrauchsschlüssel verteilt nach Wohnungszählern', () => {
    const input = baseInput();
    input.meters = [
      { id: 2, unitId: 2, type: 'coldWater', name: 'Wasser links' },
      { id: 3, unitId: 3, type: 'coldWater', name: 'Wasser rechts' },
    ];
    input.readings = [
      { meterId: 2, date: '2024-12-31', value: 0 },
      { meterId: 2, date: '2025-12-31', value: 60 },
      { meterId: 3, date: '2024-12-31', value: 0 },
      { meterId: 3, date: '2025-12-31', value: 40 },
    ];
    input.costs.push(
      cost({
        sourceAmountCents: 100_000,
        allocableAmountCents: 100_000,
        allocationKey: 'meter',
        meterType: 'coldWater',
      }),
    );
    const result = calculateSettlement(input);
    expect(result.statements.find((entry) => entry.tenancyId === 20)!.totalShareCents).toBe(60_000);
    expect(result.statements.find((entry) => entry.tenancyId === 30)!.totalShareCents).toBe(40_000);
    expect(result.owner.totalCents).toBe(0);
  });

  test('Fehlende Ablesungen warnen und belassen den Betrag beim Eigentümer', () => {
    const input = baseInput();
    input.costs.push(cost({ allocationKey: 'meter', meterType: 'coldWater' }));
    const result = calculateSettlement(input);
    expect(result.totalTenantShareCents).toBe(0);
    expect(result.owner.totalCents).toBe(90_000);
    expect(result.warnings.some((warning) => warning.includes('fehlt Verbrauch'))).toBe(true);
  });
});
