import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  arrangeHomeTiles,
  flightOf,
  HOME_OBJECTIVE_METRICS,
  type HomeBoard,
  type HomeBoardSort,
  type HomeBrandReading,
  type HomeBrandSignals,
  type HomeMode,
  type HomeObjective,
  type HomeObjectiveMetric,
  type HomeProfileRow,
  type HomeTileId,
  homeProfileRowSchema,
  homeTileIdSchema,
  pacingPlanFreshness,
  plannerDayIdInZone,
  readBrand,
  readHomeBoard,
  resolveHomeObjectives,
} from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { combineChunks, stringFromBase64URL } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PLATFORM_KEYS } from '../src/components/onboarding/platforms';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from '../src/lib/home/brandSignals';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  restoreBrandPreference,
  revokeBenchSession,
  sessionClaimsOf,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// home:board:e2e:bench — the adaptive Home (H01), end to end, in a real browser, against
// production, read-only.
//
// A real Chrome drives the real Frontend (a local dev server on prod Supabase, the deployed edges
// and the deployed API) as a real member (ramibuisel@gmail.com: magic link → verifyOtp → the
// @supabase/ssr cookie the app writes), on one brand per Home mode, chosen at run start from live
// data: every brand the member can open is read the way the Home's server loader reads it
// (get_brand_integration_summary as the member, optimizer_list_portfolios, the Brand Book's
// business section, saved goals, the approval flag → brandSignals mappers → contracts readBrand
// → readHomeBoard). Easy Fit's Meta brand and Pink Elephant are always benched; every other mode
// takes the member brand in that mode with the fewest ad accounts (the cheapest live reads). A
// mode no member brand reads as is a named WARN. A tile whose figure no chosen brand holds adds
// the cheapest member brand that does, and the run ends with one `coverage` line per tile: a tile
// whose headline was never held to a direct read on a ready tile is a named WARN.
//
// What it proves, per brand, on RENDERED DOM:
//   1. /dashboard draws the board with data-mode = the computed mode and data-board-order = the
//      tile order readHomeBoard computes from the bench's own reads.
//   2. Every tile settles to `ready` or `missing` (`loading` at the timeout and `error` FAIL,
//      named). Every `ready` tile's headline data-value equals a read the bench makes itself:
//        goals     paid-media-reporting account_overview per ad account, month to date (the 1st
//                  through yesterday in the viewer's zone), as the member; Google read once per
//                  result (leads, purchases); money only in the lead currency (data-currency)
//        opps      optimizer_list_portfolios: Σ pending recs + budget moves, active, not observing
//        checklist the same rows, only portfolios no platform may be written: Σ pending recs
//        autopilot optimizer_list_actions rows of the last 24 h (bounded by mount and settle time)
//        pacing    optimizer_get_portfolio_performance latest_run.pacing of each running flight,
//                  this plan's only, lead currency
//        health    data-failing ≥ the reading's issues + every stored measurement guard, and
//                  data-total = passing + failing
//        setup     the member's connected providers + an assigned account + the Brand Book
//                  (get-brand-book), of 3
//        creative  paid_media.creative_reports verdicts
//        organic   /api/organic/calendar-posts for this Mon–Sun + scheduled drafts this week
//        market    the newest awareness report's lifecycle feed, last 7 days
//        brief     optimizer_get_account_read per ad account: the newest narrative's day
//      A `missing` tile whose direct read holds a figure FAILS too.
//   3. Each tile's expanded sheet opens and draws without an error boundary; the Weekly story
//      opens; an Ask-bar suggestion navigates to Jaina with the question in the link (and, on the
//      first brand, in the composer) — nothing is sent: every non-GET to the API is aborted then.
//   4. A pinned tile goes first, survives a reload (localStorage only) and is unpinned again; the
//      Urgency and Module sorts reorder data-board-order as arrangeHomeTiles says.
//   5. Light and dark at 1440 px and 390 px: no console error, no sideways scroll on the board.
// Screenshots per brand × viewport/theme (and per sheet) land in test-results/home-board/.
//
// It reads only. A request guard aborts any PostgREST table write and any edge or API call whose
// name is a write; every non-GET it saw is listed in the notes. The bench never clicks Approve,
// Dismiss, Send, Promote or Save. Its own writes are plumbing, each put back: the session's brand
// pin (deleted with the session), the member's active-brand preference (restored, read back) and
// the session itself (revoked, proven by a refused refresh).
//
// Un-exercised, by name: the goal save path, every approve/dismiss/send/promote write, Jaina's
// answer to the question (never sent), the `approve` mode when no member brand reads as it, and a
// production build (this is a dev server: a chunk 404 the server HTML asks for, also seen on
// /settings, is a WARN here, and only a production build can clear it).
// Weaker anchors, said plainly: health is a lower bound plus an identity (failing ≥ issues +
// guards; total = passing + failing), not a recount of every check. The organic published half is
// the calendar's own endpoint, so it proves the tile counts what the calendar answers; the
// scheduled half resolves each draft's day here from the stored row (slot/day ids, else
// scheduled_date in the draft's zone). The mode inputs go through the same mappers the Home uses.
// ---------------------------------------------------------------------------

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
const MEMBER_EMAIL = 'ramibuisel@gmail.com';
const EASYFIT_META_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const PINK_BRAND_ID = '8e5b7185-e43f-4150-b763-b86c4f5297a0';
const MODES: HomeMode[] = ['operate', 'fix', 'recommend', 'approve', 'setup'];
/** The viewer's zone, pinned so the browser and the bench agree on "this month" and "this week". */
const VIEWER_TIME_ZONE = 'America/Mexico_City';
const SHOTS_DIR = resolve(__dirname, '../test-results/home-board');
const SETTLE_MS = 150_000;
const API_HOST = 'api.trycontinuum.ai';

// Console lines that are not errors of the board, each with its reason. They are never dropped
// silently: each class is counted and graded on its own line (WARN), and anything else is a FAIL.
const CONSOLE_KNOWN: { id: string; pattern: RegExp; reason: string }[] = [
  {
    id: 'goal-targets-not-deployed',
    // The browser logs the 404 itself; the app's own code logs nothing and draws today's state.
    pattern: /status of 404 .*@ https:\/\/api\.trycontinuum\.ai\/api\/home\/goal-targets/,
    reason:
      'Phase B has not deployed /api/home/goal-targets yet: the goal tile keeps its real figure and offers no target form; goes away once the Backend deploys',
  },
  {
    id: 'expired-meta-thumbnail',
    // The browser logs a failed <img> load; the app's own code logs nothing.
    pattern: /status of 403 .*@ https:\/\/[a-z0-9.-]*fbcdn\.net\//,
    reason:
      'stored Meta CDN thumbnail URLs (creative report) are signed and expire; CreativeThumb draws its placeholder by design, so the tile is unaffected — the report holds stale thumbnails',
  },
];

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('home:board:e2e:bench', notes);
type Grade = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
const tally = new Map<string, Record<Grade, number>>();
const failures: string[] = [];

function grade(scope: string, step: string, result: Grade, detail?: string): void {
  recorder.record(`${scope}: ${step}`, result, detail);
  // Progress on the runner's stdout, so a long run can be followed line by line.
  console.log(
    `[home-board] ${result} ${scope}: ${step}${detail ? ` — ${detail.slice(0, 240)}` : ''}`,
  );
  const counts = tally.get(scope) ?? { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  counts[result] += 1;
  tally.set(scope, counts);
  if (result === 'FAIL') failures.push(`${scope}: ${step}${detail ? ` — ${detail}` : ''}`);
}

/** Runs a check; a thrown assertion is a FAIL with its first line, never an aborted brand. */
async function check(scope: string, step: string, run: () => Promise<string | undefined>) {
  try {
    const detail = await run();
    grade(scope, step, 'PASS', detail || undefined);
  } catch (error) {
    grade(scope, step, 'FAIL', (error as Error).message.split('\n')[0]);
  }
}

/** Chunks that 404 from the server HTML on /settings, a page with no Home board on it. */
const controlChunks = new Set<string>();
const CHUNK_404 = /status of 404 .*@ https?:\/\/[^/]+(\/_next\/static\/chunks\/\S+)/;

/** Per tile: the brands where it drew `ready` and its headline was held to a direct read. */
const headlineProven = new Map<HomeTileId, string[]>();
const tileShownOn = new Map<HomeTileId, string[]>();

let session: MintedSession;
let latestState: PlaywrightStorageState | null = null;
let originalPreference: string | null = null;

/** The member's live access token: the browser's latest cookie (it refreshes the session as it
 *  goes), else the one minted at the start. */
async function memberToken(): Promise<string> {
  const state = latestState;
  if (state) {
    const cookie = await combineChunks(
      'sb-auth',
      (name) => state.cookies.find((c) => c.name === name)?.value,
    );
    if (cookie) {
      const raw = cookie.startsWith('base64-') ? stringFromBase64URL(cookie.slice(7)) : cookie;
      const token = (JSON.parse(raw) as { access_token?: string }).access_token;
      if (token && sessionClaimsOf(token).expiresAtMs > Date.now() + 120_000) return token;
    }
  }
  return session.accessToken;
}

async function memberClient(): Promise<SupabaseClient> {
  const token = await memberToken();
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const bare = (id: string | null | undefined) => (id ?? '').replace(/^act_/, '');
const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const cents = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 1e4) / 1e4;
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 1e-6);

