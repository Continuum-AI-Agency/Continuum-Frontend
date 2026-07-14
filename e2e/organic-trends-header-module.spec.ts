import { expect, type Page, test } from '@playwright/test';
import { mintSessionForEmail } from './support/auth';

// Headless proof that Brand Insights left the Organic metrics scroll body and now
// lives in the toolbar: hover for the digest, click for the full panel.
//
// Prerequisites (see e2e/README.md):
//   - Chromium: bunx playwright install chromium
//   - Dev server on :3000 (auto-started) with Continuum-Frontend/.env
//   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* for session mint
//
// Run:
//   cd Continuum-Frontend && bun run organic:trends:header:e2e

const SCREENSHOT_DIR = process.env.ORGANIC_TRENDS_BENCH_SCREENSHOT_DIR;
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
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  console.log(`[organic-trends-header] screenshot → ${SCREENSHOT_DIR}/${name}.png`);
}

async function pinActiveBrand() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
    /\/$/,
    '',
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('[organic-trends-header] skip pinActiveBrand (missing service role / URL)');
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
    throw new Error(`pinActiveBrand failed HTTP ${res.status}: ${await res.text()}`);
  }
}

test.describe('organic trends header module (headless)', () => {
  test('trends collapses into the toolbar and opens on click', async ({ browser }) => {
    await pinActiveBrand();
    const storageState = await mintSessionForEmail(OWNER_EMAIL);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      await page.goto('/organic?tab=metrics', { waitUntil: 'domcontentloaded' });

      const dashboard = page.locator(tid('organic-metrics-dashboard'));
      await expect(dashboard).toBeVisible({ timeout: 90_000 });

      const trigger = page.locator(tid('organic-metrics-brand-trends'));
      await expect(trigger).toBeVisible();
      await dump(page, '01-toolbar-collapsed');

      // The panel it replaced must be gone from the scroll body on every view —
      // that is the regression this whole change exists to fix.
      const panel = page.locator(tid('brand-trends'));
      await expect(panel).toHaveCount(0);
      await expect(page.getByText('Current trend signals')).toHaveCount(0);

      // The trigger sits in the toolbar, above the scroll body.
      const toolbar = dashboard.locator('> div').first();
      await expect(toolbar.locator(tid('organic-metrics-brand-trends'))).toHaveCount(1);

      // Hover → digest.
      await trigger.hover();
      await expect(page.getByText('Brand insights')).toBeVisible({ timeout: 10_000 });
      await dump(page, '02-hover-peek');

      // Click → full panel, with its tabs and week controls.
      await trigger.click();
      await expect(page.getByText('Current trend signals')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('tab', { name: /Trends/ })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Events/ })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Questions/ })).toBeVisible();
      await dump(page, '03-panel-open');

      // Escape closes it and hands focus back to the trigger.
      await page.keyboard.press('Escape');
      await expect(page.getByText('Current trend signals')).toHaveCount(0);
      await expect(trigger).toBeFocused();

      // It stays reachable from the other views, and still never enters the body.
      for (const view of ['metrics-view-posts', 'metrics-view-compare']) {
        await page.locator(tid(view)).click();
        await expect(page.locator(tid('organic-metrics-brand-trends'))).toBeVisible();
        await expect(page.locator(tid('brand-trends'))).toHaveCount(0);
      }
      await dump(page, '04-compare-view-no-panel-in-body');
    } finally {
      await context.close();
    }
  });
});
