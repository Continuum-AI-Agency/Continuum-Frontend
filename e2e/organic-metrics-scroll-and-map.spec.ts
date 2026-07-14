import { expect, type Page, test } from '@playwright/test';
import { mintSessionForEmail } from './support/auth';

// Headless proof for the three Organic METRICS-tab UX bugs (#178/#179/#180),
// driven against a real brand with real Instagram metrics:
//
//   #178 the tab scrolls on ONE axis — a wheel with the cursor over a card, over
//        the "What's Working" table, or over the map moves the same surface.
//   #179 "What's Working" reads as the focal card (brand accent + ranked chips).
//   #180 city names are painted on the map, not hidden behind a hover tooltip.
//
// Prerequisites (see e2e/README.md):
//   - Chromium: bunx playwright install chromium
//   - A dev server pointed at PROD Supabase. Note `.env.local` (local Supabase)
//     shadows `.env` for `bun run dev`, so export the prod values into the shell
//     first — shell env wins over Next's .env files.
//   - NEXT_PUBLIC_SUPABASE_URL + a publishable key + SUPABASE_SERVICE_ROLE_KEY
//     for the session mint.
//
// Run:
//   cd Continuum-Frontend && playwright test e2e/organic-metrics-scroll-and-map.spec.ts --workers=1

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
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
  console.log(`[organic-metrics-scroll] screenshot → ${SCREENSHOT_DIR}/${name}.png`);
}

async function dumpElement(page: Page, selector: string, name: string) {
  if (!SCREENSHOT_DIR) return;
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await target.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  console.log(`[organic-metrics-scroll] screenshot → ${SCREENSHOT_DIR}/${name}.png`);
}

async function pinActiveBrand() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
    /\/$/,
    '',
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('pinActiveBrand needs NEXT_PUBLIC_SUPABASE_URL + service role');
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
  if (!res.ok) throw new Error(`pinActiveBrand failed HTTP ${res.status}: ${await res.text()}`);
}

// Every element under the dashboard that actually scrolls vertically right now.
// A trap is any of these other than the one metrics body.
async function verticalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-tour-id="organic-metrics-dashboard"]');
    if (!root) return ['<no dashboard>'];
    return Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        const scrollable = overflowY === 'auto' || overflowY === 'scroll';
        return scrollable && el.scrollHeight > el.clientHeight + 1;
      })
      .map(
        (el) =>
          el.getAttribute('data-tour-id') ??
          `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`,
      );
  });
}

// The account view keeps growing as awareness, the strategy report and the
// demographics land. Probing the wheel mid-reflow measures the reflow, not the fix.
async function settleLayout(page: Page): Promise<void> {
  const body = page.locator(tid('organic-metrics-scroll-body'));
  let previous = -1;
  for (let sample = 0; sample < 30; sample += 1) {
    const height = await body.evaluate((el) => el.scrollHeight);
    if (height === previous) return;
    previous = height;
    await page.waitForTimeout(1_000);
  }
}

async function scrollBodyMetrics(page: Page): Promise<{ top: number; max: number }> {
  return page
    .locator(tid('organic-metrics-scroll-body'))
    .evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
}

// A point inside `locator` that is genuinely on-screen inside the scroll pane, and
// the element the browser will actually deliver a wheel to there. Re-read until the
// two agree — a stale box after a reflow would otherwise wheel at the app header and
// look exactly like a swallowed wheel.
async function pointInsidePane(
  page: Page,
  locator: string,
): Promise<{ x: number; y: number; hit: string }> {
  const target = page.locator(locator).first();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const box = await target.boundingBox();
    const bodyBox = await page.locator(tid('organic-metrics-scroll-body')).boundingBox();
    if (!box || !bodyBox) throw new Error(`no bounding box for ${locator}`);

    const left = Math.max(box.x, bodyBox.x) + 8;
    const right = Math.min(box.x + box.width, bodyBox.x + bodyBox.width) - 8;
    const top = Math.max(box.y, bodyBox.y) + 8;
    const bottom = Math.min(box.y + box.height, bodyBox.y + bodyBox.height) - 8;
    if (right <= left || bottom <= top) continue;

    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px as number, py as number) as HTMLElement | null;
        if (!el) return null;
        const inPane = el.closest('[data-tour-id="organic-metrics-scroll-body"]') !== null;
        return inPane ? `${el.tagName}.${el.className.toString().slice(0, 32)}` : null;
      },
      [x, y],
    );
    if (hit) return { x, y, hit };
  }
  throw new Error(`could not land the cursor inside the metrics pane over ${locator}`);
}

// Put the cursor over `locator`, wheel, and report how far the ONE scroll body moved.
// Wheels away from whichever end the body is already parked at, so "no room left"
// can never masquerade as "the wheel was swallowed".
async function wheelOver(page: Page, locator: string): Promise<number> {
  const { x, y, hit } = await pointInsidePane(page, locator);
  const before = await scrollBodyMetrics(page);

  await page.mouse.move(x, y);
  await page.mouse.wheel(0, before.top >= before.max - 5 ? -400 : 400);
  await page.waitForTimeout(500);

  const after = await scrollBodyMetrics(page);
  const moved = Math.abs(after.top - before.top);
  console.log(
    `[organic-metrics-scroll] wheel over ${locator} → hit ${hit}; scrollTop ${before.top}/${before.max} → ${after.top} (moved ${moved})`,
  );
  return moved;
}

