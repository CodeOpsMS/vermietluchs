import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';
import { createLogger } from '../src/server/logging';
import { createPapraClient } from '../src/server/papra/client';
import { createMemoryPapraSecretStore } from '../src/server/papra/secrets';
import type { PapraSelection } from '../src/shared/papra';
import { createPapraFixture, papraProposal, papraTestKey, papraTestUrl } from './helpers/papra';

describe('Papra-Anbindung: Hausgrenzen, Originale, KI und Backups', () => {
  let directory: string;
  let db: SqliteDatabase;
  let app: ReturnType<typeof createApp>;
  let fixture: ReturnType<typeof createPapraFixture>;
  let secrets: ReturnType<typeof createMemoryPapraSecretStore>;
  let client: ReturnType<typeof createPapraClient>;
  let scan: ReturnType<typeof vi.fn>;
  let logs: string[];
  const selection = (documentId = 'doc_org_a_1'): PapraSelection => ({
    documentId,
    organizationId: 'org_a',
    settingsRevision: 1,
    mappingRevision: 1,
  });
  const fileUrl = (selected = selection()) =>
    `/api/properties/1/papra/file?${new URLSearchParams(Object.entries(selected).map(([key, value]) => [key, String(value)]))}`;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-papra-'));
    db = openDatabase(path.join(directory, 'test.sqlite'));
    db.prepare(
      "INSERT INTO properties (id, name, address) VALUES (1, 'Haus A', ''), (2, 'Haus B', '')",
    ).run();
    db.prepare(
      `INSERT INTO costs (id, property_id, year, description_internal, source_amount_cents, tenant_status, allocable_amount_cents, statement_group, allocation_mode, allocation_key)
      VALUES (1, 1, 2026, 'Kosten A', 10000, 'pending', 10000, 'Wohnung', 'standard', 'area'), (2, 2, 2026, 'Kosten B', 10000, 'pending', 10000, 'Wohnung', 'standard', 'area')`,
    ).run();
    fixture = createPapraFixture();
    secrets = createMemoryPapraSecretStore();
    client = createPapraClient({ fetch: fixture.fetch });
    scan = vi.fn(async () => papraProposal);
    logs = [];
    app = createApp({
      db,
      papraClient: client,
      papraSecretStore: secrets,
      aiProviderService: { testConnection: vi.fn(), scanPdf: scan },
      logger: createLogger({ write: (line) => logs.push(line) }),
    });
  });
  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function connect() {
    const saved = await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: papraTestUrl, apiKey: papraTestKey, revision: 0 })
      .expect(200);
    expect(saved.body).toMatchObject({ apiKeyConfigured: true, connected: false, revision: 1 });
    await request(app).post('/api/papra/test').send({ revision: 1 }).expect(200);
  }
  async function configure() {
    await connect();
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: 'org_a', revision: 0 })
      .expect(200);
    await request(app)
      .put('/api/properties/2/papra')
      .send({ organizationId: 'org_b', revision: 0 })
      .expect(200);
  }
  const addLink = (propertyId = 1, costId: number | null = 1, selected = selection()) =>
    request(app).post('/api/document-links').send({ propertyId, costId, selection: selected });
  async function scanDocument() {
    db.prepare('UPDATE ai_settings SET enabled = 1').run();
    return (
      await request(app)
        .post('/api/ai/scan/papra')
        .send({ propertyId: 1, year: 2026, selection: selection() })
        .expect(200)
    ).body;
  }
  function importBody(source: unknown) {
    return {
      propertyId: 1,
      year: 2026,
      fileName: 'client-name.pdf',
      papraSource: source,
      costs: papraProposal.costs.map(({ confidence, ...cost }) => {
        void confidence;
        return cost;
      }),
      readings: [],
    };
  }
  test('startet ohne Verbindung; schützt Einstellungen, Hauszuordnung und Schlüssel', async () => {
    expect((await request(app).get('/api/papra/settings').expect(200)).body).toEqual({
      baseUrl: '',
      publicUrl: '',
      revision: 0,
      apiKeyConfigured: false,
      connected: false,
    });
    await request(app).get('/api/papra/organizations').expect(409);
    await request(app).post('/api/papra/test').send({ revision: 0 }).expect(409);
    expect(
      (await request(app).get('/api/properties/1/papra').expect(200)).body.organizationId,
    ).toBeNull();
    await request(app).get('/api/properties/999/papra').expect(404);
    await connect();
    await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: papraTestUrl, revision: 0 })
      .expect(409);
    await request(app).post('/api/papra/test').send({ revision: 0 }).expect(409);
    await request(app).get('/api/properties/1/papra/documents').expect(409);
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: 'foreign', revision: 0 })
      .expect(400);
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: 'org_a', revision: 0 })
      .expect(200);
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: 'org_b', revision: 0 })
      .expect(409);
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: null, revision: 1 })
      .expect(200);
    expect((await request(app).get('/api/properties/1/papra').expect(200)).body).toMatchObject({
      organizationId: null,
      revision: 2,
    });
    const next = await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: 'http://different:1221', revision: 1 })
      .expect(200);
    expect(next.body.apiKeyConfigured).toBe(false);
    expect(secrets.read(papraTestUrl)).toBeNull();
    await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: '', clearApiKey: true, revision: 2 })
      .expect(200);
    expect(logs.join('\n')).not.toContain(papraTestKey);
  });
  test('gibt ausschließlich Dokumentmetadaten des jeweiligen Hauses aus', async () => {
    await configure();
    const page = await request(app).get('/api/properties/1/papra/documents?page=1').expect(200);
    expect(page.body.documents).toHaveLength(3);
    expect(page.body.documentsCount).toBe(23);
    expect(
      page.body.documents.every(
        (doc: { organizationId: string }) => doc.organizationId === 'org_a',
      ),
    ).toBe(true);
    const b = await request(app)
      .get('/api/properties/2/papra/documents?search=org_b%2023')
      .expect(200);
    expect(b.body.documents).toHaveLength(1);
    await request(app).get('/api/properties/1/papra/documents?page=-1').expect(400);
    await request(app).get('/api/properties/1/papra/documents?organizationId=org_b').expect(400);
    expect(logs.join('\n')).not.toContain('OCR_INHALT_DARF_NICHT_IM_LOG_STEHEN');
  });
  test('trennt interne API-Adresse und Browser-Adresse ohne Schlüsselweitergabe', async () => {
    await configure();
    const publicUrl = 'https://documents.example.test';
    await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: papraTestUrl, publicUrl, revision: 1 })
      .expect(200);
    await request(app).post('/api/papra/test').send({ revision: 2 }).expect(200);
    await addLink(1, 1, { ...selection(), settingsRevision: 2 }).expect(201);
    const link = (await request(app).get('/api/document-links?propertyId=1&costId=1')).body[0];
    expect(link.papraUrl).toBe(`${publicUrl}/organizations/org_a/documents/doc_org_a_1`);
    await request(app).get(`/api/document-links/${link.id}/file?propertyId=1`).expect(200);
    expect(fixture.requests.every((entry) => entry.url.origin === papraTestUrl)).toBe(true);
    const backup = (await request(app).get('/api/backup/export')).body;
    expect(backup.tables.papra_settings[0].public_url).toBe(publicUrl);
    expect(backup.tables.document_links[0].public_url).toBe(publicUrl);
    await request(app).post('/api/backup/import').send(backup).expect(200);
    expect((await request(app).get('/api/papra/settings')).body.publicUrl).toBe(publicUrl);
  });
  test('verknüpft mehrere Dokumente mehrfach nutzbar und entfernt nur lokale Links', async () => {
    await configure();
    await addLink().expect(201);
    await addLink().expect(201);
    await addLink(1, 1, selection('doc_org_a_2')).expect(201);
    await addLink(1, null).expect(201);
    const links = (await request(app).get('/api/document-links?propertyId=1&costId=1').expect(200))
      .body;
    expect(links).toHaveLength(2);
    expect(
      (await request(app).get('/api/document-links?propertyId=1').expect(200)).body,
    ).toHaveLength(1);
    await request(app).delete(`/api/document-links/${links[0].id}?propertyId=2`).expect(404);
    await request(app).delete(`/api/document-links/${links[0].id}?propertyId=1`).expect(204);
    expect((await request(app).get('/api/document-links?propertyId=1&costId=1')).body).toHaveLength(
      1,
    );
    db.prepare('DELETE FROM costs WHERE id = 1').run();
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 1 });
    db.prepare('DELETE FROM properties WHERE id = 1').run();
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
    expect(fixture.documents.get('doc_org_a_1')!.metadata.isDeleted).toBe(false);
    expect(fixture.requests.every((entry) => entry.method === 'GET')).toBe(true);
  });
  test('weist fremde Kosten, Dokumente, Organisations- und Revisionsmanipulation zurück', async () => {
    await configure();
    await addLink(1, 2).expect(404);
    await addLink(1, 1, selection('doc_org_b_1')).expect(404);
    await addLink(1, 1, { ...selection(), organizationId: 'org_b' }).expect(409);
    await addLink(1, 1, { ...selection(), mappingRevision: 0 }).expect(409);
    await addLink(1, 1, { ...selection(), settingsRevision: 0 }).expect(409);
    await request(app).get('/api/document-links?propertyId=1&costId=2').expect(404);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
  });
  test('öffnet PDFs unverändert ohne Papra-Sitzung und lädt aktive Dateitypen nur herunter', async () => {
    await configure();
    await addLink().expect(201);
    const expected = fixture.documents.get('doc_org_a_1')!.bytes;
    const result = await request(app).get(fileUrl()).expect(200);
    expect(result.headers['content-type']).toBe('application/pdf');
    expect(result.headers['content-disposition']).toContain('inline;');
    expect(result.body).toEqual(expected);
    await request(app).get(`${fileUrl()}&check=1`).expect(200, { ok: true });
    const download = await request(app).get(`${fileUrl()}&download=1`).expect(200);
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.body).toEqual(expected);
    const svg = await request(app)
      .get(fileUrl(selection('doc_org_a_3')))
      .expect(200);
    expect(svg.headers['content-type']).toBe('application/octet-stream');
    expect(svg.headers['content-disposition']).toContain('attachment;');
    const link = (await request(app).get('/api/document-links?propertyId=1&costId=1')).body[0];
    const url = `/api/document-links/${link.id}/file?propertyId=1`;
    await request(app).get(`${url}&check=1`).expect(200);
    expect((await request(app).get(url).expect(200)).body).toEqual(expected);
    await request(app).get(`/api/document-links/${link.id}/file?propertyId=2`).expect(404);
    fixture.documents.get('doc_org_a_1')!.metadata.isDeleted = true;
    await request(app).get(url).expect(404);
    await request(app).get(`${url}&check=1`).expect(404);
    expect(logs.join('\n')).not.toContain('%PDF-');
  });
  test('behält Quellen bei Umzuordnung und blockiert den Abruf über eine andere Instanz', async () => {
    await configure();
    await addLink().expect(201);
    const row = (await request(app).get('/api/document-links?propertyId=1&costId=1')).body[0];
    await request(app)
      .put('/api/properties/1/papra')
      .send({ organizationId: 'org_b', revision: 1 })
      .expect(200);
    await request(app).get(`/api/document-links/${row.id}/file?propertyId=1`).expect(200);
    await addLink().expect(409);
    await request(app)
      .put('/api/papra/settings')
      .send({ baseUrl: 'http://new:1221', revision: 1, apiKey: papraTestKey })
      .expect(200);
    await request(app).post('/api/papra/test').send({ revision: 2 }).expect(200);
    await request(app).get(`/api/document-links/${row.id}/file?propertyId=1`).expect(409);
    expect(
      (await request(app).get('/api/document-links?propertyId=1&costId=1')).body[0],
    ).toMatchObject({ available: false, papraUrl: row.papraUrl });
    await request(app).get('/api/properties/1/papra/documents').expect(409);
  });
  test('übergibt identische PDF-Bytes an die KI und verknüpft alle bestätigten Kosten atomar', async () => {
    await configure();
    await request(app)
      .post('/api/ai/scan/papra')
      .send({ propertyId: 1, year: 2026, selection: selection() })
      .expect(403);
    const scanned = await scanDocument();
    expect(scan.mock.calls[0][2]).toEqual(fixture.documents.get('doc_org_a_1')!.bytes);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
    const imported = await request(app)
      .post('/api/ai/import')
      .send(importBody(scanned.papraSource))
      .expect(201);
    expect(imported.body.costsCreated).toBe(2);
    expect(db.prepare('SELECT cost_id FROM document_links ORDER BY cost_id').all()).toEqual(
      imported.body.costIds.map((cost_id: number) => ({ cost_id })),
    );
    const costs = db.prepare('SELECT tenant_status, notes FROM costs WHERE id > 2').all() as {
      tenant_status: string;
      notes: string;
    }[];
    expect(
      costs.every(
        (cost) => cost.tenant_status === 'pending' && cost.notes.includes('papra-doc_org_a_1'),
      ),
    ).toBe(true);
    await request(app).post('/api/ai/import').send(importBody(scanned.papraSource)).expect(409);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 2 });
  });
  test('rollt Import samt Links bei ungültigem Zähler oder fehlgeschlagener Verknüpfung zurück', async () => {
    await configure();
    const scanned = await scanDocument();
    const body = {
      ...importBody(scanned.papraSource),
      readings: [{ meterId: 999, date: '2026-12-31', value: 10, source: '' }],
    };
    await request(app).post('/api/ai/import').send(body).expect(400);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT count(*) AS count FROM costs').get()).toEqual({ count: 2 });
    db.exec(
      "CREATE TRIGGER reject_test_link BEFORE INSERT ON document_links BEGIN SELECT RAISE(ABORT, 'test constraint'); END;",
    );
    await request(app).post('/api/ai/import').send(importBody(scanned.papraSource)).expect(409);
    expect(db.prepare('SELECT count(*) AS count FROM costs').get()).toEqual({ count: 2 });
  });
  test('übernimmt keine veränderten oder gelöschten Scanquellen', async () => {
    await configure();
    const scanned = await scanDocument();
    const body = importBody(scanned.papraSource);
    fixture.documents.get('doc_org_a_1')!.metadata.originalSha256Hash = '0'.repeat(64);
    await request(app).post('/api/ai/import').send(body).expect(409);
    fixture.documents.get('doc_org_a_1')!.metadata.isDeleted = true;
    await request(app).post('/api/ai/import').send(body).expect(404);
    expect(db.prepare('SELECT count(*) AS count FROM costs').get()).toEqual({ count: 2 });
  });
  test.each(['non-pdf', 'empty', 'broken', 'hash', 'size', 'large'] as const)(
    'verwirft %s vor dem KI-Aufruf',
    async (kind) => {
      await configure();
      db.prepare('UPDATE ai_settings SET enabled = 1').run();
      const item = fixture.documents.get('doc_org_a_1')!;
      if (kind === 'non-pdf') item.metadata.mimeType = 'image/png';
      if (kind === 'empty' || kind === 'broken') {
        item.bytes = Buffer.from(kind === 'empty' ? '' : '%PDF-1.4\nbroken\n%%EOF');
        item.metadata.originalSize = item.bytes.length;
        item.metadata.originalSha256Hash = createHash('sha256').update(item.bytes).digest('hex');
      }
      if (kind === 'hash') item.metadata.originalSha256Hash = '0'.repeat(64);
      if (kind === 'size') item.metadata.originalSize++;
      if (kind === 'large') item.metadata.originalSize = 20 * 1024 * 1024 + 1;
      await request(app)
        .post('/api/ai/scan/papra')
        .send({ propertyId: 1, year: 2026, selection: selection() })
        .expect(kind === 'large' ? 413 : ['hash', 'size'].includes(kind) ? 409 : 400);
      expect(scan).not.toHaveBeenCalled();
    },
  );
  test('prüft die Zuordnung nach asynchronen Abrufen erneut', async () => {
    await configure();
    const original = client.document;
    vi.spyOn(client, 'document').mockImplementation(async (...args) => {
      const result = await original(...args);
      db.prepare(
        'UPDATE papra_property_mappings SET revision = revision + 1 WHERE property_id = 1',
      ).run();
      return result;
    });
    await addLink().expect(409);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
  });
  test('sichert Verknüpfungen und Zuordnungen, setzt Zugang nach Restore zurück und importiert Version 1', async () => {
    await configure();
    await addLink().expect(201);
    await addLink(1, null).expect(201);
    const backup = (await request(app).get('/api/backup/export').expect(200)).body;
    expect(backup.schemaVersion).toBe(2);
    expect(backup.tables.document_links).toHaveLength(2);
    expect(JSON.stringify(backup)).not.toContain(papraTestKey);
    fixture.state.status = 503;
    const calls = fixture.requests.length;
    await request(app).post('/api/backup/import').send(backup).expect(200);
    expect(fixture.requests).toHaveLength(calls);
    expect(db.prepare('SELECT * FROM document_links ORDER BY id').all()).toEqual(
      backup.tables.document_links,
    );
    expect(db.prepare('SELECT * FROM papra_property_mappings ORDER BY id').all()).toEqual(
      backup.tables.papra_property_mappings,
    );
    expect((await request(app).get('/api/papra/settings')).body).toMatchObject({
      connected: false,
      apiKeyConfigured: false,
    });
    const old = structuredClone(backup);
    old.schemaVersion = 1;
    delete old.tables.document_links;
    delete old.tables.papra_property_mappings;
    delete old.tables.papra_settings;
    await request(app).post('/api/backup/import').send(old).expect(200);
    expect(db.prepare('SELECT count(*) AS count FROM document_links').get()).toEqual({ count: 0 });
    expect((await request(app).get('/api/papra/settings')).body.baseUrl).toBe('');
  });
  test('ungültige Backupreferenzen rollen zurück und erhalten den bisherigen Schlüssel', async () => {
    await configure();
    await addLink().expect(201);
    const backup = (await request(app).get('/api/backup/export')).body;
    const before = db.prepare('SELECT * FROM document_links').all();
    for (const field of ['property_id', 'cost_id']) {
      const invalid = structuredClone(backup);
      invalid.tables.document_links[0][field] = 2;
      await request(app).post('/api/backup/import').send(invalid).expect(400);
      expect(db.prepare('SELECT * FROM document_links').all()).toEqual(before);
      expect(secrets.read(papraTestUrl)).toBe(papraTestKey);
    }
    const invalid = structuredClone(backup);
    invalid.tables.document_links[0].base_url = 'javascript:alert(1)';
    await request(app).post('/api/backup/import').send(invalid).expect(400);
    await request(app)
      .post('/api/backup/import')
      .send({ ...backup, schemaVersion: 99 })
      .expect(400);
  });
  test('Papra-Ausfälle blockieren weder lokale Links noch Fachdaten', async () => {
    await configure();
    await addLink().expect(201);
    fixture.state.status = 503;
    await request(app).get('/api/document-links?propertyId=1&costId=1').expect(200);
    await request(app).get('/api/properties').expect(200);
    await request(app).get('/api/costs').expect(200);
    await request(app).get('/api/backup/export').expect(200);
    await addLink(1, null).expect(502);
    const links = (await request(app).get('/api/document-links?propertyId=1&costId=1')).body;
    await request(app).delete(`/api/document-links/${links[0].id}?propertyId=1`).expect(204);
    expect(logs.join('\n')).not.toContain('private remote error');
  });
});
