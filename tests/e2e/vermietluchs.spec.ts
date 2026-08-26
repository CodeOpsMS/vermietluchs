import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

type Created = { id: number; revision: number };

async function sendJson<T>(
  request: APIRequestContext,
  method: 'post' | 'put',
  path: string,
  body: unknown,
): Promise<T> {
  const response = await request[method](path, { data: body });
  const text = await response.text();
  expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${text}`).toBe(true);
  return JSON.parse(text) as T;
}

async function seedApplication(request: APIRequestContext) {
  await sendJson(request, 'put', '/api/settings', {
    landlordName: 'Manfred Lämmerzahl',
    landlordAddress: 'Fridtjof-Nansen-Straße 10, 44225 Dortmund',
    bankAccountHolder: 'Manfred Lämmerzahl',
    bankIban: 'DE00123456789012345678',
    paymentDeadlineDays: 10,
    revision: 0,
  });

  const property = await sendJson<Created>(request, 'post', '/api/properties', {
    name: 'Demohaus',
    address: 'Musterstraße 10, 12345 Musterstadt',
    landlordName: null,
    landlordAddress: null,
    bankAccountHolder: null,
    bankIban: null,
    paymentDeadlineDays: null,
  });
  const unit = await sendJson<Created>(request, 'post', '/api/units', {
    propertyId: property.id,
    name: 'Wohnung 1',
    floor: '1. OG',
    areaSqm: 47.46,
    unitWeight: 1,
    notes: '',
  });
  const tenancy = await sendJson<Created>(request, 'post', '/api/tenancies', {
    unitId: unit.id,
    tenantName: 'Demo Mieter Januar–Juli',
    tenantAddress: 'Alte Adresse 1, 12345 Musterstadt',
    startDate: '2024-01-01',
    endDate: '2024-07-31',
    persons: 1,
    baseRent: 700,
    utilityPrepayment: 150,
    garagePrepayment: 0,
    paymentDay: 3,
    notes: '',
  });

  const costs = [
    { description: 'Wohnung', group: 'Wohnung', amount: 1102.7 },
    { description: 'Garage', group: 'Garage', amount: 4.99 },
    { description: 'Grundsteuer', group: 'Grundsteuer', amount: 62 },
  ];
  for (const cost of costs) {
    await sendJson(request, 'post', '/api/costs', {
      propertyId: property.id,
      year: 2024,
      descriptionInternal: cost.description,
      descriptionTenant: cost.description,
      sourceAmount: cost.amount,
      tenantStatus: 'included',
      allocableAmount: cost.amount,
      statementGroup: cost.group,
      allocationMode: 'fixedTenancy',
      allocationKey: 'direct',
      directUnitId: null,
      directTenancyId: tenancy.id,
      meterType: null,
      labor35a: 0,
      notes: '',
    });
  }

  for (let month = 1; month <= 7; month += 1) {
    const dueDate = `2024-${String(month).padStart(2, '0')}-03`;
    await sendJson(request, 'post', '/api/payments', {
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
    });
  }

  const meter = await sendJson<Created>(request, 'post', '/api/meters', {
    unitId: unit.id,
    name: 'Kaltwasser Bad',
    meterNumber: 'KW-100',
    type: 'coldWater',
    unitLabel: 'm³',
  });
  await sendJson(request, 'post', '/api/readings', {
    meterId: meter.id,
    date: '2023-12-31',
    value: 100,
    note: 'Jahresanfang',
  });
  await sendJson(request, 'post', '/api/readings', {
    meterId: meter.id,
    date: '2024-07-31',
    value: 170,
    note: 'Auszug',
  });

  return { property, unit, tenancy, meter };
}

function metric(page: Page, label: string): Locator {
  return page.locator('.metric').filter({ hasText: label }).first();
}

async function navigate(page: Page, label: string, heading: string | RegExp): Promise<void> {
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  const button = navigation.getByRole('button', { name: label, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

async function acceptDialogAfter(page: Page, action: () => Promise<void>): Promise<void> {
  const handled = page.waitForEvent('dialog').then((dialog) => dialog.accept());
  await action();
  await handled;
}

async function dismissDialogAfter(page: Page, action: () => Promise<void>): Promise<void> {
  const handled = page.waitForEvent('dialog').then((dialog) => dialog.dismiss());
  await action();
  await handled;
}

test.describe.serial('Vermietluchs-Oberfläche', () => {
  test('bedient Buttons und zeigt die centgenauen Zahlen', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-26T08:00:00.000Z'));
    await seedApplication(page.request);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Reflect.set(globalThis, '__vermietluchsPrintCalled', false);
      Reflect.set(globalThis, 'print', () => {
        Reflect.set(globalThis, '__vermietluchsPrintCalled', true);
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Cockpit/ })).toBeVisible();
    await expect(page.getByLabel('Haus auswählen')).toHaveValue('1');
    await page.getByLabel('Abrechnungsjahr auswählen').selectOption('2024');
    await expect(page.getByRole('heading', { level: 1, name: 'Cockpit 2024' })).toBeVisible();

    const themeSwitch = page.getByRole('switch', { name: 'Nachtmodus' });
    await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
    await themeSwitch.click();
    await expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Nachtmodus' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('switch', { name: 'Nachtmodus' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByLabel('Abrechnungsjahr auswählen').selectOption('2024');
    await expect(page.getByRole('heading', { level: 1, name: 'Cockpit 2024' })).toBeVisible();

    await expect(metric(page, 'Umlagefähig extern')).toContainText(/1\.169,69\s*€/);
    await expect(metric(page, 'Kosten intern')).toContainText(/1\.169,69\s*€/);
    await expect(metric(page, 'Mietverhältnisse')).toContainText('1');
    await expect(metric(page, 'Kontosaldo')).toContainText(/0,00\s*€/);
    await page
      .getByRole('button', { name: /Kosten prüfen/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kosten 2024' })).toBeVisible();
    await page.locator('.brand').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cockpit 2024' })).toBeVisible();

    await navigate(page, 'Einstellungen', 'Einstellungen & Backup');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Manfred Lämmerzahl');
    await page.getByRole('button', { name: 'Einstellungen speichern', exact: true }).click();
    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON-Backup herunterladen', exact: true }).click();
    await expect((await downloadPromise).suggestedFilename()).toMatch(
      /^vermietluchs-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Backup einspielen', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([]);

    await navigate(page, 'Stammdaten', 'Häuser & Wohnungen');
    await page.getByRole('button', { name: '+ Haus anlegen', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Haus anlegen' });
    await expect(dialog.getByLabel('Bezeichnung')).toBeFocused();
    await dialog.getByLabel('Bezeichnung').fill('E2E Testhaus');
    await dialog.getByLabel('Anschrift', { exact: true }).fill('Testweg 1, 12345 Teststadt');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      page.locator('.property-strip').getByText('E2E Testhaus', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Haus E2E Testhaus bearbeiten', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Haus bearbeiten' });
    await dialog.getByLabel('Bezeichnung').fill('E2E Testhaus geändert');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    const propertySelect = page.getByLabel('Haus auswählen');
    await propertySelect.selectOption({ label: 'E2E Testhaus geändert' });
    await expect(propertySelect.locator('option:checked')).toHaveText('E2E Testhaus geändert');
    await page.getByLabel('Haus auswählen').selectOption({ label: 'Demohaus' });
    const deleteTestProperty = page.getByRole('button', {
      name: /Haus „E2E Testhaus geändert“.*löschen/,
    });
    await dismissDialogAfter(page, () => deleteTestProperty.click());
    await expect(page.locator('.property-strip').getByText('E2E Testhaus geändert')).toBeVisible();
    await acceptDialogAfter(page, () => deleteTestProperty.click());
    await expect(page.locator('.property-strip').getByText('E2E Testhaus geändert')).toHaveCount(0);

    await page.getByRole('button', { name: '+ Wohnung', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Wohnung anlegen' });
    await dialog.getByLabel('Bezeichnung').fill('E2E Testwohnung');
    await dialog.getByLabel('Etage').fill('EG');
    await dialog.getByLabel('Fläche in m²').fill('33,3');
    await dialog.getByLabel('Einheitengewicht').fill('1');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    let testUnit = page.locator('.unit-card').filter({ hasText: 'E2E Testwohnung' });
    await expect(testUnit).toBeVisible();
    await page
      .getByRole('button', { name: 'Wohnung E2E Testwohnung bearbeiten', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Wohnung bearbeiten' });
    await dialog.getByLabel('Etage').fill('Erdgeschoss');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    testUnit = page.locator('.unit-card').filter({ hasText: 'E2E Testwohnung' });
    await expect(testUnit).toContainText('Erdgeschoss');
    await testUnit.getByRole('button', { name: '+ Mietverhältnis', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Mietverhältnis anlegen' });
    await dialog.getByLabel('Name', { exact: true }).fill('E2E Testmieter');
    await dialog.getByLabel('Personen').fill('1');
    await dialog.getByLabel('Korrespondenzanschrift').fill('Mieterweg 2, 12345 Teststadt');
    await dialog.getByLabel('Mietbeginn').fill('2024-01-01');
    await dialog.getByLabel('Kaltmiete / Monat').fill('500');
    await dialog.getByLabel('NK-Vorauszahlung / Monat').fill('100');
    await dialog.getByLabel('Garage / Monat').fill('0');
    await dialog.getByLabel('Zahlungstag').fill('3');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    testUnit = page.locator('.unit-card').filter({ hasText: 'E2E Testwohnung' });
    await testUnit.locator('summary').filter({ hasText: 'Mietverlauf (1)' }).click();
    await testUnit.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Mietverhältnis bearbeiten' });
    await dialog.getByLabel('Name', { exact: true }).fill('E2E Testmieter geändert');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    testUnit = page.locator('.unit-card').filter({ hasText: 'E2E Testwohnung' });
    await expect(testUnit.locator('details')).toHaveAttribute('open', '');
    await testUnit.getByRole('button', { name: 'Mieterwechsel', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Mieterwechsel · E2E Testwohnung' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await acceptDialogAfter(page, () =>
      testUnit
        .getByRole('button', { name: /Mietverhältnis „E2E Testmieter geändert“.*löschen/ })
        .click(),
    );
    await acceptDialogAfter(page, () =>
      testUnit.getByRole('button', { name: /Wohnung „E2E Testwohnung“.*löschen/ }).click(),
    );
    await expect(page.locator('.unit-card').filter({ hasText: 'E2E Testwohnung' })).toHaveCount(0);

    await navigate(page, 'Zähler & Ablesungen', 'Zähler & Ablesungen');
    await expect(page.getByText(/1 Zähler · 1 Ablesungen 2024/)).toBeVisible();
    await expect(page.locator('.meter-card').filter({ hasText: 'Kaltwasser Bad' })).toContainText(
      /70\s*m³/,
    );
    await page
      .locator('.page-actions')
      .getByRole('button', { name: '+ Zähler', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Zähler anlegen' });
    await dialog.getByLabel('Bezeichnung').fill('E2E Prüfzähler');
    await dialog.getByLabel('Zählernummer').fill('E2E-1');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    let testMeter = page.locator('.meter-card').filter({ hasText: 'E2E Prüfzähler' });
    await expect(testMeter).toBeVisible();
    await page
      .getByRole('button', { name: 'Zähler E2E Prüfzähler bearbeiten', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Zähler bearbeiten' });
    await dialog.getByLabel('Bezeichnung').fill('E2E Prüfzähler geändert');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    testMeter = page.locator('.meter-card').filter({ hasText: 'E2E Prüfzähler geändert' });
    await acceptDialogAfter(page, () =>
      testMeter
        .getByRole('button', {
          name: 'Zähler „E2E Prüfzähler geändert“ samt Ablesungen löschen?',
        })
        .click(),
    );
    await expect(testMeter).toHaveCount(0);
    const waterMeter = page.locator('.meter-card').filter({ hasText: 'Kaltwasser Bad' });
    await waterMeter.getByRole('button', { name: '+ Ablesung', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Ablesung erfassen' });
    await dialog.getByLabel('Datum').fill('2024-06-30');
    await dialog.getByLabel('Zählerstand').fill('130');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page
      .getByRole('button', { name: 'Ablesung vom 30.06.2024 bearbeiten', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Ablesung bearbeiten' });
    await dialog.getByLabel('Zählerstand').fill('131');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(waterMeter).toContainText('131 m³');
    await acceptDialogAfter(page, () =>
      waterMeter.getByRole('button', { name: /Ablesung vom 30\.06\.2024 löschen/ }).click(),
    );

    await navigate(page, 'Kosten', 'Kosten 2024');
    await page.getByRole('button', { name: '+ Kostenposition', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Kostenposition erfassen' });
    await dialog.getByLabel('Interne Bezeichnung').fill('E2E temporäre Kosten');
    await dialog.getByLabel('Originalbetrag').fill('10');
    await dialog.getByLabel('Mieterstatus').selectOption('excluded');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Kostenposition E2E temporäre Kosten bearbeiten',
        exact: true,
      })
      .click();
    dialog = page.getByRole('dialog', { name: 'Kostenposition bearbeiten' });
    await dialog.getByLabel('Interne Bezeichnung').fill('E2E temporäre Kosten geändert');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await acceptDialogAfter(page, () =>
      page
        .getByRole('button', { name: /Kostenposition „E2E temporäre Kosten geändert“ löschen/ })
        .click(),
    );
    await expect(metric(page, 'Originalkosten intern')).toContainText(/1\.169,69\s*€/);
    await expect(metric(page, 'Freigegeben extern')).toContainText(/1\.169,69\s*€/);
    await expect(metric(page, 'Noch nicht umgelegt')).toContainText(/0,00\s*€/);
    await page.getByRole('button', { name: /Extern · Mieter/ }).click();
    await expect(page.getByRole('button', { name: /Extern · Mieter/ })).toHaveClass(/active/);
    await expect(page.locator('.cost-table tbody')).toContainText('Wohnung');
    await page.getByRole('button', { name: /Prüfung offen/ }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Keine offenen Prüffälle' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Intern · alle/ }).click();

    await navigate(page, 'Mietkonto', 'Mietkonto 2024');
    await expect(metric(page, 'Jahressoll')).toContainText(/5\.950,00\s*€/);
    await expect(metric(page, 'Eingegangen')).toContainText(/5\.950,00\s*€/);
    await expect(metric(page, 'IST Nebenkosten')).toContainText(/1\.050,00\s*€/);
    await expect(metric(page, 'Kontosaldo')).toContainText(/0,00\s*€/);
    await acceptDialogAfter(page, () =>
      page.getByRole('button', { name: 'Jahressoll erzeugen', exact: true }).click(),
    );
    await expect(page.getByText('Alle Monatsbuchungen waren bereits vorhanden.')).toBeVisible();
    await page.getByRole('button', { name: '+ Buchung', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Zahlung erfassen' });
    await expect(dialog.getByLabel('Kaltmiete Soll')).toHaveValue('700');
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await page
      .getByRole('button', { name: 'Buchung vom 03.01.2024 bearbeiten', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    await expect(dialog.getByLabel('Zahlung gesamt')).toHaveValue(/850,00\s*€/);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.locator('.ledger-table tbody tr')).toHaveCount(7);

    await navigate(page, 'Abrechnung', 'Abrechnung 2024');
    await page.getByRole('button', { name: 'Vorschau berechnen', exact: true }).click();
    const paper = page.locator('.settlement-paper');
    await expect(paper).toBeVisible();
    await expect(paper).toContainText('Manfred Lämmerzahl');
    await expect(paper).toContainText('Demo Mieter Januar–Juli');
    await expect(paper).toContainText(/1\.102,70\s*€/);
    await expect(paper).toContainText(/4,99\s*€/);
    await expect(paper).toContainText(/62,00\s*€/);
    await expect(paper.locator('.settlement-total')).toContainText(/1\.169,69\s*€/);
    await expect(paper.locator('.settlement-total')).toContainText(/1\.050,00\s*€/);
    await expect(paper.locator('.settlement-total')).toContainText(/119,69\s*€/);
    await expect(paper.getByText(/Rundungsdifferenz/i)).toHaveCount(0);
    await expect(paper.locator('img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Drucken / PDF', exact: true })).toHaveCount(0);
    await acceptDialogAfter(page, () =>
      page.getByRole('button', { name: 'Abrechnung abschließen', exact: true }).click(),
    );
    await expect(page.getByText('Diese Abrechnung ist abgeschlossen.')).toBeVisible();
    await page.getByRole('button', { name: 'Drucken / PDF', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(globalThis, '__vermietluchsPrintCalled')))
      .toBe(true);
    await acceptDialogAfter(page, () =>
      page.getByRole('button', { name: 'Zur Korrektur öffnen', exact: true }).click(),
    );
    await expect(page.getByText(/Korrekturvorschau:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drucken / PDF', exact: true })).toHaveCount(0);
    await acceptDialogAfter(page, () =>
      page.getByRole('button', { name: 'Abrechnung abschließen', exact: true }).click(),
    );
    await expect(page.getByText('Diese Abrechnung ist abgeschlossen.')).toBeVisible();
    await navigate(page, 'Cockpit', 'Cockpit 2024');
    await navigate(page, 'Abrechnung', 'Abrechnung 2024');
    const archiveItem = page.locator('.archive-list > div').filter({
      hasText: '2024 · Demo Mieter Januar–Juli',
    });
    await archiveItem.getByRole('button', { name: 'Öffnen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Geöffnet', exact: true })).toBeVisible();
    await expect(page.locator('.settlement-paper')).toContainText(/119,69\s*€/);
    await expect(pageErrors).toEqual([]);
  });

  test('mobile Navigation bleibt vollständig bedienbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Abrechnungsjahr auswählen').selectOption('2024');
    const menuButton = page.getByRole('button', { name: 'Navigation öffnen', exact: true });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('button', { name: 'Kosten', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kosten 2024' })).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await page.getByRole('button', { name: 'Menü schließen', exact: true }).click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
