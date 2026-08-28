export const euro = (amount: number | undefined | null): string =>
  (amount ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const number = (value: number | undefined | null, maximumFractionDigits = 2): string =>
  (value ?? 0).toLocaleString('de-DE', { maximumFractionDigits });

export function parseGermanNumber(value: string): number | null {
  const trimmed = value.trim().replace(/[\s€]/g, '');
  if (!trimmed) return null;

  let normalized = trimmed;
  if (trimmed.includes(',')) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(trimmed)) return null;
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(trimmed)) {
    // In einer deutschen Eingabe ist der Punkt in 1.000 ein Tausendertrenner.
    normalized = trimmed.replace(/\./g, '');
  } else if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dateDe(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

/** Wandelt ein gespeichertes ISO-Datum in die deutsche Formulareingabe um. */
export function isoDateToGermanInput(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

/** Wandelt ein vollständiges, existierendes Datum TT.MM.JJJJ nach ISO um. */
export function germanDateToIso(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function activeInYear(startDate: string, endDate: string | null, year: number): boolean {
  return startDate <= `${year}-12-31` && (!endDate || endDate >= `${year}-01-01`);
}
