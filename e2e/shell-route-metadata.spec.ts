import { expect, test } from '@playwright/test';
import { mintSessionWithPassword } from './support/auth';

test('authenticated shell exposes route titles and header pills', async ({ browser }) => {
  test.setTimeout(120_000);
  const storageState = await mintSessionWithPassword('local@continuum.test', 'localdev123');
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    for (const route of [
      { path: '/organic?tab=agent', title: 'Organic | Continuum AI', pill: 'Organic' },
      { path: '/competitor-spy', title: 'Brand Spy | Continuum AI', pill: 'Brand Spy' },
    ]) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(route.title);

      const shellHeader = page.locator('header').filter({
        has: page.locator('#global-brand-switcher'),
      });
      await expect(shellHeader.getByText(route.pill, { exact: true })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
