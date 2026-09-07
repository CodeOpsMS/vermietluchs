import { expect, test, type Route } from '@playwright/test';
import type { AiSettings } from '../../src/shared/ai';
import { DISABLED_AI_SETTINGS as initialSettings } from '../helpers/ai-settings';

for (const scenario of [
  {
    name: 'alte KI-Antwort vor neuester Antwort',
    oldStatus: 200,
    latestStatus: 200,
    oldFirst: true,
  },
  {
    name: 'alte KI-Antwort nach neuester Antwort',
    oldStatus: 200,
    latestStatus: 200,
    oldFirst: false,
  },
  {
    name: 'alter KI-Fehler nach neuester Antwort',
    oldStatus: 500,
    latestStatus: 200,
    oldFirst: false,
  },
  {
    name: 'alte KI-Antwort nach neuestem Fehler',
    oldStatus: 200,
    latestStatus: 500,
    oldFirst: false,
  },
]) {
  test(`KI-Einstellungen beim Nachladen: ${scenario.name}`, async ({ page }) => {
    let settingsRequests = 0;
    const pending: Route[] = [];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/ai/settings') {
        if (++settingsRequests === 1) await route.fulfill({ json: initialSettings });
        else pending.push(route);
      } else {
        await route.fulfill({
          json: path === '/api/properties' ? [{ id: 1, name: 'Testhaus' }] : [],
        });
      }
    });
    await page.goto('/');
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    const scan = page.getByRole('navigation').getByRole('button', { name: 'KI-Scan', exact: true });
    const privacyNotice = page.locator('.sidebar-foot');
    await expect(scan).toHaveCount(0);
    await expect(privacyNotice).toContainText('Alle Daten bleiben lokal');
    for (let count = 1; count <= 2; count += 1) {
      await page.evaluate(() => window.dispatchEvent(new Event('vermietluchs:data-conflict')));
      await expect.poll(() => pending.length).toBe(count);
    }

    async function finish(index: number, status: number) {
      const finished = page.waitForEvent(
        'requestfinished',
        (request) => request === pending[index].request(),
      );
      const settings: AiSettings = {
        ...initialSettings,
        enabled: true,
        revision: index + 1,
        ...(index === 0
          ? {
              provider: 'openai',
              baseUrl: 'https://api.openai.com/v1',
              apiKeyConfigured: true,
            }
          : {}),
      };
      await pending[index].fulfill({
        status,
        json:
          status === 200
            ? settings
            : { error: index === 0 ? 'Alter KI-Fehler' : 'Neuer KI-Fehler' },
      });
      await finished;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
    }

    if (scenario.oldFirst) {
      await finish(0, scenario.oldStatus);
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
      await expect(scan).toHaveCount(0);
      await expect(privacyNotice).toContainText('Alle Daten bleiben lokal');
      await finish(1, scenario.latestStatus);
    } else {
      await finish(1, scenario.latestStatus);
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
      await finish(0, scenario.oldStatus);
    }

    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    await expect(scan).toHaveCount(scenario.latestStatus === 200 ? 1 : 0);
    await expect(privacyNotice).toContainText('Alle Daten bleiben lokal');
    if (scenario.latestStatus === 200) await expect(page.getByRole('alert')).toHaveCount(0);
    else await expect(page.getByRole('alert')).toContainText('Neuer KI-Fehler');
  });
}