// ---------------------------------------------------------------------------
// The brand, read the way the Home's server loader reads it
// ---------------------------------------------------------------------------

type SummaryRow = {
  platform_key: string | null;
  account_type: string | null;
  account_status: string | null;
  external_account_id: string | null;
  integration_account_id: string;
  account_name: string | null;
  alias: string | null;
};

type AdAccount = {
  id: string;
  name: string;
  currency: string | null;
  platform: 'meta' | 'google_ads';
};
type OrganicRef = {
  platform: 'instagram' | 'facebook';
  integrationAccountId: string;
  name: string;
};

type PortfolioRow = {
  id: string;
  name: string;
  status: string;
  apply_mode: string;
  ad_account_id: string | null;
  currency: string | null;
  platforms: string[] | null;
  platform_writes: Record<string, boolean> | null;
  pending_recommendations: number | null;
  pending_budget_moves: number | null;
  period_start: string | null;
  period_end: string | null;
  period_budget: number | null;
};

type BrandFacts = {
  key: string;
  brandId: string;
  name: string;
  summary: SummaryRow[];
  signals: HomeBrandSignals;
  reading: HomeBrandReading;
  board: HomeBoard;
  adAccounts: AdAccount[];
  organicAccounts: OrganicRef[];
  profileRows: HomeProfileRow[];
  portfolios: PortfolioRow[];
};

const SUMMARY_KEYS = new Set<string>([...PLATFORM_KEYS, 'tiktokAds']);

