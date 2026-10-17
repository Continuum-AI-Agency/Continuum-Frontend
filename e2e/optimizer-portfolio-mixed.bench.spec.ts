import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pinProdSupabase } from './paid-parity.env';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  pinSessionBrand,
  restoreBrandPreference,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { managementSql, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:multiplatform:portfolio:e2e:bench — G3 of the Google Ads plan: a portfolio that
// holds a Meta ad set AND a Google campaign is created, enrolled and read back through the
// product's own paths, its allowed actions are changed on screen, and it is archived — then
// every row it wrote is deleted.
//
//   create   optimizer_create_portfolio as the member (Management API, one transaction that
//            also pauses it, so optimizer_claim_due_portfolios never cycles it)
//   enroll   the optimizer-enroll edge (the wizard's Meta path) and
//            optimizer_add_portfolio_members (its Google path), both with the member's JWT
//   screen   the portfolio's Manage tab: the allowed-actions control, Attribution, the roster
//   archive  optimizer_archive_portfolio, both members released
//
// Nothing is written to Meta or Google. Enrolling is rows in optimizer.*; the Google account
// row is born with apply_enabled false; the portfolio is paused and in recommend mode; nothing
// here runs a cycle. The members are chosen at run start, live, never pinned: a Meta ad set of
// the brand's account that no portfolio holds (so optimizer_enroll_adset moves nothing out of
// a client's portfolio) and a PAUSED Search campaign no portfolio holds. A VIDEO and a DISPLAY
// campaign, when the account has one free, prove the refusals.
//
// Identity (decisions.md, 2026-10-14 exception): Easy Fit's browser benches sign in as the
// existing client user, add no permissions row, and delete what they create when the run ends —
// here the portfolio and its rows by id, the GoTrue session (revokeBenchSession) and the brand
// preference as it was found (restoreBrandPreference).
// ---------------------------------------------------------------------------

const BENCH = 'optimizer:multiplatform:portfolio:e2e:bench';
const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit's brand row that holds its Google account (the Google tab's brand). */
const BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const GOOGLE_ACCOUNT = '5251780631';
const RUN = Date.now().toString(36);
const NAME = `bench: G3 mixed ${RUN}`;
// Under test-results (gitignored): the shots show a client's account.
const SHOTS_DIR = resolve(process.cwd(), 'test-results/optimizer-portfolio-mixed');

const { publishableKey } = pinProdSupabase();

const PREMISE =
  'premise: the member reaches both accounts, a free Meta ad set and a free PAUSED Search campaign';
const CREATE = 'create: optimizer_create_portfolio as the member, paused in the same transaction';
const ENROLL_META = 'enroll: the optimizer-enroll edge puts the Meta ad set in, moving nothing';
const ADD_GOOGLE =
  'enroll: optimizer_add_portfolio_members adds the Google campaign in the same currency';
const REFUSED = 'refused: a VIDEO and a DISPLAY campaign, 22023, nothing written';
const READ_LIST = 'read back: the list names meta + google_ads, the currency and two members';
const READ_ACTIONS = 'read back: Google allows set_status + set_budget, its writes off';
const UI_ACTIONS =
  'screen: Manage lists the five Google kinds, the default two ticked, no Meta row';
const UI_SAVE =
  'screen: ticking "Add negative keywords" and Save stores it, audited, Meta untouched';
const UI_ATTRIBUTION =
  "screen: Attribution counts with each platform's own; GA4 cannot be chosen yet";
const UI_ROSTER = 'screen: the roster holds the ad set (1 selected) and ticks the campaign';
const UI_MEMBERS =
  'screen: the Google group lets the campaign go and takes it back, each save read back';
const ARCHIVE = 'archive: optimizer_archive_portfolio releases both members';
const CLEANUP = 'cleanup: the portfolio and every row it wrote are deleted';
const SESSION_CLEANUP = 'cleanup: the bench session is revoked, the brand preference as found';
const EVERY_CHECK = [
  PREMISE,
  CREATE,
  ENROLL_META,
  ADD_GOOGLE,
  REFUSED,
  READ_LIST,
  READ_ACTIONS,
  UI_ACTIONS,
  UI_SAVE,
  UI_ATTRIBUTION,
  UI_ROSTER,
  UI_MEMBERS,
  ARCHIVE,
];

const notes: string[] = [`run ${RUN} on brand ${BRAND_ID}`];
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
const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

