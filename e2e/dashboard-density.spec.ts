import { expect, type Page, test } from '@playwright/test';
import { mintSessionForEmail } from './support/auth';

// Density guard for the flattened dashboard surfaces.
//
// The dashboard was rebuilt from nested cards into edge-to-edge panes separated
// by hairline dividers. Three things regress silently and cost real screen space,
// and none of them break a unit test:
//
//   1. A wrapper re-applies a gutter an ancestor already applied. --shell-gutter
//      and --app-shell-pad-inline resolve to the same value, so charging both is
//      invisible in review and doubles the inset.
//   2. A pass-through <div> creeps back in, deepening the tree.
//   3. A pane regains `border`/`rounded`/`bg-card` inside a bordered ancestor,
//      which docs/styleguide.md bans as card-in-card.
//
// Thresholds are deliberately loose — they catch a structural regression, not a
// 2px design tweak. Before this refactor the home board measured 73px of left
// inset across 19 DOM levels.
//
// Prerequisites (see e2e/README.md):
//   - Chromium: bunx playwright install chromium
//   - Dev server on :3000 with Continuum-Frontend/.env
//   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* for session mint
//
// Run: cd Continuum-Frontend && bun run dashboard:density:e2e

// The local stack (supabase/baseline/fixtures.sql) only seeds local@continuum.test;
// the hosted project has the real owner. Pick by target so the spec runs on both.
const IS_LOCAL_SUPABASE = /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const OWNER_EMAIL =
  process.env.DASHBOARD_DENSITY_EMAIL?.trim() ||
  (IS_LOCAL_SUPABASE ? 'local@continuum.test' : 'duane@continuumai.agency');

const MAX_LEFT_INSET_PX = 48;
const MAX_DOM_DEPTH = 14;

function tid(id: string) {
  return `[data-tour-id="${id}"]`;
}

/** Distance from the right edge of the sidebar rail to an element's first glyph. */
async function leftInsetFromRail(page: Page, selector: string): Promise<number> {
  const railRight = await page.evaluate(() => {
    const rail = document.querySelector('[data-slot="sidebar-container"], aside, nav');
    return rail ? rail.getBoundingClientRect().right : 0;
  });
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box.x - railRight;
}

/** Element-node depth from <main> down to the first match. */
async function depthFromMain(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const main = document.querySelector('main');
    const node = document.querySelector(sel);
    if (!main || !node) return -1;
    let depth = 0;
    let cursor: Element | null = node;
    while (cursor && cursor !== main) {
      depth += 1;
      cursor = cursor.parentElement;
    }
    return cursor === main ? depth : -1;
  }, selector);
}

/** Every element under `root` that actually scrolls vertically. */
async function verticalScrollerCount(page: Page, rootSelector: string): Promise<number> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return -1;
    return Array.from(root.querySelectorAll('*')).filter((el) => {
      const style = getComputedStyle(el);
      const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll';
      return scrolls && el.scrollHeight > el.clientHeight + 1;
    }).length;
  }, rootSelector);
}

/** Bordered boxes whose nearest bordered ancestor is also inside `root`. */
async function cardInCardCount(page: Page, rootSelector: string): Promise<number> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return -1;
    const hasFullBorder = (el: Element) => {
      const s = getComputedStyle(el);
      const w = ['Top', 'Right', 'Bottom', 'Left'].map(
        (side) => Number.parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0,
      );
      const visible = s.borderTopStyle !== 'none' && s.borderTopColor !== 'rgba(0, 0, 0, 0)';
      // Only a box with a border on ALL four sides reads as a card.
      return visible && w.every((v) => v > 0);
    };
    let nested = 0;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (!hasFullBorder(el)) continue;
      // Popovers/dialogs are portalled outside the dashboard root, so anything
      // still inside it is a structural pane and must not be a card.
      let parent = el.parentElement;
      while (parent && parent !== root) {
        if (hasFullBorder(parent)) {
          nested += 1;
          break;
        }
        parent = parent.parentElement;
      }
    }
    return nested;
  }, rootSelector);
}

test.beforeEach(async ({ context }) => {
  const state = await mintSessionForEmail(OWNER_EMAIL);
  await context.addCookies(state.cookies);
});

test.describe('dashboard density', () => {
  test('home board stays flat and shallow', async ({ page }) => {
    await page.goto('/dashboard?view=organic');
    await page.locator(tid('dashboard-overview')).waitFor({ state: 'visible' });

    // The briefing only mounts once the brand has data. The local fixture brand
    // is empty, so the home board renders first-run setup instead and the pane
    // measurements cannot run. Say so loudly rather than passing quietly — a
    // green local run must not read as coverage it did not have.
    const hasBriefing = (await page.locator(tid('dashboard-top-content')).count()) > 0;

    if (hasBriefing) {
      // The pane header's gutter is the same --card-pad the rows use.
      const paneTitle = `${tid('dashboard-top-content')} p.truncate`;
      await page.locator(paneTitle).first().waitFor({ state: 'visible' });

      const headerInset = await leftInsetFromRail(page, paneTitle);
      expect(headerInset, 'left inset from rail to the first pane title').toBeLessThan(
        MAX_LEFT_INSET_PX,
      );

      const headerDepth = await depthFromMain(page, paneTitle);
      expect(headerDepth, 'DOM depth from <main> to a pane title').toBeGreaterThan(0);
      expect(headerDepth, 'DOM depth from <main> to a pane title').toBeLessThanOrEqual(
        MAX_DOM_DEPTH,
      );

      const row = `${tid('dashboard-top-content')} li`;
      if ((await page.locator(row).count()) > 0) {
        const rowInset = await leftInsetFromRail(page, row);
        expect(rowInset, 'left inset from rail to first insight row').toBeLessThan(
          MAX_LEFT_INSET_PX,
        );
        expect(rowInset - headerInset, 'row and pane title share one gutter').toBeLessThan(2);
      }
    } else {
      const notice =
        `SKIPPED pane inset + depth: the brand for ${OWNER_EMAIL} has no dashboard data, ` +
        'so the briefing never mounted. The structural checks below still ran. ' +
        'Set DASHBOARD_DENSITY_EMAIL to an owner with data for full coverage.';
      test.info().annotations.push({ type: 'partial-coverage', description: notice });
      console.warn(`[dashboard-density] ${notice}`);
    }

    expect(
      await cardInCardCount(page, tid('dashboard-overview')),
      'bordered boxes nested inside bordered boxes',
    ).toBe(0);

    expect(
      await verticalScrollerCount(page, tid('dashboard-overview')),
      'vertical scrollers inside the home board',
    ).toBeLessThanOrEqual(1);
  });

  test('organic metrics stays flat', async ({ page }) => {
    // The metrics tab is a ssr:false dynamic import that only mounts on first
    // activation, so in dev the first hit pays a cold compile of a very large
    // chunk. That routinely exceeds the 30s default.
    test.setTimeout(150_000);

    await page.goto('/organic?tab=metrics');
    await page.locator(tid('organic-metrics-dashboard')).waitFor({
      state: 'visible',
      timeout: 120_000,
    });
    await page
      .locator(tid('organic-metrics-scroll-body'))
      .waitFor({ state: 'visible', timeout: 30_000 });

    expect(
      await cardInCardCount(page, tid('organic-metrics-dashboard')),
      'bordered boxes nested inside bordered boxes',
    ).toBe(0);
  });
});
