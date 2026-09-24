import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pinProdSupabase } from './paid-parity.env';
import {
  type FigureNode,
  gradeNodes,
  type PayloadExpectation,
  type RuleResult,
  readFigureNode,
  round2,
} from './paid-parity.model';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// paid:parity:e2e:bench — the screen agrees with the payload it fetched.
//
// Every costly bug in the Performance+ module was a number: a `d7` window summing 8 days
// (+14.3% on every per-day figure), a null currency printed as `$`, `$26/day` beside
// `$766/mo`, a `$339.7M` bar, a fabricated "on track". A screenshot cannot catch that class
// and a unit test only grades the formatter with the figure the test chose. This bench
// catches it by construction: a real Chrome drives the real Frontend as a real member
// against PRODUCTION Supabase; `page.route` CAPTURES (never mocks) every optimizer RPC and
// edge response the page fetches; and for every `[data-testid=figure]` node the five
// surfaces render, five rules are graded (e2e/paid-parity.model.ts):
//
//   format     the text is the node's own raw figure, formatted under the product's rule
//   symbol     unknown currency prints bare, USD prints `$`, anything else prints its code
//   day-month  `<day>/day · <month>/mo` — month is day × 30, cents-rounded, same digit rule
//   window     a figure declaring `dN` was summed over at most N days of daily rows
//   payload    the raw figure equals the payload field it claims to come from (the table
//              is `resolve()` below); a figure with no mapping is a NAMED WARN, never a
//              silent pass
//
// plus one per surface: every money node's declared currency is the ad account's own
// (`plugin_mcp.list_brand_ad_accounts.currency`, null on every live Mexican account today —
// so `none`, and a bare figure, is the common case).
//
// Surfaces: the Overview (lead card, four tiles, spend-by-objective legend, portfolio
// cards), the Portfolios list, one portfolio page (news cards, recap sentence, four KPI
// tiles, CPL timeline projection), the Actions queue.
//
// Masked snapshots: after a surface's parity is green, a full-page screenshot with every
// figure node masked is compared against e2e/__screenshots__/paid-parity/<surface>.png.
// THE FIRST RUN WRITES THE BASELINES (graded SKIP, by name); later runs diff against them.
// Delete a baseline to re-establish it after a deliberate layout change.
//
// READ-ONLY. Nothing here approves, applies, converts, reverts, creates or archives; no
// label of any of those buttons is targeted. The one write is the bench user's
// ACTIVE-BRAND PREFERENCE row (the same row the in-app brand switcher writes), captured
// before the run and restored after — the same discipline as optimizer:e2e:bench.
//
// Envelope: the last stdout line is the Recorder-shaped JSON `scripts/factory/bench.mjs`
// reads (PASS/WARN/SKIP/FAIL per surface and per rule). Lane: the classifier files a
// `.spec.ts` under `browser`; it boots its own dev server on :3128, so it needs no
// `dev:fe` — but like every FE browser bench it is closed to the nightly sweep unless the
// lane is opened explicitly.
//
// Usage: cd Continuum-Frontend && bun run paid:parity:e2e:bench
// ---------------------------------------------------------------------------

test.use({ channel: 'chrome' });

const { serviceRoleKey } = pinProdSupabase();

// The same verified production pair optimizer:e2e:bench browses: the AGENCY "Easy Fit" row
// owns the live portfolios; the bench user is its member. A mismatched (brand, member) pair
// reads an EMPTY world and grades nothing.
const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** Owns the live portfolios and their ad sets. */
const PORTFOLIO_ACCOUNT_ID = '521903353286118';

const STREAM_DAYS = 14;
const DELIVERY_WINDOW_DAYS = 7;
const DEFAULT_RANGE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* -- the Recorder envelope -------------------------------------------------------
 *
 * `scripts/factory/bench.mjs` reads the LAST stdout line that parses as JSON and carries
 * `counts`. The shape is the Backend `_bench` Recorder's, mirrored rather than imported
 * because AGENTS.md §5 forbids a Frontend file importing Backend source.
 *
 * Grades live in a run-scoped JSONL file, not in module state: Playwright replaces the
 * worker after a failed test, and a worker's memory goes with it. Each worker's afterAll
 * re-reads the whole file, so the LAST envelope on stdout is the cumulative one.
 */
type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
type Entry = { step: string; grade: Grade; detail?: string } | { note: string };
const LEDGER_PATH =
  process.env.PAID_PARITY_RUN_LEDGER ?? join(tmpdir(), `paid-parity-${process.pid}.jsonl`);
const benchStartedAt = process.env.PAID_PARITY_RUN_STARTED_AT ?? new Date().toISOString();

function persist(entry: Entry): void {
  appendFileSync(LEDGER_PATH, `${JSON.stringify(entry)}\n`);
}

function entries(): Entry[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Entry);
}

