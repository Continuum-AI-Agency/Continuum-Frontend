import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkFormat, checkSymbol, type FigureNode, readFigureNode } from './paid-parity.model';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// perfplus:l3:ui:bench — P2.2, the screen hop of the data-truth lane.
//
// A real Chrome drives the real Frontend as the Easy Fit owner against production Supabase and
// the Backend the Frontend `.env` names. On the Optimizer Overview, the Portfolios list, one
// Portfolio page, the Scale Dashboard (/scale?tab=dashboard) and the Home paid view
// (/dashboard?view=paid) it reads every `[data-figure]` node — raw value, currency, window and
// the printed text — and grades:
//
//   format        printed text = the raw value formatted (rules re-derived in paid-parity.model)
//   currency      every money node declares a currency, and it is the account's (MXN)
//   payload       the raw value = the value in the payload THE PAGE FETCHED (captured with
//                 page.route, never mocked) — the PAR-frontend-parity pattern
//   identical     a figure that prints the same on every portfolio row is graded against each
//                 row's own payload (ledger PP-L3-identical-pacing-block-on-every-portfolio)
//   window        the window the payload actually asked for (the 8-day "last 7 days" and the
//                 30-day clamp traps)
//   truth         account-level figures against artifacts/perfplus-campaign/truth-meta.json
//   unverifiable  every leaf element that prints a number OUTSIDE a `[data-figure]` node is a
//                 FINDING by surface and text — split by whether the number exists in a payload
//
// ── READ ONLY ── The only write is the bench user's active-brand preference (restored).
// ── ONE TEST ── soft assertions, one Recorder envelope (see perfplus-l1.bench.spec.ts).
//
// Usage: cd Continuum-Frontend && bun run perfplus:l3:ui:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The Easy Fit row that owns the Optimizer portfolios on act_521903353286118. */
const OPTIMIZER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const AD_ACCOUNT_ID = '521903353286118';
const ACCOUNT_CURRENCY = 'MXN';
const MONEY_PCT = 1;
const RATE_PP = 0.5;

const TRUTH_PATH = resolve(__dirname, '../../artifacts/perfplus-campaign/truth-meta.json');
const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-l3');
const SETTLE_MS = 120_000;

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const withinPct = (a: number, b: number, pct: number): boolean =>
  b === 0 ? Math.abs(a) < 1e-9 : Math.abs(a - b) / Math.abs(b) <= pct / 100;

interface TruthWindow {
  preset: string;
  range: { since: string; until: string };
  account: {
    spend: { amount: number };
    impressions: number;
    clicks: number;
    ctr: number | null;
    frequency: number | null;
    results: Record<string, { count: number; costPerResult: { amount: number } | null }>;
  };
  perDay: Array<{ day: string; figures: TruthWindow['account'] }>;
}
interface Truth {
  generatedAt: string;
  account: { currency: string; timezone: string };
  windows: TruthWindow[];
}
const truth: Truth | null = existsSync(TRUTH_PATH)
  ? (JSON.parse(readFileSync(TRUTH_PATH, 'utf8')) as Truth)
  : null;
const truthWindow = (preset: string): TruthWindow | null =>
  truth?.windows.find((w) => w.preset === preset) ?? null;
const MESSAGING = 'onsite_conversion.messaging_conversation_started_7d';

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:l3:ui:bench', notes);
type Finding = { surface: string; kind: string; evidence: string };
const findings: Finding[] = [];
let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  if (findings.length > 0) {
    const byKind = new Map<string, Finding[]>();
    for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    console.log('[perfplus-l3-ui] FINDINGS by kind:');
    for (const [kind, list] of byKind) {
      console.log(`  ## ${kind} (${list.length})`);
      for (const f of list.slice(0, 40)) console.log(`  - ${f.surface}: ${f.evidence}`);
      if (list.length > 40) console.log(`  … ${list.length - 40} more`);
    }
  }
  recorder.print();
}
const finding = (surface: string, kind: string, evidence: string): void => {
  findings.push({ surface, kind, evidence });
};

/* -- session / brand ----------------------------------------------------------------- */

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberToken}` } },
  });
}
function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[perfplus-l3] access token carries no sub claim');
  return decoded.sub;
}
async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[perfplus-l3] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

/* -- captured payloads --------------------------------------------------------------- */

type Captured = { name: string; url: string; body: Row; json: unknown; status: number };
let captured: Captured[] = [];

/** Every RPC, edge and /api/paid-* call the page makes is fetched for real and copied. */
async function captureReads(page: Page): Promise<void> {
  await page.route(
    /\/(rest\/v1\/rpc\/[a-z_]+|functions\/v1\/(?:paid-media-[a-z-]+|optimizer-[a-z-]+|fetch-[a-z-]+|get-[a-z-]+)|api\/paid-[a-z-]+|api\/campaigns)(\/|\?|$)/,
    async (route) => {
      const request = route.request();
      let response: Awaited<ReturnType<typeof route.fetch>>;
      try {
        response = await route.fetch({ timeout: 120_000 });
      } catch (error) {
        notes.push(
          `capture let ${request.url().split('/').slice(-2).join('/')} through uncaptured: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
        await route.continue().catch(() => undefined);
        return;
      }
      const url = new URL(request.url());
      const name = url.pathname
        .replace(/^.*\/(rest\/v1\/rpc|functions\/v1)\//, '')
        .replace(/^\/api\//, 'api/');
      let body: Row = {};
      try {
        body = (request.postDataJSON() as Row | null) ?? {};
      } catch {
        body = {};
      }
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      captured.push({
        name,
        url: url.pathname + url.search,
        body,
        json,
        status: response.status(),
      });
      await route.fulfill({ response });
    },
  );
}
const payload = (name: string, matches?: (body: Row) => boolean): Captured | undefined =>
  captured.filter((c) => c.name === name && (matches ? matches(c.body) : true)).at(-1);

