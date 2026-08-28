import { describe, expect, test } from 'vitest';
import { describeApiError } from '../src/client/api-error';

describe('API-Konflikthinweis', () => {
  test('kennzeichnet einen 409 mit aktueller Revision als Revisionskonflikt', () => {
    expect(
      describeApiError(409, {
        error: 'Die Kostenposition wurde zwischenzeitlich geändert.',
        details: { currentRevision: 3 },
      }),
    ).toEqual({
      isRevisionConflict: true,
      message:
        'Die Kostenposition wurde zwischenzeitlich geändert. Bitte lade die Daten neu und wiederhole den Vorgang.',
    });
  });

  test('hängt bei einem fachlichen 409 keinen Revisionshinweis an', () => {
    expect(describeApiError(409, { error: 'Zeiträume überschneiden sich.' })).toEqual({
      isRevisionConflict: false,
      message: 'Zeiträume überschneiden sich.',
    });
  });

  test.each([
    [409, { error: 'Konflikt', details: { currentRevision: '3' } }],
    [400, { error: 'Ungültig', details: { currentRevision: 3 } }],
  ])(
    'behandelt Status %s mit unpassenden Details nicht als Revisionskonflikt',
    (status, payload) => {
      expect(describeApiError(status, payload).isRevisionConflict).toBe(false);
    },
  );

  test('behält die allgemeine Fallback-Meldung bei', () => {
    expect(describeApiError(500, null)).toEqual({
      isRevisionConflict: false,
      message: 'Anfrage fehlgeschlagen (500).',
    });
  });
});
