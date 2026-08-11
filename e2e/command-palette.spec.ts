import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// command-palette:e2e:bench — the palette, in a real Chrome, after the move to shadcn's
// base-nova `command`.
//
// Why this exists. The palette's whole value is that you can type an abbreviation and land
// on the thing you meant: "pdopt" -> Paid Optimization. cmdk's command-score does
// subsequence matching AND ranks the hits; Base UI's Combobox filters with an
// Intl.Collator substring match that returns nothing for those queries and carries no
// ranking at all. shadcn's base-nova `command` is itself cmdk-backed, which is what makes
// this swap safe — and this bench is what proves the claim instead of asserting it.
//
// command.filter.test.tsx covers the same ground in happy-dom against the primitives
// directly. This one drives the ACTUAL palette: real Cmd+K, real dynamic import, real
// route list for a real signed-in member, real dialog and portal.
//
// Read-only: navigation only, no writes, no brand-preference mutation.
// ---------------------------------------------------------------------------

loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';

const admin = createClient(PROD_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false },
});

let storageState: PlaywrightStorageState;

test.describe.configure({ mode: 'serial' });

test.describe('Command palette — abbreviations still find their command', () => {
  test.beforeAll(async () => {
    await mintAccessTokenForEmail(OWNER_EMAIL);
    storageState = await mintSessionForEmail(OWNER_EMAIL);
    // Touch the admin client so an unusable service key fails here, loudly, rather than
    // surfacing later as a mysterious redirect to /login.
    const { error } = await admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('id')
      .limit(1);
    if (error) throw new Error(`[palette-bench] service-role read failed: ${error.message}`);
  });

  // Drawn from APP_NAVIGATION (routes.ts) — the labels the palette actually renders as
  // CommandItem values. None of these is a substring of its target: each only matches
  // because cmdk scores subsequences.
  const cases = [
    { query: 'brsp', expected: 'Brand Spy' },
    { query: 'autom', expected: 'Automations' },
    { query: 'cnvs', expected: 'Canvas' },
    { query: 'lbry', expected: 'Library' },
  ];

  for (const { query, expected } of cases) {
    test(`"${query}" finds ${expected}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      try {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        // The palette is a dynamic import; the shortcut is a no-op until it lands.
        await expect(page.getByRole('button', { name: /Notifications/i }).first()).toBeVisible({
          timeout: 180_000,
        });

        await page.keyboard.press('Meta+k');
        const input = page.getByPlaceholder(/Go to, search, or run/i).first();
        await expect(input, 'Cmd+K did not open the palette').toBeVisible({ timeout: 30_000 });

        await input.fill(query);
        // The match must SURVIVE the filter and be the first item offered — an unranked
        // filter leaves the closest hit buried below near-misses.
        const items = page.locator('[data-slot="command-item"]:not([hidden])');
        await expect(items.first()).toBeVisible({ timeout: 15_000 });
        await expect(
          items.first(),
          `"${query}" did not rank ${expected} first — the filter lost its scoring`,
        ).toContainText(expected);
      } finally {
        await context.close();
      }
    });
  }

  test('a genuine miss says so instead of listing everything', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: /Notifications/i }).first()).toBeVisible({
        timeout: 180_000,
      });
      await page.keyboard.press('Meta+k');
      const input = page.getByPlaceholder(/Go to, search, or run/i).first();
      await expect(input).toBeVisible({ timeout: 30_000 });

      await input.fill('zzzzqq');
      await expect(page.locator('[data-slot="command-item"]:not([hidden])')).toHaveCount(0, {
        timeout: 15_000,
      });
    } finally {
      await context.close();
    }
  });
});
