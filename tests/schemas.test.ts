import { describe, expect, test } from 'vitest';
import {
  changeoverInputSchema,
  costInputSchema,
  dateSchema,
  paymentInputSchema,
  settlementCreateSchema,
} from '../src/shared/schemas';

describe('gemeinsame Eingaberegeln', () => {
  test('akzeptiert nur echte Kalendertage', () => {
    expect(dateSchema.parse('2024-02-29')).toBe('2024-02-29');
    expect(() => dateSchema.parse('2023-02-29')).toThrow();
    expect(() => dateSchema.parse('2024-13-01')).toThrow();
  });

  test('erlaubt verständliche eigene Abrechnungsgruppen', () => {
    const parsed = costInputSchema.parse({
      propertyId: 1,
      year: 2024,
      descriptionInternal: 'Aufzugwartung',
      sourceAmount: 100,
      tenantStatus: 'included',
      allocableAmount: 100,
      statementGroup: 'Aufzug',
      allocationMode: 'standard',
      allocationKey: 'area',
    });
    expect(parsed.statementGroup).toBe('Aufzug');
  });

  test('hält direkte Kostenpositionen eindeutig', () => {
    const base = {
      propertyId: 1,
      year: 2024,
      descriptionInternal: 'Direkte Kosten',
      sourceAmount: 100,
      tenantStatus: 'included' as const,
      allocableAmount: 100,
      statementGroup: 'Wohnung',
      allocationMode: 'standard' as const,
      allocationKey: 'direct' as const,
    };
    expect(costInputSchema.safeParse({ ...base, directUnitId: 1 }).success).toBe(true);
    expect(
      costInputSchema.safeParse({ ...base, directUnitId: 1, directTenancyId: 2 }).success,
    ).toBe(false);
    expect(
      costInputSchema.safeParse({
        ...base,
        allocationMode: 'fixedTenancy',
        allocationKey: 'area',
        directTenancyId: 2,
      }).success,
    ).toBe(false);
  });

  test('behält die optionale Ist-Aufteilung einer Mietzahlung', () => {
    const parsed = paymentInputSchema.parse({
      tenancyId: 1,
      dueDate: '2024-01-03',
      paidDate: '2024-01-03',
      baseRentDue: 700,
      utilityDue: 150,
      amountPaid: 850,
      baseRentPaid: 700,
      utilityPaid: 150,
      garagePaid: 0,
    });
    expect(parsed.utilityPaid).toBe(150);
  });

  test('verlangt bei einem Zahlungseingang das Zahlungsdatum', () => {
    const result = paymentInputSchema.safeParse({
      tenancyId: 1,
      dueDate: '2024-01-03',
      paidDate: null,
      baseRentDue: 700,
      utilityDue: 150,
      garageDue: 0,
      amountPaid: 850,
    });
    expect(result.success).toBe(false);
  });

  test('setzt die sichtbare Rundungsdifferenz standardmäßig auf null', () => {
    const parsed = settlementCreateSchema.parse({ propertyId: 1, tenancyId: 2, year: 2024 });
    expect(parsed.roundingDifference).toBe(0);
    expect(parsed.roundingGroup).toBe('Wohnung');
  });

  test('verlangt beim Mieterwechsel die gelesene Revision', () => {
    const incomplete = {
      previousTenancyId: 1,
      endDate: '2024-07-31',
      nextTenancy: {
        tenantName: 'Nachmieter',
        tenantAddress: '',
        startDate: '2024-08-01',
        endDate: null,
        persons: 1,
        baseRent: 700,
        utilityPrepayment: 150,
        garagePrepayment: 0,
        paymentDay: 3,
        notes: '',
      },
      readings: [],
    };
    expect(changeoverInputSchema.safeParse(incomplete).success).toBe(false);
    expect(changeoverInputSchema.safeParse({ ...incomplete, previousRevision: 0 }).success).toBe(
      true,
    );
  });
});