type Premise = {
  metaAccount: string;
  currency: string;
  adset: { id: string; name: string };
  campaign: { id: string; name: string };
  video: string | null;
  display: string | null;
};

let session: MintedSession | null = null;
let member: SupabaseClient;
let userId = '';
let originalBrand: string | null = null;
let preferenceTouched = false;
let premise: Premise | null = null;
let portfolioId: string | null = null;
let context: BrowserContext | null = null;
/** The Meta row of optimizer_get_portfolio_platform_actions before the screen saves, if any. */
let metaActionsBefore: string | undefined;

async function rpc<T>(fn: string, args: object): Promise<T> {
  const { data, error } = await member.rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
  return data as T;
}

/** The accounts the member's /scale can select, and the free members to enroll — read live. */
async function readPremise(): Promise<Premise> {
  const { data, error } = await member
    .schema('plugin_mcp')
    .rpc('list_brand_ad_accounts', { p_brand_id: BRAND_ID });
  if (error) throw new Error(`list_brand_ad_accounts: ${error.message}`);
  const accounts = (data ?? []) as { platform: string; account_id: string; currency?: string }[];
  const bare = (id: string) => id.replace(/^act_/, '');
  const google = accounts.find(
    (a) => a.platform === 'google_ads' && bare(a.account_id) === GOOGLE_ACCOUNT,
  );
  if (!google) throw new Error(`the brand does not reach Google ${GOOGLE_ACCOUNT}`);
  const [catalog] = await managementSql<{ currency: string | null }>(
    `select max(currency) as currency from optimizer.entities
      where platform = 'google_ads' and account_id = '${GOOGLE_ACCOUNT}'`,
  );
  const currency = (google.currency ?? catalog?.currency ?? '').toUpperCase();
  const meta = accounts.find(
    (a) =>
      (a.platform === 'meta_ads' || a.platform === 'meta') &&
      (a.currency ?? '').toUpperCase() === currency,
  );
  if (!currency || !meta) {
    throw new Error(
      `no Meta account in ${currency || 'an unknown currency'} beside Google ${GOOGLE_ACCOUNT}: ${JSON.stringify(accounts)}`,
    );
  }
  const metaAccount = `act_${bare(meta.account_id)}`;

  // An ad set this account's portfolios once held and none holds now, last seen on Meta (never
  // gone missing) — enrolling it releases nothing from anyone.
  const [adset] = await managementSql<{ id: string; name: string }>(`
    select a.adset_id as id, max(a.adset_name) as name
      from optimizer.portfolio_adsets a
      join optimizer.portfolios p on p.id = a.portfolio_id
     where p.ad_account_id = '${metaAccount}'
       and not exists (select 1 from optimizer.portfolio_adsets x
                        where x.adset_id = a.adset_id and x.active)
     group by a.adset_id
    having bool_and(a.missing_since is null)
     order by max(a.last_seen_at) desc nulls last
     limit 1`);
  const free = await managementSql<{ id: string; name: string; channel: string; status: string }>(`
    select e.entity_id as id, e.name, upper(coalesce(e.channel_type, '')) as channel, e.status
      from optimizer.entities e
     where e.platform = 'google_ads' and e.account_id = '${GOOGLE_ACCOUNT}' and e.level = 'campaign'
       and not exists (select 1 from optimizer.portfolio_entities pe
                        where pe.platform = 'google_ads' and pe.entity_id = e.entity_id and pe.active)
     order by e.entity_id`);
  const campaign = free.find((c) => c.channel === 'SEARCH' && c.status === 'PAUSED');
  if (!adset || !campaign) {
    throw new Error(
      `no free member to enroll: ad set ${adset?.id ?? 'none'}, paused Search campaign ${campaign?.id ?? 'none'}`,
    );
  }
  return {
    metaAccount,
    currency,
    adset,
    campaign: { id: campaign.id, name: campaign.name },
    video: free.find((c) => c.channel === 'VIDEO')?.id ?? null,
    display: free.find((c) => c.channel === 'DISPLAY')?.id ?? null,
  };
}

