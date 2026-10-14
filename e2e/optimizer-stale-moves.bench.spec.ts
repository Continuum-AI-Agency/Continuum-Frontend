import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { PortfolioListItem } from '@continuum/contracts';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pinProdSupabase } from './paid-parity.env';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { PROD_SUPABASE_URL, readBackendEnv } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:stale-moves:e2e:bench — a portfolio whose last cycle can no longer be acted on
// shows its moves read-only as withdrawn, in a real Chrome against the real Frontend and
// PRODUCTION Supabase.
//
//   (A) roster absent  latest run holds a cut and a raise; every member has missing_since
//                      → "Last proposal, <date> — withdrawn: …roster…", no Apply/Approve,
//                        not in the Actions queue
//   (B) moved ad set   B1's fresh run moves x1,x2; x1 is then enrolled into B2 through the
//                      real optimizer_enroll_adset → x1 reads "Withdrawn — now in B2", no
//                      Apply/Approve, B1 not in the Actions queue
//   (C) control        a fresh portfolio with a current run keeps Apply and its queue rows —
//                      so the bench cannot pass by withdrawing everything
//
// The list read (optimizer_list_portfolios, as the bench user) is printed for every seeded
// row first. When its rows carry no last_cycle_current key, migration 20261014220200 is not
// applied in prod: that ONE named check fails and every scenario check is skipped by name.
//
// Identity: the internal bench login on the internal bench brand only (FIXTURES in
// Continuum-Backend/scripts/_bench/fixtures.ts). Every row is on that brand, named 'bench:',
// paused at creation so optimizer_claim_due_portfolios (status = 'active' only) never cycles
// it, and deleted by id in afterAll on every path. Creation runs optimizer_create_portfolio as
// the bench user inside one Management API transaction with the pause, so no scheduler tick
// can land between the two; the optimizer schema is not exposed to PostgREST, so the delete
// goes the same way. Everything else is the real RPCs over PostgREST.
// ---------------------------------------------------------------------------

const BENCH = 'optimizer:stale-moves:e2e:bench';
const BENCH_BRAND_ID =
  process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const MIGRATION = '20261014220200_optimizer_list_portfolios_current_moves.sql';
const SHOTS_DIR = resolve(process.cwd(), 'e2e/.artifacts/optimizer-stale-moves');
const RUN = Date.now().toString(36);
const PREFIX = `bench: stale-moves ${RUN}`;
const SINCE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const { publishableKey, serviceRoleKey } = pinProdSupabase();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });

type Slot = 'A' | 'B1' | 'B2' | 'C';
const SLOTS: Slot[] = ['A', 'B1', 'B2', 'C'];
const NAMES: Record<Slot, string> = {
  A: `${PREFIX} A roster absent`,
  B1: `${PREFIX} B1 loses x1`,
  B2: `${PREFIX} B2 gains x1`,
  C: `${PREFIX} C control`,
};
type AdsetRef = { adset_id: string; adset_name: string };
const adset = (key: string): AdsetRef => ({
  adset_id: `bench_sm_${RUN}_${key}`,
  adset_name: `bench: ${RUN} ${key}`,
});
const AD = {
  a1: adset('a1'),
  a2: adset('a2'),
  x1: adset('x1'),
  x2: adset('x2'),
  c1: adset('c1'),
  c2: adset('c2'),
};

type ListRow = { id: string; name: string } & Partial<
  Pick<
    PortfolioListItem,
    'last_cycle_current' | 'withdrawn_reason' | 'pending_budget_moves' | 'last_actual_cycle_at'
  >
>;

