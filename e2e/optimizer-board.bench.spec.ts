import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getOptimizationMetricDefinition } from '../packages/contracts/src/optimization/service';
import { googlePortfolioResult } from '../packages/contracts/src/paid/google-tab';
import { BOARD_LAYOUT_KEY } from '../src/components/paid-media/optimizer/sections/board/boardLayout';
import { portfolioPlanPerDay } from '../src/components/paid-media/optimizer/sections/portfolioPlan';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:board:e2e:bench — the adaptive Optimizer overview (O01), end to end, on four real
// accounts.
//
// A real Chrome drives the real Frontend (a local dev server) as a real member of each brand
// (magic link → verifyOtp → the @supabase/ssr cookie the app writes), against production
// Supabase, the deployed edges and the deployed API. Every assertion is on RENDERED DOM:
//
//   · Easy Fit · Meta (act_521903353286118, the agency brand that holds its portfolios)
//   · Easy Fit · Google (the client brand, whose Google portfolio is "Leads // Google Ads only")
//   · Vivo 47 · Google
//   · Pink Elephant · Google (the client applies every change)
//
// What it proves, per account, with the board as a first-time viewer sees it (Adaptive):
//   1. The tab opens on the board: its header names the mode, and its slots appear in the order
//      the reading declares (data-board-order), the spine (result, decisions, portfolios) in it.
//   2. Every module on it shows real figures and none shows an error state.
//   3. The result hero's Google figures are Google's own: the spend and the counted conversions
//      this bench reads from the same edge, for the same seven days, as the same member. The
//      portfolio lanes are the brand's portfolios on the tab, each at its own daily plan.
//   4. At 390 px nothing scrolls sideways: not the page, not the Optimizer's scroller, not a
//      module.
// Screenshots at 1440 (light and dark) and 390 land in test-results/optimizer-board/.
//
// It reads only. Its writes are bench plumbing, each put back: the session's brand pin (one
// per account, deleted with the session) and the session itself (revoked, proven by a refused
// refresh). The reading's own inputs are graded by optimizer:reading:bench; this bench grades
// what the board draws from the reading it was handed, and says so in its notes.
// ---------------------------------------------------------------------------

const { publishableKey } = loadProdSupabaseEnv();
/** Admin on both Easy Fit rows and on Vivo 47, operator on Pink Elephant: the one member of all
 *  four brands (Ramiro's bench identity, scripts/_bench/pausedWrites.ts BENCH_FALLBACK_EMAIL). */
const MEMBER_EMAIL = 'ramibuisel@gmail.com';

type BoardAccount = {
  key: string;
  label: string;
  brandId: string;
  platform: 'meta' | 'google_ads';
  /** The Meta account the tab reads; the Google tab resolves the brand's granted customer. */
  adAccountId: string | null;
};

const ACCOUNTS: BoardAccount[] = [
  {
    key: 'easyfit-meta',
    label: 'Easy Fit · Meta',
    brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
    platform: 'meta',
    adAccountId: 'act_521903353286118',
  },
  {
    key: 'easyfit-google',
    label: 'Easy Fit · Google',
    brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    platform: 'google_ads',
    adAccountId: null,
  },
  {
    key: 'vivo47-google',
    label: 'Vivo 47 · Google',
    brandId: '61b80f51-709a-4408-9f11-04142a286baa',
    platform: 'google_ads',
    adAccountId: null,
  },
  {
    key: 'pink-google',
    label: 'Pink Elephant · Google',
    brandId: '8e5b7185-e43f-4150-b763-b86c4f5297a0',
    platform: 'google_ads',
    adAccountId: null,
  },
];

const SPINE = ['result', 'decisions', 'portfolios'];
const SHOTS_DIR = resolve(__dirname, '../test-results/optimizer-board');

const notes: string[] = [];
const recorder = createBenchRecorder('optimizer:board:e2e:bench', notes);

let session: MintedSession;
let latestState: PlaywrightStorageState | null = null;

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });
}

const bare = (id: string | null | undefined) => (id ?? '').replace(/^act_/, '');

type PortfolioRow = {
  id: string;
  name: string;
  status: string;
  objective: string;
  target_metric?: string | null;
  last_actual_cycle_at?: string | null;
  ad_account_id: string | null;
  platforms?: string[];
  daily_total: number | null;
  budget_source?: string | null;
  conserved_daily_total?: number | null;
};

type Premise = {
  portfolios: PortfolioRow[];
  googleCustomer: string | null;
  resultBucket: 'leads' | 'purchases' | 'signups' | null;
};

/** What the page reads for the tab, read here as the same member: the tab's portfolios, the
 *  granted Google customer and the result the brand's Google portfolios are held to. */