async function createPaused(p: Premise): Promise<string> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  const config = JSON.stringify({
    name: NAME,
    objective: 'lead',
    daily_total: 100,
    apply_mode: 'recommend',
  });
  const rows = await managementSql<{ id: string; status: string; currency: string | null }>(`
    begin;
    select set_config('request.jwt.claims', '${claims}', true);
    select public.optimizer_create_portfolio('${BRAND_ID}', '${p.metaAccount}', '${config}'::jsonb);
    update optimizer.portfolios set status = 'paused' where brand_id = '${BRAND_ID}' and name = '${NAME}';
    commit;
    select id::text as id, status, currency from optimizer.portfolios
     where brand_id = '${BRAND_ID}' and name = '${NAME}';`);
  const row = rows[0];
  if (!row) throw new Error('optimizer_create_portfolio left no row');
  portfolioId = row.id;
  check(
    CREATE,
    rows.length === 1 && row.status === 'paused',
    `${row.id} ${row.status} ${row.currency ?? 'no currency'}`,
  );
  return row.id;
}

const refusalOf = async (entityId: string): Promise<string> => {
  try {
    await rpc('optimizer_add_portfolio_members', {
      p_portfolio_id: portfolioId,
      p_members: [
        {
          platform: 'google_ads',
          account_id: GOOGLE_ACCOUNT,
          entity_id: entityId,
          level: 'campaign',
        },
      ],
    });
    return 'accepted';
  } catch (error) {
    return (error as { code?: string }).code ?? firstLine(error);
  }
};