const SQL_CHECK = `${MIGRATION.slice(0, 14)} is applied in prod`;
const SQL_GATE = `skipped: ${SQL_CHECK} failed`;
const ACCOUNT_CHECK = 'the bench brand has a Meta ad account assigned (Scale needs one)';
const ACCOUNT_GATE = `skipped: ${ACCOUNT_CHECK} failed`;
const A_LIST = '(A) list: last_cycle_current false · roster_absent · 0 pending moves';
const A_UI = [
  '(A) detail: "Last proposal, <date> — withdrawn" names the roster',
  '(A) no Apply budgets / budget-move control for its moves',
];
const B_MOVE = '(B) optimizer_enroll_adset, as the bench user, moves x1 from B1 to B2';
const B_LIST = '(B) list: B1 counts 2 pending moves before the move, 0 after';
const B_UI = [
  '(B) detail: x1 reads "Withdrawn — now in B2" (or no longer in this portfolio)',
  '(B) no Apply budgets / budget-move control for its moves',
];
const C_LIST = '(C) list: last_cycle_current true · no withdrawn_reason · 2 pending moves';
const C_UI = ['(C) detail: no withdrawn line, Apply budgets offered'];
const QUEUE = [
  '(C) Actions queue: the control tray lists both moves',
  '(A) Actions queue: no tray',
  '(B) Actions queue: no tray for B1',
];
const SEED = 'seed: 4 paused bench portfolios, 6 bench ad sets, 3 cycle runs, A roster absent';
const CLEANUP = 'cleanup: every bench portfolio of this run deleted by id, rosters gone';
const EVERY_CHECK = [
  ACCOUNT_CHECK,
  SEED,
  B_MOVE,
  SQL_CHECK,
  A_LIST,
  ...A_UI,
  B_LIST,
  ...B_UI,
  C_LIST,
  ...C_UI,
  ...QUEUE,
];

const notes: string[] = [`run ${RUN} on brand ${BENCH_BRAND_ID}`];
const rec = createBenchRecorder(BENCH, notes);
const graded = new Set<string>();
const counts = { pass: 0, skip: 0, fail: 0 };