/** Every finite number anywhere in the captured payloads of this surface. */
function payloadNumbers(): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 12) return;
    if (typeof v === 'number' && Number.isFinite(v)) out.add(v);
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) out.add(Number(v));
    else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  for (const c of captured) walk(c.json, 0);
  return out;
}
/** A printed number is "in the payload" when some payload number, shown the way the screen
 *  shows it (as is, ×100 for a ratio printed as %, ×30 for a /day printed as /mo, rounded to
 *  the printed decimals), equals it. */
function printedInPayload(value: number, decimals: number, pool: Set<number>): boolean {
  const r = (x: number) => Number(x.toFixed(decimals));
  for (const p of pool) {
    for (const candidate of [p, p * 100, p / 100, p * 30, p / 30, p * 1000]) {
      if (r(candidate) === value) return true;
    }
  }
  return false;
}

/* -- the figure nodes ---------------------------------------------------------------- */

async function collectFigures(page: Page): Promise<FigureNode[]> {
  const raw = await page.locator('[data-testid=figure]').evaluateAll((elements) =>
    elements
      .filter((el) => (el as HTMLElement).checkVisibility?.() ?? true)
      .map((el) => ({
        attrs: {
          'data-figure': el.getAttribute('data-figure'),
          'data-figure-raw': el.getAttribute('data-figure-raw'),
          'data-figure-currency': el.getAttribute('data-figure-currency'),
          'data-figure-window': el.getAttribute('data-figure-window'),
          'data-figure-unit': el.getAttribute('data-figure-unit'),
        },
        text: el.textContent ?? '',
      })),
  );
  return raw
    .map((entry) => readFigureNode(entry.attrs, entry.text))
    .filter((node): node is FigureNode => node != null);
}

