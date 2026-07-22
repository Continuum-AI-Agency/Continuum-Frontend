import { expect, type Page, test } from '@playwright/test';
import { mintSessionForEmail } from './support/auth';

// Headless browser inspection of Organic Metrics → Compare.
//
// Target brand (default): La Chica de la IA under duane@continuumai.agency
// (IG lachicadelaia + YouTube Michelle Shocron). Active brand is pinned via
// user_brand_preferences before the run when SUPABASE_SERVICE_ROLE_KEY is set.
//
// Prerequisites (see e2e/README.md):
//   - Chromium: bunx playwright install chromium
//   - Dev server on :3000 (auto-started) with Continuum-Frontend/.env
//   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* for session mint
//
// Run:
//   cd Continuum-Frontend && bun run organic:metrics:compare:e2e
//
// Optional: ORGANIC_METRICS_BENCH_SCREENSHOT_DIR=./tmp/compare-bench to dump PNGs.

const SCREENSHOT_DIR = process.env.ORGANIC_METRICS_BENCH_SCREENSHOT_DIR;
const OWNER_EMAIL = process.env.ORGANIC_METRICS_BENCH_EMAIL?.trim() || 'duane@continuumai.agency';
const BRAND_ID =
  process.env.ORGANIC_METRICS_BENCH_BRAND_ID?.trim() || '46f0deba-013f-4bd9-a70e-2526677a831d'; // La Chica de la IA
const OWNER_USER_ID =
  process.env.ORGANIC_METRICS_BENCH_USER_ID?.trim() || 'bc29b6ab-8711-4a5e-9deb-a3182844b16c';

function tid(id: string) {
  return `[data-tour-id="${id}"]`;
}

async function dump(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
  console.log(`[organic-metrics-compare] screenshot → ${SCREENSHOT_DIR}/${name}.png`);
}

async function pinActiveBrand() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
    /\/$/,
    '',
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('[organic-metrics-compare] skip pinActiveBrand (missing service role / URL)');
    return;
  }
  const res = await fetch(`${url}/rest/v1/user_brand_preferences?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': 'brand_profiles',
      'Content-Profile': 'brand_profiles',
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: OWNER_USER_ID,
      active_brand_id: BRAND_ID,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pinActiveBrand failed HTTP ${res.status}: ${body}`);
  }
  console.log(`[organic-metrics-compare] pinned active brand ${BRAND_ID} for ${OWNER_EMAIL}`);
}

async function openMetricsCompare(page: Page) {
  await page.goto('/organic?tab=metrics', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(tid('organic-metrics-dashboard'))).toBeVisible({
    timeout: 90_000,
  });

  const compareTab = page.locator(tid('metrics-view-compare'));
  await expect(compareTab).toBeVisible();
  await compareTab.click();

  await expect(page.locator(tid('organic-compare-view'))).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('organic metrics compare (headless)', () => {
  test('La Chica de la IA — selector + Decompose/Blend/Both', async ({ browser }) => {
    await pinActiveBrand();
    const storageState = await mintSessionForEmail(OWNER_EMAIL);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      await openMetricsCompare(page);
      await dump(page, '01-compare-default');

      await expect(page.locator(tid('metrics-scope-selector'))).toBeVisible();
      await expect(page.locator(tid('metrics-scope-platforms'))).toBeVisible();
      await expect(page.locator(tid('metrics-scope-separator'))).toBeVisible();
      await expect(page.locator(tid('metrics-scope-accounts'))).toBeVisible();

      const platformLabels = await page
        .locator(`${tid('metrics-scope-platforms')} button`)
        .allTextContents();
      console.log(
        '[organic-metrics-compare] platforms:',
        platformLabels.map((t) => t.trim()).join(' | '),
      );
      // Brand has IG + YouTube organic.
      expect(platformLabels.some((t) => /instagram/i.test(t))).toBeTruthy();

      // Default series mode is Decompose (lowest level / per-account).
      const decompose = page.locator(tid('series-mode-decompose'));
      await expect(decompose).toBeVisible({ timeout: 60_000 });
      await expect(decompose).toHaveAttribute('data-state', 'active');

      // Blend mode must not empty the surface — identity for single-platform picks.
      await page.locator(tid('series-mode-blend')).click();
      await expect(page.locator(tid('series-mode-blend'))).toHaveAttribute('data-state', 'active');
      await dump(page, '02-compare-blend');

      const matrix = page.locator(tid('organic-compare-matrix'));
      await expect(matrix).toBeVisible({ timeout: 60_000 });
      const rowCount = await matrix.locator('tbody tr').count();
      expect(rowCount).toBeGreaterThanOrEqual(1);
      console.log('[organic-metrics-compare] matrix rows:', rowCount);

      await page.locator(tid('series-mode-both')).click();
      await expect(page.locator(tid('series-mode-both'))).toHaveAttribute('data-state', 'active');
      await dump(page, '03-compare-both');

      // Account tab: single-mode selector (familiar platform → account).
      await page.locator(tid('metrics-view-account')).click();
      await expect(page.locator(tid('metrics-scope-selector'))).toHaveAttribute(
        'data-mode',
        'single',
      );
      await dump(page, '04-account-view');

      // Prefer Instagram as the lowest-level default when present.
      const igChip = page.locator(tid('scope-platform-instagram'));
      if ((await igChip.count()) > 0) {
        await igChip.click();
        await expect(igChip).toHaveAttribute('data-selected', 'true');
        // Click first account chip under the scope bar if present.
        const accountChip = page.locator(`${tid('metrics-scope-accounts')} button`).first();
        if ((await accountChip.count()) > 0) {
          await accountChip.click();
        }
        // Wait for either loaded dashboard content or a real empty/error — not the
        // "Select an account" idle prompt once an account is chosen.
        await expect(page.locator(tid('organic-metrics-dashboard'))).not.toContainText(
          'Select an account above',
          { timeout: 90_000 },
        );
        await dump(page, '05-account-instagram');
      }
    } finally {
      await context.close();
    }
  });
});
