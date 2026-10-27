import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  pinSessionBrand,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// beta-review-fixes:e2e:bench — the five beta-review fixes, on the real page, on real data.
//
// A real Chrome drives this Frontend's dev server as REAL members (magic-link → verifyOtp →
// the @supabase/ssr cookie the app writes) against production Supabase, the deployed edge
// functions and the deployed Backend (Jaina history and the run replay). No fixture, no stub:
// every premise is read from production at run start and every assertion is on RENDERED DOM.
//
//   1. Google tab — the paid-media-metrics read the tab makes is captured off the wire. When
//      its result basis is ambiguous (cpa / conversions null), the tab must render, never "came
//      back in a shape this page does not know", and say "No single result defined" with "—".
//   2. Jaina clarification — stored conversations whose run asked a clarification
//      (response.clarification_request): the bench member's answered one, and the one nobody has
//      answered yet. The real question is on screen (never "Clarification needed."), and no turn
//      asking it carries an Evidence fold or an export. The card itself (question + offered
//      answers) is graded only when the history read hands the page a data-jaina-clarification
//      part; when it does not, the hop is recorded SKIP with the parts it did hand over.
//   3. Jaina failed run — the Easy Fit conversation whose run broke on 2026-10-20 (its log
//      carries get_ad_creative_preview tool chunks and a terminal error; the row still reads
//      `running`). It must reach a terminal state — no SDK "No tool invocation found", no
//      endless Working/Stop — and the Optimizer must not toast "Jaina run failed" on load. When
//      the Backend no longer replays the run (resume GET ≠ 200), the orphan-chunk replay hop is
//      recorded SKIP by name.
//   4. Actions tray — no negative day counts, no "Moving $0.00", no raw trigger ids, a
//      withdrawn pause carries no Approve, and each tray's waiting count equals the list read's
//      pending_recommendations + pending_budget_moves for that portfolio.
//   5. Activity — ad sets are named where a roster names them, and setting rows read in
//      English (no "true → false", no snake_case column names).
//   6. One headline figure — for every Meta portfolio in view on the bench brands, the
//      Portfolios list row, the Overview row and the portfolio hero at its default range print
//      the SAME cost per result (raw provenance value), the same distance to target, the same
//      7-day spend (Overview row vs hero tile), from the same source. A figure the live read
//      could not supply is the last cycle's and must carry its date ("as of Oct 15") on both
//      surfaces, and its age past two days; it is never shown as current.
//
// ── READ-ONLY ON PRODUCTION ──
//   * Nothing here clicks Approve, Dismiss, Revert, Apply, Pause, Stop, Send, an offered
//     clarification answer, or any confirm. The only controls clicked are navigation: the
//     Activity window chip (a read filter).
//   * Brand selection is a SESSION pin (brand_profiles.user_session_brands) on the bench's own
//     minted session — the row the app writes on a session's first render — never a write to
//     the account-level preference. Both members' preference rows are captured before the run,
//     asserted unchanged after it, and restored in `afterAll` if anything moved them.
//   * Both minted sessions are revoked at the end (auth.sessions row + its pins).
//   * Proof of no write: money-family ledger rows (optimizer_list_actions) for every brand the
//     bench opens, and Jaina run rows for both members, are counted before and after.
//
// ── IDENTITY ──
//   mercadotecniavivo@gmail.com is the established bench member (Vivo 47 owner, admin on the
//   Easy Fit rows). The failed run belongs to mkt@easyfit.mx; Jaina history is per member, so
//   that one conversation is opened as that member through the same mint-session mechanism,
//   read-only, on the brand that member already has selected (the bench refuses to move it).
//
// Usage: cd Continuum-Frontend && bun run beta-review-fixes:e2e:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const BENCH = 'beta-review-fixes:e2e:bench';
const notes: string[] = [];
const recorder = createBenchRecorder(BENCH, notes);
const SHOTS_DIR = resolve(__dirname, '__screenshots__/beta-review-fixes');

const VIVO_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_EMAIL = 'mkt@easyfit.mx';
/** The agency "Easy Fit" row: the clarification and the failed run were both asked here. */
const EASYFIT_AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const VIVO47_BRAND_ID = '61b80f51-709a-4408-9f11-04142a286baa';
const VIVO_CENTER_BRAND_ID = 'd666c706-8ffd-4ade-a1b1-cb9f71b25831';
/** Brands whose Actions and Activity are read; each carries live pending work or setting rows. */
const OPTIMIZER_BRANDS = [
  EASYFIT_AGENCY_BRAND_ID,
  EASYFIT_LEDGER_BRAND_ID,
  VIVO47_BRAND_ID,
  VIVO_CENTER_BRAND_ID,
];
/** The failed run's window: Easy Fit, 2026-10-20 ~23:08–23:13Z. */
const FAILED_RUN_WINDOW = { from: '2026-10-20T23:00:00Z', to: '2026-10-20T23:20:00Z' };
const INTERRUPTED_TEXT = /This run was (interrupted|stopped) before Jaina finished/;
const SHAPE_ERROR = 'shape this page does not know';
const NO_SINGLE_RESULT = 'No single result defined';
const FEED_WINDOW_LABEL = '30d';

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Member = { email: string; session: MintedSession; preferenceBefore: string | null };
const members = new Map<string, Member>();
let ledgerBefore = new Map<string, number>();
let jainaRunsBefore = 0;

/** One graded line per assertion, so the Recorder envelope names exactly what held. */
const failedSteps: string[] = [];
function check(step: string, ok: boolean, detail: string): void {
  if (!ok) failedSteps.push(`${step}: ${detail}`);
  recorder.record(step, ok ? 'PASS' : 'FAIL', detail);
  console.log(`[${BENCH}] ${ok ? 'PASS' : 'FAIL'} ${step} — ${detail}`);
}
function note(line: string): void {
  notes.push(line);
  console.log(`[${BENCH}] ${line}`);
}

