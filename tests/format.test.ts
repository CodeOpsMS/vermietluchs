import { describe, expect, test } from 'vitest';
import { germanDateToIso, isoDateToGermanInput } from '../src/client/format';

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
});
