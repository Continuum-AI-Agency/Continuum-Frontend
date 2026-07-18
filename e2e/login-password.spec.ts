import { expect, test } from '@playwright/test';
import { SUPABASE_COOKIE_NAME } from '@/lib/supabase/cookies';

// End-to-end proof that password sign-in works across its real boundaries:
// the real login form -> the real server action -> real GoTrue -> a real
// session cookie -> an authenticated landing. Nothing here is mocked.
//
// Run against the local stack, which seeds these credentials via
// supabase/baseline/fixtures.sql:
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run login:password:e2e:bench
//
// Password sign-in exists so a platform reviewer can be handed static
// credentials; magic link cannot serve that case.

const EMAIL = process.env.E2E_PASSWORD_EMAIL ?? 'local@continuum.test';
const PASSWORD = process.env.E2E_PASSWORD_SECRET ?? 'localdev123';

test.describe('password sign-in', () => {
  test('signs a user in with email and password and lands them authenticated', async ({ page }) => {
    await page.goto('/login');

    // Magic link is the default; the password field must not exist until asked for.
    await expect(page.locator('#password')).toHaveCount(0);

    await page.getByRole('button', { name: /^password login$/i }).click();
    await expect(page.locator('#password')).toBeVisible();

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // The real assertion: we left /login for an authenticated destination and a
    // GoTrue session cookie was actually written.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

    // Supabase chunks large sessions across `sb-auth.0`, `sb-auth.1`, ...
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((c) => c.name.startsWith(SUPABASE_COOKIE_NAME));
    expect(
      authCookie,
      `expected a ${SUPABASE_COOKIE_NAME}* session cookie after password sign-in`,
    ).toBeTruthy();
  });

  test('rejects a wrong password without creating a session', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^password login$/i }).click();

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name.startsWith(SUPABASE_COOKIE_NAME))).toBeFalsy();
  });
});
