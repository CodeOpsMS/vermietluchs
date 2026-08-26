import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { openDatabase, type SqliteDatabase } from '../src/server/database';

const propertyInput = {
  name: 'Haus A',
  address: 'Musterweg 1',
  landlordName: null,
  landlordAddress: null,
  bankAccountHolder: null,
  bankIban: null,
  paymentDeadlineDays: null,
};

const tenancyInput = (unitId: number, overrides: Record<string, unknown> = {}) => ({
  unitId,
  tenantName: 'Mieter A',
  tenantAddress: '',
  startDate: '2024-01-01',
  endDate: null,
  persons: 1,
  baseRent: 700,
  utilityPrepayment: 150,
  garagePrepayment: 0,
  paymentDay: 3,
  notes: '',
  ...overrides,
});

describe('HTTP-API und SQLite-Persistenz', () => {
  let directory: string;
  let db: SqliteDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vermietluchs-api-'));
    db = openDatabase(path.join(directory, 'test.sqlite'), {
      migrationsDir: path.resolve('migrations'),
    });
    app = createApp({ db });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function createProperty() {
    return (await request(app).post('/api/properties').send(propertyInput).expect(201)).body as {
      id: number;
      revision: number;
    };
  }

  async function createUnit(propertyId: number, name = 'DG') {
    return (
      await request(app)
        .post('/api/units')
        .send({
          propertyId,
          name,
          floor: '2. OG',
          areaSqm: 47.46,
          unitWeight: 1,
          notes: '',
        })
        .expect(201)
    ).body as { id: number; revision: number };
  }

  test('Migration, Health-Route und Foreign Keys sind aktiv', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toEqual({ ok: true, database: ['ok'], schemaVersion: 1 });
    expect(health.headers['cache-control']).toBe('no-store');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  test('CRUD liefert Euro-Werte und schützt Änderungen per Revision', async () => {
    const property = await createProperty();
    expect(property.revision).toBe(0);
    const updated = await request(app)
      .put(`/api/properties/${property.id}`)
      .send({
        ...propertyInput,
        name: 'Haus A neu',
        revision: 0,
      })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Haus A neu', revision: 1 });

    const conflict = await request(app)
      .put(`/api/properties/${property.id}`)
      .send({
        ...propertyInput,
        name: 'Veraltet',
        revision: 0,
      })
      .expect(409);
    expect(conflict.body.details.currentRevision).toBe(1);
    await request(app).delete(`/api/properties/${property.id}`).set('If-Match', '0').expect(409);
    await request(app).delete(`/api/properties/${property.id}`).set('If-Match', '1').expect(204);
  });

  test('globale Einstellungen verwenden dieselbe optimistische Revision', async () => {
    const initial = await request(app).get('/api/settings').expect(200);
    expect(initial.body.revision).toBe(0);
    const input = {
      landlordName: 'Max Vermieter',
      landlordAddress: 'Adresse 1',
      bankAccountHolder: 'Max Vermieter',
      bankIban: 'DE001234',
      paymentDeadlineDays: 21,
      revision: 0,
    };
    const updated = await request(app).put('/api/settings').send(input).expect(200);
    expect(updated.body).toMatchObject({
      landlordName: 'Max Vermieter',
      paymentDeadlineDays: 21,
      revision: 1,
    });
    await request(app).put('/api/settings').send(input).expect(409);
  });

  test('Mietverhältnisse derselben Wohnung dürfen sich nicht überschneiden', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    await request(app)
      .post('/api/tenancies')
      .send(tenancyInput(unit.id, { endDate: '2024-07-31' }))
      .expect(201);
    const overlap = await request(app)
      .post('/api/tenancies')
      .send(
        tenancyInput(unit.id, {
          tenantName: 'Mieter B',
          startDate: '2024-07-31',
          endDate: '2024-12-31',
        }),
      )
      .expect(409);
    expect(overlap.body.error).toContain('überschneiden');
    await request(app)
      .post('/api/tenancies')
      .send(
        tenancyInput(unit.id, {
          tenantName: 'Mieter B',
          startDate: '2024-08-01',
          endDate: '2024-12-31',
        }),
      )
      .expect(201);
  });

  test('Wohnungen und bestehende Mietverhältnisse bleiben ihrem Objekt zugeordnet', async () => {
    const firstProperty = await createProperty();
    const secondProperty = (
      await request(app)
        .post('/api/properties')
        .send({ ...propertyInput, name: 'Haus B' })
        .expect(201)
    ).body;
    const firstUnit = await createUnit(firstProperty.id, 'Wohnung A');
    const secondUnit = await createUnit(secondProperty.id, 'Wohnung B');
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(firstUnit.id)).expect(201)
    ).body;

    await request(app)
      .put(`/api/units/${firstUnit.id}`)
      .send({
        propertyId: secondProperty.id,
        name: 'Wohnung A',
        floor: '2. OG',
        areaSqm: 47.46,
        unitWeight: 1,
        notes: '',
        revision: firstUnit.revision,
      })
      .expect(400);
    await request(app)
      .put(`/api/tenancies/${tenancy.id}`)
      .send(tenancyInput(secondUnit.id, { revision: tenancy.revision }))
      .expect(400);
  });

  test('Mieterwechsel beendet, erstellt und liest atomar ab', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    const meter = (
      await request(app)
        .post('/api/meters')
        .send({
          unitId: unit.id,
          name: 'Kaltwasser',
          meterNumber: 'KW-1',
          type: 'coldWater',
          unitLabel: 'm³',
        })
        .expect(201)
    ).body;

    const changeover = {
      previousTenancyId: tenancy.id,
      previousRevision: 0,
      endDate: '2024-07-31',
      nextTenancy: {
        tenantName: 'Mieter B',
        tenantAddress: '',
        startDate: '2024-08-01',
        endDate: null,
        persons: 2,
        baseRent: 720,
        utilityPrepayment: 160,
        garagePrepayment: 0,
        paymentDay: 3,
        notes: '',
      },
      readings: [{ meterId: meter.id, date: '2024-07-31', value: 123.45 }],
    };
    const changed = await request(app).post('/api/changeovers').send(changeover).expect(201);
    expect(changed.body.previousTenancy).toMatchObject({ endDate: '2024-07-31', revision: 1 });
    expect(changed.body.nextTenancy).toMatchObject({
      tenantName: 'Mieter B',
      unitId: unit.id,
      revision: 0,
    });
    expect(changed.body.readings[0]).toMatchObject({
      meterId: meter.id,
      value: 123.45,
      note: 'Mieterwechsel',
    });
    const stale = await request(app).post('/api/changeovers').send(changeover).expect(409);
    expect(stale.body.details.currentRevision).toBe(1);
  });

  test('ein fehlerhafter Mieterwechsel hinterlässt keine Teiländerung', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const otherUnit = await createUnit(property.id, 'EG');
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    const otherMeter = (
      await request(app)
        .post('/api/meters')
        .send({
          unitId: otherUnit.id,
          name: 'Fremdzähler',
          meterNumber: '',
          type: 'coldWater',
          unitLabel: 'm³',
        })
        .expect(201)
    ).body;
    await request(app)
      .post('/api/changeovers')
      .send({
        previousTenancyId: tenancy.id,
        previousRevision: 0,
        endDate: '2024-07-31',
        nextTenancy: {
          tenantName: 'Mieter B',
          tenantAddress: '',
          startDate: '2024-08-01',
          endDate: null,
          persons: 1,
          baseRent: 700,
          utilityPrepayment: 150,
          garagePrepayment: 0,
          paymentDay: 3,
          notes: '',
        },
        readings: [{ meterId: otherMeter.id, date: '2024-07-31', value: 10 }],
      })
      .expect(400);
    const stored = await request(app).get(`/api/tenancies/${tenancy.id}`).expect(200);
    expect(stored.body).toMatchObject({ endDate: null, revision: 0 });
    const tenancies = await request(app).get(`/api/tenancies?unitId=${unit.id}`).expect(200);
    expect(tenancies.body).toHaveLength(1);
  });

  test('Mieterwechsel entfernt unbezahlte Folgemonate und erzeugt sie für den Nachmieter neu', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const previous = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    expect(
      (
        await request(app)
          .post('/api/payments/generate-year')
          .send({
            propertyId: property.id,
            year: 2024,
          })
          .expect(201)
      ).body.created,
    ).toBe(12);

    const changed = await request(app)
      .post('/api/changeovers')
      .send({
        previousTenancyId: previous.id,
        previousRevision: previous.revision,
        endDate: '2024-07-31',
        nextTenancy: {
          tenantName: 'Mieter B',
          tenantAddress: '',
          startDate: '2024-08-01',
          endDate: null,
          persons: 1,
          baseRent: 700,
          utilityPrepayment: 150,
          garagePrepayment: 0,
          paymentDay: 3,
          notes: '',
        },
        readings: [],
      })
      .expect(201);
    expect(changed.body.deletedFuturePayments).toBe(5);
    expect(
      (await request(app).get(`/api/payments?tenancyId=${previous.id}&year=2024`).expect(200)).body,
    ).toHaveLength(7);

    expect(
      (
        await request(app)
          .post('/api/payments/generate-year')
          .send({
            propertyId: property.id,
            year: 2024,
          })
          .expect(201)
      ).body.created,
    ).toBe(5);
    expect((await request(app).get('/api/payments?year=2024').expect(200)).body).toHaveLength(12);
  });

  test('Mieterwechsel stoppt bei bereits bezahlten Buchungen nach dem Auszug', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const previous = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    await request(app)
      .post('/api/payments/generate-year')
      .send({ propertyId: property.id, year: 2024 })
      .expect(201);
    const payments = (
      await request(app).get(`/api/payments?tenancyId=${previous.id}&year=2024`).expect(200)
    ).body;
    const august = payments.find((payment: { dueDate: string }) =>
      payment.dueDate.startsWith('2024-08'),
    );
    await request(app)
      .put(`/api/payments/${august.id}`)
      .send({
        tenancyId: previous.id,
        dueDate: august.dueDate,
        paidDate: august.dueDate,
        baseRentDue: 700,
        utilityDue: 150,
        garageDue: 0,
        amountPaid: 850,
        baseRentPaid: 700,
        utilityPaid: 150,
        garagePaid: 0,
        note: '',
        revision: august.revision,
      })
      .expect(200);

    await request(app)
      .post('/api/changeovers')
      .send({
        previousTenancyId: previous.id,
        previousRevision: previous.revision,
        endDate: '2024-07-31',
        nextTenancy: {
          tenantName: 'Mieter B',
          tenantAddress: '',
          startDate: '2024-08-01',
          endDate: null,
          persons: 1,
          baseRent: 700,
          utilityPrepayment: 150,
          garagePrepayment: 0,
          paymentDay: 3,
          notes: '',
        },
        readings: [],
      })
      .expect(409);
    expect(
      (await request(app).get(`/api/tenancies/${previous.id}`).expect(200)).body,
    ).toMatchObject({ endDate: null, revision: 0 });
    expect(
      (await request(app).get(`/api/payments?tenancyId=${previous.id}&year=2024`).expect(200)).body,
    ).toHaveLength(12);
  });

  test('Monatsbuchungen müssen innerhalb des Mietzeitraums liegen', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app)
        .post('/api/tenancies')
        .send(tenancyInput(unit.id, { endDate: '2024-07-31' }))
        .expect(201)
    ).body;
    const invalid = await request(app)
      .post('/api/payments')
      .send({
        tenancyId: tenancy.id,
        dueDate: '2024-08-03',
        paidDate: null,
        baseRentDue: 700,
        utilityDue: 150,
        garageDue: 0,
        amountPaid: 0,
        note: '',
      })
      .expect(400);
    expect(invalid.body.error).toContain('innerhalb');
  });

  test('Dashboard aggregiert Kosten und Mietzahlungen eines Objekts', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    await request(app)
      .post('/api/costs')
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Hausgeld',
        descriptionTenant: 'Betriebskosten',
        sourceAmount: 1300,
        tenantStatus: 'included',
        allocableAmount: 1169.7,
        statementGroup: 'Wohnung',
        allocationMode: 'standard',
        allocationKey: 'direct',
        directUnitId: unit.id,
        directTenancyId: null,
        meterType: null,
        labor35a: 50.25,
        notes: '',
      })
      .expect(201);
    const payment = await request(app)
      .post('/api/payments')
      .send({
        tenancyId: tenancy.id,
        dueDate: '2024-01-03',
        paidDate: '2024-01-03',
        baseRentDue: 700,
        utilityDue: 150,
        garageDue: 0,
        amountPaid: 850,
        note: '',
      })
      .expect(201);
    expect(payment.body).toMatchObject({ baseRentPaid: 700, utilityPaid: 150, garagePaid: 0 });
    const dashboard = await request(app)
      .get(`/api/dashboard?propertyId=${property.id}&year=2024`)
      .expect(200);
    expect(dashboard.body.counts).toMatchObject({
      units: 1,
      tenancies: 1,
      costs: 1,
      pendingCosts: 0,
    });
    expect(dashboard.body.amounts).toMatchObject({
      sourceCosts: 1300,
      allocableCosts: 1169.7,
      labor35a: 50.25,
      totalDue: 850,
      paid: 850,
      outstanding: 0,
    });
  });

  test('Settlement-Preview liefert Euro und Close speichert unveränderlichen Snapshot', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    const cost = (
      await request(app)
        .post('/api/costs')
        .send({
          propertyId: property.id,
          year: 2024,
          descriptionInternal: 'Betriebskosten',
          descriptionTenant: 'Betriebskosten',
          sourceAmount: 1800,
          tenantStatus: 'included',
          allocableAmount: 1800,
          statementGroup: 'Wohnung',
          allocationMode: 'fixedTenancy',
          allocationKey: 'direct',
          directUnitId: null,
          directTenancyId: tenancy.id,
          meterType: null,
          labor35a: 0,
          notes: '',
        })
        .expect(201)
    ).body;
    const input = { propertyId: property.id, tenancyId: tenancy.id, year: 2024 };
    const preview = await request(app).post('/api/settlements/preview').send(input).expect(200);
    expect(preview.body).toMatchObject({
      tenancyId: tenancy.id,
      totalTenantShare: 1800,
      totalPrepayments: 0,
      utilityPrepayments: 0,
      garagePrepayments: 0,
      balance: 1800,
      canClose: true,
      closed: false,
    });
    expect(preview.body.warnings).toContain(
      'Im Mietkonto sind für „Mieter A“ keine Zahlungen erfasst; Vorauszahlungen werden mit 0,00 € berücksichtigt.',
    );
    const closed = await request(app).post('/api/settlements/close').send(input).expect(201);
    expect(closed.body).toMatchObject({
      tenancyId: tenancy.id,
      totalTenantShare: 1800,
      closed: true,
    });
    expect(closed.body.snapshotId).toBeTypeOf('number');
    await request(app)
      .put(`/api/properties/${property.id}`)
      .send({
        ...propertyInput,
        name: 'Später geändert',
        revision: 0,
      })
      .expect(200);
    await request(app)
      .put(`/api/costs/${cost.id}`)
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Geändert',
        descriptionTenant: 'Geändert',
        sourceAmount: 999,
        tenantStatus: 'included',
        allocableAmount: 999,
        statementGroup: 'Wohnung',
        allocationMode: 'fixedTenancy',
        allocationKey: 'direct',
        directUnitId: null,
        directTenancyId: tenancy.id,
        meterType: null,
        labor35a: 0,
        notes: '',
        revision: 0,
      })
      .expect(200);
    const frozenPreview = await request(app)
      .post('/api/settlements/preview')
      .send({ ...input, roundingDifference: 9 })
      .expect(200);
    expect(frozenPreview.body).toEqual(closed.body);
    const duplicate = await request(app).post('/api/settlements/close').send(input).expect(200);
    expect(duplicate.body).toEqual(closed.body);
    const fetched = await request(app)
      .get(`/api/settlements/${closed.body.snapshotId}?propertyId=${property.id}`)
      .expect(200);
    expect(fetched.body).toEqual(closed.body);
    await request(app)
      .get(`/api/settlements/${closed.body.snapshotId}?propertyId=${property.id + 999}`)
      .expect(404);
  });

  test('offene Prüfpositionen erlauben Preview, blockieren aber Close', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    await request(app)
      .post('/api/costs')
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Hausmeister',
        descriptionTenant: 'Hausmeister',
        sourceAmount: 100,
        tenantStatus: 'pending',
        allocableAmount: 100,
        statementGroup: 'Wohnung',
        allocationMode: 'standard',
        allocationKey: 'area',
        directUnitId: null,
        directTenancyId: null,
        meterType: null,
        labor35a: 0,
        notes: '',
      })
      .expect(201);
    const input = { propertyId: property.id, tenancyId: tenancy.id, year: 2024 };
    const preview = await request(app).post('/api/settlements/preview').send(input).expect(200);
    expect(preview.body).toMatchObject({ canClose: false, closed: false });
    const closed = await request(app).post('/api/settlements/close').send(input).expect(409);
    expect(closed.body.details.blockingReasons.length).toBeGreaterThan(0);
  });

  test('fehlende Zahlungen eines anderen Mieters erscheinen nicht in der gewählten Abrechnung', async () => {
    const property = await createProperty();
    const selectedUnit = await createUnit(property.id, 'EG');
    const otherUnit = await createUnit(property.id, 'OG');
    const selectedTenancy = (
      await request(app)
        .post('/api/tenancies')
        .send(tenancyInput(selectedUnit.id, { tenantName: 'Ausgewählter Mieter' }))
        .expect(201)
    ).body;
    await request(app)
      .post('/api/tenancies')
      .send(tenancyInput(otherUnit.id, { tenantName: 'Anderer Mieter', endDate: '2024-06-30' }))
      .expect(201);
    await request(app)
      .post('/api/costs')
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Grundsteuer',
        descriptionTenant: 'Grundsteuer',
        sourceAmount: 62,
        tenantStatus: 'included',
        allocableAmount: 62,
        statementGroup: 'Grundsteuer',
        allocationMode: 'fixedTenancy',
        allocationKey: 'direct',
        directUnitId: null,
        directTenancyId: selectedTenancy.id,
        meterType: null,
        labor35a: 0,
        notes: '',
      })
      .expect(201);

    const selectedMeter = (
      await request(app)
        .post('/api/meters')
        .send({
          unitId: selectedUnit.id,
          name: 'Wasser EG',
          meterNumber: 'EG-1',
          type: 'coldWater',
          unitLabel: 'm³',
        })
        .expect(201)
    ).body;
    const otherMeter = (
      await request(app)
        .post('/api/meters')
        .send({
          unitId: otherUnit.id,
          name: 'Wasser OG',
          meterNumber: 'OG-1',
          type: 'coldWater',
          unitLabel: 'm³',
        })
        .expect(201)
    ).body;
    for (const meter of [selectedMeter, otherMeter]) {
      await request(app)
        .post('/api/readings')
        .send({
          meterId: meter.id,
          date: '2024-01-01',
          value: 0,
          note: '',
        })
        .expect(201);
      await request(app)
        .post('/api/readings')
        .send({
          meterId: meter.id,
          date: '2024-12-31',
          value: 100,
          note: '',
        })
        .expect(201);
    }
    await request(app)
      .post('/api/costs')
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Interne Wasserrechnung',
        descriptionTenant: 'Kaltwasser',
        sourceAmount: 200,
        tenantStatus: 'included',
        allocableAmount: 200,
        statementGroup: 'Wohnung',
        allocationMode: 'standard',
        allocationKey: 'meter',
        directUnitId: null,
        directTenancyId: null,
        meterType: 'coldWater',
        labor35a: 0,
        notes: '',
      })
      .expect(201);
    await request(app)
      .post('/api/costs')
      .send({
        propertyId: property.id,
        year: 2024,
        descriptionInternal: 'Interner Heizkostenbeleg',
        descriptionTenant: 'Heizkosten',
        sourceAmount: 50,
        tenantStatus: 'included',
        allocableAmount: 50,
        statementGroup: 'Wohnung',
        allocationMode: 'standard',
        allocationKey: 'meter',
        directUnitId: null,
        directTenancyId: null,
        meterType: 'heating',
        labor35a: 0,
        notes: '',
      })
      .expect(201);

    const preview = await request(app)
      .post('/api/settlements/preview')
      .send({
        propertyId: property.id,
        tenancyId: selectedTenancy.id,
        year: 2024,
      })
      .expect(200);
    expect(preview.body.warnings.join('\n')).toContain('Ausgewählter Mieter');
    expect(preview.body.warnings.join('\n')).not.toContain('Anderer Mieter');
    expect(preview.body.warnings.join('\n')).not.toContain('Interne Wasserrechnung');
    expect(preview.body.warnings.join('\n')).toContain('„Heizkosten“');
    expect(preview.body.warnings.join('\n')).not.toContain('Interner Heizkostenbeleg');
  });

  test('Ist-Zahlungen überschreiben Vertragswerte gruppiert, auch teilweise und mit null Euro', async () => {
    const property = await createProperty();
    const scenarios = [
      {
        name: 'Voll',
        amountPaid: 875,
        baseRentPaid: 700,
        utilityPaid: 150,
        garagePaid: 25,
        expected: [175, 150, 25],
      },
      {
        name: 'Teil',
        amountPaid: 800,
        baseRentPaid: 700,
        utilityPaid: 100,
        garagePaid: 0,
        expected: [100, 100, 0],
      },
      { name: 'Null', amountPaid: 0, expected: [0, 0, 0] },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const unit = await createUnit(property.id, scenario.name);
      const tenancy = (
        await request(app)
          .post('/api/tenancies')
          .send(
            tenancyInput(unit.id, {
              tenantName: scenario.name,
              garagePrepayment: 25,
            }),
          )
          .expect(201)
      ).body;
      const payment = await request(app)
        .post('/api/payments')
        .send({
          tenancyId: tenancy.id,
          dueDate: `2024-0${index + 1}-03`,
          paidDate: `2024-0${index + 1}-03`,
          baseRentDue: 700,
          utilityDue: 150,
          garageDue: 25,
          amountPaid: scenario.amountPaid,
          ...(scenario.baseRentPaid === undefined
            ? {}
            : {
                baseRentPaid: scenario.baseRentPaid,
                utilityPaid: scenario.utilityPaid,
                garagePaid: scenario.garagePaid,
              }),
          note: '',
        })
        .expect(201);
      expect(payment.body.baseRentPaid + payment.body.utilityPaid + payment.body.garagePaid).toBe(
        scenario.amountPaid,
      );
      const preview = await request(app)
        .post('/api/settlements/preview')
        .send({
          propertyId: property.id,
          tenancyId: tenancy.id,
          year: 2024,
        })
        .expect(200);
      expect([
        preview.body.totalPrepayments,
        preview.body.utilityPrepayments,
        preview.body.garagePrepayments,
      ]).toEqual(scenario.expected);
    }
    await request(app)
      .post('/api/payments')
      .send({
        tenancyId: 1,
        dueDate: '2024-12-03',
        paidDate: '2024-12-03',
        baseRentDue: 700,
        utilityDue: 150,
        garageDue: 0,
        amountPaid: 850,
        baseRentPaid: 700,
        utilityPaid: 100,
        garagePaid: 0,
        note: '',
      })
      .expect(400);
  });

  test('sichtbare Rundungsdifferenz von einem Cent erzeugt exakt 119,70 Euro Nachzahlung', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    const billedCosts = [
      { description: 'Wohnung', statementGroup: 'Wohnung', amount: 1102.7 },
      { description: 'Garage', statementGroup: 'Garage', amount: 4.99 },
      { description: 'Grundsteuer', statementGroup: 'Grundsteuer', amount: 62 },
    ];
    for (const cost of billedCosts) {
      await request(app)
        .post('/api/costs')
        .send({
          propertyId: property.id,
          year: 2024,
          descriptionInternal: cost.description,
          descriptionTenant: cost.description,
          sourceAmount: cost.amount,
          tenantStatus: 'included',
          allocableAmount: cost.amount,
          statementGroup: cost.statementGroup,
          allocationMode: 'fixedTenancy',
          allocationKey: 'direct',
          directUnitId: null,
          directTenancyId: tenancy.id,
          meterType: null,
          labor35a: 0,
          notes: '',
        })
        .expect(201);
    }
    for (let month = 1; month <= 7; month += 1) {
      const dueDate = `2024-${String(month).padStart(2, '0')}-03`;
      await request(app)
        .post('/api/payments')
        .send({
          tenancyId: tenancy.id,
          dueDate,
          paidDate: dueDate,
          baseRentDue: 700,
          utilityDue: 150,
          garageDue: 0,
          amountPaid: 850,
          baseRentPaid: 700,
          utilityPaid: 150,
          garagePaid: 0,
          note: '',
        })
        .expect(201);
    }
    const preview = await request(app)
      .post('/api/settlements/preview')
      .send({
        propertyId: property.id,
        tenancyId: tenancy.id,
        year: 2024,
        roundingDifference: 0.01,
        roundingGroup: 'Wohnung',
      })
      .expect(200);
    expect(preview.body).toMatchObject({
      totalTenantShare: 1169.7,
      totalPrepayments: 1050,
      utilityPrepayments: 1050,
      garagePrepayments: 0,
      balance: 119.7,
      roundingDifference: 0.01,
    });
    expect(
      preview.body.rows
        .filter((row: { isRoundingDifference: boolean }) => !row.isRoundingDifference)
        .map((row: { statementGroup: string; tenantShare: number }) => [
          row.statementGroup,
          row.tenantShare,
        ]),
    ).toEqual([
      ['Wohnung', 1102.7],
      ['Garage', 4.99],
      ['Grundsteuer', 62],
    ]);
    expect(preview.body.rows.at(-1)).toMatchObject({
      statementGroup: 'Wohnung',
      tenantShare: 0.01,
      isRoundingDifference: true,
    });
  });

  test('Objekte bleiben in Berechnung und effektiven Absenderdaten strikt getrennt', async () => {
    await request(app)
      .put('/api/settings')
      .send({
        landlordName: 'Global',
        landlordAddress: 'Globalweg',
        bankAccountHolder: 'Global',
        bankIban: 'DEGLOBAL',
        paymentDeadlineDays: 30,
        revision: 0,
      })
      .expect(200);
    const first = await createProperty();
    const second = (
      await request(app)
        .post('/api/properties')
        .send({
          ...propertyInput,
          name: 'Haus B',
          address: 'B-Weg',
          landlordName: 'Objektvermieter',
        })
        .expect(201)
    ).body;
    const cases = [
      { property: first, name: 'A', amount: 100, landlord: 'Global' },
      { property: second, name: 'B', amount: 200, landlord: 'Objektvermieter' },
    ];
    for (const item of cases) {
      const unit = await createUnit(item.property.id, item.name);
      const tenancy = (
        await request(app)
          .post('/api/tenancies')
          .send(tenancyInput(unit.id, { tenantName: item.name }))
          .expect(201)
      ).body;
      await request(app)
        .post('/api/costs')
        .send({
          propertyId: item.property.id,
          year: 2024,
          descriptionInternal: item.name,
          descriptionTenant: item.name,
          sourceAmount: item.amount,
          tenantStatus: 'included',
          allocableAmount: item.amount,
          statementGroup: 'Wohnung',
          allocationMode: 'fixedTenancy',
          allocationKey: 'direct',
          directUnitId: null,
          directTenancyId: tenancy.id,
          meterType: null,
          labor35a: 0,
          notes: '',
        })
        .expect(201);
      const preview = await request(app)
        .post('/api/settlements/preview')
        .send({
          propertyId: item.property.id,
          tenancyId: tenancy.id,
          year: 2024,
        })
        .expect(200);
      expect(preview.body).toMatchObject({
        propertyId: item.property.id,
        propertyName: item.property.id === first.id ? 'Haus A' : 'Haus B',
        landlordName: item.landlord,
        totalTenantShare: item.amount,
      });
    }
  });

  test('Jahressoll wird transaktional und idempotent für aktive Mietverhältnisse erzeugt', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    await request(app)
      .post('/api/tenancies')
      .send(tenancyInput(unit.id, { endDate: '2024-07-31' }))
      .expect(201);
    await request(app)
      .post('/api/tenancies')
      .send(
        tenancyInput(unit.id, {
          tenantName: 'Mieter B',
          startDate: '2024-08-01',
          endDate: null,
        }),
      )
      .expect(201);
    const partialUnit = await createUnit(property.id, 'Nur Februar');
    const partialTenancy = (
      await request(app)
        .post('/api/tenancies')
        .send(
          tenancyInput(partialUnit.id, {
            tenantName: 'Mieter C',
            startDate: '2024-02-15',
            endDate: '2024-02-20',
          }),
        )
        .expect(201)
    ).body;
    db.exec(`
      CREATE TRIGGER test_generation_failure BEFORE INSERT ON payments
      WHEN NEW.due_date = '2024-06-03'
      BEGIN SELECT RAISE(ABORT, 'TEST_GENERATION_FAILURE'); END;
    `);
    await request(app)
      .post('/api/payments/generate-year')
      .send({ propertyId: property.id, year: 2024 })
      .expect(409);
    expect((await request(app).get('/api/payments?year=2024').expect(200)).body).toHaveLength(0);
    db.exec('DROP TRIGGER test_generation_failure');
    const generated = await request(app)
      .post('/api/payments/generate-year')
      .send({ propertyId: property.id, year: 2024 })
      .expect(201);
    expect(generated.body.created).toBe(13);
    const payments = (await request(app).get('/api/payments?year=2024').expect(200)).body;
    expect(payments).toHaveLength(13);
    expect(
      payments.find((payment: { tenancyId: number }) => payment.tenancyId === partialTenancy.id),
    ).toMatchObject({
      dueDate: '2024-02-15',
      amountPaid: 0,
      baseRentPaid: 0,
      utilityPaid: 0,
      garagePaid: 0,
    });
    expect(
      (
        await request(app)
          .post('/api/payments/generate-year')
          .send({ propertyId: property.id, year: 2024 })
          .expect(201)
      ).body.created,
    ).toBe(0);
  });

  test('Jahressoll erkennt eine vorhandene Buchung im selben Monat auch bei anderem Fälligkeitstag', async () => {
    const property = await createProperty();
    const unit = await createUnit(property.id);
    const tenancy = (
      await request(app).post('/api/tenancies').send(tenancyInput(unit.id)).expect(201)
    ).body;
    await request(app)
      .post('/api/payments')
      .send({
        tenancyId: tenancy.id,
        dueDate: '2024-01-05',
        paidDate: null,
        baseRentDue: 700,
        utilityDue: 150,
        garageDue: 0,
        amountPaid: 0,
        baseRentPaid: 0,
        utilityPaid: 0,
        garagePaid: 0,
        note: 'Manuell angelegt',
      })
      .expect(201);

    const generated = await request(app)
      .post('/api/payments/generate-year')
      .send({ propertyId: property.id, year: 2024 })
      .expect(201);
    expect(generated.body.created).toBe(11);
    expect(
      (await request(app).get(`/api/payments?tenancyId=${tenancy.id}&year=2024`).expect(200)).body,
    ).toHaveLength(12);
  });

  test('Same-Origin-Schutz weist fremde Schreibzugriffe ab', async () => {
    await request(app)
      .post('/api/properties')
      .set('Origin', 'https://angreifer.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .send(propertyInput)
      .expect(403);
    await request(app)
      .post('/api/properties')
      .set('Origin', 'http://127.0.0.1')
      .set('Host', '127.0.0.1')
      .send(propertyInput)
      .expect(201);
    const health = await request(app).get('/api/health').expect(200);
    expect(health.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    });
    expect(health.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