async function readPremise(account: BoardAccount): Promise<Premise> {
  const client = memberClient();
  const [accounts, portfolios] = await Promise.all([
    client.schema('plugin_mcp').rpc('list_brand_ad_accounts', { p_brand_id: account.brandId }),
    client.rpc('optimizer_list_portfolios', { p_brand_id: account.brandId }),
  ]);
  if (accounts.error) throw new Error(`list_brand_ad_accounts: ${accounts.error.message}`);
  if (portfolios.error) throw new Error(`optimizer_list_portfolios: ${portfolios.error.message}`);
  const granted = (accounts.data ?? []) as { platform: string; account_id: string }[];
  const googleIds = new Set(
    granted.filter((row) => row.platform === 'google_ads').map((row) => bare(row.account_id)),
  );
  const rows = (portfolios.data ?? []) as PortfolioRow[];
  const onTab = rows.filter((row) => {
    if (account.platform === 'meta') return bare(row.ad_account_id) === bare(account.adAccountId);
    if ((row.platforms ?? []).length > 0) return (row.platforms ?? []).includes('google_ads');
    return googleIds.has(bare(row.ad_account_id));
  });
  return {
    portfolios: onTab,
    googleCustomer:
      granted.find((row) => row.platform === 'google_ads' && !/manager/i.test(row.account_id))
        ?.account_id ?? null,
    resultBucket:
      account.platform === 'google_ads'
        ? googlePortfolioResult(
            onTab.filter((row) => row.status !== 'archived').map((row) => row.objective),
          )
        : null,
  };
}

/** The 7 complete UTC days ending yesterday: the window the Google tab's own read asks for when
 *  the producer names none (googleAdsOverviewModel.completeDaysWindow). */
function completeDays(days: number): { since: string; until: string } {
  const now = new Date();
  const until = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { since: iso(until - (days - 1) * 86_400_000), until: iso(until) };
}

/** Google's spend and counted conversions for the hero's window, from the edge the hero reads
 *  (fetchGoogleAdsOverview: account_overview and top_campaigns). */
async function readGoogleWeek(
  account: BoardAccount,
  premise: Premise,
): Promise<{ spend: number; conversions: number | null }> {
  const window = completeDays(7);
  const body = {
    platform: 'google-ads',
    brandId: account.brandId,
    accountId: premise.googleCustomer,
    range: { preset: 'custom', since: window.since, until: window.until },
    ...(premise.resultBucket ? { resultBucket: premise.resultBucket } : {}),
  };
  const client = memberClient();
  const [overview, campaigns] = await Promise.all([
    client.functions.invoke('paid-media-metrics?platform=google-ads', {
      body: { ...body, scope: 'account_overview' },
    }),
    client.functions.invoke('paid-media-metrics?platform=google-ads', {
      body: { ...body, scope: 'top_campaigns', kpi: 'spend', limit: 50 },
    }),
  ]);
  if (overview.error) throw new Error(`account_overview: ${overview.error.message}`);
  if (campaigns.error) throw new Error(`top_campaigns: ${campaigns.error.message}`);
  const spend = Number((overview.data as { metrics?: { spend?: number } }).metrics?.spend ?? 0);
  const rows = ((campaigns.data as { rows?: unknown[] }).rows ?? []) as {
    metrics: { spend: number; conversions: number | null };
  }[];
  const spending = rows.filter((row) => row.metrics.spend > 0);
  const counted = spending.every((row) => row.metrics.conversions != null);
  return {
    spend,
    conversions: counted
      ? spending.reduce((sum, row) => sum + (row.metrics.conversions ?? 0), 0)
      : null,
  };
}

/** The result kind a portfolio is measured in (its KPI field), as the hero and the lanes read it. */
function kindOf(row: PortfolioRow): string {
  return getOptimizationMetricDefinition(row.target_metric ?? row.objective).kpiField;
}

/** The Google portfolios' figure the hero prints: each cycled portfolio of the kind's metrics read
 *  (optimizer_get_portfolio_metrics, d7 — what the lanes print), spend and results summed. */
async function readGooglePortfoliosWeek(
  premise: Premise,
  kind: string,
): Promise<{ spend: number; results: number; portfolios: number }> {
  const client = memberClient();
  const counting = premise.portfolios.filter(
    (row) => kindOf(row) === kind && Boolean(row.last_actual_cycle_at),
  );
  let spend = 0;
  let results = 0;
  for (const row of counting) {
    const { data, error } = await client.rpc('optimizer_get_portfolio_metrics', {
      p_portfolio_id: row.id,
      p_window: 'd7',
    });
    if (error) throw new Error(`optimizer_get_portfolio_metrics ${row.name}: ${error.message}`);
    for (const part of (data as { by_platform?: { spend: number; results: number }[] })
      .by_platform ?? []) {
      spend += part.spend;
      results += part.results;
    }
  }
  return { spend, results, portfolios: counting.length };
}

