import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/server/app';
import type { SqliteDatabase } from '../src/server/database';
import { errorHandler } from '../src/server/errors';
import { requireAllowedHost } from '../src/server/http';

function createHostProbe(allowedHosts: string[] = []) {
  const app = express();
  app.use(requireAllowedHost(allowedHosts));
  app.get('/', (_request, response) => response.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

function createJsonProbe(limit: string) {
  const app = express();
  app.use(express.json({ limit }));
  app.post('/', (_request, response) => response.status(204).end());
  app.use(errorHandler);
  return app;
}

describe('HTTP-Infrastruktur', () => {
  test.each(['localhost:3001', '192.168.178.20:3001', '[::1]:3001'])(
    'erlaubt den direkten Zugriff über %s',
    async (host) => {
      await request(createHostProbe()).get('/').set('Host', host).expect(200, { ok: true });
    },
  );

  test('normalisiert einen ausdrücklich erlaubten DNS-Namen', async () => {
    await request(createHostProbe(['Vermietluchs.Home.:3001']))
      .get('/')
      .set('Host', 'VERMIETLUCHS.HOME:8080')
      .expect(200, { ok: true });
  });

  test('weist einen nicht erlaubten DNS-Namen vor der Route zurück', async () => {
    const response = await request(createHostProbe())
      .get('/')
      .set('Host', 'angreifer.example:3001')
      .expect(421);

    expect(response.body.error).toContain('Hostname ist nicht freigegeben');
  });

  test('antwortet auf syntaktisch ungültiges JSON mit 400', async () => {
    const response = await request(createJsonProbe('1kb'))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);

    expect(response.body).toEqual({ error: 'Der JSON-Inhalt ist ungültig.' });
  });

  test('antwortet auf einen zu großen JSON-Body mit 413', async () => {
    const response = await request(createJsonProbe('1kb'))
      .post('/')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'x'.repeat(2_048) }))
      .expect(413);

    expect(response.body).toEqual({ error: 'Die Anfrage ist größer als das erlaubte Limit.' });
  });

  test('meldet eine fehlgeschlagene SQLite-Prüfung als nicht verfügbar', async () => {
    const db = {
      pragma: vi.fn().mockReturnValue([{ quick_check: 'database disk image is malformed' }]),
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ version: 1 }),
      }),
    } as unknown as SqliteDatabase;

    const response = await request(createApp({ db }))
      .get('/api/health')
      .set('Host', '127.0.0.1:3001')
      .expect(503);

    expect(response.body).toEqual({
      ok: false,
      database: ['database disk image is malformed'],
      schemaVersion: 1,
    });
  });
});
