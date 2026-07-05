import { type Browser, expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { mintSession, mintSessionForEmail } from './support/auth';

// IMP-001 / IMP-015 onboarding-as-default-dashboard — end-to-end proof that the
// dashboard adapts to a brand's setup state:
//   * a NO-BRAND authenticated session hitting /dashboard is redirected to
//     /onboarding (the redirect half of IMP-001, guarded in dashboard/page.tsx).
//   * a BRAND-WITHOUT-READINESS session (a bare brand stub: no connected
//     provider, no assigned account, no materialized Brand Book) renders the
//     first-run guided-setup checklist + workflow map instead of empty modules.
//
// Requires the Supabase auth-mint env (SUPABASE_SERVICE_ROLE_KEY +
// NEXT_PUBLIC_SUPABASE_URL + a publishable/anon key) and a running dev server —
// see e2e/README.md PREREQUISITES. Without them the mint/provision helpers throw
// and these specs fail fast at setup (they never silently pass).

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e/onboarding] Missing required env var ${name}. See Continuum-Frontend/e2e/README.md PREREQUISITES.`,
    );
  }
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface ProvisionedBrand {
  email: string;
  userId: string;
  brandId: string;
}

// Creates an ephemeral confirmed user and a bare brand stub owned by them via the
// same plugin_mcp.create_brand_stub RPC the product uses, so the brand exists but
// has no integrations, no assigned accounts, and no Brand Book — the exact
// "selected but not set up" state the first-run experience targets.
async function provisionBrandWithoutReadiness(): Promise<ProvisionedBrand> {
  const admin = adminClient();
  const email = `e2e-firstrun-${crypto.randomUUID()}@continuum-e2e.test`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`[e2e/onboarding] createUser failed for ${email}: ${createError?.message}`);
  }
  const userId = created.user.id;

  const { data: brandId, error: stubError } = await admin
    .schema('plugin_mcp')
    .rpc('create_brand_stub', {
      p_user_id: userId,
      p_brand_name: 'E2E First-Run Brand',
    });
  if (stubError || typeof brandId !== 'string') {
    throw new Error(`[e2e/onboarding] create_brand_stub failed for ${email}: ${stubError?.message}`);
  }

  return { email, userId, brandId };
}

async function teardownProvisionedBrand(brand: ProvisionedBrand): Promise<void> {
  const admin = adminClient();
  // Best-effort cleanup — orphaned test rows are low-harm, so failures here must
  // not fail the spec.
  try {
    await admin.schema('brand_profiles').from('permissions').delete().eq('brand_profile_id', brand.brandId);
  } catch {
    /* ignore */
  }
  try {
    await admin.schema('brand_profiles').from('brand_profiles').delete().eq('id', brand.brandId);
  } catch {
    /* ignore */
  }
  try {
    await admin.auth.admin.deleteUser(brand.userId);
  } catch {
    /* ignore */
  }
}

test.describe('onboarding-as-default dashboard', () => {
  test('a no-brand session is redirected from /dashboard to /onboarding', async ({ browser }) => {
    const storageState = await mintSession({ isAdmin: false });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(/\/onboarding(\/|$|\?)/);
    } finally {
      await context.close();
    }
  });

  test('a brand-without-readiness session sees the first-run setup, not empty modules', async ({
    browser,
  }) => {
    const brand = await provisionBrandWithoutReadiness();
    const storageState = await mintSessionForEmail(brand.email);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      // The dashboard stays on /dashboard (a brand IS selected) and renders the
      // guided setup rather than redirecting or showing empty data modules.
      await expect(page).toHaveURL(/\/dashboard(\/|$|\?)/);
      await expect(page.getByTestId('dashboard-first-run')).toBeVisible();
      await expect(page.getByText('Set up your workspace')).toBeVisible();
      await expect(page.getByTestId('dashboard-setup-checklist')).toBeVisible();
      await expect(page.getByTestId('dashboard-workflow-map')).toBeVisible();
    } finally {
      await context.close();
      await teardownProvisionedBrand(brand);
    }
  });
});
