import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';

describe('Backup und Produktionsauslieferung', () => {
  let directory: string;
  let db: SqliteDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-backup-'));
    db = openDatabase(path.join(directory, 'test.sqlite'), {
      migrationsDir: path.resolve('migrations'),
    });
    app = createApp({ db });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const property = (name: string) => ({
    name,
    address: '',
    landlordName: null,
    landlordAddress: null,
    bankAccountHolder: null,
    bankIban: null,
    paymentDeadlineDays: null,
  });

  test('Export und validierter Restore ersetzen den Datenbestand vollständig', async () => {
    await request(app).post('/api/properties').send(property('Gesichert')).expect(201);
    const exported = await request(app).get('/api/backup/export').expect(200);
    expect(exported.headers['content-disposition']).toContain('vermietluchs-backup-');
    expect(exported.body).toMatchObject({ schemaVersion: 1, app: 'Vermietluchs' });

    await request(app).post('/api/properties').send(property('Nach Export')).expect(201);
    const restored = await request(app).post('/api/backup/import').send(exported.body).expect(200);
    expect(restored.body.ok).toBe(true);
    expect(restored.body.safetyBackup).toMatch(/^vermietluchs-before-restore-/);
    expect(fs.existsSync(path.join(directory, restored.body.safetyBackup))).toBe(true);
    const rows = await request(app).get('/api/properties').expect(200);
    expect(rows.body.map((row: { name: string }) => row.name)).toEqual(['Gesichert']);
  });

  test('ungültige Fremdschlüssel rollen den gesamten Restore zurück', async () => {
    const created = await request(app)
      .post('/api/properties')
      .send(property('Bleibt erhalten'))
      .expect(201);
    const exported = (await request(app).get('/api/backup/export').expect(200)).body;
    exported.tables.units.push({
      id: 99,
      property_id: 999,
      name: 'Ungültig',
      floor: '',
      area_sqm: 50,
      unit_weight: 1,
      notes: '',
      revision: 0,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    await request(app).post('/api/backup/import').send(exported).expect(400);
    const rows = await request(app).get('/api/properties').expect(200);
    expect(rows.body).toHaveLength(1);
    expect(rows.body[0]).toMatchObject({ id: created.body.id, name: 'Bleibt erhalten' });
  });

  test('Wirtschaftspläne werden gesichert und alte Backups ohne Plantabelle bleiben lesbar', async () => {
    const createdProperty = (
      await request(app).post('/api/properties').send(property('Planobjekt')).expect(201)
    ).body;
    const unit = (
      await request(app)
        .post('/api/units')
        .send({
          propertyId: createdProperty.id,
          name: 'Wohnung 1',
          floor: '',
          areaSqm: 47.46,
          unitWeight: 1,
          notes: '',
        })
        .expect(201)
    ).body;
    const tenancy = (
      await request(app)
        .post('/api/tenancies')
        .send({
          unitId: unit.id,
          tenantName: 'Mieter A',
          tenantAddress: '',
          startDate: '2023-01-01',
          endDate: null,
          persons: 1,
          baseRent: 700,
          utilityPrepayment: 150,
          garagePrepayment: 0,
          paymentDay: 3,
          notes: '',
        })
        .expect(201)
    ).body;
    const plan = (
      await request(app)
        .post('/api/operating-cost-plans')
        .send({
          propertyId: createdProperty.id,
          tenancyId: tenancy.id,
          year: 2024,
          housingCosts: 1883.45,
          garageCosts: 8.24,
          propertyTax: 106.29,
          months: 12,
          monthlyPrepayment: 150,
          notes: 'Excel-Beispiel',
        })
        .expect(201)
    ).body;

    const exported = (await request(app).get('/api/backup/export').expect(200)).body;
    expect(exported.tables.operating_cost_plans).toEqual([
      expect.objectContaining({
        id: plan.id,
        housing_costs_cents: 188345,
        monthly_prepayment_cents: 15000,
      }),
    ]);
    await request(app)
      .delete(`/api/operating-cost-plans/${plan.id}`)
      .set('If-Match', '0')
      .expect(204);
    await request(app).post('/api/backup/import').send(exported).expect(200);
    expect((await request(app).get('/api/operating-cost-plans').expect(200)).body[0]).toMatchObject(
      {
        annualTotal: 1997.98,
        calculatedMonthlyAmount: 166.5,
      },
    );

    delete exported.tables.operating_cost_plans;
    await request(app).post('/api/backup/import').send(exported).expect(200);
    expect((await request(app).get('/api/operating-cost-plans').expect(200)).body).toEqual([]);
  });

  test('strukturell defekte Snapshot-Payloads werden trotz gültigem JSON abgelehnt', async () => {
    const created = await request(app)
      .post('/api/properties')
      .send(property('Bleibt erhalten'))
      .expect(201);
    const exported = (await request(app).get('/api/backup/export').expect(200)).body;
    const timestamp = '2026-08-26T09:30:00.000Z';
    exported.tables.settlement_snapshots.push({
      id: 42,
      property_id: created.body.id,
      tenancy_id: 42,
      year: 2024,
      payload_json: '{}',
      revision: 0,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const rejected = await request(app).post('/api/backup/import').send(exported).expect(400);
    expect(rejected.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['settlement_snapshots', 0, 'payload_json'] }),
      ]),
    );
    const rows = await request(app).get('/api/properties').expect(200);
    expect(rows.body).toHaveLength(1);
    expect(rows.body[0]).toMatchObject({ id: created.body.id, name: 'Bleibt erhalten' });
  });

  test('statische Produktionsdateien erhalten SPA-Fallback, API-Routen nicht', async () => {
    const staticDir = path.join(directory, 'static');
    fs.mkdirSync(staticDir);
    fs.writeFileSync(
      path.join(staticDir, 'index.html'),
      '<!doctype html><title>Vermietluchs</title>',
    );
    const staticApp = createApp({ db, staticDir });
    await request(staticApp)
      .get('/objekte/1')
      .set('Accept', 'text/html')
      .expect(200, /Vermietluchs/);
    await request(staticApp).get('/api/gibt-es-nicht').expect(404).expect('Content-Type', /json/);
  });
});
