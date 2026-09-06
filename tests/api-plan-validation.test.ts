import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';

describe('Wirtschaftsplan: sichere Geldbeträge bei Schreiben und Restore', () => {
  let directory: string;
  let db: SqliteDatabase;
  let app: ReturnType<typeof createApp>;
  let planInput: Record<string, unknown>;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-plan-validation-'));
    db = openDatabase(path.join(directory, 'test.sqlite'), {
      migrationsDir: path.resolve('migrations'),
    });
    app = createApp({ db });
    const property = (await request(app).post('/api/properties').send({ name: 'Test' }).expect(201))
      .body;
    const unit = (
      await request(app)
        .post('/api/units')
        .send({ propertyId: property.id, name: 'Wohnung', areaSqm: 50 })
        .expect(201)
    ).body;
    const tenancy = (
      await request(app)
        .post('/api/tenancies')
        .send({
          unitId: unit.id,
          tenantName: 'Testmieter',
          startDate: '2024-01-01',
          persons: 1,
          baseRent: 700,
          utilityPrepayment: 100,
        })
        .expect(201)
    ).body;
    planInput = {
      propertyId: property.id,
      tenancyId: tenancy.id,
      year: 2024,
      housingCosts: 1200,
      garageCosts: 0,
      propertyTax: 0,
      months: 12,
      monthlyPrepayment: 100,
      notes: '',
    };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('POST lehnt eine unsichere Summe ab, bevor ein Datensatz gespeichert wird', async () => {
    const result = await request(app)
      .post('/api/operating-cost-plans')
      .send({
        ...planInput,
        housingCosts: 50_000_000_000_000,
        garageCosts: 50_000_000_000_000,
      })
      .expect(400);
    expect(result.body.error).toContain('Jahresbetrag');
    expect((await request(app).get('/api/operating-cost-plans').expect(200)).body).toEqual([]);
  });

  test('PUT behält bei einer unsicheren Summe den bisherigen Plan samt Revision', async () => {
    const plan = (await request(app).post('/api/operating-cost-plans').send(planInput).expect(201))
      .body;
    await request(app)
      .put(`/api/operating-cost-plans/${plan.id}`)
      .send({
        ...planInput,
        revision: plan.revision,
        housingCosts: 50_000_000_000_000,
        garageCosts: 50_000_000_000_000,
      })
      .expect(400);
    expect(
      (await request(app).get(`/api/operating-cost-plans/${plan.id}`).expect(200)).body,
    ).toEqual(plan);
  });

  test.each([
    { housing_costs_cents: Number.MAX_SAFE_INTEGER + 1 },
    { housing_costs_cents: 5_000_000_000_000_000, garage_costs_cents: 5_000_000_000_000_000 },
    { monthly_prepayment_cents: Number.MAX_SAFE_INTEGER + 1 },
  ])('Restore lehnt unsichere Planbeträge ab: %j', async (invalidAmounts) => {
    const plan = (await request(app).post('/api/operating-cost-plans').send(planInput).expect(201))
      .body;
    const backup = (await request(app).get('/api/backup/export').expect(200)).body;
    Object.assign(backup.tables.operating_cost_plans[0], invalidAmounts);
    await request(app).post('/api/backup/import').send(backup).expect(400);
    expect((await request(app).get('/api/operating-cost-plans').expect(200)).body).toEqual([plan]);
  });
});