async function readBrandFacts(brandId: string, name: string): Promise<BrandFacts> {
  const client = await memberClient();
  const [summary, portfolios, book, brand, profiles] = await Promise.all([
    client
      .schema('brand_profiles')
      .rpc('get_brand_integration_summary', { p_brand_profile_id: brandId }),
    client.rpc('optimizer_list_portfolios', { p_brand_id: brandId }),
    admin
      .schema('brand_profiles')
      .from('brand_book')
      .select(
        'business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      )
      .eq('brand_id', brandId)
      .maybeSingle(),
    admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('description, approval_chain_required')
      .eq('id', brandId)
      .maybeSingle(),
    admin
      .schema('brand_profiles')
      .from('home_profiles')
      .select('brand_id, scope, objectives, source, updated_at')
      .eq('brand_id', brandId),
  ]);
  if (summary.error) throw new Error(`integration summary ${brandId}: ${summary.error.message}`);
  if (portfolios.error) throw new Error(`portfolios ${brandId}: ${portfolios.error.message}`);
  const rows = ((summary.data ?? []) as SummaryRow[]).filter(
    (row) => row.platform_key && SUMMARY_KEYS.has(row.platform_key),
  );
  const buckets: AccountBuckets = {};
  for (const row of rows) {
    const key = row.platform_key as keyof AccountBuckets;
    const bucket = buckets[key] ?? { accounts: [] };
    buckets[key] = bucket;
    bucket.accounts.push({ type: row.account_type, status: row.account_status });
  }
  const profileRows = ((profiles.data ?? []) as unknown[]).flatMap((raw) => {
    const parsed = homeProfileRowSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const bookRow = (book.data ?? {}) as { business?: unknown; headline?: unknown };
  const brandRow = (brand.data ?? {}) as {
    description?: unknown;
    approval_chain_required?: unknown;
  };
  const signals: HomeBrandSignals = {
    accounts: accountCountsFrom(buckets),
    savedGoal: savedGoalFrom(profileRows),
    business: businessFrom({
      structuredBusiness: bookRow.business ?? null,
      headline: bookRow.headline ?? null,
      brandDescription: brandRow.description ?? null,
    }),
    portfolios: portfolioSignalsFrom(portfolios.data),
    approvalRequired: brandRow.approval_chain_required === true,
  };
  const reading = readBrand(signals);
  const board = readHomeBoard(signals, { reading });

  // The ad accounts the Home reads: Meta ad accounts, then Google customers (never an MCC), each
  // once, with the currency its asset row stores.
  const candidates = [
    ...rows
      .filter((row) => row.platform_key === 'facebook' && row.account_type === 'meta_ad_account')
      .map((row) => ({ row, platform: 'meta' as const })),
    ...rows
      .filter((row) => row.platform_key === 'googleAds' && row.account_status !== 'manager')
      .map((row) => ({ row, platform: 'google_ads' as const })),
  ];
  const externalIds = candidates.flatMap(({ row }) =>
    row.external_account_id ? [row.external_account_id] : [],
  );
  const currencies = new Map<string, string>();
  if (externalIds.length > 0) {
    const { data } = await admin
      .schema('brand_profiles')
      .from('integration_accounts_assets')
      .select('external_account_id, raw_payload')
      .in('external_account_id', externalIds);
    for (const asset of (data ?? []) as {
      external_account_id: string;
      raw_payload: unknown;
    }[]) {
      const currency =
        asset.raw_payload && typeof asset.raw_payload === 'object'
          ? (asset.raw_payload as { currency?: unknown }).currency
          : null;
      if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
        currencies.set(asset.external_account_id, currency);
      }
    }
  }
  const adAccounts: AdAccount[] = [];
  for (const { row, platform } of candidates) {
    const id = row.external_account_id ?? row.integration_account_id;
    if (adAccounts.some((account) => account.id === id)) continue;
    adAccounts.push({
      id,
      name: row.alias ?? row.account_name ?? 'Account',
      currency: currencies.get(id) ?? null,
      platform,
    });
  }
  const organicAccounts: OrganicRef[] = [];
  for (const row of rows) {
    const platform =
      row.platform_key === 'instagram'
        ? 'instagram'
        : row.platform_key === 'facebook' && row.account_type !== 'meta_ad_account'
          ? 'facebook'
          : null;
    if (!platform) continue;
    if (
      organicAccounts.some(
        (ref) =>
          ref.platform === platform && ref.integrationAccountId === row.integration_account_id,
      )
    )
      continue;
    organicAccounts.push({
      platform,
      integrationAccountId: row.integration_account_id,
      name: row.account_name ?? 'Account',
    });
  }

  return {
    key: `${
      name
        .split(/[\s–|·]+/)
        .filter(Boolean)[0]
        ?.toLowerCase() ?? 'brand'
    }-${brandId.slice(0, 8)}`,
    brandId,
    name,
    summary: rows,
    signals,
    reading,
    board,
    adAccounts,
    organicAccounts,
    profileRows,
    portfolios: (portfolios.data ?? []) as PortfolioRow[],
  };
}

/** One brand per mode, from every brand the member can open, read live. */
async function chooseBrands(userId: string): Promise<BrandFacts[]> {
  const { data: perms, error } = await admin
    .schema('brand_profiles')
    .from('permissions')
    .select('brand_profile_id')
    .eq('user_id', userId);
  if (error) throw new Error(`permissions: ${error.message}`);
  const ids = [...new Set((perms ?? []).map((row) => row.brand_profile_id as string))];
  const { data: brands, error: brandsError } = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id, brand_name')
    .in('id', ids)
    .eq('active', true);
  if (brandsError) throw new Error(`brands: ${brandsError.message}`);
  const all: BrandFacts[] = [];
  for (const brand of (brands ?? []) as { id: string; brand_name: string | null }[]) {
    try {
      all.push(await readBrandFacts(brand.id, brand.brand_name ?? '(unnamed)'));
    } catch (readError) {
      notes.push(`selection: ${brand.id} unreadable — ${(readError as Error).message}`);
    }
  }
  notes.push(
    `member brands (${all.length}): ${all
      .map(
        (facts) =>
          `${facts.name.slice(0, 28)} ${facts.brandId.slice(0, 8)} → ${facts.reading.mode}`,
      )
      .join('; ')}`,
  );

  const chosen: BrandFacts[] = [];
  for (const [id, expected] of [
    [EASYFIT_META_BRAND_ID, 'operate'],
    [PINK_BRAND_ID, 'recommend'],
  ] as const) {
    const facts = all.find((candidate) => candidate.brandId === id);
    if (!facts) {
      grade('selection', `${id.slice(0, 8)} is a member brand`, 'FAIL', 'not openable');
      continue;
    }
    chosen.push(facts);
    grade(
      'selection',
      `${facts.name.slice(0, 28)} reads as ${expected}`,
      facts.reading.mode === expected ? 'PASS' : 'WARN',
      `computed ${facts.reading.mode} — "${facts.reading.modeReason}"`,
    );
  }
  for (const mode of MODES) {
    if (chosen.some((facts) => facts.reading.mode === mode)) continue;
    const pick = all
      .filter((facts) => facts.reading.mode === mode && !chosen.includes(facts))
      .sort(
        (a, b) => a.signals.accounts.ads - b.signals.accounts.ads || a.name.localeCompare(b.name),
      )[0];
    if (!pick) {
      grade(
        'selection',
        `a member brand in ${mode} mode`,
        'WARN',
        `no brand ${MEMBER_EMAIL} can open reads as ${mode}: the ${mode} board is un-exercised`,
      );
      continue;
    }
    chosen.push(pick);
    grade(
      'selection',
      `a member brand in ${mode} mode`,
      'PASS',
      `${pick.name.slice(0, 40)} ${pick.brandId} (${pick.signals.accounts.ads} ad, ${pick.signals.accounts.organic} organic)`,
    );
  }
  // A tile whose figure no chosen brand holds would go unbenched: add the cheapest member brand
  // whose board shows it and whose source holds it. Goal and organic need a session or a browser
  // to read, and every connected brand already shows them.
  const holdsFigure = async (facts: BrandFacts, id: HomeTileId): Promise<boolean> => {
    if (!facts.board.tiles.some((tile) => tile.id === id)) return false;
    if (id === 'goals' || id === 'organic') return true;
    const expected = await expectedFor(id, facts, null, '', Date.now()).catch(() => null);
    return expected !== null && expected.kind !== 'missing' && expected.kind !== 'warn';
  };
  for (const id of homeTileIdSchema.options) {
    let held = false;
    for (const facts of chosen) held ||= await holdsFigure(facts, id);
    if (held) continue;
    const others = all
      .filter((facts) => !chosen.includes(facts))
      .sort(
        (a, b) => a.signals.accounts.ads - b.signals.accounts.ads || a.name.localeCompare(b.name),
      );
    for (const facts of others) {
      if (!(await holdsFigure(facts, id))) continue;
      chosen.push(facts);
      notes.push(
        `selection: ${facts.name.slice(0, 40)} ${facts.brandId} added: the one that holds a ${id} figure`,
      );
      break;
    }
  }
  return chosen.sort((a, b) => MODES.indexOf(a.reading.mode) - MODES.indexOf(b.reading.mode));
}

// ---------------------------------------------------------------------------
// Direct reads, one per tile headline
// ---------------------------------------------------------------------------

/** What the bench's own read says the tile should show. */
type Expected =
  | { kind: 'value'; value: number | string; currency?: string | null; detail: string }
  | { kind: 'missing'; detail: string }
  | { kind: 'bounds'; check: (attrs: HeadlineAttrs) => string | null; detail: string }
  | { kind: 'warn'; detail: string };

type HeadlineAttrs = {
  value: string | null;
  currency: string | null;
  total: string | null;
  failing: string | null;
};

const isActive = (row: PortfolioRow) => row.status === 'active';
const proposes = (row: PortfolioRow) => isActive(row) && row.apply_mode !== 'observe';
/** Meta unless switched off, any other platform only when switched on. */
const writable = (row: PortfolioRow, platform: string) =>
  platform === 'meta'
    ? row.platform_writes?.meta !== false
    : row.platform_writes?.[platform] === true;

function expectOpps(facts: BrandFacts): Expected {
  if (!facts.portfolios.some(isActive)) return { kind: 'missing', detail: 'no active portfolio' };
  const acting = facts.portfolios.filter(proposes);
  const value = acting.reduce(
    (sum, row) => sum + (row.pending_recommendations ?? 0) + (row.pending_budget_moves ?? 0),
    0,
  );
  return {
    kind: 'value',
    value,
    detail: `optimizer_list_portfolios: ${acting.map((row) => `${row.name} ${row.pending_recommendations}+${row.pending_budget_moves}`).join(', ')}`,
  };
}

function expectChecklist(facts: BrandFacts): Expected {
  const clientApplies = facts.portfolios.filter((row) => {
    if (!proposes(row)) return false;
    const platforms = row.platforms && row.platforms.length > 0 ? row.platforms : ['meta'];
    return !platforms.some((platform) => writable(row, platform));
  });
  if (clientApplies.length === 0) {
    return { kind: 'missing', detail: 'no active portfolio with every platform write off' };
  }
  return {
    kind: 'value',
    value: clientApplies.reduce((sum, row) => sum + (row.pending_recommendations ?? 0), 0),
    detail: `${clientApplies.length} client-applies portfolio(s)`,
  };
}

async function countActionsSince(brandId: string, since: Date): Promise<number> {
  const { data, error } = await admin.rpc('optimizer_list_actions', {
    p_brand_id: brandId,
    p_limit: 500,
    p_before: null,
    p_since: since.toISOString(),
  });
  if (error) throw new Error(`optimizer_list_actions: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

/** The tile counts the 24 h before its mount; the bench brackets that instant. */
async function expectAutopilot(facts: BrandFacts, mountedAt: number): Promise<Expected> {
  const acting = facts.portfolios.filter(
    (row) =>
      proposes(row) &&
      (row.platforms && row.platforms.length > 0 ? row.platforms : ['meta']).some((platform) =>
        writable(row, platform),
      ),
  );
  if (acting.length === 0) return { kind: 'missing', detail: 'no portfolio Continuum may write' };
  const day = 24 * 60 * 60 * 1000;
  const wide = await countActionsSince(facts.brandId, new Date(mountedAt - day - 5_000));
  const narrow = await countActionsSince(facts.brandId, new Date(Date.now() - day));
  return {
    kind: 'bounds',
    detail: `optimizer_list_actions last 24 h: ${narrow}–${wide}`,
    check: (attrs) => {
      const value = Number(attrs.value);
      return value >= narrow && value <= wide
        ? null
        : `rendered ${attrs.value}, direct ${narrow}–${wide}`;
    },
  };
}

async function expectPacing(facts: BrandFacts): Promise<Expected> {
  const today = new Date().toISOString().slice(0, 10);
  const running = facts.portfolios.filter((row) => {
    const flight = row.status !== 'archived' ? flightOf(row) : null;
    return flight !== null && flight.periodStart <= today && today <= flight.periodEnd;
  });
  if (running.length === 0) return { kind: 'missing', detail: 'no flight contains today' };
  const groups = new Map<string | null, { spent: number; portfolios: number }>();
  const parts: string[] = [];
  for (const row of running) {
    const flight = flightOf(row);
    if (!flight) continue;
    const { data, error } = await admin.rpc('optimizer_get_portfolio_performance', {
      p_portfolio_id: row.id,
      p_limit: 10,
    });
    if (error) throw new Error(`optimizer_get_portfolio_performance ${row.name}: ${error.message}`);
    const pacing = (data as { latest_run?: { pacing?: Record<string, unknown> | null } } | null)
      ?.latest_run?.pacing;
    const spent = finite(pacing?.actualSpendToDate);
    if (pacing?.source !== 'pacing' || spent === undefined) {
      parts.push(`${row.name}: not paced (${String(pacing?.source ?? 'no block')})`);
      continue;
    }
    const { freshness } = pacingPlanFreshness(
      pacing as Parameters<typeof pacingPlanFreshness>[0],
      row,
    );
    const budget = finite(pacing.periodBudget);
    const samePlan =
      freshness === 'current' ||
      (freshness === 'unversioned' &&
        budget !== undefined &&
        Math.abs(budget - flight.periodBudget) < 0.5);
    if (!samePlan) {
      parts.push(`${row.name}: pacing block is about another plan (${freshness})`);
      continue;
    }
    const currency =
      row.currency ??
      facts.adAccounts.find((account) => bare(account.id) === bare(row.ad_account_id))?.currency ??
      null;
    const group = groups.get(currency) ?? { spent: 0, portfolios: 0 };
    group.spent = cents(group.spent + cents(spent));
    group.portfolios += 1;
    groups.set(currency, group);
    parts.push(`${row.name}: ${spent} ${currency}`);
  }
  const lead = [...groups.entries()].sort((a, b) => b[1].portfolios - a[1].portfolios)[0];
  if (!lead) return { kind: 'missing', detail: parts.join('; ') };
  return { kind: 'value', value: lead[1].spent, currency: lead[0], detail: parts.join('; ') };
}

type AccountReadEnvelope = {
  read?: { narrative?: string | null; guards?: unknown[] | null } | null;
  ready_at?: string | null;
  utc_day?: string | null;
} | null;

async function readAccountReads(
  facts: BrandFacts,
): Promise<{ account: AdAccount; envelope: AccountReadEnvelope; error: string | null }[]> {
  return Promise.all(
    facts.adAccounts.map(async (account) => {
      const { data, error } = await admin.rpc('optimizer_get_account_read', {
        p_brand_id: facts.brandId,
        p_ad_account_id: account.id,
      });
      return {
        account,
        envelope: (data ?? null) as AccountReadEnvelope,
        error: error?.message ?? null,
      };
    }),
  );
}

async function expectBrief(facts: BrandFacts): Promise<Expected> {
  const reads = await readAccountReads(facts);
  const latest = new Map<string, { day: string; readyAt: string }>();
  for (const { account, envelope } of reads) {
    const narrative = envelope?.read?.narrative?.trim() ?? '';
    const readyAt = envelope?.ready_at ?? null;
    if (!envelope || narrative === '' || !readyAt) continue;
    const key = `${account.platform}:${bare(account.id)}`;
    const entry = { day: envelope.utc_day ?? readyAt.slice(0, 10), readyAt };
    const current = latest.get(key);
    if (!current || Date.parse(readyAt) > Date.parse(current.readyAt)) latest.set(key, entry);
  }
  const newest = [...latest.values()].sort(
    (a, b) => Date.parse(b.readyAt) - Date.parse(a.readyAt),
  )[0];
  const failed = reads.filter((read) => read.error).length;
  if (!newest) {
    return { kind: 'missing', detail: `no stored narrative (${failed} read(s) failed)` };
  }
  return {
    kind: 'value',
    value: newest.day,
    detail: `${latest.size} account(s) with a narrative; newest ready ${newest.readyAt}`,
  };
}

async function expectHealth(facts: BrandFacts): Promise<Expected> {
  const reads = await readAccountReads(facts);
  const guards = reads.reduce(
    (sum, { envelope }) =>
      sum + (Array.isArray(envelope?.read?.guards) ? (envelope?.read?.guards?.length ?? 0) : 0),
    0,
  );
  const issues = facts.reading.issues.length;
  return {
    kind: 'bounds',
    detail: `${issues} reading issue(s), ${guards} stored measurement guard(s)`,
    check: (attrs) => {
      const passing = Number(attrs.value);
      const failing = Number(attrs.failing);
      const total = Number(attrs.total);
      if (![passing, failing, total].every(Number.isFinite)) {
        return `headline attrs not numeric: ${JSON.stringify(attrs)}`;
      }
      if (total !== passing + failing)
        return `total ${total} ≠ ${passing} passing + ${failing} failing`;
      if (failing < issues + guards) {
        return `failing ${failing} < ${issues} issue(s) + ${guards} guard(s)`;
      }
      return null;
    },
  };
}

async function expectSetup(facts: BrandFacts): Promise<Expected> {
  const client = await memberClient();
  const [providers, book] = await Promise.all([
    client
      .schema('brand_profiles')
      .rpc('get_user_integration_summary', { p_user_id: session.userId }),
    client.functions.invoke('get-brand-book', { body: { brandId: facts.brandId } }),
  ]);
  if (providers.error) throw new Error(`get_user_integration_summary: ${providers.error.message}`);
  const keys = new Set<string>(PLATFORM_KEYS);
  const connected = ((providers.data ?? []) as { platform_key?: string | null }[]).some(
    (row) => row.platform_key && keys.has(row.platform_key),
  );
  const assigned = facts.signals.accounts.ads + facts.signals.accounts.organic > 0;
  if (book.error) {
    return { kind: 'warn', detail: `get-brand-book did not answer: ${book.error.message}` };
  }
  const bookPresent = (book.data as { present?: unknown } | null)?.present === true;
  const done = Number(connected) + Number(assigned) + Number(bookPresent);
  return {
    kind: 'bounds',
    detail: `connected ${connected}, assigned ${assigned}, Brand Book ${bookPresent}`,
    check: (attrs) =>
      Number(attrs.value) === done && Number(attrs.total) === 3
        ? null
        : `rendered ${attrs.value} of ${attrs.total}, direct ${done} of 3`,
  };
}

async function expectCreative(facts: BrandFacts): Promise<Expected> {
  if (!facts.adAccounts.some((account) => account.platform === 'meta')) {
    return { kind: 'missing', detail: 'no Meta ad account' };
  }
  const { data, error } = await admin
    .schema('paid_media')
    .from('creative_reports')
    .select('status, verdicts:report->verdicts')
    .eq('brand_id', facts.brandId)
    .maybeSingle();
  if (error) throw new Error(`creative_reports: ${error.message}`);
  const verdicts = (data as { verdicts?: unknown } | null)?.verdicts;
  const count = Array.isArray(verdicts) ? verdicts.length : 0;
  if (count === 0) {
    return {
      kind: 'missing',
      detail: `report ${(data as { status?: string } | null)?.status ?? 'absent'}, no verdict`,
    };
  }
  return {
    kind: 'value',
    value: count,
    detail: `creative_reports verdicts (${(data as { status?: string }).status})`,
  };
}

async function expectMarket(facts: BrandFacts): Promise<Expected> {
  const { data, error } = await admin
    .schema('competitor_ad_spy')
    .from('awareness_reports')
    .select('generated_at, payload')
    .eq('brand_id', facts.brandId)
    .order('generated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`awareness_reports: ${error.message}`);
  const report = (data ?? [])[0] as { generated_at: string; payload: unknown } | undefined;
  const blocks = (report?.payload as { blocks?: { category?: string; data?: unknown }[] } | null)
    ?.blocks;
  const rows = (
    blocks?.find((block) => block.category === 'lifecycle_feed')?.data as
      | { rows?: unknown[] }
      | undefined
  )?.rows;
  const since = Date.now() - 7 * 86_400_000;
  const moves = (Array.isArray(rows) ? rows : []).filter((row) => {
    const r = row as Record<string, unknown>;
    const at = typeof r.eventAt === 'string' ? Date.parse(r.eventAt) : Number.NaN;
    return (
      typeof r.sourceAdId === 'string' &&
      r.sourceAdId.length > 0 &&
      typeof r.eventType === 'string' &&
      r.eventType.length > 0 &&
      typeof r.competitorId === 'string' &&
      r.competitorId.length > 0 &&
      Number.isFinite(at) &&
      at >= since
    );
  }).length;
  return {
    kind: 'value',
    value: moves,
    detail: report ? `awareness report ${report.generated_at}` : 'no awareness report',
  };
}

/** Monday–Sunday of the viewer's today, as the Organic calendar opens it. */
function viewerWeek(): string[] {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIEWER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const ms = Date.parse(`${today}T00:00:00Z`);
  const monday = ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, index) =>
    new Date(monday + index * 86_400_000).toISOString().slice(0, 10),
  );
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

async function expectOrganic(facts: BrandFacts, context: BrowserContext | null, baseURL: string) {
  if (facts.organicAccounts.length === 0) {
    return { kind: 'missing', detail: 'no organic account' } as Expected;
  }
  if (!context) return { kind: 'warn', detail: 'needs the browser session' } as Expected;
  const week = viewerWeek();
  const accountsByPlatform: Record<string, { integrationAccountId: string; name: string }[]> = {
    instagram: [],
    facebook: [],
    tiktok: [],
    youtube: [],
    linkedin: [],
  };
  for (const ref of facts.organicAccounts) {
    accountsByPlatform[ref.platform]?.push({
      integrationAccountId: ref.integrationAccountId,
      name: ref.name,
    });
  }
  const response = await context.request.post(`${baseURL}/api/organic/calendar-posts`, {
    data: { brandId: facts.brandId, start: week[0], end: week[6], accountsByPlatform },
  });
  if (!response.ok()) {
    throw new Error(
      `calendar-posts ${response.status()}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const posts = ((await response.json()) as { posts?: { dayId?: string }[] }).posts ?? [];
  const published = posts.filter((post) => post.dayId && week.includes(post.dayId)).length;

  const { data, error } = await admin
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, slot_data, content_json, scheduled_date, status')
    .eq('brand_id', facts.brandId)
    .eq('status', 'scheduled');
  if (error) throw new Error(`organic_calendar_drafts: ${error.message}`);
  const scheduled = ((data ?? []) as Record<string, unknown>[]).filter((row) => {
    const slot = record(row.slot_data);
    const iso = text(row.scheduled_date);
    const day =
      text(slot.dayId) ??
      text(record(slot.schedule).dayId) ??
      text(record(record(row.content_json).schedule).dayId) ??
      (iso ? plannerDayIdInZone(iso, text(slot.timeZone)) : null);
    return day !== null && week.includes(day);
  }).length;
  return {
    kind: 'value',
    value: published + scheduled,
    detail: `${week[0]}..${week[6]}: ${published} published (calendar-posts) + ${scheduled} scheduled`,
  } as Expected;
}

// --- Goal: month to date, per ad account, as the member -------------------------------------

type Overview = {
  currency?: string | null;
  metrics?: Record<string, unknown>;
  comparison?: Record<string, { previous?: unknown } | null | undefined>;
  trends?: Record<string, unknown>[];
  result_basis?: { bucket?: string | null } | null;
};

const COUNTED: HomeObjectiveMetric[] = [
  'spend',
  'purchases',
  'purchase_value',
  'conversations',
  'leads',
  'clicks',
  'impressions',
];

type AccountFigures = {
  currency: string | null;
  spent: boolean;
  figures: Partial<Record<HomeObjectiveMetric, number>>;
  unreported: HomeObjectiveMetric[];
};

function monthToDate(): { since: string; until: string } | null {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIEWER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const since = `${today.slice(0, 8)}01`;
  if (today === since) return null;
  const until = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return { since, until };
}

async function readOverview(
  client: SupabaseClient,
  brandId: string,
  account: AdAccount,
  window: { since: string; until: string },
  resultBucket?: 'leads' | 'purchases',
): Promise<Overview> {
  const google = account.platform === 'google_ads';
  const { data, error } = await client.functions.invoke(
    google ? 'paid-media-reporting/metrics?platform=google-ads' : 'paid-media-reporting/metrics',
    {
      method: 'POST',
      body: {
        platform: google ? 'google-ads' : 'meta',
        brandId,
        adAccountId: account.id,
        scope: 'account_overview',
        range: { preset: 'custom', ...window },
        ...(resultBucket ? { resultBucket } : {}),
      },
    },
  );
  if (error) throw new Error(`${account.id} account_overview: ${error.message}`);
  return (data ?? {}) as Overview;
}

const spentIn = (read: Overview) =>
  (finite(read.metrics?.spend) ?? 0) > 0 || (finite(read.comparison?.spend?.previous) ?? 0) > 0;

/** Google counts one result per read as `conversions`, and says which in result_basis. */
function googleCount(read: Overview, bucket: 'leads' | 'purchases'): number | undefined {
  if (read.result_basis?.bucket !== bucket) return undefined;
  const days = read.trends ?? [];
  if (days.some((day) => finite(day.conversions) === undefined)) return undefined;
  return round4(days.reduce((sum, day) => sum + (day.conversions as number), 0));
}

async function readAccountFigures(
  client: SupabaseClient,
  facts: BrandFacts,
  account: AdAccount,
  window: { since: string; until: string },
): Promise<AccountFigures> {
  if (account.platform === 'meta') {
    const read = await readOverview(client, facts.brandId, account, window);
    const figures: AccountFigures['figures'] = {};
    for (const metric of COUNTED) {
      const value = finite(read.metrics?.[metric]);
      if (value !== undefined) figures[metric] = value;
    }
    return {
      currency: account.currency ?? read.currency ?? null,
      spent: spentIn(read),
      figures,
      unreported: [],
    };
  }
  const [leads, purchases] = await Promise.all([
    readOverview(client, facts.brandId, account, window, 'leads'),
    readOverview(client, facts.brandId, account, window, 'purchases'),
  ]);
  const counted = {
    leads: googleCount(leads, 'leads'),
    purchases: googleCount(purchases, 'purchases'),
  };
  const figures: AccountFigures['figures'] = {};
  for (const metric of ['spend', 'clicks', 'impressions'] as const) {
    const value = finite(leads.metrics?.[metric]);
    if (value !== undefined) figures[metric] = value;
  }
  if (counted.leads !== undefined) figures.leads = counted.leads;
  if (counted.purchases !== undefined) {
    figures.purchases = counted.purchases;
    figures.purchase_value = round4(
      (finite(purchases.metrics?.roas) ?? 0) * (finite(purchases.metrics?.spend) ?? 0),
    );
  }
  return {
    currency: account.currency ?? leads.currency ?? null,
    spent: spentIn(leads),
    figures,
    unreported: ['conversations'],
  };
}

function sumFigures(list: AccountFigures[]): Partial<Record<HomeObjectiveMetric, number>> {
  const totals: Partial<Record<HomeObjectiveMetric, number>> = {};
  for (const metric of COUNTED) {
    let sum: number | undefined;
    for (const account of list) {
      if (account.unreported.includes(metric)) continue;
      const value = account.figures[metric];
      if (value !== undefined) sum = (sum ?? 0) + value;
    }
    if (sum !== undefined) totals[metric] = sum;
  }
  return totals;
}

async function expectGoals(facts: BrandFacts): Promise<Expected> {
  if (facts.adAccounts.length === 0) return { kind: 'missing', detail: 'no ad account' };
  const window = monthToDate();
  if (!window) return { kind: 'missing', detail: 'the 1st of the month: no complete day' };
  const client = await memberClient();
  const settled = await Promise.allSettled(
    facts.adAccounts.map((account) => readAccountFigures(client, facts, account, window)),
  );
  const reads = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const failed = facts.adAccounts.filter((_, index) => settled[index]?.status === 'rejected');
  if (reads.length === 0) {
    return { kind: 'warn', detail: `no ad account answered the bench (${failed.length} failed)` };
  }
  const byCurrency = new Map<string | null, AccountFigures[]>();
  for (const read of reads)
    byCurrency.set(read.currency, [...(byCurrency.get(read.currency) ?? []), read]);
  const groups = [...byCurrency.entries()]
    .map(([currency, list], order) => ({
      order,
      currency,
      accounts: list.length,
      spending: list.filter((account) => account.spent).length,
      totals: sumFigures(list),
    }))
    .sort((a, b) => b.spending - a.spending || b.accounts - a.accounts || a.order - b.order);
  const resultTotals: Partial<Record<HomeObjectiveMetric, number>> = {};
  for (const metric of COUNTED) {
    if (HOME_OBJECTIVE_METRICS[metric].unit === 'currency') {
      const value = groups[0]?.totals[metric];
      if (value !== undefined) resultTotals[metric] = value;
      continue;
    }
    const values = groups.flatMap((group) =>
      group.totals[metric] === undefined ? [] : [group.totals[metric] as number],
    );
    if (values.length > 0) resultTotals[metric] = values.reduce((a, b) => a + b, 0);
  }
  const resolved = resolveHomeObjectives({
    scope: 'brand',
    rows: facts.profileRows,
    totals: resultTotals,
    suggested: facts.reading.goal.suggested,
  });
  const primary: HomeObjective =
    resolved.objectives.find((goal) => goal.role === 'primary') ??
    resolved.objectives[0] ??
    ({ id: 'spend', label: 'Spend', metric: 'spend', role: 'primary' } as HomeObjective);
  const metric = primary.metric;
  const failedNote =
    failed.length > 0
      ? `; ${failed.length} account(s) did not answer the bench: ${failed.map((a) => a.id).join(', ')}`
      : '';
  const base = `${window.since}..${window.until}, goal ${metric} (${resolved.source}${resolved.fromSuggestion ? ', Brand Book' : ''}), ${reads.length} account(s), currencies ${groups.map((g) => `${g.currency}:${g.spending}/${g.accounts}`).join(' ')}${failedNote}`;
  if (HOME_OBJECTIVE_METRICS[metric].unit === 'count') {
    const value = sumFigures(reads)[metric];
    return value === undefined
      ? { kind: 'missing', detail: `${base}; no account counts ${metric}` }
      : { kind: 'value', value, currency: null, detail: base };
  }
  const spending = groups.filter((group) => group.spending > 0);
  const shown = spending.length > 0 ? spending : groups.slice(0, 1);
  const headline = shown.find((group) => group.totals[metric] !== undefined);
  return headline
    ? {
        kind: 'value',
        value: headline.totals[metric] as number,
        currency: headline.currency,
        detail: base,
      }
    : { kind: 'missing', detail: `${base}; no account counts ${metric}` };
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

type TileState = { id: HomeTileId; state: string; body: string };

/** Every slot's frame state, polled until nothing loads or the timeout. */
async function settleTiles(page: Page, ids: HomeTileId[]): Promise<TileState[]> {
  const deadline = Date.now() + SETTLE_MS;
  let states: TileState[] = [];
  for (;;) {
    states = await page.evaluate((tileIds) => {
      return tileIds.map((id) => {
        const slot = document.querySelector(`[data-board-slot="${id}"]`);
        const frame = slot?.querySelector(':scope > [data-module-state]');
        return {
          id,
          state: frame?.getAttribute('data-module-state') ?? 'absent',
          body: ((frame as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
        };
      });
    }, ids);
    if (states.every((tile) => tile.state !== 'loading' && tile.state !== 'absent')) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(1_000);
  }
  return states as TileState[];
}

async function headlineOf(page: Page, id: HomeTileId): Promise<HeadlineAttrs | null> {
  const node = page.locator(`[data-board-slot="${id}"] [data-testid="home-tile-${id}-headline"]`);
  if ((await node.count()) === 0) return null;
  const first = node.first();
  return {
    value: await first.getAttribute('data-value'),
    currency: await first.getAttribute('data-currency'),
    total: await first.getAttribute('data-total'),
    failing: await first.getAttribute('data-failing'),
  };
}

async function sidewaysScroll(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      offenders.push(`page ${doc.scrollWidth}px > ${window.innerWidth}px`);
    }
    const root = document.querySelector('[data-testid="home-board-root"]');
    if (!root) return ['home-board-root absent'];
    for (let node = root.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX !== 'visible' && node.scrollWidth > node.clientWidth + 1) {
        offenders.push(
          `scroller ${node.getAttribute('data-testid') ?? node.tagName.toLowerCase()} ${node.scrollWidth}px > ${node.clientWidth}px`,
        );
      }
    }
    if (root.scrollWidth > root.clientWidth + 1) {
      offenders.push(`board ${root.scrollWidth}px > ${root.clientWidth}px`);
    }
    const parts = [
      ...root.querySelectorAll('[data-board-slot] > [data-module-state]'),
      ...root.querySelectorAll('[data-testid="home-ask"]'),
    ];
    for (const part of parts) {
      if (part.scrollWidth > part.clientWidth + 1) {
        offenders.push(
          `${part.getAttribute('data-testid')} ${part.scrollWidth}px > ${part.clientWidth}px`,
        );
      }
    }
    return offenders;
  });
}

/** A full screenshot with every clipping ancestor of the board let out, then put back. */
async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="home-board-root"]');
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
  await page.emulateMedia({ colorScheme: appearance });
  await page.evaluate((next) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    root.classList.remove(next === 'dark' ? 'light' : 'dark');
    root.classList.add(next);
    root.style.colorScheme = next;
  }, appearance);
  await page.waitForTimeout(500);
}

