import { describe, expect, test } from 'vitest';
import { distributeCents } from '../src/domain';

describe('Centgenaue Restverteilung', () => {
  test('erhält den Gesamtbetrag in mehr als 3.000 unterschiedlichen Verteilungen', () => {
    let checkedCases = 0;

    for (let totalCents = 0; totalCents <= 250; totalCents += 1) {
      for (let participantCount = 1; participantCount <= 12; participantCount += 1) {
        const weights = Array.from({ length: participantCount }, (_, index) => {
          const value = ((totalCents + 3) * (index + 5) * 17) % 29;
          return value % 7 === 0 ? 0 : value + 1;
        });
        if (weights.reduce((sum, weight) => sum + weight, 0) === 0) weights[0] = 1;

        const first = distributeCents(totalCents, weights);
        const second = distributeCents(totalCents, weights);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

        expect(first).toEqual(second);
        expect(first.reduce((sum, share) => sum + share.cents, 0)).toBe(totalCents);
        first.forEach((share, index) => {
          const exact = (weights[index] / totalWeight) * totalCents;
          expect(Number.isInteger(share.cents)).toBe(true);
          expect(share.cents).toBeGreaterThanOrEqual(0);
          expect([Math.floor(exact), Math.ceil(exact)]).toContain(share.cents);
          if (weights[index] === 0) expect(share.cents).toBe(0);
        });
        checkedCases += 1;
      }
    }

    expect(checkedCases).toBe(3_012);
  });

  test('entscheidet Restcent-Gleichstände stabil nach Eingabereihenfolge', () => {
    expect(distributeCents(2, [1, 1, 1]).map((share) => share.cents)).toEqual([1, 1, 0]);
    expect(distributeCents(1, [0, 1, 1]).map((share) => share.cents)).toEqual([0, 1, 0]);
  });

  test('weist ungültige oder nicht verteilbare Beträge zurück', () => {
    expect(() => distributeCents(-1, [1])).toThrow(/nichtnegative sichere ganze Cent/);
    expect(() => distributeCents(1.5, [1])).toThrow(/nichtnegative sichere ganze Cent/);
    expect(() => distributeCents(Number.MAX_SAFE_INTEGER + 1, [1])).toThrow(/sichere ganze Cent/);
    expect(() => distributeCents(1, [Number.NaN])).toThrow(/endliche/);
    expect(() => distributeCents(1, [Number.POSITIVE_INFINITY])).toThrow(/endliche/);
    expect(() => distributeCents(1, [-1])).toThrow(/nichtnegative/);
    expect(() => distributeCents(1, [])).toThrow(/mindestens einen Anteil/);
    expect(() => distributeCents(1, [0, 0])).toThrow(/positiver Centbetrag/);
    expect(
      distributeCents(4, [Number.MAX_VALUE, Number.MAX_VALUE / 2]).map((share) => share.cents),
    ).toEqual([3, 1]);
    expect(distributeCents(1, [Number.MIN_VALUE, Number.MIN_VALUE])).toEqual([
      { rawCents: 0.5, cents: 1, allocationRoundingCents: 0 },
      { rawCents: 0.5, cents: 0, allocationRoundingCents: -1 },
    ]);
    expect(distributeCents(10, [0.1, 0.2, 0.3]).map((share) => share.cents)).toEqual([2, 3, 5]);
    expect(distributeCents(1_000_000_001, [3, 2, 1]).map((share) => share.cents)).toEqual([
      500_000_000, 333_333_334, 166_666_667,
    ]);
    expect(distributeCents(0, [])).toEqual([]);
    expect(distributeCents(0, [0, 0])).toEqual([
      { rawCents: 0, cents: 0, allocationRoundingCents: 0 },
      { rawCents: 0, cents: 0, allocationRoundingCents: 0 },
    ]);
  });
});
