import { PDFParse } from 'pdf-parse';
import { aiScanResultSchema, type AiProvider, type AiScanResult } from '../../shared/ai';
import { ApiError } from '../errors';

export type AiRuntimeSettings = {
  provider: AiProvider;
  model: string;
  baseUrl: string;
};

export type AiProviderService = {
  testConnection(settings: AiRuntimeSettings, apiKey: string | null): Promise<string>;
  scanPdf(
    settings: AiRuntimeSettings,
    apiKey: string | null,
    pdf: Buffer,
    context: { fileName: string; propertyName: string; year: number },
  ): Promise<AiScanResult>;
};

type Fetch = typeof fetch;

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_LOCAL_TEXT = 120_000;
const MAX_LOCAL_IMAGES = 12;
const PROVIDER_TIMEOUT_MS = 120_000;

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;

export const AI_SCAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documentType', 'detectedYear', 'costs', 'readings', 'warnings'],
  properties: {
    documentType: {
      type: 'string',
      enum: ['owner_statement', 'invoice', 'meter_statement', 'unknown'],
    },
    detectedYear: {
      anyOf: [{ type: 'integer', minimum: 1900, maximum: 2200 }, { type: 'null' }],
    },
    costs: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'description',
          'amount',
          'statementGroup',
          'allocationKey',
          'meterType',
          'labor35a',
          'confidence',
          'source',
        ],
        properties: {
          description: { type: 'string' },
          amount: { type: 'number', minimum: 0 },
          statementGroup: { type: 'string', enum: ['Wohnung', 'Garage', 'Grundsteuer'] },
          allocationKey: {
            type: 'string',
            enum: ['area', 'persons', 'units', 'meter'],
          },
          meterType: {
            anyOf: [
              { type: 'string', enum: ['heating', 'hotWater', 'coldWater', 'other'] },
              { type: 'null' },
            ],
          },
          labor35a: { type: 'number', minimum: 0 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source: { type: 'string' },
        },
      },
    },
    readings: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['meterNumber', 'meterName', 'date', 'value', 'unit', 'confidence', 'source'],
        properties: {
          meterNumber: nullableString,
          meterName: nullableString,
          date: {
            anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, { type: 'null' }],
          },
          value: {
            anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
          },
          unit: nullableString,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source: { type: 'string' },
        },
      },
    },
    warnings: { type: 'array', maxItems: 100, items: { type: 'string' } },
  },
} as const;

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function requireCloudKey(provider: AiProvider, apiKey: string | null): string {
  if (provider === 'ollama') return '';
  if (!apiKey) {
    throw new ApiError(
      400,
      `Für ${provider === 'openai' ? 'OpenAI' : 'Mistral'} ist noch kein API-Schlüssel hinterlegt.`,
    );
  }
  return apiKey;
}

async function fetchProvider(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  action: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.name === 'TimeoutError' ? 'Zeitüberschreitung' : '';
    throw new ApiError(502, `${action} ist fehlgeschlagen${detail ? ` (${detail})` : ''}.`);
  }
  if (!response.ok) {
    throw new ApiError(502, `${action} ist mit HTTP ${response.status} fehlgeschlagen.`);
  }
  return response;
}

async function jsonResponse(response: Response, action: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError(502, `${action} hat keine gültige JSON-Antwort geliefert.`);
  }
}

function parseModelJson(value: string): AiScanResult {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new ApiError(502, 'Das KI-Modell hat keinen gültigen JSON-Entwurf geliefert.');
  }
  const result = aiScanResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(502, 'Der KI-Entwurf entspricht nicht dem erwarteten Datenformat.');
  }
  return result.data;
}