type Chunk404 = { url: string; phase: string; type: string; initiator: string };

/** Every 404 on the app's own chunks, with who asked for it: a chunk 404 is a console error, and
 *  what it means depends on the initiator. */
async function watchChunk404s(page: Page, phaseOf: () => string): Promise<Chunk404[]> {
  const seen: Chunk404[] = [];
  const initiators = new Map<string, string>();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (event) => {
    if (!event.request.url.includes('/_next/static/')) return;
    const frames = event.initiator.stack?.callFrames ?? [];
    const stack = frames
      .slice(0, 4)
      .map(
        (frame) =>
          `${frame.functionName || '(anon)'}@${frame.url.split('/').pop()}:${frame.lineNumber}`,
      )
      .join(' < ');
    initiators.set(
      event.requestId,
      `${event.initiator.type} ${event.initiator.url ?? ''} ${stack}`.trim(),
    );
  });
  cdp.on('Network.responseReceived', (event) => {
    if (event.response.status !== 404 || !event.response.url.includes('/_next/static/')) return;
    seen.push({
      url: new URL(event.response.url).pathname,
      phase: phaseOf(),
      type: event.type,
      initiator: initiators.get(event.requestId) ?? 'unknown',
    });
  });
  return seen;
}

/** Every loading placeholder the app draws (the Skeleton primitives, and a plain pulse). */
const SKELETONS = '[data-slot="skeleton"], [data-slot="skeleton-text"], .animate-pulse';

