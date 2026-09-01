import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';

const adminStorageStatePath = process.env.E2E_ADMIN_STORAGE_STATE_PATH;

function requireAuthorizedAdminState(): string {
  if (!adminStorageStatePath || !existsSync(adminStorageStatePath)) {
    throw new Error(
      'E2E_ADMIN_STORAGE_STATE_PATH must point to a pre-approved, short-lived admin Playwright storage-state file.',
    );
  }
  return adminStorageStatePath;
}

test('admin search preserves newer typing when an older real response settles', async ({
  browser,
  baseURL,
}) => {
  // Measured against `next dev`: 17-52s idle, past 90s while a second bench shared the
  // dev server. The spec types ~25 characters, each one a debounced RSC navigation that
  // round-trips the real admin-list-users edge function, and it deliberately holds one
  // of those responses open. Playwright's 30s default cut the run off mid-race; the race
  // choreography was never the slow part.
  test.setTimeout(90_000);

  const targetUrl = new URL(baseURL ?? 'http://localhost:3000');
  if (!['localhost', '127.0.0.1'].includes(targetUrl.hostname)) {
    throw new Error('admin:search:e2e:bench only intercepts requests against a local Frontend.');
  }

  const context = await browser.newContext({
    storageState: requireAuthorizedAdminState(),
  });
  const page = await context.newPage();

  try {
    await page.goto('/admin');
    const searchInput = page.getByRole('textbox', { name: 'Search users' });
    await expect(searchInput).toBeVisible();

    const firstUserCell = page
      .getByTestId('admin-user-directory-results')
      .locator('tbody tr')
      .first()
      .locator('td')
      .first();
    const email = (await firstUserCell.locator('p').last().innerText()).trim();
    expect(email).toContain('@');

    const prefixLength = Math.min(3, Math.max(1, email.indexOf('@')));
    const prefix = email.slice(0, prefixLength);
    let releasePrefixRequest = () => {};
    const prefixRequestGate = new Promise<void>((resolve) => {
      releasePrefixRequest = resolve;
    });
    let markPrefixRequestStarted = () => {};
    const prefixRequestStarted = new Promise<void>((resolve) => {
      markPrefixRequestStarted = resolve;
    });
    let heldPrefixRequest = false;

    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const isPrefixSearch =
        requestUrl.pathname === '/admin' &&
        requestUrl.searchParams.get('query') === prefix &&
        requestUrl.searchParams.has('_rsc');

      if (isPrefixSearch && !heldPrefixRequest) {
        heldPrefixRequest = true;
        markPrefixRequestStarted();
        await prefixRequestGate;
      }

      await route.continue();
    });

    await searchInput.fill(prefix);
    await prefixRequestStarted;

    const prefixResponse = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return (
        responseUrl.pathname === '/admin' &&
        responseUrl.searchParams.get('query') === prefix &&
        responseUrl.searchParams.has('_rsc')
      );
    });

    await searchInput.type(email.slice(prefix.length), { delay: 10 });
    await expect(searchInput).toHaveValue(email);

    releasePrefixRequest();
    await prefixResponse;
    await expect(searchInput).toHaveValue(email);

    await expect(page).toHaveURL((url) => url.searchParams.get('query') === email);
    await expect(page.getByTestId('admin-user-directory-results')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(page.getByTestId('admin-user-directory-results')).toContainText(email);
  } finally {
    await context.close();
  }
});

/**
 * Airtable #263 / #275 / #279 — the admin panel's geometry, in a real browser.
 *
 * Three records, twelve days apart, one defect: the tab bar and the four stat tiles
 * were laid out side by side in a single header row, so at >=1280px the tab bar took
 * 28% of the panel and the rest of that row was the empty box in the screenshots.
 * Below it, the directory's table was capped at `64vh` — a viewport fraction, not the
 * space the panel actually had left — so the panel always overflowed and the
 * pagination row landed below the fold.
 *
 * Geometry is what fails the build; the screenshots are for human sign-off.
 */
