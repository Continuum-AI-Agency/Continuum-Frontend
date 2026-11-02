import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { l1Signature, parseBaselineSignatures, visualSignature } from './support/crawlerCore';
import { attachL1, expectDefinedState, isOwnOrigin, l1Failures } from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';
import {
  auditVisual,
  installVisualProbes,
  resolveAxeScript,
  seedTheme,
} from './support/visualInvariants';

// ---------------------------------------------------------------------------
// app:sweep:bench — every screen of the app, loaded as a real user, read for what breaks.
//
// The Performance+ crawler (perfplus:crawler:bench) goes deep on twelve Performance+ surfaces.
// This sweep goes wide: each route a signed-in user reaches from the navigation (Home, Scale,
// Organic, AI Studio, Forge, Library, Automations, Competitor Spy, Goals, Settings, Support),
// for each brand in SWEEP_BRAND_IDS, at a phone and a desktop width. Per load it reads:
//   - the L1 invariants (e2e/support/l1Invariants.ts): console errors, uncaught errors,
//     5xx and failed requests on our origins;
//   - a defined state: content, a named empty state or a named error, never a skeleton that
//     outlives SETTLE_MS;
//   - the L1V visual detector (e2e/support/visualInvariants.ts), axe contrast included;
//   - where the app sent the browser: a sign-in or onboarding redirect is a finding.
// Signatures already named in the Performance+ baseline (artifacts/perfplus-campaign/
// baseline/visual-matrix.txt) are counted, never re-reported; a repeated signature is
// reported once with every page it hit.
//
// ── THE FENCE ── nothing is clicked or typed. The request fence aborts DELETE / PUT / PATCH
// and the billing write paths on our origins, and any navigation off the app's origin, and
// files each abort as a row, so a page that writes on load is a visible finding. The only
// writes are the bench's own: a minted session for SWEEP_EMAIL (revoked at the end, read
// back gone) and its session-scoped brand pins (deleted with the session).
//
// Usage (from Continuum-Frontend):
//   PLAYWRIGHT_BASE_URL=https://app.beta.trycontinuum.ai bun run app:sweep:bench
//   SWEEP_ONLY=<route name substring>  SWEEP_VIEWPORTS=390,1440  SWEEP_THEME=light|dark
// Without PLAYWRIGHT_BASE_URL the config starts a dev server on :3118.
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey } = loadProdSupabaseEnv();

const SWEEP_EMAIL = process.env.SWEEP_EMAIL?.trim() || 'ramibuisel@gmail.com';
/** Easy Fit's ledger brand (Meta and Google, the active portfolios) and Pink Elephant (the
 *  client executes; Google-heavy). Override with a comma-separated SWEEP_BRAND_IDS. */
const DEFAULT_BRANDS = [
  '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  '8e5b7185-e43f-4150-b763-b86c4f5297a0',
] as const;
const BRAND_IDS = (process.env.SWEEP_BRAND_IDS?.split(',') ?? [...DEFAULT_BRANDS])
  .map((id) => id.trim())
  .filter(Boolean);
const VIEWPORT_WIDTHS = (process.env.SWEEP_VIEWPORTS ?? '390,1440')
  .split(',')
  .map((w) => Number.parseInt(w.trim(), 10))
  .filter((w) => Number.isFinite(w) && w > 0);
const THEME = process.env.SWEEP_THEME === 'dark' ? 'dark' : 'light';
const ONLY = process.env.SWEEP_ONLY?.trim().toLowerCase() || null;
/** How long a landing may keep loading before the sweep calls it undefined. */
const SETTLE_MS = Number.parseInt(process.env.SWEEP_SETTLE_MS ?? '45000', 10);
/** After the state is defined: a quiet moment so late requests and errors are counted. */
const QUIET_MS = 2_000;

type Route = { name: string; path: string };

/** What the navigation reaches (sidebar, settings sections, Scale and Organic tabs). Left out
 *  on purpose: /onboarding and /studio/video/new (they start state on load), auth and OAuth
 *  callbacks, and the public token pages (share, embed, open). */
