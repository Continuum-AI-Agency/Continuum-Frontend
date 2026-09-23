import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test('a magic link signs in from a fresh browser session', async ({ browser, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !baseURL) {
    throw new Error('Local Supabase and PLAYWRIGHT_BASE_URL are required for this bench.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'local@continuum.test',
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not issue a real Auth link: ${error?.message ?? 'missing token hash'}`);
  }

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const callback = new URL('/auth/callback?next=/dashboard', baseURL);
    const confirm = new URL('/auth/confirm', baseURL);
    confirm.searchParams.set('token_hash', data.properties.hashed_token);
    confirm.searchParams.set('redirect_to', callback.toString());

    await page.goto(confirm.toString());
    await expect(page).toHaveURL(new URL('/dashboard', baseURL).toString());
    await expect(page.locator('[data-tour-id="dashboard-overview"]')).toBeVisible();
  } finally {
    await context.close();
  }
});