function grade(step: string, result: 'PASS' | 'FAIL' | 'SKIP', detail?: string): void {
  graded.add(step);
  counts[result === 'PASS' ? 'pass' : result === 'SKIP' ? 'skip' : 'fail'] += 1;
  console.log(`${result.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
  rec.record(step, result, detail);
}
const check = (step: string, ok: boolean, detail?: string) =>
  grade(step, ok ? 'PASS' : 'FAIL', detail);
const skipAll = (steps: string[], why: string) => {
  for (const step of steps) if (!graded.has(step)) grade(step, 'SKIP', why);
};
const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

async function uiCheck(step: string, run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    grade(step, 'PASS');
    return true;
  } catch (error) {
    grade(step, 'FAIL', firstLine(error));
    return false;
  }
}

/** The Supabase CLI's token: SUPABASE_ACCESS_TOKEN, else the file the CLI writes on Linux
 *  (the other Management API helpers read the macOS keychain, which this machine lacks). */
function managementToken(): string | null {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    return readFileSync(resolve(homedir(), '.supabase/access-token'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

async function managementSql<T>(query: string): Promise<T[]> {
  const token = managementToken();
  if (!token) throw new Error('no Management API token (SUPABASE_ACCESS_TOKEN or ~/.supabase)');
  const ref = new URL(PROD_SUPABASE_URL).hostname.split('.')[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`management sql ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T[];
}

async function rpc<T>(client: SupabaseClient, fn: string, args: object): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

let member: SupabaseClient;
let benchUserId = '';
let assignedAccount: string | null = null;
const ids: Partial<Record<Slot, string>> = {};
let before = new Map<Slot, ListRow>();
let after = new Map<Slot, ListRow>();
let sqlApplied = false;
let notReached = 'not reached: beforeAll failed (see the error above)';
let storageState: PlaywrightStorageState | null = null;
let originalActiveBrandId: string | null | undefined;

/** The account the page can select: plugin_mcp.list_brand_ad_accounts, the read /scale makes. */
async function readAssignedMetaAccount(): Promise<string | null> {
  const { data, error } = await member
    .schema('plugin_mcp')
    .rpc('list_brand_ad_accounts', { p_brand_id: BENCH_BRAND_ID });
  if (error) throw new Error(`list_brand_ad_accounts: ${error.message}`);
  const rows = (data ?? []) as { platform: string; account_id: string }[];
  return rows.find((row) => row.platform === 'meta_ads')?.account_id ?? null;
}

/** With no assigned account the UI cannot run, but the list read still can: any Meta account
 *  optimizer_create_portfolio accepts for this brand (its own lenient link-or-grant scope). */
async function creatableMetaAccount(): Promise<string | null> {
  const rows = await managementSql<{ account: string }>(`
    select iaa.external_account_id as account
      from brand_profiles.integration_accounts_assets iaa
     where iaa.type = 'meta_ad_account' and iaa.integration_id in (
       select a.integration_id from brand_profiles.brand_profile_integration_accounts l
         join brand_profiles.integration_accounts_assets a on a.id = l.integration_account_id
        where l.brand_profile_id = '${BENCH_BRAND_ID}'
       union select g.integration_id from brand_profiles.brand_integration_grants g
        where g.brand_profile_id = '${BENCH_BRAND_ID}' and g.revoked_at is null
       union select u.integration_id from brand_profiles.brand_profile_user_integrations u
        where u.brand_profile_id = '${BENCH_BRAND_ID}')
     order by 1 limit 1`);
  return rows[0]?.account ?? null;
}

function cycle(items: [AdsetRef, number][]) {
  return {
    mode: 'balanced',
    reallocation: {
      conserved: true,
      totalBudget: 200,
      pool: 200,
      allocatedTotal: 200,
      residual: 0,
      items: items.map(([ref, change]) => ({
        id: ref.adset_id,
        currentBudget: 100,
        finalBudget: 100 + change,
        changeAbs: change,
        changePct: change / 100,
        reason: `bench: ${change > 0 ? 'raise' : 'cut'} for the stale-moves bench`,
        platform: 'meta',
      })),
    },
  };
}

async function seed(): Promise<void> {
  const account = assignedAccount ?? (await creatableMetaAccount());
  if (!account || !/^(act_)?\d+$/.test(account)) {
    throw new Error(
      'the bench brand reaches no Meta ad account optimizer_create_portfolio accepts',
    );
  }
  const claims = JSON.stringify({ sub: benchUserId, role: 'authenticated' });
  const created = await managementSql<{ id: string; name: string }>(`
    begin;
    select set_config('request.jwt.claims', '${claims}', true);
    ${SLOTS.map(
      (slot) =>
        `select public.optimizer_create_portfolio('${BENCH_BRAND_ID}', '${account}', '${JSON.stringify({ name: NAMES[slot], daily_total: 200 })}'::jsonb);`,
    ).join('\n    ')}
    update optimizer.portfolios set status = 'paused'
     where brand_id = '${BENCH_BRAND_ID}' and name like '${PREFIX}%';
    commit;
    select id::text as id, name, status from optimizer.portfolios
     where brand_id = '${BENCH_BRAND_ID}' and name like '${PREFIX}%';`);
  for (const row of created) {
    const slot = SLOTS.find((s) => NAMES[s] === row.name);
    if (slot) ids[slot] = row.id;
  }
  if (SLOTS.some((slot) => !ids[slot]))
    throw new Error(`created ${created.length} of 4 portfolios`);

  await rpc(member, 'optimizer_enroll_adset', { p_portfolio_id: ids.A, p_adsets: [AD.a1, AD.a2] });
  await rpc(member, 'optimizer_enroll_adset', { p_portfolio_id: ids.B1, p_adsets: [AD.x1, AD.x2] });
  await rpc(member, 'optimizer_enroll_adset', { p_portfolio_id: ids.C, p_adsets: [AD.c1, AD.c2] });

  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const runs: [Slot, string, [AdsetRef, number][]][] = [
    [
      'A',
      hoursAgo(26),
      [
        [AD.a1, -20],
        [AD.a2, 20],
      ],
    ],
    [
      'B1',
      hoursAgo(1),
      [
        [AD.x1, -20],
        [AD.x2, 20],
      ],
    ],
    [
      'C',
      hoursAgo(1),
      [
        [AD.c1, -15],
        [AD.c2, 15],
      ],
    ],
  ];
  for (const [slot, at, items] of runs) {
    await rpc(admin, 'optimizer_record_cycle', {
      p_portfolio_id: ids[slot],
      p_cycle_ts: at,
      p_result: cycle(items),
      p_triggered_by: 'bench',
    });
  }
  const presence = await rpc<{ missing: unknown[] }>(admin, 'optimizer_mark_roster_presence', {
    p_portfolio_id: ids.A,
    p_seen_ids: [],
    p_seen_at: new Date().toISOString(),
  });
  if (presence.missing.length !== 2) throw new Error(`A: ${presence.missing.length} of 2 missing`);
}

async function listSeeded(label: string): Promise<Map<Slot, ListRow>> {
  const rows = await rpc<ListRow[]>(member, 'optimizer_list_portfolios', {
    p_brand_id: BENCH_BRAND_ID,
  });
  const out = new Map<Slot, ListRow>();
  for (const slot of SLOTS) {
    const row = rows.find((r) => r.id === ids[slot]);
    if (row) out.set(slot, row);
    const show = (key: keyof ListRow) => (row && key in row ? JSON.stringify(row[key]) : 'absent');
    const line = `[${label}] ${slot}: last_cycle_current=${show('last_cycle_current')} withdrawn_reason=${show('withdrawn_reason')} pending_budget_moves=${show('pending_budget_moves')}`;
    console.log(line);
    notes.push(line);
  }
  return out;
}

const describeRow = (row: ListRow | undefined) =>
  row
    ? JSON.stringify({
        last_cycle_current: row.last_cycle_current,
        withdrawn_reason: row.withdrawn_reason,
        pending_budget_moves: row.pending_budget_moves,
      })
    : 'row missing';

async function browserSession(): Promise<PlaywrightStorageState> {
  if (storageState) return storageState;
  const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
  const { data } = await prefs.select('active_brand_id').eq('user_id', benchUserId).maybeSingle();
  originalActiveBrandId = (data as { active_brand_id: string } | null)?.active_brand_id ?? null;
  const { error } = await prefs.upsert(
    { user_id: benchUserId, active_brand_id: BENCH_BRAND_ID, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`brand pin failed: ${error.message}`);
  storageState = await mintSessionForEmail(BENCH_OWNER_EMAIL);
  return storageState;
}

async function pinAdAccount(page: Page): Promise<void> {
  const bare = (assignedAccount ?? '').replace(/^act_/, '');
  const picker = page.getByRole('combobox').first();
  await expect(picker).toBeEnabled({ timeout: 180_000 });
  await picker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(bare);
  await page.getByRole('option').filter({ hasText: bare }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });
}

async function openPage(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ storageState: await browserSession() });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await pinAdAccount(page);
  return page;
}

