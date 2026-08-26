import { describe, expect, test } from 'vitest';
import { ApiError } from '../src/server/errors';
import { eurosToCents } from '../src/server/money';

describe('Geldbeträge an der Datenbankgrenze', () => {
  test('wandelt gängige Euro-Beträge verlustfrei in Cent um', () => {
    expect(eurosToCents(0.29)).toBe(29);
    expect(eurosToCents(1169.7)).toBe(116_970);
  });

  test('weist mehr als zwei Nachkommastellen sichtbar zurück', () => {
    expect(() => eurosToCents(1.234)).toThrow(ApiError);
    expect(() => eurosToCents(1.234)).toThrow(
      'Geldbeträge dürfen höchstens zwei Nachkommastellen haben.',
    );
  });
});
