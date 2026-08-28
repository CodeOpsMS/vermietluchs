import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  activeInYear,
  dateDe,
  euro,
  germanDateToIso,
  isoDateToGermanInput,
  number,
  parseGermanNumber,
  today,
} from '../src/client/format';

afterEach(() => {
  vi.useRealTimers();
});

describe('Deutsche Datumseingabe', () => {
  test('wandelt zwischen Anzeige und gespeichertem ISO-Format um', () => {
    expect(isoDateToGermanInput('2024-07-31')).toBe('31.07.2024');
    expect(germanDateToIso('31.07.2024')).toBe('2024-07-31');
  });

  test('akzeptiert existierende Schalttage', () => {
    expect(germanDateToIso('29.02.2024')).toBe('2024-02-29');
  });

  test.each(['31.02.2024', '29.02.2023', '2024-07-31', '1.7.2024', ''])(
    'lehnt ungültige oder unvollständige Eingaben ab: %s',
    (value) => {
      expect(germanDateToIso(value)).toBeNull();
    },
  );

  test('zeigt leere und fremde Werte nicht als scheinbar gültiges Datum', () => {
    expect(isoDateToGermanInput('')).toBe('');
    expect(isoDateToGermanInput('31.07.2024')).toBe('');
  });

  test('formatiert gespeicherte Daten robust für die Anzeige', () => {
    expect(dateDe('2024-07-31')).toBe('31.07.2024');
    expect(dateDe(null)).toBe('—');
    expect(dateDe('fremdes-format')).toBe('fremdes-format');
  });

  test('ermittelt das lokale heutige Datum ohne UTC-Verschiebung', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 1, 3, 12, 0, 0));

    expect(today()).toBe('2024-02-03');
  });

  test.each([
    ['2024-01-01', null, 2024, true],
    ['2023-12-31', '2024-01-01', 2024, true],
    ['2025-01-01', null, 2024, false],
    ['2023-01-01', '2023-12-31', 2024, false],
  ])('prüft die Überschneidung %s bis %s mit %s', (startDate, endDate, year, expected) => {
    expect(activeInYear(startDate, endDate, year)).toBe(expected);
  });
});

describe('Deutsche Zahleneingabe', () => {
  test.each([
    ['1.000', 1000],
    ['1.234.567,89', 1234567.89],
    ['47,46', 47.46],
    ['47.46', 47.46],
    ['0,001', 0.001],
  ])('interpretiert %s als %s', (input, expected) => {
    expect(parseGermanNumber(input)).toBe(expected);
  });

  test.each(['1.23.456', '1,2,3', '12abc'])('lehnt die ungültige Zahl %s ab', (input) => {
    expect(parseGermanNumber(input)).toBeNull();
  });

  test('formatiert Zahlen und leere Beträge konsistent', () => {
    expect(euro(1234.5)).toContain('1.234,50');
    expect(euro(null)).toContain('0,00');
    expect(number(1234.567, 1)).toBe('1.234,6');
    expect(number(undefined)).toBe('0');
  });
});
