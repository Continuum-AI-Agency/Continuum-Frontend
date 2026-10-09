import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Request,
  type Route,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  attachL1,
  type DefinedState,
  EMPTY_STATE_SELECTORS,
  ERROR_STATE_SELECTORS,
  expectDefinedState,
  type L1Handle,
  LOADING_SELECTORS,
  MIN_CONTENT_CHARS,
  PULSE_MIN_WIDTH_PX,
  PULSE_SELECTOR,
} from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// perfplus:failures:bench — the Performance+ campaign's failure-injection lane (P2.5,
// docs/perfplus-campaign/02-phases.md#p25), graded against design-intent rule 7
// (docs/perfplus-design-intent.md: loading, a named empty state, a named error state with the
// human cause and a retry — never a blank area, never a ZodError or raw JSON).
//
// For each surface, a CLEAN load records the data calls it makes — Supabase REST/RPC,
// `/functions/v1/*`, the Backend's `localhost:4000/api/*` — and their real payloads. Then,
// per recorded call, the surface is reloaded with `page.route` answering that call with:
//   http500-html  HTTP 500 and an HTML body (what a proxy or a dead edge actually sends)
//   hang          never fulfilled — something must show within 15 s
//   empty         the real payload with every array emptied (zero rows)
//   partial       the real JSON with one key deleted from each row
// and once per surface with every data call delayed 2 s (`delay-2s`).
//
// After each injected load, soft-asserted and filed as FAIL rows (surface × call × injection ×
// invariant) with a screenshot under e2e/__screenshots__/perfplus-failures/:
//   defined-state     content, a named empty state or a named error state — never blank
//   raw-error-text    no raw JSON, "ZodError", "issues", a stack trace or an HTML error page
//                     in the visible text
//   pageerror         no uncaught exception
//   error-names-cause the error state says what failed in human words, not a generic line
//   retry-control     an error state after a 500 or a hang offers a retry
//   loading-shown     under the 2 s delay, a loading state is visible within 1.5 s
//
// ── READ ONLY ── No write clicks. Every page is opened by URL (the Optimizer views deep-link
// through `optimizerView=` / `portfolio=`). The single write is the bench user's active-brand
// preference (pinned to Easy Fit, swapped to the portfolio-owning brand for the Optimizer
// surfaces, restored at the end) — the same row the in-app brand switcher writes.
//
// Usage: cd Continuum-Frontend && bun run perfplus:failures:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit, the agency row — the campaign's seeded brand (00-context.md, "Auth para tests"). */
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The other Easy Fit row, which owns the active portfolios (see perfplus-l1.bench.spec.ts). */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OPTIMIZER_BRAND_CANDIDATES = [EASYFIT_BRAND_ID, EASYFIT_LEDGER_BRAND_ID] as const;

const VIEWPORT = { width: 1280, height: 900 } as const;
const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-failures');
/** Data calls per surface that get the per-call injections (the rest are listed, not driven). */
const MAX_CALLS = Number(process.env.PERFPLUS_FAILURES_MAX_CALLS ?? 8);
/** Calls the app shell makes on EVERY surface (notifications, run badges, starter kit…), not
 *  the surface's own data. They are driven once, on the first surface, and listed elsewhere, so
 *  the per-surface budget goes to the calls that feed the surface. */
const SHELL_CALL_PATTERN =
  /strategic_analysis_runs|\/api\/media\/client-render-jobs|\/api\/agents\/runs\/active|\/api\/organic\/agent\/generations|\/api\/onboarding\/starter-kit|\/notifications(\?|$)/;
const isShellCall = (call: RecordedCall): boolean => SHELL_CALL_PATTERN.test(call.key);
/** Comma-separated surface names to drive (default: all) — for re-running one finding. */
const ONLY_SURFACES = process.env.PERFPLUS_FAILURES_SURFACES?.split(',').map((s) => s.trim());
/** Clean-load settle: the dev server compiles the route and the surfaces read live Meta data. */
const CLEAN_SETTLE_MS = 90_000;
const INJECTED_SETTLE_MS = 30_000;
/** A hang must surface SOMETHING within this — rule 7's "never a blank area" has a clock. */
const HANG_SETTLE_MS = 15_000;
const DELAY_MS = 2_000;
const DELAY_SETTLE_MS = 60_000;
/** How long loading copy may outlive the page's loaded state on a CLEAN load before it is a finding. */
const LOADING_COPY_GRACE_MS = 10_000;
/** Rule 7: a loading state is visible within 1.5 s. */
const LOADING_DEADLINE_MS = 1_500;

