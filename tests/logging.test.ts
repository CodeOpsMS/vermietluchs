import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';
import { errorHandler } from '../src/server/errors';
import {
  createLogger,
  requestLogging,
  sanitizeLogValue,
  type LogOptions,
} from '../src/server/logging';

function capture(options: LogOptions = {}) {
  const entries: Record<string, unknown>[] = [];
  const logger = createLogger({ ...options, write: (line) => entries.push(JSON.parse(line)) });
  return {
    logger,
    entries,
    completed: () => entries.filter((entry) => entry.event === 'api.request.completed'),
  };
}

describe('Strukturierte Docker-Logs', () => {
  let db: SqliteDatabase;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });
  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test('protokolliert Anlegen, Ändern, Konflikt und Löschen mit Eingaben und Ergebnis', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    const created = await request(app)
      .post('/api/properties')
      .send({ name: 'Haus A', address: 'Musterweg 1' })
      .expect(201);
    const id = created.body.id;
    await request(app)
      .put(`/api/properties/${id}`)
      .send({ name: 'Haus B', address: 'Musterweg 2', revision: 0 })
      .expect(200);
    await request(app)
      .put(`/api/properties/${id}`)
      .send({ name: 'Veraltet', revision: 0 })
      .expect(409);
    await request(app)
      .delete(`/api/properties/${id}`)
      .set('If-Match', '1')
      .set('Content-Type', 'application/json')
      .expect(204);
    expect(log.completed()).toMatchObject([
      {
        method: 'POST',
        status: 201,
        outcome: 'succeeded',
        input: { name: 'Haus A' },
        result: { id, name: 'Haus A', revision: 0 },
      },
      {
        method: 'PUT',
        status: 200,
        outcome: 'succeeded',
        input: { name: 'Haus B' },
        result: { id, name: 'Haus B', revision: 1 },
      },
      {
        method: 'PUT',
        status: 409,
        outcome: 'failed',
        level: 'warn',
        result: { details: { currentRevision: 1 } },
      },
      {
        method: 'DELETE',
        status: 204,
        outcome: 'succeeded',
        path: `/api/properties/${id}`,
        revision: '1',
      },
    ]);
    expect(db.prepare('SELECT count(*) AS count FROM properties').get()).toEqual({ count: 0 });
    expect(log.entries.filter((entry) => entry.event === 'api.request.started')).toHaveLength(4);
    expect(log.completed()[0].requestId).toBe(created.headers['x-request-id']);
    expect(new Set(log.completed().map((entry) => entry.requestId)).size).toBe(4);
    expect(log.completed()[0]).toMatchObject({
      timestamp: expect.any(String),
      clientIp: expect.any(String),
      durationMs: expect.any(Number),
    });
    expect(log.completed()[3]).not.toHaveProperty('result');
  });

  test('protokolliert Einstellungen und Abfragen, ohne Leseantworten zu duplizieren', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    const settings = await request(app).get('/api/settings').expect(200);
    await request(app)
      .put('/api/settings')
      .send({ ...settings.body, landlordName: 'Erika Beispiel', paymentDeadlineDays: 21 })
      .expect(200);
    await request(app).get('/api/costs?year=2026').expect(200);
    expect(log.completed()).toMatchObject([
      { method: 'GET', path: '/api/settings' },
      {
        method: 'PUT',
        path: '/api/settings',
        result: { landlordName: 'Erika Beispiel', paymentDeadlineDays: 21, revision: 1 },
      },
      { method: 'GET', path: '/api/costs', query: { year: '2026' } },
    ]);
    expect(log.completed()[0]).not.toHaveProperty('result');
  });

  test('unterdrückt Schlüssel, Auth-Header, Cookies, URL-Zugangsdaten und Dokumentinhalt', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    const saved = await request(app)
      .put('/api/ai/settings')
      .send({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'secret-api-value',
        revision: 0,
      })
      .expect(200);
    expect(saved.body.apiKeyConfigured).toBe(true);
    await request(app)
      .post('/api/ai/scan')
      .send({
        propertyId: 1,
        year: 2026,
        fileName: 'Rechnung.pdf',
        dataBase64: 'hidden-document-bytes',
      })
      .expect(400);
    await request(app)
      .get('/api/properties?token=secret-query-value&year=2026')
      .set('Authorization', 'Bearer secret-header-value')
      .set('Cookie', 'session=secret-cookie-value')
      .set('X-Request-Id', 'secret-request-id')
      .expect(200);
    await request(app)
      .put('/api/ai/settings')
      .send({
        enabled: false,
        provider: 'compatible',
        model: 'local',
        baseUrl: 'https://user:secret-url-value@example.com/v1?api_key=secret-url-query',
        revision: 1,
      })
      .expect(400);
    const serialized = JSON.stringify(log.entries);
    for (const secret of [
      'secret-api-value',
      'hidden-document-bytes',
      'secret-query-value',
      'secret-header-value',
      'secret-cookie-value',
      'secret-request-id',
      'secret-url-value',
      'secret-url-query',
    ])
      expect(serialized).not.toContain(secret);
    expect(log.completed()[0]).toMatchObject({
      input: { apiKey: '[REDACTED]' },
      result: { apiKeyConfigured: true },
    });
    expect(log.completed()[1]).toMatchObject({
      input: { fileName: 'Rechnung.pdf', dataBase64: '[OMITTED]' },
    });
  });

  test('erfasst Parser-, Host-, Origin-, Validierungs- und Routingfehler', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    await request(app)
      .post('/api/properties')
      .set('Content-Type', 'application/json')
      .send('{"apiKey":"broken-secret"')
      .expect(400);
    await request(app).get('/api/properties').set('Host', 'unknown.example').expect(421);
    await request(app)
      .post('/api/properties')
      .set('Origin', 'https://unknown.example')
      .send({ name: 'Abgewiesen' })
      .expect(403);
    await request(app).post('/api/properties').send({ name: '' }).expect(400);
    await request(app).get('/api/missing').expect(404);
    expect(log.completed().map((entry) => entry.status)).toEqual([400, 421, 403, 400, 404]);
    expect(
      log.completed().every((entry) => entry.outcome === 'failed' && entry.level === 'warn'),
    ).toBe(true);
    expect(log.completed()[3]).toMatchObject({ error: { name: 'ZodError', fields: [['name']] } });
    expect(JSON.stringify(log.entries)).not.toContain('broken-secret');
  });

  test('erfasst zu große Anfragen und interne Fehler ohne rohe Fehlertexte', async () => {
    const log = capture();
    const app = express();
    app.use(requestLogging(log.logger));
    app.use(express.json({ limit: '1kb' }));
    app.post('/api/fail', () => {
      throw Object.assign(new Error('secret in unexpected error'), { code: 'SQLITE_IOERR' });
    });
    app.use(errorHandler);
    await request(app)
      .post('/api/fail')
      .send({ large: 'x'.repeat(2048) })
      .expect(413);
    await request(app).post('/api/fail').send({}).expect(500);
    expect(log.completed()).toMatchObject([
      { status: 413, outcome: 'failed', level: 'warn' },
      {
        status: 500,
        outcome: 'failed',
        level: 'error',
        error: { name: 'Error', code: 'SQLITE_IOERR' },
        result: { error: 'Interner Serverfehler.' },
      },
    ]);
    expect(JSON.stringify(log.entries)).not.toContain('secret in unexpected error');
  });

  test('fasst Backup-Inhalte zusammen, auch bei anderer Großschreibung und abschließendem Slash', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    const backup = await request(app).get('/api/backup/export').expect(200);
    backup.body.tables.app_settings[0].landlord_name = 'Backup-only Person';
    await request(app)
      .post('/API/BACKUP/IMPORT/')
      .send({ ...backup.body, tables: { ...backup.body.tables, invalid: [] } })
      .expect(400);
    expect(log.completed()[0]).toMatchObject({
      path: '/api/backup/export',
      status: 200,
      result: { content: '[OMITTED]', tableRows: { app_settings: 1 } },
    });
    expect(log.completed()[1]).toMatchObject({
      input: { content: '[OMITTED]', tableRows: { app_settings: 1, properties: 0 } },
    });
    expect(JSON.stringify(log.entries)).not.toContain('Backup-only Person');
  });

  test('zeigt beim erfolgreichen Restore Sicherheitskopie und Tabellenanzahlen', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-log-restore-'));
    const restoreDb = openDatabase(path.join(directory, 'test.sqlite'));
    try {
      const log = capture();
      const app = createApp({ db: restoreDb, logger: log.logger });
      const backup = await request(app).get('/api/backup/export').expect(200);
      backup.body.tables.app_settings[0].landlord_name = 'Restore-only Person';
      const restored = await request(app).post('/api/backup/import').send(backup.body).expect(200);
      expect(log.completed().at(-1)).toMatchObject({
        status: 200,
        outcome: 'succeeded',
        input: { tableRows: { app_settings: 1 } },
        result: { ok: true, safetyBackup: restored.body.safetyBackup },
      });
      expect(JSON.stringify(log.entries)).not.toContain('Restore-only Person');
      expect(fs.existsSync(path.join(directory, restored.body.safetyBackup))).toBe(true);
    } finally {
      restoreDb.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('protokolliert Sammelaktionen einschließlich erzeugter Anzahl', async () => {
    const log = capture();
    const app = createApp({ db, logger: log.logger });
    const property = await request(app).post('/api/properties').send({ name: 'Haus' }).expect(201);
    await request(app)
      .post('/api/payments/generate-year')
      .send({ propertyId: property.body.id, year: 2026 })
      .expect(201);
    expect(log.completed().at(-1)).toMatchObject({
      path: '/api/payments/generate-year',
      input: { propertyId: property.body.id, year: 2026 },
      result: { created: 0 },
    });
  });

  test('kann Eingabe- und Ergebniswerte vollständig abschalten', async () => {
    const log = capture({ values: false });
    const app = createApp({ db, logger: log.logger });
    await request(app)
      .post('/api/properties?private=hidden-query')
      .send({ name: 'hidden-name' })
      .expect(201);
    await request(app).post('/api/properties').send({ name: '' }).expect(400);
    expect(log.completed()[0]).toMatchObject({ method: 'POST', status: 201 });
    for (const entry of log.completed()) {
      expect(entry).not.toHaveProperty('input');
      expect(entry).not.toHaveProperty('result');
      expect(entry).not.toHaveProperty('query');
    }
    expect(JSON.stringify(log.entries)).not.toContain('hidden-');
  });

  test('zeigt Healthchecks und statische Aufrufe bei debug, Health-Fehler auch bei info', async () => {
    const info = capture();
    const debug = capture({ level: 'debug' });
    await request(createApp({ db, logger: info.logger }))
      .get('/api/health')
      .expect(200);
    expect(info.entries).toHaveLength(0);
    const app = createApp({ db, logger: debug.logger });
    await request(app).get('/API/HEALTH/').expect(200);
    expect(debug.completed()[0]).toMatchObject({ level: 'debug', status: 200 });
    const probe = express();
    probe.use(requestLogging(debug.logger));
    probe.get('/style.css', (_request, response) => response.send('body {}'));
    await request(probe).get('/style.css').expect(200);
    expect(debug.entries.at(-1)).toMatchObject({ event: 'http.request.completed', level: 'debug' });
    vi.spyOn(db, 'pragma').mockReturnValue([{ quick_check: 'bad' }]);
    await request(createApp({ db, logger: info.logger }))
      .get('/api/health')
      .expect(503);
    expect(info.completed()[0]).toMatchObject({ level: 'error', status: 503, outcome: 'failed' });
  });

  test('kennzeichnet einen Verbindungsabbruch genau einmal', () => {
    const log = capture();
    const req = {
      path: '/api/ai/scan',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      query: {},
      get: () => undefined,
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      json: vi.fn(),
      locals: {},
      statusCode: 200,
      writableFinished: false,
    }) as unknown as Response;
    requestLogging(log.logger)(req, res, vi.fn());
    res.emit('close');
    res.emit('finish');
    expect(log.completed()).toMatchObject([{ level: 'warn', outcome: 'aborted', status: null }]);
  });

  test('maskiert verschachtelte Geheimnisse, begrenzt große Werte und hält JSON einzeilig', () => {
    const input = {
      nested: [
        {
          Password: 'hidden',
          access_token: 'hidden',
          'api-key': 'hidden',
          authorization: 'hidden',
          dataBase64: 'hidden',
          name: 'Haus\nA',
        },
      ],
    };
    expect(sanitizeLogValue(input)).toEqual({
      nested: [
        {
          Password: '[REDACTED]',
          access_token: '[REDACTED]',
          'api-key': '[REDACTED]',
          authorization: '[REDACTED]',
          dataBase64: '[OMITTED]',
          name: 'Haus\nA',
        },
      ],
    });
    expect(input.nested[0].Password).toBe('hidden');
    expect(sanitizeLogValue('a'.repeat(4001))).toContain('TRUNCATED');
    expect(sanitizeLogValue(Array(101).fill(1))).toHaveLength(101);
    expect(
      sanitizeLogValue(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`field${i}`, i]))),
    ).toHaveProperty('[TRUNCATED]', '1 more fields');
    expect(sanitizeLogValue({ clearApiKey: true, apiKeyConfigured: false })).toEqual({
      clearApiKey: true,
      apiKeyConfigured: false,
    });
    expect(sanitizeLogValue({ clearApiKey: 'hidden' })).toEqual({ clearApiKey: '[REDACTED]' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(JSON.stringify(sanitizeLogValue(circular))).toContain('TRUNCATED: depth');
    expect(sanitizeLogValue(undefined)).toBe('[OMITTED]');
    const write = vi.fn();
    createLogger({ write }).log('info', 'test', input);
    expect(write.mock.calls[0][0].split('\n')).toHaveLength(1);
  });

  test('wertet Log-Konfiguration aus und schreibt Warnungen/Fehler nach stderr', () => {
    vi.stubEnv('VERMIETLUCHS_LOG_LEVEL', 'warn');
    vi.stubEnv('VERMIETLUCHS_LOG_VALUES', 'false');
    const log = capture();
    expect(log.logger.values).toBe(false);
    log.logger.log('info', 'hidden');
    log.logger.log('warn', 'visible');
    expect(log.entries).toMatchObject([{ event: 'visible' }]);
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const defaultWriter = createLogger({ level: 'debug' });
    defaultWriter.log('info', 'started');
    defaultWriter.log('warn', 'failed');
    defaultWriter.log('error', 'crashed');
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledTimes(2);
    const silent = capture({ level: 'silent' });
    silent.logger.log('error', 'hidden');
    expect(silent.entries).toHaveLength(0);
    vi.stubEnv('VERMIETLUCHS_LOG_LEVEL', 'invalid');
    expect(() => createLogger()).toThrow('VERMIETLUCHS_LOG_LEVEL');
    vi.stubEnv('VERMIETLUCHS_LOG_LEVEL', 'info');
    vi.stubEnv('VERMIETLUCHS_LOG_VALUES', 'invalid');
    expect(() => createLogger()).toThrow('VERMIETLUCHS_LOG_VALUES');
  });
});