/** Closes a side sheet (Escape, then its close button) and waits until it is gone. */
async function closeSheet(page: Page, sheet: Locator): Promise<void> {
  if (!(await sheet.isVisible())) return;
  await page.keyboard.press('Escape');
  try {
    await expect(sheet).toBeHidden({ timeout: 8_000 });
  } catch {
    await sheet.getByRole('button', { name: /close/i }).first().click({ timeout: 8_000 });
    await expect(sheet).toBeHidden({ timeout: 8_000 });
  }
}

async function boardOrder(page: Page): Promise<string> {
  return (await page.getByTestId('home-board').getAttribute('data-board-order')) ?? '';
}

async function closeKeepingState(context: BrowserContext): Promise<PlaywrightStorageState> {
  const state = (await context.storageState()) as PlaywrightStorageState;
  await context.close();
  return state;
}

/** Writes are never let through. Plumbing the app writes itself on a session's first render
 *  (the session's brand pin, the member's active brand) passes and is listed. */
const PLUMBING_TABLES = new Set(['user_session_brands', 'user_brand_preferences']);
const WRITE_NAME =
  /approve|dismiss|apply|promote|publish|send|email|save|create|update|delete|insert|upsert|reset|retry|schedule/i;

type Guard = { seen: string[]; blocked: string[]; outsideBoard: boolean };