type Surface = { name: string; path: string; optimizer: boolean };

type Injection = 'http500-html' | 'hang' | 'empty' | 'partial' | 'delay-2s';
const PER_CALL_INJECTIONS: readonly Injection[] = ['http500-html', 'hang', 'empty', 'partial'];

type RecordedCall = {
  key: string;
  method: string;
  url: string;
  status: number | null;
  contentType: string | null;
  text: string | null;
};

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:failures:bench', notes);

type Finding = {
  surface: string;
  call: string;
  injection: string;
  invariant: string;
  evidence: string;
};
const findings: Finding[] = [];

let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  if (findings.length > 0) {
    console.log(
      `[perfplus-failures] FINDINGS (surface × call × injection × invariant):\n${findings
        .map((f) => `  - ${f.surface} × ${f.call} × ${f.injection} ${f.invariant}: ${f.evidence}`)
        .join('\n')}`,
    );
  }
  recorder.print();
}

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
let optimizerBrand: string = EASYFIT_BRAND_ID;
let portfolioId: string | null = null;

/* ------------------------------------------------------------------------- */
/* Session and brand pin — the same rows perfplus-l1.bench.spec.ts writes     */
/* ------------------------------------------------------------------------- */

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
  if (!decoded.sub) throw new Error('[perfplus-failures] access token carries no sub claim');
  return decoded.sub;
}

async function listPortfolios(brandId: string): Promise<{ id: string }[]> {
  const { data, error } = await memberClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error)
    throw new Error(`[perfplus-failures] optimizer_list_portfolios(${brandId}): ${error.message}`);
  return Array.isArray(data)
    ? (data as unknown[]).flatMap((row) =>
        row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string'
          ? [{ id: (row as { id: string }).id }]
          : [],
      )
    : [];
}

