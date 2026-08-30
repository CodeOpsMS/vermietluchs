import { describe, expect, test, vi } from 'vitest';
import { createAiProviderService } from '../src/server/ai/providers';

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

function textPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

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