function record(step: string, grade: Grade, detail?: string): void {
  const glyph = grade === 'PASS' ? '✓' : grade === 'WARN' ? '!' : grade === 'SKIP' ? '–' : '✗';
  persist({ step, grade, ...(detail ? { detail } : {}) });
  console.log(`${glyph} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
}

function note(message: string): void {
  persist({ note: message });
  console.log(`· ${message}`);
}

function printBenchEnvelope(): void {
  const all = entries();
  const graded = all.filter((e): e is Exclude<Entry, { note: string }> => 'step' in e);
  const notes = all.filter((e): e is { note: string } => 'note' in e).map((e) => e.note);
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'WARN') counts.warn += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  const exitCode = counts.fail > 0 ? 1 : 0;
  console.log(
    `\n${counts.pass} pass, ${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail — ` +
      `${exitCode === 0 ? 'BENCH GREEN' : 'BENCH RED'}`,
  );
  console.log(
    JSON.stringify({
      bench: 'paid:parity:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - Date.parse(benchStartedAt),
      results: graded,
      notes,
      counts,
      exitCode,
    }),
  );
}

/* -- captured payloads ------------------------------------------------------------- */

type Captured = { name: string; body: Record<string, unknown>; json: unknown };
const captured: Captured[] = [];

/** The LAST response for an RPC / edge function, optionally narrowed by its request body. */
function payload(name: string, matches?: (body: Record<string, unknown>) => boolean): unknown {
  return captured.filter((c) => c.name === name && (matches ? matches(c.body) : true)).at(-1)?.json;
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const obj = (value: unknown): Row | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const bareAccountId = (id: string): string => id.replace(/^act_/, '');

/** Wire the capture on a page: every optimizer RPC and edge call is fetched for real and
 *  handed back untouched; the bench only keeps a copy. */
async function captureOptimizerReads(page: Page): Promise<void> {
  await page.route(/\/(rest\/v1\/rpc|functions\/v1)\/[^/?]+/, async (route) => {
    const request = route.request();
    const response = await route.fetch();
    const name = new URL(request.url()).pathname.split('/').pop() ?? '';
    let body: Record<string, unknown> = {};
    try {
      body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
    } catch {
      body = {};
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    captured.push({ name, body, json });
    await route.fulfill({ response });
  });
}

/* -- the payload table: figure key → the field it claims to come from ------------------- */

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
const humanize = (value: string): string => {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The portfolios the Overview scopes to the pinned account (list rows owned by it). */
function scopedPortfolios(): Row[] {
  return rows(payload('optimizer_list_portfolios')).filter((row) => {
    const account = str(row.ad_account_id);
    return !account || bareAccountId(account) === bareAccountId(PORTFOLIO_ACCOUNT_ID);
  });
}

function metricFor(portfolio: Row) {
  return getOptimizationMetricDefinition(
    (str(portfolio.target_metric) ?? str(portfolio.objective) ?? 'lead') as Parameters<
      typeof getOptimizationMetricDefinition
    >[0],
  );
}

function targetOf(portfolio: Row): number | null {
  const target = num(portfolio.cpa_target);
  if (target == null || target <= 0) return null;
  return target * metricFor(portfolio).denominatorMultiplier;
}

/** The spend-by-objective stream, folded the bench's own way: the last STREAM_DAYS full
 *  days ending yesterday, zero-filled, per date and per objective. */
function foldStream() {
  const spendRows = rows(payload('optimizer_get_spend_by_objective'));
  const endDay = addDays(todayIso(), -1);
  const dates = Array.from({ length: STREAM_DAYS }, (_, i) =>
    addDays(endDay, i - (STREAM_DAYS - 1)),
  );
  const byDate = new Map<string, Map<string, number>>(dates.map((d) => [d, new Map()]));
  const totals = new Map<string, number>();
  for (const row of spendRows) {
    const date = str(row.date);
    const objective = str(row.objective);
    const spend = num(row.spend);
    if (!date || !objective || spend == null) continue;
    totals.set(objective, (totals.get(objective) ?? 0) + spend);
    const day = byDate.get(date);
    if (day) day.set(objective, (day.get(objective) ?? 0) + spend);
  }
  const points = dates.map((date) => {
    const day = byDate.get(date) ?? new Map<string, number>();
    let total = 0;
    for (const value of day.values()) total += value;
    return { date, total, byObjective: day };
  });
  const latest = [...points].reverse().find((p) => p.total > 0) ?? null;
  const hasData = [...totals.values()].some((t) => t > 0);
  return { points, latest, totals, hasData };
}

const mean = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;

/** What the quiet lead card reads from the same series: last 7 days, the 7 before. */
function readDelivery() {
  const stream = foldStream();
  if (!stream.hasData) return null;
  const spend = stream.points.map((p) => p.total);
  if (spend.reduce((s, v) => s + v, 0) <= 0) return null;
  const days = Math.min(DELIVERY_WINDOW_DAYS, Math.ceil(spend.length / 2));
  const perDay = mean(spend.slice(-days)) as number;
  const priorPerDay = spend.length >= days * 2 ? mean(spend.slice(-days * 2, -days)) : null;
  const meanAll = mean(spend) as number;
  const peak = stream.points.reduce((best, p) =>
    Math.abs(p.total - meanAll) > Math.abs(best.total - meanAll) ? p : best,
  );
  return {
    days,
    perDay,
    priorPerDay,
    deltaPct:
      priorPerDay != null && priorPerDay > 0
        ? Math.round(((perDay - priorPerDay) / priorPerDay) * 100)
        : null,
    peak: { spend: peak.total, deltaPct: Math.round(((peak.total - meanAll) / meanAll) * 100) },
    meanAll,
    stream,
  };
}

function accountRead(): Row | null {
  return obj(obj(payload('optimizer_get_account_read'))?.read);
}

function candidatesOfRead(): Row[] {
  const read = accountRead();
  return [...rows(read?.candidates), ...rows(read?.guards)];
}

/** The lead candidate the card is about, read from the card's own foot line. */
let leadDetector: string | null = null;

function candidateFigure(candidate: Row, part: 'figure' | 'money' | 'from' | 'to' | 'sure') {
  const headline = obj(candidate.headline);
  switch (part) {
    case 'figure':
      return headline ? num(headline.value) : num(candidate.impact_per_day);
    case 'money':
      return num(candidate.impact_per_day);
    case 'from':
      return headline ? num(headline.from) : null;
    case 'to':
      return headline ? num(headline.to) : null;
    case 'sure':
      return num(candidate.confidence) != null
        ? Math.round(Math.min(1, Math.max(0, num(candidate.confidence) as number)) * 100)
        : null;
  }
}

/** The recap the portfolio page sums from the account snapshots' daily series over the
 *  default range — the bench's OWN loop over the payload, so a window that summed one day
 *  too many is caught against arithmetic that did not share the bug. */
function recapFromPayload(portfolio: Row) {
  const portfolioId = str(portfolio.id) as string;
  const enrolled = new Set(
    rows(payload('optimizer_list_portfolio_adsets', (b) => b.p_portfolio_id === portfolioId))
      .map((row) => str(row.adset_id))
      .filter((id): id is string => Boolean(id)),
  );
  const snapshots = rows(
    obj(payload('paid-media-metrics', (b) => b.scope === 'adset_snapshots'))?.snapshots,
  ).filter((snapshot) => enrolled.has(str(snapshot.id) ?? ''));
  const metric = metricFor(portfolio);
  const today = todayIso();
  const to = today;
  const from = addDays(today, -(DEFAULT_RANGE_DAYS - 1));
  const previous = { from: addDays(from, -DEFAULT_RANGE_DAYS), to: addDays(from, -1) };

  const sum = (lo: string, hi: string) => {
    const dates = new Set<string>();
    let spend = 0;
    let results = 0;
    let impressions = 0;
    let clicks = 0;
    let sawDaily = false;
    for (const snapshot of snapshots) {
      const daily = rows(snapshot.daily);
      if (daily.length > 0) sawDaily = true;
      for (const day of daily) {
        const date = str(day.date);
        if (!date || date < lo || date > hi) continue;
        dates.add(date);
        spend += num(day.spend) ?? 0;
        results += num(day[metric.kpiField]) ?? 0;
        impressions += num(day.impressions) ?? 0;
        clicks += num(day.clicks) ?? 0;
      }
    }
    const cost = results > 0 ? (spend / results) * metric.denominatorMultiplier : null;
    return { spend, results, impressions, clicks, cost, days: dates.size, sawDaily };
  };
  const current = sum(from, to);
  const prior = sum(previous.from, previous.to);
  // No daily series on these snapshot rows: the screen falls back to the engine's own d7
  // window totals, so the bench reads the same field — and cannot count its days.
  const windowKey = `d${DEFAULT_RANGE_DAYS}`;
  const engine = (() => {
    let spend = 0;
    let results = 0;
    let impressions = 0;
    let clicks = 0;
    let saw = false;
    for (const snapshot of snapshots) {
      const w = obj(obj(snapshot.windows)?.[windowKey]);
      if (!w) continue;
      saw = true;
      spend += num(w.spend) ?? 0;
      results += num(w[metric.kpiField]) ?? 0;
      impressions += num(w.impressions) ?? 0;
      clicks += num(w.clicks) ?? 0;
    }
    const cost = results > 0 ? (spend / results) * metric.denominatorMultiplier : null;
    return { saw, spend, results, impressions, clicks, cost };
  })();
  const target = targetOf(portfolio);
  const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : null);
  return {
    path: `paid-media-metrics.adset_snapshots[enrolled ${enrolled.size}].daily[${from}..${to}]`,
    enginePath: `paid-media-metrics.adset_snapshots[enrolled ${enrolled.size}].windows.${windowKey}`,
    engine,
    current,
    prior,
    target,
    deltas: {
      spend: prior.days > 0 ? ratio(current.spend, prior.spend) : null,
      results: prior.days > 0 ? ratio(current.results, prior.results) : null,
      cost:
        current.cost != null && prior.cost != null
          ? Math.round((current.cost / prior.cost - 1) * 100)
          : null,
    },
    vsTarget:
      target != null && current.cost != null ? Math.round((current.cost / target - 1) * 100) : null,
    metric,
    from,
    to,
  };
}

function statusReport(portfolioId: string): Row | null {
  return obj(payload('optimizer-status', (b) => b.portfolio_id === portfolioId));
}

function briefCandidate(portfolioId: string, id: string): Row | null {
  const brief = obj(statusReport(portfolioId)?.hero_brief);
  return rows(brief?.candidates).find((c) => c.id === id) ?? null;
}

function recommendation(id: string): { row: Row; portfolioId: string } | null {
  for (const c of captured) {
    if (c.name !== 'optimizer-status') continue;
    const portfolioId = str(c.body.portfolio_id);
    if (!portfolioId) continue;
    const rec = rows(obj(c.json)?.recommendations).find((r) => r.id === id);
    if (rec) return { row: rec, portfolioId };
  }
  return null;
}

function cycleItem(adsetId: string): Row | null {
  for (const c of captured) {
    if (c.name !== 'optimizer-status' || !c.body.portfolio_id) continue;
    const item = rows(obj(c.json)?.latest_items).find((r) => r.adset_id === adsetId);
    if (item) return item;
  }
  return null;
}

const value = (path: string, v: number | null, daysSummed?: number): PayloadExpectation => ({
  kind: 'value',
  path,
  value: v,
  ...(daysSummed != null ? { daysSummed } : {}),
});
const unmapped = (reason: string): PayloadExpectation => ({ kind: 'unmapped', reason });

/** Context the resolver needs beyond the captures: which portfolio page is open. */
let detailPortfolio: Row | null = null;

/** THE TABLE. `data-figure` key → the payload path it must equal. */
function resolve(node: FigureNode): PayloadExpectation {
  const key = node.key;
  const portfolios = scopedPortfolios();
  const dailyTotal = portfolios.reduce((s, p) => s + (num(p.daily_total) ?? 0), 0);

  // -- Overview tiles --------------------------------------------------------------
  if (key === 'tiles.daily-budget') {
    return value('optimizer_list_portfolios[account].daily_total Σ', dailyTotal);
  }
  if (key === 'tiles.spent-yesterday') {
    const stream = foldStream();
    return value(
      `optimizer_get_spend_by_objective[${stream.latest?.date ?? 'no full day'}].spend Σ`,
      stream.latest?.total ?? null,
      1,
    );
  }
  if (key === 'tiles.spent-yesterday.vs-plan') {
    const stream = foldStream();
    const spent = stream.latest?.total ?? null;
    return value(
      'round(spend_by_objective[latest] / Σ daily_total × 100)',
      spent != null && dailyTotal > 0 ? Math.round((spent / dailyTotal) * 100) : null,
      1,
    );
  }
  if (key === 'tiles.on-autopilot') {
    return value(
      'optimizer_list_portfolios[account].apply_mode == autopilot count',
      portfolios.filter((p) => p.apply_mode === 'autopilot').length,
    );
  }
  if (key === 'tiles.decisions-waiting') {
    return value(
      'optimizer_list_portfolios[account].pending_recommendations + pending_budget_moves Σ',
      portfolios.reduce(
        (s, p) => s + (num(p.pending_recommendations) ?? 0) + (num(p.pending_budget_moves) ?? 0),
        0,
      ),
    );
  }

  // -- The account read strip: one candidate per row, keyed by its detector ----------
  const readRow = /^read\.([a-z_]+)\.(figure|money|from|to)$/.exec(key);
  if (readRow) {
    const [, detector, part] = readRow;
    const candidate = candidatesOfRead().find((c) => c.detector === detector) ?? null;
    if (!candidate) return unmapped(`no candidate for detector ${detector} in the read`);
    const path = `optimizer_get_account_read.read.candidates[${detector}]`;
    if (part === 'figure')
      return value(
        `${path}.headline.value ?? impact_per_day`,
        candidateFigure(candidate, 'figure'),
      );
    if (part === 'money')
      return value(`${path}.impact_per_day`, candidateFigure(candidate, 'money'));
    return value(`${path}.headline.${part}`, candidateFigure(candidate, part as 'from' | 'to'));
  }

  // -- Overview lead card ----------------------------------------------------------
  if (key.startsWith('account-lead.')) {
    const part = key.slice('account-lead.'.length);
    const delivered = readDelivery();
    if (leadDetector) {
      const candidate = candidatesOfRead().find((c) => c.detector === leadDetector) ?? null;
      if (!candidate) return unmapped(`no candidate for detector ${leadDetector} in the read`);
      const path = `optimizer_get_account_read.read.candidates[${leadDetector}]`;
      if (part === 'figure') {
        return value(
          `${path}.headline.value ?? impact_per_day`,
          candidateFigure(candidate, 'figure'),
        );
      }
      if (part === 'money')
        return value(`${path}.impact_per_day`, candidateFigure(candidate, 'money'));
      if (part === 'from')
        return value(`${path}.headline.from`, candidateFigure(candidate, 'from'));
      if (part === 'to') return value(`${path}.headline.to`, candidateFigure(candidate, 'to'));
      if (part === 'sure')
        return value(`${path}.confidence × 100`, candidateFigure(candidate, 'sure'));
    }
    // The quiet face: the account's own delivery, from the spend stream.
    const streamPath = `optimizer_get_spend_by_objective[last ${delivered?.days ?? 7} of ${STREAM_DAYS} days]`;
    if (part === 'figure') {
      if (delivered) return value(`${streamPath}.spend mean`, delivered.perDay, delivered.days);
      const read = accountRead();
      return value(
        'optimizer_get_account_read.read.scale_per_day ?? Σ daily_total',
        num(read?.scale_per_day) ?? dailyTotal,
      );
    }
    if (part === 'pacing') {
      const perDay = delivered?.perDay ?? num(accountRead()?.scale_per_day) ?? dailyTotal;
      return value(
        'round(delivery per day / Σ daily_total × 100)',
        dailyTotal > 0 ? Math.round((perDay / dailyTotal) * 100) : null,
      );
    }
    if (part === 'planned')
      return value('optimizer_list_portfolios[account].daily_total Σ', dailyTotal);
    if (part === 'trend')
      return value(
        `${streamPath} vs the ${delivered?.days ?? 7} before, %`,
        delivered?.deltaPct ?? null,
        delivered?.days,
      );
    if (part === 'trend.prior')
      return value(
        `${streamPath} prior window mean`,
        delivered?.priorPerDay ?? null,
        delivered?.days,
      );
    if (part === 'trend.now')
      return value(`${streamPath}.spend mean`, delivered?.perDay ?? null, delivered?.days);
    if (part === 'peak')
      return value(
        `optimizer_get_spend_by_objective[${STREAM_DAYS} days] max |spend − mean|`,
        delivered?.peak.spend ?? null,
        1,
      );
    if (part === 'peak.delta')
      return value('peak vs 14-day mean, %', delivered?.peak.deltaPct ?? null);
    if (part === 'peak.mean')
      return value(
        `optimizer_get_spend_by_objective[${STREAM_DAYS} days] mean`,
        delivered?.meanAll ?? null,
      );
    if (part === 'mix' || /^mix\.\d+$/.test(part)) {
      const index = part === 'mix' ? 0 : Number(part.slice(4));
      const stream = foldStream();
      let slices: number[];
      let path: string;
      if (stream.hasData) {
        const total = [...stream.totals.values()].reduce((s, v) => s + v, 0);
        slices = [...stream.totals.values()].map((v) => Math.round((v / total) * 100));
        path = `optimizer_get_spend_by_objective[${STREAM_DAYS} days] share by objective`;
      } else {
        const byObjective = new Map<string, number>();
        for (const p of portfolios) {
          const o = str(p.objective) ?? '';
          byObjective.set(o, (byObjective.get(o) ?? 0) + (num(p.daily_total) ?? 0));
        }
        const total = [...byObjective.values()].reduce((s, v) => s + v, 0);
        slices = [...byObjective.values()]
          .filter((v) => v > 0)
          .map((v) => Math.round((v / total) * 100));
        path = 'optimizer_list_portfolios[account].daily_total share by objective';
      }
      // The card orders slices largest first; the stream's totals are folded in row order.
      slices.sort((a, b) => b - a);
      return value(`${path}[${index}]`, slices[index] ?? null);
    }
    return unmapped(`no path for ${key}`);
  }

  // -- Spend-by-objective legend ---------------------------------------------------
  const legend = /^legend\.(.+)\.(share|value)$/.exec(key);
  if (legend) {
    const [, objective, part] = legend;
    const stream = foldStream();
    if (stream.latest) {
      const total = stream.latest.total;
      const spend = stream.latest.byObjective.get(objective) ?? null;
      const path = `optimizer_get_spend_by_objective[${stream.latest.date}][${objective}].spend`;
      if (part === 'value') return value(path, spend, 1);
      return value(
        `round(${path} / day total × 100)`,
        spend != null && total > 0 ? Math.round((spend / total) * 100) : null,
        1,
      );
    }
    const byName = new Map<string, number>();
    for (const p of portfolios) {
      const name = humanize(str(p.objective) ?? '');
      byName.set(name, (byName.get(name) ?? 0) + (num(p.daily_total) ?? 0));
    }
    const total = [...byName.values()].reduce((s, v) => s + v, 0);
    const planned = byName.get(objective) ?? null;
    if (part === 'value')
      return value(
        `optimizer_list_portfolios[account][objective ${objective}].daily_total Σ`,
        planned,
      );
    return value(
      'planned share by objective',
      planned != null && total > 0 ? Math.round((planned / total) * 100) : null,
    );
  }

  // -- Portfolio cards (Overview) and list rows (Portfolios) -----------------------
  const rowFigure =
    /^(portfolio-row|portfolios)\.(archived\.)?([0-9a-f-]{36})\.(daily|target|lead\.figure|lead\.money|lead\.from|lead\.to)$/.exec(
      key,
    );
  if (rowFigure) {
    const [, , archived, id, part] = rowFigure;
    const source = archived ? rows(payload('optimizer_list_archived_portfolios')) : portfolios;
    const listName = archived ? 'optimizer_list_archived_portfolios' : 'optimizer_list_portfolios';
    const portfolio = source.find((p) => p.id === id);
    if (!portfolio) return unmapped(`portfolio ${id} not in ${listName}`);
    if (part === 'daily')
      return value(`${listName}[${id}].daily_total`, num(portfolio.daily_total));
    if (part === 'target')
      return value(`${listName}[${id}].cpa_target × denominatorMultiplier`, targetOf(portfolio));
    const candidates = candidatesOfRead().filter((c) =>
      (Array.isArray(c.portfolio_ids) ? (c.portfolio_ids as unknown[]) : []).includes(id),
    );
    if (candidates.length === 0) return unmapped(`no read candidate names portfolio ${id}`);
    const want = part.slice('lead.'.length) as 'figure' | 'money' | 'from' | 'to';
    const values = candidates.map((c) => candidateFigure(c, want));
    const match = values.find(
      (v) => v != null && node.raw != null && Math.abs(v - node.raw) < 0.005,
    );
    return value(
      `optimizer_get_account_read.read.candidates[portfolio_ids ∋ ${id}].${want === 'money' ? 'impact_per_day' : 'headline'} (${candidates.length} candidate(s))`,
      match ?? values[0] ?? null,
    );
  }

  // -- Portfolio page --------------------------------------------------------------
  if (detailPortfolio) {
    const portfolioId = str(detailPortfolio.id) as string;
    const recap = recapFromPayload(detailPortfolio);
    if (!recap.current.sawDaily && key.startsWith('recap.')) {
      const e = recap.engine;
      if (!e.saw)
        return unmapped(
          `neither a daily series nor a ${DEFAULT_RANGE_DAYS}-day engine window on the enrolled snapshots (${recap.path})`,
        );
      const p = recap.enginePath;
      if (key === 'recap.spend') return value(`${p}.spend Σ`, e.spend);
      if (key === 'recap.results') return value(`${p}.${recap.metric.kpiField} Σ`, e.results);
      if (key === 'recap.impressions') return value(`${p}.impressions Σ`, e.impressions);
      if (key === 'recap.clicks') return value(`${p}.clicks Σ`, e.clicks);
      if (key === 'recap.cost' || key === 'recap.target.actual')
        return value(
          `${p} spend / ${recap.metric.kpiField} × ${recap.metric.denominatorMultiplier}`,
          e.cost,
        );
      if (key === 'recap.target')
        return value(
          `optimizer_list_portfolios[${portfolioId}].cpa_target × denominatorMultiplier`,
          recap.target,
        );
      if (key === 'recap.target.vs')
        return value(
          'round(cost / target − 1) × 100',
          recap.target != null && e.cost != null
            ? Math.round((e.cost / recap.target - 1) * 100)
            : null,
        );
      if (key === 'recap.sentence') {
        return {
          kind: 'sentence',
          path: `${p} → growth {spend, results, cost, target}`,
          figures: {
            spend: round2(e.spend),
            results: Math.round(e.results),
            cost: e.cost != null ? round2(e.cost) : null,
            target: recap.target,
          },
        };
      }
      return unmapped(
        `no daily series on the enrolled snapshots — ${key} has no engine-window equivalent (${recap.path})`,
      );
    }
    const c = recap.current;
    if (key === 'recap.spend') return value(`${recap.path}.spend Σ`, c.spend, c.days);
    if (key === 'recap.results')
      return value(`${recap.path}.${recap.metric.kpiField} Σ`, c.results, c.days);
    if (key === 'recap.impressions')
      return value(`${recap.path}.impressions Σ`, c.impressions, c.days);
    if (key === 'recap.clicks') return value(`${recap.path}.clicks Σ`, c.clicks, c.days);
    if (key === 'recap.cost' || key === 'recap.target.actual')
      return value(
        `${recap.path} spend / ${recap.metric.kpiField} × ${recap.metric.denominatorMultiplier}`,
        c.cost,
        c.days,
      );
    if (key === 'recap.target')
      return value(
        `optimizer_list_portfolios[${portfolioId}].cpa_target × denominatorMultiplier`,
        recap.target,
      );
    if (key === 'recap.spend.delta')
      return value(
        `${recap.path} vs prior ${DEFAULT_RANGE_DAYS} days, spend %`,
        recap.deltas.spend,
        recap.prior.days,
      );
    if (key === 'recap.results.delta')
      return value(
        `${recap.path} vs prior ${DEFAULT_RANGE_DAYS} days, results %`,
        recap.deltas.results,
        recap.prior.days,
      );
    if (key === 'recap.cost.delta')
      return value(
        `${recap.path} vs prior ${DEFAULT_RANGE_DAYS} days, cost %`,
        recap.deltas.cost,
        recap.prior.days,
      );
    if (key === 'recap.target.vs')
      return value('round(cost / target − 1) × 100', recap.vsTarget, c.days);
    if (key === 'recap.sentence') {
      return {
        kind: 'sentence',
        path: `${recap.path} → growth {spend, results, cost, target}`,
        figures: {
          spend: round2(c.spend),
          results: Math.round(c.results),
          cost: c.cost != null ? round2(c.cost) : null,
          target: recap.target,
        },
      };
    }
    const news = /^news\.(.+)\.(figure|money|from|to|interval\.low|interval\.high)$/.exec(key);
    if (news) {
      const [, cardId, part] = news;
      const candidate = briefCandidate(portfolioId, cardId);
      if (candidate) {
        const path = `optimizer-status[${portfolioId}].hero_brief.candidates[${cardId}]`;
        if (part === 'figure')
          return value(
            `${path}.headline.value ?? impact_per_day`,
            candidateFigure(candidate, 'figure'),
          );
        if (part === 'money')
          return value(`${path}.impact_per_day`, candidateFigure(candidate, 'money'));
        if (part === 'from')
          return value(`${path}.headline.from`, candidateFigure(candidate, 'from'));
        if (part === 'to') return value(`${path}.headline.to`, candidateFigure(candidate, 'to'));
      }
      const rec = cardId.startsWith('rec:') ? recommendation(cardId.slice(4)) : null;
      if (rec && (part === 'figure' || part === 'money')) {
        return value(
          `optimizer-status[${rec.portfolioId}].recommendations[${cardId.slice(4)}].evidence.estImpactPerDay`,
          num(obj(rec.row.evidence)?.estImpactPerDay),
        );
      }
      if (part.startsWith('interval.')) {
        const adsetId = str(candidate?.adset_id);
        const ci = adsetId ? obj(obj(cycleItem(adsetId)?.diagnostics)?.ci) : null;
        if (ci)
          return value(
            `optimizer-status[${portfolioId}].latest_items[${adsetId}].diagnostics.ci.${part === 'interval.low' ? 'lo' : 'hi'}`,
            round2(num(ci[part === 'interval.low' ? 'lo' : 'hi']) ?? Number.NaN),
          );
        return unmapped(`no cycle item with a confidence interval behind card ${cardId}`);
      }
      return unmapped(
        `card ${cardId} is composed on the Frontend from the report (deterministic brief), not a stored candidate`,
      );
    }
    if (key === 'timeline.projected.last') {
      const series = rows(
        payload('optimizer_get_cpa_series', (b) => b.p_portfolio_id === portfolioId),
      );
      const inRange = series.filter((p) => {
        const day = (str(p.cycle_ts) ?? '').slice(0, 10);
        return day >= recap.from && day <= recap.to;
      });
      const last = (inRange.length > 0 ? inRange : series).at(-1);
      const spend = num(last?.spend_d7);
      const conv = num(last?.conv_d7);
      return value(
        `optimizer_get_cpa_series[${portfolioId}][last in range].spend_d7 / conv_d7 × ${recap.metric.denominatorMultiplier}`,
        spend != null && conv != null && conv > 0
          ? (spend / conv) * recap.metric.denominatorMultiplier
          : null,
        DEFAULT_RANGE_DAYS,
      );
    }
    if (key === 'timeline.projected.next') {
      return unmapped('a linear projection of the series, by design — no payload field carries it');
    }
  }

  // -- Actions queue ---------------------------------------------------------------
  const queue =
    /^queue\.(.+?)\.(now|proposed|change|at-stake|detail\.now|detail\.proposed|detail\.cost|detail\.ci\.lo|detail\.ci\.hi)$/.exec(
      key,
    );
  if (queue) {
    const [, id, part] = queue;
    if (part === 'at-stake') {
      const rec = recommendation(id);
      if (!rec) return unmapped(`recommendation ${id} not in any captured optimizer-status report`);
      return value(
        `optimizer-status[${rec.portfolioId}].recommendations[${id}].evidence.estImpactPerDay`,
        num(obj(rec.row.evidence)?.estImpactPerDay),
      );
    }
    const item = cycleItem(id);
    if (!item) return unmapped(`ad set ${id} not in any captured optimizer-status latest_items`);
    const path = `optimizer-status[*].latest_items[${id}]`;
    if (part === 'now' || part === 'detail.now')
      return value(`${path}.current_budget`, num(item.current_budget) ?? 0);
    if (part === 'proposed' || part === 'detail.proposed')
      return value(`${path}.final_budget`, num(item.final_budget) ?? 0);
    if (part === 'change') {
      const pct = num(item.change_pct);
      return value(`${path}.change_pct × 100`, pct != null ? Number((pct * 100).toFixed(0)) : null);
    }
    const ci = obj(obj(item.diagnostics)?.ci);
    if (part === 'detail.cost') return value(`${path}.diagnostics.ci.cpa`, num(ci?.cpa));
    if (part === 'detail.ci.lo') return value(`${path}.diagnostics.ci.lo`, num(ci?.lo));
    if (part === 'detail.ci.hi') return value(`${path}.diagnostics.ci.hi`, num(ci?.hi));
  }
  if (key.startsWith('queue.summary.')) {
    return unmapped('a per-trigger sum of pending recommendations, derived on the Frontend');
  }
  if (key === 'queue.net')
    return unmapped('a selection total — only rendered once rows are selected');

  return unmapped(`no payload path declared for ${key}`);
}

/* -- the page ------------------------------------------------------------------------ */

let storageState: PlaywrightStorageState;
let benchUserId: string;
let originalActiveBrandId: string | null = null;
let context: BrowserContext;
let page: Page;
let accountCurrency: string | 'none' = 'none';

async function readActiveBrandPreference(): Promise<string | null> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', benchUserId)
    .maybeSingle();
  if (error) throw new Error(`[paid-parity] preference read failed: ${error.message}`);
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

async function selectBrand(brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: benchUserId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[paid-parity] brand switch failed: ${error.message}`);
}

/** Pins the ad account through the real picker and waits the optimizer out of its skeleton.
 *  The account is React state on the page shell, not a URL param, so it is re-pinned after
 *  every full navigation. */
async function pinAdAccount(): Promise<void> {
  const accountPicker = page.getByRole('combobox').first();
  await expect(accountPicker).toBeEnabled({ timeout: 180_000 });
  await accountPicker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(PORTFOLIO_ACCOUNT_ID);
  await page.getByRole('option').filter({ hasText: PORTFOLIO_ACCOUNT_ID }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });
}

