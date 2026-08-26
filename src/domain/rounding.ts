export interface RoundedShare {
  rawCents: number;
  cents: number;
  allocationRoundingCents: number;
}

/**
 * Hare-/Größter-Rest-Verfahren: verteilt einen ganzzahligen Centbetrag exakt.
 * Die Reihenfolge entscheidet deterministisch bei identischen Resten.
 */
export function distributeCents(totalCents: number, rawShares: number[]): RoundedShare[] {
  if (!Number.isInteger(totalCents))
    throw new TypeError('Zu verteilende Beträge müssen ganze Cent sein.');
  if (rawShares.some((share) => !Number.isFinite(share) || share < 0)) {
    throw new TypeError('Rohanteile müssen endliche, nichtnegative Zahlen sein.');
  }
  if (rawShares.length === 0) return [];

  const rawTotal = rawShares.reduce((sum, share) => sum + share, 0);
  if (rawTotal === 0) {
    return rawShares.map(() => ({ rawCents: 0, cents: 0, allocationRoundingCents: 0 }));
  }

  // Bei minimalen Gleitkomma-Abweichungen wie 99999.999999 wird auf die
  // vorgegebene Gesamtsumme normiert; Centbeträge selbst bleiben ganzzahlig.
  const normalized = rawShares.map((share) => (share / rawTotal) * totalCents);
  const cents = normalized.map(Math.floor);
  let remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const order = normalized
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    cents[order[index % order.length].index] += 1;
  }

  return normalized.map((rawCents, index) => ({
    rawCents,
    cents: cents[index],
    allocationRoundingCents: cents[index] - Math.round(rawCents),
  }));
}