function extractionPrompt(context: {
  fileName: string;
  propertyName: string;
  year: number;
}): string {
  return `Du analysierst genau ein PDF für die lokale Mietverwaltung Vermietluchs.

Kontext: Objekt "${context.propertyName}", ausgewähltes Abrechnungsjahr ${context.year}, Datei "${context.fileName}".

Extrahiere ausschließlich:
1. tatsächlich berechnete Kostenpositionen in Euro und
2. eindeutig dokumentierte Zählerstände.

Wichtige Regeln:
- Erzeuge niemals Mieter, Mietverhältnisse, Zahlungen oder Abrechnungen.
- Erfinde keine Werte. Unsichere oder fehlende Angaben gehören in warnings.
- Vermeide Doppelzählungen: Wenn Einzelpositionen einen ausgewiesenen Gesamtbetrag bilden, nimm die Einzelpositionen und nicht zusätzlich die Summe.
- Gutschriften oder negative Positionen nicht als positive Kosten erfinden; erwähne sie in warnings.
- Für Eigentümerabrechnungen nutze nur Kosten des gewählten Objekts und des relevanten Abrechnungszeitraums.
- statementGroup ist Wohnung, Garage oder Grundsteuer.
- allocationKey ist area, persons, units oder meter. Niemals direct.
- meterType ist nur bei allocationKey meter erforderlich, sonst null.
- labor35a ist nur ein ausdrücklich ausgewiesener §35a-Anteil, sonst 0.
- source nennt kurz Seite, Abschnitt oder Tabellenzeile.
- confidence liegt zwischen 0 und 1.
- Zählerdatum und Zählerwert bleiben null, wenn sie nicht eindeutig sind.

Antworte ausschließlich im vorgegebenen JSON-Schema.`;
}

function openAiOutputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const object = payload as Record<string, unknown>;
  if (typeof object.output_text === 'string') return object.output_text;
  if (!Array.isArray(object.output)) return '';
  for (const item of object.output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') return text;
    }
  }
  return '';
}

function chatContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]
    ?.message;
  return typeof message?.content === 'string' ? message.content : '';
}

async function openAiScan(
  fetchImpl: Fetch,
  settings: AiRuntimeSettings,
  apiKey: string,
  pdf: Buffer,
  context: { fileName: string; propertyName: string; year: number },
): Promise<AiScanResult> {
  const response = await fetchProvider(
    fetchImpl,
    `${trimBaseUrl(settings.baseUrl)}/responses`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        store: false,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                filename: context.fileName,
                file_data: `data:application/pdf;base64,${pdf.toString('base64')}`,
              },
              { type: 'input_text', text: extractionPrompt(context) },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'vermietluchs_ai_scan',
            strict: true,
            schema: AI_SCAN_JSON_SCHEMA,
          },
        },
      }),
    },
    'Der OpenAI-PDF-Scan',
  );
  const output = openAiOutputText(await jsonResponse(response, 'Der OpenAI-PDF-Scan'));
  if (!output) throw new ApiError(502, 'OpenAI hat keinen auswertbaren Inhalt geliefert.');
  return parseModelJson(output);
}

