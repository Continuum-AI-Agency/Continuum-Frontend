import { writeFileSync } from 'node:fs';
import { type HomeBrandReading, type HomeMode, readBrand } from '@continuum/contracts';
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
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// home:reading:bench — the Home's reading of EVERY brand in production.
//
// Reads each brand's real signals from production Supabase (assigned accounts, Optimizer
// portfolios through optimizer_list_portfolios, the Brand Book's structured business section,
// saved goals, the approval-chain flag), builds them with the same mappers the Home's server
// loader uses (src/lib/home/brandSignals.ts) and reads them with the same `readBrand`. Then it
// holds every reading to the rules the Home promises:
//   1. Setup exactly when nothing is connected, and never otherwise.
//   2. The first module follows the mode (fix → Account health, approve → Opportunities, …).
//   3. Every issue names a portfolio of its own brand.
//   4. Every acting portfolio with something waiting shows up as an opportunity.
//   5. A brand whose Brand Book names its call to action gets a business model (Easy Fit's
//      "Schedule a … facility tour" reads as a business that books leads).
//
// It reads only. Un-exercised by design: the accounts are counted from
// brand_profile_integration_accounts, because get_brand_integration_summary is granted to
// signed-in members only; the rendered strip and the member-scoped RPC are what
// home:overview:e2e:bench drives in a real browser.
// Set HOME_READING_OUT=<file> to keep every reading as JSON.
// ---------------------------------------------------------------------------

const EASYFIT_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
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
  integration_accounts_assets: { type: string | null; status: string | null } | null;
};
type BookRow = { brand_id: string; business: unknown; headline: unknown };

async function all<T>(schema: string, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .schema(schema)
      .from(table)
      .select(columns)
      .range(from, from + 999);
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
  reading: HomeBrandReading;
};

async function main() {
  const [brands, assets, books, profiles] = await recorder.step('read every brand', () =>
    Promise.all([
      all<BrandRow>(
        'brand_profiles',
        'brand_profiles',
        'id, brand_name, description, approval_chain_required',
      ),
      all<AssetRow>(
        'brand_profiles',
        'brand_profile_integration_accounts',
        'brand_profile_id, integration_accounts_assets:integration_account_id(type, status)',
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
    const reading = readBrand({
      accounts,
      savedGoal: savedGoalFrom(profilesBy.get(brand.id) ?? []),
      business: businessFrom({
        structuredBusiness: book?.business ?? null,
        headline: book?.headline ?? null,
        brandDescription: brand.description,
      }),
      portfolios,
      approvalRequired: brand.approval_chain_required === true,
    });
    return {
      brandId: brand.id,
      name: brand.brand_name ?? '(unnamed)',
      accounts,
      portfolios,
      reading,
    };
  });
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

  // Recommend has no lead of its own: the strongest channel opens — Organic + without ads or for
  // an audience business, Creative + for a store, Performance + otherwise.
  const wrongFirst = reads.filter((read) => {
    const model = read.reading.businessModel;
    const expected =
      FIRST_FOR[read.reading.mode] ??
      (read.accounts.ads === 0 || model === 'audience'
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
    'accounts counted from brand_profile_integration_accounts (get_brand_integration_summary is member-only); the rendered strip is covered by home:overview:e2e:bench',
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

  const out = process.env.HOME_READING_OUT;
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        reads.map(({ brandId, name, accounts, portfolios, reading }) => ({
          brandId,
          name,
          accounts,
          portfolios: portfolios.length,
          reading,
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
