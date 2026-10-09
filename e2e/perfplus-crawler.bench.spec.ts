import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  type CrawlFailRow,
  createRng,
  elementSignature,
  type FenceSubject,
  fenceVerdict,
  formatFailRow,
  hashSeed,
  isJainaComposer,
  l1Signature,
  parseBaselineSignatures,
  pickByNovelty,
  type Rng,
  TYPED_WORDS,
  visualSignature,
} from './support/crawlerCore';
import {
  attachL1,
  clickExpectingEffect,
  expectDefinedState,
  isOwnOrigin,
  type L1Handle,
  l1Failures,
} from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';
import {
  auditVisual,
  installVisualProbes,
  resetLayoutShift,
  resolveAxeScript,
  seedTheme,
  type VisualTheme,
} from './support/visualInvariants';

// ---------------------------------------------------------------------------
// perfplus:crawler:bench — the Performance+ campaign's seeded chaos crawler (P2.1).
//
// A real Chrome drives the real Frontend as the Easy Fit owner against production Supabase and
// the Backend the Frontend `.env` names. For each surface, N seeded traversals: pick a visible
// interactive element weighted by novelty (signatures never acted on first), act on it (click,
// type a short seeded string, choose an option, press Escape), wait for settle, read the L1
// invariants (e2e/support/l1Invariants.ts) and — at the end of the traversal and every few
// steps — the L1V detector (e2e/support/visualInvariants.ts). Depth ≤ 12 per traversal;
// viewport (375 / 1280) and theme (light / dark) rotate by seed.
//
// Dedupe: the P1.3 visual-matrix read already named the 22 px shared icon button, the 4.41:1
// captions and the Overview's CLS by class (artifacts/perfplus-campaign/baseline/
// visual-matrix.txt). Its `rule|selector` signatures are KNOWN and counted, never re-reported;
// a FAIL row is a NEW signature — one per surface × viewport × theme × seed × step × invariant
// × selector-signature, with the action path that led there and a screenshot in
// e2e/__screenshots__/perfplus-crawler/<seed>-<n>.png. Known signatures and in-run repeats
// are counted in the coverage notes so the envelope still says how often they fired.
//
// ── THE FENCE (write-safety) ── Nothing here approves, applies, pauses, resumes, activates,
// archives, deletes, removes, deploys, publishes, reverts, runs, saves, submits, confirms,
// connects, disconnects, sends, enrolls, unenrolls, creates a portfolio, signs out, switches
// brand, buys, exports or downloads (crawlerCore.ts FENCE_NAME_PATTERN), nor presses a submit
// button inside a form, nor a confirming button inside a dialog, nor leaves the origin or the
// Performance+ surfaces. Typing into the Jaina composer is allowed; Enter is never pressed
// anywhere. Every fenced element is logged by name per surface so the fence is auditable. The
// single write is the bench user's active-brand preference (pinned per surface, restored at
// the end) — the same row the in-app brand switcher writes, written the same way.
//
// ── REPLAY ── PERFPLUS_CRAWL_SEED=<seed> PERFPLUS_CRAWL_ONLY=<surface> [PERFPLUS_CRAWL_RUN=<n>]
// reproduces one surface's traversals (or one traversal): each traversal's PRNG is seeded from
// (seed, surface, n), so it does not depend on what ran before it.
//
// ── ONE TEST, MANY STEPS ── as in the L1 lane: one test, SOFT assertions, one envelope.
//
// Usage: cd Continuum-Frontend && bun run perfplus:crawler:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit, the agency row — the campaign's seeded brand (00-context.md, "Auth para tests"). */
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The other Easy Fit row: it owns the active portfolios on the same ad account. The
 *  Optimizer surfaces render on the first candidate that owns a portfolio. */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OPTIMIZER_BRAND_CANDIDATES = [EASYFIT_BRAND_ID, EASYFIT_LEDGER_BRAND_ID] as const;

const SEED = Number.parseInt(process.env.PERFPLUS_CRAWL_SEED ?? '20261009', 10);
const RUNS = Number.parseInt(process.env.PERFPLUS_CRAWL_RUNS ?? '25', 10);
/** The ceiling of a traversal; a traversal's actual depth is seeded in [MIN_DEPTH, MAX_DEPTH]. */
const MAX_DEPTH = Math.min(12, Number.parseInt(process.env.PERFPLUS_CRAWL_DEPTH ?? '12', 10));
const MIN_DEPTH = Math.min(4, MAX_DEPTH);
/** Wall-clock per surface. 12 surfaces × 110 s ≈ 22 min plus session setup: the default run
 *  ends under 25 minutes whatever the dev server's compile times do. Traversals the budget
 *  did not reach are SKIP by count, never silently missing. */