function boardUrl(account: BoardAccount): string {
  const params = new URLSearchParams({
    tab: 'performance',
    optimizerView: 'overview',
    platform: account.platform,
  });
  if (account.adAccountId) params.set('adAccountId', account.adAccountId);
  return `/scale?${params.toString()}`;
}

/** The board once every slot has drawn: not the reading's skeleton, no module still loading. */
async function settledBoard(page: Page): Promise<Locator> {
  const board = page.getByTestId('adaptive-board');
  await expect(board).toBeVisible({ timeout: 240_000 });
  await expect(board).not.toHaveAttribute('data-loading', 'true', { timeout: 180_000 });
  await expect(board.locator('[data-module-state="loading"]')).toHaveCount(0, {
    timeout: 180_000,
  });
  return board;
}

type ModuleRead = {
  id: string;
  state: string | null;
  body: string;
  figures: number;
  inSlot: boolean;
};

async function readModules(board: Locator, order: string[]): Promise<ModuleRead[]> {
  return board.evaluate((root, ids) => {
    return ids.map((id) => {
      const slot = root.querySelector(`[data-board-slot="${id}"]`);
      const module = root.querySelector(`[data-testid="board-module-${id}"]`);
      const body = module?.querySelector('[data-module-body]') ?? module;
      return {
        id,
        state: module?.getAttribute('data-module-state') ?? null,
        body: ((body as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
        figures: module
          ? [...module.querySelectorAll('[data-testid="figure"]')].filter(
              (node) => (node.getAttribute('data-figure-raw') ?? '') !== '',
            ).length
          : 0,
        inSlot: Boolean(slot && module && slot.contains(module)),
      };
    });
  }, order);
}

/** Everything on the page that scrolls sideways at this width, by what it is. */
async function sidewaysScroll(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      offenders.push(`page ${doc.scrollWidth}px > ${window.innerWidth}px`);
    }
    const root = document.querySelector('[data-testid="adaptive-board-root"]');
    for (let node = root?.parentElement ?? null; node && node !== document.body; ) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX !== 'visible' && node.scrollWidth > node.clientWidth + 1) {
        offenders.push(
          `scroller ${node.getAttribute('data-testid') ?? node.tagName.toLowerCase()} ${node.scrollWidth}px > ${node.clientWidth}px`,
        );
      }
      node = node.parentElement;
    }
    if (root && root.scrollWidth > root.clientWidth + 1) {
      offenders.push(`board ${root.scrollWidth}px > ${root.clientWidth}px`);
    }
    for (const module of root?.querySelectorAll('[data-testid^="board-module-"]') ?? []) {
      // A module's own inner ids (board-module-result-reason…) are not modules.
      const id = module.getAttribute('data-testid') ?? '';
      if (!/^board-module-[a-z]+$/.test(id)) continue;
      if (module.scrollWidth > module.clientWidth + 1) {
        offenders.push(`${id} ${module.scrollWidth}px > ${module.clientWidth}px`);
      }
    }
    return offenders;
  });
}

/** A full screenshot of the page and of the board alone. The Optimizer scrolls inside its own
 *  pane, so for the shot every clipping ancestor of the board is let out to its full height, and
 *  put back after. */
async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="adaptive-board-root"]');
    for (let node = root?.parentElement ?? null; node && node !== document.body; ) {
      const style = getComputedStyle(node);
      if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
        node.setAttribute('data-bench-unclipped', node.getAttribute('style') ?? '');
        node.style.overflow = 'visible';
        node.style.height = 'auto';
        node.style.maxHeight = 'none';
      }
      node = node.parentElement;
    }
  });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
  await page
    .getByTestId('adaptive-board-root')
    .screenshot({ path: resolve(SHOTS_DIR, `${name}-board.png`) });
  await page.evaluate(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[data-bench-unclipped]')) {
      const previous = node.getAttribute('data-bench-unclipped') ?? '';
      if (previous) node.setAttribute('style', previous);
      else node.removeAttribute('style');
      node.removeAttribute('data-bench-unclipped');
    }
  });
}

async function setTheme(page: Page, appearance: 'light' | 'dark'): Promise<void> {
  await page.evaluate((next) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    root.classList.remove(next === 'dark' ? 'light' : 'dark');
    root.classList.add(next);
    root.style.colorScheme = next;
  }, appearance);
  await page.waitForTimeout(400);
}

