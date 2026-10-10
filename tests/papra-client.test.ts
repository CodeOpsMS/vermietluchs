import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { createPapraClient, MAX_PAPRA_PDF_BYTES, readBounded } from '../src/server/papra/client';
import { createFilePapraSecretStore } from '../src/server/papra/secrets';
import { papraBaseUrlSchema, papraSettingsSchema } from '../src/shared/papra';
import { createPapraFixture, papraTestKey, papraTestUrl } from './helpers/papra';

const connection = { baseUrl: papraTestUrl, apiKey: papraTestKey };
describe('Papra REST-Vertrag und Dateigrenzen', () => {
  test('prüft den Schlüssel, isoliert Organisationen und reicht Suche und Pagination weiter', async () => {
    const fixture = createPapraFixture();
    const client = createPapraClient({ fetch: fixture.fetch });
    expect(await client.test(connection)).toHaveLength(2);
    expect((await client.documents(connection, 'org_a', '', 1)).documents).toHaveLength(3);
    const result = await client.documents(connection, 'org_b', 'Beleg org_b 23', 0);
    expect(result.documentsCount).toBe(1);
    expect(result.documents[0]).not.toHaveProperty('content');
    expect((await client.document(connection, 'org_a', 'doc_org_a_1')).id).toBe('doc_org_a_1');
    const file = await client.file(connection, 'org_a', 'doc_org_a_1');
    expect(file.headers.get('content-type')).toBe('application/octet-stream');
    expect(await readBounded(file, MAX_PAPRA_PDF_BYTES)).toEqual(
      fixture.documents.get('doc_org_a_1')!.bytes,
    );
    expect(
      fixture.requests.every(
        (entry) =>
          entry.method === 'GET' &&
          entry.authorization === `Bearer ${papraTestKey}` &&
          entry.redirect === 'manual',
      ),
    ).toBe(true);
    expect(
      fixture.requests
        .find((entry) => entry.url.searchParams.get('pageIndex') === '1')
        ?.url.searchParams.get('pageSize'),
    ).toBe('20');
  });
  test.each([401, 403, 404, 429, 500, 302])(
    'behandelt Status %s ohne fremde Fehlerdetails oder Redirect',
    async (status) => {
      const fetcher = vi.fn(
        async () =>
          new Response('SECRET_REMOTE_DETAIL', {
            status,
            headers: { location: 'https://other.invalid' },
          }),
      );
      const client = createPapraClient({ fetch: fetcher });
      await expect(client.organizations(connection)).rejects.toMatchObject({
        status: status >= 500 || status === 302 ? 502 : status,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]).toBeDefined();
    },
  );
  test('erkennt fehlende Leserechte und falsche Antwortformen', async () => {
    const fixture = createPapraFixture();
    fixture.state.permissions = ['documents:read'];
    await expect(
      createPapraClient({ fetch: fixture.fetch }).test(connection),
    ).rejects.toMatchObject({ status: 403 });
    for (const response of ['not-json', '{}', '{"organizations":null}']) {
      await expect(
        createPapraClient({ fetch: async () => new Response(response) }).organizations(connection),
      ).rejects.toMatchObject({ status: 502 });
    }
  });
  test('behandelt Netzwerkfehler, Timeout und Abbruch', async () => {
    await expect(
      createPapraClient({
        fetch: async () => {
          throw new Error('network secret');
        },
      }).organizations(connection),
    ).rejects.toMatchObject({ status: 502 });
    const fetcher: typeof fetch = async (_url, init) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
      return new Response();
    };
    await expect(
      createPapraClient({ fetch: fetcher, timeoutMs: 5 }).organizations(connection),
    ).rejects.toMatchObject({ status: 504 });
    const controller = new AbortController();
    const pending = createPapraClient({ fetch: fetcher }).organizations(
      connection,
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 504 });
  });
  test('verwirft falsch zugeordnete oder gelöschte Dokumente auch bei erfolgreichem HTTP-Status', async () => {
    const fixture = createPapraFixture();
    const metadata = fixture.documents.get('doc_org_a_1')!.metadata;
    const client = createPapraClient({
      fetch: async () =>
        Response.json({ document: metadata, documents: [metadata], documentsCount: 1 }),
    });
    await expect(client.documents(connection, 'org_b', '', 0)).rejects.toMatchObject({
      status: 502,
    });
    await expect(client.document(connection, 'org_b', metadata.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(client.document(connection, 'org_a', 'forged')).rejects.toMatchObject({
      status: 404,
    });
    metadata.isDeleted = true;
    await expect(client.document(connection, 'org_a', metadata.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  test('zählt tatsächliche Stream-Bytes unabhängig vom Content-Length-Header', async () => {
    const limit = MAX_PAPRA_PDF_BYTES;
    expect((await readBounded(new Response(new Uint8Array(limit)), limit)).length).toBe(limit);
    for (const headers of [
      {},
      { 'content-length': '2' },
      { 'content-length': String(limit + 1) },
    ] as Record<string, string>[]) {
      await expect(
        readBounded(new Response(new Uint8Array(limit + 1), { headers }), limit),
      ).rejects.toMatchObject({ status: 413 });
    }
    await expect(readBounded(new Response(null), limit)).rejects.toMatchObject({ status: 502 });
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(6));
      },
      cancel,
    });
    await expect(readBounded(new Response(stream), 10)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
describe('Papra-Konfiguration und Schlüsseldatei', () => {
  test('normalisiert LAN- und Docker-Adressen, verbietet URL-Zugangsdaten und aktive Protokolle', () => {
    expect(papraBaseUrlSchema.parse(' HTTP://Papra:1221/ ')).toBe('http://papra:1221');
    expect(papraBaseUrlSchema.parse('https://example.org/papra/')).toBe(
      'https://example.org/papra',
    );
    for (const value of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'http://user:password@host',
      'https://host/?token=x',
      'http://host/#x',
    ])
      expect(papraBaseUrlSchema.safeParse(value).success).toBe(false);
    expect(
      papraSettingsSchema.safeParse({ baseUrl: papraTestUrl, apiKey: 'a\nb', revision: 0 }).success,
    ).toBe(false);
  });
  test('speichert atomar mit 0600 und bindet den Schlüssel an die Adresse', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papra-secret-'));
    try {
      const store = createFilePapraSecretStore(directory);
      expect(store.read(papraTestUrl)).toBeNull();
      store.write(papraTestUrl, papraTestKey);
      expect(store.read(papraTestUrl)).toBe(papraTestKey);
      expect(store.read('https://different.invalid')).toBeNull();
      expect(fs.statSync(path.join(directory, 'papra-secrets.json')).mode & 0o777).toBe(0o600);
      store.write(papraTestUrl, 'new-key');
      expect(createFilePapraSecretStore(directory).read(papraTestUrl)).toBe('new-key');
      expect(fs.readdirSync(directory)).toEqual(['papra-secrets.json']);
      fs.writeFileSync(path.join(directory, 'papra-secrets.json'), '{}');
      expect(() => store.read(papraTestUrl)).toThrow(/beschädigt/);
      store.clear();
      store.clear();
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
