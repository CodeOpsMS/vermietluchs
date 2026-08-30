import { isIP } from 'node:net';
import type { Router } from 'express';
import {
  AI_PROVIDER_DEFAULTS,
  aiConnectionTestSchema,
  aiImportRequestSchema,
  aiScanRequestSchema,
  aiSettingsUpdateSchema,
  type AiProvider,
  type AiSettings,
} from '../../shared/ai';
import type { SqliteDatabase } from '../database';
import { ApiError, asyncHandler } from '../errors';
import { eurosToCents } from '../money';
import type { AiProviderService, AiRuntimeSettings } from './providers';
import type { AiSecretStore } from './secrets';

type AiSettingsRow = {
  enabled: number;
  provider: AiProvider;
  model: string;
  base_url: string;
  revision: number;
  updated_at: string;
};

function settingsRow(db: SqliteDatabase): AiSettingsRow {
  const row = db.prepare('SELECT * FROM ai_settings WHERE id = 1').get() as
    AiSettingsRow | undefined;
  if (!row) throw new ApiError(500, 'Die KI-Einstellungen fehlen.');
  return row;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function safeProviderBaseUrl(provider: AiProvider, configured: string): string {
  if (provider !== 'ollama') return AI_PROVIDER_DEFAULTS[provider].baseUrl;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ApiError(400, 'Die Ollama-Adresse ist ungültig.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipVersion = isIP(hostname);
  const safeHostname =
    hostname === 'localhost' ||
    hostname === 'host.docker.internal' ||
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 &&
      (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')));
  if (
    !safeHostname ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new ApiError(
      400,
      'Ollama muss über localhost, host.docker.internal oder eine private LAN-IP erreichbar sein.',
    );
  }
  return url.origin;
}

function runtimeSettings(row: AiSettingsRow): AiRuntimeSettings {
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: safeProviderBaseUrl(row.provider, row.base_url),
  };
}

function publicSettings(row: AiSettingsRow, secretStore: AiSecretStore): AiSettings {
  return {
    enabled: row.enabled === 1,
    provider: row.provider,
    model: row.model,
    baseUrl: safeProviderBaseUrl(row.provider, row.base_url),
    apiKeyConfigured: secretStore.has(row.provider),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function propertyName(db: SqliteDatabase, propertyId: number): string {
  const property = db.prepare('SELECT name FROM properties WHERE id = ?').get(propertyId) as
    { name: string } | undefined;
  if (!property) throw new ApiError(400, 'Das ausgewählte Objekt existiert nicht.');
  return property.name;
}

export type AiRouteOptions = {
  secretStore: AiSecretStore;
  service: AiProviderService;
};

export function registerAiRoutes(
  router: Router,
  db: SqliteDatabase,
  options: AiRouteOptions,
): void {
  router.get('/ai/settings', (_request, response) => {
    response.json(publicSettings(settingsRow(db), options.secretStore));
  });

  router.put('/ai/settings', (request, response) => {
    const input = aiSettingsUpdateSchema.parse(request.body);
    const current = settingsRow(db);
    if (current.revision !== input.revision) {
      throw new ApiError(409, 'Die KI-Einstellungen wurden zwischenzeitlich geändert.', {
        currentRevision: current.revision,
      });
    }
    const hasKey =
      Boolean(input.apiKey) || (!input.clearApiKey && options.secretStore.has(input.provider));
    if (input.enabled && input.provider !== 'ollama' && !hasKey) {
      throw new ApiError(400, 'Zum Aktivieren des Cloud-Anbieters fehlt der API-Schlüssel.');
    }
    const baseUrl = safeProviderBaseUrl(input.provider, input.baseUrl);
    const changed = db
      .prepare(
        `UPDATE ai_settings
         SET enabled = ?, provider = ?, model = ?, base_url = ?,
             revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1 AND revision = ?`,
      )
      .run(input.enabled ? 1 : 0, input.provider, input.model, baseUrl, input.revision);
    if (changed.changes !== 1) {
      throw new ApiError(409, 'Die KI-Einstellungen wurden zwischenzeitlich geändert.');
    }
    if (input.clearApiKey) options.secretStore.clear(input.provider);
    if (input.apiKey) options.secretStore.write(input.provider, input.apiKey);
    response.json(publicSettings(settingsRow(db), options.secretStore));
  });

  router.post(
    '/ai/test',
    asyncHandler(async (request, response) => {
      const input = aiConnectionTestSchema.parse(request.body);
      const settings = {
        provider: input.provider,
        model: input.model,
        baseUrl: safeProviderBaseUrl(input.provider, input.baseUrl),
      };
      const message = await options.service.testConnection(
        settings,
        options.secretStore.read(input.provider),
      );
      response.json({ ok: true, message });
    }),
  );

  router.post(
    '/ai/scan',
    asyncHandler(async (request, response) => {
      const input = aiScanRequestSchema.parse(request.body);
      const current = settingsRow(db);
      if (current.enabled !== 1) {
        throw new ApiError(403, 'Der KI-Scan ist in den Einstellungen nicht aktiviert.');
      }
      const result = await options.service.scanPdf(
        runtimeSettings(current),
        options.secretStore.read(current.provider),
        Buffer.from(input.dataBase64, 'base64'),
        {
          fileName: input.fileName,
          propertyName: propertyName(db, input.propertyId),
          year: input.year,
        },
      );
      response.json({
        ...result,
        provider: current.provider,
        model: current.model,
        fileName: input.fileName,
      });
    }),
  );

  router.post('/ai/import', (request, response) => {
    const input = aiImportRequestSchema.parse(request.body);
    const current = settingsRow(db);
    if (current.enabled !== 1) {
      throw new ApiError(403, 'Der KI-Scan ist in den Einstellungen nicht aktiviert.');
    }
    propertyName(db, input.propertyId);
    const imported = importProposal(db, input, current);
    response.status(201).json({
      ...imported,
      costsCreated: imported.costIds.length,
      readingsCreated: imported.readingIds.length,
    });
  });
}

function importProposal(
  db: SqliteDatabase,
  input: ReturnType<typeof aiImportRequestSchema.parse>,
  settings: AiSettingsRow,
): { costIds: number[]; readingIds: number[] } {
  const insertCost = db.prepare(
    `INSERT INTO costs (
      property_id, year, description_internal, description_tenant,
      source_amount_cents, tenant_status, allocable_amount_cents,
      statement_group, allocation_mode, allocation_key, direct_unit_id,
      direct_tenancy_id, meter_type, labor_35a_cents, notes
    ) VALUES (?, ?, ?, '', ?, 'pending', ?, ?, 'standard', ?, NULL, NULL, ?, ?, ?)`,
  );
  const existingCost = db.prepare(
    `SELECT id FROM costs
     WHERE property_id = ? AND year = ? AND lower(trim(description_internal)) = lower(trim(?))
       AND source_amount_cents = ?`,
  );
  const findMeter = db.prepare(
    `SELECT meter.id
     FROM meters meter
     JOIN units unit ON unit.id = meter.unit_id
     WHERE meter.id = ? AND unit.property_id = ?`,
  );
  const existingReading = db.prepare('SELECT id FROM readings WHERE meter_id = ? AND date = ?');
  const insertReading = db.prepare(
    `INSERT INTO readings (meter_id, date, value, note) VALUES (?, ?, ?, ?)`,
  );
  const scanNote = (source: string) =>
    `KI-Scan (${settings.provider}/${settings.model}) · ${input.fileName}${source ? ` · ${source}` : ''}; fachlich prüfen.`.slice(
      0,
      500,
    );

  return db.transaction(() => {
    const costIds: number[] = [];
    const readingIds: number[] = [];
    for (const cost of input.costs) {
      const amountCents = eurosToCents(cost.amount);
      if (existingCost.get(input.propertyId, input.year, cost.description, amountCents)) {
        throw new ApiError(
          409,
          `Der Kostenposten „${cost.description}“ mit diesem Betrag ist bereits vorhanden.`,
        );
      }
      const allocationKey = cost.allocationKey;
      const meterType = allocationKey === 'meter' ? cost.meterType : null;
      const result = insertCost.run(
        input.propertyId,
        input.year,
        cost.description,
        amountCents,
        amountCents,
        cost.statementGroup,
        allocationKey,
        meterType,
        eurosToCents(cost.labor35a),
        scanNote(cost.source),
      );
      costIds.push(Number(result.lastInsertRowid));
    }

    for (const reading of input.readings) {
      if (!findMeter.get(reading.meterId, input.propertyId)) {
        throw new ApiError(400, 'Ein gewählter Zähler gehört nicht zum ausgewählten Objekt.');
      }
      if (existingReading.get(reading.meterId, reading.date)) {
        throw new ApiError(409, `Für den Zähler ist am ${reading.date} bereits ein Stand erfasst.`);
      }
      const result = insertReading.run(
        reading.meterId,
        reading.date,
        reading.value,
        scanNote(reading.source),
      );
      readingIds.push(Number(result.lastInsertRowid));
    }
    return { costIds, readingIds };
  })();
}
