import assert from 'node:assert/strict';

type Mode = 'empty' | 'example';
type Created = { id: number; revision: number };
type Backup = {
  schemaVersion: number;
  app: string;
  tables: Record<string, unknown[]>;
};

const mode = process.argv[2] as Mode | undefined;
const baseUrl = process.argv[3]?.replace(/\/$/, '');

if ((mode !== 'empty' && mode !== 'example') || !baseUrl) {
  throw new Error('Aufruf: container-image-smoke.ts <empty|example> <base-url>');
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  });
  const body = await response.text();
  assert.equal(response.ok, true, `${init?.method ?? 'GET'} ${path}: ${response.status} ${body}`);
  return JSON.parse(body) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return json<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

const domainTables = [
  'properties',
  'units',
  'tenancies',
  'costs',
  'meters',
  'readings',
  'payments',
  'settlement_snapshots',
] as const;

async function readBackup(): Promise<Backup> {
  const backup = await json<Backup>('/api/backup/export');
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.app, 'Vermietluchs');
  assert.equal(backup.tables.app_settings.length, 1);
  assert.equal(
    backup.tables.ai_settings,
    undefined,
    'KI-Konfiguration darf nicht im Backup liegen',
  );
  return backup;
}

async function assertAiDisabledByDefault(): Promise<void> {
  const settings = await json<{
    enabled: boolean;
    provider: string;
    apiKeyConfigured: boolean;
  }>('/api/ai/settings');
  assert.deepEqual(
    {
      enabled: settings.enabled,
      provider: settings.provider,
      apiKeyConfigured: settings.apiKeyConfigured,
    },
    { enabled: false, provider: 'ollama', apiKeyConfigured: false },
  );
}

async function assertEmptyDatabase(): Promise<void> {
  const backup = await readBackup();
  for (const table of domainTables) {
    assert.deepEqual(
      backup.tables[table],
      [],
      `${table} ist in einem frischen Container nicht leer`,
    );
  }
}

async function seedExampleData(): Promise<void> {
  const property = await post<Created>('/api/properties', {
    name: 'Beispielhaus',
    address: 'Musterstraße 10, 12345 Musterstadt',
    landlordName: null,
    landlordAddress: null,
    bankAccountHolder: null,
    bankIban: null,
    paymentDeadlineDays: null,
  });
  const unit = await post<Created>('/api/units', {
    propertyId: property.id,
    name: 'Wohnung 1',
    floor: '1. OG',
    areaSqm: 50,
    unitWeight: 1,
    notes: '',
  });
  const tenancy = await post<Created>('/api/tenancies', {
    unitId: unit.id,
    tenantName: 'Beispielmieter',
    tenantAddress: 'Beispielweg 1, 12345 Musterstadt',
    startDate: '2023-01-01',
    endDate: null,
    persons: 1,
    baseRent: 700,
    utilityPrepayment: 150,
    garagePrepayment: 0,
    paymentDay: 3,
    notes: '',
  });
  await post<Created>('/api/costs', {
    propertyId: property.id,
    year: 2023,
    descriptionInternal: 'Grundsteuer 2023',
    descriptionTenant: 'Grundsteuer',
    sourceAmount: 1200,
    tenantStatus: 'included',
    allocableAmount: 1200,
    statementGroup: 'Grundsteuer',
    allocationMode: 'standard',
    allocationKey: 'area',
    directUnitId: null,
    directTenancyId: null,
    meterType: null,
    labor35a: 0,
    notes: '',
  });
  await post<Created>('/api/payments', {
    tenancyId: tenancy.id,
    dueDate: '2023-01-03',
    paidDate: '2023-01-03',
    baseRentDue: 700,
    utilityDue: 150,
    garageDue: 0,
    amountPaid: 850,
    baseRentPaid: 700,
    utilityPaid: 150,
    garagePaid: 0,
    note: '',
  });
  const meter = await post<Created>('/api/meters', {
    unitId: unit.id,
    name: 'Kaltwasser Bad',
    meterNumber: 'KW-100',
    type: 'coldWater',
    unitLabel: 'm³',
  });
  await post<Created>('/api/readings', {
    meterId: meter.id,
    date: '2022-12-31',
    value: 100,
    note: 'Jahresanfang',
  });
  await post<Created>('/api/readings', {
    meterId: meter.id,
    date: '2023-12-31',
    value: 170,
    note: 'Jahresende',
  });

  const dashboard = await json<{ year: number; property: { id: number } }>(
    `/api/dashboard?propertyId=${property.id}&year=2023`,
  );
  assert.equal(dashboard.year, 2023);
  assert.equal(dashboard.property.id, property.id);
}

async function assertExampleDatabase(): Promise<void> {
  const backup = await readBackup();
  const expectedCounts: Record<(typeof domainTables)[number], number> = {
    properties: 1,
    units: 1,
    tenancies: 1,
    costs: 1,
    meters: 1,
    readings: 2,
    payments: 1,
    settlement_snapshots: 0,
  };
  for (const table of domainTables) {
    assert.equal(backup.tables[table].length, expectedCounts[table], `${table} hat falsche Anzahl`);
  }

  const costs = await json<Array<{ year: number }>>('/api/costs?propertyId=1&year=2023');
  assert.equal(costs.length, 1);
  assert.equal(costs[0]?.year, 2023);
}

const health = await json<{ ok: boolean; database: string[]; schemaVersion: number }>(
  '/api/health',
);
assert.deepEqual(health, { ok: true, database: ['ok'], schemaVersion: 2 });

await assertAiDisabledByDefault();
await assertEmptyDatabase();
if (mode === 'example') {
  await seedExampleData();
  await assertExampleDatabase();
}

console.log(
  mode === 'empty'
    ? 'Leerer Container enthält keine fachlichen Daten.'
    : 'Container verarbeitet die reproduzierbaren Beispieldaten für 2023.',
);
