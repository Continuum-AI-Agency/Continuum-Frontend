import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page, Request, Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  restoreBrandPreference,
  revokeBenchSession,
} from '../support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';
import {
  auditVisual,
  installVisualProbes,
  resolveAxeScript,
  seedTheme,
  type VisualReport,
  type VisualState,
  type VisualTheme,
} from '../support/visualInvariants';

// Lane E of the 2026-10-31 deep test: shared harness. READ ONLY against production.
//
// Every page opens in its own context with the identity's LATEST cookies (a context hands its
// refreshed session to the next one, so a rotated refresh token is never replayed), a brand pin
// on that session, the theme seeded the way the app stores it, and a WRITE GUARD that aborts
// every request that could change production: table writes and write-named RPCs on Supabase,
// write-named edge functions, every non-GET to the Backend except the read POSTs named below,
// and the product's own analytics (/ingest) so bench traffic never counts as usage.

export const OUT =
  process.env.LANE_E_OUT ??
  '/Users/ramirobuiselquintana/.superset/worktrees/Continuum-Monorepo/conociendo-todo-el-producto-38abe357/artifacts/perfplus-campaign/deeptest-2026-10-31/laneE';

export const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;
export const THEMES: readonly VisualTheme[] = ['light', 'dark'];

/** LANE_E_CELLS=390-light,1440-dark narrows the matrix (a quick smoke or a re-run of one cell). */
const ONLY_CELLS = (process.env.LANE_E_CELLS ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);
export function cells(): { viewport: (typeof VIEWPORTS)[number]; theme: VisualTheme }[] {
  const all = VIEWPORTS.flatMap((viewport) => THEMES.map((theme) => ({ viewport, theme })));
  return ONLY_CELLS.length === 0
    ? all
    : all.filter((cell) => ONLY_CELLS.includes(`${cell.viewport.width}-${cell.theme}`));
}
/** LANE_E_CASES=setup,approve-pink narrows a spec to those cases. */
export function onlyCases<T extends { key: string }>(cases: readonly T[]): readonly T[] {
  const only = (process.env.LANE_E_CASES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return only.length === 0 ? cases : cases.filter((c) => only.includes(c.key));
}

export type Identity = {
  email: string;
  session: MintedSession;
  state: PlaywrightStorageState;
  /** The account-level brand preference before the run. The app's server-side brand
   *  resolution persists a new one when a pinned brand is not visible, so it is restored. */
  preferenceBefore: string | null;
};

function serviceClient() {
  const { serviceRoleKey } = loadProdSupabaseEnv();
  return createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readPreference(userId: string): Promise<string | null> {
  const { data } = await serviceClient()
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

const identities = new Map<string, Identity>();

export async function identityFor(email: string): Promise<Identity> {
  const cached = identities.get(email);
  if (cached) return cached;
  const session = await mintSessionBundleForEmail(email);
  const preferenceBefore = await readPreference(session.userId);
  const identity = { email, session, state: session.state, preferenceBefore };
  identities.set(email, identity);
  return identity;
}

export async function revokeAll(): Promise<string[]> {
  const lines: string[] = [];
  for (const identity of identities.values()) {
    try {
      const result = await revokeBenchSession(identity.state, identity.session.accessToken);
      lines.push(
        `${identity.email}: session ${result.sessionId} revoked=${result.revoked} pinsLeft=${result.pinsLeft} (${result.detail})`,
      );
      const now = await readPreference(identity.session.userId);
      if (now !== identity.preferenceBefore) {
        const restored = await restoreBrandPreference(
          identity.session.userId,
          identity.preferenceBefore,
        );
        lines.push(
          `${identity.email}: preference moved ${identity.preferenceBefore} -> ${now} during the run; restored to ${restored}`,
        );
      } else {
        lines.push(`${identity.email}: preference unchanged (${now})`);
      }
    } catch (error) {
      lines.push(`${identity.email}: revoke failed ${(error as Error).message}`);
    }
  }
  identities.clear();
  return lines;
}

/* -------------------------------------------------------------------------------------------- */
/* Write guard                                                                                   */
/* -------------------------------------------------------------------------------------------- */

/** An RPC whose name LEADS with a write verb (after an optional domain prefix) is a write. A read
 *  verb such as `optimizer_get_cycle_status` is never caught by a later word in its name. */
const WRITE_WORD =
  /^(optimizer_|paid_|brand_|media_|organic_|jaina_|home_|forge_|library_|canvas_|studio_)?(set|update|upsert|insert|delete|remove|create|approve|apply|dismiss|reject|record|save|reserve|enroll|convert|revert|undo|implement|archive|publish|mark|claim|ack|acknowledge|toggle|pause|resume|enable|disable|cancel|retry|assign|unassign|attach|detach|link|unlink|rename|move|enqueue|schedule|send|accept|decline|restore|touch|log|track|bump|increment|sync|dispatch|trigger|run|drain|execute|deploy|duplicate|clone|promote|import|register|grant|revoke|invite|write|add|upload|confirm|submit|complete|finish|start|stop|lock|unlock|refresh|seen|dedupe|merge|split|reorder|pin|unpin|star|favorite)(_|$)/;
const EDGE_WRITE =
  /(apply|approve|publish|delete|revert|enroll|create|update|save|send|cycle|execute|deploy|undo|dismiss|claim|implement|import|ingest|sync|upload|write|reset)/;
const API_READ_POST =
  /\/(media\/sign|sign|resolve|preview|previews|read|reads|batch-read|query|metrics|insights|search|lookup)(\/|$|\?)/;

export type GuardLog = { blocked: string[]; allowedNonGet: string[] };

function guardDecision(request: Request): 'block' | 'allow' {
  const method = request.method();
  const url = new URL(request.url());
  if (url.pathname.startsWith('/ingest')) return 'block';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'allow';
  if (url.host.endsWith('.supabase.co')) {
    if (url.pathname.startsWith('/auth/v1/token')) return 'allow';
    if (url.pathname.startsWith('/auth/v1/')) return 'block';
    const rpc = /^\/rest\/v1\/rpc\/([^/?]+)/.exec(url.pathname);
    if (rpc) return WRITE_WORD.test((rpc[1] ?? '').toLowerCase()) ? 'block' : 'allow';
    if (url.pathname.startsWith('/rest/v1/')) return 'block';
    const edge = /^\/functions\/v1\/([^?]+)/.exec(url.pathname);
    if (edge) return EDGE_WRITE.test(edge[1] ?? '') ? 'block' : 'allow';
    if (url.pathname.startsWith('/storage/v1/object/sign')) return 'allow';
    if (url.pathname.startsWith('/storage/v1/')) return 'block';
    if (url.pathname.startsWith('/realtime/')) return 'allow';
    return 'block';
  }
  if (url.host === 'api.trycontinuum.ai')
    return API_READ_POST.test(url.pathname) ? 'allow' : 'block';
  // Same-origin non-GET: Next server actions and route handlers (several are reads over POST:
  // organic analytics, calendar posts). An agent send, a new conversation or a publish is not.
  if (
    /\/api\/(agents\/[^/]+\/chat\/(stream|send|conversations)|organic\/(publish|published-posts))/.test(
      url.pathname,
    )
  ) {
    return 'block';
  }
  // Logged; any other write would need a click on a write control, which no lane E spec makes.
  return 'allow';
}

export async function installWriteGuard(context: BrowserContext, log: GuardLog): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const decision = guardDecision(request);
    const line = `${request.method()} ${request.url().slice(0, 220)}`;
    if (decision === 'block') {
      if (!new URL(request.url()).pathname.startsWith('/ingest')) log.blocked.push(line);
      await route.abort('blockedbyclient');
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) log.allowedNonGet.push(line);
    await route.continue();
  });
}