const ROUTES: readonly Route[] = [
  { name: 'Home', path: '/dashboard?view=overview' },
  { name: 'Dashboard paid', path: '/dashboard?view=paid' },
  { name: 'Dashboard organic', path: '/dashboard?view=organic' },
  { name: 'Starter kit', path: '/dashboard/starter-kit' },
  { name: 'Scale Performance', path: '/scale?tab=performance' },
  { name: 'Scale Portfolios', path: '/scale?tab=performance&optimizerView=portfolios' },
  { name: 'Scale Actions', path: '/scale?tab=performance&optimizerView=actions' },
  { name: 'Scale Jaina', path: '/scale?tab=jaina' },
  { name: 'Scale Campaigns', path: '/scale?tab=campaigns' },
  { name: 'Scale Dashboard', path: '/scale?tab=dashboard' },
  { name: 'Approvals', path: '/scale/approvals' },
  { name: 'Campaign Canvas', path: '/scale/campaign-canvas' },
  { name: 'Scale client view', path: '/scale/client' },
  { name: 'Goals', path: '/goals' },
  { name: 'Organic', path: '/organic' },
  { name: 'Organic Planner', path: '/organic?tab=planner' },
  { name: 'Organic Metrics', path: '/organic?tab=metrics' },
  { name: 'Organic Agent', path: '/organic?tab=agent' },
  { name: 'Organic Rules', path: '/organic?tab=rules' },
  { name: 'AI Studio', path: '/ai-studio' },
  { name: 'Forge', path: '/forge' },
  { name: 'Library', path: '/library' },
  { name: 'Automations', path: '/automations' },
  { name: 'Competitor Spy', path: '/competitor-spy' },
  { name: 'Settings', path: '/settings' },
  { name: 'Settings Brand Book', path: '/settings?section=brand-book' },
  { name: 'Settings Integrations', path: '/settings?section=integrations' },
  { name: 'Settings Knowledge', path: '/settings?section=knowledge' },
  { name: 'Settings Billing', path: '/settings?section=billing' },
  { name: 'Settings Notifications', path: '/settings/notifications' },
  { name: 'Settings Drive', path: '/settings/drive' },
  { name: 'Support', path: '/support' },
];

/** Paths that create or change money objects whatever the method (billing-api, Stripe) —
 *  the same list the Performance+ crawler fences. */
const WRITE_PATH_PATTERN =
  /\/checkout(-sessions)?(\/|$)|\/credits\/checkout|\/overage(\/|$)|\/promo(\/|$)|\/runs\/[^/]+\/cancel(\/|$)/;
const WRITE_METHODS: ReadonlySet<string> = new Set(['DELETE', 'PUT', 'PATCH']);
/** The Vercel preview toolbar (vercel.live), injected on preview deployments only. */
const VERCEL_TOOLBAR = /^https:\/\/vercel\.live\//;
/** A landing slower than this is kept as WARN: worth reading, not a broken page. */
const SLOW_LANDING_MS = Number.parseInt(process.env.SWEEP_SLOW_MS ?? '15000', 10);
/** Where a signed-in user should never land from a navigation link. */
const UNEXPECTED_LANDING = /^\/(login|signup|onboarding|auth)(\/|$)/;

/** Under test-results/ (git-ignored): a sweep writes one screenshot per load, never a baseline. */
const SHOTS_DIR = resolve(__dirname, '../test-results/app-sweep');
const BASELINE_PATH = resolve(
  __dirname,
  '../../artifacts/perfplus-campaign/baseline/visual-matrix.txt',
);

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('app:sweep:bench', notes);

type Finding = { invariant: string; signature: string; detail: string; pages: string[] };
const findings = new Map<string, Finding>();
let knownVisual = new Set<string>();
let knownVisualHits = 0;
const guardHits: string[] = [];
let toolbarBlocked = 0;
const slowLandings: string[] = [];

let session: MintedSession | null = null;
let latestState: PlaywrightStorageState | null = null;
let printed = false;

function file(invariant: string, signature: string, detail: string, page: string): void {
  const existing = findings.get(signature);
  if (existing) {
    if (!existing.pages.includes(page)) existing.pages.push(page);
    return;
  }
  findings.set(signature, { invariant, signature, detail, pages: [page] });
}

function loadBaseline(): Set<string> {
  try {
    return parseBaselineSignatures(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    notes.push(`no visual baseline at ${BASELINE_PATH}: every visual signature counts as new`);
    return new Set();
  }
}

async function memberBrands(userId: string): Promise<Map<string, string>> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('permissions')
    .select('brand_profile_id')
    .eq('user_id', userId);
  if (error) throw new Error(`[app-sweep] permissions read: ${error.message}`);
  const ids = (data ?? []).map((row) => (row as { brand_profile_id: string }).brand_profile_id);
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data: profiles } = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id, brand_name')
    .in('id', ids);
  for (const row of profiles ?? []) {
    const profile = row as { id: string; brand_name: string | null };
    const name = profile.brand_name?.split(/\s+[–-]\s+/)[0]?.trim();
    names.set(profile.id, name || profile.id.slice(0, 8));
  }
  for (const id of ids) if (!names.has(id)) names.set(id, id.slice(0, 8));
  return names;
}

