export interface OperatingCostPlanCalculationInput {
  housingCostsCents: number;
  garageCostsCents: number;
  propertyTaxCents: number;
  months: number;
  monthlyPrepaymentCents: number | null;
}

export interface OperatingCostPlanCalculation {
  annualTotalCents: number;
  calculatedMonthlyAmountCents: number;
  monthlyDifferenceCents: number | null;
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} muss ein nichtnegativer sicherer Centbetrag sein.`);
  }
}

/** Berechnet Jahres- und Monatswerte eines Betriebskosten-Wirtschaftsplans centgenau. */
export function calculateOperatingCostPlan(
  input: OperatingCostPlanCalculationInput,
): OperatingCostPlanCalculation {
  assertCents(input.housingCostsCents, 'Wohnungskosten');
  assertCents(input.garageCostsCents, 'Garagenkosten');
  assertCents(input.propertyTaxCents, 'Grundsteuer');
  if (!Number.isSafeInteger(input.months) || input.months < 1 || input.months > 12) {
    throw new TypeError('Die Anzahl der Monate muss zwischen 1 und 12 liegen.');
  }
  if (input.monthlyPrepaymentCents !== null) {
    assertCents(input.monthlyPrepaymentCents, 'Festgelegte Monatsvorauszahlung');
  }

  const annualTotalCents =
    input.housingCostsCents + input.garageCostsCents + input.propertyTaxCents;
  if (!Number.isSafeInteger(annualTotalCents)) {
    throw new TypeError('Der Jahresbetrag überschreitet den sicheren Zahlenbereich.');
  }
  const calculatedMonthlyAmountCents = Math.round(annualTotalCents / input.months);

  return {
    annualTotalCents,
    calculatedMonthlyAmountCents,
    monthlyDifferenceCents:
      input.monthlyPrepaymentCents === null
        ? null
        : input.monthlyPrepaymentCents - calculatedMonthlyAmountCents,
  };
}
