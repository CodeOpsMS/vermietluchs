import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { papraTestKey } from '../helpers/papra';

const baseUrl = 'http://127.0.0.1:3102';
test.setTimeout(45_000);
// Der vollständige Chromium-Browser enthält den PDF-Betrachter; headless_shell nicht.
test.use({ channel: 'chromium' });
let houses: number[] = [];
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Navigation öffnen', exact: true });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function house(request: APIRequestContext, name: string) {
  const response = await request.post('/api/properties', {
    data: {
      name,
      address: '',
      landlordName: null,
      landlordAddress: null,
      bankAccountHolder: null,
      bankIban: null,
      paymentDeadlineDays: null,
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  houses.push(id as number);
  return id as number;
}
async function configure(request: APIRequestContext, propertyId: number, organizationId = 'org_a') {
  const settings = await (await request.get('/api/papra/settings')).json();
  const saved = await (
    await request.put('/api/papra/settings', {
      data: { baseUrl, apiKey: papraTestKey, revision: settings.revision },
    })
  ).json();
  expect((await request.post('/api/papra/test', { data: { revision: saved.revision } })).ok()).toBe(
    true,
  );
  expect(
    (
      await request.put(`/api/properties/${propertyId}/papra`, {
        data: { organizationId, revision: 0 },
      })
    ).ok(),
  ).toBe(true);
}
async function showHouse(page: Page, propertyId: number) {
  await page.goto('/');
  await page.getByLabel('Haus auswählen', { exact: true }).selectOption(String(propertyId));
  await page.getByLabel('Abrechnungsjahr auswählen', { exact: true }).selectOption('2026');
  await navigate(page, 'Stammdaten');
}
test.afterEach(async ({ request }) => {
  for (const id of houses)
    await request.delete(`/api/properties/${id}`, { headers: { 'If-Match': '0' } });
  houses = [];
  const settings = await (await request.get('/api/papra/settings')).json();
  await request.put('/api/papra/settings', {
    data: { baseUrl: '', clearApiKey: true, revision: settings.revision },
  });
  const ai = await (await request.get('/api/ai/settings')).json();
  await request.put('/api/ai/settings', {
    data: {
      enabled: false,
      provider: 'ollama',
      model: 'qwen2.5vl:7b',
      baseUrl: 'http://localhost:11434',
      revision: ai.revision,
    },
  });
});

test('richtet Papra ein, ordnet zwei Häuser zu und öffnet unveränderte Originale', async ({
  page,
}) => {
  const a = await house(page.request, 'Papra Haus A');
  const b = await house(page.request, 'Papra Haus B');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await navigate(page, 'Einstellungen');
  const card = page.getByRole('region', { name: 'Papra-Einstellungen' });
  await card.getByLabel('Papra-Adresse', { exact: true }).fill(baseUrl);
  await card
    .getByLabel('Papra-Adresse im Browser', { exact: true })
    .fill('https://papra.example.test');
  await card.getByLabel('Papra-API-Schlüssel', { exact: true }).fill('wrong-key');
  await card.getByRole('button', { name: 'Verbindung prüfen', exact: true }).click();
  await expect(card).toContainText('Papra-Schlüssel ist ungültig');
  await card.getByLabel('Papra-API-Schlüssel', { exact: true }).fill(papraTestKey);
  await card.getByRole('button', { name: 'Verbindung prüfen', exact: true }).click();
  await expect(card).toContainText('Verbindung geprüft');
  await expect(card.getByLabel('Papra-API-Schlüssel', { exact: true })).toHaveValue('');
  await card.screenshot({ path: test.info().outputPath('papra-settings.png') });
  for (const [id, name, org] of [
    [a, 'Papra Haus A', 'org_a'],
    [b, 'Papra Haus B', 'org_b'],
  ] as const) {
    await showHouse(page, id);
    await page.getByRole('button', { name: `Dokumente für ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Papra-Organisation für dieses Haus', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Organisationen laden' }).click();
    await dialog
      .getByRole('combobox', { name: 'Papra-Organisation', exact: true })
      .selectOption(org);
    await dialog.getByRole('button', { name: 'Organisation speichern' }).click();
    await expect(dialog).toContainText('Organisation für dieses Haus gespeichert');
    await dialog.getByRole('button', { name: 'Aus Papra auswählen' }).click();
    await expect(dialog).toContainText(`Beleg ${org} 1`);
    await expect(dialog).not.toContainText(org === 'org_a' ? 'Beleg org_b' : 'Beleg org_a');
    await dialog.getByRole('button', { name: 'Nächste Seite' }).click();
    await expect(dialog).toContainText('Seite 2');
    await dialog.getByLabel('Dokumente suchen').fill(`Beleg ${org} 23`);
    await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
    await expect(dialog.locator('.papra-list li')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Verknüpfen', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Verknüpfung entfernen' })).toHaveCount(1);
    await expect(dialog.getByRole('link', { name: 'In Papra öffnen' })).toHaveAttribute(
      'href',
      /^https:\/\/papra\.example\.test\/organizations\//,
    );
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      dialog.getByRole('link', { name: 'PDF öffnen' }).click(),
    ]);
    await expect.poll(() => popup.url()).toContain('/api/document-links/');
    await popup.close();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('link', { name: 'Herunterladen' }).click(),
    ]);
    const downloaded = await fs.readFile((await download.path())!);
    const original = await page.request.get(
      `${baseUrl}/api/organizations/${org}/documents/doc_${org}_23/file`,
      { headers: { Authorization: `Bearer ${papraTestKey}` } },
    );
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      createHash('sha256')
        .update(await original.body())
        .digest('hex'),
    );
    await dialog.getByRole('button', { name: 'Verknüpfung entfernen' }).click();
    await expect(dialog).toContainText('Noch keine Dokumente verknüpft');
    expect(
      (
        await page.request.get(`${baseUrl}/api/organizations/${org}/documents/doc_${org}_23`, {
          headers: { Authorization: `Bearer ${papraTestKey}` },
        })
      ).ok(),
    ).toBe(true);
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('verwirft eine verspätete Dokumentliste nach dem Wechsel zu einem anderen Haus', async ({
  page,
}) => {
  const a = await house(page.request, 'Papra Langsam');
  const b = await house(page.request, 'Papra Schnell');
  await configure(page.request, a);
  expect(
    (
      await page.request.put(`/api/properties/${b}/papra`, {
        data: { organizationId: 'org_b', revision: 0 },
      })
    ).ok(),
  ).toBe(true);
  let release: () => void = () => undefined;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/properties/${a}/papra/documents?**`, async (route) => {
    await delayed;
    await route
      .fulfill({
        json: {
          documents: [],
          documentsCount: 999,
          organizationId: 'org_a',
          settingsRevision: 1,
          mappingRevision: 1,
        },
      })
      .catch(() => undefined);
  });
  try {
    await showHouse(page, a);
    await page.getByRole('button', { name: 'Dokumente für Papra Langsam' }).click();
    await Promise.all([
      page.waitForRequest((req) => req.url().includes(`/properties/${a}/papra/documents?`)),
      page.getByRole('button', { name: 'Aus Papra auswählen' }).click(),
    ]);
    await page.keyboard.press('Escape');
    await page.getByLabel('Haus auswählen', { exact: true }).selectOption(String(b));
    await page.getByRole('button', { name: 'Dokumente für Papra Schnell' }).click();
    await page.getByRole('button', { name: 'Aus Papra auswählen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Beleg org_b 1');
    release();
    await expect(page.getByRole('dialog')).not.toContainText('999 Dokumente');
    await expect(page.getByRole('dialog')).not.toContainText('Beleg org_a');
  } finally {
    release();
  }
});

test('scannt ein Papra-PDF über den echten Backend-Pfad und verknüpft bearbeitete Kosten', async ({
  page,
}) => {
  const id = await house(page.request, 'Papra KI-Haus');
  await configure(page.request, id);
  const ai = await (await page.request.get('/api/ai/settings')).json();
  expect(
    (
      await page.request.put('/api/ai/settings', {
        data: {
          enabled: true,
          provider: 'compatible',
          model: 'papra-test',
          baseUrl: `${baseUrl}/v1`,
          documentMode: 'text',
          outputMode: 'prompt',
          revision: ai.revision,
        },
      })
    ).ok(),
  ).toBe(true);
  await showHouse(page, id);
  await navigate(page, 'KI-Scan');
  await page.getByRole('button', { name: 'Aus Papra auswählen' }).click();
  const dialog = page.getByRole('dialog');
  const first = dialog
    .locator('.papra-list li')
    .filter({ has: page.getByText('Beleg org_a 1', { exact: true }) });
  const [selectionCheck] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/properties/${id}/papra/file?`) &&
        response.url().includes('check=1'),
    ),
    first.getByRole('button', { name: 'Für KI-Scan auswählen' }).click(),
  ]);
  expect(selectionCheck.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'KI-Entwurf', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'PDF analysieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'KI-Entwurf', exact: true })).toBeVisible();
  await expect(
    page.getByText('Beim Übernehmen wird das Papra-Original', { exact: false }),
  ).toContainText('automatisch mit allen neu angelegten Kostenpositionen');
  await page
    .getByLabel('Interne Bezeichnung', { exact: true })
    .first()
    .fill('Papra Hausreinigung geprüft');
  let importAttempts = 0;
  await page.route('**/api/ai/import', (route) => {
    importAttempts++;
    return importAttempts === 1
      ? route.fulfill({ status: 502, json: { error: 'Papra ist vorübergehend nicht erreichbar.' } })
      : route.continue();
  });
  await page.getByRole('button', { name: 'Ausgewählte Daten übernehmen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'KI-Entwurf', exact: true })).toBeVisible();
  await expect(page.getByLabel('Interne Bezeichnung', { exact: true }).first()).toHaveValue(
    'Papra Hausreinigung geprüft',
  );
  await page.getByRole('button', { name: 'Ausgewählte Daten übernehmen', exact: true }).click();
  await expect(page.getByText('2 Kostenposition(en)', { exact: false })).toBeVisible();
  await navigate(page, 'Kosten');
  await page
    .getByRole('button', { name: 'Belege für Papra Hausreinigung geprüft', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Beleg org_a 1');
  await page.getByRole('button', { name: 'Aus Papra auswählen' }).click();
  await page
    .getByRole('dialog')
    .locator('.papra-list li')
    .filter({ has: page.getByText('Beleg org_a 2', { exact: true }) })
    .getByRole('button', { name: 'Verknüpfen', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Verknüpfung entfernen' }),
  ).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Belege für Papra Gartenpflege', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Verknüpfung entfernen' }),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Extern · Mieter/ }).click();
  await expect(page.getByRole('button', { name: /^Belege für/ })).toHaveCount(0);
});

test('behandelt leere Suche und Ausfälle und bleibt mobil per Tastatur bedienbar', async ({
  page,
}) => {
  const id = await house(page.request, 'Papra Mobil');
  await configure(page.request, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await showHouse(page, id);
  await page.getByRole('button', { name: 'Dokumente für Papra Mobil' }).click();
  await page.getByRole('button', { name: 'Aus Papra auswählen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Beleg org_a 1');
  await page.screenshot({ path: test.info().outputPath('papra-picker-mobile.png') });
  await dialog.getByLabel('Dokumente suchen').fill('NICHT_VORHANDEN');
  await dialog.getByLabel('Dokumente suchen').press('Enter');
  await expect(dialog).toContainText('Keine Dokumente gefunden');
  await page.route('**/papra/documents?**', (route) =>
    route.fulfill({ status: 502, json: { error: 'Papra ist vorübergehend nicht erreichbar.' } }),
  );
  await dialog.getByLabel('Dokumente suchen').fill('neu');
  await dialog.getByLabel('Dokumente suchen').press('Enter');
  await expect(dialog).toContainText('Papra ist vorübergehend nicht erreichbar');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
