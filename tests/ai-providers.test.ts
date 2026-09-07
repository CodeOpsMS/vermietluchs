import { describe, expect, test, vi } from 'vitest';
import { createAiProviderService, type AiRuntimeSettings } from '../src/server/ai/providers';
import { textPdf } from './helpers/pdf';

const result = {
  documentType: 'owner_statement',
  detectedYear: 2024,
  costs: [],
  readings: [],
  warnings: [],
};

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('KI-Provideradapter', () => {
  test('sendet OpenAI-PDFs ohne Speicherung und fordert ein striktes Schema an', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(json({ output_text: JSON.stringify(result) }));
    const service = createAiProviderService(fetchMock);
    const scanned = await service.scanPdf(
      { provider: 'openai', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
      'sk-test',
      Buffer.from('%PDF-1.4\nfixture'),
      { fileName: 'abrechnung.pdf', propertyName: 'Haus A', year: 2024 },
    );
    expect(scanned).toEqual(result);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(String(request?.body));
    expect(body.store).toBe(false);
    expect(body.input[0].content[0].file_data).toMatch(/^data:application\/pdf;base64,/);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
  });

  test('führt bei Mistral zuerst OCR und danach die strukturierte Auswertung aus', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ pages: [{ markdown: 'Hausreinigung 321,45 EUR' }] }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: JSON.stringify(result) } }] }));
    const service = createAiProviderService(fetchMock);
    await service.scanPdf(
      { provider: 'mistral', model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1' },
      'mistral-test',
      Buffer.from('%PDF-1.4\nfixture'),
      { fileName: 'abrechnung.pdf', propertyName: 'Haus A', year: 2024 },
    );
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.mistral.ai/v1/ocr',
      'https://api.mistral.ai/v1/chat/completions',
    ]);
    const chatBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(chatBody.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true },
    });
  });

  test('prüft bei Ollama, ob das konfigurierte Modell lokal vorhanden ist', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(json({ models: [{ name: 'qwen2.5vl:7b' }] }));
    const service = createAiProviderService(fetchMock);
    await expect(
      service.testConnection(
        { provider: 'ollama', model: 'qwen2.5vl:7b', baseUrl: 'http://127.0.0.1:11434' },
        null,
      ),
    ).resolves.toContain('erreichbar');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/tags',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });

  test('liest Text-PDFs für Ollama lokal und sendet keine Datei an einen Cloud-Dienst', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(json({ message: { content: JSON.stringify(result) } }));
    const service = createAiProviderService(fetchMock);
    const pdf = textPdf(
      'Hausreinigung 321,45 Euro Abrechnungsjahr 2024 Wohnanlage Musterweg weitere eindeutige Dokumentbeschreibung fuer den lokalen Test',
    );
    await expect(
      service.scanPdf(
        { provider: 'ollama', model: 'qwen2.5vl:7b', baseUrl: 'http://127.0.0.1:11434' },
        null,
        pdf,
        { fileName: 'lokal.pdf', propertyName: 'Haus A', year: 2024 },
      ),
    ).resolves.toEqual(result);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain('Hausreinigung');
    expect(body.messages[0]).not.toHaveProperty('images');
  });
});

const context = { fileName: 'rechnung.pdf', propertyName: 'Haus A', year: 2024 };
const compatible: AiRuntimeSettings = {
  provider: 'compatible',
  model: 'some-org/text-model',
  baseUrl: 'http://localhost:1234/v1/',
  documentMode: 'text',
  outputMode: 'prompt',
};
const chatResult = { choices: [{ message: { content: JSON.stringify(result) } }] };