test.describe('organic metrics tab: one scroll axis, focal insight card, named cities', () => {
  // Real Instagram metrics + the materialized creative-strategy report are fetched
  // live; the account view is not interactive until both land.
  test.setTimeout(420_000);

  test('scrolls from anywhere, shows city names, and elevates What is Working', async ({
    browser,
  }) => {
    await pinActiveBrand();
    const storageState = await mintSessionForEmail(OWNER_EMAIL);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      await page.goto('/organic?tab=metrics', { waitUntil: 'domcontentloaded', timeout: 120_000 });

      // The metrics dashboard is a lazy chunk; a cold dev server can lose the first
      // request for it while the route is still compiling. Reload rather than call
      // the feature broken.
      const dashboard = page.locator(tid('organic-metrics-dashboard'));
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const appeared = await dashboard
          .waitFor({ state: 'visible', timeout: 60_000 })
          .then(() => true)
          .catch(() => false);
        if (appeared) break;
        console.log('[organic-metrics-scroll] dashboard chunk missing — reloading');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      }
      await expect(dashboard).toBeVisible({ timeout: 60_000 });

      const scrollBody = page.locator(tid('organic-metrics-scroll-body'));
      await expect(scrollBody).toBeVisible();

      // The focal card only exists once the materialized report is ready.
      const whatsWorking = page.locator(tid('organic-whats-working'));
      await expect(whatsWorking).toBeVisible({ timeout: 90_000 });
      await expect(
        page.locator(`${tid('organic-whats-working')} >> text=#1`).first(),
      ).toBeVisible();
      await settleLayout(page);
      await dump(page, '01-account-view');
      await whatsWorking.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(600);
      await dump(page, '01b-whats-working-card');

      // #178 — the account view carries exactly one vertical scroller.
      expect(await verticalScrollers(page)).toEqual(['organic-metrics-scroll-body']);

      // #180 — switch the location card to City and read the names off the map.
      await scrollBody.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const cityToggle = page.getByRole('button', { name: 'Show city location data' });
      await expect(cityToggle).toBeVisible({ timeout: 30_000 });
      await cityToggle.click();

      // MarkerLabel (ui/map) paints a persistent, non-interactive text node inside the
      // marker element; before the fix a marker held nothing but the coloured circle.
      const mapLabels = page.locator('.maplibregl-marker .whitespace-nowrap');
      await expect(mapLabels.first()).toBeVisible({ timeout: 60_000 });
      const labelTexts = (await mapLabels.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      console.log(`[organic-metrics-scroll] city labels on map: ${labelTexts.join(' | ')}`);
      expect(labelTexts.length).toBeGreaterThan(0);
      // The top city by followers must be one of the names that survives placement.
      expect(labelTexts).toContain('Buenos Aires');

      // No label may overprint another — the Río de la Plata cluster is the whole test.
      const overprints = await page.evaluate(() => {
        const rects = Array.from(
          document.querySelectorAll<HTMLElement>('.maplibregl-marker .whitespace-nowrap'),
        ).map((el) => ({ text: el.textContent ?? '', rect: el.getBoundingClientRect() }));
        const clashes: string[] = [];
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            if (!a || !b) continue;
            const hit =
              a.rect.left < b.rect.right &&
              a.rect.right > b.rect.left &&
              a.rect.top < b.rect.bottom &&
              a.rect.bottom > b.rect.top;
            if (hit) clashes.push(`${a.text} ↔ ${b.text}`);
          }
        }
        return clashes;
      });
      console.log(
        `[organic-metrics-scroll] overlapping label pairs: ${overprints.length === 0 ? 'none' : overprints.join(', ')}`,
      );
      expect(overprints).toEqual([]);
      await settleLayout(page);
      await dumpElement(page, tid('organic-audience-location'), '02-city-map-labels');

      // The city layer must not re-open a scroller either.
      expect(await verticalScrollers(page)).toEqual(['organic-metrics-scroll-body']);

      // With the view fully materialized, the wheel has to drive the same pane from
      // over an ordinary card, from over the "What's Working" table (which used to
      // swallow it at 34rem), and from over the map (cooperative gestures: ⌘/ctrl
      // zooms, a plain wheel scrolls).
      expect(await wheelOver(page, tid('organic-whats-working'))).toBeGreaterThan(0);
      expect(await wheelOver(page, `${tid('organic-whats-working')} table`)).toBeGreaterThan(0);
      expect(await wheelOver(page, '.maplibregl-canvas')).toBeGreaterThan(0);

      // #178 (posts view) — the gallery used to be its own max-h scroller.
      await page.locator(tid('metrics-view-posts')).click();
      await page.waitForTimeout(5_000);
      await settleLayout(page);
      // The claim is only meaningful once the gallery is long enough to scroll.
      await expect
        .poll(async () => (await scrollBodyMetrics(page)).max, { timeout: 90_000 })
        .toBeGreaterThan(0);
      const postsScrollers = await verticalScrollers(page);
      console.log(`[organic-metrics-scroll] posts-view scrollers: ${postsScrollers.join(', ')}`);
      expect(postsScrollers).toEqual(['organic-metrics-scroll-body']);
      await dump(page, '03-posts-view');
    } finally {
      await context.close();
    }
  });
});