const LAYOUT_SCREENSHOT_DIR =
  process.env.ADMIN_LAYOUT_SCREENSHOT_DIR ?? 'e2e/__screenshots__/admin-layout';

const LAYOUT_VIEWPORTS = [
  { label: '1440x900', width: 1440, height: 900 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

// The panel's own width, not the tab bar's content width: the defect was a tab bar
// that shrank to its 5 triggers and left the remainder of the row empty.
const MIN_PANEL_WIDTH_SHARE = 0.9;
// The header band the tabs must render inside, matching airtable:regression:bench.
const MAX_TABS_OFFSET_PX = 240;

test('admin header spans the panel and the directory fits above the fold', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: requireAuthorizedAdminState(),
  });
  const page = await context.newPage();

  try {
    await page.goto('/admin');
    await expect(page.getByRole('tablist')).toBeVisible();
    // The server HTML already carries the real layout, so the assertions below pass
    // against it while hydration is still swapping the shell through its skeleton.
    // Measure and photograph the hydrated page, not the one on its way there.
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-user-directory-results')).toHaveAttribute(
      'aria-busy',
      'false',
    );

    for (const viewport of LAYOUT_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Settle before measuring: a Fast Refresh or a router transition can swap the
      // panel for its skeleton, which measures as a layout that isn't there.
      await expect(page.getByTestId('admin-user-directory-results')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await expect(page.getByRole('navigation', { name: 'pagination' })).toBeVisible();

      const geometry = await page.evaluate(() => {
        const measure = (element: Element | null | undefined) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, width: rect.width };
        };
        const tablist = document.querySelector('[role="tablist"]');
        const panel = document.querySelector('main');
        const brandCells = Array.from(
          document.querySelectorAll(
            '[data-testid="admin-user-directory-results"] tbody tr td:nth-child(2) p',
          ),
        );
        return {
          tablist: measure(tablist),
          // The stat tiles are the header row's second child, whatever it is called.
          statTiles: measure(tablist?.parentElement?.children[1]),
          panel: measure(panel),
          pagination: measure(document.querySelector('nav[aria-label="pagination"]')),
          viewportHeight: window.innerHeight,
          brandCellCount: brandCells.length,
          clippedBrandCellsWithoutTitle: brandCells.filter(
            (cell) => cell.scrollWidth > cell.clientWidth + 1 && !cell.getAttribute('title'),
          ).length,
        };
      });

      const { tablist, statTiles, panel, pagination } = geometry;
      expect(tablist, `${viewport.label}: no tab bar`).not.toBeNull();
      expect(statTiles, `${viewport.label}: no stat tiles`).not.toBeNull();
      expect(panel, `${viewport.label}: no panel`).not.toBeNull();
      expect(pagination, `${viewport.label}: no pagination`).not.toBeNull();
      if (!tablist || !statTiles || !panel || !pagination) return;

      // #263 / #275 — the tab bar and the tiles each span the panel; no empty column.
      expect(
        tablist.width / panel.width,
        `${viewport.label}: tab bar is ${Math.round((tablist.width / panel.width) * 100)}% of the ${Math.round(panel.width)}px panel`,
      ).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH_SHARE);
      expect(
        statTiles.width / panel.width,
        `${viewport.label}: stat tiles are ${Math.round((statTiles.width / panel.width) * 100)}% of the panel`,
      ).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH_SHARE);
      expect(
        tablist.top - panel.top,
        `${viewport.label}: tab bar sits ${Math.round(tablist.top - panel.top)}px below the panel top`,
      ).toBeLessThanOrEqual(MAX_TABS_OFFSET_PX);

      // #279 — pagination is reachable without scrolling the panel.
      expect(pagination.top, `${viewport.label}: pagination scrolled off the top`).toBeGreaterThan(
        0,
      );
      expect(
        pagination.bottom,
        `${viewport.label}: pagination ends at ${Math.round(pagination.bottom)}px in a ${geometry.viewportHeight}px viewport`,
      ).toBeLessThanOrEqual(geometry.viewportHeight);

      // #263 — a truncated Brands summary still has to be readable.
      expect(geometry.brandCellCount).toBeGreaterThan(0);
      expect(
        geometry.clippedBrandCellsWithoutTitle,
        `${viewport.label}: ${geometry.clippedBrandCellsWithoutTitle} clipped Brands cells carry no title`,
      ).toBe(0);

      await page.screenshot({
        path: `${LAYOUT_SCREENSHOT_DIR}/admin-${viewport.label}.png`,
      });
    }
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// Admin brand picker — #276 (truncation + scroll) and #278 (search).
//
// #276 can only be settled with COMPUTED WIDTHS: `truncate` keeps the full string in
// textContent and clips it in pixels, so any DOM-text assertion passes while the user
// still reads `eviechamps123's Brand — eviechamps123@…`. Every label element here is
// therefore measured (`scrollWidth <= clientWidth`), in a real Chromium, on the real
// /admin page, against a real `list_brands` response from the real edge function.
//
// #278 was filed as "search fails on the brand's real name" and blamed on a missing
// query normaliser. There is no normaliser — cmdk's own command-score is the matcher —
// so this drives the four reported queries through the real picker instead of scoring a
// string in isolation.
//
// Runs against the LOCAL stack (it writes brand rows), like admin:audit:e2e:bench:
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//
// Un-exercised hop, stated explicitly: production's 321-brand list is not reproduced
// here — the seeded set is 14 brands. That the whole list is reachable at all is the
// `list_brands` cap, measured against production by airtable:regression:bench.