/** Leaf elements that print a number outside any figure node: the unverifiable figures. */
async function collectBareNumbers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const numberRe =
      /(?<![\w/.-])[-+]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\w/.-])[-+]?\$?\d+(?:\.\d+)?%?(?![\w/-])/;
    const skipTag = new Set([
      'SCRIPT',
      'STYLE',
      'NOSCRIPT',
      'SVG',
      'PATH',
      'TIME',
      'INPUT',
      'TEXTAREA',
      'SELECT',
      'OPTION',
    ]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const el = node as HTMLElement;
      node = walker.nextNode();
      if (skipTag.has(el.tagName)) continue;
      if (el.closest('[data-testid=figure]')) continue;
      if (
        el.closest(
          'nav, header[role=banner], [role=navigation], [role=tablist], [aria-hidden=true]',
        )
      )
        continue;
      if (el.children.length > 0) continue;
      if (!(el.checkVisibility?.() ?? true)) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 160) continue;
      if (!numberRe.test(text)) continue;
      // Dates, clock times, ordinals and ids are not figures.
      if (
        /^\d{4}-\d{2}-\d{2}/.test(text) ||
        /\b\d{1,2}:\d{2}\b/.test(text) ||
        /^\d{10,}$/.test(text) ||
        /^(?:19|20)\d{2}$/.test(text)
      )
        continue;
      if (
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b/.test(text) &&
        !/\d[\d,]*\.\d{2}|%|MXN|\$/.test(text)
      )
        continue;
      const key = `${el.tagName}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  });
}
const numbersIn = (text: string): Array<{ value: number; decimals: number }> => {
  const out: Array<{ value: number; decimals: number }> = [];
  const re = /[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-+]?\d+(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) {
    const token = m[0].replace(/,/g, '');
    const decimals = token.includes('.') ? (token.split('.')[1]?.length ?? 0) : 0;
    const value = Number(token);
    if (Number.isFinite(value)) out.push({ value, decimals });
  }
  return out;
};

/* -- grading --------------------------------------------------------------------------- */

type Expect = { path: string; value: number | null } | { unmapped: string };
const value = (path: string, v: number | null): Expect => ({ path, value: v });
const unmapped = (reason: string): Expect => ({ unmapped: reason });

/** Figure key → the payload path it must equal, for the keys the Optimizer stamps. */
function resolveOptimizer(node: FigureNode, portfolioId: string | null): Expect {
  const key = node.key;
  const list = rows(payload('optimizer_list_portfolios')?.json).filter(
    (p) => (str(p.ad_account_id) ?? '').replace(/^act_/, '') === AD_ACCOUNT_ID,
  );
  const latestOf = (pid: string): Row | null =>
    rows(payload('optimizer_get_cpa_series', (b) => b.p_portfolio_id === pid)?.json).at(-1) ?? null;
  const kindOf = (p: Row): string => {
    const o = str(p.objective);
    return o === 'conversations' ? 'conversation' : o === 'lead' ? 'lead' : (o ?? 'result');
  };
  const sumLatest = (field: 'spend_d7' | 'conv_d7', filter: (p: Row) => boolean = () => true) =>
    list.filter(filter).reduce((s, p) => s + (num(latestOf(str(p.id) ?? '')?.[field]) ?? 0), 0);

  // The portfolio page: recap, tiles and headline from the snapshots of the enrolled ad sets.
  // Two candidate reads, both from the page's own payload: Σ daily over resolveRange (dN =
  // today-(N-1)..today, packages/contracts/src/optimization/range.ts) and Σ windows.dN (the
  // engine window the snapshot was cut on, ending yesterday). The screen must equal one of
  // them; the path names both so the report shows which one it hit.
  const recap = /^(recap|tiles|headline)\.(spend|results|impressions|clicks|cost)$/.exec(key);
  if (recap && portfolioId) {
    const snaps = rows(
      obj(payload('paid-media-metrics', (b) => b.scope === 'adset_snapshots')?.json)?.snapshots,
    );
    const enrolled = new Set(
      rows(
        payload('optimizer_list_portfolio_adsets', (b) => b.p_portfolio_id === portfolioId)?.json,
      ).map((a) => str(a.adset_id)),
    );
    const span = Number(/^d(\d+)$/.exec(node.window)?.[1] ?? 7);
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - (span - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const objective = str(list.find((p) => p.id === portfolioId)?.objective);
    const resultField =
      objective === 'lead'
        ? 'leads'
        : objective === 'conversations'
          ? 'conversations'
          : 'purchases';
    type Sum = { spend: number; results: number; impressions: number; clicks: number };
    const daily: Sum = { spend: 0, results: 0, impressions: 0, clicks: 0 };
    const engine: Sum = { spend: 0, results: 0, impressions: 0, clicks: 0 };
    for (const s of snaps) {
      if (!enrolled.has(str(s.id))) continue;
      for (const d of rows(s.daily)) {
        const day = str(d.date) ?? '';
        if (day < since || day > today) continue;
        daily.spend += num(d.spend) ?? 0;
        daily.results += num(d[resultField]) ?? 0;
        daily.impressions += num(d.impressions) ?? 0;
        daily.clicks += num(d.clicks) ?? 0;
      }
      const w = obj(obj(s.windows)?.[node.window]);
      engine.spend += num(w?.spend) ?? 0;
      engine.results += num(w?.[resultField]) ?? 0;
      engine.impressions += num(w?.impressions) ?? 0;
      engine.clicks += num(w?.clicks) ?? 0;
    }
    const part = recap[2];
    const screen = node.raw;
    const pick = (field: keyof Sum): number =>
      screen !== null &&
      withinPct(screen, engine[field], 0.5) &&
      !withinPct(screen, daily[field], 0.5)
        ? engine[field]
        : daily[field];
    const label = (field: keyof Sum, name = field as string) =>
      `adset_snapshots over ${enrolled.size} enrolled ad sets · ${name}: Σ daily[${since}..${today}] = ${daily[field].toFixed(2)} | Σ windows.${node.window} = ${engine[field].toFixed(2)}`;
    if (part === 'spend') return value(label('spend'), pick('spend'));
    if (part === 'results') return value(label('results', resultField), pick('results'));
    if (part === 'impressions') return value(label('impressions'), pick('impressions'));
    if (part === 'clicks') return value(label('clicks'), pick('clicks'));
    const costDaily = daily.results > 0 ? daily.spend / daily.results : null;
    const costEngine = engine.results > 0 ? engine.spend / engine.results : null;
    const cost =
      screen !== null && costEngine !== null && withinPct(screen, costEngine, 0.5)
        ? costEngine
        : costDaily;
    return value(
      `spend / ${resultField}: Σ daily ${costDaily?.toFixed(2) ?? '—'} | Σ windows.${node.window} ${costEngine?.toFixed(2) ?? '—'}`,
      cost,
    );
  }

  // The multi-platform Overview (AccountPlatformsOverview.tsx) reads one frame:
  // optimizer_get_account_platform_metrics — spend per currency, totals per platform, results
  // per kind, decisions and autopilot counts.
  const frame = obj(payload('optimizer_get_account_platform_metrics')?.json);
  if (frame) {
    const spendCcy = /^overview\.spend\.([A-Za-z]+)$/.exec(key);
    if (spendCcy)
      return value(
        `account_platform_metrics.spend_by_currency[${spendCcy[1]}].spend`,
        num(rows(frame.spend_by_currency).find((r) => str(r.currency) === spendCcy[1])?.spend),
      );
    if (key === 'tiles.decisions-waiting')
      return value('account_platform_metrics.decisions_waiting', num(frame.decisions_waiting));
    if (key === 'tiles.on-autopilot')
      return value('account_platform_metrics.autopilot.on', num(obj(frame.autopilot)?.on));
    const platforms = rows(frame.totals_by_platform);
    const kinds = rows(frame.results_by_kind);
    const column = /^comparison\.([a-z_]+)\.(spend|results|cost|share)$/.exec(key);
    if (column) {
      const [, platform, part] = column;
      if (platform === 'total') {
        const spend = platforms.reduce((acc, p) => acc + (num(p.spend) ?? 0), 0);
        const screen = node.raw;
        const kind =
          kinds.find(
            (k) =>
              screen !== null &&
              (num(k.results) === Math.round(screen) ||
                (num(k.cost_per_result) !== null &&
                  withinPct(screen, num(k.cost_per_result) ?? 0, 0.5))),
          ) ?? kinds[0];
        if (part === 'spend') return value('Σ totals_by_platform.spend', spend);
        if (part === 'results')
          return value(`results_by_kind[${str(kind?.kind)}].results`, num(kind?.results));
        if (part === 'cost')
          return value(
            `results_by_kind[${str(kind?.kind)}].cost_per_result`,
            num(kind?.cost_per_result),
          );
        return unmapped('comparison.total.share is not a payload field');
      }
      const row = platforms.find((p) => str(p.platform) === platform);
      if (!row) return unmapped(`no totals_by_platform row for ${platform}`);
      // The comparison row prints ONE kind (the headline kind, chosen by the component); the
      // bench accepts the figure of any kind the frame lists and names the kind it matched.
      const perKind = kinds.map((k) => {
        const mine = obj(rows(k.platforms).find((x) => str(x.platform) === platform));
        const kindResults = num(mine?.results) ?? 0;
        const kindSpend = num(mine?.spend) ?? 0;
        return {
          kind: str(k.kind) ?? '?',
          results: kindResults,
          cost: num(mine?.cost_per_result) ?? (kindResults > 0 ? kindSpend / kindResults : null),
        };
      });
      const allResults = kinds.reduce((acc, k) => acc + (num(k.results) ?? 0), 0);
      const screen = node.raw;
      const byResults =
        perKind.find((k) => screen !== null && k.results === Math.round(screen)) ?? perKind[0];
      const byCost =
        perKind.find((k) => screen !== null && k.cost !== null && withinPct(screen, k.cost, 0.5)) ??
        perKind[0];
      const results = byResults?.results ?? 0;
      if (part === 'spend') return value(`totals_by_platform[${platform}].spend`, num(row.spend));
      if (part === 'results')
        return value(`results_by_kind[${byResults?.kind}].platforms[${platform}].results`, results);
      if (part === 'cost')
        return value(
          `results_by_kind[${byCost?.kind}].platforms[${platform}].cost_per_result`,
          byCost?.cost ?? null,
        );
      // The share node is stamped with the RATIO (0..1) while its text prints a percent; the
      // formatter contract (format.ts `percent`: raw already in display units) wants ×100.
      // Graded on the ratio so the format rule is what reports the stamp drift.
      return value(
        `results share of ${platform} (ratio)`,
        allResults > 0 ? results / allResults : null,
      );
    }
  }
  if (key === 'tiles.spend' || key === 'overview.spend')
    return value(
      'Σ optimizer_get_cpa_series[latest].spend_d7 over the account portfolios',
      sumLatest('spend_d7'),
    );
  const kindTile = /^tiles\.kind\.(.+)$/.exec(key);
  if (kindTile)
    return value(
      `Σ cpa_series[latest].conv_d7 over ${kindTile[1]} portfolios`,
      sumLatest('conv_d7', (p) => kindOf(p) === kindTile[1] || `${kindOf(p)}s` === kindTile[1]),
    );
  const kindLine = /^overview\.kind\.(.+)\.(results|cost)$/.exec(key);
  if (kindLine) {
    const [, kind, part] = kindLine;
    const ofKind = (p: Row) => kindOf(p) === kind || `${kindOf(p)}s` === kind;
    const results = sumLatest('conv_d7', ofKind);
    const spend = sumLatest('spend_d7', ofKind);
    return part === 'results'
      ? value(`Σ conv_d7 over ${kind} portfolios`, results)
      : value(
          `Σ spend_d7 / Σ conv_d7 over ${kind} portfolios`,
          results > 0 ? spend / results : null,
        );
  }
  if (key === 'tiles.on-autopilot')
    return value(
      'optimizer_list_portfolios[account].apply_mode == autopilot',
      list.filter((p) => p.apply_mode === 'autopilot').length,
    );
  if (key === 'tiles.decisions-waiting')
    return value(
      'Σ pending_recommendations + pending_budget_moves',
      list.reduce(
        (s, p) => s + (num(p.pending_recommendations) ?? 0) + (num(p.pending_budget_moves) ?? 0),
        0,
      ),
    );
  const rowKey = /^portfolio-row\.([0-9a-f-]+)\.(spend|results|cost)$/.exec(key);
  if (rowKey) {
    const [, pid, part] = rowKey;
    const latest = latestOf(pid);
    const spend = num(latest?.spend_d7);
    const results = num(latest?.conv_d7);
    if (part === 'spend') return value(`cpa_series[${pid.slice(0, 8)}].spend_d7`, spend);
    if (part === 'results') return value(`cpa_series[${pid.slice(0, 8)}].conv_d7`, results);
    return value(
      `cpa_series[${pid.slice(0, 8)}].spend_d7 / conv_d7`,
      spend !== null && results ? spend / results : null,
    );
  }
  const daily = /^portfolios\.(?:archived\.)?([0-9a-f-]+)\.daily$/.exec(key);
  if (daily)
    return value(
      `optimizer_list_portfolios[${daily[1].slice(0, 8)}].daily_total`,
      num(list.find((p) => p.id === daily[1])?.daily_total),
    );
  const lead = /^portfolios\.([0-9a-f-]+)\.lead\.(figure|money)$/.exec(key);
  if (lead) {
    const read = obj(obj(payload('optimizer_get_account_read')?.json)?.read);
    const candidate = rows(read?.candidates)[0];
    const headline = obj(candidate?.headline);
    return value(
      `optimizer_get_account_read.read.candidates[0] (${str(candidate?.id)}) — an ACCOUNT candidate printed on portfolio ${lead[1].slice(0, 8)}`,
      lead[2] === 'figure'
        ? (num(headline?.value) ?? num(candidate?.impact_per_day))
        : num(candidate?.impact_per_day),
    );
  }
  const card = /^card\.([a-z_]+)\.(figure|from|to|money)$/.exec(key);
  if (card) {
    const read = obj(obj(payload('optimizer_get_account_read')?.json)?.read);
    const candidate = rows(read?.candidates).find(
      (c) => str(c.detector) === card[1] || (str(c.id) ?? '').startsWith(`${card[1]}:`),
    );
    const headline = obj(candidate?.headline);
    if (!candidate) return unmapped(`no account-read candidate for detector ${card[1]}`);
    const part = card[2];
    return value(
      `optimizer_get_account_read.read.candidates[${card[1]}].${part === 'money' ? 'impact_per_day' : `headline.${part}`}`,
      part === 'figure'
        ? (num(headline?.value) ?? num(candidate.impact_per_day))
        : part === 'money'
          ? num(candidate.impact_per_day)
          : num(headline?.[part]),
    );
  }
  // The portfolio page: recap and tiles from the snapshots of the enrolled ad sets (d7 = today-6..today, resolveRange).
  return unmapped(`no payload path declared for ${key}`);
}

function gradeFigures(
  surface: string,
  nodes: FigureNode[],
  resolveNode: (n: FigureNode) => Expect,
): void {
  if (nodes.length === 0) {
    recorder.record(`${surface} · figures`, 'SKIP', 'no [data-figure] node on this surface');
    return;
  }
  let formatFail = 0;
  let currencyFail = 0;
  let payloadFail = 0;
  let unmappedCount = 0;
  let graded = 0;
  for (const node of nodes) {
    const f = checkFormat(node);
    if (f.grade === 'FAIL') {
      formatFail += 1;
      recorder.record(`${surface} · format · ${node.key}`, 'FAIL', f.detail);
      finding(surface, 'format', `${node.key}: ${f.detail}`);
    }
    const s = checkSymbol(node);
    if (s.grade === 'FAIL') {
      recorder.record(`${surface} · symbol · ${node.key}`, 'FAIL', s.detail);
      finding(surface, 'format', `${node.key}: ${s.detail}`);
    }
    const money =
      node.unit === 'currency' || node.unit === 'per-period' || node.unit === 'per-month';
    if (money && node.currency !== ACCOUNT_CURRENCY) {
      currencyFail += 1;
      recorder.record(
        `${surface} · currency · ${node.key}`,
        'FAIL',
        `declares ${node.currency}, account is ${ACCOUNT_CURRENCY} — prints "${node.text.trim()}"`,
      );
      finding(surface, 'currency', `${node.key} declares ${node.currency}: "${node.text.trim()}"`);
    }
    const e = resolveNode(node);
    if ('unmapped' in e) {
      unmappedCount += 1;
      recorder.record(`${surface} · payload · ${node.key}`, 'WARN', e.unmapped);
      continue;
    }
    graded += 1;
    if (node.raw === null && e.value === null) continue;
    const ok =
      node.raw !== null &&
      e.value !== null &&
      (node.unit === 'count'
        ? Math.round(node.raw) === Math.round(e.value)
        : withinPct(node.raw, e.value, 0.5));
    if (!ok) {
      payloadFail += 1;
      recorder.record(
        `${surface} · payload · ${node.key}`,
        'FAIL',
        `screen raw ${node.raw} ("${node.text.trim()}") vs ${e.path} = ${e.value}`,
      );
      finding(surface, 'payload', `${node.key}: screen ${node.raw} vs ${e.path} = ${e.value}`);
    }
  }
  recorder.record(
    `${surface} · format`,
    formatFail === 0 ? 'PASS' : 'FAIL',
    `${nodes.length} figures, ${formatFail} misformatted`,
  );
  recorder.record(
    `${surface} · currency`,
    currencyFail === 0 ? 'PASS' : 'FAIL',
    `${nodes.filter((n) => n.unit === 'currency' || n.unit === 'per-period' || n.unit === 'per-month').length} money figures, ${currencyFail} without ${ACCOUNT_CURRENCY}`,
  );
  recorder.record(
    `${surface} · payload`,
    payloadFail === 0 ? (graded > 0 ? 'PASS' : 'SKIP') : 'FAIL',
    `${graded} mapped (${payloadFail} off the payload), ${unmappedCount} unmapped (WARN by name)`,
  );
}

async function gradeBareNumbers(surface: string, page: Page): Promise<void> {
  const bare = await collectBareNumbers(page);
  const pool = payloadNumbers();
  const inPayload: string[] = [];
  const notInPayload: string[] = [];
  for (const text of bare) {
    const nums = numbersIn(text);
    const all = nums.length > 0 && nums.every((n) => printedInPayload(n.value, n.decimals, pool));
    (all ? inPayload : notInPayload).push(text);
  }
  recorder.record(
    `${surface} · unverifiable figures (no data-figure)`,
    bare.length === 0 ? 'PASS' : 'FAIL',
    `${bare.length} leaf element(s) print a number outside a figure node — ${inPayload.length} match a payload number, ${notInPayload.length} match none`,
  );
  for (const text of notInPayload)
    finding(surface, 'unverifiable-node (not in any payload)', `"${text}"`);
  for (const text of inPayload)
    finding(surface, 'unverifiable-node (value present in a payload)', `"${text}"`);
}

/** The window a paid-metrics payload asked for, against the preset its caller named. */
function gradeWindow(
  surface: string,
  c: Captured | undefined,
  expectedPreset: string,
): { since: string; until: string } | null {
  const json = obj(c?.json);
  const range = obj(json?.range);
  const since = str(range?.since);
  const until = str(range?.until);
  if (!c || !since || !until) {
    recorder.record(`${surface} · window`, 'SKIP', `no ${expectedPreset} metrics payload captured`);
    return null;
  }
  const days = Math.round((Date.parse(until) - Date.parse(since)) / 86_400_000) + 1;
  const expectedDays = Number(/last_(\d+)d/.exec(expectedPreset)?.[1] ?? 0);
  const tw = truthWindow(expectedPreset);
  const same = tw ? tw.range.since === since && tw.range.until === until : days === expectedDays;
  recorder.record(
    `${surface} · window · ${expectedPreset}`,
    same ? 'PASS' : 'FAIL',
    `payload asked [${since}..${until}] = ${days} day(s) for "${expectedPreset}"${tw ? `; truth ${expectedPreset} is [${tw.range.since}..${tw.range.until}]` : ''}`,
  );
  if (!same)
    finding(surface, 'window', `${expectedPreset} payload spans ${days} days [${since}..${until}]`);
  return { since, until };
}

/** An account-level printed spend against the truth fixture's window of the same name. */
function gradeAgainstTruth(
  surface: string,
  label: string,
  product: number | null,
  preset: string,
  metric: 'spend' | 'leads' | 'conversations' | 'ctr',
): void {
  const tw = truthWindow(preset);
  if (!tw) {
    recorder.record(
      `${surface} · truth · ${label}`,
      'SKIP',
      'no truth fixture — run bun run perfplus:truth:meta:bench',
    );
    return;
  }
  const a = tw.account;
  const t =
    metric === 'spend'
      ? a.spend.amount
      : metric === 'leads'
        ? (a.results.lead?.count ?? 0)
        : metric === 'conversations'
          ? (a.results[MESSAGING]?.count ?? 0)
          : a.ctr;
  if (product === null || t === null) {
    recorder.record(`${surface} · truth · ${label}`, 'SKIP', `product ${product} / truth ${t}`);
    return;
  }
  const ok =
    metric === 'ctr'
      ? Math.abs(product - t) <= RATE_PP
      : metric === 'spend'
        ? withinPct(product, t, MONEY_PCT)
        : product === t;
  recorder.record(
    `${surface} · truth · ${label}`,
    ok ? 'PASS' : 'FAIL',
    `screen ${product} vs truth ${preset} [${tw.range.since}..${tw.range.until}] ${metric} ${typeof t === 'number' ? t.toFixed(2) : t}`,
  );
  if (!ok) finding(surface, 'truth', `${label}: screen ${product} vs truth ${metric} ${t}`);
}

/* -- the pages ------------------------------------------------------------------------- */

async function pinAdAccount(page: Page): Promise<boolean> {
  try {
    const picker = page.getByRole('combobox').first();
    await expect(picker).toBeEnabled({ timeout: 120_000 });
    const current = (await picker.textContent()) ?? '';
    if (current.includes(AD_ACCOUNT_ID)) return true;
    await picker.click();
    await page.getByPlaceholder('Search ad accounts...').fill(AD_ACCOUNT_ID);
    await page.getByRole('option').filter({ hasText: AD_ACCOUNT_ID }).first().click();
    return true;
  } catch (error) {
    notes.push(
      `ad account pin failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
    return false;
  }
}