/** The detail workspace with its "Show detail" disclosure (the Reallocation panel) open. */
async function openDetail(browser: Browser, slot: Slot): Promise<Page> {
  const page = await openPage(browser, `/scale?tab=performance&portfolio=${ids[slot]}`);
  await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByTestId('portfolio-detail-more').locator('summary').click();
  return page;
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
}

/** Runs one scenario's UI checks; anything that throws outside a check (navigation, sign-in)
 *  fails every check it left ungraded instead of vanishing from the envelope. */
async function scenarioUi(steps: string[], run: () => Promise<Page | null>): Promise<void> {
  let page: Page | null = null;
  try {
    page = await run();
  } catch (error) {
    for (const step of steps) if (!graded.has(step)) grade(step, 'FAIL', firstLine(error));
  } finally {
    await page?.context().close();
  }
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The Activity tab's queue holds no budget-move control (select or approve) for these ad sets. */
async function expectNoBudgetControls(page: Page, refs: AdsetRef[]): Promise<void> {
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(
    page.getByText('No pending actions for this portfolio yet.').or(page.getByTestId('queue-tray')),
  ).toBeVisible();
  const names = refs.map((ref) => escapeRe(ref.adset_name)).join('|');
  await expect(page.getByLabel(new RegExp(`budget move for (${names})$`))).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.describe('Optimizer — a stale cycle shows its moves as withdrawn', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const token = await mintAccessTokenForEmail(BENCH_OWNER_EMAIL);
    benchUserId = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).sub;
    member = createClient(PROD_SUPABASE_URL, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    assignedAccount = await readAssignedMetaAccount();
    check(
      ACCOUNT_CHECK,
      assignedAccount !== null,
      assignedAccount
        ? 'one assigned'
        : 'list_brand_ad_accounts has no meta_ads row for the bench brand, so /scale shows "Connect an ad account" and the Optimization tab never mounts — assign one of the brand Meta integration\'s ad accounts to it (an authorization row this bench will not forge)',
    );

    try {
      await seed();
      grade(SEED, 'PASS', `${SLOTS.map((slot) => `${slot}=${ids[slot]}`).join(' ')}`);
    } catch (error) {
      grade(SEED, 'FAIL', firstLine(error));
      throw error;
    }
    before = await listSeeded('before the move');
    try {
      const { moved = [] } = await rpc<{
        moved?: { adset_id: string; from_portfolio_id: string }[];
      }>(member, 'optimizer_enroll_adset', { p_portfolio_id: ids.B2, p_adsets: [AD.x1] });
      check(
        B_MOVE,
        moved.some((m) => m.adset_id === AD.x1.adset_id && m.from_portfolio_id === ids.B1),
        JSON.stringify(moved),
      );
    } catch (error) {
      grade(B_MOVE, 'FAIL', firstLine(error));
    }
    after = await listSeeded('after the move');
    notReached = 'not reached: an earlier serial test failed';
  });

  test.afterAll(async () => {
    skipAll(EVERY_CHECK, notReached);
    let cleaned = false;
    try {
      const idList = SLOTS.flatMap((slot) => (ids[slot] ? [`'${ids[slot]}'`] : [])).join(', ');
      const scope = `brand_id = '${BENCH_BRAND_ID}' and name like 'bench:%'
        and (id in (${idList || 'null'}) or name like '${PREFIX}%')`;
      const [left] = await managementSql<{ portfolios: number; adsets: number }>(`
        begin;
        delete from optimizer.logs where portfolio_id in (select id from optimizer.portfolios where ${scope});
        delete from optimizer.portfolios where ${scope};
        commit;
        select (select count(*) from optimizer.portfolios
                 where brand_id = '${BENCH_BRAND_ID}' and name like '${PREFIX}%')::int as portfolios,
               (select count(*) from optimizer.portfolio_adsets
                 where adset_id like 'bench_sm_${RUN}_%')::int as adsets;`);
      cleaned = left?.portfolios === 0 && left?.adsets === 0;
      check(CLEANUP, cleaned, `left: ${left?.portfolios} portfolios, ${left?.adsets} roster rows`);
    } catch (error) {
      grade(CLEANUP, 'FAIL', firstLine(error));
    }
    if (originalActiveBrandId && originalActiveBrandId !== BENCH_BRAND_ID) {
      await admin.schema('brand_profiles').from('user_brand_preferences').upsert(
        {
          user_id: benchUserId,
          active_brand_id: originalActiveBrandId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    }
    console.log(
      `${counts.fail > 0 ? 'FAIL' : 'PASS'} — ${BENCH}: ${counts.pass} pass, 0 warn, ` +
        `${counts.skip} skip, ${counts.fail} fail`,
    );
    rec.print();
    if (!cleaned) throw new Error(`${CLEANUP}: FAILED — see the envelope above`);
  });

  test(SQL_CHECK, async () => {
    const missing = SLOTS.filter((slot) => {
      const row = after.get(slot);
      return !row || !('last_cycle_current' in row);
    });
    sqlApplied = missing.length === 0;
    check(
      SQL_CHECK,
      sqlApplied,
      sqlApplied
        ? 'every seeded row carries last_cycle_current'
        : `optimizer_list_portfolios rows carry no last_cycle_current (${missing.join(', ')}) — apply supabase/migrations/${MIGRATION}`,
    );
    // Every scenario reads these fields: without them there is nothing to assert, so the
    // serial run stops here and afterAll names each check it did not reach.
    notReached = SQL_GATE;
    expect(missing, SQL_CHECK).toEqual([]);
  });

  test('(A) roster absent: the last proposal is withdrawn, nothing offered', async ({
    browser,
  }) => {
    if (!sqlApplied) skipAll([A_LIST, ...A_UI], SQL_GATE);
    test.skip(!sqlApplied, SQL_GATE);
    const row = after.get('A');
    check(
      A_LIST,
      row?.last_cycle_current === false &&
        row.withdrawn_reason === 'roster_absent' &&
        row.pending_budget_moves === 0,
      describeRow(row),
    );
    if (!assignedAccount) skipAll(A_UI, ACCOUNT_GATE);
    test.skip(!assignedAccount, ACCOUNT_GATE);

    await scenarioUi(A_UI, async () => {
      const page = await openDetail(browser, 'A');
      const date = SINCE_FMT.format(new Date(row?.last_actual_cycle_at ?? Number.NaN));
      await uiCheck(A_UI[0] as string, async () => {
        const line = page.getByTestId('reallocation-withdrawn');
        await expect(line).toBeVisible();
        await expect(line).toContainText(`Last proposal, ${date}`);
        await expect(line).toContainText(/roster/i);
      });
      await shoot(page, 'A-roster-absent');
      await uiCheck(A_UI[1] as string, async () => {
        await expect(page.getByRole('button', { name: 'Apply budgets' })).toHaveCount(0);
        await expectNoBudgetControls(page, [AD.a1, AD.a2]);
      });
      return page;
    });
  });

  test('(B) moved ad set: B1 shows the move withdrawn, nothing offered', async ({ browser }) => {
    if (!sqlApplied) skipAll([B_LIST, ...B_UI], SQL_GATE);
    test.skip(!sqlApplied, SQL_GATE);
    check(
      B_LIST,
      before.get('B1')?.pending_budget_moves === 2 && after.get('B1')?.pending_budget_moves === 0,
      `before ${describeRow(before.get('B1'))} after ${describeRow(after.get('B1'))}`,
    );
    if (!assignedAccount) skipAll(B_UI, ACCOUNT_GATE);
    test.skip(!assignedAccount, ACCOUNT_GATE);

    await scenarioUi(B_UI, async () => {
      const page = await openDetail(browser, 'B1');
      await uiCheck(B_UI[0] as string, async () => {
        const label = page.getByTestId('reallocation-row-withdrawn');
        await expect(label.first()).toBeVisible();
        await expect(label.first()).toHaveText(
          new RegExp(`Withdrawn — (now in "?${escapeRe(NAMES.B2)}"?|no longer in this portfolio)`),
        );
      });
      await shoot(page, 'B-moved-adset');
      await uiCheck(B_UI[1] as string, async () => {
        await expect(page.getByRole('button', { name: 'Apply budgets' })).toHaveCount(0);
        await expectNoBudgetControls(page, [AD.x1, AD.x2]);
      });
      return page;
    });
  });

  test('(C) control: a current run keeps its moves actionable', async ({ browser }) => {
    if (!sqlApplied) skipAll([C_LIST, ...C_UI], SQL_GATE);
    test.skip(!sqlApplied, SQL_GATE);
    const row = after.get('C');
    check(
      C_LIST,
      row?.last_cycle_current === true &&
        row.withdrawn_reason === null &&
        row.pending_budget_moves === 2,
      describeRow(row),
    );
    if (!assignedAccount) skipAll(C_UI, ACCOUNT_GATE);
    test.skip(!assignedAccount, ACCOUNT_GATE);

    await scenarioUi(C_UI, async () => {
      const page = await openDetail(browser, 'C');
      await uiCheck(C_UI[0] as string, async () => {
        await expect(page.getByRole('button', { name: 'Apply budgets' })).toBeVisible();
        await expect(page.getByTestId('reallocation-withdrawn')).toHaveCount(0);
        await expect(page.getByTestId('reallocation-row-withdrawn')).toHaveCount(0);
      });
      await shoot(page, 'C-control');
      return page;
    });
  });

  test('Actions queue: only the control portfolio is queue work', async ({ browser }) => {
    const why = !sqlApplied ? SQL_GATE : !assignedAccount ? ACCOUNT_GATE : null;
    if (why) skipAll(QUEUE, why);
    test.skip(why !== null, why ?? '');
    const [controlStep, aStep, bStep] = QUEUE as [string, string, string];

    await scenarioUi(QUEUE, async () => {
      const page = await openPage(browser, '/scale?tab=performance&optimizerView=actions');
      const tray = (slot: Slot) =>
        page
          .getByTestId('queue-tray')
          .filter({ has: page.getByRole('heading', { name: NAMES[slot], exact: true }) });
      const controlShown = await uiCheck(controlStep, async () => {
        await expect(tray('C')).toBeVisible({ timeout: 120_000 });
        for (const ref of [AD.c1, AD.c2]) {
          await expect(
            tray('C').getByLabel(`Select budget move for ${ref.adset_name}`),
          ).toBeVisible();
        }
      });
      await shoot(page, 'actions-queue');
      // Absence only means something once the queue has rendered the control's tray.
      for (const [step, slot] of [
        [aStep, 'A'],
        [bStep, 'B1'],
      ] as [string, Slot][]) {
        if (!controlShown) {
          grade(step, 'FAIL', 'the control tray never rendered, so an absent tray proves nothing');
          continue;
        }
        await uiCheck(step, async () => {
          await expect(tray(slot)).toHaveCount(0);
        });
      }
      return page;
    });
  });

  test('verdict: no graded check failed', () => {
    expect(counts.fail, 'graded checks failed — see the FAIL lines above').toBe(0);
  });
});