const PICKER_MARKER = `bench-picker-${crypto.randomUUID().slice(0, 8)}`;

// The brand the #278 reporter searched for, named EXACTLY as production stores it. The
// four queries below are the record's own DoD.
const VIVO_BRAND_NAME = 'VIVO 47 Center';
const VIVO_QUERIES = ['VIVO 47 center', 'vivo47', 'Vivo 47', '47 center'];

// Enough same-token brands that the matches cannot fit the list's max height, so
// "scrolls to every match" is a measurement and not an assumption.
const FILLER_BRAND_COUNT = 13;

/**
 * The local GoTrue's dial to Postgres times out under machine load and surfaces as a 5xx
 * with an EMPTY message — the same transient e2e/support/auth.ts retries. Creating the
 * actor is the one auth call this spec makes outside that helper, so it retries here too.
 */
async function createLocalAdminUser(supabase: SupabaseClient, email: string): Promise<string> {
  let lastMessage = 'unknown';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { is_admin: true },
    });
    if (data?.user?.id) return data.user.id;
    lastMessage = error?.message || `status ${error?.status ?? 'none'}`;
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
  }
  throw new Error(`[admin brand picker] could not create the admin actor: ${lastMessage}`);
}

/**
 * Every brand this spec has ever seeded, by name. Used before seeding (so an aborted run
 * cannot poison the next one) and after (so the local stack goes back to what it was).
 */
async function purgeSeededBrands(supabase: SupabaseClient): Promise<void> {
  // Two selects rather than one `.or(...)`: a PostgREST `or` value containing spaces has
  // to be quoted, and an unquoted "VIVO 47 Center" silently matches nothing — which is
  // how fifteen seeded brands survived a run that reported a clean teardown.
  const brands = supabase.schema('brand_profiles').from('brand_profiles');
  const [exact, prefixed] = await Promise.all([
    brands.select('id').eq('brand_name', VIVO_BRAND_NAME),
    brands.select('id').like('brand_name', 'bench-picker-%'),
  ]);
  const ids = [...(exact.data ?? []), ...(prefixed.data ?? [])].map(
    (row) => (row as { id: string }).id,
  );
  if (ids.length === 0) return;
  // Permissions first: the brand cascade trips the pause_automations trigger.
  await supabase.schema('brand_profiles').from('permissions').delete().in('brand_profile_id', ids);
  await supabase.schema('brand_profiles').from('brand_profiles').delete().in('id', ids);
}