async function settle(page: Page, selector: string): Promise<boolean> {
  const ok = await page
    .locator(selector)
    .first()
    .waitFor({ state: 'visible', timeout: SETTLE_MS })
    .then(() => true)
    .catch(() => false);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  return ok;
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true })
    .catch(() => undefined);
}

async function newPage(context: BrowserContext): Promise<Page> {
  captured = [];
  const page = await context.newPage();
  await captureReads(page);
  return page;
}

async function optimizerSurfaces(context: BrowserContext): Promise<void> {
  // Overview.
  let page = await newPage(context);
  await page.goto('/scale?tab=performance&optimizerView=overview', {
    waitUntil: 'domcontentloaded',
  });
  await pinAdAccount(page);
  let ready = await settle(page, '[data-figure]');
  recorder.record(
    'Optimizer/Overview · rendered figures',
    ready ? 'PASS' : 'FAIL',
    ready ? `${captured.length} reads captured` : 'no [data-figure] within the settle window',
  );
  let nodes = await collectFigures(page);
  gradeFigures('Optimizer/Overview', nodes, (n) => resolveOptimizer(n, null));
  await gradeBareNumbers('Optimizer/Overview', page);
  const overviewSpend = nodes.find((n) => n.key === 'tiles.spend' || n.key === 'overview.spend');
  notes.push(
    `Optimizer/Overview: ${nodes.length} figures; headline spend ${overviewSpend?.text.trim() ?? 'none'} (window ${overviewSpend?.window ?? '?'})`,
  );
  await shot(page, 'optimizer-overview');
  await page.close();

  // Portfolios list — the identical-figure trap.
  page = await newPage(context);
  await page.goto('/scale?tab=performance&optimizerView=portfolios', {
    waitUntil: 'domcontentloaded',
  });
  await pinAdAccount(page);
  ready = await settle(page, '[data-figure^="portfolios."]');
  recorder.record('Optimizer/Portfolios · rendered figures', ready ? 'PASS' : 'FAIL');
  nodes = await collectFigures(page);
  gradeFigures('Optimizer/Portfolios', nodes, (n) => resolveOptimizer(n, null));
  await gradeBareNumbers('Optimizer/Portfolios', page);
  const byPortfolio = new Map<string, string[]>();
  for (const n of nodes) {
    const m = /^portfolios\.([0-9a-f-]+)\.lead\.(figure|money)$/.exec(n.key);
    if (m) byPortfolio.set(m[1], [...(byPortfolio.get(m[1]) ?? []), `${m[2]}=${n.text.trim()}`]);
  }
  const leadRows = [...byPortfolio.entries()];
  const signatures = new Set(leadRows.map(([, parts]) => parts.join(' ')));
  if (leadRows.length >= 2) {
    const identical = signatures.size === 1;
    recorder.record(
      'Optimizer/Portfolios · lead figure differs per portfolio row',
      identical ? 'FAIL' : 'PASS',
      leadRows.map(([pid, parts]) => `${pid.slice(0, 8)}: ${parts.join(' ')}`).join(' | ') +
        (identical
          ? ' — the same ACCOUNT candidate (optimizer_get_account_read.candidates[0]) is printed on every row'
          : ''),
    );
    if (identical)
      finding(
        'Optimizer/Portfolios',
        'identical-across-rows',
        `every portfolio row prints ${[...signatures][0]} (account_pacing candidate keyed by account)`,
      );
  } else {
    recorder.record(
      'Optimizer/Portfolios · lead figure differs per portfolio row',
      'SKIP',
      `${leadRows.length} row(s) with a lead figure`,
    );
  }
  // Rows without a figure node at all print unverifiable numbers (the /day budget text).
  const rowButtons = await page.getByRole('button', { name: /^Open / }).count();
  notes.push(
    `Optimizer/Portfolios: ${rowButtons} portfolio row(s), ${leadRows.length} with lead figures, ${nodes.length} figures`,
  );
  await shot(page, 'optimizer-portfolios');
  const list = rows(payload('optimizer_list_portfolios')?.json).filter(
    (p) =>
      (str(p.ad_account_id) ?? '').replace(/^act_/, '') === AD_ACCOUNT_ID &&
      (num(p.adset_count) ?? 0) > 0,
  );
  await page.close();

  // One portfolio page: the first enrolled one on the account.
  const detail = list[0];
  if (!detail) {
    recorder.record('Optimizer/Portfolio page', 'SKIP', 'no enrolled portfolio on the account');
    return;
  }
  const pid = str(detail.id) ?? '';
  page = await newPage(context);
  await page.goto(`/scale?tab=performance&optimizerView=portfolios&portfolio=${pid}`, {
    waitUntil: 'domcontentloaded',
  });
  await pinAdAccount(page);
  ready = await settle(page, '[data-figure="recap.spend"], [data-figure="tiles.spend"]');
  recorder.record(
    `Optimizer/Portfolio page (${str(detail.name)}) · rendered figures`,
    ready ? 'PASS' : 'FAIL',
  );
  nodes = await collectFigures(page);
  gradeFigures('Optimizer/Portfolio page', nodes, (n) => resolveOptimizer(n, pid));
  await gradeBareNumbers('Optimizer/Portfolio page', page);
  // The pacing panel is not stamped: its figures are graded by text against optimizer-status.
  const status = obj(payload('optimizer-status', (b) => b.portfolio_id === pid)?.json);
  const pacing = obj(obj(status?.latest_run)?.pacing);
  const bodyText = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  const listBudget = num(detail.period_budget);
  const printsListBudget =
    listBudget !== null && bodyText.includes(Math.round(listBudget).toLocaleString('en-US'));
  if (pacing) {
    const ratioPct = Math.round((num(pacing.pacingRatio) ?? 0) * 100);
    const budget = num(pacing.periodBudget);
    const printsRatio = bodyText.includes(`${ratioPct}%`) || bodyText.includes(`${ratioPct} %`);
    const printsStatusBudget =
      budget !== null && bodyText.includes(Math.round(budget).toLocaleString('en-US'));
    recorder.record(
      'Optimizer/Portfolio page · pacing panel prints the portfolio flight (optimizer_list_portfolios.period_budget)',
      printsListBudget ? 'PASS' : 'FAIL',
      `list period_budget ${listBudget} (${str(detail.period_start)}..${str(detail.period_end)}) printed ${printsListBudget}; optimizer-status.latest_run.pacing says ${str(pacing.status)} ${ratioPct}% of ${budget} over ${num(pacing.periodDays)} days — printed ratio ${printsRatio}, budget ${printsStatusBudget}`,
    );
    const agree =
      budget !== null && listBudget !== null && withinPct(budget, listBudget, MONEY_PCT);
    recorder.record(
      'Optimizer/Portfolio page · optimizer-status pacing agrees with the flight shown',
      agree ? 'PASS' : 'FAIL',
      `latest_run.pacing.periodBudget ${budget} / ${num(pacing.periodDays)} days vs list period_budget ${listBudget}`,
    );
    if (!agree)
      finding(
        'Optimizer/Portfolio page',
        'stale-derivation',
        `optimizer-status.latest_run.pacing (${budget} over ${num(pacing.periodDays)} days, ${ratioPct}%) is from an earlier flight than the one the page shows (${listBudget}, ${str(detail.period_start)}..${str(detail.period_end)})`,
      );
  } else {
    recorder.record(
      'Optimizer/Portfolio page · pacing panel',
      printsListBudget ? 'PASS' : 'SKIP',
      `no optimizer-status pacing captured; list period_budget printed ${printsListBudget}`,
    );
  }
  await shot(page, 'optimizer-portfolio');
  await page.close();
}

