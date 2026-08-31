import { calculateOperatingCostPlan } from '../../../domain/operating-cost-plan';
import { parseGermanNumber } from '../../format';
import type { OperatingCostPlan, Tenancy } from '../../types';

export type OperatingCostPlanForm = {
  id?: number;
  revision?: number;
  housingCosts: string;
  garageCosts: string;
  propertyTax: string;
  months: string;
  monthlyPrepayment: string;
  notes: string;
};

export type ParsedOperatingCostPlanForm = {
  housingCosts: number;
  garageCosts: number;
  propertyTax: number;
  months: number;
  monthlyPrepayment: number | null;
  notes: string;
  annualTotal: number;
  calculatedMonthlyAmount: number;
  monthlyDifference: number | null;
};

const asInput = (value: number): string => String(value).replace('.', ',');

export function createEmptyOperatingCostPlanForm(
  tenancy: Tenancy | undefined,
): OperatingCostPlanForm {
  const currentPrepayment =
    tenancy === undefined ? 0 : tenancy.utilityPrepayment + tenancy.garagePrepayment;
  return {
    housingCosts: '',
    garageCosts: '0',
    propertyTax: '0',
    months: '12',
    monthlyPrepayment: asInput(currentPrepayment),
    notes: '',
  };
}

export function createOperatingCostPlanForm(plan: OperatingCostPlan): OperatingCostPlanForm {
  return {
    id: plan.id,
    revision: plan.revision,
    housingCosts: asInput(plan.housingCosts),
    garageCosts: asInput(plan.garageCosts),
    propertyTax: asInput(plan.propertyTax),
    months: String(plan.months),
    monthlyPrepayment: plan.monthlyPrepayment === null ? '' : asInput(plan.monthlyPrepayment),
    notes: plan.notes,
  };
}

function validMoney(value: number | null): value is number {
  if (value === null || value < 0) return false;
  const cents = value * 100;
  return Number.isSafeInteger(Math.round(cents)) && Math.abs(cents - Math.round(cents)) < 1e-7;
}

export function parseOperatingCostPlanForm(
  form: OperatingCostPlanForm,
): ParsedOperatingCostPlanForm | null {
  const housingCosts = parseGermanNumber(form.housingCosts);
  const garageCosts = parseGermanNumber(form.garageCosts);
  const propertyTax = parseGermanNumber(form.propertyTax);
  const monthlyPrepayment = form.monthlyPrepayment.trim()
    ? parseGermanNumber(form.monthlyPrepayment)
    : null;
  const months = Number(form.months);
  if (
    !validMoney(housingCosts) ||
    !validMoney(garageCosts) ||
    !validMoney(propertyTax) ||
    (monthlyPrepayment !== null && !validMoney(monthlyPrepayment)) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 12
  ) {
    return null;
  }

  const calculated = calculateOperatingCostPlan({
    housingCostsCents: Math.round(housingCosts * 100),
    garageCostsCents: Math.round(garageCosts * 100),
    propertyTaxCents: Math.round(propertyTax * 100),
    months,
    monthlyPrepaymentCents: monthlyPrepayment === null ? null : Math.round(monthlyPrepayment * 100),
  });
  return {
    housingCosts,
    garageCosts,
    propertyTax,
    months,
    monthlyPrepayment,
    notes: form.notes.trim(),
    annualTotal: calculated.annualTotalCents / 100,
    calculatedMonthlyAmount: calculated.calculatedMonthlyAmountCents / 100,
    monthlyDifference:
      calculated.monthlyDifferenceCents === null ? null : calculated.monthlyDifferenceCents / 100,
  };
}
