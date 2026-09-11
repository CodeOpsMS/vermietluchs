import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response as ExpressResponse, Router } from 'express';
import { z } from 'zod';
import {
  papraLinkInputSchema,
  papraMappingSchema,
  papraSelectionSchema,
  papraSettingsSchema,
  type DocumentLink,
  type PapraDocument,
} from '../../shared/papra';
import type { SqliteDatabase } from '../database';
import { ApiError, asyncHandler } from '../errors';
import type { PapraClient } from './client';
import type { PapraSecretStore } from './secrets';
import type { PapraService } from './service';

const id = z.coerce.number().int().positive().safe();
export function responseSignal(response: ExpressResponse) {
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  return controller.signal;
}

async function sendFile(
  response: ExpressResponse,
  upstream: Response,
  document: PapraDocument,
  download: boolean,
) {
  if (!upstream.body) throw new ApiError(502, 'Papra hat keine Datei geliefert.');
  const reader = upstream.body.getReader();
  // Erst prüfen, dann Header senden; auch Ein-Byte-Chunks korrekt behandeln.
  const head: Uint8Array[] = [];
  let headSize = 0;
  try {
    while (headSize < 5) {
      const chunk = await reader.read();
      if (chunk.done) break;
      head.push(chunk.value);
      headSize += chunk.value.length;
    }
    const prefix = Buffer.concat(head);
    if (
      document.mimeType === 'application/pdf' &&
      prefix.subarray(0, 5).toString('ascii') !== '%PDF-'
    )
      throw new ApiError(400, 'Das Papra-Dokument enthält kein gültiges PDF.');
    const inline = document.mimeType === 'application/pdf' && !download;
    response.setHeader('Content-Type', inline ? 'application/pdf' : 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(document.originalName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
    );
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    await pipeline(
      Readable.from(
        (async function* () {
          yield prefix;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            yield chunk.value;
          }
        })(),
      ),
      response,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function registerPapraRoutes(
  router: Router,
  db: SqliteDatabase,
  service: PapraService,
  client: PapraClient,
  secrets: PapraSecretStore,
) {
  function publicSettings() {
    const current = service.settings();
    const apiKeyConfigured = Boolean(secrets.read(current.base_url));
    return {
      baseUrl: current.base_url,
      publicUrl: current.public_url,
      revision: current.revision,
      connected: Boolean(current.enabled && apiKeyConfigured),
      apiKeyConfigured,
    };
  }
  router.get('/papra/settings', (_request, response) => response.json(publicSettings()));
  router.put('/papra/settings', (request, response) => {
    const input = papraSettingsSchema.parse(request.body);
    const current = service.settings();
    if (input.revision !== current.revision)
      throw new ApiError(409, 'Die Papra-Einstellungen wurden zwischenzeitlich geändert.', {
        currentRevision: current.revision,
      });
    db.transaction(() => {
      db.prepare(
        'UPDATE papra_settings SET base_url = ?, public_url = ?, enabled = 0, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      ).run(input.baseUrl, input.publicUrl);
      if (input.apiKey && input.baseUrl) secrets.write(input.baseUrl, input.apiKey);
      else if (input.clearApiKey || current.base_url !== input.baseUrl) secrets.clear();
    })();
    response.json(publicSettings());
  });
  router.post(
    '/papra/test',
    asyncHandler(async (request, response) => {
      const input = z
        .object({ revision: z.number().int().nonnegative() })
        .strict()
        .parse(request.body);
      const current = service.connection(false);
      if (input.revision !== current.revision)
        throw new ApiError(409, 'Bitte die aktuellen Papra-Einstellungen laden.');
      await client.test(current, responseSignal(response));
      if (service.settings().revision !== current.revision)
        throw new ApiError(409, 'Die Papra-Einstellungen wurden während der Prüfung geändert.');
      db.prepare('UPDATE papra_settings SET enabled = 1 WHERE id = 1').run();
      response.json({
        ...publicSettings(),
        message: 'Papra ist erreichbar; Organisations- und Dokumentleserechte sind vorhanden.',
      });
    }),
  );
  router.get(
    '/papra/organizations',
    asyncHandler(async (_request, response) => {
      const current = service.connection();
      const organizations = await client.organizations(current, responseSignal(response));
      if (service.connection().revision !== current.revision)
        throw new ApiError(409, 'Die Papra-Verbindung wurde geändert.');
      response.json({ organizations });
    }),
  );
  router.get('/properties/:id/papra', (request, response) => {
    const assigned = service.mapping(id.parse(request.params.id));
    response.json({
      organizationId: assigned?.organization_id || null,
      baseUrl: assigned?.base_url ?? '',
      revision: assigned?.revision ?? 0,
    });
  });
  router.put(
    '/properties/:id/papra',
    asyncHandler(async (request, response) => {
      const propertyId = id.parse(request.params.id);
      const input = papraMappingSchema.parse(request.body);
      const current = service.connection();
      if (input.organizationId) {
        const organizations = await client.organizations(current, responseSignal(response));
        if (!organizations.some((org) => org.id === input.organizationId))
          throw new ApiError(
            400,
            'Die Organisation ist für diesen Papra-Schlüssel nicht zugänglich.',
          );
      }
      if (service.connection().revision !== current.revision)
        throw new ApiError(409, 'Die Papra-Verbindung wurde geändert.');
      const assigned = service.mapping(propertyId);
      if ((assigned?.revision ?? 0) !== input.revision)
        throw new ApiError(409, 'Die Organisationszuordnung wurde zwischenzeitlich geändert.');
      db.prepare(
        `INSERT INTO papra_property_mappings (property_id, base_url, organization_id, revision) VALUES (?, ?, ?, 1)
      ON CONFLICT(property_id) DO UPDATE SET base_url = excluded.base_url, organization_id = excluded.organization_id, revision = papra_property_mappings.revision + 1`,
      ).run(propertyId, current.baseUrl, input.organizationId ?? '');
      response.json({
        organizationId: input.organizationId,
        baseUrl: current.baseUrl,
        revision: input.revision + 1,
      });
    }),
  );
  router.get(
    '/properties/:id/papra/documents',
    asyncHandler(async (request, response) => {
      const propertyId = id.parse(request.params.id);
      const query = z
        .object({
          search: z.string().max(1024).default(''),
          page: z.coerce.number().int().min(0).max(100000).default(0),
        })
        .strict()
        .parse(request.query);
      const current = service.context(propertyId);
      const result = await client.documents(
        current.connection,
        current.organizationId,
        query.search,
        query.page,
        responseSignal(response),
      );
      service.assertSelection(propertyId, { ...current, documentId: '_' });
      response.json({
        ...result,
        organizationId: current.organizationId,
        settingsRevision: current.settingsRevision,
        mappingRevision: current.mappingRevision,
      });
    }),
  );
  router.get(
    '/properties/:id/papra/file',
    asyncHandler(async (request, response) => {
      const propertyId = id.parse(request.params.id);
      const query = papraSelectionSchema
        .extend({
          settingsRevision: z.coerce.number().int().nonnegative(),
          mappingRevision: z.coerce.number().int().nonnegative(),
          download: z.enum(['0', '1']).default('0'),
          check: z.literal('1').optional(),
        })
        .parse(request.query);
      const signal = responseSignal(response);
      const verified = await service.verify(propertyId, query, signal);
      if (request.query.check === '1') {
        response.json({ ok: true });
        return;
      }
      const upstream = await client.file(
        service.assertSelection(propertyId, query).connection,
        query.organizationId,
        query.documentId,
        signal,
      );
      service.assertSelection(propertyId, query);
      await sendFile(response, upstream, verified.document, query.download === '1');
    }),
  );
  router.get('/document-links', (request, response) => {
    const propertyId = id.parse(request.query.propertyId);
    const costId = request.query.costId === undefined ? null : id.parse(request.query.costId);
    service.target(propertyId, costId);
    const settings = publicSettings();
    const rows = db
      .prepare('SELECT * FROM document_links WHERE property_id = ? AND cost_id IS ? ORDER BY id')
      .all(propertyId, costId) as LinkRow[];
    response.json(
      rows.map((row): DocumentLink => ({
        id: row.id,
        propertyId: row.property_id,
        costId: row.cost_id,
        name: row.name,
        mimeType: row.mime_type,
        originalSize: row.original_size,
        available: settings.connected && row.base_url === settings.baseUrl,
        papraUrl: `${row.base_url === settings.baseUrl ? settings.publicUrl || settings.baseUrl : row.public_url}/organizations/${encodeURIComponent(row.organization_id)}/documents/${encodeURIComponent(row.document_id)}`,
      })),
    );
  });
  router.post(
    '/document-links',
    asyncHandler(async (request, response) => {
      const input = papraLinkInputSchema.parse(request.body);
      service.target(input.propertyId, input.costId);
      const verified = await service.verify(
        input.propertyId,
        input.selection,
        responseSignal(response),
      );
      service.link(input.propertyId, input.costId, verified);
      response.status(201).json({ ok: true });
    }),
  );
  function getLink(linkId: number, propertyId: number) {
    const row = db
      .prepare('SELECT * FROM document_links WHERE id = ? AND property_id = ?')
      .get(linkId, propertyId) as LinkRow | undefined;
    if (!row) throw new ApiError(404, 'Die Dokumentverknüpfung existiert nicht für dieses Haus.');
    return row;
  }
  router.delete('/document-links/:id', (request, response) => {
    const row = getLink(id.parse(request.params.id), id.parse(request.query.propertyId));
    db.prepare('DELETE FROM document_links WHERE id = ?').run(row.id);
    response.status(204).end();
  });
  router.get(
    '/document-links/:id/file',
    asyncHandler(async (request, response) => {
      const row = getLink(id.parse(request.params.id), id.parse(request.query.propertyId));
      const current = service.connection();
      if (row.base_url !== current.baseUrl)
        throw new ApiError(
          409,
          'Dieser Beleg gehört zu einer anderen Papra-Instanz. Seine Quelle bleibt unverändert.',
        );
      const signal = responseSignal(response);
      const document = await client.document(current, row.organization_id, row.document_id, signal);
      if (service.connection().revision !== current.revision)
        throw new ApiError(409, 'Die Papra-Verbindung wurde geändert.');
      if (request.query.check === '1') {
        response.json({ ok: true });
        return;
      }
      const upstream = await client.file(current, row.organization_id, row.document_id, signal);
      if (service.connection().revision !== current.revision)
        throw new ApiError(409, 'Die Papra-Verbindung wurde geändert.');
      await sendFile(response, upstream, document, request.query.download === '1');
    }),
  );
}
type LinkRow = {
  id: number;
  property_id: number;
  cost_id: number | null;
  base_url: string;
  public_url: string;
  organization_id: string;
  document_id: string;
  name: string;
  mime_type: string;
  original_size: number;
};
