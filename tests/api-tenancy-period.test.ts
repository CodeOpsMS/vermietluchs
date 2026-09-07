import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';

describe('Mietzeitraum bleibt mit zugeordneten Jahresdaten vereinbar', () => {
  let directory: string;
  let db: SqliteDatabase;
  let app: ReturnType<typeof createApp>;
  let propertyId: number;
  let tenancy: {
    id: number;
    revision: number;
    unitId: number;
    startDate: string;
    endDate: string | null;
  };
  const tenant = {
    tenantName: 'Bestand',
    startDate: '2024-01-01',
    baseRent: 700,
    utilityPrepayment: 100,
  };

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-tenancy-period-'));
    db = openDatabase(path.join(directory, 'test.sqlite'), {
      migrationsDir: path.resolve('migrations'),
    });
    app = createApp({ db });
    propertyId = (await request(app).post('/api/properties').send({ name: 'Test' }).expect(201))
      .body.id;
    const unit = (
      await request(app)
        .post('/api/units')
        .send({ propertyId, name: 'Wohnung', areaSqm: 50 })
        .expect(201)
    ).body;
    tenancy = (
      await request(app)
        .post('/api/tenancies')
        .send({ ...tenant, unitId: unit.id })
        .expect(201)
    ).body;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function createYearReference(kind: 'plan' | 'cost') {
    if (kind === 'plan') {
      await request(app)
        .post('/api/operating-cost-plans')
        .send({
          propertyId,
          tenancyId: tenancy.id,
          year: 2025,
          housingCosts: 1200,
          garageCosts: 0,
          propertyTax: 0,
          months: 12,
          monthlyPrepayment: 100,
        })
        .expect(201);
    } else {
      await request(app)
        .post('/api/costs')
        .send({
          propertyId,
          year: 2025,
          descriptionInternal: 'Direkter Anteil',
          sourceAmount: 1200,
          tenantStatus: 'included',
          allocableAmount: 1200,
          statementGroup: 'Wohnung',
          allocationMode: 'fixedTenancy',
          allocationKey: 'direct',
          directTenancyId: tenancy.id,
        })
        .expect(201);
    }
  }

  for (const kind of ['plan', 'cost'] as const) {
    test.each(['start', 'end', 'changeover'] as const)(
      `${kind}: unvereinbare Änderung %s bleibt vollständig ohne Wirkung`,
      async (change) => {
        await createYearReference(kind);
        // Ein Mieterwechsel würde diese unbezahlten Folgemonate normalerweise entfernen.
        // Für die direkte Bearbeitung darf nicht die schon vorhandene Zahlungsprüfung den Test erfüllen.
        if (change === 'changeover') {
          await request(app)
            .post('/api/payments/generate-year')
            .send({ propertyId, year: 2025 })
            .expect(201);
        }
        const before = (await request(app).get('/api/backup/export').expect(200)).body;
        const rejected =
          change === 'changeover'
            ? await request(app)
                .post('/api/changeovers')
                .send({
                  previousTenancyId: tenancy.id,
                  previousRevision: tenancy.revision,
                  endDate: '2024-12-31',
                  nextTenancy: { ...tenant, tenantName: 'Nachmieter', startDate: '2025-01-01' },
                  readings: [],
                })
                .expect(409)
            : await request(app)
                .put(`/api/tenancies/${tenancy.id}`)
                .send({
                  ...tenancy,
                  ...(change === 'start' ? { startDate: '2026-01-01' } : { endDate: '2024-12-31' }),
                })
                .expect(409);
        expect(rejected.body.error).toContain(
          kind === 'plan' ? 'Wirtschaftsplan 2025' : 'Kostenposition',
        );
        const after = (await request(app).get('/api/backup/export').expect(200)).body;
        expect(after.tables).toEqual(before.tables);
        await request(app).post('/api/backup/import').send(after).expect(200);
      },
    );
  }

  test('Teiljahr mit demselben Plan-/Kostenjahr bleibt erlaubt und wiederherstellbar', async () => {
    await createYearReference('plan');
    await createYearReference('cost');
    await request(app)
      .put(`/api/tenancies/${tenancy.id}`)
      .send({
        ...tenancy,
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      })
      .expect(200);
    const backup = (await request(app).get('/api/backup/export').expect(200)).body;
    await request(app).post('/api/backup/import').send(backup).expect(200);
    expect((await request(app).get('/api/operating-cost-plans').expect(200)).body).toHaveLength(1);
    expect((await request(app).get('/api/costs').expect(200)).body).toHaveLength(1);
  });
});