async function openManage(page: Page, id: string): Promise<void> {
  await page.goto(`/scale?tab=performance&portfolio=${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
    timeout: 180_000,
  });
  await page.getByRole('tab', { name: 'Manage' }).first().click();
  await expect(page.getByText('Allowed actions per platform')).toBeVisible({ timeout: 60_000 });
}

async function uiCheck(step: string, run: () => Promise<string | undefined>): Promise<void> {
  try {
    grade(step, 'PASS', await run());
  } catch (error) {
    // Playwright's reason for an action that never landed sits in its call log, not the first
    // line: keep the line that names what blocked it.
    const why = /[^\n]*(intercepts pointer events|not enabled|not visible|not stable)[^\n]*/.exec(
      error instanceof Error ? error.message : '',
    )?.[0];
    grade(step, 'FAIL', why ? `${firstLine(error)} — ${why.trim()}` : firstLine(error));
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('Optimizer — a mixed Meta + Google portfolio, end to end', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    userId = session.userId;
    member = createClient(PROD_SUPABASE_URL, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    });
    try {
      premise = await readPremise();
      grade(
        PREMISE,
        'PASS',
        `Meta ${premise.metaAccount} + Google ${GOOGLE_ACCOUNT} in ${premise.currency}; ad set ${premise.adset.id} "${premise.adset.name}"; campaign ${premise.campaign.id} "${premise.campaign.name}"; refusal probes VIDEO ${premise.video ?? 'none'}, DISPLAY ${premise.display ?? 'none'}`,
      );
    } catch (error) {
      grade(PREMISE, 'FAIL', firstLine(error));
    }
  });

  test.afterAll(async () => {
    // Unreached after a graded failure is a skip; unreached with NO graded failure means
    // something threw outside every check, and the run must not read green.
    const stoppedSilently = counts.fail === 0;
    for (const step of EVERY_CHECK) {
      if (graded.has(step)) continue;
      if (stoppedSilently) grade(step, 'FAIL', 'not reached: the run stopped outside a check');
      else grade(step, 'SKIP', 'not reached: an earlier step failed');
    }
    await context?.close().catch(() => undefined);
    try {
      const scope = `brand_id = '${BRAND_ID}' and name = '${NAME}'`;
      const id = portfolioId ? `'${portfolioId}'` : 'null';
      const [left] = await managementSql<{
        portfolios: number;
        entities: number;
        adsets: number;
        audits: number;
      }>(`
        begin;
        delete from optimizer.logs where portfolio_id in (select id from optimizer.portfolios where ${scope});
        delete from optimizer.apply_audits where portfolio_id in (select id from optimizer.portfolios where ${scope});
        delete from optimizer.portfolios where ${scope};
        commit;
        select (select count(*) from optimizer.portfolios where ${scope})::int as portfolios,
               (select count(*) from optimizer.portfolio_entities where portfolio_id = ${id})::int as entities,
               (select count(*) from optimizer.portfolio_adsets where portfolio_id = ${id})::int as adsets,
               (select count(*) from optimizer.portfolio_audits where portfolio_id = ${id})::int as audits;`);
      check(
        CLEANUP,
        left?.portfolios === 0 && left.entities === 0 && left.adsets === 0 && left.audits === 0,
        `left: ${JSON.stringify(left)}`,
      );
    } catch (error) {
      grade(CLEANUP, 'FAIL', firstLine(error));
    }
    try {
      const revoked = session ? await revokeBenchSession(session.state, session.accessToken) : null;
      const restored = preferenceTouched
        ? await restoreBrandPreference(userId, originalBrand)
        : originalBrand;
      check(
        SESSION_CLEANUP,
        (revoked === null || (revoked.revoked && revoked.pinsLeft === 0)) &&
          restored === originalBrand,
        `${revoked ? `session ${revoked.sessionId}: ${revoked.detail}` : 'no session'}; preference ${restored ?? 'none'}, was ${originalBrand ?? 'none'}`,
      );
    } catch (error) {
      grade(SESSION_CLEANUP, 'FAIL', firstLine(error));
    }
    console.log(
      `${counts.fail > 0 ? 'FAIL' : 'PASS'} — ${BENCH}: ${counts.pass} pass, 0 warn, ${counts.skip} skip, ${counts.fail} fail`,
    );
    rec.print();
  });

  test('create, enroll on both platforms, read back', async () => {
    test.skip(!premise, 'premise failed');
    const p = premise as Premise;
    const id = await createPaused(p);

    const { data: enrolled, error: enrollError } = await member.functions.invoke<{
      enrolled: number;
      moved: unknown[];
    }>('optimizer-enroll', {
      body: {
        portfolio_id: id,
        adset_ids: [p.adset.id],
        adset_names: { [p.adset.id]: p.adset.name },
      },
    });
    check(
      ENROLL_META,
      !enrollError && enrolled?.enrolled === 1 && (enrolled.moved ?? []).length === 0,
      enrollError ? enrollError.message : JSON.stringify(enrolled),
    );

    const added = await rpc<{ enrolled: number; currency: string }>(
      'optimizer_add_portfolio_members',
      {
        p_portfolio_id: id,
        p_members: [
          {
            platform: 'google_ads',
            account_id: GOOGLE_ACCOUNT,
            entity_id: p.campaign.id,
            level: 'campaign',
            name: p.campaign.name,
          },
        ],
      },
    ).catch((error: unknown) => ({ enrolled: -1, currency: firstLine(error) }));
    check(ADD_GOOGLE, added.enrolled === 1 && added.currency === p.currency, JSON.stringify(added));

    const probes = [p.video, p.display].filter((x): x is string => x !== null);
    const refusals = await Promise.all(
      probes.map(async (entity) => [entity, await refusalOf(entity)]),
    );
    const [written] = await managementSql<{ n: number }>(
      `select count(*)::int as n from optimizer.portfolio_entities
        where portfolio_id = '${id}' and entity_id in (${probes.map((e) => `'${e}'`).join(', ') || "''"})`,
    );
    if (probes.length === 0)
      grade(REFUSED, 'SKIP', 'the account has no free VIDEO or DISPLAY campaign');
    else {
      check(
        REFUSED,
        refusals.every(([, code]) => code === '22023') && written?.n === 0,
        `${JSON.stringify(refusals)}; rows written ${written?.n}`,
      );
    }

    const list = await rpc<Array<Record<string, unknown>>>('optimizer_list_portfolios', {
      p_brand_id: BRAND_ID,
    });
    const row = list.find((r) => r.id === id);
    const platforms = Array.isArray(row?.platforms) ? [...(row.platforms as string[])].sort() : [];
    check(
      READ_LIST,
      platforms.join() === 'google_ads,meta' &&
        row?.currency === p.currency &&
        // adset_count counts members on every platform: the ad set and the campaign.
        row?.adset_count === 2,
      JSON.stringify({
        platforms: row?.platforms,
        currency: row?.currency,
        adset_count: row?.adset_count,
      }),
    );

    const actions = await rpc<{ platform: string; allowed_actions: string[] | null }[]>(
      'optimizer_get_portfolio_platform_actions',
      { p_portfolio_id: id },
    );
    const [switches] = await managementSql<{ google_apply_enabled: boolean | null }>(
      `select bool_or(apply_enabled) as google_apply_enabled from optimizer.portfolio_platforms
        where portfolio_id = '${id}' and platform = 'google_ads'`,
    );
    metaActionsBefore = actions.find((a) => a.platform === 'meta')?.allowed_actions?.join();
    check(
      READ_ACTIONS,
      // The column default is stored in its own order; only the set RPC sorts.
      [...(actions.find((a) => a.platform === 'google_ads')?.allowed_actions ?? [])]
        .sort()
        .join() === 'set_budget,set_status' && switches?.google_apply_enabled === false,
      `${JSON.stringify(actions)}; google apply_enabled ${switches?.google_apply_enabled}${
        metaActionsBefore === undefined
          ? '; no Meta platform row (a new Meta portfolio gets none — G6 note)'
          : ''
      }`,
    );
  });

  test('the Manage tab: allowed actions, attribution, roster', async ({ browser }) => {
    test.skip(!portfolioId || !premise, 'nothing to open');
    // Longer than the sum of its own waits, so a slow check fails by name instead of the test
    // being cut off mid-check (which closes the page under the next one).
    test.setTimeout(10 * 60_000);
    const id = portfolioId as string;
    const p = premise as Premise;
    const s = session as MintedSession;
    const { data: preference } = await createClient(
      PROD_SUPABASE_URL,
      pinProdSupabase().serviceRoleKey,
      {
        auth: { persistSession: false },
      },
    )
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', userId)
      .maybeSingle();
    originalBrand = (preference as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    preferenceTouched = true;
    await restoreBrandPreference(userId, BRAND_ID);
    await pinSessionBrand(s.accessToken, BRAND_ID);

    context = await browser.newContext({
      storageState: s.state,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    // A throw outside a check (navigation, a dead dev server) fails every screen check it left
    // ungraded, by name — never a skip, and the archive test still runs.
    try {
      await openManage(page, id);
      const google = page.locator(
        '[data-testid="platform-actions"] fieldset[data-platform="google_ads"]',
      );

      await uiCheck(UI_ACTIONS, async () => {
        await expect(google).toBeVisible();
        const states = await google
          .locator('[data-slot="checkbox"]')
          .evaluateAll((boxes) => boxes.map((box) => box.getAttribute('aria-checked')));
        if (states.join() !== 'true,true,false,false,false')
          throw new Error(`boxes ${states.join()}`);
        const meta = await page
          .locator('[data-testid="platform-actions"] [data-platform="meta"]')
          .count();
        if (meta !== 0) throw new Error('a Meta row is offered');
        return 'Pause or enable, Change budgets ticked; bid targets, negatives, keywords not';
      });

      await uiCheck(UI_SAVE, async () => {
        await google.getByText('Add negative keywords').click();
        await google.getByRole('button', { name: 'Save' }).click();
        let stored: { platform: string; allowed_actions: string[] | null }[] = [];
        await expect
          .poll(
            async () => {
              stored = await rpc('optimizer_get_portfolio_platform_actions', {
                p_portfolio_id: id,
              });
              return stored.find((a) => a.platform === 'google_ads')?.allowed_actions?.join() ?? '';
            },
            { timeout: 30_000 },
          )
          .toBe('add_negatives,set_budget,set_status');
        const meta = stored.find((a) => a.platform === 'meta')?.allowed_actions?.join();
        if (meta !== metaActionsBefore)
          throw new Error(`Meta changed: ${metaActionsBefore} → ${meta}`);
        const [audit] = await managementSql<{ new_value: string; changed_by: string | null }>(`
          select new_value, changed_by::text as changed_by from optimizer.portfolio_audits
           where portfolio_id = '${id}' and field = 'allowed_actions:google_ads'
           order by changed_at desc limit 1`);
        if (audit?.changed_by !== userId) throw new Error(`audit ${JSON.stringify(audit)}`);
        await expect(google.getByRole('button', { name: 'Save' })).toBeDisabled();
        return `stored ${JSON.stringify(stored)}; audited ${audit.new_value} by the member`;
      });

      await uiCheck(UI_ATTRIBUTION, async () => {
        const cards = page.locator('[data-testid="attribution-card"]');
        await expect(cards.first()).toBeVisible();
        const inUse = await cards.evaluateAll((all) =>
          all
            .filter((c) => c.getAttribute('data-in-use') === 'true')
            .map((c) => c.getAttribute('data-kind')),
        );
        if (inUse.join() !== 'platform') throw new Error(`in use: ${inUse.join() || 'none'}`);
        await expect(page.getByTestId('ga4-unavailable')).toBeVisible();
        return 'platform in use; GA4 "isn\'t available yet"; Sheet offers "Connect a sheet"';
      });

      // Before 20261015204209 ships, the members read does not exist: the Google group is then a
      // list only, and the two Google-roster checks are skipped by name, never passed.
      const { error: membersError } = await member.rpc('optimizer_list_portfolio_members', {
        p_portfolio_id: id,
      });
      const membersDeployed = membersError?.code !== 'PGRST202';
      const NOT_DEPLOYED =
        'optimizer_list_portfolio_members is not deployed (PGRST202): ships in 20261015204209';
      const roster = page.locator(`#manage-roster-${id}`);
      const campaignRow = roster
        .locator('[data-testid="picker-google-campaign"]')
        .filter({ hasText: p.campaign.name });
      const campaignBox = campaignRow.locator('[data-slot="checkbox"]');
      await uiCheck(UI_ROSTER, async () => {
        // The Meta tree is virtualized over the account's ~1,500 ad sets; its tally is the read.
        await expect(roster.getByText(/\b1 selected\b/)).toBeVisible({ timeout: 120_000 });
        if (!membersDeployed) return `Meta tree: 1 selected; Google unchecked — ${NOT_DEPLOYED}`;
        await expect(campaignRow).toHaveAttribute('data-held', 'true', { timeout: 120_000 });
        await expect(campaignBox).toHaveAttribute('aria-checked', 'true');
        return `Meta tree: 1 selected; Google: "${p.campaign.name}" held and ticked`;
      });

      if (!membersDeployed) grade(UI_MEMBERS, 'SKIP', NOT_DEPLOYED);
      else
        await uiCheck(UI_MEMBERS, async () => {
          const save = roster.getByRole('button', { name: 'Save Google campaigns' });
          const held = async () =>
            (
              await rpc<{ entity_id: string }[]>('optimizer_list_portfolio_members', {
                p_portfolio_id: id,
              })
            )
              .map((m) => m.entity_id)
              .join();
          await campaignRow.scrollIntoViewIfNeeded();
          mkdirSync(SHOTS_DIR, { recursive: true });
          await roster
            .locator('[data-testid="picker-platform-group"]')
            .screenshot({ path: resolve(SHOTS_DIR, 'google-members.png') })
            .catch(() => undefined);
          await campaignRow.getByText(p.campaign.name).click();
          await expect(roster.getByText('−1 to remove')).toBeVisible();
          await save.click();
          await expect.poll(held, { timeout: 30_000 }).toBe('');
          await expect(campaignBox).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
          await campaignRow.scrollIntoViewIfNeeded();
          await campaignRow.getByText(p.campaign.name).click();
          await expect(roster.getByText('+1 to add')).toBeVisible();
          await save.click();
          await expect.poll(held, { timeout: 30_000 }).toBe(p.campaign.id);
          await expect(campaignRow).toHaveAttribute('data-held', 'true', { timeout: 30_000 });
          return `released ${p.campaign.id}, read back none; re-added, read back ${p.campaign.id}`;
        });

      mkdirSync(SHOTS_DIR, { recursive: true });
      await page
        .locator('[data-testid="platform-actions"]')
        .screenshot({ path: resolve(SHOTS_DIR, 'allowed-actions.png') })
        .catch(() => undefined);
      await page.screenshot({ path: resolve(SHOTS_DIR, 'manage.png'), fullPage: true });
    } catch (error) {
      for (const step of [UI_ACTIONS, UI_SAVE, UI_ATTRIBUTION, UI_ROSTER, UI_MEMBERS]) {
        if (!graded.has(step)) grade(step, 'FAIL', firstLine(error));
      }
      mkdirSync(SHOTS_DIR, { recursive: true });
      await page.screenshot({ path: resolve(SHOTS_DIR, 'failed.png') }).catch(() => undefined);
    }
  });

  test('archive', async () => {
    test.skip(!portfolioId, 'nothing to archive');
    const id = portfolioId as string;
    try {
      await rpc('optimizer_archive_portfolio', { p_portfolio_id: id });
      const [state] = await managementSql<{ status: string; active: number }>(`
        select p.status,
               ((select count(*) from optimizer.portfolio_adsets where portfolio_id = p.id and active)
                + (select count(*) from optimizer.portfolio_entities where portfolio_id = p.id and active))::int as active
          from optimizer.portfolios p where p.id = '${id}'`);
      check(ARCHIVE, state?.status === 'archived' && state.active === 0, JSON.stringify(state));
    } catch (error) {
      grade(ARCHIVE, 'FAIL', firstLine(error));
    }
  });
});