const SURFACE_BUDGET_MS = Number.parseInt(
  process.env.PERFPLUS_CRAWL_SURFACE_BUDGET_MS ?? '110000',
  10,
);
/** The L1V detector (axe included) costs ~3 s a read; the L1 report costs nothing. The
 *  detector runs after the landing, every AUDIT_EVERY actions, and at the end of the
 *  traversal — so at the default it reads the landing, the end, and one point mid-way on the
 *  deepest traversals. PERFPLUS_CRAWL_AUDIT_EVERY=1 reads after every action. */
const AUDIT_EVERY = Math.max(1, Number.parseInt(process.env.PERFPLUS_CRAWL_AUDIT_EVERY ?? '6', 10));
const ONLY_SURFACE = process.env.PERFPLUS_CRAWL_ONLY?.trim().toLowerCase() || null;
const ONLY_RUN = process.env.PERFPLUS_CRAWL_RUN
  ? Number.parseInt(process.env.PERFPLUS_CRAWL_RUN, 10)
  : null;

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 900 },
] as const;
const THEMES: readonly VisualTheme[] = ['light', 'dark'];

type Surface = {
  name: string;
  /** Resolved late: the portfolio page needs the first portfolio's id. */
  path: () => string;
  brand: 'seeded' | 'optimizer';
};

let portfolioId: string | null = null;

/** Priority order per 02-phases.md P2.1: Approvals, billing (the section and the landing the
 *  ProductGate redirects a brand without the product to), Optimizer Actions, Campaign Canvas,
 *  then the rest. The Optimizer views are deep-linked through `optimizerView`
 *  (useOptimizerUrlState.ts) so every traversal starts on the view it is named after. */
const SURFACES: readonly Surface[] = [
  { name: 'Approvals', path: () => '/scale/approvals', brand: 'seeded' },
  { name: 'Billing', path: () => '/settings?section=billing', brand: 'seeded' },
  {
    name: 'Billing gate',
    path: () => '/settings?section=billing&need=scale&from=%2Fscale',
    brand: 'seeded',
  },
  {
    name: 'Optimizer Actions',
    path: () => '/scale?tab=performance&optimizerView=actions',
    brand: 'optimizer',
  },
  { name: 'Campaign Canvas', path: () => '/scale/campaign-canvas', brand: 'seeded' },
  { name: 'Optimizer Overview', path: () => '/scale?tab=performance', brand: 'optimizer' },
  {
    name: 'Portfolios',
    path: () => '/scale?tab=performance&optimizerView=portfolios',
    brand: 'optimizer',
  },
  {
    name: 'Portfolio page',
    path: () =>
      `/scale?tab=performance&optimizerView=portfolios&portfolio=${portfolioId ?? 'none'}`,
    brand: 'optimizer',
  },
  { name: 'Jaina', path: () => '/scale?tab=jaina', brand: 'seeded' },
  { name: 'Campaigns', path: () => '/scale?tab=campaigns', brand: 'seeded' },
  { name: 'Dashboard', path: () => '/scale?tab=dashboard', brand: 'seeded' },
  { name: 'Home', path: () => '/dashboard?view=overview', brand: 'seeded' },
];

const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-crawler');
const BASELINE_PATH = resolve(
  __dirname,
  '../../artifacts/perfplus-campaign/baseline/visual-matrix.txt',
);
/** How long a landing may keep loading before `defined-state` calls it undefined. */
const LANDING_SETTLE_MS = 60_000;
/** After an action: how long the page may show loading markers before its state is read. */
const STEP_SETTLE_MS = 6_000;
const QUIET_MS = 1_500;
/** Playwright's own click rejection (covered, detached, never stable) is read as this. */
const UNREACHABLE = 'click-unreachable';

/** Everything a user can act on, in the order the fence and the picker see it. */
const INTERACTIVE_SELECTOR =
  'button, a[href], [role="tab"], [role="button"], [role="menuitem"], ' +
  '[role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], ' +
  '[role="checkbox"], [role="radio"], [role="combobox"], input:not([type="hidden"]), select, ' +
  'textarea, [contenteditable="true"], summary';

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:crawler:bench', notes);
const failRows: CrawlFailRow[] = [];

