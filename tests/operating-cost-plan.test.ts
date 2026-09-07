import { describe, expect, test } from 'vitest';
import { calculateOperatingCostPlan } from '../src/domain/operating-cost-plan';
import {
  createEmptyOperatingCostPlanForm,
  createOperatingCostPlanForm,
  parseOperatingCostPlanForm,
} from '../src/client/pages/operating-cost-plan/model';
import type { OperatingCostPlan, Tenancy } from '../src/client/types';

describe('Betriebskosten-Wirtschaftsplan', () => {
  test('unterscheidet eine leere Vorauszahlung von einer ungültigen Eingabe', () => {
    const form = { ...createEmptyOperatingCostPlanForm(undefined), housingCosts: '100' };
    for (const monthlyPrepayment of ['abc', '1,2,3', '-1', '1,234']) {
      expect(parseOperatingCostPlanForm({ ...form, monthlyPrepayment })).toBeNull();
    }
    expect(parseOperatingCostPlanForm({ ...form, monthlyPrepayment: '   ' })).toMatchObject({
      monthlyPrepayment: null,
    });
    expect(parseOperatingCostPlanForm({ ...form, monthlyPrepayment: '0' })).toMatchObject({
      monthlyPrepayment: 0,
    });
  });

  test('summiert die Vertragsvorauszahlungen ohne sichtbare Gleitkommareste', () => {
    expect(
      createEmptyOperatingCostPlanForm({
        utilityPrepayment: 0.1,
        garagePrepayment: 0.2,
      } as Tenancy).monthlyPrepayment,
    ).toBe('0,3');
  });

  test('lehnt einen überlaufenden Jahresbetrag ab, ohne das Formular zum Absturz zu bringen', () => {
    expect(
      parseOperatingCostPlanForm({
        ...createEmptyOperatingCostPlanForm(undefined),
        housingCosts: '50000000000000',
        garageCosts: '50000000000000',
      }),
    ).toBeNull();
  });

  test('bildet das Excel-Beispiel für 2023 centgenau ab', () => {
    expect(
      calculateOperatingCostPlan({
        housingCostsCents: 188_345,
        garageCostsCents: 824,
        propertyTaxCents: 10_629,
        months: 12,
        monthlyPrepaymentCents: 15_000,
      }),
    ).toEqual({
      annualTotalCents: 199_798,
      calculatedMonthlyAmountCents: 16_650,
      monthlyDifferenceCents: -1_650,
    });
  });

  test('prüft Centbeträge und Monate', () => {
    expect(() =>
      calculateOperatingCostPlan({
        housingCostsCents: 100,
        garageCostsCents: 0,
        propertyTaxCents: 0,
        months: 0,
        monthlyPrepaymentCents: null,
      }),
    ).toThrow(/Monate/);
    expect(() =>
      calculateOperatingCostPlan({
        housingCostsCents: 1.5,
        garageCostsCents: 0,
        propertyTaxCents: 0,
        months: 12,
        monthlyPrepaymentCents: null,
      }),
    ).toThrow(/Wohnungskosten/);
  });

  test('Formular verwendet die Vertragsvorauszahlung und liest deutsche Beträge', () => {
    const tenancy = {
      utilityPrepayment: 125,
      garagePrepayment: 25,
    } as Tenancy;
    const form = {
      ...createEmptyOperatingCostPlanForm(tenancy),
      housingCosts: '1.883,45',
      garageCosts: '8,24',
      propertyTax: '106,29',
    };
    expect(form.monthlyPrepayment).toBe('150');
    expect(parseOperatingCostPlanForm(form)).toMatchObject({
      annualTotal: 1997.98,
      calculatedMonthlyAmount: 166.5,
      monthlyPrepayment: 150,
      monthlyDifference: -16.5,
    });
  });

  test('Bearbeitungsformular erhält optionale Monatsvorauszahlung', () => {
    const plan = {
      housingCosts: 100,
      garageCosts: 0,
      propertyTax: 0,
      months: 10,
      monthlyPrepayment: null,
      notes: 'Noch offen',
    } as OperatingCostPlan;
    const form = createOperatingCostPlanForm(plan);
    expect(form.monthlyPrepayment).toBe('');
    expect(parseOperatingCostPlanForm(form)).toMatchObject({
      calculatedMonthlyAmount: 10,
      monthlyPrepayment: null,
    });
  });
});