async function openSurface(view: 'overview' | 'portfolios' | 'actions', portfolioId?: string) {
  const params = new URLSearchParams({ tab: 'performance', optimizerView: view });
  if (portfolioId) params.set('portfolio', portfolioId);
  await page.goto(`/scale?${params.toString()}`, { waitUntil: 'domcontentloaded' });
  await pinAdAccount();
}

async function waitForCapture(name: string, matches?: (body: Record<string, unknown>) => boolean) {
  await expect
    .poll(() => captured.some((c) => c.name === name && (matches ? matches(c.body) : true)), {
      timeout: 120_000,
      message: `waiting for the page to fetch ${name}`,
    })
    .toBe(true);
}

/** Every visible figure node on the page, as the model reads it. */
async function collectFigures(): Promise<FigureNode[]> {
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

/** Grade one surface: all five rules per node, the currency check, and the summary rows the
 *  envelope carries. Returns whether the surface is green (no FAIL). */
function gradeSurface(surface: string, nodes: FigureNode[]): boolean {
  if (nodes.length === 0) {
    record(`${surface}.figures`, 'SKIP', 'no figure nodes rendered on this surface');
    return false;
  }
  const results: RuleResult[] = gradeNodes(nodes, resolve);
  const byRule = new Map<string, { pass: number; warn: number; skip: number; fail: number }>();
  for (const result of results) {
    const bucket = byRule.get(result.rule) ?? { pass: 0, warn: 0, skip: 0, fail: 0 };
    if (result.grade === 'PASS') bucket.pass += 1;
    else if (result.grade === 'WARN') bucket.warn += 1;
    else if (result.grade === 'SKIP') bucket.skip += 1;
    else bucket.fail += 1;
    byRule.set(result.rule, bucket);
    if (result.grade === 'FAIL' || result.grade === 'WARN') {
      record(`${surface}.${result.rule}.${result.key}`, result.grade, result.detail);
    }
  }
  for (const [rule, bucket] of byRule) {
    const grade: Grade = bucket.fail > 0 ? 'FAIL' : bucket.pass > 0 ? 'PASS' : 'SKIP';
    record(
      `${surface}.${rule}`,
      grade,
      `${bucket.pass} pass · ${bucket.warn} warn · ${bucket.skip} skip · ${bucket.fail} fail over ${nodes.length} figures`,
    );
  }
  // The surface-level currency check: every money node's declared currency is the account's.
  const money = nodes.filter(
    (n) => n.unit === 'currency' || n.unit === 'per-period' || n.unit === 'per-month',
  );
  const foreign = money.filter((n) => n.currency !== accountCurrency);
  record(
    `${surface}.currency`,
    foreign.length === 0 ? 'PASS' : 'FAIL',
    foreign.length === 0
      ? `${money.length} money figures declare ${accountCurrency} (list_brand_ad_accounts.currency)`
      : `${foreign.length} of ${money.length} money figures declare ${[...new Set(foreign.map((n) => n.currency))].join(', ')} — the account carries ${accountCurrency}: ${foreign
          .slice(0, 5)
          .map((n) => n.key)
          .join(', ')}`,
  );
  const green = results.every((r) => r.grade !== 'FAIL') && foreign.length === 0;
  console.log(`[paid-parity] ${surface}: ${nodes.length} figures, ${green ? 'green' : 'RED'}`);
  return green;
}

/** The masked snapshot — only after parity is green; the first run writes the baseline. */
async function snapshotSurface(surface: string, green: boolean): Promise<void> {
  if (!green) {
    record(`${surface}.screenshot`, 'SKIP', 'parity not green — no snapshot taken');
    return;
  }
  const name = `${surface}.png`;
  const baseline = test.info().snapshotPath(name);
  const mask = [page.locator('[data-testid=figure]')];
  if (!existsSync(baseline)) {
    mkdirSync(dirname(baseline), { recursive: true });
    await page.screenshot({
      path: baseline,
      fullPage: true,
      mask,
      animations: 'disabled',
      caret: 'hide',
    });
    record(`${surface}.screenshot`, 'SKIP', `baseline written: ${baseline}`);
    return;
  }
  try {
    await expect(page).toHaveScreenshot(name, { fullPage: true, mask });
    record(`${surface}.screenshot`, 'PASS', `matches ${baseline} with figures masked`);
  } catch (error) {
    record(
      `${surface}.screenshot`,
      'FAIL',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
  }
}

const failuresOf = (surface: string) =>
  entries()
    .filter(
      (e): e is Exclude<Entry, { note: string }> =>
        'step' in e && e.step.startsWith(`${surface}.`) && e.grade === 'FAIL',
    )
    .map((g) => `${g.step}: ${g.detail}`);

test.describe('Performance+ — the screen agrees with the payload it fetched', () => {
  test.beforeAll(async ({ browser }) => {
    const minted = await mintSessionBundleForEmail(OWNER_EMAIL);
    storageState = minted.state;
    benchUserId = minted.userId;
    originalActiveBrandId = await readActiveBrandPreference();
    await selectBrand(AGENCY_BRAND_ID);
    console.log(`[paid-parity] active brand before: ${originalActiveBrandId ?? '(none)'}`);

    context = await browser.newContext({ storageState });
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.port === '54321' || url.hostname === '127.0.0.1') {
        if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/functions/v1/')) {
          throw new Error(`[paid-parity] the browser talked to a LOCAL Supabase: ${url.host}`);
        }
      }
    });
    page = await context.newPage();
    await captureOptimizerReads(page);
  });

  test.afterAll(async () => {
    if (originalActiveBrandId) await selectBrand(originalActiveBrandId);
    await context?.close();
    printBenchEnvelope();
  });

  test('overview — lead card, four tiles, legend, portfolio cards', async () => {
    await openSurface('overview');
    await expect(page.getByTestId('account-tiles')).toBeVisible({ timeout: 120_000 });
    await waitForCapture('optimizer_list_portfolios');
    await waitForCapture('list_brand_ad_accounts');
    await waitForCapture('optimizer_get_spend_by_objective');
    await waitForCapture('optimizer_get_account_read');
    // The account read renders when the worker has written one; absent is a real state.
    const leadCard = page.getByTestId('account-lead-card');
    await leadCard.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);
    if ((await leadCard.count()) === 0) {
      note(
        'UN-EXERCISED: no account read row for this account today — the lead card did not render, so its figures are not graded',
      );
    } else {
      const foot = (await page.getByTestId('account-lead-foot').textContent()) ?? '';
      leadDetector = /Trigger · (\S+)/.exec(foot)?.[1] ?? null;
      note(
        `lead card mode: ${await leadCard.getAttribute('data-mode')}${leadDetector ? ` · ${leadDetector}` : ''}`,
      );
    }
    // Let the legend and the cards settle: the stream folds after the spend rows land.
    await page.waitForTimeout(1_500);

    const account = rows(payload('list_brand_ad_accounts')).find(
      (row) => bareAccountId(str(row.account_id) ?? '') === PORTFOLIO_ACCOUNT_ID,
    );
    const code = (str(account?.currency) ?? '').trim().toUpperCase();
    accountCurrency = /^[A-Z]{3}$/.test(code) ? code : 'none';
    note(
      `account ${PORTFOLIO_ACCOUNT_ID} currency on the wire: ${str(account?.currency) ?? 'null'} → ${accountCurrency}`,
    );

    const nodes = await collectFigures();
    const green = gradeSurface('overview', nodes);
    await snapshotSurface('overview', green);
    expect(failuresOf('overview'), 'overview parity').toEqual([]);
  });

  test('portfolios — daily budget and lead figures per row', async () => {
    await openSurface('portfolios');
    await expect(page.getByRole('tab', { name: 'Portfolios' })).toBeVisible({ timeout: 120_000 });
    await waitForCapture('optimizer_list_portfolios');
    await expect(page.locator('[data-figure^="portfolios."]').first()).toBeVisible({
      timeout: 120_000,
    });
    await page.waitForTimeout(1_000);
    const nodes = await collectFigures();
    const green = gradeSurface('portfolios', nodes);
    await snapshotSurface('portfolios', green);
    expect(failuresOf('portfolios'), 'portfolios parity').toEqual([]);
  });

  test('portfolio page — news cards, recap sentence, KPI tiles, CPL projection', async () => {
    // Self-contained: the list is read on this page load and the card is clicked from it, so
    // a worker restart after an earlier failure cannot leave this surface with nothing to open.
    await openSurface('portfolios');
    await waitForCapture('optimizer_list_portfolios');
    // The most recently cycled portfolio with a roster: its snapshots are the ones most likely
    // to carry the windows the recap sums, so the deep rules have something to read.
    detailPortfolio =
      scopedPortfolios()
        .filter((p) => (num(p.adset_count) ?? 0) > 0)
        .sort(
          (a, b) =>
            (str(b.last_scaled_at) ?? '').localeCompare(str(a.last_scaled_at) ?? '') ||
            (num(b.adset_count) ?? 0) - (num(a.adset_count) ?? 0),
        )[0] ?? null;
    if (!detailPortfolio) {
      record('portfolio.figures', 'SKIP', 'no enrolled portfolio on the account to open');
      return;
    }
    const portfolioId = str(detailPortfolio.id) as string;
    note(`portfolio page: ${str(detailPortfolio.name)} (${portfolioId})`);
    await page
      .getByRole('button', { name: `Open ${str(detailPortfolio.name)}` })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
      timeout: 120_000,
    });
    await waitForCapture('optimizer-status', (b) => b.portfolio_id === portfolioId);
    await waitForCapture('paid-media-metrics', (b) => b.scope === 'adset_snapshots');
    await waitForCapture(
      'optimizer_list_portfolio_adsets',
      (b) => b.p_portfolio_id === portfolioId,
    );
    await waitForCapture('optimizer_get_cpa_series', (b) => b.p_portfolio_id === portfolioId);
    await expect(page.getByTestId('portfolio-hero')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-figure="recap.spend"]')).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(2_000);

    if ((await page.locator('[data-figure="timeline.projected.last"]').count()) === 0) {
      note(
        'UN-EXERCISED: the CPL timeline drew no projection (fewer than two priced cycles in range) — its figures are not graded',
      );
    }
    const nodes = await collectFigures();
    const green = gradeSurface('portfolio', nodes);
    await snapshotSurface('portfolio', green);
    expect(failuresOf('portfolio'), 'portfolio page parity').toEqual([]);
  });

  test('actions — now → proposed and at-stake per row', async () => {
    await openSurface('actions');
    await expect(page.getByRole('tab', { name: 'Actions' })).toBeVisible({ timeout: 120_000 });
    const empty = page.getByText('Nothing needs your decision');
    const firstRow = page.locator('[data-figure^="queue."]').first();
    await expect(empty.or(firstRow)).toBeVisible({ timeout: 120_000 });
    if ((await empty.count()) > 0) {
      record('actions.figures', 'SKIP', 'the queue is empty today — no rows to grade');
      await snapshotSurface('actions', true);
      return;
    }
    await page.waitForTimeout(1_500);
    const nodes = await collectFigures();
    const green = gradeSurface('actions', nodes);
    await snapshotSurface('actions', green);
    expect(failuresOf('actions'), 'actions parity').toEqual([]);
  });
});
