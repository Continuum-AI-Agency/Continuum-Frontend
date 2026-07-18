import { expect, test } from '@playwright/test';

test('the public shell resolves its local theme and fonts before hydration', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (/hydration/i.test(error.message)) hydrationErrors.push(error.message);
  });

  await page.addInitScript(() => {
    localStorage.setItem('theme', JSON.stringify('dark'));
  });

  const response = await page.goto('/login', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBe(true);

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveClass(/dark/);
  await expect(page.locator('body')).toBeVisible();

  const externalFontRequests = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /fonts\.(?:googleapis|gstatic)\.com/.test(url)),
  );
  expect(externalFontRequests).toEqual([]);
  expect(hydrationErrors).toEqual([]);
});
