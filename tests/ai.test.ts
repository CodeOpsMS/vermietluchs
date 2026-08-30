import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AiProviderService } from '../src/server/ai/providers';
import { safeProviderBaseUrl } from '../src/server/ai/routes';
import { createFileAiSecretStore, createMemoryAiSecretStore } from '../src/server/ai/secrets';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';

const proposal = {
  documentType: 'owner_statement' as const,
  detectedYear: 2024,
  costs: [
    {
      description: 'Hausreinigung',
      amount: 321.45,
      statementGroup: 'Wohnung' as const,
      allocationKey: 'area' as const,
      meterType: null,
      labor35a: 120,
      confidence: 0.91,
      source: 'Seite 2',
    },
  ],
  readings: [
    {
      meterNumber: 'WMZ-1',
      meterName: 'Wärmezähler',
      date: '2024-12-31',
      value: 1234.5,
      unit: 'kWh',
      confidence: 0.88,
      source: 'Seite 5',
    },
  ],
  warnings: [],
};

describe('KI-Einstellungen, Scan und sicherer Import', () => {
  let directory: string;
  let db: SqliteDatabase;
  let service: AiProviderService;
  let secretStore: ReturnType<typeof createMemoryAiSecretStore>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-ai-'));
    db = openDatabase(path.join(directory, 'test.sqlite'), {
      migrationsDir: path.resolve('migrations'),
    });
    service = {
      testConnection: vi.fn(async () => 'Verbindung erfolgreich.'),
      scanPdf: vi.fn(async () => proposal),
    };
    secretStore = createMemoryAiSecretStore();
    app = createApp({ db, aiProviderService: service, aiSecretStore: secretStore });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function createProperty(name = 'Haus A') {
    return (
      await request(app)
        .post('/api/properties')
        .send({
          name,
          address: '',
          landlordName: null,
          landlordAddress: null,
          bankAccountHolder: null,
          bankIban: null,
          paymentDeadlineDays: null,
        })
        .expect(201)
    ).body as { id: number };
  }

  async function createMeter(propertyId: number, number = 'WMZ-1') {
    const unit = (
      await request(app)
        .post('/api/units')
        .send({
          propertyId,
          name: `Einheit ${number}`,
          floor: '',
          areaSqm: 50,
          unitWeight: 1,
          notes: '',
        })
        .expect(201)
    ).body as { id: number };
    return (
      await request(app)
        .post('/api/meters')
        .send({
          unitId: unit.id,
          name: 'Wärmezähler',
          meterNumber: number,
          type: 'heating',
          unitLabel: 'kWh',
        })
        .expect(201)
    ).body as { id: number };
  }

  async function enableOllama() {
    return request(app)
      .put('/api/ai/settings')
      .send({
        enabled: true,
        provider: 'ollama',
        model: 'qwen2.5vl:7b',
        baseUrl: 'http://host.docker.internal:11434',
        clearApiKey: false,
        revision: 0,
      })
      .expect(200);
  }

  test('ist standardmäßig deaktiviert und gibt niemals einen Schlüssel zurück', async () => {
    const initial = await request(app).get('/api/ai/settings').expect(200);
    expect(initial.body).toMatchObject({
      enabled: false,
      provider: 'ollama',
      apiKeyConfigured: false,
      revision: 0,
    });
    expect(initial.body).not.toHaveProperty('apiKey');

    const saved = await request(app)
      .put('/api/ai/settings')
      .send({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'sk-test-secret',
        clearApiKey: false,
        revision: 0,
      })
      .expect(200);
    expect(saved.body.baseUrl).toBe('https://api.openai.com/v1');
    expect(saved.body.apiKeyConfigured).toBe(true);
    expect(saved.body).not.toHaveProperty('apiKey');
    expect(JSON.stringify(saved.body)).not.toContain('sk-test-secret');
    expect(secretStore.read('openai')).toBe('sk-test-secret');
    const backup = await request(app).get('/api/backup/export').expect(200);
    expect(JSON.stringify(backup.body)).not.toContain('sk-test-secret');
    expect(backup.body.tables).not.toHaveProperty('ai_settings');
  });

  test('erlaubt für Ollama ausschließlich lokale oder private Ziele', () => {
    expect(safeProviderBaseUrl('ollama', 'http://localhost:11434')).toBe('http://localhost:11434');
    expect(safeProviderBaseUrl('ollama', 'http://192.168.2.24:11434')).toBe(
      'http://192.168.2.24:11434',
    );
    expect(() => safeProviderBaseUrl('ollama', 'https://public.example/')).toThrow(
      /private LAN-IP/,
    );
    expect(() => safeProviderBaseUrl('ollama', 'http://127.0.0.1:11434/path')).toThrow(
      /private LAN-IP/,
    );
  });

  test('blockiert Scans bis zur Aktivierung und testet nur gespeicherte Konfiguration', async () => {
    const property = await createProperty();
    const body = {
      propertyId: property.id,
      year: 2024,
      fileName: 'abrechnung.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from('%PDF-1.4 test').toString('base64'),
    };
    await request(app).post('/api/ai/scan').send(body).expect(403);
    await enableOllama();
    const tested = await request(app)
      .post('/api/ai/test')
      .send({
        provider: 'ollama',
        model: 'qwen2.5vl:7b',
        baseUrl: 'http://host.docker.internal:11434',
      })
      .expect(200);
    expect(tested.body).toEqual({ ok: true, message: 'Verbindung erfolgreich.' });

    const scanned = await request(app).post('/api/ai/scan').send(body).expect(200);
    expect(scanned.body).toMatchObject({ ...proposal, provider: 'ollama' });
    expect(service.scanPdf).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://host.docker.internal:11434' }),
      null,
      expect.any(Buffer),
      expect.objectContaining({ propertyName: 'Haus A', year: 2024 }),
    );
  });

  test('importiert nur offene Kosten und zugeordnete Zählerstände', async () => {
    const property = await createProperty();
    const meter = await createMeter(property.id);
    await enableOllama();

    const imported = await request(app)
      .post('/api/ai/import')
      .send({
        propertyId: property.id,
        year: 2024,
        fileName: 'eigentümerabrechnung.pdf',
        costs: [
          {
            description: proposal.costs[0].description,
            amount: proposal.costs[0].amount,
            statementGroup: proposal.costs[0].statementGroup,
            allocationKey: proposal.costs[0].allocationKey,
            meterType: proposal.costs[0].meterType,
            labor35a: proposal.costs[0].labor35a,
            source: proposal.costs[0].source,
          },
        ],
        readings: [
          {
            meterId: meter.id,
            date: '2024-12-31',
            value: 1234.5,
            source: proposal.readings[0].source,
          },
        ],
      })
      .expect(201);
    expect(imported.body).toMatchObject({ costsCreated: 1, readingsCreated: 1 });

    const costs = await request(app).get('/api/costs').expect(200);
    expect(costs.body).toHaveLength(1);
    expect(costs.body[0]).toMatchObject({
      descriptionInternal: 'Hausreinigung',
      sourceAmount: 321.45,
      tenantStatus: 'pending',
      allocableAmount: 321.45,
      directUnitId: null,
      directTenancyId: null,
      notes: expect.stringContaining('eigentümerabrechnung.pdf · Seite 2'),
    });
    const readings = await request(app).get('/api/readings').expect(200);
    expect(readings.body[0]).toMatchObject({
      meterId: meter.id,
      date: '2024-12-31',
      value: 1234.5,
      note: expect.stringContaining('eigentümerabrechnung.pdf · Seite 5'),
    });
    expect(db.prepare('SELECT count(*) AS total FROM tenancies').get()).toEqual({ total: 0 });
    expect(db.prepare('SELECT count(*) AS total FROM settlement_snapshots').get()).toEqual({
      total: 0,
    });
  });

  test('rollt den gesamten Import bei Dubletten oder fremden Zählern zurück', async () => {
    const property = await createProperty();
    const otherProperty = await createProperty('Haus B');
    const meter = await createMeter(property.id);
    const otherMeter = await createMeter(otherProperty.id, 'WMZ-2');
    await enableOllama();
    await request(app)
      .post('/api/readings')
      .send({ meterId: meter.id, date: '2024-12-31', value: 100, note: '' })
      .expect(201);

    const requestBody = (meterId: number) => ({
      propertyId: property.id,
      year: 2024,
      fileName: 'eigentümerabrechnung.pdf',
      costs: [
        {
          description: `Neu ${meterId}`,
          amount: proposal.costs[0].amount,
          statementGroup: proposal.costs[0].statementGroup,
          allocationKey: proposal.costs[0].allocationKey,
          meterType: proposal.costs[0].meterType,
          labor35a: proposal.costs[0].labor35a,
          source: proposal.costs[0].source,
        },
      ],
      readings: [{ meterId, date: '2024-12-31', value: 200, source: 'Seite 5' }],
    });
    await request(app).post('/api/ai/import').send(requestBody(meter.id)).expect(409);
    await request(app).post('/api/ai/import').send(requestBody(otherMeter.id)).expect(400);
    expect(db.prepare('SELECT count(*) AS total FROM costs').get()).toEqual({ total: 0 });
  });
});

describe('KI-Schlüsselspeicher', () => {
  test('schreibt Schlüssel mit Dateirechten 0600', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-ai-secret-'));
    try {
      const store = createFileAiSecretStore(directory);
      store.write('openai', 'sk-local-test');
      const filename = path.join(directory, 'ai-secrets.json');
      expect(store.read('openai')).toBe('sk-local-test');
      expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
      store.clear('openai');
      expect(store.has('openai')).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