function memberClient(member: Member): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${member.session.accessToken}` } },
  });
}

async function readPreference(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`preference read failed: ${error.message}`);
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

async function restorePreference(userId: string, brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .update({ active_brand_id: brandId, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(`preference restore failed: ${error.message}`);
}

/** Pins the bench's OWN session to a brand and reads it back through the page's resolver. */
async function selectBrand(member: Member, brandId: string): Promise<void> {
  await pinSessionBrand(member.session.accessToken, brandId);
  const { data, error } = await memberClient(member)
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (error) throw new Error(`brand read-back failed: ${error.message}`);
  expect(data, `the ${member.email} bench session must render brand ${brandId}`).toBe(brandId);
}

async function moneyLedgerCounts(member: Member): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const brandId of OPTIMIZER_BRANDS) {
    const { data, error } = await memberClient(member).rpc('optimizer_list_actions', {
      p_brand_id: brandId,
      p_limit: 500,
    });
    if (error) throw new Error(`optimizer_list_actions(${brandId}): ${error.message}`);
    const rows = Array.isArray(data) ? (data as Array<{ family?: unknown }>) : [];
    counts.set(brandId, rows.filter((row) => row.family === 'money').length);
  }
  return counts;
}

async function jainaRunCount(): Promise<number> {
  const { count, error } = await admin
    .schema('brand_profiles')
    .from('jaina_conversation_runs')
    .select('run_id', { count: 'exact', head: true })
    .in('user_email', [VIVO_EMAIL, EASYFIT_EMAIL]);
  if (error) throw new Error(`jaina run count failed: ${error.message}`);
  return count ?? 0;
}

async function memberContext(browser: Browser, member: Member): Promise<BrowserContext> {
  return browser.newContext({ storageState: member.session.state });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
}

const bare = (id: string | null | undefined) => (id ?? '').replace(/^act_/, '');

type PortfolioListRow = {
  id: string;
  name: string;
  ad_account_id: string | null;
  platforms?: string[] | null;
  pending_recommendations: number;
  pending_budget_moves?: number | null;
};

async function listPortfolios(member: Member, brandId: string): Promise<PortfolioListRow[]> {
  const { data, error } = await memberClient(member).rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error) throw new Error(`optimizer_list_portfolios(${brandId}): ${error.message}`);
  return (data ?? []) as PortfolioListRow[];
}

async function listMetaAccounts(member: Member, brandId: string): Promise<string[]> {
  const { data, error } = await memberClient(member)
    .schema('plugin_mcp')
    .rpc('list_brand_ad_accounts', { p_brand_id: brandId });
  if (error) throw new Error(`list_brand_ad_accounts(${brandId}): ${error.message}`);
  return [
    ...new Set(
      ((data ?? []) as Array<{ platform: string; account_id: string }>)
        .filter((row) => row.platform === 'meta_ads')
        .map((row) => row.account_id),
    ),
  ];
}

/** The Meta account the Actions/Activity views are opened on: the one holding the brand's Meta
 *  portfolios, else the brand's first Meta account (its Google portfolios ride along). */
async function optimizerAccountFor(member: Member, brandId: string): Promise<string | null> {
  const portfolios = await listPortfolios(member, brandId);
  const metaHolder = portfolios.find((p) => (p.platforms ?? ['meta']).includes('meta'));
  if (metaHolder?.ad_account_id) return metaHolder.ad_account_id;
  return (await listMetaAccounts(member, brandId))[0] ?? null;
}

const pendingWork = (p: PortfolioListRow) =>
  (p.pending_recommendations ?? 0) + (p.pending_budget_moves ?? 0);

/** Every visible text node under a locator, joined — what a reader of that region sees. */
async function textOf(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).innerText).join('\n'));
}

test.describe('beta-review fixes — live', () => {
  test.beforeAll(async () => {
    for (const email of [VIVO_EMAIL, EASYFIT_EMAIL]) {
      const session = await mintSessionBundleForEmail(email);
      const preferenceBefore = await readPreference(session.userId);
      members.set(email, { email, session, preferenceBefore });
      note(`${email}: user ${session.userId}, preference before ${preferenceBefore ?? '(none)'}`);
    }
    ledgerBefore = await moneyLedgerCounts(members.get(VIVO_EMAIL) as Member);
    jainaRunsBefore = await jainaRunCount();
    note(
      `money ledger before ${JSON.stringify(Object.fromEntries(ledgerBefore))}; jaina runs before ${jainaRunsBefore}`,
    );
  });

  // Each graded FAIL fails the test that graded it; the Recorder still carries every grade.
  let failedBefore = 0;
  test.beforeEach(() => {
    failedBefore = failedSteps.length;
  });
  test.afterEach(() => {
    expect(failedSteps.slice(failedBefore), 'graded assertions that failed').toEqual([]);
  });

  test.afterAll(async () => {
    try {
      const vivo = members.get(VIVO_EMAIL);
      if (vivo) {
        const ledgerAfter = await moneyLedgerCounts(vivo);
        const same = [...ledgerBefore].every(([id, n]) => ledgerAfter.get(id) === n);
        check(
          'safety.money-ledger',
          same,
          `before ${JSON.stringify(Object.fromEntries(ledgerBefore))} after ${JSON.stringify(Object.fromEntries(ledgerAfter))}`,
        );
      }
      const runsAfter = await jainaRunCount();
      check(
        'safety.jaina-runs',
        runsAfter === jainaRunsBefore,
        `Jaina runs for both members: before ${jainaRunsBefore}, after ${runsAfter}`,
      );
    } finally {
      for (const member of members.values()) {
        const after = await readPreference(member.session.userId);
        let restored = '';
        if (member.preferenceBefore && after !== member.preferenceBefore) {
          await restorePreference(member.session.userId, member.preferenceBefore);
          restored = ` → restored to ${await readPreference(member.session.userId)}`;
        }
        check(
          `safety.preference.${member.email}`,
          after === member.preferenceBefore,
          `before ${member.preferenceBefore}, after ${after}${restored}`,
        );
        const revoke = await revokeBenchSession(member.session.state, member.session.accessToken);
        note(
          `${member.email}: bench session ${revoke.sessionId} revoked=${revoke.revoked} pinsLeft=${revoke.pinsLeft} (${revoke.detail})`,
        );
      }
      recorder.print();
    }
    expect(failedSteps, 'graded assertions that failed (including safety)').toEqual([]);
  });

  // ── 1. Google tab ──────────────────────────────────────────────────────────────────
  test('1 · Google tab reads an ambiguous result basis instead of failing its shape check', async ({
    browser,
  }) => {
    const vivo = members.get(VIVO_EMAIL) as Member;
    const premises = [
      { brandId: EASYFIT_AGENCY_BRAND_ID, label: 'Easy Fit (agency row)' },
      { brandId: VIVO47_BRAND_ID, label: 'VIVO47' },
    ];
    for (const premise of premises) {
      await selectBrand(vivo, premise.brandId);
      const account = await optimizerAccountFor(vivo, premise.brandId);
      const context = await memberContext(browser, vivo);
      const page = await context.newPage();
      const reads: Record<string, unknown> = {};
      page.on('response', async (response) => {
        if (!response.url().includes('/functions/v1/paid-media-metrics')) return;
        const body = response.request().postDataJSON() as {
          platform?: string;
          scope?: string;
        } | null;
        if (body?.platform !== 'google-ads' || !body.scope) return;
        reads[body.scope] = await response.json().catch(() => null);
      });
      try {
        const query = new URLSearchParams({
          tab: 'performance',
          optimizerView: 'overview',
          platform: 'google_ads',
        });
        if (account) query.set('adAccountId', account);
        await page.goto(`/scale?${query}`, { waitUntil: 'domcontentloaded' });
        await expect(
          page.locator('[data-testid="optimizer-overview"][data-platform-tab="google_ads"]'),
        ).toBeVisible({ timeout: 180_000 });
        // The tab is Google's own read in full (tiles) when the producer has not read Google, and
        // the campaign-type breakdown under the producer's row when it has — either one, or the
        // read's error line, is the settled state.
        const googleRead = page.locator(
          '[data-testid="google-tab"], [data-testid="google-breakdown"], [data-testid="google-breakdown-error"]',
        );
        const shapeError = page.getByText(SHAPE_ERROR);
        await expect(googleRead.or(shapeError).first()).toBeVisible({ timeout: 180_000 });
        await expect
          .poll(() => Object.keys(reads).length, { timeout: 60_000 })
          .toBeGreaterThanOrEqual(2);

        const overview = reads.account_overview as {
          result_basis?: { unambiguous?: boolean };
          metrics?: { cpa?: number | null };
        } | null;
        const campaigns = reads.top_campaigns as {
          result_basis?: { unambiguous?: boolean };
          rows?: Array<{ metrics?: { conversions?: number | null } }>;
        } | null;
        const ambiguous =
          overview?.result_basis?.unambiguous === false ||
          campaigns?.result_basis?.unambiguous === false;
        const nullConversions = (campaigns?.rows ?? []).filter(
          (row) => row.metrics?.conversions === null,
        ).length;
        note(
          `${premise.label}: live google read result_basis ${JSON.stringify(overview?.result_basis)}, metrics.cpa ${JSON.stringify(overview?.metrics?.cpa)}, top_campaigns rows ${(campaigns?.rows ?? []).length} (null conversions on ${nullConversions})`,
        );

        const shapeErrors = await shapeError.count();
        check(
          `google.${premise.brandId.slice(0, 8)}.no-shape-error`,
          shapeErrors === 0,
          shapeErrors === 0
            ? `"${SHAPE_ERROR}" absent; Google's read rendered`
            : `the tab still says "${await shapeError.first().innerText()}"`,
        );
        if (ambiguous) {
          const shown = (
            await textOf(
              page,
              '[data-testid="google-tab"], [data-testid="google-breakdown"], [data-testid="google-breakdown-error"]',
            )
          )
            .replace(/\s+/g, ' ')
            .trim();
          const saysNoSingle = shown.toLowerCase().includes(NO_SINGLE_RESULT.toLowerCase());
          const zeroConversions = shown.match(/\b0 conv\./g) ?? [];
          check(
            `google.${premise.brandId.slice(0, 8)}.no-single-result`,
            saysNoSingle && shown.includes('—') && zeroConversions.length === 0,
            `Google read reads "${shown.slice(0, 400)}"`,
          );
        } else {
          recorder.record(
            `google.${premise.brandId.slice(0, 8)}.no-single-result`,
            'SKIP',
            'the live read named a single result (unambiguous) — the ambiguous branch did not occur here',
          );
        }
        await shoot(page, `1-google-${premise.brandId.slice(0, 8)}`);
      } finally {
        await context.close();
      }
    }
  });

  // ── 2. Jaina clarification ─────────────────────────────────────────────────────────
  test('2 · stored clarifications render their real question, options while pending, and no report chrome', async ({
    browser,
  }) => {
    const runsTable = admin.schema('brand_profiles').from('jaina_conversation_runs');
    const events = admin.schema('brand_profiles').from('jaina_conversation_run_events');
    const { data: asked, error } = await events
      .select('run_id,user_email,payload')
      .eq('event_type', 'response.clarification_request')
      .in('user_email', [VIVO_EMAIL, EASYFIT_EMAIL])
      .order('id', { ascending: false })
      .limit(40);
    if (error) throw new Error(`clarification lookup failed: ${error.message}`);

    type Premise = {
      kind: 'answered' | 'pending';
      email: string;
      runId: string;
      sessionId: string;
      brandId: string;
      adAccountId: string | null;
      question: string;
      options: string[];
    };
    const premises: Premise[] = [];
    for (const row of (asked ?? []) as Array<{
      run_id: string;
      user_email: string;
      payload: { clarification?: { question?: string } };
    }>) {
      const { data: run } = await runsTable
        .select('session_id,brand_id,ad_account_id,created_at')
        .eq('run_id', row.run_id)
        .single();
      if (!run) continue;
      const { count: later } = await runsTable
        .select('run_id', { count: 'exact', head: true })
        .eq('session_id', run.session_id)
        .gt('created_at', run.created_at);
      const kind = (later ?? 0) === 0 ? 'pending' : 'answered';
      // The established bench member's answered clarification, and the one clarification in
      // production nobody has answered yet (the card's case), whoever asked it.
      if (kind === 'answered' && row.user_email !== VIVO_EMAIL) continue;
      if (premises.some((premise) => premise.kind === kind)) continue;
      const { data: blocks } = await events
        .select('payload')
        .eq('run_id', row.run_id)
        .eq('event_type', 'response.block.delta');
      const survey = (blocks ?? [])
        .map(
          (block) =>
            (block.payload as { block?: { category?: string; alternatives?: string[] } }).block,
        )
        .find((block) => block?.category === 'survey');
      premises.push({
        kind,
        email: row.user_email,
        runId: row.run_id,
        sessionId: run.session_id,
        brandId: run.brand_id,
        adAccountId: run.ad_account_id,
        question: row.payload.clarification?.question ?? '',
        options: survey?.alternatives ?? [],
      });
    }
    expect(premises.length, 'PREMISE: production must hold a stored clarification').toBeGreaterThan(
      0,
    );

    for (const premise of premises) {
      const tag = `clarification.${premise.kind}`;
      note(
        `${tag} premise: ${premise.email} run ${premise.runId} session ${premise.sessionId} brand ${premise.brandId} account ${premise.adAccountId}; question "${premise.question}", options ${JSON.stringify(premise.options)}`,
      );
      const member = members.get(premise.email) as Member;
      if (member.email !== VIVO_EMAIL && member.preferenceBefore !== premise.brandId) {
        recorder.record(
          tag,
          'SKIP',
          `${member.email} has ${member.preferenceBefore} selected, not ${premise.brandId}; the bench does not move another member's brand`,
        );
        continue;
      }
      await selectBrand(member, premise.brandId);
      const context = await memberContext(browser, member);
      const page = await context.newPage();
      // What the history read handed the page for this conversation: the part types of the
      // assistant message that asks, so a missing card can be told apart from a missing part.
      const historyParts: string[][] = [];
      page.on('response', async (response) => {
        const url = response.url();
        if (
          !url.includes('/api/agents/jaina/chat/conversations') ||
          !url.includes(premise.sessionId)
        )
          return;
        const body = (await response.json().catch(() => null)) as {
          uiMessages?: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>;
        } | null;
        for (const message of body?.uiMessages ?? []) {
          const parts = message.parts ?? [];
          if (message.role !== 'assistant') continue;
          if (!JSON.stringify(parts).includes(premise.question)) continue;
          historyParts.push(parts.map((part) => part.type ?? '?'));
        }
      });
      try {
        const query = new URLSearchParams({ tab: 'jaina', sessionId: premise.sessionId });
        if (premise.adAccountId) query.set('adAccountId', premise.adAccountId);
        await page.goto(`/scale?${query}`, { waitUntil: 'domcontentloaded' });
        const log = page.getByRole('log');
        await expect(log.getByText(premise.question).first()).toBeVisible({ timeout: 180_000 });
        await page.waitForTimeout(3_000);

        const fixedLabel = await page.getByText('Clarification needed.', { exact: true }).count();
        check(
          `${tag}.no-fallback-label`,
          fixedLabel === 0,
          `"Clarification needed." rendered ${fixedLabel} time(s)`,
        );

        const cards = page.getByTestId('jaina-clarification');
        const cardQuestions = await page
          .getByTestId('jaina-clarification-question')
          .allInnerTexts();
        note(
          `${tag}: history uiMessages asking it carry parts ${JSON.stringify(historyParts)} (a card needs 'data-jaina-clarification')`,
        );
        // The question must be on screen in the words it was asked, card or not.
        const lines = await log
          .locator('p, [data-testid="jaina-clarification-question"]')
          .filter({ hasText: premise.question })
          .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
        check(
          `${tag}.question`,
          lines.length > 0,
          `turn(s) read ${JSON.stringify(lines.slice(0, 2))}; clarification card(s) ${cardQuestions.length}`,
        );
        if (premise.kind === 'pending') {
          // The card (question as body, offered answers as buttons) is built from the
          // data-jaina-clarification part. A history read that carries no such part cannot
          // render one; that is the at-rest projection's gap, graded SKIP and named, never PASS.
          const carriesPart = historyParts.some((parts) =>
            parts.includes('data-jaina-clarification'),
          );
          if (!carriesPart) {
            recorder.record(
              `${tag}.card`,
              'SKIP',
              `the stored history hands this turn only ${JSON.stringify(historyParts)} — no data-jaina-clarification part and no survey block — so the card hop is reachable only on a live streamed turn, which this read-only bench does not start`,
            );
          } else {
            check(
              `${tag}.card-question`,
              cardQuestions.some((text) => text.trim() === premise.question),
              `card question(s) ${JSON.stringify(cardQuestions)}`,
            );
            const optionTexts = await cards
              .getByTestId('jaina-clarification-options')
              .getByRole('button')
              .allInnerTexts();
            check(
              `${tag}.card-options`,
              premise.options.every((option) => optionTexts.includes(option)),
              `stored alternatives ${JSON.stringify(premise.options)}; buttons on the card ${JSON.stringify(optionTexts)} (not clicked)`,
            );
          }
        }

        // Every assistant turn that asks this question: neither the Evidence fold nor an export.
        const asking = log
          .locator('p, [data-testid="jaina-clarification-question"]')
          .filter({ hasText: premise.question });
        const turns = asking.locator(
          'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]',
        );
        const turnCount = await turns.count();
        const chrome: string[] = [];
        for (let index = 0; index < turnCount; index += 1) {
          const turn = turns.nth(index);
          const exports = await turn
            .getByRole('button', { name: /pdf|sheets|email|export|html/i })
            .allInnerTexts();
          const evidence = await turn.getByText(/^(Evidence|Evidencia)$/).count();
          const readAs = await turn.getByText(/was read as/i).count();
          if (exports.length > 0 || evidence > 0 || readAs > 0)
            chrome.push(
              `turn ${index}: exports ${JSON.stringify(exports)}, evidence ${evidence}, "was read as" ${readAs}`,
            );
        }
        check(
          `${tag}.no-report-chrome`,
          turnCount > 0 && chrome.length === 0,
          chrome.length === 0
            ? `${turnCount} turn(s) asking it, none with Evidence / "was read as" / PDF·Sheets·Email·HTML exports`
            : chrome.join('; '),
        );
        await asking.first().scrollIntoViewIfNeeded();
        await shoot(page, `2-${tag}`);
      } finally {
        await context.close();
      }
    }
  });

  // ── 3. Jaina failed run ────────────────────────────────────────────────────────────
  test('3 · the broken Easy Fit run opens to a terminal state and is not toasted on load', async ({
    browser,
  }) => {
    const easyfit = members.get(EASYFIT_EMAIL) as Member;
    const { data: runs, error } = await admin
      .schema('brand_profiles')
      .from('jaina_conversation_runs')
      .select('run_id,session_id,brand_id,ad_account_id,status,created_at')
      .eq('user_email', EASYFIT_EMAIL)
      .gte('created_at', FAILED_RUN_WINDOW.from)
      .lte('created_at', FAILED_RUN_WINDOW.to);
    if (error) throw new Error(`failed-run lookup failed: ${error.message}`);
    const run = (runs ?? [])[0] as
      | {
          run_id: string;
          session_id: string;
          brand_id: string;
          ad_account_id: string | null;
          status: string;
          created_at: string;
        }
      | undefined;
    expect(run, 'PREMISE: the 2026-10-20 Easy Fit run must still be stored').toBeTruthy();
    const target = run as NonNullable<typeof run>;
    const runEvents = admin.schema('brand_profiles').from('jaina_conversation_run_events');
    const [{ count: errorFrames }, { count: toolBatches }] = await Promise.all([
      runEvents
        .select('id', { count: 'exact', head: true })
        .eq('run_id', target.run_id)
        .eq('event_type', 'error'),
      runEvents
        .select('id', { count: 'exact', head: true })
        .eq('run_id', target.run_id)
        .eq('event_type', 'tool.batch'),
    ]);
    note(
      `failed-run premise: ${target.run_id} (row status ${target.status}, created ${target.created_at}) session ${target.session_id} brand ${target.brand_id} account ${target.ad_account_id}; log has ${toolBatches} tool.batch and ${errorFrames} error frame(s)`,
    );

    // Read-only on this member: their selected brand must already be the conversation's.
    if (easyfit.preferenceBefore !== target.brand_id) {
      recorder.record(
        'failed-run.*',
        'SKIP',
        `${EASYFIT_EMAIL} has ${easyfit.preferenceBefore} selected, not ${target.brand_id}; the bench does not move another member's brand`,
      );
      test.skip(true, 'member brand differs');
    }
    await selectBrand(easyfit, target.brand_id);

    const context = await memberContext(browser, easyfit);
    const page = await context.newPage();
    const sdkErrors: string[] = [];
    const watch = (text: string) => {
      if (/No tool invocation found/i.test(text)) sdkErrors.push(text.slice(0, 200));
    };
    page.on('pageerror', (err) => watch(err.message));
    page.on('console', (msg) => watch(msg.text()));
    // Whether the page replayed the run's log (the resume GET that used to throw), and how.
    const replays: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/jaina/chat/stream')) return;
      replays.push(`${response.request().method()} ${response.status()}`);
    });
    try {
      const query = new URLSearchParams({ tab: 'jaina', sessionId: target.session_id });
      if (target.ad_account_id) query.set('adAccountId', target.ad_account_id);
      await page.goto(`/scale?${query}`, { waitUntil: 'domcontentloaded' });

      // The conversation's own question must be on screen: the link opened THIS conversation.
      await expect(page.getByText(/Hacemos un análisis de la cuenta/).first()).toBeVisible({
        timeout: 180_000,
      });

      // Terminal: the interrupted notice, or the turn settling with no live run controls.
      const interrupted = page.getByText(INTERRUPTED_TEXT);
      const stop = page.getByRole('button', { name: /^Stop/ });
      const settled = await expect
        .poll(async () => (await interrupted.count()) > 0 || (await stop.count()) === 0, {
          timeout: 120_000,
          intervals: [2_000],
        })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      // Hold it: a Working/Stop that comes back is the endless loop this fix removed.
      await page.waitForTimeout(15_000);
      const notice = (await interrupted.count()) > 0 ? await interrupted.first().innerText() : null;
      const stopCount = await stop.count();
      const tryAgain = await page.getByRole('button', { name: /Try again/i }).count();
      const domSdkError = await page.getByText(/No tool invocation found/i).count();
      const transcript = await textOf(page, 'main');
      const working = /\bWorking\b/.test(transcript);
      note(
        `failed-run render: notice ${JSON.stringify(notice)}, Stop buttons ${stopCount}, Try again ${tryAgain}, "Working" in main ${working}, SDK error in DOM ${domSdkError}, in console ${sdkErrors.length}; stream requests ${JSON.stringify(replays)}`,
      );
      if (!replays.some((replay) => replay.startsWith('GET 200'))) {
        recorder.record(
          'failed-run.orphan-replay',
          'SKIP',
          `the Backend answered the resume GET with ${JSON.stringify(replays)} — it no longer replays this run's log, so the orphan-chunk drop was not exercised on this run; the stored turn rendered from history`,
        );
      }
      check(
        'failed-run.no-sdk-error',
        domSdkError === 0 && sdkErrors.length === 0,
        `"No tool invocation found": DOM ${domSdkError}, console/pageerror ${JSON.stringify(sdkErrors.slice(0, 2))}`,
      );
      check(
        'failed-run.terminal',
        settled && stopCount === 0 && !working,
        `after 15s hold: Stop ${stopCount}, Working ${working}, notice ${JSON.stringify(notice)}`,
      );
      check(
        'failed-run.no-resume-loop',
        notice === null || tryAgain === 0,
        notice === null
          ? 'no failure notice rendered (the stored turn rendered as history)'
          : `interrupted notice with ${tryAgain} Try again button(s)`,
      );
      await shoot(page, '3-jaina-failed-run');
      await context.close();

      // The Optimizer load that used to greet this member with "Jaina run failed" every time.
      const fresh = await memberContext(browser, easyfit);
      const optimizer = await fresh.newPage();
      try {
        const toastCounts: number[] = [];
        for (let visit = 0; visit < 2; visit += 1) {
          if (visit === 0)
            await optimizer.goto(
              `/scale?tab=performance${target.ad_account_id ? `&adAccountId=${target.ad_account_id}` : ''}`,
              { waitUntil: 'domcontentloaded' },
            );
          else await optimizer.reload({ waitUntil: 'domcontentloaded' });
          await expect(optimizer.getByRole('tab', { name: 'Actions' })).toBeVisible({
            timeout: 180_000,
          });
          await optimizer.waitForTimeout(20_000);
          toastCounts.push(await optimizer.getByText(/Jaina run failed/).count());
        }
        check(
          'failed-run.no-toast-on-load',
          toastCounts.every((count) => count === 0),
          `"Jaina run failed" toasts on Optimizer load, then reload: ${JSON.stringify(toastCounts)}`,
        );
      } finally {
        await fresh.close();
      }
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  // ── 4 + 5. Actions tray and Activity ───────────────────────────────────────────────
  test('4+5 · Actions agrees with its numbers, Activity names ad sets and settings', async ({
    browser,
  }) => {
    const vivo = members.get(VIVO_EMAIL) as Member;
    for (const brandId of OPTIMIZER_BRANDS) {
      const tag = brandId.slice(0, 8);
      await selectBrand(vivo, brandId);
      const account = await optimizerAccountFor(vivo, brandId);
      if (!account) {
        recorder.record(`actions.${tag}`, 'SKIP', 'no Meta account to open the optimizer on');
        continue;
      }
      const portfolios = await listPortfolios(vivo, brandId);
      const inView = portfolios.filter(
        (p) =>
          bare(p.ad_account_id) === bare(account) || !(p.platforms ?? ['meta']).includes('meta'),
      );
      const expected = new Map(inView.map((p) => [p.name, pendingWork(p)]));
      note(
        `${tag} on ${account}: list read pending ${JSON.stringify(Object.fromEntries(expected))}`,
      );

      // Where a name EXISTS: every roster of the brand's portfolios, read as the member.
      const rosterNames = new Map<string, string>();
      for (const portfolio of portfolios) {
        const { data } = await memberClient(vivo).rpc('optimizer_list_portfolio_adsets', {
          p_portfolio_id: portfolio.id,
        });
        for (const row of (data ?? []) as Array<{ adset_id?: string; adset_name?: string | null }>)
          if (row.adset_id && row.adset_name?.trim()) rosterNames.set(row.adset_id, row.adset_name);
      }

      const context = await memberContext(browser, vivo);
      const page = await context.newPage();
      try {
        // ── Actions ──
        await page.goto(
          `/scale?tab=performance&optimizerView=actions&adAccountId=${encodeURIComponent(account)}`,
          { waitUntil: 'domcontentloaded' },
        );
        const actionsTab = page.getByRole('tab', { name: /Actions/ });
        await expect(actionsTab).toBeVisible({ timeout: 180_000 });
        await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(
          0,
          { timeout: 120_000 },
        );
        const trays = page.getByTestId('queue-tray');
        const anyPending = [...expected.values()].some((n) => n > 0);
        if (anyPending) await expect(trays.first()).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(5_000);

        const trayCount = await trays.count();
        const counts: string[] = [];
        let countsAgree = true;
        for (let index = 0; index < trayCount; index += 1) {
          const tray = trays.nth(index);
          const name = (await tray.locator('header h3').first().innerText()).trim();
          const shownText = await tray
            .locator('header h3 + span')
            .first()
            .evaluate((el) => (el.childNodes[0]?.textContent ?? '').trim());
          const shown = Number(shownText);
          const listed = expected.get(name);
          counts.push(`${name}: tray ${shown} / list ${listed ?? 'not listed'}`);
          if (listed === undefined || shown !== listed) countsAgree = false;
        }
        const expectedTrays = [...expected.values()].filter((n) => n > 0).length;
        check(
          `actions.${tag}.pending-count`,
          countsAgree && trayCount === expectedTrays,
          `${trayCount} tray(s), ${expectedTrays} listed with pending work — ${counts.join('; ') || 'none'}`,
        );

        const tabText = (await actionsTab.innerText()).replace(/\s+/g, ' ').trim();
        note(`${tag}: Actions tab reads "${tabText}"`);

        const actionsText = trayCount > 0 ? await textOf(page, '[data-testid="queue-tray"]') : '';
        const negativeDays = actionsText.match(/-\d+\s+days?\b/g) ?? [];
        const zeroMove = actionsText.match(/Moving\s+\S*0\.00/g) ?? [];
        const rawTrigger =
          actionsText.match(/\bfor (off meta|velocity cap binding|[a-z]+(_[a-z]+)+)\b/g) ?? [];
        check(
          `actions.${tag}.honest-figures`,
          negativeDays.length === 0 && zeroMove.length === 0 && rawTrigger.length === 0,
          `negative days ${JSON.stringify(negativeDays)}, "Moving 0.00" ${JSON.stringify(zeroMove)}, raw trigger words ${JSON.stringify(rawTrigger)} over ${actionsText.length} chars`,
        );
        const blockedRows = page.locator('[data-row-key]').filter({
          has: page.getByTestId('queue-row-blocked'),
        });
        const blocked = await blockedRows.count();
        let blockedWithApprove = 0;
        for (let index = 0; index < blocked; index += 1)
          blockedWithApprove += await blockedRows
            .nth(index)
            .getByRole('button', { name: /^Approve/ })
            .count();
        check(
          `actions.${tag}.withdrawn-no-approve`,
          blockedWithApprove === 0,
          `${blocked} withdrawn row(s), ${blockedWithApprove} with an Approve button`,
        );
        await shoot(page, `4-actions-${tag}`);

        // ── Activity ──
        await page.getByRole('tab', { name: 'Activity' }).click();
        await expect(page).toHaveURL(/optimizerView=logs/);
        const widest = page.getByRole('button', { name: FEED_WINDOW_LABEL, exact: true });
        await expect(widest).toBeVisible({ timeout: 120_000 });
        await widest.click();
        const timeline = page.getByTestId('action-timeline');
        const empty = page.getByText('Nothing has changed yet');
        await expect(timeline.or(empty).first()).toBeVisible({ timeout: 120_000 });
        if ((await timeline.count()) === 0) {
          recorder.record(
            `activity.${tag}`,
            'SKIP',
            `no action rows in the ${FEED_WINDOW_LABEL} window`,
          );
          continue;
        }
        // Rosters arrive after the feed; let the names land.
        await page.waitForTimeout(8_000);
        const rows = await timeline.locator('[data-action-id]').evaluateAll((nodes) =>
          nodes.map((node) => {
            const line = node.querySelector('p');
            const spans = line
              ? Array.from(line.children).filter((el) => el.tagName === 'SPAN')
              : [];
            const label = (spans[0] as HTMLElement | undefined)?.innerText.trim() ?? '';
            const entity = (spans[1] as HTMLElement | undefined) ?? null;
            return {
              id: node.getAttribute('data-action-id') ?? '',
              label,
              line: (line as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '',
              entityText: entity?.innerText.trim() ?? null,
              entityTitle: entity?.getAttribute('title') ?? null,
              change:
                (node.querySelector('[data-figure-role="change"]') as HTMLElement | null)?.innerText
                  .replace(/\s+/g, ' ')
                  .trim() ?? null,
            };
          }),
        );
        const bareIds = rows.filter((row) => row.entityText && /^\d{15,}$/.test(row.entityText));
        const bareWithName = bareIds.filter((row) => rosterNames.has(row.entityText as string));
        const named = rows.filter(
          (row) => row.entityTitle && row.entityText && row.entityText !== row.entityTitle,
        ).length;
        check(
          `activity.${tag}.adset-names`,
          bareWithName.length === 0,
          `${rows.length} rows; ${named} named with the id on hover; ${bareIds.length} bare id title(s), ${bareWithName.length} of them named by a roster read (${rosterNames.size} roster names) ${JSON.stringify(bareWithName.slice(0, 3).map((r) => r.line))}`,
        );
        // The label and the before/after are ours to word; an entity's own name (a campaign
        // called "bench_fx_…") is the advertiser's and is not graded.
        const worded = (row: (typeof rows)[number]) => `${row.label} ${row.change ?? ''}`;
        const rawBoolean = rows.filter(
          (row) =>
            /\b(true|false)\b/.test(row.label) ||
            /^(true|false|on|off)\s+(true|false|on|off)\b/i.test(row.change ?? ''),
        );
        const snake = rows.filter(
          (row) => /\b[a-z]+(_[a-z0-9]+)+\b/.test(worded(row)) || /:[a-z]+_[a-z]+/.test(row.label),
        );
        const rawIds = rows.filter((row) =>
          /\b\d{15,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(row.change ?? ''),
        );
        check(
          `activity.${tag}.setting-labels`,
          rawBoolean.length === 0 && snake.length === 0 && rawIds.length === 0,
          `raw true/false ${JSON.stringify(rawBoolean.slice(0, 3).map((r) => r.line))}; snake_case ${JSON.stringify(snake.slice(0, 4).map((r) => `${r.line} | ${r.change}`))}; raw ids in before → after ${JSON.stringify(rawIds.slice(0, 3).map((r) => `${r.line} | ${r.change}`))}`,
        );
        const settingLines = rows
          .filter(
            (row) =>
              !row.entityText || /Autopilot|turned (on|off)|Mode|target|budget/i.test(row.line),
          )
          .slice(0, 6)
          .map((row) => `${row.line}${row.change ? ` | ${row.change}` : ''}`);
        note(`${tag}: sample setting/plain lines ${JSON.stringify(settingLines)}`);
        await shoot(page, `5-activity-${tag}`);
      } finally {
        await context.close();
      }
    }
  });

  // ── 6. One headline figure ─────────────────────────────────────────────────────────
  test('6 · the list, the Overview and the portfolio hero print one headline figure', async ({
    browser,
  }) => {
    const vivo = members.get(VIVO_EMAIL) as Member;
    /** Portfolio pages opened per brand: every "Tours" one, then the first few others. */
    const DETAIL_CAP = 4;
    const raw = (page: Page, key: string) =>
      page
        .locator(`[data-figure="${key}"]`)
        .first()
        .evaluate((el) => el.getAttribute('data-figure-raw') ?? '')
        .catch(() => null);
    const signedPct = (text: string | null): number | null => {
      const row = /^(\d+)% (over|under)$/.exec(text ?? '');
      if (row) return Number(row[1]) * (row[2] === 'over' ? 1 : -1);
      const hero = /^([+−])(\d+)%$/.exec(text ?? '');
      if (hero) return Number(hero[2]) * (hero[1] === '+' ? 1 : -1);
      return text === 'on target' ? 0 : null;
    };
    let compared = 0;
    for (const brandId of OPTIMIZER_BRANDS) {
      const tag = brandId.slice(0, 8);
      await selectBrand(vivo, brandId);
      const account = await optimizerAccountFor(vivo, brandId);
      if (!account) {
        recorder.record(`figure.${tag}`, 'SKIP', 'no Meta account to open the optimizer on');
        continue;
      }
      const inView = (await listPortfolios(vivo, brandId)).filter(
        (p) =>
          bare(p.ad_account_id) === bare(account) && (p.platforms ?? ['meta']).includes('meta'),
      );
      if (inView.length === 0) {
        recorder.record(`figure.${tag}`, 'SKIP', `no Meta portfolio on ${account}`);
        continue;
      }
      const context = await memberContext(browser, vivo);
      const page = await context.newPage();
      try {
        const base = `/scale?tab=performance&adAccountId=${encodeURIComponent(account)}`;
        // ── the Portfolios list ──
        await page.goto(`${base}&optimizerView=portfolios`, { waitUntil: 'domcontentloaded' });
        const table = page.getByTestId('portfolio-table');
        await expect(table).toBeVisible({ timeout: 180_000 });
        await expect(table).toHaveAttribute('data-figures-pending', 'false', { timeout: 180_000 });
        type ListFigure = {
          cost: string | null;
          pct: number | null;
          source: string | null;
          asOf: string | null;
          chip: string;
        };
        const list = new Map<string, ListFigure>();
        for (const p of inView) {
          const row = page.locator(`[data-portfolio-id="${p.id}"]`).first();
          if ((await row.count()) === 0) continue;
          const chip = (await row.getByTestId('portfolio-state-chip').innerText()).trim();
          const asOf = row.getByTestId('portfolio-figure-as-of');
          list.set(p.id, {
            cost: await raw(page, `portfolios.${p.id}.cost`),
            pct: signedPct(chip),
            chip,
            source: await row
              .locator('[data-figure-source]')
              .first()
              .getAttribute('data-figure-source')
              .catch(() => null),
            asOf: (await asOf.count()) > 0 ? (await asOf.innerText()).trim() : null,
          });
        }
        await shoot(page, `6-list-${tag}`);

        // ── the Overview rows ──
        await page.goto(`${base}&optimizerView=overview`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('portfolio-rows')).toBeVisible({ timeout: 180_000 });
        const overview = new Map<string, { cost: string | null; spend: string | null }>();
        for (const id of list.keys()) {
          overview.set(id, {
            cost: await raw(page, `portfolio-row.${id}.cost`),
            spend: await raw(page, `portfolio-row.${id}.spend`),
          });
        }
        await shoot(page, `6-overview-${tag}`);

        const ordered = inView.filter((p) => list.has(p.id));
        const toOpen = [
          ...ordered.filter((p) => /tours/i.test(p.name)),
          ...ordered.filter((p) => !/tours/i.test(p.name)),
        ].slice(0, Math.max(DETAIL_CAP, ordered.filter((p) => /tours/i.test(p.name)).length));
        for (const p of toOpen) {
          const rowFigure = list.get(p.id) as ListFigure;
          const overviewFigure = overview.get(p.id);
          // ── the hero, at its default range (no `range` param) ──
          await page.goto(`${base}&optimizerView=portfolios&portfolio=${p.id}`, {
            waitUntil: 'domcontentloaded',
          });
          const anchor = page.getByTestId('portfolio-anchor');
          const appeared = await anchor
            .waitFor({ state: 'visible', timeout: 150_000 })
            .then(() => true)
            .catch(() => false);
          if (!appeared) {
            recorder.record(
              `figure.${tag}.${p.name}`,
              'SKIP',
              `no hero anchor (first cycle or no headline) — list ${rowFigure.chip}`,
            );
            continue;
          }
          // The hero settles once its reads land: wait until the anchor holds still for 6s.
          let last = '';
          let stableSince = Date.now();
          const deadline = Date.now() + 90_000;
          while (Date.now() < deadline) {
            const now = `${await raw(page, 'anchor.cost')}|${await raw(page, 'tiles.spend')}|${await page.getByTestId('anchor-as-of').count()}`;
            if (now !== last) {
              last = now;
              stableSince = Date.now();
            } else if (Date.now() - stableSince > 6_000) break;
            await page.waitForTimeout(1_000);
          }
          const heroCost = await raw(page, 'anchor.cost');
          const heroSpend = await raw(page, 'tiles.spend');
          const vs = page.getByTestId('anchor-vs-target');
          const heroPct = (await vs.count()) > 0 ? signedPct((await vs.innerText()).trim()) : null;
          const heroAsOfNode = page.getByTestId('anchor-as-of');
          const heroAsOf =
            (await heroAsOfNode.count()) > 0 ? (await heroAsOfNode.innerText()).trim() : null;
          const heroLine = `hero cost ${heroCost} spend ${heroSpend} vs ${heroPct}% ${heroAsOf ?? '(live)'}`;
          const listLine =
            `list cost ${rowFigure.cost} ${rowFigure.chip} [${rowFigure.source ?? 'none'}] ${rowFigure.asOf ?? ''}`.trim();
          const overviewLine = `overview cost ${overviewFigure?.cost} spend ${overviewFigure?.spend}`;
          const sameCost = heroCost === rowFigure.cost && overviewFigure?.cost === rowFigure.cost;
          const sameSpend = heroSpend === overviewFigure?.spend;
          const samePct = rowFigure.pct == null || heroPct === rowFigure.pct;
          const sameDate = heroAsOf === rowFigure.asOf;
          // A snapshot is never unlabelled: a snapshot row says its date, live rows say nothing.
          const labelled =
            rowFigure.source === 'snapshot'
              ? /^as of [A-Z][a-z]{2} \d{1,2}( · \d+ days old)?$/.test(rowFigure.asOf ?? '')
              : rowFigure.asOf == null;
          compared += 1;
          check(
            `figure.${tag}.${p.name}`,
            sameCost && sameSpend && samePct && sameDate && labelled,
            `${listLine} | ${overviewLine} | ${heroLine}`,
          );
        }
        await shoot(page, `6-hero-${tag}`);
      } finally {
        await context.close();
      }
    }
    check('figure.compared', compared > 0, `${compared} portfolio(s) compared list ↔ hero`);
  });
});
