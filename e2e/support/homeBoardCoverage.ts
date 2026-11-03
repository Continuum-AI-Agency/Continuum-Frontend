// The adaptive Home board, held to its promises over real brands (home:reading:bench).
//
// Two halves:
//   1. boardViolations — the rules readHomeBoard promises, checked against the brand's own
//      signals. Every figure is recounted here from the portfolio rows, never taken from
//      homeBoardWhy, so a sentence that cites the wrong count cannot grade itself.
//   2. tileData — for a tile the board shows, whether its source actually holds data for the
//      brand, mirroring the tile's own `ready` condition (the tile models are imported where they
//      are pure, so the bench and the tile cannot disagree about what "ready" means). A green
//      board whose tiles all draw `missing` is not success: this is the half that says so.
//
// Read-only. Every read here is a SELECT through PostgREST or a read RPC with the service role.

import {
  CycleRunReportSchema,
  CycleRunRowSchema,
  flightOf,
  type HomeBoard,
  type HomeBrandReading,
  type HomeBrandSignals,
  type HomeMode,
  type HomeTileId,
  type PortfolioListItem,
  todayIso,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checklistViewOf } from '../../src/components/dashboard/home-board/modules/checklist/checklistModel';
import { competitorMovesOf } from '../../src/components/dashboard/home-board/modules/market/marketRadarModel';
import {
  buildOrganicWeek,
  organicWeekStart,
} from '../../src/components/dashboard/home-board/modules/organic/organicWeekModel';
import {
  type PacingRunRead,
  pacingView,
} from '../../src/components/dashboard/home-board/modules/pacing/pacingModel';
import type { PersistedOrganicDraftRow } from '../../src/lib/organic/calendar-draft-persistence';

export const LEAD_TILE: Record<HomeMode, HomeTileId> = {
  setup: 'setup',
  fix: 'health',
  operate: 'goals',
  approve: 'opps',
  recommend: 'checklist',
};

/** Tiles that read an ad account's data; none may be promised to a brand without one. */
const ADS_TILES: ReadonlySet<HomeTileId> = new Set([
  'pacing',
  'creative',
  'opps',
  'health',
  'brief',
  'autopilot',
  'checklist',
]);

export type BoardFacts = {
  ads: number;
  organic: number;
  accounts: number;
  issues: number;
  /** Pending recommendations + budget moves over active, non-observe portfolios. */
  waiting: number;
  /** Active, non-observe portfolios Continuum may write. */
  acting: number;
  /** Of those, the ones on autopilot. */
  autopilot: number;
  /** Active portfolios of any mode: a plan and a nightly read belong to one. */
  activePortfolios: number;
  /** Active, non-observe portfolios whose changes the client applies (every write off). */
  clientApplied: number;
  /** Pending recommendations on those portfolios: the client checklist's count. */
  forTheClient: number;
};

/** The counts a board may cite, recounted from the signals (not from homeBoardWhy). */
export function boardFactsOf(signals: HomeBrandSignals, reading: HomeBrandReading): BoardFacts {
  const proposing = signals.portfolios.filter(
    (portfolio) => portfolio.status === 'active' && portfolio.applyMode !== 'observe',
  );
  const acting = proposing.filter((portfolio) => portfolio.canWrite !== false);
  const clientApplied = proposing.filter((portfolio) => portfolio.canWrite === false);
  return {
    ads: signals.accounts.ads,
    organic: signals.accounts.organic,
    accounts: signals.accounts.ads + signals.accounts.organic,
    issues: reading.issues.length,
    waiting: proposing.reduce(
      (sum, portfolio) => sum + portfolio.pendingRecommendations + portfolio.pendingBudgetMoves,
      0,
    ),
    acting: acting.length,
    autopilot: acting.filter((portfolio) => portfolio.applyMode === 'autopilot').length,
    activePortfolios: signals.portfolios.filter((portfolio) => portfolio.status === 'active')
      .length,
    clientApplied: clientApplied.length,
    forTheClient: clientApplied.reduce(
      (sum, portfolio) => sum + portfolio.pendingRecommendations,
      0,
    ),
  };
}