async function dashboardSurface(context: BrowserContext): Promise<void> {
  const page = await newPage(context);
  await page.goto('/scale?tab=dashboard', { waitUntil: 'domcontentloaded' });
  const ready = await settle(page, 'table, [role=table], [data-slot=card]');
  await page.waitForTimeout(8_000);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  recorder.record(
    'Dashboard · rendered',
    ready ? 'PASS' : 'FAIL',
    `${captured.length} reads captured: ${[...new Set(captured.map((c) => c.name))].join(', ')}`,
  );
  const nodes = await collectFigures(page);
  gradeFigures('Dashboard', nodes, () =>
    unmapped('the Dashboard stamps no figure (PaidMediaDashboard.tsx has no figureProps call)'),
  );
  await gradeBareNumbers('Dashboard', page);
  const metrics = payload('api/paid-metrics') ?? payload('paid-media-reporting/metrics');
  gradeWindow('Dashboard', metrics, 'last_7d');
  // The picker offers last_7d / last_14d / last_30d / custom only — no "this year", no 90 days.
  const options = await page
    .getByRole('combobox')
    .allTextContents()
    .catch(() => []);
  recorder.record(
    'Dashboard · long preset (this year / 90 days) offered',
    'SKIP',
    `unexercised — the picker offers ${
      options
        .map((o) => o.trim())
        .filter(Boolean)
        .join(' | ') || 'Last 7 / 14 / 30 days, Custom'
    }; clampToMaxWindow lives only in Jaina (Backend datePresets.ts)`,
  );
  await shot(page, 'dashboard');
  await page.close();
}

