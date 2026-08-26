import { ApiError } from './errors';

export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros)) throw new ApiError(400, 'Der Geldbetrag ist ungültig.');

  const exactCents = euros * 100;
  const cents = Math.round(exactCents);
  if (Math.abs(exactCents - cents) > 0.0000001) {
    throw new ApiError(400, 'Geldbeträge dürfen höchstens zwei Nachkommastellen haben.');
  }
  if (!Number.isSafeInteger(cents)) throw new ApiError(400, 'Der Geldbetrag ist zu groß.');
  return cents;
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}