type SurfaceCoverage = {
  traversalsRun: number;
  traversalsSkipped: number;
  steps: number;
  seen: Set<string>;
  clicked: Set<string>;
  clicks: number;
  fenced: Map<string, string>;
  knownVisualHits: number;
  repeatVisualHits: number;
  repeatL1Hits: number;
  newRows: number;
  audits: number;
  elapsedMs: number;
};
const coverage = new Map<string, SurfaceCoverage>();

/** Signatures (visual `rule|selector`, L1 `invariant|evidence`) already reported this run,
 *  across surfaces: a shared component's break is one row, not one per surface. */
const reportedSignatures = new Set<string>();
let knownSignatures = new Set<string>();

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
let optimizerBrand: string = EASYFIT_BRAND_ID;
let currentBrand: string | null = null;
let fatal: string | null = null;

let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  const lines: string[] = [];
  if (failRows.length > 0) {
    const byInvariant = new Map<string, CrawlFailRow[]>();
    for (const row of failRows) {
      const rows = byInvariant.get(row.invariant) ?? [];
      rows.push(row);
      byInvariant.set(row.invariant, rows);
    }
    lines.push(
      '[perfplus-crawler] FAIL ROWS by invariant (surface × viewport × theme × seed × run × step × invariant × signature — path — screenshot):',
    );
    for (const [invariant, rows] of byInvariant) {
      lines.push(`  ${invariant}: ${rows.length}`);
      for (const row of rows) lines.push(`    - ${formatFailRow(row)}`);
    }
  }
  lines.push(
    '[perfplus-crawler] COVERAGE (surface | traversals run/skipped | steps | signatures seen | clicked (distinct) | fenced distinct | known visual hits | repeat visual | repeat L1 | new rows | visual audits | avg s/traversal):',
  );
  for (const [surface, c] of coverage) {
    lines.push(
      `  ${surface} | ${c.traversalsRun}/${c.traversalsSkipped} | ${c.steps} | ${c.seen.size} | ${c.clicks} (${c.clicked.size}) | ${c.fenced.size} | ${c.knownVisualHits} | ${c.repeatVisualHits} | ${c.repeatL1Hits} | ${c.newRows} | ${c.audits} | ${c.traversalsRun > 0 ? (c.elapsedMs / c.traversalsRun / 1000).toFixed(1) : '-'}`,
    );
  }
  lines.push('[perfplus-crawler] ACTED ON by surface (distinct signatures):');
  for (const [surface, c] of coverage) {
    if (c.clicked.size === 0) continue;
    lines.push(`  ${surface}: ${[...c.clicked].sort().join(' | ')}`);
  }
  lines.push('[perfplus-crawler] FENCED by surface (signature — reason):');
  for (const [surface, c] of coverage) {
    if (c.fenced.size === 0) continue;
    lines.push(`  ${surface}:`);
    for (const [signature, reason] of c.fenced) lines.push(`    - ${signature} — ${reason}`);
  }
  console.log(lines.join('\n'));
  recorder.print();
}

/* ------------------------------------------------------------------------- */
/* Session and brand — as the L1 lane does it                                 */
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
  if (!decoded.sub) throw new Error('[perfplus-crawler] access token carries no sub claim');
  return decoded.sub;
}

async function listPortfolios(brandId: string): Promise<{ id: string }[]> {
  const { data, error } = await memberClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error)
    throw new Error(`[perfplus-crawler] optimizer_list_portfolios(${brandId}): ${error.message}`);
  return Array.isArray(data)
    ? data.filter((row): row is { id: string } => typeof row?.id === 'string')
    : [];
}

async function resolveOptimizerBrand(): Promise<string> {
  const seen: string[] = [];
  for (const brandId of OPTIMIZER_BRAND_CANDIDATES) {
    const rows = await listPortfolios(brandId);
    seen.push(`${brandId.slice(0, 8)}=${rows.length}`);
    if (rows.length > 0) {
      portfolioId = rows[0].id;
      notes.push(
        `Optimizer brand: ${brandId} (${rows.length} portfolios; first ${portfolioId}; candidates ${seen.join(', ')})`,
      );
      return brandId;
    }
  }
  notes.push(
    `Optimizer brand: no candidate owns a portfolio (${seen.join(', ')}) — the portfolio page is unexercised`,
  );
  return EASYFIT_BRAND_ID;
}

/** Pins the brand the pages will render, the way the in-app brand switcher does, read back
 *  through the page's own resolver so a switch that did not take fails here by name. */