describe('Universelle Modelleingabe', () => {
  test.each(['prompt', 'json_object', 'json_schema'] as const)(
    'unterstützt %s mit einem beliebigen Textmodell',
    async (outputMode) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(chatResult));
      await expect(
        createAiProviderService(fetchMock).scanPdf(
          { ...compatible, outputMode },
          null,
          textPdf('Reinigung 42 Euro'),
          context,
        ),
      ).resolves.toEqual(result);
      const [url, request] = fetchMock.mock.calls[0];
      const body = JSON.parse(String(request?.body));
      expect(url).toBe('http://localhost:1234/v1/chat/completions');
      expect(request?.headers).not.toHaveProperty('Authorization');
      expect(body.model).toBe('some-org/text-model');
      expect(body.messages[0].content).toContain('Reinigung 42 Euro');
      expect(body.messages[0].content).toContain('"documentType"');
      expect(body).not.toHaveProperty('temperature');
      if (outputMode === 'prompt') expect(body).not.toHaveProperty('response_format');
      else expect(body.response_format.type).toBe(outputMode);
    },
  );

  test('sendet Seitenbilder im kompatiblen Multimodalformat und den optionalen Schlüssel', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(chatResult));
    await createAiProviderService(fetchMock).scanPdf(
      { ...compatible, documentMode: 'images' },
      'gateway-test',
      textPdf('Reinigung 42 Euro'),
      context,
    );
    const request = fetchMock.mock.calls[0][1];
    const body = JSON.parse(String(request?.body));
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer gateway-test' });
    expect(body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,')).toBe(
      true,
    );
  });

  test('berücksichtigt bei gemischten PDFs auch Seiten ohne Text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(chatResult));
    const pdf = textPdf([
      'Eine lange Textseite mit der Hausreinigung fuer das Abrechnungsjahr 2024 und weiteren Angaben zum ausgewaehlten Objekt.',
      '',
    ]);
    await createAiProviderService(fetchMock).scanPdf(
      { ...compatible, documentMode: 'auto' },
      null,
      pdf,
      context,
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content.length).toBe(2);
    expect(body.messages[0].content[0].text).toContain('Seitenbilder in dieser Reihenfolge: 2');
  });

  test('verhindert einen scheinbar vollständigen Entwurf bei zu vielen Bildseiten', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      createAiProviderService(fetchMock).scanPdf(
        { ...compatible, documentMode: 'images' },
        null,
        textPdf(Array(13).fill('')),
        context,
      ),
    ).rejects.toThrow(/mehr als 12/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('erklärt fehlende OCR im Textmodus, ohne ein Textmodell mit Bildern aufzurufen', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      createAiProviderService(fetchMock).scanPdf(compatible, null, textPdf(''), context),
    ).rejects.toThrow(/OCR/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('testet kompatible Modelle über Chat statt über optionale Modell-Detailrouten', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ choices: [{ message: { content: 'OK' } }] }));
    await expect(
      createAiProviderService(fetchMock).testConnection(compatible, 'key-test'),
    ).resolves.toContain('antworten');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer key-test' });
  });

  test.each(['json_object', 'prompt'] as const)(
    'Ollama unterstützt %s und authentifizierte lokale Instanzen',
    async (outputMode) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ message: { content: JSON.stringify(result) } }));
      await createAiProviderService(fetchMock).scanPdf(
        { ...compatible, provider: 'ollama', outputMode },
        'local-test',
        textPdf('Reinigung 42 Euro'),
        context,
      );
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: 'Bearer local-test',
      });
      if (outputMode === 'prompt') expect(body).not.toHaveProperty('format');
      else expect(body.format).toBe('json');
    },
  );
});

