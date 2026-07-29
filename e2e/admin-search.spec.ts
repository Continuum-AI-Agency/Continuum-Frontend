import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const adminStorageStatePath = process.env.E2E_ADMIN_STORAGE_STATE_PATH;

function requireAuthorizedAdminState(): string {
  if (!adminStorageStatePath || !existsSync(adminStorageStatePath)) {
    throw new Error(
      'E2E_ADMIN_STORAGE_STATE_PATH must point to a pre-approved, short-lived admin Playwright storage-state file.',
    );
  }
  return adminStorageStatePath;
}

test('admin search preserves newer typing when an older real response settles', async ({
  browser,
  baseURL,
}) => {
  const targetUrl = new URL(baseURL ?? 'http://localhost:3000');
  if (!['localhost', '127.0.0.1'].includes(targetUrl.hostname)) {
    throw new Error('admin:search:e2e:bench only intercepts requests against a local Frontend.');
  }

  const context = await browser.newContext({
    storageState: requireAuthorizedAdminState(),
  });
  const page = await context.newPage();

  try {
    await page.goto('/admin');
    const searchInput = page.getByRole('textbox', { name: 'Search users' });
    await expect(searchInput).toBeVisible();

    const firstUserCell = page
      .getByTestId('admin-user-directory-results')
      .locator('tbody tr')
      .first()
      .locator('td')
      .first();
    const email = (await firstUserCell.locator('p').last().innerText()).trim();
    expect(email).toContain('@');

    const prefixLength = Math.min(3, Math.max(1, email.indexOf('@')));
    const prefix = email.slice(0, prefixLength);
    let releasePrefixRequest = () => {};
    const prefixRequestGate = new Promise<void>((resolve) => {
      releasePrefixRequest = resolve;
    });
    let markPrefixRequestStarted = () => {};
    const prefixRequestStarted = new Promise<void>((resolve) => {
      markPrefixRequestStarted = resolve;
    });
    let heldPrefixRequest = false;

    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const isPrefixSearch =
        requestUrl.pathname === '/admin' &&
        requestUrl.searchParams.get('query') === prefix &&
        requestUrl.searchParams.has('_rsc');

      if (isPrefixSearch && !heldPrefixRequest) {
        heldPrefixRequest = true;
        markPrefixRequestStarted();
        await prefixRequestGate;
      }

      await route.continue();
    });

    await searchInput.fill(prefix);
    await prefixRequestStarted;

    const prefixResponse = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return (
        responseUrl.pathname === '/admin' &&
        responseUrl.searchParams.get('query') === prefix &&
        responseUrl.searchParams.has('_rsc')
      );
    });

    await searchInput.type(email.slice(prefix.length), { delay: 10 });
    await expect(searchInput).toHaveValue(email);

    releasePrefixRequest();
    await prefixResponse;
    await expect(searchInput).toHaveValue(email);

    await expect(page).toHaveURL((url) => url.searchParams.get('query') === email);
    await expect(page.getByTestId('admin-user-directory-results')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(page.getByTestId('admin-user-directory-results')).toContainText(email);
  } finally {
    await context.close();
  }
});