async function selectBrand(brandId: string): Promise<void> {
  if (currentBrand === brandId) return;
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[perfplus-crawler] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
  currentBrand = brandId;
}

/* ------------------------------------------------------------------------- */
/* The page: candidates, the fence, the action                                */
/* ------------------------------------------------------------------------- */

type PageSubject = FenceSubject & {
  cssPath: string;
  contentEditable: boolean;
  signature: string;
};

/** Reads every visible, enabled interactive element with what the fence and the picker need:
 *  its accessible name, test id, href, form/dialog ancestry and a unique nth-child path. */
function collectCandidates(page: Page): Promise<PageSubject[]> {
  return page
    .evaluate((selector) => {
      const isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        if (Number.parseFloat(style.opacity) === 0) return false;
        return !el.closest('[aria-hidden="true"]');
      };
      const isDisabled = (el: Element): boolean =>
        (el as HTMLButtonElement).disabled === true ||
        el.getAttribute('aria-disabled') === 'true' ||
        (el as HTMLInputElement).readOnly === true;
      const text = (el: Element | null): string =>
        (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const labelledBy = (el: Element): string => {
        const ids = el.getAttribute('aria-labelledby');
        if (!ids) return '';
        return ids
          .split(/\s+/)
          .map((id) => text(document.getElementById(id)))
          .join(' ')
          .trim();
      };
      const nameOf = (el: Element): string => {
        const aria = el.getAttribute('aria-label')?.trim();
        if (aria) return aria;
        const byRef = labelledBy(el);
        if (byRef) return byRef;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement
        ) {
          const own = el.id
            ? text(document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
            : '';
          const wrapped = text(el.closest('label'));
          if (own || wrapped) return own || wrapped;
          if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'button')) {
            return el.value;
          }
        }
        const content = text(el);
        if (content) return content;
        const title = el.getAttribute('title')?.trim();
        if (title) return title;
        const img = el.querySelector('img[alt], svg[aria-label]');
        return img?.getAttribute('alt') ?? img?.getAttribute('aria-label') ?? '';
      };
      const cssPath = (el: Element): string => {
        const parts: string[] = [];
        let node: Element | null = el;
        while (node && node !== document.documentElement) {
          const parent: Element | null = node.parentElement;
          if (!parent) break;
          const index = Array.from(parent.children).indexOf(node) + 1;
          parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
          node = parent;
        }
        return `html > ${parts.join(' > ')}`;
      };
      const out: Array<Record<string, unknown>> = [];
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (!isVisible(el) || isDisabled(el)) continue;
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type')?.toLowerCase() ?? null;
        const path = cssPath(el);
        if (document.querySelector(path) !== el) continue;
        const subject = {
          tag,
          role: el.getAttribute('role'),
          type,
          name: nameOf(el).slice(0, 120),
          testId: el.getAttribute('data-testid'),
          href: tag === 'a' ? el.getAttribute('href') : null,
          target: el.getAttribute('target'),
          download: el.hasAttribute('download'),
          inForm: el.closest('form') !== null,
          inDialog: el.closest('[role="dialog"], [role="alertdialog"]') !== null,
          placeholder: el.getAttribute('placeholder') ?? el.getAttribute('aria-placeholder'),
          cssPath: path,
          contentEditable: (el as HTMLElement).isContentEditable,
        };
        out.push(subject);
      }
      return out as unknown as Omit<PageSubject, 'signature'>[];
    }, INTERACTIVE_SELECTOR)
    .then((subjects) => subjects.map((s) => ({ ...s, signature: elementSignature(s) })));
}

type StepAction =
  | { kind: 'click'; subject: PageSubject }
  | { kind: 'type'; subject: PageSubject; text: string }
  | { kind: 'select'; subject: PageSubject }
  | { kind: 'escape' };

const isTypeTarget = (s: PageSubject): boolean =>
  s.tag === 'textarea' ||
  s.contentEditable ||
  (s.tag === 'input' &&
    (s.type === null || ['text', 'search', 'email', 'url', 'tel', 'number'].includes(s.type)));

function chooseAction(rng: Rng, subject: PageSubject): StepAction {
  if (subject.tag === 'select') return { kind: 'select', subject };
  if (isTypeTarget(subject)) {
    return { kind: 'type', subject, text: rng.pick(TYPED_WORDS) };
  }
  return { kind: 'click', subject };
}