/** This spec's own actors, including any a timed-out run left behind. */
async function purgeSeededAdmins(supabase: SupabaseClient, currentUserId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(currentUserId).catch(() => {});
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email?.startsWith('brand-picker-') && user.email.endsWith('@continuum-e2e.test')) {
      await supabase.auth.admin.deleteUser(user.id).catch(() => {});
    }
  }
}

function brandAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[admin brand picker] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function assertLocalBrandPickerTarget(baseURL: string | undefined): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';
  if (!['localhost', '127.0.0.1'].includes(supabaseHost)) {
    throw new Error(
      `[admin brand picker] seeds brand rows; it refuses to run against ${supabaseHost || 'an unset Supabase URL'}. Run \`bun run supabase:env:local\`.`,
    );
  }
  const target = new URL(baseURL ?? 'http://localhost:3000');
  if (!['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error('[admin brand picker] run it against a local Frontend.');
  }
}

/** Every label element the picker paints, measured for pixel clipping. */
const COLLECT_CLIPPED = (root: HTMLElement) => {
  const clipped: { text: string; scrollWidth: number; clientWidth: number }[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('span'))];
  for (const element of elements) {
    if (element.clientWidth === 0) continue;
    if (element.scrollWidth > element.clientWidth + 1) {
      clipped.push({
        text: (element.textContent ?? '').slice(0, 80),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      });
    }
  }
  return clipped;
};

