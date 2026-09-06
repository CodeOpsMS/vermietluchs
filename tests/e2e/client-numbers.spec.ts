import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-07T08:00:00Z'));
  const property = { id: 1, revision: 0, name: 'Testhaus', address: '' };
  const unit = {
    id: 1,
    revision: 0,
    propertyId: 1,
    name: 'Testwohnung',
    floor: '',
    areaSqm: 50.5,
    unitWeight: 1.5,
  };
  let tenancy = {
    id: 1,
    revision: 0,
    unitId: 1,
    tenantName: 'Testmieter',
    tenantAddress: '',
    startDate: '2024-01-01',
    endDate: null,
    persons: 1.5,
    baseRent: 700,
    utilityPrepayment: 100,
    garagePrepayment: 0,
    paymentDay: 3,
    notes: '',
  };
  const payments = [0.3, 0.29, 0].map((amountPaid, index) => ({
    id: index + 1,
    revision: 0,
    tenancyId: 1,
    dueDate: `2024-0${index + 1}-03`,
    paidDate: amountPaid ? `2024-0${index + 1}-03` : null,
    baseRentDue: 0.1,
    utilityDue: 0.2,
    garageDue: 0,
    amountPaid,
    baseRentPaid: amountPaid ? 0.1 : 0,
    utilityPaid: amountPaid ? Math.round((amountPaid - 0.1) * 100) / 100 : 0,
    garagePaid: 0,
    note: '',
  }));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tenancies/1' && route.request().method() === 'PUT') {
      tenancy = { ...tenancy, ...route.request().postDataJSON(), revision: tenancy.revision + 1 };
      await route.fulfill({ json: tenancy });
    } else if (path === '/api/changeovers') {
      await route.fulfill({ status: 201, json: { deletedFuturePayments: 0 } });
    } else {
      const data: Record<string, unknown> = {
        '/api/properties': [property],
        '/api/units': [unit],
        '/api/tenancies': [tenancy],
        '/api/payments': payments,
      };
      await route.fulfill({ json: data[path] ?? [] });
    }
  });
  await page.goto('/');
  await expect(page.getByLabel('Haus auswählen', { exact: true })).toHaveValue('1');
});

test('vollständige Zahlung wird trotz Gleitkommasumme als bezahlt angezeigt', async ({ page }) => {
  await page.getByLabel('Abrechnungsjahr auswählen', { exact: true }).selectOption('2024');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Mietkonto', exact: true })
    .click();
  await expect(page.locator('.ledger-table tbody .status')).toHaveText([
    'bezahlt',
    'teilweise',
    'offen',
  ]);
});

test('Einheitengewicht wird mit deutschem Dezimalkomma angezeigt', async ({ page }) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Stammdaten', exact: true })
    .click();
  await expect(page.locator('.unit-facts')).toContainText('1,5 Einheitengewicht');
});

test('gebrochene Personenzahl bleibt beim Bearbeiten sichtbar und speicherbar', async ({
  page,
}) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Stammdaten', exact: true })
    .click();
  await page.getByText('Mietverlauf (1)', { exact: true }).click();
  await page
    .locator('.history-list')
    .getByRole('button', { name: 'Bearbeiten', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Mietverhältnis bearbeiten' });
  await expect(dialog.getByLabel('Personen', { exact: true })).toHaveValue('1,5');
  await dialog.getByLabel('Personen', { exact: true }).fill('0,5');
  const saved = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/api/tenancies/1'),
  );
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  expect((await saved).postDataJSON().persons).toBe(0.5);
  await expect(dialog).not.toBeVisible();
});

test('Mieterwechsel akzeptiert deutsche Personenzahlen und weist negative Werte zurück', async ({
  page,
}) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Stammdaten', exact: true })
    .click();
  await page.getByText('Mietverlauf (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Mieterwechsel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mieterwechsel · Testwohnung' });
  await dialog.getByLabel('Letzter Miettag', { exact: true }).fill('30.09.2026');
  await dialog.getByLabel('Name Nachmieter', { exact: true }).fill('Nachmieter');
  await dialog.getByLabel('Kaltmiete', { exact: true }).fill('700');
  await dialog.getByLabel('NK-Vorauszahlung', { exact: true }).fill('100');
  await dialog.getByLabel('Personen', { exact: true }).fill('-0,5');
  await dialog.getByRole('button', { name: 'Mieterwechsel speichern', exact: true }).click();
  await expect(dialog.locator('.field-error')).toContainText('positive Personenzahl');
  await dialog.getByLabel('Personen', { exact: true }).fill('1,5');
  const saved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/changeovers'),
  );
  await dialog.getByRole('button', { name: 'Mieterwechsel speichern', exact: true }).click();
  expect((await saved).postDataJSON().nextTenancy.persons).toBe(1.5);
  await expect(dialog).not.toBeVisible();
});