const describeAction = (action: StepAction): string => {
  switch (action.kind) {
    case 'escape':
      return 'key:Escape';
    case 'type':
      return `${action.subject.signature} ← "${action.text}"`;
    case 'select':
      return `${action.subject.signature} ⇅`;
    default:
      return action.subject.signature;
  }
};

/** Performs the action; returns the invariant it broke, if any. The Jaina composer and every
 *  other field are typed into without Enter; a select picks a seeded option; a click must
 *  show an effect (clickExpectingEffect) and must land (Playwright's own rejection). */
async function act(
  page: Page,
  rng: Rng,
  action: StepAction,
): Promise<{ invariant: string; evidence: string } | null> {
  if (action.kind === 'escape') {
    await page.keyboard.press('Escape');
    return null;
  }
  const locator = page.locator(action.subject.cssPath).first();
  const label = action.subject.signature;
  try {
    if (action.kind === 'type') {
      if (action.subject.contentEditable) {
        await locator.click();
        await page.keyboard.type(action.text, { delay: 10 });
      } else {
        await locator.fill(action.text);
      }
      return null;
    }
    if (action.kind === 'select') {
      const count = await locator.locator('option').count();
      if (count === 0) return null;
      await locator.selectOption({ index: rng.int(count) });
      return null;
    }
    await clickExpectingEffect(locator, { label });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    if (message.startsWith('click-effect:')) {
      return { invariant: 'click-effect', evidence: message };
    }
    return { invariant: UNREACHABLE, evidence: `"${label}": ${message.slice(0, 200)}` };
  }
}

/* ------------------------------------------------------------------------- */
/* Reading: L1 after every step, L1V on cadence                               */
/* ------------------------------------------------------------------------- */

type TraversalKey = {
  surface: string;
  viewport: number;
  theme: VisualTheme;
  run: number;
};

const axeScriptPath = resolveAxeScript();

async function currentTheme(page: Page, fallback: VisualTheme): Promise<VisualTheme> {
  const theme = await page
    .evaluate(() => document.documentElement.getAttribute('data-theme'))
    .catch(() => null);
  return theme === 'dark' || theme === 'light' ? theme : fallback;
}

function fileRow(
  page: Page,
  key: TraversalKey,
  step: number,
  invariant: string,
  signature: string,
  detail: string,
  path: readonly string[],
): Promise<void> {
  const cov = coverage.get(key.surface);
  if (cov) cov.newRows += 1;
  reportedSignatures.add(signature);
  const index = failRows.length + 1;
  const screenshot = `${SEED}-${index}.png`;
  const row: CrawlFailRow = {
    surface: key.surface,
    viewport: key.viewport,
    theme: key.theme,
    seed: SEED,
    run: key.run,
    step,
    invariant,
    signature,
    detail: detail.slice(0, 300),
    path: [...path],
    screenshot,
  };
  failRows.push(row);
  recorder.record(
    `${key.surface} @${key.viewport} ${key.theme} seed=${SEED} run=${key.run} step=${step} ${invariant} ${signature.slice(0, 120)}`,
    'FAIL',
    `${row.detail} — path: ${row.path.join(' → ') || '(landing)'}`,
  );
  mkdirSync(SHOTS_DIR, { recursive: true });
  return page
    .screenshot({ path: resolve(SHOTS_DIR, screenshot), fullPage: true })
    .then(() => undefined)
    .catch(() => undefined);
}

/** The L1 report since the last reset, plus the state the page settled in. A repeat of a
 *  signature already filed is counted, not re-filed. */
async function readL1(
  page: Page,
  l1: L1Handle,
  key: TraversalKey,
  step: number,
  path: readonly string[],
  settleMs: number,
  extra: readonly { invariant: string; evidence: string }[],
): Promise<void> {
  const cov = coverage.get(key.surface);
  const broken: { invariant: string; evidence: string }[] = [...extra];
  try {
    const state = await expectDefinedState(page, {
      label: `${key.surface} run ${key.run} step ${step}`,
      settleMs,
    });
    if (state.kind === 'error') {
      notes.push(
        `${key.surface} @${key.viewport} ${key.theme} run=${key.run} step=${step}: named error state — ${state.name} (path ${path.join(' → ') || 'landing'})`,
      );
    }
  } catch (error) {
    broken.push({
      invariant: 'defined-state',
      evidence: error instanceof Error ? error.message.split('\n')[0] : String(error),
    });
  }
  await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
  broken.push(...l1Failures(l1.report()));
  for (const b of broken) {
    const signature = l1Signature(b.invariant, b.evidence);
    if (reportedSignatures.has(signature)) {
      if (cov) cov.repeatL1Hits += 1;
      continue;
    }
    await fileRow(page, key, step, b.invariant, signature, b.evidence, path);
  }
}

