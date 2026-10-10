import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { openDatabase } from '../src/server/database';
import { createLogger } from '../src/server/logging';
import { createPapraClient, readBounded, MAX_PAPRA_PDF_BYTES } from '../src/server/papra/client';
import type { AiScanResponse } from '../src/shared/ai';
import type {
  DocumentLink,
  PapraDocumentPage,
  PapraSelection,
  PapraSettings,
} from '../src/shared/papra';

export type PapraCheckInput = {
  baseUrl: string;
  apiKey: string;
  organizationId: string;
  documentId: string;
};
/** Exercises the real routes with an in-memory database and a deterministic AI provider. */
export async function runPapraCheck(
  input: PapraCheckInput,
  migrationsDir = path.resolve('migrations'),
) {
  const client = createPapraClient();
  const document = await client.document(input, input.organizationId, input.documentId);
  const original = await readBounded(
    await client.file(input, input.organizationId, input.documentId),
    MAX_PAPRA_PDF_BYTES,
  );
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(original), document.originalSha256Hash);
  const db = openDatabase(':memory:', { migrationsDir });
  let scans = 0;
  const app = createApp({
    db,
    logger: createLogger({ level: 'silent' }),
    aiProviderService: {
      testConnection: async () => 'Testanbieter',
      scanPdf: async (_settings, _key, bytes) => {
        assert.equal(hash(bytes), hash(original));
        scans++;
        return {
          documentType: 'invoice',
          detectedYear: 2026,
          costs: [1, 2].map((number) => ({
            description: `Integrationstest ${number}`,
            amount: number,
            statementGroup: 'Wohnung',
            allocationKey: 'area',
            meterType: null,
            labor35a: 0,
            confidence: 1,
            source: 'Testanbieter; keine inhaltliche Auswertung',
          })),
          readings: [],
          warnings: [],
        };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  async function json<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    assert(response.ok, `${method} ${route}: HTTP ${response.status}`);
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
  try {
    db.prepare(
      "INSERT INTO properties (id, name, address) VALUES (1, 'Temporärer Integrationstest', '')",
    ).run();
    db.prepare('UPDATE ai_settings SET enabled = 1').run();
    const settings = await json<PapraSettings>('/api/papra/settings', 'PUT', {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      revision: 0,
    });
    await json('/api/papra/test', 'POST', { revision: settings.revision });
    await json('/api/properties/1/papra', 'PUT', {
      organizationId: input.organizationId,
      revision: 0,
    });
    const list = await json<PapraDocumentPage>('/api/properties/1/papra/documents');
    assert(list.documents.every((entry) => entry.organizationId === input.organizationId));
    const selection: PapraSelection = {
      documentId: input.documentId,
      organizationId: input.organizationId,
      settingsRevision: settings.revision,
      mappingRevision: 1,
    };
    const scanned = await json<AiScanResponse>('/api/ai/scan/papra', 'POST', {
      propertyId: 1,
      year: 2026,
      selection,
    });
    assert.equal(scans, 1);
    const imported = await json<{ costIds: number[] }>('/api/ai/import', 'POST', {
      propertyId: 1,
      year: 2026,
      fileName: scanned.fileName,
      papraSource: scanned.papraSource,
      costs: scanned.costs.map(({ confidence, ...cost }) => {
        void confidence;
        return cost;
      }),
      readings: [],
    });
    assert.equal(imported.costIds.length, 2);
    for (const costId of imported.costIds) {
      const links = await json<DocumentLink[]>(`/api/document-links?propertyId=1&costId=${costId}`);
      assert.equal(links.length, 1);
      const downloaded = await fetch(
        `${base}/api/document-links/${links[0].id}/file?propertyId=1&download=1`,
        { signal: AbortSignal.timeout(60_000) },
      );
      assert.equal(downloaded.status, 200);
      assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), hash(original));
      await json(`/api/document-links/${links[0].id}?propertyId=1`, 'DELETE');
    }
    await json('/api/document-links', 'POST', { propertyId: 1, costId: null, selection });
    assert.equal((await json<DocumentLink[]>('/api/document-links?propertyId=1')).length, 1);
    const after = await client.document(input, input.organizationId, input.documentId);
    assert.equal(after.originalSha256Hash, document.originalSha256Hash);
    const finalBytes = await readBounded(
      await client.file(input, input.organizationId, input.documentId),
      MAX_PAPRA_PDF_BYTES,
    );
    assert.equal(hash(finalBytes), hash(original));
    return {
      ok: true,
      documentsListed: list.documents.length,
      bytes: original.length,
      scans,
      costsCreated: imported.costIds.length,
      originalUnchanged: true,
      database: 'memory',
      aiProvider: 'test',
    };
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    db.close();
  }
}