async function mistralScan(
  fetchImpl: Fetch,
  settings: AiRuntimeSettings,
  apiKey: string,
  pdf: Buffer,
  context: { fileName: string; propertyName: string; year: number },
): Promise<AiScanResult> {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const ocrResponse = await fetchProvider(
    fetchImpl,
    `${trimBaseUrl(settings.baseUrl)}/ocr`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:application/pdf;base64,${pdf.toString('base64')}`,
        },
      }),
    },
    'Die Mistral-OCR',
  );
  const ocr = (await jsonResponse(ocrResponse, 'Die Mistral-OCR')) as {
    pages?: Array<{ markdown?: unknown }>;
  };
  const markdown = (ocr.pages ?? [])
    .map((page, index) => `\n--- Seite ${index + 1} ---\n${String(page.markdown ?? '')}`)
    .join('')
    .slice(0, MAX_LOCAL_TEXT);
  if (!markdown.trim()) throw new ApiError(502, 'Mistral konnte keinen PDF-Inhalt erkennen.');

  const chatResponse = await fetchProvider(
    fetchImpl,
    `${trimBaseUrl(settings.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        messages: [
          { role: 'user', content: `${extractionPrompt(context)}\n\nPDF-Inhalt:${markdown}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'vermietluchs_ai_scan',
            strict: true,
            schema: AI_SCAN_JSON_SCHEMA,
          },
        },
      }),
    },
    'Die Mistral-Auswertung',
  );
  const content = chatContent(await jsonResponse(chatResponse, 'Die Mistral-Auswertung'));
  if (!content) throw new ApiError(502, 'Mistral hat keinen auswertbaren Inhalt geliefert.');
  return parseModelJson(content);
}

async function localPdfContent(pdf: Buffer): Promise<{ text: string; images: string[] }> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const textResult = await parser.getText();
    const text = textResult.text.trim().slice(0, MAX_LOCAL_TEXT);
    if (text.length >= 100) return { text, images: [] };
    const screenshots = await parser.getScreenshot({
      first: MAX_LOCAL_IMAGES,
      desiredWidth: 1600,
      imageBuffer: false,
      imageDataUrl: true,
    });
    return {
      text,
      images: screenshots.pages
        .map((page) => page.dataUrl?.replace(/^data:image\/\w+;base64,/, '') ?? '')
        .filter(Boolean),
    };
  } catch {
    throw new ApiError(400, 'Das PDF konnte lokal nicht gelesen werden.');
  } finally {
    await parser.destroy();
  }
}

async function ollamaScan(
  fetchImpl: Fetch,
  settings: AiRuntimeSettings,
  pdf: Buffer,
  context: { fileName: string; propertyName: string; year: number },
): Promise<AiScanResult> {
  const content = await localPdfContent(pdf);
  if (!content.text && content.images.length === 0) {
    throw new ApiError(400, 'Das PDF enthält keinen lokal auswertbaren Inhalt.');
  }
  const response = await fetchProvider(
    fetchImpl,
    `${trimBaseUrl(settings.baseUrl)}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        format: AI_SCAN_JSON_SCHEMA,
        options: { temperature: 0 },
        messages: [
          {
            role: 'user',
            content: `${extractionPrompt(context)}${content.text ? `\n\nPDF-Text:\n${content.text}` : ''}`,
            ...(content.images.length > 0 ? { images: content.images } : {}),
          },
        ],
      }),
    },
    'Der Ollama-PDF-Scan',
  );
  const payload = (await jsonResponse(response, 'Der Ollama-PDF-Scan')) as {
    message?: { content?: unknown };
  };
  const output = payload.message?.content;
  if (typeof output !== 'string' || !output) {
    throw new ApiError(502, 'Ollama hat keinen auswertbaren Inhalt geliefert.');
  }
  const result = parseModelJson(output);
  if (content.images.length === MAX_LOCAL_IMAGES) {
    result.warnings.push(
      `Für die lokale Bildanalyse wurden höchstens ${MAX_LOCAL_IMAGES} PDF-Seiten berücksichtigt.`,
    );
  }
  return result;
}

export function createAiProviderService(fetchImpl: Fetch = fetch): AiProviderService {
  return {
    async testConnection(settings, apiKey) {
      const baseUrl = trimBaseUrl(settings.baseUrl);
      if (settings.provider === 'ollama') {
        const response = await fetchProvider(
          fetchImpl,
          `${baseUrl}/api/tags`,
          { method: 'GET' },
          'Der Ollama-Verbindungstest',
        );
        const payload = (await jsonResponse(response, 'Der Ollama-Verbindungstest')) as {
          models?: Array<{ name?: unknown; model?: unknown }>;
        };
        const models = (payload.models ?? []).flatMap((item) =>
          [item.name, item.model].filter((value): value is string => typeof value === 'string'),
        );
        const configured = settings.model.replace(/:latest$/, '');
        if (
          !models.some(
            (model) => model === settings.model || model.replace(/:latest$/, '') === configured,
          )
        ) {
          throw new ApiError(
            400,
            `Ollama ist erreichbar, aber das Modell „${settings.model}“ fehlt.`,
          );
        }
        return `Ollama und das Modell „${settings.model}“ sind erreichbar.`;
      }

      const key = requireCloudKey(settings.provider, apiKey);
      const label = settings.provider === 'openai' ? 'OpenAI' : 'Mistral';
      await fetchProvider(
        fetchImpl,
        `${baseUrl}/models/${encodeURIComponent(settings.model)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
        `Der ${label}-Verbindungstest`,
      );
      return `${label} und das Modell „${settings.model}“ sind erreichbar.`;
    },

    async scanPdf(settings, apiKey, pdf, context) {
      if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) {
        throw new ApiError(413, 'Das PDF muss zwischen 1 Byte und 20 MB groß sein.');
      }
      if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new ApiError(400, 'Die Datei ist kein gültiges PDF.');
      }
      const key = requireCloudKey(settings.provider, apiKey);
      if (settings.provider === 'openai') {
        return openAiScan(fetchImpl, settings, key, pdf, context);
      }
      if (settings.provider === 'mistral') {
        return mistralScan(fetchImpl, settings, key, pdf, context);
      }
      return ollamaScan(fetchImpl, settings, pdf, context);
    },
  };
}
