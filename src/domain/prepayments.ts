import { tenancyPeriod } from './date';
import type { SettlementTenancy, StatementGroup } from './types';

const STANDARD_GROUPS: StatementGroup[] = ['Wohnung', 'Garage', 'Grundsteuer'];

export interface PrepaymentResult {
  totalCents: number;
  byGroup: Record<string, number>;
  overridden: boolean;
}

function emptyGroups(): Record<string, number> {
  return { Wohnung: 0, Garage: 0, Grundsteuer: 0 };
}

/** Monatsvorauszahlungen zählen nur, wenn das Mietverhältnis am Monatsersten besteht. */
export function calculatePrepayments(tenancy: SettlementTenancy, year: number): PrepaymentResult {
  const byGroup = emptyGroups();
  if (!tenancyPeriod(tenancy, year)) return { totalCents: 0, byGroup, overridden: false };

  if (tenancy.prepaymentOverridesByGroupCents !== undefined) {
    for (const [group, value] of Object.entries(tenancy.prepaymentOverridesByGroupCents)) {
      const cents = value ?? 0;
      if (!Number.isInteger(cents) || cents < 0) {
        throw new TypeError(
          `Die tatsächliche Vorauszahlung für ${group} muss ein nichtnegativer Centbetrag sein.`,
        );
      }
      byGroup[group] = cents;
    }
    return {
      totalCents: Object.values(byGroup).reduce((sum, cents) => sum + cents, 0),
      byGroup,
      overridden: true,
    };
  }

  if (tenancy.prepaymentOverrideCents !== undefined) {
    if (!Number.isInteger(tenancy.prepaymentOverrideCents) || tenancy.prepaymentOverrideCents < 0) {
      throw new TypeError('Die korrigierte Vorauszahlung muss ein nichtnegativer Centbetrag sein.');
    }
    byGroup.Wohnung = tenancy.prepaymentOverrideCents;
    return {
      totalCents: tenancy.prepaymentOverrideCents,
      byGroup,
      overridden: true,
    };
  }

  const schedule = [...(tenancy.prepayments ?? [])].sort((left, right) =>
    left.fromMonth.localeCompare(right.fromMonth),
  );
  const groups = [...STANDARD_GROUPS];
  for (const level of schedule) {
    if (!/^\d{4}-\d{2}$/.test(level.fromMonth)) {
      throw new TypeError(`Ungültiger Vorauszahlungsmonat „${level.fromMonth}“.`);
    }
    if (!Number.isInteger(level.monthlyCents) || level.monthlyCents < 0) {
      throw new TypeError('Vorauszahlungen müssen nichtnegative ganze Cent sein.');
    }
    const group = level.group ?? 'Wohnung';
    if (!groups.includes(group)) {
      groups.push(group);
      byGroup[group] = 0;
    }
  }

  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const firstDay = `${monthKey}-01`;
    if (tenancy.startDate > firstDay) continue;
    if (tenancy.endDate && tenancy.endDate < firstDay) continue;

    for (const group of groups) {
      let monthlyCents = 0;
      for (const level of schedule) {
        if ((level.group ?? 'Wohnung') === group && level.fromMonth <= monthKey) {
          monthlyCents = level.monthlyCents;
        }
      }
      byGroup[group] += monthlyCents;
    }
  }

  return {
    totalCents: Object.values(byGroup).reduce((sum, cents) => sum + cents, 0),
    byGroup,
    overridden: false,
  };
}