async function guardWrites(context: BrowserContext, guard: Guard): Promise<void> {
  await context.route(`${PROD_SUPABASE_URL}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
    const path = new URL(request.url()).pathname;
    const table = /^\/rest\/v1\/(?!rpc\/)([^/?]+)/.exec(path)?.[1] ?? null;
    if (table) {
      if (PLUMBING_TABLES.has(table)) {
        guard.seen.push(`${method} ${table} (plumbing)`);
        return route.continue();
      }
      guard.blocked.push(`${method} ${path}`);
      return route.abort();
    }
    const fn = /^\/functions\/v1\/(.+)$/.exec(path)?.[1] ?? null;
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(path)?.[1] ?? null;
    const name = fn ?? rpc ?? path;
    if (WRITE_NAME.test(name)) {
      guard.blocked.push(`${method} ${name}`);
      return route.abort();
    }
    guard.seen.push(`${method} ${name}`);
    return route.continue();
  });
  await context.route(`https://${API_HOST}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
    const path = new URL(request.url()).pathname;
    if (guard.outsideBoard || WRITE_NAME.test(path) || /jaina|chat/i.test(path)) {
      guard.blocked.push(
        `${method} ${API_HOST}${path}${guard.outsideBoard ? ' (outside the board)' : ''}`,
      );
      return route.abort();
    }
    guard.seen.push(`${method} ${API_HOST}${path}`);
    return route.continue();
  });
}

// ---------------------------------------------------------------------------
// One brand, end to end
// ---------------------------------------------------------------------------

async function expectedFor(
  id: HomeTileId,
  facts: BrandFacts,
  context: BrowserContext | null,
  baseURL: string,
  mountedAt: number,
): Promise<Expected> {
  switch (id) {
    case 'goals':
      return expectGoals(facts);
    case 'opps':
      return expectOpps(facts);
    case 'checklist':
      return expectChecklist(facts);
    case 'autopilot':
      return expectAutopilot(facts, mountedAt);
    case 'pacing':
      return expectPacing(facts);
    case 'health':
      return expectHealth(facts);
    case 'setup':
      return expectSetup(facts);
    case 'creative':
      return expectCreative(facts);
    case 'organic':
      return expectOrganic(facts, context, baseURL);
    case 'market':
      return expectMarket(facts);
    case 'brief':
      return expectBrief(facts);
  }
}

