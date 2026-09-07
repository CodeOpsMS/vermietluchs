import { expect, test, type Page, type Route } from '@playwright/test';
import { DISABLED_AI_SETTINGS } from '../helpers/ai-settings';

async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('vermietluchs:data-conflict')));
}

async function flushRendering(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

for (const scenario of [
  { name: 'alte Antwort vor neuester Antwort', oldStatus: 200, latestStatus: 200, oldFirst: true },
  {
    name: 'alte Antwort nach neuester Antwort',
    oldStatus: 200,
    latestStatus: 200,
    oldFirst: false,
  },
  {
    name: 'alter Fehler nach neuester Antwort',
    oldStatus: 500,
    latestStatus: 200,
    oldFirst: false,
  },
  { name: 'alte Antwort nach neuestem Fehler', oldStatus: 200, latestStatus: 500, oldFirst: false },
]) {
  test(`gleichzeitiges Nachladen: ${scenario.name}`, async ({ page }) => {
    let propertyRequests = 0;
    const pending: Route[] = [];
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/ai/settings') {
        await route.fulfill({ json: DISABLED_AI_SETTINGS });
      } else if (path !== '/api/properties') {
        await route.fulfill({ json: [] });
      } else if (++propertyRequests === 1) {
        await route.fulfill({ json: [{ id: 1, name: 'Ausgangsstand' }] });
      } else {
        pending.push(route);
      }
    });
    await page.goto('/');
    const house = page.getByLabel('Haus auswählen', { exact: true });
    await expect(house).toHaveValue('1');
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    await refresh(page);
    await expect.poll(() => pending.length).toBe(1);
    await refresh(page);
    await expect.poll(() => pending.length).toBe(2);
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');

    async function finish(index: number, status: number) {
      const finished = page.waitForEvent(
        'requestfinished',
        (request) => request === pending[index].request(),
      );
      await pending[index].fulfill({
        status,
        json:
          status === 200
            ? [{ id: index + 2, name: index === 0 ? 'Veralteter Stand' : 'Aktueller Stand' }]
            : { error: index === 0 ? 'Veralteter Fehler' : 'Aktueller Fehler' },
      });
      await finished;
      await flushRendering(page);
    }

    if (scenario.oldFirst) {
      await finish(0, scenario.oldStatus);
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
      await expect(house).toHaveValue('1');
      await finish(1, scenario.latestStatus);
    } else {
      await finish(1, scenario.latestStatus);
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
      await finish(0, scenario.oldStatus);
    }
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
    await expect(house).toHaveValue(scenario.latestStatus === 200 ? '3' : '1');
    if (scenario.latestStatus === 200) {
      await expect(page.getByRole('alert')).toHaveCount(0);
    } else {
      await expect(page.getByRole('alert')).toContainText('Aktueller Fehler');
    }
    await expect(page.getByText('Veralteter Stand', { exact: true })).toHaveCount(0);
  });
}