async function resolveOptimizerBrand(): Promise<string> {
  const seen: string[] = [];
  for (const brandId of OPTIMIZER_BRAND_CANDIDATES) {
    const rows = await listPortfolios(brandId);
    seen.push(`${brandId.slice(0, 8)}=${rows.length}`);
    if (rows.length > 0) {
      portfolioId = rows[0]?.id ?? null;
      notes.push(
        `Optimizer brand: ${brandId} (${rows.length} portfolios; candidates ${seen.join(', ')}); portfolio page: ${portfolioId}`,
      );
      return brandId;
    }
  }
  notes.push(`Optimizer brand: no candidate owns a portfolio (${seen.join(', ')})`);
  return EASYFIT_BRAND_ID;
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
  if (error) throw new Error(`[perfplus-failures] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

/* ------------------------------------------------------------------------- */
/* Data calls — which requests count, and how two requests become one call   */
/* ------------------------------------------------------------------------- */

function isDataCall(url: string, method: string): boolean {
  if (method === 'OPTIONS' || method === 'HEAD') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (/\.supabase\.co$/.test(parsed.host)) {
    return parsed.pathname.startsWith('/rest/v1/') || parsed.pathname.startsWith('/functions/v1/');
  }
  if (/^(localhost|127\.0\.0\.1):4000$/.test(parsed.host))
    return parsed.pathname.startsWith('/api/');
  return false;
}

const normalizePath = (pathname: string): string =>
  pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/act_\d+/g, 'act_:id')
    .replace(/\d{8,}/g, ':id');

/** The call a request belongs to: method + origin class + path, plus the REST `select` (two
 *  reads of one table with different columns are two calls). */
function keyOf(url: string, method: string): string {
  const parsed = new URL(url);
  const origin = /supabase\.co$/.test(parsed.host) ? 'supabase' : 'backend';
  const select = parsed.searchParams.get('select');
  const path = normalizePath(parsed.pathname).replace(/^\/(rest|functions)\/v1/, '');
  return `${method} ${origin}${path}${select ? `?select=${select.slice(0, 40)}` : ''}`;
}

/** Records every data call a page makes, in first-seen order, with its first OK payload. */
function recordCalls(page: Page): { calls: () => RecordedCall[] } {
  const seen = new Map<string, RecordedCall>();
  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    if (!isDataCall(url, method)) return;
    const key = keyOf(url, method);
    if (!seen.has(key)) {
      seen.set(key, { key, method, url, status: null, contentType: null, text: null });
    }
  });
  page.on('response', (response) => {
    const request = response.request();
    const url = request.url();
    const method = request.method();
    if (!isDataCall(url, method)) return;
    const call = seen.get(keyOf(url, method));
    if (!call || call.text !== null) return;
    void response
      .text()
      .then((text) => {
        if (call.text !== null) return;
        call.status = response.status();
        call.contentType = response.headers()['content-type'] ?? null;
        call.text = text;
      })
      .catch(() => undefined);
  });
  return { calls: () => [...seen.values()] };
}

/* ------------------------------------------------------------------------- */
/* Payload shaping                                                            */
/* ------------------------------------------------------------------------- */

/** Every array emptied, every object kept: a zero-row answer in the payload's own shape. */
function emptied(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, emptied(v)]),
    );
  }
  return value;
}

/** Deletes the first non-null key of each row (or of the object). Returns the key, or null when
 *  the payload has no object to maim. */
function partial(value: unknown): { payload: unknown; deleted: string | null } {
  const maim = (obj: Record<string, unknown>, key: string | null): string | null => {
    const target =
      key ?? Object.entries(obj).find(([, v]) => v !== null && v !== undefined)?.[0] ?? null;
    if (target !== null) delete obj[target];
    return target;
  };
  if (Array.isArray(value)) {
    let deleted: string | null = null;
    const rows = value.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const copy = { ...(row as Record<string, unknown>) };
      deleted = maim(copy, deleted);
      return copy;
    });
    return { payload: rows, deleted };
  }
  if (value && typeof value === 'object') {
    const copy = { ...(value as Record<string, unknown>) };
    // Prefer maiming the rows inside an envelope ({ data: [...] }) over the envelope itself.
    const arrayKey = Object.keys(copy).find((k) => Array.isArray(copy[k]));
    if (arrayKey) {
      const inner = partial(copy[arrayKey]);
      if (inner.deleted) {
        copy[arrayKey] = inner.payload;
        return { payload: copy, deleted: `${arrayKey}[].${inner.deleted}` };
      }
    }
    return { payload: copy, deleted: maim(copy, null) };
  }
  return { payload: value, deleted: null };
}

function parseJson(text: string | null): unknown | undefined {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------------- */
/* Injection                                                                  */
/* ------------------------------------------------------------------------- */

const HTML_500 =
  '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>';

type Armed = {
  hits: () => number;
  /** Pending routes of a hang, aborted before the page closes. */
  release: () => Promise<void>;
  skip: string | null;
};

/** Routes the page's data calls: the targeted call (or every call, for the delay) gets the
 *  injection, everything else goes through untouched. */
async function arm(page: Page, injection: Injection, target: RecordedCall | null): Promise<Armed> {
  let hits = 0;
  const pending: Route[] = [];
  let skip: string | null = null;
  let body: string | null = null;
  if (injection === 'empty' || injection === 'partial') {
    const json = parseJson(target?.text ?? null);
    if (json === undefined) {
      skip = `recorded payload is not JSON (${target?.contentType ?? 'no content-type'})`;
    } else if (injection === 'empty') {
      body = JSON.stringify(emptied(json));
    } else {
      const maimed = partial(json);
      if (!maimed.deleted) skip = 'recorded payload has no key to delete';
      else body = JSON.stringify(maimed.payload);
    }
  }
  if (skip) return { hits: () => 0, release: async () => undefined, skip };

  const handler = async (route: Route, request: Request) => {
    const url = request.url();
    const method = request.method();
    if (!isDataCall(url, method)) return route.continue();
    if (target && keyOf(url, method) !== target.key) return route.continue();
    hits += 1;
    const origin = request.headers().origin ?? new URL(page.url()).origin;
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
    };
    switch (injection) {
      case 'http500-html':
        return route.fulfill({
          status: 500,
          headers: { ...cors, 'content-type': 'text/html' },
          body: HTML_500,
        });
      case 'hang':
        pending.push(route);
        return;
      case 'delay-2s':
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return route.continue();
      case 'empty':
      case 'partial':
        return route.fulfill({
          status: target?.status ?? 200,
          headers: { ...cors, 'content-type': target?.contentType ?? 'application/json' },
          body: body ?? '[]',
        });
    }
  };
  await page.route((url) => isDataCall(url.href, 'GET') || isDataCall(url.href, 'POST'), handler);
  return {
    hits: () => hits,
    release: async () => {
      await Promise.all(pending.map((route) => route.abort('timedout').catch(() => undefined)));
    },
    skip: null,
  };
}

/* ------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* ------------------------------------------------------------------------- */

const RAW_ERROR_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'ZodError', pattern: /ZodError/ },
  {
    name: 'zod issues',
    pattern: /"issues"\s*:|\bissues\s*\[|invalid_type|Required at|Expected \w+, received/,
  },
  { name: 'raw JSON', pattern: /\{\s*"[a-zA-Z_]+"\s*:/ },
  { name: 'stack trace', pattern: /\bat \S+ \(.*:\d+:\d+\)|\n\s+at [A-Za-z_$][\w$.]*\s*\(/ },
  { name: 'JS error class', pattern: /\b(TypeError|SyntaxError|ReferenceError|RangeError)\b/ },
  { name: 'JSON parse of HTML', pattern: /Unexpected token '?<|is not valid JSON|JSON\.parse/ },
  { name: 'HTML error page', pattern: /Bad Gateway|<!DOCTYPE|<html/i },
  { name: 'PostgREST code', pattern: /PGRST\d{3}|\b2[0-9A-Z]{4}\b: / },
  { name: '[object Object]', pattern: /\[object Object\]/ },
  { name: 'undefined/null in copy', pattern: /\b(undefined|NaN)\b/ },
];

/** An error state that names its cause reads as "<could not> <thing>", not a generic line. */
const HUMAN_VERB =
  /(couldn.t|could not|can.t|cannot|unable to|failed to|didn.t|not (load|reach|available)|unavailable|no (connection|internet)|timed out|took too long|went wrong while|error (loading|reaching|fetching))/i;
const HUMAN_NOUN =
  /\b(portfolios?|campaigns?|ad sets?|ads?|accounts?|dashboard|metrics?|data|insights?|actions?|decisions?|approvals?|queue|canvas|overview|home|jaina|optimizer|brands?|budgets?|results?|spend|renewals?|activity|automations?|creatives?|records?|conversations?|answer|report)\b/i;
const GENERIC_ONLY =
  /^\s*(something went wrong|an error occurred|error|oops!?|unexpected error)\.?\s*$/i;
/** Loading copy that must not outlive the settle: "Loading accounts..." is a state, not content. */
const LOADING_COPY = /\b(loading|cargando)\b[^.\n]{0,40}(\.\.\.|…)/i;
const RETRY_CONTROL =
  /retry|try again|reload|refresh|reintentar|intentar de nuevo|volver a intentar/i;

async function visibleText(page: Page): Promise<string> {
  return page
    .evaluate(() => (document.querySelector('main') ?? document.body).innerText ?? '')
    .catch(() => '');
}

async function visibleRetryControl(page: Page): Promise<string | null> {
  return page
    .evaluate((pattern) => {
      const re = new RegExp(pattern, 'i');
      const root = document.querySelector('main') ?? document.body;
      const controls = Array.from(root.querySelectorAll('button, a, [role="button"]'));
      for (const el of controls) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.trim();
        if (re.test(text)) return text.slice(0, 60);
      }
      return null;
    }, RETRY_CONTROL.source)
    .catch(() => null);
}

/** What the main region shows RIGHT NOW: loading markers, visible chars, named states. The
 *  same reading expectDefinedState settles on, taken once without waiting. */
async function snapshotState(
  page: Page,
): Promise<{ loading: number; chars: number; named: boolean }> {
  return page
    .evaluate(
      ({ loadingSelectors, pulseSelector, pulseMinWidth, emptySelectors, errorSelectors }) => {
        const root = document.querySelector('main') ?? document.body;
        const isVisible = (el: Element): boolean => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(el);
          return style.visibility !== 'hidden' && style.display !== 'none';
        };
        const count = (selectors: string[]) =>
          selectors.reduce(
            (n, s) => n + Array.from(root.querySelectorAll(s)).filter(isVisible).length,
            0,
          );
        const pulses = Array.from(root.querySelectorAll(pulseSelector)).filter(
          (el) =>
            isVisible(el) &&
            el.getBoundingClientRect().width >= pulseMinWidth &&
            (el.textContent ?? '').trim().length === 0,
        ).length;
        const statuses = Array.from(root.querySelectorAll('[role="status"]')).filter(
          (el) => isVisible(el) && /loading|cargando/i.test(el.textContent ?? ''),
        ).length;
        return {
          loading: count(loadingSelectors) + pulses + statuses,
          chars: ((root as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().length,
          named: count([...emptySelectors, ...errorSelectors]) > 0,
        };
      },
      {
        loadingSelectors: [...LOADING_SELECTORS],
        pulseSelector: PULSE_SELECTOR,
        pulseMinWidth: PULSE_MIN_WIDTH_PX,
        emptySelectors: [...EMPTY_STATE_SELECTORS],
        errorSelectors: [...ERROR_STATE_SELECTORS],
      },
    )
    .catch(() => ({ loading: 0, chars: 0, named: false }));
}

/** Waits up to `budgetMs` for loading copy ("Loading conversations…") to leave the visible
 *  text. Returns the copy still showing (null when it cleared) and how long it took. */
async function awaitLoadingCopy(
  page: Page,
  budgetMs: number,
): Promise<{ copy: string | null; afterMs: number }> {
  const started = Date.now();
  let copy: string | null = null;
  while (Date.now() - started < budgetMs) {
    const text = await visibleText(page);
    copy = text.match(LOADING_COPY)?.[0]?.trim() ?? null;
    if (!copy) break;
    await page.waitForTimeout(500);
  }
  return { copy, afterMs: Date.now() - started };
}

/** A page sitting at the shell floor may simply be late: a dynamic chunk or a slow list that
 *  carries no loading marker. Waits up to `budgetMs` for the visible text to clear
 *  `floorChars + MIN_CONTENT_CHARS` or for a named state. Returns the last reading. */
async function awaitBeyondFloor(
  page: Page,
  floorChars: number,
  budgetMs: number,
): Promise<{ chars: number; named: boolean; afterMs: number }> {
  const started = Date.now();
  let last = await snapshotState(page);
  while (
    !last.named &&
    last.chars <= floorChars + MIN_CONTENT_CHARS &&
    Date.now() - started < budgetMs
  ) {
    await page.waitForTimeout(500);
    last = await snapshotState(page);
  }
  return { chars: last.chars, named: last.named, afterMs: Date.now() - started };
}

const describeState = (state: DefinedState): string =>
  state.kind === 'content' ? `content (${state.chars} chars)` : `${state.kind}: ${state.name}`;

const slug = (label: string): string =>
  label
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 120);

type Broken = { invariant: string; evidence: string };

/** Grades one injected load: every invariant, one FAIL row per break, a PASS row otherwise. */
async function grade(
  page: Page,
  l1: L1Handle,
  surface: string,
  call: string,
  injection: Injection,
  settleMs: number,
  floorChars: number | null,
  cleanChars: number,
  extra: Broken[] = [],
): Promise<number> {
  const label = `${surface} × ${call} × ${injection}`;
  const gradeStartedAt = Date.now();
  const broken: Broken[] = [...extra];
  let state: DefinedState | null = null;
  try {
    state = await expectDefinedState(page, { label, settleMs });
  } catch (error) {
    broken.push({
      invariant: 'defined-state',
      evidence: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
    });
  }

  // The shell (title, tabs, brand chrome) lives inside <main> and is text on its own, so a
  // dead body still reads as "content" to a character count. The floor is what the shell
  // alone shows (every data call hung); a 'content' verdict that barely clears it is a blank
  // area with no name.
  const loading = await awaitLoadingCopy(
    page,
    Math.max(0, settleMs - (Date.now() - gradeStartedAt)),
  );
  // Read the page AFTER the loading copy had its chance to leave: a list that arrives late
  // must count as content, not as the blank it replaced.
  const text = await visibleText(page);
  const now = await snapshotState(page);
  if (state?.kind === 'content') {
    if (floorChars === null) {
      broken.push({
        invariant: 'defined-state',
        evidence: `every data call hung and the page reads as content (${now.chars} chars): the shell with a dead body, no named error or empty state within ${settleMs}ms`,
      });
    } else if (
      !loading.copy &&
      cleanChars > floorChars + MIN_CONTENT_CHARS &&
      now.chars <= floorChars + MIN_CONTENT_CHARS
    ) {
      // Only when the clean load had MORE than the shell: a surface whose resting state is
      // static copy (Jaina's welcome) is not blank for matching its own floor. And only after
      // the rest of the settle budget has passed with nothing arriving: a chunk or a list
      // that carries no loading marker reads as the floor until it lands.
      const late = await awaitBeyondFloor(
        page,
        floorChars,
        Math.max(0, settleMs - (Date.now() - gradeStartedAt)),
      );
      if (late.named) {
        state = await expectDefinedState(page, { label, settleMs: 5_000 }).catch(() => state);
      } else if (late.chars <= floorChars + MIN_CONTENT_CHARS) {
        broken.push({
          invariant: 'defined-state',
          evidence: `unnamed state: ${late.chars} visible chars after ${settleMs}ms where the shell alone shows ${floorChars} and the clean load showed ${cleanChars} — no surface content, no named empty state, no named error state`,
        });
      } else {
        notes.push(
          `${label}: content arrived ${late.afterMs}ms after the page first read as settled (${late.chars} chars) — no loading marker covered the wait`,
        );
      }
    }
  }
  if (loading.copy && state?.kind !== 'error') {
    broken.push({
      invariant: 'defined-state',
      evidence: `still loading after ${settleMs}ms: "${loading.copy}" in the visible text`,
    });
  }
  for (const { name, pattern } of RAW_ERROR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const at = Math.max(0, (match.index ?? 0) - 40);
      broken.push({
        invariant: 'raw-error-text',
        evidence: `${name}: "…${text.slice(at, at + 120).replace(/\s+/g, ' ')}…"`,
      });
      break;
    }
  }

  const pageErrors = l1.report().consoleErrors.filter((line) => line.startsWith('pageerror'));
  if (pageErrors.length > 0) {
    broken.push({
      invariant: 'pageerror',
      evidence: `${pageErrors[0]}${pageErrors.length > 1 ? ` (+${pageErrors.length - 1} more)` : ''}`,
    });
  }

  if (state?.kind === 'error') {
    const errorText = state.name.replace(/^[^:]*:\s*/, '');
    const generic =
      GENERIC_ONLY.test(errorText) || !HUMAN_VERB.test(errorText) || !HUMAN_NOUN.test(errorText);
    if (generic) {
      broken.push({
        invariant: 'error-names-cause',
        evidence: `error state reads "${errorText.slice(0, 100)}" — no human cause (what failed, in words)`,
      });
    }
    if (injection === 'http500-html' || injection === 'hang') {
      const retry = await visibleRetryControl(page);
      if (!retry) {
        broken.push({
          invariant: 'retry-control',
          evidence: `error state "${errorText.slice(0, 60)}" offers no retry / try again control`,
        });
      }
    }
  }

  const detail = state ? describeState(state) : 'no defined state';
  if (broken.length === 0) {
    recorder.record(label, 'PASS', detail);
  } else {
    for (const b of broken) {
      recorder.record(`${label} ${b.invariant}`, 'FAIL', b.evidence);
      findings.push({ surface, call, injection, invariant: b.invariant, evidence: b.evidence });
    }
    mkdirSync(SHOTS_DIR, { recursive: true });
    await page
      .screenshot({ path: resolve(SHOTS_DIR, `${slug(label)}.png`), fullPage: true })
      .catch(() => undefined);
  }
  if (state?.kind === 'error') notes.push(`${label}: error state — ${state.name.slice(0, 160)}`);
  expect
    .soft(broken, broken.map((b) => `[${label}] ${b.invariant}: ${b.evidence}`).join('\n'))
    .toEqual([]);
  return now.chars;
}

/* ------------------------------------------------------------------------- */
/* The lane                                                                   */
/* ------------------------------------------------------------------------- */

/** The one surface whose run also drives the shell calls. */
const SHELL_DRIVEN_ON = 'Optimizer Overview';

const SURFACES: readonly Surface[] = [
  {
    name: 'Optimizer Overview',
    path: '/scale?tab=performance&optimizerView=overview',
    optimizer: true,
  },
  { name: 'Portfolios', path: '/scale?tab=performance&optimizerView=portfolios', optimizer: true },
  {
    name: 'Portfolio page',
    path: '/scale?tab=performance&optimizerView=portfolios&portfolio=:portfolio',
    optimizer: true,
  },
  { name: 'Actions', path: '/scale?tab=performance&optimizerView=actions', optimizer: true },
  { name: 'Jaina', path: '/scale?tab=jaina', optimizer: false },
  { name: 'Campaigns', path: '/scale?tab=campaigns', optimizer: false },
  { name: 'Dashboard', path: '/scale?tab=dashboard', optimizer: false },
  { name: 'Approvals', path: '/scale/approvals', optimizer: false },
  { name: 'Campaign Canvas', path: '/scale/campaign-canvas', optimizer: false },
  { name: 'Home Overview', path: '/dashboard?view=overview', optimizer: false },
];

async function cleanLoad(
  context: BrowserContext,
  surface: Surface,
  path: string,
): Promise<{ calls: RecordedCall[]; chars: number }> {
  const page = await context.newPage();
  const l1 = attachL1(page);
  const recorded = recordCalls(page);
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    try {
      const state = await expectDefinedState(page, {
        label: `${surface.name} clean`,
        settleMs: CLEAN_SETTLE_MS,
      });
      recorder.record(`${surface.name} × clean load`, 'PASS', describeState(state));
    } catch (error) {
      recorder.record(
        `${surface.name} × clean load`,
        'FAIL',
        error instanceof Error ? error.message.split('\n')[0] : String(error),
      );
    }
    const loading = await awaitLoadingCopy(page, CLEAN_SETTLE_MS);
    if (loading.copy) {
      recorder.record(
        `${surface.name} × clean load loading-copy`,
        'FAIL',
        `"${loading.copy}" still showing after ${CLEAN_SETTLE_MS}ms on a clean load`,
      );
    } else if (loading.afterMs > LOADING_COPY_GRACE_MS) {
      recorder.record(
        `${surface.name} × clean load loading-copy`,
        'FAIL',
        `loading copy outlived the loaded state by ${loading.afterMs}ms on a clean load (rule 7: a loading state is brief and leads to a named state)`,
      );
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    const calls = recorded.calls();
    const chars = (await snapshotState(page)).chars;
    notes.push(
      `${surface.name} data calls (${calls.length}): ${calls.map((c) => c.key).join(' | ') || 'none'}`,
    );
    return { calls, chars };
  } finally {
    l1.detach();
    await page.close().catch(() => undefined);
  }
}

async function injectedLoad(
  context: BrowserContext,
  surface: Surface,
  path: string,
  injection: Injection,
  target: RecordedCall | null,
  floorChars: number | null,
  cleanChars: number,
): Promise<number> {
  const callLabel = target?.key ?? 'every data call';
  const page = await context.newPage();
  const l1 = attachL1(page);
  const armed = await arm(page, injection, target);
  try {
    if (armed.skip) {
      recorder.record(`${surface.name} × ${callLabel} × ${injection}`, 'SKIP', armed.skip);
      return floorChars ?? 0;
    }
    const extra: Broken[] = [];
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    if (injection === 'delay-2s') {
      // Rule 7's clock: within 1.5 s the page shows a loading state, content or a named state.
      const started = Date.now();
      let shown = false;
      let last = { loading: 0, chars: 0, named: false };
      while (Date.now() - started < LOADING_DEADLINE_MS) {
        last = await snapshotState(page);
        if (last.loading > 0 || last.chars >= MIN_CONTENT_CHARS || last.named) {
          shown = true;
          break;
        }
        await page.waitForTimeout(100);
      }
      if (!shown) {
        extra.push({
          invariant: 'loading-shown',
          evidence: `blank for the first ${LOADING_DEADLINE_MS}ms of a ${DELAY_MS}ms delay (${last.chars} chars, ${last.loading} loading markers)`,
        });
      }
    }

    const settle =
      injection === 'hang'
        ? HANG_SETTLE_MS
        : injection === 'delay-2s'
          ? DELAY_SETTLE_MS
          : INJECTED_SETTLE_MS;
    const chars = await grade(
      page,
      l1,
      surface.name,
      callLabel,
      injection,
      settle,
      floorChars,
      cleanChars,
      extra,
    );
    if (target && armed.hits() === 0) {
      recorder.record(
        `${surface.name} × ${callLabel} × ${injection} injected`,
        'SKIP',
        'the call was not made on this load — injection never fired',
      );
    }
    return chars;
  } finally {
    await armed.release();
    l1.detach();
    await page.close().catch(() => undefined);
  }
}

async function driveSurface(context: BrowserContext, surface: Surface): Promise<void> {
  const path = surface.path.replace(':portfolio', portfolioId ?? '');
  if (surface.path.includes(':portfolio') && !portfolioId) {
    recorder.record(`${surface.name} × clean load`, 'SKIP', 'no portfolio id to deep-link');
    return;
  }
  const { calls, chars: cleanChars } = await cleanLoad(context, surface, path);
  const own = calls.filter((call) => !isShellCall(call));
  const shell = calls.filter(isShellCall);
  const driven = [...own.slice(0, MAX_CALLS), ...(surface.name === SHELL_DRIVEN_ON ? shell : [])];
  if (own.length > MAX_CALLS) {
    notes.push(
      `${surface.name}: ${own.length - MAX_CALLS} further own data call(s) listed, not driven (PERFPLUS_FAILURES_MAX_CALLS=${MAX_CALLS})`,
    );
  }
  if (shell.length > 0 && surface.name !== SHELL_DRIVEN_ON) {
    notes.push(`${surface.name}: ${shell.length} shell call(s) driven on ${SHELL_DRIVEN_ON} only`);
  }
  // Every data call hung: what the shell shows on its own, graded (a hang must still end in
  // a named state) and kept as the floor the per-call verdicts are read against.
  const floorChars = await test.step(`${surface.name} × every data call × hang`, () =>
    injectedLoad(context, surface, path, 'hang', null, null, cleanChars));
  notes.push(`${surface.name}: shell floor ${floorChars} chars (every data call hung)`);
  for (const call of driven) {
    for (const injection of PER_CALL_INJECTIONS) {
      await test.step(`${surface.name} × ${call.key} × ${injection}`, () =>
        injectedLoad(context, surface, path, injection, call, floorChars, cleanChars));
    }
  }
  await test.step(`${surface.name} × delay-2s`, () =>
    injectedLoad(context, surface, path, 'delay-2s', null, floorChars, cleanChars));
}

test.describe('Performance+ P2.5 — failure injection on every surface, Easy Fit owner', () => {
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
    optimizerBrand = await resolveOptimizerBrand();
    await selectBrand(EASYFIT_BRAND_ID);
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    printEnvelopeOnce();
  });

  test('every surface holds a defined, human state under 500 / hang / delay / empty / partial', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(150 * 60_000);
    const context = await browser.newContext({ storageState, viewport: { ...VIEWPORT } });
    try {
      let pinned = EASYFIT_BRAND_ID;
      for (const surface of SURFACES) {
        if (ONLY_SURFACES && !ONLY_SURFACES.includes(surface.name)) continue;
        const wanted = surface.optimizer ? optimizerBrand : EASYFIT_BRAND_ID;
        if (wanted !== pinned) {
          await selectBrand(wanted);
          pinned = wanted;
        }
        await test.step(surface.name, () => driveSurface(context, surface));
      }
      if (pinned !== EASYFIT_BRAND_ID) await selectBrand(EASYFIT_BRAND_ID);
    } finally {
      await context.close().catch((error: unknown) => {
        notes.push(
          `context.close failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      });
      printEnvelopeOnce();
    }
  });
});