async function readVisual(
  page: Page,
  key: TraversalKey,
  step: number,
  path: readonly string[],
): Promise<void> {
  const cov = coverage.get(key.surface);
  if (cov) cov.audits += 1;
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  let violations: { rule: string; selector: string; detail: string }[];
  try {
    const report = await auditVisual(
      page,
      { surface: key.surface, viewport: key.viewport, theme: key.theme, state: 'loaded' },
      { axeScriptPath },
    );
    violations = report.violations;
  } catch (error) {
    notes.push(
      `${key.surface} @${key.viewport} ${key.theme} run=${key.run} step=${step}: detector did not run — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
    return;
  }
  const filedThisAudit = new Set<string>();
  for (const v of violations) {
    const signature = visualSignature(v.rule, v.selector, v.detail);
    if (knownSignatures.has(signature)) {
      if (cov) cov.knownVisualHits += 1;
      continue;
    }
    if (reportedSignatures.has(signature) || filedThisAudit.has(signature)) {
      if (cov) cov.repeatVisualHits += 1;
      continue;
    }
    filedThisAudit.add(signature);
    await fileRow(page, key, step, v.rule, signature, `${v.selector}: ${v.detail}`, path);
  }
  await resetLayoutShift(page);
}

/* ------------------------------------------------------------------------- */
/* One traversal                                                              */
/* ------------------------------------------------------------------------- */

const contexts = new Map<string, BrowserContext>();

const WRITE_METHODS: ReadonlySet<string> = new Set(['DELETE', 'PUT', 'PATCH']);
/** Paths that create or change money objects whatever the method (billing-api, Stripe). */
const WRITE_PATH_PATTERN =
  /\/checkout(-sessions)?(\/|$)|\/credits\/checkout|\/overage(\/|$)|\/promo(\/|$)|\/runs\/[^/]+\/cancel(\/|$)/;
/** Requests the request-level fence aborted, consumed by the traversal that caused them. */
const guardHits: string[] = [];

async function contextFor(
  browser: Browser,
  viewport: { width: number; height: number },
  theme: VisualTheme,
): Promise<BrowserContext> {
  const id = `${viewport.width}-${theme}`;
  const existing = contexts.get(id);
  if (existing) return existing;
  const context = await browser.newContext({ storageState, viewport });
  await installVisualProbes(context);
  await seedTheme(context, theme);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL as string).origin;
  // The fence in depth: a document navigation to another origin is aborted even if an element
  // slipped past the name fence (window.open, location.assign); popups are closed unread.
  // The request-level fence: a write the name fence let through is aborted at the wire and
  // filed as a `write-guard` row, so a fence miss is a visible finding, never a silent write.
  // Reads never use DELETE / PUT / PATCH on our origins; the checkout and credit-checkout
  // paths of billing-api are POSTs that create live Stripe objects (2026-10-09: "Choose
  // Performance Plus" created two live checkout sessions before this guard existed).
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (
      request.isNavigationRequest() &&
      request.resourceType() === 'document' &&
      new URL(url).origin !== origin
    ) {
      notes.push(`off-origin navigation blocked: ${url.slice(0, 120)}`);
      await route.abort('blockedbyclient');
      return;
    }
    const own = isOwnOrigin(url, origin);
    const writeMethod = WRITE_METHODS.has(request.method());
    const writePath = WRITE_PATH_PATTERN.test(new URL(url).pathname);
    if (own && (writeMethod || writePath)) {
      guardHits.push(`${request.method()} ${url.slice(0, 160)}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  contexts.set(id, context);
  return context;
}

async function traverse(browser: Browser, surface: Surface, run: number): Promise<void> {
  const rng = createRng(hashSeed(SEED, surface.name, run));
  const viewport = rng.pick(VIEWPORTS);
  const seededTheme = rng.pick(THEMES);
  const depth = MIN_DEPTH + rng.int(MAX_DEPTH - MIN_DEPTH + 1);
  const cov = coverage.get(surface.name) as SurfaceCoverage;
  const context = await contextFor(browser, viewport, seededTheme);
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => undefined));
  // A popup (window.open, target=_blank that slipped the fence) is closed unread. On the PAGE,
  // not the context's `page` event: that one fires for the crawler's own pages too.
  page.on('popup', (popup) => {
    notes.push(`popup closed: ${popup.url().slice(0, 120)}`);
    popup.close().catch(() => undefined);
  });
  const l1 = attachL1(page);
  const key: TraversalKey = {
    surface: surface.name,
    viewport: viewport.width,
    theme: seededTheme,
    run,
  };
  const path: string[] = [];
  const rowsBefore = failRows.length;
  const startedAt = Date.now();
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL as string).origin;
  const label = `${surface.name} run ${run} @${viewport.width} ${seededTheme} depth ${depth}`;

  try {
    await page.goto(surface.path(), { waitUntil: 'domcontentloaded' });
    await readL1(page, l1, key, 0, path, LANDING_SETTLE_MS, []);
    key.theme = await currentTheme(page, seededTheme);
    await readVisual(page, key, 0, path);

    for (let step = 1; step <= depth; step += 1) {
      cov.steps += 1;
      const candidates = await collectCandidates(page);
      for (const c of candidates) cov.seen.add(c.signature);
      const pagePath = (() => {
        try {
          const u = new URL(page.url());
          return `${u.pathname}${u.search}`;
        } catch {
          return '/';
        }
      })();
      const pickable: { signature: string; item: PageSubject }[] = [];
      for (const c of candidates) {
        const verdict = fenceVerdict(c, origin, pagePath);
        if (verdict.fenced) {
          if (!cov.fenced.has(c.signature)) cov.fenced.set(c.signature, verdict.reason);
          continue;
        }
        pickable.push({ signature: c.signature, item: c });
      }
      const escape = rng.next() < 0.1;
      const picked = escape ? null : pickByNovelty(rng, pickable, cov.clicked);
      if (!picked && !escape) {
        notes.push(`${label}: no pickable element at step ${step} — traversal ends`);
        break;
      }
      const action: StepAction = picked ? chooseAction(rng, picked.item) : { kind: 'escape' };
      if (action.kind === 'type' && isJainaComposer(action.subject.placeholder)) {
        // Typing is allowed; the fence is on Enter, which `act` never presses.
        notes.push(`${label}: typed into the Jaina composer without sending (step ${step})`);
      }
      path.push(describeAction(action));
      if (picked) {
        cov.clicks += 1;
        cov.clicked.add(picked.signature);
      }
      l1.reset();
      const broke = await act(page, rng, action);
      await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
      await page.waitForTimeout(250);

      const url = new URL(page.url());
      if (url.origin !== origin) {
        await fileRow(
          page,
          key,
          step,
          'off-origin',
          `off-origin|${url.host}`,
          `landed on ${url.href}`,
          path,
        );
        break;
      }
      if (/^\/(login|onboarding)/.test(url.pathname)) {
        notes.push(`${label}: left to ${url.pathname} at step ${step} — traversal ends`);
        break;
      }
      await readL1(page, l1, key, step, path, STEP_SETTLE_MS, broke ? [broke] : []);
      while (guardHits.length > 0) {
        const hit = guardHits.shift() as string;
        await fileRow(
          page,
          key,
          step,
          'write-guard',
          `write-guard|${hit.replace(/\?.*$/, '')}`,
          `aborted at the wire: ${hit}`,
          path,
        );
      }
      key.theme = await currentTheme(page, key.theme);
      if (step % AUDIT_EVERY === 0 || step === depth) await readVisual(page, key, step, path);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    if (page.isClosed() || /Target page, context or browser has been closed/.test(message)) {
      fatal = `${label}: ${message}`;
    } else {
      await fileRow(
        page,
        key,
        path.length,
        'traversal-error',
        l1Signature('traversal-error', message),
        message,
        path,
      );
    }
  } finally {
    l1.detach();
    await page.close().catch(() => undefined);
  }
  if (fatal) return;
  const elapsedMs = Date.now() - startedAt;
  cov.traversalsRun += 1;
  cov.elapsedMs += elapsedMs;
  if (failRows.length === rowsBefore) {
    recorder.record(
      `${label}`,
      'PASS',
      `${path.length} actions in ${(elapsedMs / 1000).toFixed(1)}s, no new signature`,
    );
  }
}