async function closeKeepingState(context: BrowserContext): Promise<PlaywrightStorageState> {
  const state = (await context.storageState()) as PlaywrightStorageState;
  await context.close();
  return state;
}

/** One account, end to end. Every check is recorded; the first hard failure ends this account
 *  and is returned, so the next account still runs. */
async function benchAccount(
  browser: Browser,
  account: BoardAccount,
): Promise<{ failures: string[] }> {
  const failures: string[] = [];
  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await recorder.step(`${account.key}: ${name}`, run);
    } catch (error) {
      failures.push(`${account.key}: ${name} — ${(error as Error).message.split('\n')[0]}`);
    }
  };

  await pinSessionBrand(session.accessToken, account.brandId);
  let premise: Premise;
  try {
    premise = await recorder.step(`${account.key}: premise read as the member`, () =>
      readPremise(account),
    );
  } catch (error) {
    return { failures: [`${account.key}: premise — ${(error as Error).message}`] };
  }
  notes.push(
    `${account.key}: ${premise.portfolios.length} portfolio(s) on the tab (${premise.portfolios.map((row) => row.name).join(', ') || 'none'}); Google ${premise.googleCustomer ?? 'none'}; result ${premise.resultBucket ?? 'none'}`,
  );

  const context = await browser.newContext({
    storageState: latestState ?? session.state,
    viewport: { width: 1440, height: 1000 },
  });
  // A first-time viewer: no layout picked, so the tab opens on the board.
  await context.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage refused: the board is the default anyway
    }
  }, BOARD_LAYOUT_KEY);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(boardUrl(account), { waitUntil: 'domcontentloaded' });
    let board: Locator;
    try {
      board = await recorder.step(`${account.key}: the tab opens on the board`, async () => {
        const settled = await settledBoard(page);
        await expect(settled).toHaveAttribute('data-platform', account.platform);
        await expect(page.getByTestId('board-layout-adaptive')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(page.getByTestId('board-mode-label')).not.toBeEmpty();
        return settled;
      });
    } catch (error) {
      failures.push(`${account.key}: the board — ${(error as Error).message.split('\n')[0]}`);
      return { failures };
    }

    const order = ((await board.getAttribute('data-board-order')) ?? '').split(',').filter(Boolean);
    const mode = await page.getByTestId('board-mode').getAttribute('data-mode');
    notes.push(`${account.key}: mode ${mode}; board ${order.join(' → ')}`);

    await check('the modules appear in the reading’s order', async () => {
      const slots = await board
        .locator('[data-board-slot]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-board-slot')));
      expect(slots).toEqual(order);
      expect(order).toEqual(expect.arrayContaining(SPINE));
    });

    for (const module of await readModules(board, order)) {
      const real = module.inSlot && module.state !== 'error' && /\d/.test(module.body);
      const detail = `state ${module.state ?? 'none'}; ${module.figures} figure node(s); "${module.body.slice(0, 140)}"`;
      recorder.record(
        `${account.key}: ${module.id} shows real figures, no error`,
        real ? 'PASS' : 'FAIL',
        detail,
      );
      if (!real) failures.push(`${account.key}: ${module.id} — ${detail}`);
    }

    await check('the lanes are the tab’s portfolios', async () => {
      const lanes = page.getByTestId('board-module-portfolios');
      if (premise.portfolios.length === 0) {
        await expect(lanes.getByTestId('board-lanes-empty')).toBeVisible();
        return;
      }
      const names = await lanes
        .getByTestId('board-lane-name')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
      expect([...names].sort()).toEqual(premise.portfolios.map((row) => row.name).sort());
      for (const row of premise.portfolios) {
        const plan = portfolioPlanPerDay({
          daily_total: row.daily_total,
          budget_source: row.budget_source ?? null,
          conserved_daily_total: row.conserved_daily_total ?? null,
        });
        if (plan == null) continue;
        const raw = await lanes
          .locator(`[data-figure="board.lane.${row.id}.daily"]`)
          .getAttribute('data-figure-raw');
        expect(Number(raw)).toBeCloseTo(plan, 2);
      }
    });

    await check('the result hero prints the lanes’ figure', async () => {
      const hero = page.getByTestId('board-module-result');
      const tagged = hero.locator('[data-source]');
      const tag = async (name: string) =>
        (await tagged.count()) > 0 ? await tagged.getAttribute(name) : null;
      const source = await tag('data-source');
      const kind = await tag('data-kind');
      const readingSource = await tag('data-reading-source');
      const raw = async (key: string) => {
        const node = hero.locator(`[data-figure="${key}"]`);
        return (await node.count()) > 0 ? await node.getAttribute('data-figure-raw') : null;
      };
      const spend = await raw('board.result.spend');
      const count = await raw('board.result.count');
      const cost = await raw('board.result.cost');
      const window = (await hero.getByTestId('board-result-window').textContent()) ?? '';
      notes.push(
        `${account.key}: hero ${source ?? 'none'} (reading ${readingSource ?? 'none'}, kind ${kind || '—'}); count ${count ?? '—'}; spend ${spend ?? '—'}; cost ${cost ?? '—'}; "${window}"`,
      );
      expect(source, 'the hero drew figures').not.toBeNull();
      // Every figure says its window.
      expect(window).toMatch(/^(Last \d+ days|[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+)/);
      if (count != null && Number(count) > 0 && cost && spend) {
        expect(Number(cost)).toBeCloseTo(Number(spend) / Number(count), 1);
      }
      if (source === 'reading') {
        // Google's V1 card: its real-result count stands, over its own days.
        expect(readingSource).toBe('inflated_conversion');
        expect(window).toContain('as the conversion card counts them');
        notes.push(
          `${account.key}: COVERAGE: the V1 count is the reading's; optimizer:reading:bench grades its inputs`,
        );
        return;
      }
      if (source === 'google') {
        const week = await readGoogleWeek(account, premise);
        expect(Number(spend)).toBeCloseTo(week.spend, 2);
        if (week.conversions != null) expect(Number(count)).toBeCloseTo(week.conversions, 2);
        notes.push(
          `${account.key}: no portfolio figure yet; Google's own week read ${week.spend.toFixed(2)} spend, ${week.conversions ?? 'no single result'} counted`,
        );
        return;
      }
      // The counted kind's portfolios, summed: the figure the lanes print.
      if (account.platform === 'google_ads' && kind) {
        const week = await readGooglePortfoliosWeek(premise, kind);
        expect(Number(spend)).toBeCloseTo(week.spend, 2);
        expect(Number(count)).toBeCloseTo(week.results, 2);
        notes.push(
          `${account.key}: ${week.portfolios} cycled ${kind} portfolio(s) read ${week.spend.toFixed(2)} spend, ${week.results} results`,
        );
      }
      const holders = premise.portfolios.filter((row) => kindOf(row) === kind);
      if (holders.length === 1 && cost) {
        const holder = holders[0] as PortfolioRow;
        const laneCost = await page
          .getByTestId('board-module-portfolios')
          .locator(`[data-figure="board.lane.${holder.id}.cost"]`)
          .getAttribute('data-figure-raw');
        expect(Number(laneCost), `${holder.name}'s lane`).toBeCloseTo(Number(cost), 2);
      }
    });

    await shoot(page, `${account.key}-1440`);
    await setTheme(page, 'dark');
    await shoot(page, `${account.key}-1440-dark`);
    await setTheme(page, 'light');

    await check('nothing scrolls sideways at 390 px', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(800);
      await settledBoard(page);
      const offenders = await sidewaysScroll(page);
      await shoot(page, `${account.key}-390`);
      expect(offenders, offenders.join('; ')).toEqual([]);
    });

    recorder.record(
      `${account.key}: no uncaught page error`,
      pageErrors.length === 0 ? 'PASS' : 'FAIL',
      pageErrors.slice(0, 3).join(' | '),
    );
    if (pageErrors.length > 0) failures.push(`${account.key}: page errors — ${pageErrors[0]}`);
    return { failures };
  } finally {
    latestState = await closeKeepingState(context);
  }
}

test.beforeAll(async () => {
  session = await mintSessionBundleForEmail(MEMBER_EMAIL);
  notes.push(
    'COVERAGE: the reading itself (mode, order, reasons) is graded against independent reads by optimizer:reading:bench; here the board is checked against the order it declares.',
  );
});

test.afterAll(async () => {
  if (session) {
    const proof = await revokeBenchSession(latestState ?? session.state, session.accessToken);
    recorder.record(
      'bench session revoked',
      proof.revoked && proof.pinsLeft === 0 ? 'PASS' : 'FAIL',
      `${proof.sessionId}: ${proof.detail}; pins left ${proof.pinsLeft}`,
    );
  }
  recorder.print();
});

test('the adaptive board on four real accounts: order, figures and 390 px', async ({ browser }) => {
  test.setTimeout(ACCOUNTS.length * 420_000);
  const failures: string[] = [];
  for (const account of ACCOUNTS) {
    const outcome = await test.step(account.label, () => benchAccount(browser, account));
    failures.push(...outcome.failures);
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