async function homePaidSurface(context: BrowserContext): Promise<void> {
  const page = await newPage(context);
  await page.goto('/dashboard?view=paid', { waitUntil: 'domcontentloaded' });
  const ready = await settle(page, 'main');
  await page.waitForTimeout(8_000);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  recorder.record(
    'Home paid view · rendered',
    ready ? 'PASS' : 'FAIL',
    `${captured.length} reads captured: ${[...new Set(captured.map((c) => c.name))].join(', ')}`,
  );
  const nodes = await collectFigures(page);
  gradeFigures('Home paid view', nodes, () =>
    unmapped('the Home paid view stamps no figure (PaidDashboardView.tsx has no figureProps call)'),
  );
  await gradeBareNumbers('Home paid view', page);
  const overview = payload('paid-media-reporting/metrics', (b) => b.scope === 'account_overview');
  gradeWindow('Home paid view', overview, 'last_7d');
  const m = obj(obj(overview?.json)?.metrics);
  const spend = num(m?.spend);
  const bodyText = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  const printed =
    spend !== null &&
    (bodyText.includes(Math.round(spend).toLocaleString('en-US')) ||
      bodyText.includes(spend.toLocaleString('en-US', { maximumFractionDigits: 2 })));
  recorder.record(
    'Home paid view · strip spend = account_overview.metrics.spend',
    spend === null ? 'SKIP' : printed ? 'PASS' : 'FAIL',
    `payload spend ${spend}; printed ${printed}`,
  );
  const hasCurrency = /\bMXN\b/.test(bodyText);
  recorder.record(
    'Home paid view · currency printed with money',
    hasCurrency ? 'PASS' : 'FAIL',
    hasCurrency
      ? 'MXN appears'
      : `no "MXN" in the page text (payload carries no currency; "$" count ${(bodyText.match(/\$/g) ?? []).length})`,
  );
  if (!hasCurrency) finding('Home paid view', 'currency', 'money printed without MXN');
  gradeAgainstTruth('Home paid view', 'strip spend (last_7d)', spend, 'last_7d', 'spend');
  gradeAgainstTruth('Home paid view', 'strip leads (last_7d)', num(m?.leads), 'last_7d', 'leads');
  gradeAgainstTruth(
    'Home paid view',
    'strip conversations (last_7d)',
    num(m?.conversations),
    'last_7d',
    'conversations',
  );
  gradeAgainstTruth('Home paid view', 'strip ctr (last_7d)', num(m?.ctr), 'last_7d', 'ctr');
  await shot(page, 'home-paid');
  await page.close();
}