/* -------------------------------------------------------------------------------------------- */
/* L1 events                                                                                     */
/* -------------------------------------------------------------------------------------------- */

export type PageEvents = {
  consoleErrors: string[];
  pageErrors: string[];
  serverErrors: string[];
  failedRequests: string[];
  slow: string[];
};

const OWN = (url: string, origin: string) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === origin ||
      parsed.host.endsWith('.supabase.co') ||
      parsed.host === 'api.trycontinuum.ai'
    );
  } catch {
    return false;
  }
};

export function watchPage(page: Page, origin: string): PageEvents {
  const events: PageEvents = {
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
    failedRequests: [],
    slow: [],
  };
  const started = new Map<Request, number>();
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Download the React DevTools|ResizeObserver loop/.test(text)) return;
    // The guard's own aborts surface as failed fetches; they are the guard, not the product.
    if (/ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(text)) return;
    events.consoleErrors.push(text.slice(0, 400));
  });
  page.on('pageerror', (error) => events.pageErrors.push(error.message.slice(0, 400)));
  page.on('request', (request) => started.set(request, Date.now()));
  page.on('response', (response) => {
    const request = response.request();
    const ms = Date.now() - (started.get(request) ?? Date.now());
    if (response.status() >= 500 && OWN(response.url(), origin)) {
      events.serverErrors.push(
        `${response.status()} ${request.method()} ${response.url().slice(0, 200)}`,
      );
    }
    if (ms > 8000 && OWN(response.url(), origin)) {
      events.slow.push(`${ms}ms ${request.method()} ${response.url().slice(0, 160)}`);
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (/ERR_ABORTED|BLOCKED_BY_CLIENT/.test(failure)) return;
    if (!OWN(request.url(), origin)) return;
    events.failedRequests.push(`${failure} ${request.method()} ${request.url().slice(0, 200)}`);
  });
  return events;
}

