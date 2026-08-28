import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ApiError,
  DATA_CONFLICT_EVENT,
  api,
  deleteJson,
  downloadBackup,
  getJson,
  importBackup,
  postJson,
  postJsonWithRevision,
  putJson,
} from '../src/client/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Client-API', () => {
  const dispatchEvent = vi.fn();
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    dispatchEvent.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { dispatchEvent });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('liest erfolgreiche JSON-Antworten', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await expect(api<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      headers: expect.any(Headers),
      body: undefined,
    });
  });

  test('sendet JSON und die optimistische Revision', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 7 }));

    await postJsonWithRevision('/api/costs/7', { amount: 12.5 }, 4);

    const [, request] = fetchMock.mock.calls[0];
    const headers = new Headers(request?.headers);
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(JSON.stringify({ amount: 12.5 }));
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('If-Match')).toBe('4');
  });

  test('behält in den Kurzfunktionen HTTP-Methode und Löschrevision bei', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    await getJson('/api/properties');
    await postJson('/api/properties', { name: 'Haus' });
    await putJson('/api/properties/1', { name: 'Haus' });
    await deleteJson('/api/properties/1', 7);

    expect(fetchMock.mock.calls.map(([, request]) => request?.method)).toEqual([
      undefined,
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('If-Match')).toBe('7');
  });

  test('liefert bei 204 keinen Rückgabewert', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api('/api/costs/7', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  test('meldet echte Revisionskonflikte zentral an die Oberfläche', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'Der Datensatz wurde zwischenzeitlich geändert.',
          details: { currentRevision: 5 },
        },
        409,
      ),
    );

    await expect(api('/api/costs/7')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message:
        'Der Datensatz wurde zwischenzeitlich geändert. Bitte lade die Daten neu und wiederhole den Vorgang.',
    });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toBeInstanceOf(Event);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(DATA_CONFLICT_EVENT);
  });

  test('verwechselt fachliche 409-Antworten nicht mit Revisionskonflikten', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Zeiträume überschneiden sich.' }, 409));

    await expect(api('/api/tenancies')).rejects.toMatchObject({
      status: 409,
      message: 'Zeiträume überschneiden sich.',
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('nutzt bei einer nicht lesbaren Fehlerantwort eine sichere Meldung', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Fehler</html>', { status: 502 }));

    await expect(api('/api/dashboard')).rejects.toEqual(
      new ApiError('Anfrage fehlgeschlagen (502).', 502),
    );
  });

  test('lädt ein Backup unter dem Server-Dateinamen herunter', async () => {
    const click = vi.fn();
    const link = { href: '', download: '', click };
    const createElement = vi.fn(() => link);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('document', { createElement });
    fetchMock.mockResolvedValue(
      new Response(new Blob(['{}']), {
        headers: {
          'Content-Disposition': 'attachment; filename="vermietluchs-backup.json"',
        },
      }),
    );

    await downloadBackup();

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(link).toMatchObject({
      href: 'blob:backup',
      download: 'vermietluchs-backup.json',
    });
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });

  test('meldet einen fehlgeschlagenen Backup-Download', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(downloadBackup()).rejects.toEqual(
      new ApiError('Das Backup konnte nicht erstellt werden.', 503),
    );
  });

  test('validiert eine Backup-Datei vor dem Upload', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const file = {
      text: vi.fn().mockResolvedValue('{"schemaVersion":1,"app":"Vermietluchs"}'),
    } as unknown as File;

    await importBackup(file);

    const [path, request] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/backup/import');
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe('{"schemaVersion":1,"app":"Vermietluchs"}');
  });

  test('sendet eine syntaktisch ungültige Backup-Datei nicht ab', async () => {
    const file = { text: vi.fn().mockResolvedValue('{') } as unknown as File;

    await expect(importBackup(file)).rejects.toThrow(
      'Die ausgewählte Datei enthält kein gültiges JSON.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