/* ------------------------------------------------------------------------- */
/* The run                                                                    */
/* ------------------------------------------------------------------------- */

function loadBaseline(): Set<string> {
  try {
    const known = parseBaselineSignatures(readFileSync(BASELINE_PATH, 'utf8'));
    notes.push(`known visual signatures: ${known.size} from ${BASELINE_PATH}`);
    return known;
  } catch (error) {
    notes.push(
      `known visual signatures: none — ${BASELINE_PATH} unreadable (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); every visual signature is new`,
    );
    return new Set();
  }
}

function surfacesToRun(): Surface[] {
  if (!ONLY_SURFACE) return [...SURFACES];
  const hits = SURFACES.filter((s) => s.name.toLowerCase() === ONLY_SURFACE);
  if (hits.length === 0) {
    throw new Error(
      `[perfplus-crawler] PERFPLUS_CRAWL_ONLY="${ONLY_SURFACE}" names no surface; known: ${SURFACES.map((s) => s.name).join(', ')}`,
    );
  }
  return hits;
}

test.describe('Performance+ P2.1 — seeded chaos crawler over every surface, Easy Fit owner', () => {
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
    currentBrand = originalBrand;
    optimizerBrand = await resolveOptimizerBrand();
    knownSignatures = loadBaseline();
    notes.push(
      `seed ${SEED}, ${RUNS} traversals/surface, depth ${MIN_DEPTH}–${MAX_DEPTH}, budget ${SURFACE_BUDGET_MS}ms/surface, visual audit every ${AUDIT_EVERY} actions${ONLY_SURFACE ? `, only "${ONLY_SURFACE}"` : ''}${ONLY_RUN !== null ? ` run ${ONLY_RUN}` : ''}`,
    );
    notes.push(
      axeScriptPath
        ? `contrast: axe-core at ${axeScriptPath}`
        : 'contrast: axe-core not resolvable — rule unexercised everywhere',
    );
  });

  test.afterAll(async () => {
    // The seeded user leaves prod as found: the active-brand pin goes back to what it was.
    if (originalBrand && originalBrand !== currentBrand) {
      currentBrand = null;
      await selectBrand(originalBrand).catch((error: unknown) => {
        notes.push(
          `restore brand failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      });
    }
    for (const context of contexts.values()) await context.close().catch(() => undefined);
    printEnvelopeOnce();
  });

  test('every surface survives seeded traversals without a new L1 or L1V signature', async ({
    browser,
  }) => {
    test.setTimeout(6 * 60 * 60_000);

    for (const surface of surfacesToRun()) {
      coverage.set(surface.name, {
        traversalsRun: 0,
        traversalsSkipped: 0,
        steps: 0,
        seen: new Set(),
        clicked: new Set(),
        clicks: 0,
        fenced: new Map(),
        knownVisualHits: 0,
        repeatVisualHits: 0,
        repeatL1Hits: 0,
        newRows: 0,
        audits: 0,
        elapsedMs: 0,
      });
      const cov = coverage.get(surface.name) as SurfaceCoverage;
      if (surface.name === 'Portfolio page' && portfolioId === null) {
        recorder.record(`${surface.name}`, 'SKIP', 'no portfolio on any candidate brand');
        cov.traversalsSkipped = RUNS;
        continue;
      }
      await test.step(surface.name, async () => {
        await selectBrand(surface.brand === 'optimizer' ? optimizerBrand : EASYFIT_BRAND_ID);
        const startedAt = Date.now();
        const runs = ONLY_RUN !== null ? [ONLY_RUN] : Array.from({ length: RUNS }, (_, i) => i + 1);
        for (const run of runs) {
          if (fatal) break;
          // Predictive: a traversal that would end past the budget is skipped, so a surface
          // costs ~the budget, not the budget plus one more traversal. The first always runs.
          const elapsed = Date.now() - startedAt;
          const average = cov.traversalsRun > 0 ? cov.elapsedMs / cov.traversalsRun : 0;
          if (cov.traversalsRun > 0 && elapsed + average > SURFACE_BUDGET_MS) {
            cov.traversalsSkipped += 1;
            continue;
          }
          await traverse(browser, surface, run);
        }
        if (cov.traversalsSkipped > 0) {
          recorder.record(
            `${surface.name} traversals ${cov.traversalsRun + 1}–${RUNS}`,
            'SKIP',
            `surface budget ${SURFACE_BUDGET_MS}ms spent after ${cov.traversalsRun} traversals`,
          );
        }
      });
      if (fatal) {
        recorder.record('crawler', 'FAIL', `aborted: ${fatal}`);
        break;
      }
    }

    const rows = failRows.map(formatFailRow);
    expect
      .soft(rows, `[perfplus-crawler] ${failRows.length} new signature(s)\n${rows.join('\n')}`)
      .toEqual([]);
    printEnvelopeOnce();
  });
});
