import { describe, expect, test } from 'vitest';
import { parseGermanNumber } from '../src/client/format';

describe('deutsche Zahleneingaben', () => {
  test.each([
    ['1', 1],
    ['10', 10],
    ['100', 100],
    ['1.000', 1000],
    ['1.234.567,89', 1234567.89],
    ['1234,56', 1234.56],
    ['12.5', 12.5],
    ['-1.234,5', -1234.5],
    ['+1,5', 1.5],
    [' 1\u00a0234,50 € ', 1234.5],
  ])('liest %s als %s', (input, expected) => {
    expect(parseGermanNumber(input)).toBe(expected);
  });

  test.each(['', '€', '1,', ',5', '1.23,45', '1,2,3', '1.000.00', '1e3', 'NaN'])(
    'lehnt unvollständige oder mehrdeutige Eingabe %s ab',
    (input) => {
      expect(parseGermanNumber(input)).toBeNull();
    },
  );
});
