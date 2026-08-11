import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:tooltip:e2e:bench — the chart hover card, rendered, in both themes.
//
// The defect: --chart-tooltip-background was hard-coded to #0b1220f2 in BOTH the light and
// the dark block of globals.css, so in light mode the optimizer's CPA hover card was a
// near-black panel floating on a white page, matching nothing else in the app. It also had
// no border, so in dark mode it merged into the same-coloured card beneath it.
//
// This asserts the RENDERED result, not the stylesheet: hover the real chart in a real
// Chrome, read the panel's COMPUTED background and border, and require them to equal the
// page's own --popover / --border in that theme. A screenshot is kept beside each assertion
// so the visual outcome is inspectable, but the screenshot is not the test — the computed
// values are, because a screenshot cannot fail.
//
// Read-only apart from the bench user's active-brand preference row, restored in afterAll.
// ---------------------------------------------------------------------------

loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
// The portfolio from the original report, and the only kind that can prove anything here:
// the hero chart needs at least two cycles with a NON-ZERO conversion count, or
// buildCpaHeroPoints yields fewer than two points and renders ChartEmpty. Several accounts
// have long cycle histories and zero conversions — they draw no line to hover.
const BENCH_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const ACCOUNT_ID = '521903353286118';
const PORTFOLIO_NAME = 'ALEIRA / FORMULARIOS';
const SHOTS_DIR = resolve(process.cwd(), 'e2e/.artifacts/optimizer-tooltip-theme');

const admin = createClient(PROD_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false },
});

let storageState: PlaywrightStorageState;
let benchUserId: string;
let originalActiveBrandId: string | null = null;

function subjectOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub as string;
}

async function selectBrand(brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: benchUserId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[tooltip-bench] brand switch failed: ${error.message}`);
}

/** Drive the app's own theme switches. The stylesheet keys off `data-theme` on <html> and
 *  the matching `.light`/`.dark` class — both are set here because globals.css uses both
 *  (the `[data-theme="light"]` overrides and the `.dark` chart block are separate rules). */
async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((value) => {
    const root = document.documentElement;
    root.dataset.theme = value;
    root.classList.remove('light', 'dark');
    root.classList.add(value);
  }, theme);
}

function readVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}

/** Normalise any CSS colour to [r,g,b] by asking the BROWSER, not a regex. Computed styles
 *  come back in whatever form the engine prefers — `rgb()`, `rgba()`, or `color(srgb 1 1 1 /
 *  0.95)` once color-mix() is involved — while the tokens in globals.css are hex. Painting
 *  each value onto a canvas and reading the pixel back is the one comparison that cannot
 *  drift as Chrome changes its serialisation. */
async function toRgb(page: Page, value: string, over: string): Promise<[number, number, number]> {
  return page.evaluate(
    ([color, base]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      // Composite over the PAGE's own background, which is what the tooltip actually sits on.
      // The panel keeps a 5% translucency so the plot stays faintly readable behind it, so
      // comparing raw values would flag that deliberate alpha as a mismatch.
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b] as [number, number, number];
    },
    [value, over] as [string, string],
  );
}

async function expectSameColor(
  page: Page,
  actual: string,
  expected: string,
  what: string,
): Promise<void> {
  const pageBackground = await readVar(page, '--background');
  const a = await toRgb(page, actual, pageBackground);
  const b = await toRgb(page, expected, pageBackground);
  for (let i = 0; i < 3; i++) {
    expect(
      Math.abs(a[i] - b[i]),
      `${what}: rendered ${actual} (rgb ${a}) does not match the page token ${expected} (rgb ${b})`,
    ).toBeLessThanOrEqual(4);
  }
}

/** Open a portfolio's Performance tab and hover its CPA hero chart until the panel appears. */
async function hoverCpaChart(page: Page): Promise<void> {
  await page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
  const accountPicker = page.getByRole('combobox').first();
  await expect(accountPicker).toBeEnabled({ timeout: 180_000 });
  await accountPicker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(ACCOUNT_ID);
  await page.getByRole('option').filter({ hasText: ACCOUNT_ID }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });

  await page.getByRole('tab', { name: /^Portfolios/ }).click();
  await page.getByText(PORTFOLIO_NAME).first().click();
  await expect(page.getByRole('tab', { name: 'Performance' })).toBeVisible({ timeout: 120_000 });

  // Scope by the chart's own data-slot: the page carries many SVGs (icons, gauges, the
  // funnel), and hovering the wrong one raises no card.
  const plot = page.locator('[data-slot="cpa-hero-timeline"] svg').first();
  await expect(plot).toBeVisible({ timeout: 120_000 });
  const box = await plot.boundingBox();
  if (!box) throw new Error('[tooltip-bench] the CPA hero chart never laid out');

  const panel = page.locator('[data-slot="chart-tooltip-panel"]').first();
  for (let step = 3; step <= 17; step++) {
    await page.mouse.move(box.x + (box.width * step) / 20, box.y + box.height / 2);
    await page.waitForTimeout(120);
    if (await panel.isVisible().catch(() => false)) return;
  }
  await expect(panel, 'the CPA hero chart never raised its hover card').toBeVisible({
    timeout: 10_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Optimizer — the chart hover card belongs to its theme', () => {
  test.beforeAll(async () => {
    const memberToken = await mintAccessTokenForEmail(OWNER_EMAIL);
    benchUserId = subjectOf(memberToken);
    storageState = await mintSessionForEmail(OWNER_EMAIL);

    const { data: pref } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', benchUserId)
      .maybeSingle();
    originalActiveBrandId = (pref as { active_brand_id: string } | null)?.active_brand_id ?? null;
    await selectBrand(BENCH_BRAND_ID);
    mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    if (originalActiveBrandId) await selectBrand(originalActiveBrandId);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the panel takes the ${theme} popover surface and a real border`, async ({ browser }) => {
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      try {
        await hoverCpaChart(page);
        await applyTheme(page, theme);

        const panel = page.locator('[data-slot="chart-tooltip-panel"]').first();
        await expect(panel).toBeVisible();

        const [background, borderColor, borderWidth] = await panel.evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.backgroundColor, style.borderTopColor, style.borderTopWidth];
        });

        await page.screenshot({
          path: resolve(SHOTS_DIR, `cpa-hover-card-${theme}.png`),
          clip: (await panel.boundingBox()) ?? undefined,
        });

        // The whole fix: the panel is the page's popover surface, per theme — NOT a fixed
        // near-black that only happened to look right in one of them.
        await expectSameColor(
          page,
          background,
          await readVar(page, '--popover'),
          `${theme} panel background`,
        );
        await expectSameColor(
          page,
          borderColor,
          await readVar(page, '--border'),
          `${theme} panel border`,
        );
        expect(
          Number.parseFloat(borderWidth),
          'the panel must draw a border, or it merges into a same-coloured card beneath it',
        ).toBeGreaterThan(0);

        // The events divider used to be border-white/15, which globals.css repaints via
        // `[data-theme="light"] [class*="border-white"] { ... !important }` — a pale violet
        // line on a near-black panel. It now shares the panel's own border token.
        const divider = panel.locator('.border-chart-tooltip-border').first();
        if (await divider.count()) {
          await expectSameColor(
            page,
            await divider.evaluate((el) => getComputedStyle(el).borderTopColor),
            await readVar(page, '--border'),
            `${theme} events divider`,
          );
        }
      } finally {
        await context.close();
      }
    });
  }
});