describe('Fehlerhafte Providerantworten', () => {
  test.each([
    ['ungültiges JSON', { choices: [{ message: { content: 'not json' } }] }, /gültigen JSON/],
    ['falsche Struktur', { choices: [{ message: { content: '{"costs":[]}' } }] }, /Datenformat/],
    [
      'abgeschnitten',
      { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }] },
      /abgeschnitten/,
    ],
    ['kein Text', { choices: [] }, /auswertbaren Inhalt/],
    ['null', null, /auswertbaren Inhalt/],
  ])('lehnt %s ab', async (_label, payload, message) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(payload));
    await expect(
      createAiProviderService(fetchMock).scanPdf(compatible, null, textPdf('42 Euro'), context),
    ).rejects.toThrow(message as RegExp);
  });

  test('liest mit Markdown eingerahmtes JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\`` } }],
      }),
    );
    await expect(
      createAiProviderService(fetchMock).scanPdf(compatible, null, textPdf('42 Euro'), context),
    ).resolves.toEqual(result);
  });

  test.each([400, 401, 429, 500])(
    'gibt HTTP %i ohne Providertext oder Schlüssel weiter',
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('private-key-and-document', { status }));
      await expect(
        createAiProviderService(fetchMock).testConnection(compatible, 'private-key'),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
    },
  );

  test.each([new Error('sensitive-url'), new DOMException('timeout', 'TimeoutError')])(
    'behandelt Netzwerkfehler',
    async (error) => {
      const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
      await expect(
        createAiProviderService(fetchMock).testConnection(compatible, null),
      ).rejects.toThrow(/fehlgeschlagen/);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    },
  );

  test('behandelt ungültiges HTTP-JSON und leere Testantworten', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('invalid-json'))
      .mockResolvedValueOnce(json({}));
    const service = createAiProviderService(fetchMock);
    await expect(service.testConnection(compatible, null)).rejects.toThrow(/gültige JSON-Antwort/);
    await expect(service.testConnection(compatible, null)).rejects.toThrow(/keinen Text/);
  });

  test.each([null, {}, { pages: [] }, { pages: [{}] }, { pages: [{ markdown: '' }] }])(
    'verweigert leere Mistral-OCR statt Seitenmarker als Inhalt zu nutzen',
    async (payload) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(payload));
      await expect(
        createAiProviderService(fetchMock).scanPdf(
          { ...compatible, provider: 'mistral' },
          'key',
          Buffer.from('%PDF-test'),
          context,
        ),
      ).rejects.toThrow(/Inhalt erkennen/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  test('verhindert stilles Abschneiden langer OCR-Ausgaben', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ pages: [{ markdown: 'a'.repeat(120001) }] }));
    await expect(
      createAiProviderService(fetchMock).scanPdf(
        { ...compatible, provider: 'mistral' },
        'key',
        Buffer.from('%PDF-test'),
        context,
      ),
    ).rejects.toThrow(/zu viel Text/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('liest OpenAI-REST-Ausgaben und lehnt unvollständige Antworten ab', async () => {
    const settings = { ...compatible, provider: 'openai' as const };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          output: [
            null,
            { type: 'reasoning' },
            { content: [null, { type: 'output_text', text: JSON.stringify(result) }] },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ status: 'incomplete', output_text: JSON.stringify(result) }))
      .mockResolvedValueOnce(json({ output: [] }));
    const service = createAiProviderService(fetchMock);
    await expect(
      service.scanPdf(settings, 'key', Buffer.from('%PDF-test'), context),
    ).resolves.toEqual(result);
    await expect(
      service.scanPdf(settings, 'key', Buffer.from('%PDF-test'), context),
    ).rejects.toThrow(/vollständig/);
    await expect(
      service.scanPdf(settings, 'key', Buffer.from('%PDF-test'), context),
    ).rejects.toThrow(/auswertbaren Inhalt/);
  });

  test('prüft Cloud-Schlüssel, Dateityp und Größe vor dem Netzwerkaufruf', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const service = createAiProviderService(fetchMock);
    await expect(
      service.scanPdf(
        { ...compatible, provider: 'openai' },
        null,
        Buffer.from('%PDF-test'),
        context,
      ),
    ).rejects.toThrow(/API-Schlüssel/);
    await expect(
      service.scanPdf(compatible, null, Buffer.alloc(20 * 1024 * 1024 + 1), context),
    ).rejects.toThrow(/20 MB/);
    await expect(
      service.scanPdf(compatible, null, Buffer.from('invalid'), context),
    ).rejects.toThrow(/gültiges PDF/);
    await expect(
      service.scanPdf(compatible, null, Buffer.from('%PDF-invalid'), context),
    ).rejects.toThrow(/lokal nicht gelesen/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('prüft Cloud-Modellnamen und fehlende lokale Modelle', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ models: [] }));
    const service = createAiProviderService(fetchMock);
    await expect(
      service.testConnection({ ...compatible, provider: 'openai' }, 'key'),
    ).resolves.toContain('erreichbar');
    expect(fetchMock.mock.calls[0][0]).toContain('/models/some-org%2Ftext-model');
    await expect(
      service.testConnection({ ...compatible, provider: 'ollama' }, null),
    ).rejects.toThrow(/fehlt/);
  });
});