export type BoardRule = 'lead' | 'setup' | 'why' | 'gating' | 'shape';

export const BOARD_RULES: Record<BoardRule, string> = {
  lead: 'the board opens with the mode’s tile (setup→setup, fix→health, operate→goals, approve→opps, recommend→checklist where a client applies the changes, else the top score)',
  setup: 'the setup tile is on the board exactly when the brand has no account',
  why: 'every `why` is null or cites the count its tile names, equal to the brand’s signals',
  gating:
    'no tile without its source (ads tiles need an ad account, organic an organic account, pacing and brief an active portfolio, autopilot a writable acting portfolio, checklist recommend mode with a client-applied portfolio)',
  shape: 'at most 7 tiles, no duplicates, sizes l,m,m then s, at least 5 with an ad account',
};

/** The figure each tile's `why` may cite; a tile absent here has no figure and must say nothing. */
function citableFigure(id: HomeTileId, facts: BoardFacts): { name: string; value: number } | null {
  switch (id) {
    case 'setup':
      return { name: 'accounts', value: facts.accounts };
    case 'health':
      return { name: 'issues', value: facts.issues };
    case 'opps':
      return { name: 'waiting decisions', value: facts.waiting };
    case 'checklist':
      return { name: 'recommendations for the client', value: facts.forTheClient };
    case 'autopilot':
      return facts.autopilot > 0
        ? { name: 'autopilot portfolios', value: facts.autopilot }
        : { name: 'acting portfolios', value: facts.acting };
    default:
      return null;
  }
}

