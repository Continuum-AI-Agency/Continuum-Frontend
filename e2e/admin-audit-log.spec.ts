import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSession } from './support/auth';

// Admin audit log end-to-end bench (Admin console → Audit tab).
//
// Drives the REAL code path across its real boundaries: a real admin session is minted through
// GoTrue, a real row is seeded into the real local Postgres `brand_profiles.admin_audit_log`, and
// the real Frontend reads it back through the real `admin-audit-log` edge function and renders it.
// The assertions are on the rendered outcome — the deep-linked tab, the row, the expanded
// before/after, and the action filter re-query — not on any intermediate that only implies it.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   (the local edge runtime must serve functions — `admin-audit-log` is enabled in config.toml)
//   Run with: bun run admin:audit:e2e:bench
//
// Un-exercised hop, stated explicitly: the audit *writers* (impersonate-user, admin-set-admin,
// admin-access-actions, admin-update-tier, admin-workflow-library) are not driven here — this bench
// seeds the row directly to prove the read+render+filter chain. That each writer appends a correct
// row is a separate concern owned by those functions' own tests; this bench owns the console surface.

const AUDIT_SCHEMA = 'brand_profiles';
const AUDIT_TABLE = 'admin_audit_log';

// Unique marker so the bench finds and purges exactly its own row, never a real one. `target_id`
// is a free-text column, so a readable marker is both a valid value and an easy locator. A random
// UUID (as in seedAuditRow) makes it collision-resistant across concurrent runs.
const RUN_MARKER = `bench-audit-${Date.now()}-${crypto.randomUUID()}`;

// The seeded row's action drives the filter assertion: filtering to a DIFFERENT known action must
// drop it, and returning to "All actions" must bring it back.
const SEEDED_ACTION = 'admin.brand.update_tier';
const SEEDED_ACTION_LABEL = 'Brand · Update tier';
const OTHER_ACTION_LABEL = 'User · Set admin';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[admin:audit:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function seedAuditRow(supabase: SupabaseClient): Promise<void> {
  await supabase
    .schema(AUDIT_SCHEMA)
    .from(AUDIT_TABLE)
    .insert({
      action: SEEDED_ACTION,
      target_type: 'brand_profile',
      target_id: RUN_MARKER,
      brand_profile_id: null,
      actor_user_id: crypto.randomUUID(),
      before: { tier: 1 },
      after: { tier: 2 },
      metadata: { bench: RUN_MARKER },
      status: 'success',
    })
    .throwOnError();
}

async function purgeAuditRow(supabase: SupabaseClient): Promise<void> {
  await supabase
    .schema(AUDIT_SCHEMA)
    .from(AUDIT_TABLE)
    .delete()
    .eq('target_id', RUN_MARKER)
    .throwOnError();
}

function isLocalSupabaseTarget(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function assertLocalTarget(baseURL: string | undefined): void {
  const targetUrl = new URL(baseURL ?? 'http://localhost:3000');
  if (!['localhost', '127.0.0.1'].includes(targetUrl.hostname)) {
    throw new Error(
      'admin:audit:e2e:bench seeds a local Postgres row; run it against a local Frontend.',
    );
  }
}

test.describe('admin audit log', () => {
  // Never write to a non-local Supabase: the seed/purge use the service role against
  // NEXT_PUBLIC_SUPABASE_URL, so guard the hooks the same way the tests guard baseURL.
  test.beforeAll(async () => {
    if (!isLocalSupabaseTarget()) return;
    await seedAuditRow(admin());
  });

  test.afterAll(async () => {
    if (!isLocalSupabaseTarget()) return;
    await purgeAuditRow(admin());
  });

  // The bug this feature fixes (BUG-001): /admin?tab=audit used to land on Users. This assertion
  // needs no audit data — it is pure client routing — so it is the load-bearing regression guard.
  test('deep-links straight to the Audit tab (BUG-001)', async ({ browser, baseURL }) => {
    assertLocalTarget(baseURL);
    const context = await browser.newContext({
      storageState: await mintSession({ isAdmin: true }),
    });
    const page = await context.newPage();
    try {
      await page.goto('/admin?tab=audit');
      await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByTestId('admin-audit-panel')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Admin Audit Log' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  // The read+render+filter chain through the real edge function reading the real seeded row.
  test('renders the seeded entry, expands its before/after, and filters by action', async ({
    browser,
    baseURL,
  }) => {
    assertLocalTarget(baseURL);
    const context = await browser.newContext({
      storageState: await mintSession({ isAdmin: true }),
    });
    const page = await context.newPage();
    try {
      await page.goto('/admin?tab=audit');

      // The seeded row is read back through the real admin-audit-log edge function.
      const row = page.getByTestId('admin-audit-row').filter({ hasText: RUN_MARKER });
      await expect(row).toBeVisible();
      await expect(row).toContainText(SEEDED_ACTION_LABEL);

      // Expanding surfaces the real before→after captured on the row.
      await row.click();
      const detail = page.getByTestId('admin-audit-detail');
      await expect(detail).toBeVisible();
      await expect(detail).toContainText('Before');
      await expect(detail).toContainText('After');
      await expect(detail).toContainText('"tier": 1');
      await expect(detail).toContainText('"tier": 2');

      // Filtering to a different action re-queries the edge function and drops the row.
      await page.getByRole('combobox', { name: 'Filter by action' }).click();
      await page.getByRole('option', { name: OTHER_ACTION_LABEL }).click();
      await expect(page.getByTestId('admin-audit-row').filter({ hasText: RUN_MARKER })).toHaveCount(
        0,
      );

      // Returning to "All actions" re-queries and brings it back.
      await page.getByRole('combobox', { name: 'Filter by action' }).click();
      await page.getByRole('option', { name: 'All actions' }).click();
      await expect(
        page.getByTestId('admin-audit-row').filter({ hasText: RUN_MARKER }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
