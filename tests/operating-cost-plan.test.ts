import { describe, expect, test } from 'vitest';
import { calculateOperatingCostPlan } from '../src/domain/operating-cost-plan';
import {
  createEmptyOperatingCostPlanForm,
  createOperatingCostPlanForm,
  parseOperatingCostPlanForm,
} from '../src/client/pages/operating-cost-plan/model';
import type { OperatingCostPlan, Tenancy } from '../src/client/types';

describe('Betriebskosten-Wirtschaftsplan', () => {
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