async function newContext(
  browser: Browser,
  state: PlaywrightStorageState,
  width: number,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    storageState: state,
    viewport: { width, height: width < 768 ? 844 : 900 },
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  await installVisualProbes(context);
  await seedTheme(context, THEME);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL as string).origin;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    // The Vercel toolbar exists only on preview deployments (beta), never on production, and
    // its sandboxed iframe throws on localStorage: noise for this sweep, not the app.
    if (VERCEL_TOOLBAR.test(url)) {
      toolbarBlocked += 1;
      await route.abort('blockedbyclient');
      return;
    }
    if (
      request.isNavigationRequest() &&
      request.resourceType() === 'document' &&
      new URL(url).origin !== origin
    ) {
      guardHits.push(`off-origin navigation ${url.slice(0, 140)}`);
      await route.abort('blockedbyclient');
      return;
    }
    const own = isOwnOrigin(url, origin);
    if (
      own &&
      (WRITE_METHODS.has(request.method()) || WRITE_PATH_PATTERN.test(new URL(url).pathname))
    ) {
      guardHits.push(`${request.method()} ${url.slice(0, 160)}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return context;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function sweepOne(
  page: Page,
  route: Route,
  brandName: string,
  width: number,
  axeScriptPath: string | null,
): Promise<void> {
  const label = `${brandName} · ${route.name} @${width}`;
  const l1 = attachL1(page);
  const guardBefore = guardHits.length;
  const startedAt = Date.now();
  try {
    await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  } catch (error) {
    l1.detach();
    file('navigation', `navigation|${route.name}`, String(error).split('\n')[0], label);
    recorder.record(label, 'FAIL', `navigation: ${String(error).split('\n')[0]}`);
    return;
  }
  const state = await expectDefinedState(page, { label, settleMs: SETTLE_MS }).catch(
    (error: unknown) => ({
      kind: 'undefined' as const,
      name: error instanceof Error ? error.message.split('\n')[0] : String(error),
    }),
  );
  await page.waitForTimeout(QUIET_MS);
  const landedPath = new URL(page.url()).pathname;
  const loadMs = Date.now() - startedAt;
  const problems: string[] = [];

  if (UNEXPECTED_LANDING.test(landedPath)) {
    problems.push(`landed on ${landedPath}`);
    file('redirect', `redirect|${route.path}→${landedPath}`, `landed on ${landedPath}`, label);
  }
  if (state.kind === 'undefined') {
    problems.push(`no defined state after ${SETTLE_MS} ms`);
    file('defined-state', `defined-state|${route.name}`, state.name, label);
  } else if (state.kind === 'error') {
    problems.push(`error state "${state.name}"`);
    file('error-state', `error-state|${route.name}|${state.name}`, state.name, label);
  }

  for (const failure of l1Failures(l1.report())) {
    if (failure.evidence.includes('vercel.live')) continue;
    const signature = l1Signature(failure.invariant, failure.evidence);
    problems.push(`${failure.invariant}: ${failure.evidence.split('\n')[0].slice(0, 160)}`);
    file(failure.invariant, signature, failure.evidence.split('\n')[0].slice(0, 300), label);
  }
  l1.detach();

  for (const hit of guardHits.slice(guardBefore)) {
    problems.push(`write fenced: ${hit}`);
    file('write-on-load', `write-on-load|${hit.replace(/[0-9a-f-]{36}/gi, '<uuid>')}`, hit, label);
  }

  try {
    const visual = await auditVisual(
      page,
      {
        surface: route.name,
        viewport: width,
        theme: THEME,
        state: state.kind === 'content' ? 'loaded' : state.kind === 'empty' ? 'empty' : 'error',
      },
      { axeScriptPath },
    );
    for (const violation of visual.violations) {
      const signature = visualSignature(violation.rule, violation.selector, violation.detail);
      if (knownVisual.has(signature)) {
        knownVisualHits += 1;
        continue;
      }
      problems.push(`visual ${violation.rule}: ${violation.selector.slice(0, 80)}`);
      file(
        `visual:${violation.rule}`,
        signature,
        `${violation.selector} ${violation.detail}`.slice(0, 300),
        label,
      );
    }
    if (visual.stats.layoutShift > 0.1) {
      problems.push(`CLS ${visual.stats.layoutShift.toFixed(2)}`);
    }
  } catch (error) {
    notes.push(`${label}: visual detector did not run — ${String(error).split('\n')[0]}`);
  }

  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `${slug(brandName)}-${slug(route.name)}-${width}.png`) })
    .catch(() => undefined);

  if (loadMs > SLOW_LANDING_MS) slowLandings.push(`${label} ${loadMs} ms`);
  const grade = problems.length > 0 ? 'FAIL' : loadMs > SLOW_LANDING_MS ? 'WARN' : 'PASS';
  recorder.record(
    label,
    grade,
    `${state.kind} in ${loadMs} ms${problems.length ? ` — ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? ` (+${problems.length - 4})` : ''}` : ''}`,
  );
}

function printEnvelopeOnce(): void {
  if (printed) return;
  printed = true;
  const rows = [...findings.values()].sort((a, b) => b.pages.length - a.pages.length);
  notes.push(
    `${rows.length} distinct finding signature(s); known baseline visual hits: ${knownVisualHits}; Vercel toolbar requests blocked: ${toolbarBlocked}`,
  );
  if (slowLandings.length > 0) {
    notes.push(
      `landings over ${SLOW_LANDING_MS} ms (${slowLandings.length}): ${slowLandings.join('; ')}`,
    );
  }
  for (const row of rows) {
    notes.push(
      `[${row.invariant}] ${row.signature} — ${row.pages.length} page(s): ${row.pages.slice(0, 6).join(', ')}${row.pages.length > 6 ? ', …' : ''} — ${row.detail.slice(0, 200)}`,
    );
  }
  recorder.print();
}

test.describe('app:sweep — every navigable screen, per brand, phone and desktop', () => {
  test.beforeAll(async () => {
    session = await mintSessionBundleForEmail(SWEEP_EMAIL);
    latestState = session.state;
    knownVisual = loadBaseline();
    notes.push(
      `user ${SWEEP_EMAIL}, theme ${THEME}, widths ${VIEWPORT_WIDTHS.join('/')}, settle ${SETTLE_MS} ms, base ${process.env.PLAYWRIGHT_BASE_URL}`,
    );
  });

  test.afterAll(async () => {
    if (session && latestState) {
      const revoke = await revokeBenchSession(latestState, session.accessToken).catch(
        (error: unknown) => ({
          revoked: false,
          detail: String(error),
          sessionId: '?',
          pinsLeft: -1,
        }),
      );
      recorder.record(
        'session revoked and read back gone',
        revoke.revoked ? 'PASS' : 'FAIL',
        `${revoke.sessionId}: ${revoke.detail}`,
      );
    }
    printEnvelopeOnce();
  });

  test('every route renders a defined state with no new L1 or visual signature', async ({
    browser,
  }) => {
    test.setTimeout(4 * 60 * 60_000);
    if (!session) throw new Error('no session');
    const brands = await memberBrands(session.userId);
    const axeScriptPath = resolveAxeScript();
    if (!axeScriptPath) notes.push('contrast: axe-core not resolvable — rule unexercised');
    const routes = ROUTES.filter((r) => !ONLY || r.name.toLowerCase().includes(ONLY));

    for (const brandId of BRAND_IDS) {
      const brandName = brands.get(brandId);
      if (!brandName) {
        recorder.record(`brand ${brandId}`, 'SKIP', `${SWEEP_EMAIL} is not a member`);
        continue;
      }
      await pinSessionBrand(session.accessToken, brandId);
      for (const width of VIEWPORT_WIDTHS) {
        const context = await newContext(browser, latestState ?? session.state, width);
        const page = await context.newPage();
        for (const route of routes) {
          await test.step(`${brandName} · ${route.name} @${width}`, () =>
            sweepOne(page, route, brandName, width, axeScriptPath));
        }
        latestState = (await context.storageState()) as PlaywrightStorageState;
        await context.close();
      }
    }

    const rows = [...findings.values()].map(
      (f) => `[${f.invariant}] ${f.signature} (${f.pages.length} page(s))`,
    );
    expect
      .soft(rows, `[app-sweep] ${rows.length} finding signature(s)\n${rows.join('\n')}`)
      .toEqual([]);
    printEnvelopeOnce();
  });
});