/** Every rule the board breaks for this brand, with the evidence. */
export function boardViolations(
  board: HomeBoard,
  facts: BoardFacts,
): { rule: BoardRule; detail: string }[] {
  const out: { rule: BoardRule; detail: string }[] = [];
  const ids = board.tiles.map((tile) => tile.id);

  const hasChecklist = board.mode === 'recommend' && facts.clientApplied > 0;
  if (board.mode === 'recommend' && !hasChecklist) {
    const [first, ...rest] = board.tiles;
    if (first && rest.some((tile) => tile.score > first.score)) {
      out.push({
        rule: 'lead',
        detail: `recommend with no client checklist opens with ${first.id} (${first.score}), below ${rest.find((tile) => tile.score > first.score)?.id}`,
      });
    }
  } else if (ids[0] !== LEAD_TILE[board.mode]) {
    out.push({
      rule: 'lead',
      detail: `${board.mode} opens with ${ids[0] ?? 'nothing'}, not ${LEAD_TILE[board.mode]} (${facts.ads} ad, ${facts.organic} organic accounts)`,
    });
  }

  if (ids.includes('setup') !== (facts.accounts === 0)) {
    out.push({
      rule: 'setup',
      detail: `setup ${ids.includes('setup') ? 'shown' : 'absent'} with ${facts.accounts} accounts`,
    });
  }

  for (const tile of board.tiles) {
    if (tile.why === null) continue;
    const figure = citableFigure(tile.id, facts);
    const cited = (tile.why.match(/\d+/g) ?? []).map(Number);
    if (!figure) {
      out.push({ rule: 'why', detail: `${tile.id} says "${tile.why}" but holds no figure` });
    } else if (cited.length === 0) {
      out.push({ rule: 'why', detail: `${tile.id} says "${tile.why}", citing no figure` });
    } else if (cited.some((value) => value !== figure.value)) {
      out.push({
        rule: 'why',
        detail: `${tile.id} says "${tile.why}"; the signals hold ${figure.value} ${figure.name}`,
      });
    }
  }

  for (const id of ids) {
    if (ADS_TILES.has(id) && facts.ads === 0) {
      out.push({ rule: 'gating', detail: `${id} without an ad account` });
    }
  }
  if (ids.includes('organic') && facts.organic === 0) {
    out.push({ rule: 'gating', detail: 'organic without an organic account' });
  }
  if (ids.includes('autopilot') && facts.acting === 0) {
    out.push({ rule: 'gating', detail: 'autopilot without a writable acting portfolio' });
  }
  if (ids.includes('checklist') && !hasChecklist) {
    out.push({
      rule: 'gating',
      detail: `checklist in ${board.mode} mode with ${facts.clientApplied} client-applied portfolios`,
    });
  }
  for (const id of ['pacing', 'brief'] as const) {
    if (ids.includes(id) && facts.activePortfolios === 0) {
      out.push({ rule: 'gating', detail: `${id} without an active portfolio` });
    }
  }

  const sizes = board.tiles.map((tile) => tile.size).join('');
  const expectedSizes = board.tiles.map((_, rank) => (rank === 0 ? 'l' : rank <= 2 ? 'm' : 's'));
  if (board.tiles.length > 7) out.push({ rule: 'shape', detail: `${board.tiles.length} tiles` });
  if (new Set(ids).size !== ids.length) out.push({ rule: 'shape', detail: `duplicates: ${ids}` });
  if (sizes !== expectedSizes.join('')) {
    out.push({ rule: 'shape', detail: `sizes ${sizes}, expected ${expectedSizes.join('')}` });
  }
  if (facts.ads > 0 && board.tiles.length < 5) {
    out.push({ rule: 'shape', detail: `${board.tiles.length} tiles with an ad account` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Per-tile real data.
// ---------------------------------------------------------------------------------------------

export type TileData = { has: boolean; detail: string };

/** What the coverage reads know about one brand before any tile read. */
export type CoverageBrand = {
  brandId: string;
  facts: BoardFacts;
  portfolioRows: PortfolioListItem[];
  /** The ad account ids the Home reads (Meta `act_…`, Google customer ids), deduplicated. */
  adAccountIds: string[];
  hasMetaAdAccount: boolean;
};

/** Reads shared across brands, made once. */
export type SharedReads = {
  creative: Map<string, { status: string; verdicts: number }>;
  publishedThisWeek: Map<string, number>;
};

type Admin = SupabaseClient;

const HOUR = 3_600_000;

export async function readSharedCoverage(admin: Admin, now: Date): Promise<SharedReads> {
  const creative = new Map<string, { status: string; verdicts: number }>();
  const reports = await admin
    .schema('paid_media')
    .from('creative_reports')
    .select('brand_id, status, verdicts:report->verdicts');
  if (reports.error) throw new Error(`paid_media.creative_reports: ${reports.error.message}`);
  for (const row of (reports.data ?? []) as {
    brand_id: string;
    status: string;
    verdicts: unknown;
  }[]) {
    creative.set(row.brand_id, {
      status: row.status,
      verdicts: Array.isArray(row.verdicts) ? row.verdicts.length : 0,
    });
  }

  const weekStart = organicWeekStart(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * HOUR);
  const publishedThisWeek = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const posts = await admin
      .schema('organic')
      .from('organic_published_posts')
      .select('brand_id')
      .gte('published_at', weekStart.toISOString())
      .lt('published_at', weekEnd.toISOString())
      .range(from, from + 999);
    if (posts.error) throw new Error(`organic.organic_published_posts: ${posts.error.message}`);
    for (const row of (posts.data ?? []) as { brand_id: string | null }[]) {
      if (row.brand_id)
        publishedThisWeek.set(row.brand_id, (publishedThisWeek.get(row.brand_id) ?? 0) + 1);
    }
    if ((posts.data ?? []).length < 1000) break;
  }
  return { creative, publishedThisWeek };
}

const proposes = (row: PortfolioListItem) =>
  row.status === 'active' && row.apply_mode !== 'observe';

async function oppsData(brand: CoverageBrand): Promise<TileData> {
  const proposing = brand.portfolioRows.filter(proposes);
  return {
    has: proposing.length > 0,
    detail: proposing.length
      ? `${proposing.length} acting portfolio(s), ${brand.facts.waiting} waiting`
      : 'no active non-observe portfolio',
  };
}

async function autopilotData(admin: Admin, brand: CoverageBrand, now: Date): Promise<TileData> {
  const { data, error } = await admin.rpc('optimizer_list_actions', {
    p_brand_id: brand.brandId,
    p_limit: 500,
    p_before: null,
    p_since: new Date(now.getTime() - 24 * HOUR).toISOString(),
  });
  if (error) throw new Error(`optimizer_list_actions(${brand.brandId}): ${error.message}`);
  const count = Array.isArray(data) ? data.length : 0;
  return { has: count > 0, detail: `${count} action(s) in 24 h` };
}

async function pacingData(admin: Admin, brand: CoverageBrand, now: Date): Promise<TileData> {
  const today = todayIso(now);
  const running = brand.portfolioRows.filter((row) => {
    const flight = flightOf(row);
    return (
      row.status !== 'archived' &&
      flight !== null &&
      flight.periodStart <= today &&
      today <= flight.periodEnd
    );
  });
  const runs = new Map<string, PacingRunRead>();
  for (const row of running) {
    const { data, error } = await admin.rpc('optimizer_get_portfolio_performance', {
      p_portfolio_id: row.id,
      p_limit: 10,
    });
    if (error) {
      runs.set(row.id, { status: 'error' });
      continue;
    }
    const report = CycleRunReportSchema.safeParse(data);
    const run = CycleRunRowSchema.safeParse(report.success ? report.data.latest_run : null);
    runs.set(row.id, { status: 'ready', pacing: run.success ? (run.data.pacing ?? null) : null });
  }
  const view = pacingView({
    portfolios: { status: 'ready', rows: brand.portfolioRows },
    runs,
    accounts: [],
    today,
  });
  if (view.state === 'ready') {
    return {
      has: true,
      detail:
        `${view.headline.spent} ${view.headline.currency ?? ''} spent of ${view.headline.plan}`.trim(),
    };
  }
  return {
    has: false,
    detail: view.state === 'missing' ? view.reason : `pacing ${view.state}`,
  };
}

function creativeData(brand: CoverageBrand, shared: SharedReads): TileData {
  if (!brand.hasMetaAdAccount) return { has: false, detail: 'no Meta ad account' };
  const report = shared.creative.get(brand.brandId);
  if (!report) return { has: false, detail: 'no creative_reports row' };
  return {
    has: report.verdicts > 0,
    detail: `${report.verdicts} verdict(s), report ${report.status}`,
  };
}

async function organicData(
  admin: Admin,
  brand: CoverageBrand,
  shared: SharedReads,
  now: Date,
): Promise<TileData> {
  const { data, error } = await admin
    .schema('organic')
    .from('organic_calendar_drafts')
    .select(
      'id, platform, status, scheduled_date, slot_data, platform_account_id, instagram_post_id, updated_at, content_json, content_plan_id, media_stage, client_key, group_id',
    )
    .eq('brand_id', brand.brandId);
  if (error) throw new Error(`organic.organic_calendar_drafts(${brand.brandId}): ${error.message}`);
  const week = buildOrganicWeek({
    now,
    posts: [],
    drafts: (data ?? []) as PersistedOrganicDraftRow[],
  });
  const published = shared.publishedThisWeek.get(brand.brandId) ?? 0;
  const total = published + week.scheduled + week.waiting;
  return {
    has: total > 0,
    detail: `${published} published, ${week.scheduled} scheduled, ${week.waiting} waiting this week`,
  };
}

async function marketData(admin: Admin, brandId: string): Promise<TileData> {
  const awareness = await admin
    .schema('competitor_ad_spy')
    .from('awareness_reports')
    .select('payload')
    .eq('brand_id', brandId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (awareness.error) throw new Error(`awareness_reports(${brandId}): ${awareness.error.message}`);
  const moves = competitorMovesOf(
    (awareness.data?.payload ?? null) as Parameters<typeof competitorMovesOf>[0],
  ).length;

  const generation = await admin
    .schema('brand_trends')
    .from('generations')
    .select('id')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (generation.error)
    throw new Error(`brand_trends.generations(${brandId}): ${generation.error.message}`);
  let trends = 0;
  if (generation.data) {
    const rows = await admin
      .schema('brand_trends')
      .from('trends')
      .select('id', { count: 'exact', head: true })
      .eq('generation_id', (generation.data as { id: string }).id);
    if (rows.error) throw new Error(`brand_trends.trends(${brandId}): ${rows.error.message}`);
    trends = rows.count ?? 0;
  }
  return {
    has: moves + trends > 0,
    detail: `${awareness.data ? `${moves} competitor move(s)` : 'no awareness report'}, ${trends} trend(s)`,
  };
}

async function briefData(admin: Admin, brand: CoverageBrand): Promise<TileData> {
  let newest: string | null = null;
  for (const adAccountId of brand.adAccountIds) {
    const { data, error } = await admin.rpc('optimizer_get_account_read', {
      p_brand_id: brand.brandId,
      p_ad_account_id: adAccountId,
    });
    if (error) throw new Error(`optimizer_get_account_read(${brand.brandId}): ${error.message}`);
    const envelope = (data ?? null) as {
      read?: { narrative?: unknown } | null;
      utc_day?: unknown;
    } | null;
    const narrative = envelope?.read?.narrative;
    if (typeof narrative === 'string' && narrative.trim() !== '') {
      const day = typeof envelope?.utc_day === 'string' ? envelope.utc_day : '?';
      if (!newest || day > newest) newest = day;
    }
  }
  return newest
    ? { has: true, detail: `newest stored narrative ${newest}` }
    : { has: false, detail: `no stored narrative over ${brand.adAccountIds.length} ad account(s)` };
}

/** The checklist tile's headline (open items for the client), null when the tile is `missing`. */
export function checklistHeadline(rows: readonly PortfolioListItem[]): number | null {
  const view = checklistViewOf(rows);
  return view.state === 'ready' ? view.open : null;
}

function checklistData(brand: CoverageBrand): TileData {
  const view = checklistViewOf(brand.portfolioRows);
  if (view.state === 'missing') return { has: false, detail: 'no client-applied portfolio' };
  return {
    has: view.open > 0,
    detail: `${view.open} open item(s) over ${view.portfolios.length} client-applied portfolio(s)`,
  };
}

/** Whether the source of tile `id` holds real data for the brand, mirroring the tile's `ready`. */
export async function tileData(
  id: HomeTileId,
  admin: Admin,
  brand: CoverageBrand,
  shared: SharedReads,
  now: Date,
): Promise<TileData> {
  switch (id) {
    case 'goals':
      return brand.facts.ads > 0
        ? {
            has: true,
            detail: 'has an ad account (the MTD figure needs a member session: un-exercised)',
          }
        : { has: false, detail: 'no ad account to count a goal from' };
    case 'setup':
      return { has: true, detail: 'steps derive from the connections read here' };
    case 'health':
      return brand.facts.ads > 0
        ? { has: true, detail: `${brand.facts.issues} reading issue(s)` }
        : { has: false, detail: 'no ad account' };
    case 'opps':
      return oppsData(brand);
    case 'autopilot':
      return autopilotData(admin, brand, now);
    case 'pacing':
      return pacingData(admin, brand, now);
    case 'creative':
      return creativeData(brand, shared);
    case 'organic':
      return organicData(admin, brand, shared, now);
    case 'market':
      return marketData(admin, brand.brandId);
    case 'brief':
      return briefData(admin, brand);
    case 'checklist':
      return checklistData(brand);
  }
}