test('admin brand picker shows every match in full and scrolls to the rest', async ({
  browser,
  baseURL,
}) => {
  // Minting an actor, seeding fifteen brands and cold-compiling /admin all happen before
  // the first assertion; the default 30s covers none of it on a loaded machine.
  test.setTimeout(180_000);
  assertLocalBrandPickerTarget(baseURL);

  const supabase = brandAdminClient();

  // The actor is created here rather than by mintSession so the spec KNOWS which id and
  // which email its seeded brands will carry — the owner email is what #276 clips, so it
  // has to be an exact expected string, not whichever `e2e-admin-*` row a scan finds
  // first. It is long on purpose: length is the whole defect.
  const adminEmail = `brand-picker-${crypto.randomUUID()}@continuum-e2e.test`;
  const adminUserId = await createLocalAdminUser(supabase, adminEmail);
  const context = await browser.newContext({ storageState: await mintSessionForEmail(adminEmail) });
  const page = await context.newPage();

  const seededBrandIds: string[] = [];

  try {
    // One round trip: fifteen sequential inserts against the local stack under load are
    // slower than the whole browser half of this test.
    const names = [
      VIVO_BRAND_NAME,
      `${PICKER_MARKER} eviechamps123's Brand`,
      ...Array.from(
        { length: FILLER_BRAND_COUNT },
        (_unused, index) => `${PICKER_MARKER} Centro Comercial ${index}`,
      ),
    ];
    // Self-healing: a run killed by a timeout leaves its rows behind, and a leftover
    // "VIVO 47 Center" would make the #278 assertion count two of the same brand.
    await purgeSeededBrands(supabase);

    const { data: seeded, error: seedError } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .insert(names.map((brand_name) => ({ brand_name, created_by: adminUserId })))
      .select('id');
    if (seedError) throw new Error(`[admin brand picker] seed: ${seedError.message}`);
    seededBrandIds.push(...(seeded as Array<{ id: string }>).map((row) => row.id));

    const list = page.getByTestId('brand-picker-list');
    const options = page.getByTestId('brand-picker-option');
    const searchBox = page.getByPlaceholder('Search brands, owners, or ids…');

    // The local edge runtime cancels `list_brands` outright when it trips its CPU limit
    // ("WorkerRequestCancelled"), and the picker then renders an empty list that never
    // refills on its own. That is machine load, not a defect, so reload rather than
    // assert a false red -- but only a bounded number of times.
    for (let attempt = 1; ; attempt += 1) {
      await page.goto('/admin?tab=workflows');
      const trigger = page.locator('#workflow-source-filter');
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(searchBox).toBeVisible();
      try {
        // NOT `options.first()`: the picker always renders the synthetic "Global workflow
        // library" row, so one visible option is exactly what a failed fetch looks like.
        // Wait for a real seeded brand instead.
        await expect(options.filter({ hasText: VIVO_BRAND_NAME }).first()).toBeVisible({
          timeout: 20_000,
        });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }

    // ---- #278: the four DoD queries against the real picker ------------------
    for (const query of VIVO_QUERIES) {
      await searchBox.fill(query);
      const match = options.filter({ hasText: VIVO_BRAND_NAME });
      await expect(
        match.first(),
        `#278: "${query}" must find ${VIVO_BRAND_NAME}`,
      ).toBeVisible();
      await expect(page.getByText('No brands found.')).toBeHidden();
    }

    // ---- #276a: every match is reachable by scrolling ------------------------
    await searchBox.fill(PICKER_MARKER);
    await expect(options).toHaveCount(FILLER_BRAND_COUNT + 1);
    const metrics = await list.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(
      metrics.scrollHeight,
      'the seeded set must overflow the list, or the scroll assertion proves nothing',
    ).toBeGreaterThan(metrics.clientHeight);

    const lastOption = options.last();
    await lastOption.scrollIntoViewIfNeeded();
    const reachedBottom = await list.evaluate(
      (element) => element.scrollTop > 0 && element.scrollHeight - element.clientHeight > 0,
    );
    expect(reachedBottom, '#276: the results list must scroll to the last match').toBe(true);
    await expect(lastOption).toBeInViewport();

    // The measurement has to be able to FAIL, or "0 clipped labels" is worth nothing: a
    // probe carrying the exact `truncate` recipe this picker used to use must come back
    // flagged by the same code that grades the real rows.
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.id = 'clip-probe';
      probe.style.cssText = 'position:fixed;top:0;left:0;width:120px';
      const line = document.createElement('span');
      line.style.cssText =
        'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      line.textContent = "eviechamps123's Brand — eviechamps123@extremely-long-provider.test";
      probe.appendChild(line);
      document.body.appendChild(probe);
    });
    expect(
      await page.locator('#clip-probe').evaluate(COLLECT_CLIPPED),
      'the clip measurement must flag a truncated label, or it proves nothing',
    ).not.toEqual([]);
    await page.evaluate(() => document.getElementById('clip-probe')?.remove());

    // ---- #276b: no row is clipped mid-word -----------------------------------
    const rowCount = await options.count();
    const clippedRows: unknown[] = [];
    for (let index = 0; index < rowCount; index += 1) {
      const row = options.nth(index);
      const clipped = await row.evaluate(COLLECT_CLIPPED);
      if (clipped.length > 0) clippedRows.push({ index, clipped });
      await expect(row).toContainText(adminEmail);
    }
    expect(clippedRows, '#276: no brand row may be clipped').toEqual([]);

    // ---- #276c: the trigger shows the selection un-truncated ------------------
    await options.first().click();
    const triggerLabel = page.getByTestId('brand-picker-trigger-label');
    await expect(triggerLabel).toContainText(PICKER_MARKER);
    await expect(triggerLabel).toContainText(adminEmail);
    expect(
      await triggerLabel.evaluate(COLLECT_CLIPPED),
      '#276: the trigger must not truncate the selected brand',
    ).toEqual([]);

    console.log(
      `[brand-picker] ${rowCount} matches rendered · list ${metrics.scrollHeight}px in a ${metrics.clientHeight}px viewport · 0 clipped labels · ${VIVO_QUERIES.length}/${VIVO_QUERIES.length} #278 queries found "${VIVO_BRAND_NAME}"`,
    );
  } finally {
    if (seededBrandIds.length > 0) await purgeSeededBrands(supabase);
    await purgeSeededAdmins(supabase, adminUserId);
    await context.close();
  }
});
