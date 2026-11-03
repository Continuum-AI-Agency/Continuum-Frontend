import { writeFileSync } from 'node:fs';
import {
  HOME_TILE_MODULE_ORDER,
  type HomeBoard,
  type HomeBrandReading,
  type HomeBrandSignals,
  type HomeMode,
  type HomeTileId,
  type PortfolioListItem,
  readBrand,
  readHomeBoard,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import {
  type HomeProfileRow,
  homeProfileRowSchema,
} from '../packages/contracts/src/home/objectives';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from '../src/lib/home/brandSignals';
import { mapIntegrationTypeToPlatformKey } from '../src/lib/integrations/platform';
import { createBenchRecorder } from './support/benchRecorder';
import {
  BOARD_RULES,
  type BoardFacts,
  type BoardRule,
  boardFactsOf,
  boardViolations,
  type CoverageBrand,
  checklistHeadline,
  readSharedCoverage,
  type TileData,
  tileData,
} from './support/homeBoardCoverage';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// home:reading:bench — the Home's reading and adaptive board of EVERY brand in production.
//
// Reads each brand's real signals from production Supabase (assigned accounts, Optimizer
// portfolios through optimizer_list_portfolios, the Brand Book's structured business section,
// saved goals, the approval-chain flag), builds them with the same mappers the Home's server
// loader uses (src/lib/home/brandSignals.ts) and reads them with the same `readBrand` and
// `readHomeBoard` (loadHomeBoard in src/lib/home/brandReading.server.ts). Then it holds every
// reading to the rules the Home promises:
//   1. Setup exactly when nothing is connected, and never otherwise.
//   2. The first module follows the mode (fix → Account health, approve → Opportunities, …).
//   3. Every issue names a portfolio of its own brand.
//   4. Every acting portfolio with something waiting shows up as an opportunity.
//   5. A brand whose Brand Book names its call to action gets a business model (Easy Fit's
//      "Schedule a … facility tour" reads as a business that books leads).
// And every board to the rules readHomeBoard promises (e2e/support/homeBoardCoverage.ts):
//   6. The board opens with the mode's tile (setup→setup, fix→health, operate→goals,
//      approve→opps, recommend→checklist).
//   7. The setup tile is on the board exactly when the brand has no account.
//   8. Every `why` is null or cites the count its tile names, recounted here from the portfolio
//      rows (issues, waiting decisions, accounts, autopilot/acting portfolios) — the number,
//      not just a digit.
//   9. No tile without its source: pacing, creative, opps, health, brief, autopilot and
//      checklist need an ad account; organic an organic account; autopilot a writable acting
//      portfolio; checklist recommend mode.
//  10. At most 7 tiles, no duplicates, sizes l,m,m then s; at least 5 with an ad account.
//
// Then per-module real-data coverage (the factory:outcomes lesson: a green board that shows
// `missing` on most brands is not success). For every brand whose board carries tile X it reads
// whether X's source holds data, mirroring the tile's own `ready` (the pure tile models are
// imported: pacingView, checklistViewOf, buildOrganicWeek, competitorMovesOf) and prints
// tile → brands showing it → brands with data → %. A tile promised on some board with ZERO
// brands holding data is a named WARN, never silent. It also prints Easy Fit, Easy Fit Meta and
// Pink Elephant tile by tile, and one real brand per mode as `E2E_BRANDS=…` for
// home-board.bench.spec.ts.
//
// It reads only (SELECTs and read RPCs, service role). Un-exercised by design:
//   - the accounts are counted from brand_profile_integration_accounts, because
//     get_brand_integration_summary is granted to signed-in members only;
//   - the goal tile's month-to-date figure (paid-media-reporting edge, member session) — goals
//     counts as "has data" when the brand has an ad account, nothing more;
//   - the organic week counts published posts on a local-time Monday–Sunday window straight from
//     organic.organic_published_posts (the calendar-posts route dedupes in the brand's zone) and
//     drafts straight from organic.organic_calendar_drafts (the Backend drafts route);
//   - market trends are the row count of the brand's newest completed brand_trends generation,
//     not the trends-read edge's mapped answer;
//   - the rendered tiles and their headline figures are what home-board.bench.spec.ts drives.
// Set HOME_READING_OUT=<file> to keep every reading and board as JSON.
// ---------------------------------------------------------------------------

const EASYFIT_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
/** Pink Elephant: one recommend portfolio, Google writes off — the client executes. */
const PINK_BRAND_ID = '8e5b7185-e43f-4150-b763-b86c4f5297a0';
/** Easy Fit's second brand, the one with the running Meta plan (full id looked up by prefix). */
const EASYFIT_META_PREFIX = '148583e0';
const CONCURRENCY = 6;

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const notes: string[] = [];
const recorder = createBenchRecorder('home:reading:bench', notes);

type BrandRow = {
  id: string;
  brand_name: string | null;
  description: string | null;
  approval_chain_required: boolean | null;
};
type AssetRow = {
  brand_profile_id: string;
  integration_accounts_assets: {
    type: string | null;
    status: string | null;
    external_account_id: string | null;
  } | null;
};
type BookRow = { brand_id: string; business: unknown; headline: unknown };

/** Every row of a table, 1,000 at a time. `activeOnly` keeps the rows whose `active` is true. */
async function all<T>(
  schema: string,
  table: string,
  columns: string,
  activeOnly = false,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = admin.schema(schema).from(table).select(columns);
    if (activeOnly) query = query.eq('active', true);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`${schema}.${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return rows;
  }
}

function bucketsOf(assets: AssetRow[]): AccountBuckets {
  const buckets: AccountBuckets = {};
  for (const asset of assets) {
    const type = asset.integration_accounts_assets?.type ?? null;
    const key = type === 'tiktok_advertiser' ? 'tiktokAds' : mapIntegrationTypeToPlatformKey(type);
    if (!key) continue;
    const bucket = buckets[key] ?? { accounts: [] };
    buckets[key] = bucket;
    bucket.accounts.push({
      type,
      status: asset.integration_accounts_assets?.status ?? null,
    });
  }
  return buckets;
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index] as T);
      }
    }),
  );
  return results;
}

const FIRST_FOR: Partial<Record<HomeMode, string>> = {
  setup: 'setup',
  fix: 'health',
  operate: 'performance',
  approve: 'opportunities',
};

type Read = {
  brandId: string;
  name: string;
  accounts: { ads: number; organic: number };
  portfolios: ReturnType<typeof portfolioSignalsFrom>;
  portfolioRows: PortfolioListItem[];
  signals: HomeBrandSignals;
  reading: HomeBrandReading;
  board: HomeBoard;
  facts: BoardFacts;
  adAccountIds: string[];
  hasMetaAdAccount: boolean;
};

/** The ad accounts the Home reads: Meta ad accounts (`act_…`) and Google Ads customers that run
 *  ads (a manager runs none), each once. */
function adAccountsOf(assets: AssetRow[]): { ids: string[]; hasMeta: boolean } {
  const ids = new Set<string>();
  let hasMeta = false;
  for (const asset of assets) {
    const row = asset.integration_accounts_assets;
    const external = row?.external_account_id?.trim();
    if (!row || !external) continue;
    if (row.type === 'meta_ad_account') {
      hasMeta = true;
      ids.add(external.startsWith('act_') ? external : `act_${external}`);
    } else if (
      mapIntegrationTypeToPlatformKey(row.type) === 'googleAds' &&
      row.status !== 'manager'
    ) {
      ids.add(external);
    }
  }
  return { ids: [...ids], hasMeta };
}

const E2E_MODES: HomeMode[] = ['operate', 'fix', 'recommend', 'approve', 'setup'];

const label = (read: Read) => `${read.name.slice(0, 40)} (${read.brandId.slice(0, 8)})`;

/** Rules 6–10 over every board, then each tile's real-data coverage, the named brands and the
 *  e2e pick. */
async function checkBoards(reads: Read[]) {
  const broken = new Map<BoardRule, string[]>();
  for (const read of reads) {
    for (const violation of boardViolations(read.board, read.facts)) {
      broken.set(violation.rule, [
        ...(broken.get(violation.rule) ?? []),
        `${label(read)}: ${violation.detail}`,
      ]);
    }
  }
  for (const rule of Object.keys(BOARD_RULES) as BoardRule[]) {
    const failures = broken.get(rule) ?? [];
    recorder.record(
      `board: ${BOARD_RULES[rule]}`,
      failures.length === 0 ? 'PASS' : 'FAIL',
      failures.length === 0
        ? `${reads.length} boards`
        : `${failures.length} of ${reads.length} boards — ${failures.slice(0, 8).join('; ')}${failures.length > 8 ? '; …' : ''}`,
    );
  }

  // The checklist tile's sentence and its headline must name the same figure: the sentence
  // counts every waiting decision (recommendations + budget moves), the tile the open
  // recommendations on client-applied portfolios.
  const checklistDrift = reads.flatMap((read) => {
    const tile = read.board.tiles.find((candidate) => candidate.id === 'checklist');
    if (!tile?.why) return [];
    const headline = checklistHeadline(read.portfolioRows);
    return headline === read.facts.waiting
      ? []
      : [`${label(read)}: why "${tile.why}", tile headline ${headline ?? 'missing'}`];
  });
  if (checklistDrift.length > 0) {
    recorder.record(
      'board: the checklist sentence names the figure its tile shows',
      'WARN',
      checklistDrift.join('; '),
    );
  }

  const now = new Date();
  const shared = await recorder.step('read the shared tile sources', () =>
    readSharedCoverage(admin, now),
  );
  const coverage = new Map<string, Map<HomeTileId, TileData>>();
  const failedReads: string[] = [];
  await mapLimit(reads, CONCURRENCY, async (read) => {
    const brand: CoverageBrand = {
      brandId: read.brandId,
      facts: read.facts,
      portfolioRows: read.portfolioRows,
      adAccountIds: read.adAccountIds,
      hasMetaAdAccount: read.hasMetaAdAccount,
    };
    const tiles = new Map<HomeTileId, TileData>();
    for (const tile of read.board.tiles) {
      try {
        tiles.set(tile.id, await tileData(tile.id, admin, brand, shared, now));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedReads.push(`${label(read)} ${tile.id}: ${message}`);
        tiles.set(tile.id, { has: false, detail: `read failed: ${message}` });
      }
    }
    coverage.set(read.brandId, tiles);
  });
  recorder.record(
    'every tile source read answered (service role, read-only)',
    failedReads.length === 0 ? 'PASS' : 'FAIL',
    failedReads.slice(0, 6).join('; ') || undefined,
  );
  notes.push(
    'autopilot coverage reads optimizer_list_actions(p_since => now() - 24 h) directly: the RPC answers the service role, no table fallback needed',
  );

  console.log('\nTile coverage: tile → brands showing it → brands with real data → %');
  for (const id of HOME_TILE_MODULE_ORDER) {
    const showing = reads.filter((read) => read.board.tiles.some((tile) => tile.id === id));
    const withData = showing.filter((read) => coverage.get(read.brandId)?.get(id)?.has);
    const pct = showing.length ? Math.round((withData.length / showing.length) * 100) : 0;
    const line = `coverage ${id.padEnd(9)} shown ${String(showing.length).padStart(3)}  data ${String(withData.length).padStart(3)}  ${String(pct).padStart(3)}%`;
    console.log(line);
    notes.push(line.replace(/\s+/g, ' '));
    if (showing.length > 0 && withData.length === 0) {
      recorder.record(
        `coverage: ${id} is promised on ${showing.length} boards and no brand has data for it`,
        'WARN',
        `e.g. ${showing
          .slice(0, 3)
          .map((read) => `${label(read)}: ${coverage.get(read.brandId)?.get(id)?.detail ?? '?'}`)
          .join('; ')}`,
      );
    }
  }
  notes.push(
    'coverage goals = has an ad account only; the month-to-date figure needs a member session and stays un-exercised here',
  );

  const named = [
    reads.find((read) => read.brandId === EASYFIT_BRAND_ID),
    reads.find((read) => read.brandId.startsWith(EASYFIT_META_PREFIX)),
    reads.find((read) => read.brandId === PINK_BRAND_ID),
  ];
  for (const read of named) {
    if (!read) continue;
    console.log(`\n${read.name} — ${read.brandId}`);
    console.log(
      `  mode ${read.board.mode} (${read.reading.modeReason}); board ${read.board.tiles.map((tile) => tile.id).join(' > ')}`,
    );
    for (const tile of read.board.tiles) {
      const data = coverage.get(read.brandId)?.get(tile.id);
      console.log(
        `  ${tile.id.padEnd(9)} ${tile.size}  why ${tile.why === null ? '—' : `"${tile.why}"`}  ${data?.has ? 'DATA' : 'no data'}: ${data?.detail ?? '?'}`,
      );
    }
    notes.push(
      `${label(read)}: ${read.board.mode}; ${read.board.tiles
        .map((tile) => `${tile.id}${coverage.get(read.brandId)?.get(tile.id)?.has ? '+' : '-'}`)
        .join(' > ')}`,
    );
  }
  for (const [name, read] of [
    ['Easy Fit', named[0]],
    ['Easy Fit Meta', named[1]],
    ['Pink Elephant', named[2]],
  ] as const) {
    if (!read)
      recorder.record(`named brand ${name} is read`, 'FAIL', 'not among the active brands');
  }

  // One real brand per mode for the e2e bench: the one whose board has the most tiles with data.
  const picks = E2E_MODES.map((mode) => {
    const [best] = reads
      .filter((read) => read.board.mode === mode)
      .map((read) => ({
        read,
        withData: [...(coverage.get(read.brandId)?.values() ?? [])].filter((data) => data.has)
          .length,
      }))
      .sort(
        (a, b) =>
          b.withData - a.withData ||
          b.read.board.tiles.length - a.read.board.tiles.length ||
          a.read.name.localeCompare(b.read.name),
      );
    return { mode, best };
  });
  console.log('');
  for (const { mode, best } of picks) {
    if (!best) {
      recorder.record(
        `e2e pick: a real brand reads ${mode}`,
        'WARN',
        `no active brand reads ${mode}`,
      );
      continue;
    }
    console.log(
      `E2E ${mode.padEnd(9)} ${best.read.brandId}  ${best.read.name}  (${best.withData}/${best.read.board.tiles.length} tiles with data)`,
    );
  }
  const pickLine = `E2E_BRANDS=${picks
    .flatMap(({ mode, best }) => (best ? [`${mode}:${best.read.brandId}`] : []))
    .join(',')}`;
  console.log(pickLine);
  notes.push(pickLine);
}

async function main() {
  const [brands, assets, books, profiles] = await recorder.step('read every brand', () =>
    Promise.all([
      // Only the brands a member can open: a soft-deleted brand (active=false) has no Home.
      all<BrandRow>(
        'brand_profiles',
        'brand_profiles',
        'id, brand_name, description, approval_chain_required',
        true,
      ),
      all<AssetRow>(
        'brand_profiles',
        'brand_profile_integration_accounts',
        'brand_profile_id, integration_accounts_assets:integration_account_id(type, status, external_account_id)',
      ),
      all<BookRow>(
        'brand_profiles',
        'brand_book',
        'brand_id, business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      ),
      all<Record<string, unknown>>(
        'brand_profiles',
        'home_profiles',
        'brand_id, scope, objectives, source, updated_at',
      ),
    ]),
  );

  const assetsBy = Map.groupBy(assets, (row) => row.brand_profile_id);
  const bookBy = new Map(books.map((row) => [row.brand_id, row]));
  const profilesBy = new Map<string, HomeProfileRow[]>();
  for (const raw of profiles) {
    const parsed = homeProfileRowSchema.safeParse(raw);
    if (parsed.success)
      profilesBy.set(parsed.data.brand_id, [
        ...(profilesBy.get(parsed.data.brand_id) ?? []),
        parsed.data,
      ]);
  }

  const reads: Read[] = await mapLimit(brands, CONCURRENCY, async (brand) => {
    const accounts = accountCountsFrom(bucketsOf(assetsBy.get(brand.id) ?? []));
    let portfolioRows: unknown = [];
    if (accounts.ads + accounts.organic > 0) {
      const { data, error } = await admin.rpc('optimizer_list_portfolios', {
        p_brand_id: brand.id,
      });
      if (error) throw new Error(`optimizer_list_portfolios(${brand.id}): ${error.message}`);
      portfolioRows = data;
    }
    const portfolios = portfolioSignalsFrom(portfolioRows);
    const book = bookBy.get(brand.id);
    const signals: HomeBrandSignals = {
      accounts,
      savedGoal: savedGoalFrom(profilesBy.get(brand.id) ?? []),
      business: businessFrom({
        structuredBusiness: book?.business ?? null,
        headline: book?.headline ?? null,
        brandDescription: brand.description,
      }),
      portfolios,
      approvalRequired: brand.approval_chain_required === true,
    };
    const reading = readBrand(signals);
    const board = readHomeBoard(signals, { reading });
    const adAccounts = adAccountsOf(assetsBy.get(brand.id) ?? []);
    return {
      brandId: brand.id,
      name: brand.brand_name ?? '(unnamed)',
      accounts,
      portfolios,
      portfolioRows: Array.isArray(portfolioRows) ? (portfolioRows as PortfolioListItem[]) : [],
      signals,
      reading,
      board,
      facts: boardFactsOf(signals, reading),
      adAccountIds: adAccounts.ids,
      hasMetaAdAccount: adAccounts.hasMeta,
    };
  });
  // PP-DT-E-home-reading-bench-counts-deleted (deep test 2026-10-31): the bench read every
  // brand_profiles row, soft-deleted ones included, so its "setup" brands could be brands no
  // member can open. It reads exactly the active ones.
  const { count: openable, error: countError } = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);
  if (countError) throw new Error(`brand_profiles active count: ${countError.message}`);
  recorder.record(
    'reads exactly the brands a member can open (active)',
    reads.length === openable ? 'PASS' : 'FAIL',
    `${reads.length} read, ${openable} active`,
  );

  const connected = reads.filter((read) => read.accounts.ads + read.accounts.organic > 0);
  recorder.record(
    'every brand gets a reading',
    reads.every((read) => read.reading.modules.length > 0) ? 'PASS' : 'FAIL',
    `${reads.length} brands, ${connected.length} with an assigned account`,
  );

  const wrongSetup = reads.filter(
    (read) => (read.accounts.ads + read.accounts.organic === 0) !== (read.reading.mode === 'setup'),
  );
  recorder.record(
    'setup exactly when nothing is connected',
    wrongSetup.length === 0 ? 'PASS' : 'FAIL',
    wrongSetup.map((read) => read.name).join(', ') || undefined,
  );

  // Recommend has no lead of its own: what waits opens when something does (a brand whose client
  // applies the changes still has recommendations to hand over — product default 2026-10-31),
  // else the strongest channel — Organic + without ads or for an audience business, Creative +
  // for a store, Performance + otherwise.
  const wrongFirst = reads.filter((read) => {
    const model = read.reading.businessModel;
    const waiting = read.reading.opportunities.some((opportunity) => opportunity.count > 0);
    const expected =
      FIRST_FOR[read.reading.mode] ??
      (waiting
        ? 'opportunities'
        : read.accounts.ads === 0 || model === 'audience'
          ? 'organic'
          : model === 'store'
            ? 'creative'
            : 'performance');
    return read.reading.modules[0]?.id !== expected;
  });
  recorder.record(
    'the first module follows the mode',
    wrongFirst.length === 0 ? 'PASS' : 'FAIL',
    wrongFirst.map((read) => `${read.name}: ${read.reading.mode}`).join(', ') || undefined,
  );

  const strayIssues = reads.filter((read) =>
    read.reading.issues.some(
      (issue) => !read.portfolios.some((portfolio) => portfolio.id === issue.portfolioId),
    ),
  );
  recorder.record(
    'every issue names a portfolio of its own brand',
    strayIssues.length === 0 ? 'PASS' : 'FAIL',
    strayIssues.map((read) => read.name).join(', ') || undefined,
  );

  const missedQueues = reads.filter((read) =>
    read.portfolios.some(
      (portfolio) =>
        portfolio.status === 'active' &&
        portfolio.applyMode !== 'observe' &&
        portfolio.pendingRecommendations + portfolio.pendingBudgetMoves > 0 &&
        !read.reading.opportunities.some((opportunity) => opportunity.portfolioId === portfolio.id),
    ),
  );
  recorder.record(
    'every waiting queue shows up as an opportunity',
    missedQueues.length === 0 ? 'PASS' : 'FAIL',
    missedQueues.map((read) => read.name).join(', ') || undefined,
  );

  // PP-DT-E-home-approve-client-executes (product default 2026-10-31): a brand whose acting
  // portfolios all have their platform writes off is read as Continuum recommends — the client
  // applies the changes — never as "You approve" an OK that applies nothing.
  const clientExecutes = reads.filter((read) => {
    const acting = read.portfolios.filter(
      (portfolio) => portfolio.status === 'active' && portfolio.applyMode !== 'observe',
    );
    return (
      acting.length > 0 &&
      acting.every((portfolio) => portfolio.canWrite === false) &&
      read.reading.issues.length === 0
    );
  });
  const misread = clientExecutes.filter(
    (read) =>
      read.reading.mode !== 'recommend' ||
      read.reading.modeReason !== 'Continuum recommends; your team or client applies the changes.',
  );
  const pink = reads.find((read) => read.brandId === PINK_BRAND_ID);
  recorder.record(
    'a brand Continuum cannot write for reads as Continuum recommends (Pink Elephant)',
    misread.length === 0 && pink?.reading.mode === 'recommend' ? 'PASS' : 'FAIL',
    `${clientExecutes.length} such brands (${clientExecutes.map((read) => read.name).join(', ')}); Pink reads ${pink?.reading.mode ?? 'nothing'} — "${pink?.reading.modeReason ?? ''}"${misread.length ? `; misread: ${misread.map((read) => `${read.name} ${read.reading.mode}`).join(', ')}` : ''}`,
  );

  const easyFit = reads.find((read) => read.brandId === EASYFIT_BRAND_ID);
  recorder.record(
    "Easy Fit's Brand Book reads as a business that books leads",
    easyFit?.reading.businessModel === 'leads' ? 'PASS' : 'FAIL',
    `read ${easyFit?.reading.businessModel ?? 'nothing'}`,
  );

  const withBook = reads.filter((read) => bookBy.get(read.brandId)?.business);
  const modelled = withBook.filter((read) => read.reading.businessModel !== null);
  notes.push(
    `business model read for ${modelled.length} of ${withBook.length} brands with a structured Brand Book business section`,
  );
  const byMode = Map.groupBy(connected, (read) => read.reading.mode);
  notes.push(
    `modes across connected brands: ${[...byMode].map(([mode, list]) => `${mode} ${list.length}`).join(', ')}`,
  );
  notes.push(
    'accounts counted from brand_profile_integration_accounts (get_brand_integration_summary is member-only); the rendered board is covered by home:board:e2e:bench',
  );

  for (const read of connected.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(
      [
        read.brandId.slice(0, 8),
        read.name.slice(0, 36).padEnd(36),
        read.reading.mode.padEnd(9),
        (read.reading.businessModel ?? '-').padEnd(13),
        read.reading.modules.map((module) => module.id).join(' > '),
      ].join('  '),
    );
  }

  await checkBoards(reads);

  const out = process.env.HOME_READING_OUT;
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        reads.map(({ brandId, name, accounts, portfolios, reading, board }) => ({
          brandId,
          name,
          accounts,
          portfolios: portfolios.length,
          reading,
          board,
        })),
        null,
        2,
      ),
    );
    notes.push(`readings written to ${out}`);
  }
}

try {
  await main();
} catch (error) {
  recorder.record('bench', 'FAIL', error instanceof Error ? error.message : String(error));
} finally {
  recorder.print();
}
process.exit(0);
