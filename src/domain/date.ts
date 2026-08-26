import type { SettlementTenancy } from './types';

const DAY_MS = 86_400_000;

export function toUtc(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new TypeError(`Ungültiges Datum „${date}“; erwartet wird YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = Date.UTC(year, month - 1, day);
  const normalized = new Date(value).toISOString().slice(0, 10);
  if (normalized !== date) throw new TypeError(`Ungültiges Kalenderdatum „${date}“.`);
  return value;
}

export function fromUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function previousDay(date: string): string {
  return fromUtc(toUtc(date) - DAY_MS);
}

export function daysInYear(year: number): number {
  if (!Number.isInteger(year)) throw new TypeError('Das Abrechnungsjahr muss ganzzahlig sein.');
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function overlapDays(
  leftStart: string,
  leftEnd: string | null | undefined,
  rightStart: string,
  rightEnd: string,
): number {
  const start = Math.max(toUtc(leftStart), toUtc(rightStart));
  const end = Math.min(leftEnd ? toUtc(leftEnd) : Number.POSITIVE_INFINITY, toUtc(rightEnd));
  return end < start ? 0 : Math.round((end - start) / DAY_MS) + 1;
}

export function tenancyPeriod(
  tenancy: SettlementTenancy,
  year: number,
): { start: string; end: string; days: number } | null {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const days = overlapDays(tenancy.startDate, tenancy.endDate, yearStart, yearEnd);
  if (days === 0) return null;
  return {
    start: tenancy.startDate > yearStart ? tenancy.startDate : yearStart,
    end: tenancy.endDate && tenancy.endDate < yearEnd ? tenancy.endDate : yearEnd,
    days,
  };
}

export function personsAt(tenancy: SettlementTenancy, date: string): number {
  const history = [...(tenancy.personHistory ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  let persons = tenancy.persons ?? history[0]?.persons ?? 1;
  for (const level of history) {
    if (level.from <= date) persons = level.persons;
  }
  return persons;
}

/** Personentage mit inklusiven Datumsgrenzen und beliebig vielen Staffelwechseln. */
export function personDaysInPeriod(
  tenancy: SettlementTenancy,
  requestedStart: string,
  requestedEnd: string,
): number {
  const effectiveStart = tenancy.startDate > requestedStart ? tenancy.startDate : requestedStart;
  const effectiveEnd =
    tenancy.endDate && tenancy.endDate < requestedEnd ? tenancy.endDate : requestedEnd;
  if (effectiveEnd < effectiveStart) return 0;

  const changes = [...(tenancy.personHistory ?? [])]
    .filter((level) => level.from > effectiveStart && level.from <= effectiveEnd)
    .sort((a, b) => a.from.localeCompare(b.from));

  let cursor = effectiveStart;
  let persons = personsAt(tenancy, effectiveStart);
  let total = 0;
  for (const change of changes) {
    total +=
      persons * overlapDays(cursor, previousDay(change.from), cursor, previousDay(change.from));
    cursor = change.from;
    persons = change.persons;
  }
  total += persons * overlapDays(cursor, effectiveEnd, cursor, effectiveEnd);
  return total;
}