/* -------------------------------------------------------------------------------------------- */
/* Opening a page                                                                                */
/* -------------------------------------------------------------------------------------------- */

export type Opened = {
  context: BrowserContext;
  page: Page;
  events: PageEvents;
  guard: GuardLog;
  close: () => Promise<void>;
};

export async function openAs(
  browser: Browser,
  identity: Identity,
  brandId: string,
  viewport: { width: number; height: number },
  theme: VisualTheme,
  options: { reducedMotion?: boolean } = {},
): Promise<Opened> {
  await pinSessionBrand(identity.session.accessToken, brandId);
  const context = await browser.newContext({
    storageState: identity.state,
    viewport,
    colorScheme: theme,
    reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
  });
  await seedTheme(context, theme);
  await installVisualProbes(context);
  const guard: GuardLog = { blocked: [], allowedNonGet: [] };
  await installWriteGuard(context, guard);
  const page = await context.newPage();
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3116').origin;
  const events = watchPage(page, origin);
  return {
    context,
    page,
    events,
    guard,
    close: async () => {
      try {
        identity.state = (await context.storageState()) as PlaywrightStorageState;
      } catch {
        // A crashed context keeps the previous state; the next context re-reads it.
      }
      await context.close().catch(() => undefined);
    },
  };
}

/* -------------------------------------------------------------------------------------------- */
/* Evidence                                                                                      */
/* -------------------------------------------------------------------------------------------- */

export function outPath(...parts: string[]): string {
  const path = resolve(OUT, ...parts);
  mkdirSync(resolve(path, '..'), { recursive: true });
  return path;
}

export async function shot(page: Page, name: string, fullPage = true): Promise<string> {
  const path = outPath('shots', `${name}.png`);
  await page.screenshot({ path, fullPage, timeout: 60_000 }).catch(async () => {
    await page.screenshot({ path, fullPage: false, timeout: 60_000 }).catch(() => undefined);
  });
  return path;
}

export async function audit(
  page: Page,
  surface: string,
  viewport: number,
  theme: VisualTheme,
  state: VisualState = 'loaded',
): Promise<VisualReport> {
  return auditVisual(
    page,
    { surface, viewport, theme, state },
    { axeScriptPath: resolveAxeScript(), tooltipProbes: 3, maxControls: 160 },
  );
}

/** One line per step into <OUT>/progress.log, so a long run can be followed with tail. */
export function progress(line: string): void {
  try {
    appendFileSync(outPath('progress.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Progress is a convenience; a failed append never fails a run.
  }
}

/** The box of the first element matching `selector`, or null at once when there is none —
 *  `locator.boundingBox()` would wait for one to appear. */
export async function boxOf(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return null;
  return locator.boundingBox({ timeout: 5_000 }).catch(() => null);
}

export function writeJson(name: string, value: unknown): string {
  const path = outPath(`${name}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

/** Waits for the app shell to settle: no skeleton/aria-busy left, or the timeout. */
export async function settle(page: Page, timeoutMs = 45_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate(
        () =>
          document.querySelectorAll(
            '[aria-busy="true"], [data-slot="skeleton"], .animate-pulse, [data-dither-skeleton]',
          ).length,
      )
      .catch(() => 0);
    if (busy === 0) {
      await page.waitForTimeout(800);
      return true;
    }
    await page.waitForTimeout(700);
  }
  return false;
}

export type Finding = {
  id: string;
  campaign_lane: 'L1' | 'L1V' | 'L2' | 'L3' | 'L4';
  surface: string;
  platform: 'meta' | 'google_ads' | 'tiktok_ads' | 'none';
  environment: 'E1' | 'E2' | 'E3';
  kind: 'fix' | 'build';
  viewport?: string;
  case: string;
  title: string;
  expected: string;
  observed: string;
  evidence: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  money_at_risk: boolean;
  verdict: 'confirmed' | 'plausible' | 'refuted';
  status: 'open';
};

/** Raw observations a spec writes for the report; findings are written by hand from these. */
export class Observations {
  private readonly rows: Record<string, unknown>[] = [];
  constructor(private readonly name: string) {}
  add(row: Record<string, unknown>): void {
    this.rows.push({ at: new Date().toISOString(), ...row });
  }
  flush(): string {
    return writeJson(`observations-${this.name}`, this.rows);
  }
}