test.describe('Performance+ L3 — every figure on screen against its payload and the truth', () => {
  test.beforeAll(async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    memberToken = session.accessToken;
    memberId = subjectOf(memberToken);
    storageState = session.state;
    const { data } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', memberId)
      .maybeSingle();
    originalBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    notes.push(
      truth
        ? `truth fixture ${truth.generatedAt} (${truth.account.currency}, ${truth.account.timezone})`
        : `no truth fixture at ${TRUTH_PATH}`,
    );
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    printEnvelopeOnce();
  });

  test('Optimizer, Dashboard and Home figures reconcile with their payloads', async ({
    browser,
  }) => {
    test.setTimeout(30 * 60_000);
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 900 },
    });
    try {
      await test.step('Optimizer (brand with portfolios)', async () => {
        await selectBrand(OPTIMIZER_BRAND_ID);
        await optimizerSurfaces(context);
      });
      await test.step('Dashboard', async () => {
        await selectBrand(EASYFIT_BRAND_ID);
        await dashboardSurface(context);
      });
      await test.step('Home paid view', async () => {
        await homePaidSurface(context);
      });
    } finally {
      await context.close().catch(() => undefined);
      printEnvelopeOnce();
    }
    expect
      .soft(
        findings.filter((f) => f.kind === 'payload' || f.kind === 'format'),
        'screen = payload',
      )
      .toEqual([]);
  });
});