async function benchBrand(
  browser: Browser,
  facts: BrandFacts,
  baseURL: string,
  options: { composerCheck: boolean },
): Promise<void> {
  const scope = `${facts.key} [${facts.reading.mode}]`;
  const expectedOrder = facts.board.tiles.map((tile) => tile.id);
  notes.push(
    `${scope}: ${facts.name} ${facts.brandId}; ${facts.adAccounts.length} ad account(s) (${facts.adAccounts.map((a) => `${a.platform}:${a.id}:${a.currency ?? '?'}`).join(', ')}), ${facts.organicAccounts.length} organic; board ${expectedOrder.join(' → ')}`,
  );

  await pinSessionBrand(session.accessToken, facts.brandId);
  const context = await browser.newContext({
    storageState: latestState ?? session.state,
    viewport: { width: 1440, height: 1000 },
    timezoneId: VIEWER_TIME_ZONE,
    colorScheme: 'light',
  });
  const guard: Guard = { seen: [], blocked: [], outsideBoard: false };
  await guardWrites(context, guard);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const knownConsole = new Map<string, string[]>();
  let capture = true;
  page.on('console', (message) => {
    if (!capture || message.type() !== 'error') return;
    const line = `${message.text()} @ ${message.location().url ?? ''}`;
    const known = CONSOLE_KNOWN.find((entry) => entry.pattern.test(line));
    if (known) {
      knownConsole.set(known.id, [...(knownConsole.get(known.id) ?? []), line.slice(0, 200)]);
      return;
    }
    consoleErrors.push(line.slice(0, 300));
  });
  page.on('pageerror', (error) => {
    if (capture) consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`);
  });
  let phase = 'load';
  const chunk404s = await watchChunk404s(page, () => phase);
  let goalTargetsStatus: number | null = null;
  page.on('response', (response) => {
    if (response.url().includes('/api/home/goal-targets')) goalTargetsStatus = response.status();
  });
  // What an edge said when it refused the browser: the console only says "failed to load".
  const edgeRefusals = new Map<string, string>();
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() < 400 || !url.includes('/functions/v1/')) return;
    const fn = new URL(url).pathname.replace('/functions/v1/', '');
    let account = '-';
    try {
      account =
        (JSON.parse(response.request().postData() ?? '{}') as { adAccountId?: string })
          .adAccountId ?? '-';
    } catch {
      // A body that is not JSON names no account; the refusal is still listed.
    }
    void response
      .text()
      .catch(() => '')
      .then((body) => {
        edgeRefusals.set(`${fn} ${account}`, `${response.status()} ${body.slice(0, 160)}`);
      });
  });
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  try {
    const mountedAt = Date.now();
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 240_000 });
    const board = page.getByTestId('home-board');
    try {
      await expect(board).toBeVisible({ timeout: 240_000 });
    } catch (error) {
      await shoot(page, `${facts.key}-no-board`).catch(() => undefined);
      grade(scope, 'the board renders', 'FAIL', (error as Error).message.split('\n')[0]);
      return;
    }

    await check(scope, `data-mode is ${facts.reading.mode}`, async () => {
      await expect(board).toHaveAttribute('data-mode', facts.reading.mode);
      await expect(page.getByTestId('home-board-mode')).toHaveText(facts.reading.modeLabel);
    });
    await check(scope, 'data-board-order is readHomeBoard’s', async () => {
      await expect(board).toHaveAttribute('data-board-order', expectedOrder.join(','));
      return expectedOrder.join(',');
    });

    // 2. Every tile settles; every ready headline equals the bench's own read.
    const states = await settleTiles(page, expectedOrder);
    notes.push(`${scope}: settled ${states.map((tile) => `${tile.id}=${tile.state}`).join(' ')}`);
    for (const tile of states) {
      const settledOk = tile.state === 'ready' || tile.state === 'missing';
      grade(
        scope,
        `${tile.id} settles to ready or missing`,
        settledOk ? 'PASS' : 'FAIL',
        settledOk
          ? tile.state
          : `${tile.state}${tile.state === 'loading' ? ` after ${SETTLE_MS / 1000}s` : ''}: "${tile.body.slice(0, 160)}"`,
      );
      if (!settledOk) continue;

      let expected: Expected;
      try {
        expected = await expectedFor(tile.id, facts, context, baseURL, mountedAt);
      } catch (error) {
        grade(
          scope,
          `${tile.id} direct read`,
          'WARN',
          `un-exercised hop: the bench's own read failed — ${(error as Error).message.split('\n')[0]}`,
        );
        continue;
      }
      tileShownOn.set(tile.id, [...(tileShownOn.get(tile.id) ?? []), facts.key]);
      if (tile.state === 'ready' && expected.kind !== 'warn') {
        headlineProven.set(tile.id, [...(headlineProven.get(tile.id) ?? []), facts.key]);
      }
      const attrs = tile.state === 'ready' ? await headlineOf(page, tile.id) : null;
      const step = `${tile.id} headline equals the direct read`;
      if (tile.state === 'missing') {
        if (expected.kind === 'value' && expected.value !== 0) {
          grade(
            scope,
            step,
            'FAIL',
            `tile missing ("${tile.body.slice(0, 120)}") but the direct read has ${expected.value} — ${expected.detail}`,
          );
        } else {
          grade(
            scope,
            `${tile.id} is missing for a reason`,
            'PASS',
            `"${tile.body.slice(0, 140)}" · ${expected.detail}`,
          );
        }
        continue;
      }
      if (!attrs) {
        grade(scope, step, 'WARN', `ready tile has no headline node · ${expected.detail}`);
        continue;
      }
      switch (expected.kind) {
        case 'warn':
          grade(
            scope,
            step,
            'WARN',
            `rendered ${attrs.value}; un-exercised hop: ${expected.detail}`,
          );
          break;
        case 'missing':
          grade(
            scope,
            step,
            'FAIL',
            `tile ready with ${attrs.value} but the direct read finds nothing: ${expected.detail}`,
          );
          break;
        case 'bounds': {
          const problem = expected.check(attrs);
          grade(
            scope,
            step,
            problem ? 'FAIL' : 'PASS',
            `${problem ?? `rendered ${attrs.value}${attrs.total ? ` of ${attrs.total}` : ''}${attrs.failing ? `, ${attrs.failing} failing` : ''}`} · ${expected.detail}`,
          );
          break;
        }
        case 'value': {
          const same =
            typeof expected.value === 'number'
              ? close(Number(attrs.value), expected.value)
              : attrs.value === expected.value;
          const currencyOk =
            expected.currency === undefined || (attrs.currency ?? '') === (expected.currency ?? '');
          grade(
            scope,
            step,
            same && currencyOk ? 'PASS' : 'FAIL',
            `rendered ${attrs.value}${attrs.currency ? ` ${attrs.currency}` : ''}, direct ${expected.value}${expected.currency ? ` ${expected.currency}` : ''} · ${expected.detail}`,
          );
          break;
        }
      }
    }

    // 5. Light / dark / 390 px: screenshots, sideways scroll.
    phase = 'themes';
    await shoot(page, `${facts.key}-1440-light`);
    await check(scope, 'no sideways scroll at 1440 (light)', async () => {
      const offenders = await sidewaysScroll(page);
      expect(offenders, offenders.join('; ')).toEqual([]);
    });
    await setTheme(page, 'dark');
    await shoot(page, `${facts.key}-1440-dark`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1_000);
    await shoot(page, `${facts.key}-390-dark`);
    await setTheme(page, 'light');
    await shoot(page, `${facts.key}-390-light`);
    await check(scope, 'no sideways scroll at 390 px', async () => {
      const offenders = await sidewaysScroll(page);
      expect(offenders, offenders.join('; ')).toEqual([]);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(600);

    // 3. Each tile's expanded sheet, then the weekly story.
    for (const id of expectedOrder) {
      const open = page.getByTestId(`home-tile-${id}-open`);
      if ((await open.count()) === 0) {
        notes.push(`${scope}: ${id} offers no expanded sheet in its state`);
        continue;
      }
      await check(scope, `${id} sheet opens without an error boundary`, async () => {
        phase = `sheet:${id}`;
        const errorsBefore = consoleErrors.length;
        await open.first().click();
        const sheet = page.getByTestId(`home-tile-${id}-sheet`);
        await expect(sheet).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(500);
        mkdirSync(SHOTS_DIR, { recursive: true });
        let sheetText = '';
        let moduleText = '';
        let checklistItems = 0;
        let tileState: string | null = null;
        try {
          // The panel has finished coming in, the lazy module has downloaded and its reads have
          // settled: no skeleton left. A sheet still loading after 60 s is a hung module, a FAIL.
          await expect(sheet).toHaveCSS('opacity', '1', { timeout: 30_000 });
          await expect(sheet.locator(SKELETONS)).toHaveCount(0, { timeout: 60_000 });
          await sheet.screenshot({ path: resolve(SHOTS_DIR, `${facts.key}-sheet-${id}.png`) });
          sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
          moduleText = (await sheet.locator('[data-testid="home-tile-sheet-body"]').innerText()).trim();
          checklistItems = await sheet.getByTestId('home-checklist-item').count();
          tileState = await page
            .locator(`[data-board-slot="${id}"] > [data-module-state]`)
            .getAttribute('data-module-state');
        } finally {
          // Closed before any verdict: a sheet left open blocks every later click on the board.
          await closeSheet(page, sheet);
        }
        expect(tileState, 'the tile fell into its error boundary').not.toBe('error');
        expect(sheetText).not.toMatch(/could not be drawn|Something went wrong|Application error/i);
        // More than the sheet's own title and description: the module itself drew.
        expect(moduleText.length, `${id}'s module drew nothing below its title`).toBeGreaterThan(20);
        if (id === 'checklist') {
          const headline = await page.getByTestId('home-tile-checklist-headline').getAttribute('data-value');
          expect(String(checklistItems), 'checklist items against the tile headline').toBe(headline);
        }
        const sheetErrors = consoleErrors.slice(errorsBefore);
        expect(
          sheetErrors,
          `console errors while the sheet drew: ${sheetErrors.slice(0, 3).join(' | ')}`,
        ).toEqual([]);
        return `${sheetText.length} chars drawn`;
      });
    }

    await check(scope, 'the weekly story opens', async () => {
      phase = 'story';
      const open = page.getByTestId('home-story-open');
      await expect(open).toBeVisible({ timeout: 30_000 });
      await open.click();
      const sheet = page.getByTestId('home-story-sheet');
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      let slides = 0;
      let storyText = '';
      try {
        await expect(sheet.getByTestId('home-story')).toBeVisible({ timeout: 60_000 });
        await expect(sheet).toHaveCSS('opacity', '1', { timeout: 30_000 });
        await expect(sheet.locator(SKELETONS)).toHaveCount(0, { timeout: 60_000 });
        slides = await sheet.getByTestId('home-story-slide').count();
        await sheet.screenshot({ path: resolve(SHOTS_DIR, `${facts.key}-story.png`) });
        storyText = (await sheet.innerText()).replace(/\s+/g, ' ');
      } finally {
        await closeSheet(page, sheet);
      }
      expect(storyText).not.toMatch(/could not be drawn|Something went wrong|Application error/i);
      return `${slides} slide(s)`;
    });

    // 4. Sorts, then a pin that survives a reload.
    phase = 'sort-pin';
    for (const [label, sort] of [
      ['Urgency', 'urgency'],
      ['Module', 'module'],
      ['Goal impact', 'impact'],
    ] as [string, HomeBoardSort][]) {
      await check(scope, `sort by ${label} orders as arrangeHomeTiles`, async () => {
        const wanted = arrangeHomeTiles(facts.board.tiles, sort, new Set())
          .map((tile) => tile.id)
          .join(',');
        await page.getByRole('tab', { name: label, exact: true }).click();
        await expect(board).toHaveAttribute('data-board-order', wanted, { timeout: 10_000 });
        return wanted;
      });
    }

    const last = expectedOrder[expectedOrder.length - 1];
    if (last) {
      await check(scope, `pinning ${last} puts it first, through a reload`, async () => {
        await page.getByTestId(`home-tile-${last}-pin`).click();
        await expect(board).toHaveAttribute('data-board-order', new RegExp(`^${last}(,|$)`), {
          timeout: 10_000,
        });
        const key = `continuum:home:pins:${session.userId}:${facts.brandId}`;
        const stored = await page.evaluate((k) => window.localStorage.getItem(k), key);
        expect(stored ?? '').toContain(last);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('home-board')).toBeVisible({ timeout: 120_000 });
        await expect(page.getByTestId('home-board')).toHaveAttribute(
          'data-board-order',
          new RegExp(`^${last}(,|$)`),
          { timeout: 30_000 },
        );
        await page.getByTestId(`home-tile-${last}-pin`).click();
        await expect(page.getByTestId('home-board')).toHaveAttribute(
          'data-board-order',
          expectedOrder.join(','),
          { timeout: 10_000 },
        );
        const after = await page.evaluate((k) => window.localStorage.getItem(k), key);
        expect(after ?? '[]').toBe('[]');
        return `${await boardOrder(page)} after unpin`;
      });
    }

    if (options.composerCheck) {
      // Control: a chunk that 404s on a page with no Home board on it is not the board's.
      phase = 'control';
      guard.outsideBoard = true;
      const controlPage = await context.newPage();
      try {
        const control = await watchChunk404s(controlPage, () => 'control:/settings');
        await controlPage.goto('/settings', { waitUntil: 'load', timeout: 240_000 });
        await controlPage.waitForTimeout(8_000);
        for (const hit of control) {
          if (hit.initiator.startsWith('parser')) controlChunks.add(hit.url);
        }
        notes.push(
          `${scope}: control /settings chunk 404s (${control.length}): ${control
            .map((hit) => `${hit.type} ${hit.url} ← ${hit.initiator}`)
            .join(' || ')
            .slice(0, 800)}`,
        );
      } catch (error) {
        notes.push(
          `${scope}: control /settings did not run: ${(error as Error).message.split('\n')[0]}`,
        );
      } finally {
        guard.outsideBoard = false;
        await controlPage.close();
      }
    }

    // Console errors over everything the board drew (both themes, both widths, every sheet). A
    // chunk 404 is set apart only when the server HTML itself asked for it and the same chunk 404s
    // on /settings too; a lazy chunk a tile or a sheet asked for stays a FAIL.
    const fromHtml = (line: string): boolean => {
      const path = CHUNK_404.exec(line)?.[1];
      return (
        path !== undefined &&
        controlChunks.has(path) &&
        chunk404s.some((hit) => hit.url === path && hit.initiator.startsWith('parser'))
      );
    };
    const boardErrors = consoleErrors.filter((line) => !fromHtml(line));
    grade(
      scope,
      'no console error on the board',
      boardErrors.length === 0 ? 'PASS' : 'FAIL',
      boardErrors.length === 0
        ? undefined
        : `${boardErrors.length}: ${boardErrors.slice(0, 4).join(' | ')}`,
    );
    if (edgeRefusals.size > 0) {
      const lines = [...edgeRefusals].map(([who, said]) => `${who} → ${said}`);
      notes.push(`${scope}: edges refused the browser — ${lines.join(' || ').slice(0, 1200)}`);
      const refusedAccounts = [...edgeRefusals.keys()].filter((who) =>
        /^paid-media-reporting\/metrics [^-]/.test(who),
      ).length;
      if (refusedAccounts > 0 && expectedOrder.includes('goals')) {
        await check(scope, 'the Goal tile says which reads failed', async () => {
          await expect(page.locator('[data-board-slot="goals"]')).toContainText(
            `${refusedAccounts} ad account${refusedAccounts === 1 ? '' : 's'} didn’t answer`,
          );
          return `${refusedAccounts} refused: ${lines.join(' || ').slice(0, 300)}`;
        });
      }
    }
    const htmlChunks = [...new Set(consoleErrors.filter(fromHtml))];
    if (htmlChunks.length > 0) {
      grade(
        scope,
        'console: chunk 404 from the server HTML',
        'WARN',
        `${chunk404s.length} load(s) of ${[...controlChunks].join(', ')}: a <script> in the dev server's HTML, on /settings too, so not the board's; every tile still drew. A production build is un-exercised here`,
      );
    }
    if (chunk404s.length > 0) {
      notes.push(
        `${scope}: chunk 404s — ${chunk404s
          .map((hit) => `[${hit.phase}] ${hit.type} ${hit.url} ← ${hit.initiator}`)
          .join(' || ')
          .slice(0, 1200)}`,
      );
    }
    for (const entry of CONSOLE_KNOWN) {
      const lines = [...new Set(knownConsole.get(entry.id) ?? [])];
      if (lines.length > 0) {
        grade(scope, `console: ${entry.id}`, 'WARN', `${lines.length} distinct: ${entry.reason}`);
      }
    }

    // 3a. Goal targets. Writes are never exercised. While the route is undeployed, the tile must
    // keep its real figure, say targets are coming, and never offer a form that cannot save.
    await check(scope, 'goal targets: the tile is honest about the route', async () => {
      if (goalTargetsStatus === null) return 'no targets read on this brand';
      if (goalTargetsStatus !== 404) return `route answered ${goalTargetsStatus}: live`;
      const goalTile = page.getByTestId('home-tile-goals');
      if ((await goalTile.getAttribute('data-module-state')) !== 'ready') return 'tile not ready';
      await expect(goalTile).toContainText('No target set yet');
      await expect(goalTile).toContainText('Targets and periods arrive with the goals update');
      return 'route 404: real figure kept, no target form';
    });

    // 3b. The Ask bar: a suggestion opens Jaina with the question written in; nothing is sent.
    await check(scope, 'an Ask suggestion opens Jaina with the question pre-filled', async () => {
      const suggestions = page.getByTestId('home-ask-suggestion');
      const count = await suggestions.count();
      if (count === 0) throw new Error('the Ask bar offers no suggestion');
      const question = (await suggestions.first().getAttribute('title')) ?? '';
      capture = false;
      guard.outsideBoard = true;
      const start = navigations.length;
      await suggestions.first().click();
      await expect
        .poll(
          () =>
            navigations.slice(start).some((url) => {
              const parsed = new URL(url);
              return (
                parsed.pathname === '/scale' &&
                parsed.searchParams.get('tab') === 'jaina' &&
                parsed.searchParams.get('prompt') === question
              );
            }),
          { timeout: 180_000, intervals: [250] },
        )
        .toBe(true);
      if (options.composerCheck) {
        try {
          await expect
            .poll(
              () =>
                page.evaluate(
                  (q) =>
                    [...document.querySelectorAll('textarea, [contenteditable="true"]')].some(
                      (node) =>
                        ((node as HTMLTextAreaElement).value ?? node.textContent ?? '').includes(
                          q,
                        ) || (node.textContent ?? '').includes(q),
                    ),
                  question,
                ),
              { timeout: 120_000, intervals: [500] },
            )
            .toBe(true);
          notes.push(`${scope}: Jaina's composer holds "${question}"`);
        } catch {
          grade(
            scope,
            'Jaina composer holds the question',
            'WARN',
            `link carried "${question}" but no composer showed it within 120 s`,
          );
        }
        await shoot(page, `${facts.key}-jaina-prefilled`).catch(() => undefined);
      }
      return `"${question}" (${count} suggestion(s))`;
    });

    grade(
      scope,
      'no prod write attempted',
      guard.blocked.filter((line) => !line.endsWith('(outside the board)')).length === 0
        ? 'PASS'
        : 'FAIL',
      guard.blocked.length > 0 ? `blocked: ${guard.blocked.slice(0, 6).join(' | ')}` : undefined,
    );
    const seen = [...new Set(guard.seen)];
    if (seen.length > 0)
      notes.push(`${scope}: non-GET calls let through (reads/plumbing): ${seen.join(', ')}`);
    const outsideBlocked = guard.blocked.filter((line) => line.endsWith('(outside the board)'));
    if (outsideBlocked.length > 0)
      notes.push(
        `${scope}: aborted outside the board (Jaina, control page; nothing sent): ${[...new Set(outsideBlocked)].join(', ')}`,
      );
  } finally {
    capture = false;
    latestState = await closeKeepingState(context);
  }
}

// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  session = await mintSessionBundleForEmail(MEMBER_EMAIL);
  const { data } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', session.userId)
    .maybeSingle();
  originalPreference = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
  notes.push(
    `member ${session.userId}; active-brand preference at start ${originalPreference ?? 'none'}`,
  );
});

test.afterAll(async () => {
  if (session) {
    try {
      const restored = await restoreBrandPreference(session.userId, originalPreference);
      grade(
        'cleanup',
        'active-brand preference restored',
        restored === originalPreference ? 'PASS' : 'FAIL',
        `read back ${restored ?? 'none'}, was ${originalPreference ?? 'none'}`,
      );
    } catch (error) {
      grade('cleanup', 'active-brand preference restored', 'FAIL', (error as Error).message);
    }
    const proof = await revokeBenchSession(latestState ?? session.state, session.accessToken);
    grade(
      'cleanup',
      'bench session revoked',
      proof.revoked && proof.pinsLeft === 0 ? 'PASS' : 'FAIL',
      `${proof.sessionId}: ${proof.detail}; pins left ${proof.pinsLeft}`,
    );
  }
  for (const id of homeTileIdSchema.options) {
    const proven = headlineProven.get(id) ?? [];
    const shown = tileShownOn.get(id) ?? [];
    grade(
      'coverage',
      `${id} headline held to a direct read on a ready tile`,
      proven.length > 0 ? 'PASS' : 'WARN',
      proven.length > 0
        ? proven.join(', ')
        : shown.length > 0
          ? `un-exercised: only drew missing, on ${shown.join(', ')}`
          : 'un-exercised: on no benched board',
    );
  }
  for (const [scope, counts] of tally) {
    notes.push(`tally ${scope}: PASS ${counts.PASS} · WARN ${counts.WARN} · FAIL ${counts.FAIL}`);
  }
  notes.push(
    'UN-EXERCISED: goal save, approve/dismiss/send/promote writes, Jaina answering (never sent).',
  );
  recorder.print();
});

test('the adaptive Home on one brand per mode: order, figures, sheets, pins, themes', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(6 * 600_000);
  const brands = await chooseBrands(session.userId);
  let first = true;
  for (const facts of brands) {
    await test.step(`${facts.name.slice(0, 40)} · ${facts.reading.mode}`, () =>
      benchBrand(browser, facts, baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? '', {
        composerCheck: first,
      }));
    first = false;
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
