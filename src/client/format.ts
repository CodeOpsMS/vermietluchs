export const euro = (amount: number | undefined | null): string =>
  (amount ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const number = (value: number | undefined | null, maximumFractionDigits = 2): string =>
  (value ?? 0).toLocaleString('de-DE', { maximumFractionDigits });

export function parseGermanNumber(value: string): number | null {
  const trimmed = value.trim().replace(/\s|€/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dateDe(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
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
