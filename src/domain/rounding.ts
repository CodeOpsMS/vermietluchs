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
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new TypeError('Zu verteilende Beträge müssen nichtnegative sichere ganze Cent sein.');
  if (rawShares.some((share) => !Number.isFinite(share) || share < 0)) {
    throw new TypeError('Rohanteile müssen endliche, nichtnegative Zahlen sein.');
  }
  if (rawShares.length === 0) {
    if (totalCents > 0) {
      throw new TypeError('Ein positiver Centbetrag braucht mindestens einen Anteil.');
    }
    return [];
  }

  // Vor dem Summieren auf den größten Anteil skalieren. Dadurch bleiben auch
  // sehr große oder sehr kleine, aber endliche Gewichte ohne Überlauf nutzbar.
  const largestShare = rawShares.reduce((largest, share) => Math.max(largest, share), 0);
  if (largestShare === 0) {
    if (totalCents > 0) {
      throw new TypeError('Ein positiver Centbetrag braucht mindestens einen positiven Anteil.');
    }
    return rawShares.map(() => ({ rawCents: 0, cents: 0, allocationRoundingCents: 0 }));
  }
  const scaledShares = rawShares.map((share) => share / largestShare);
  const scaledTotal = scaledShares.reduce((sum, share) => sum + share, 0);

  // Bei minimalen Gleitkomma-Abweichungen wie 99999.999999 wird auf die
  // vorgegebene Gesamtsumme normiert; Centbeträge selbst bleiben ganzzahlig.
  const normalized = scaledShares.map((share) => (share / scaledTotal) * totalCents);
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
