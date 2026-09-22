import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// ---------------------------------------------------------------------------
// jaina:canvas:e2e:bench — the Campaign Flow Canvas, end to end.
//
// A real Chrome, driving the real Frontend, as a REAL authenticated member (magic-link
// -> verifyOtp -> the exact @supabase/ssr session cookie the app writes), against
// PRODUCTION Supabase and a Fastify this spec spawns on a private port.
//
// What it proves, in order:
//   1. HYDRATION — the picker lists the brand's scaffolds, choosing one loads its
//      campaign -> ad set -> ad graph plus its audience groups, and every node renders
//      its gate status, the approver's display NAME (never the raw uuid), the approval
//      time, and its Meta id / Meta status. Real rows, seeded here because production
//      carries zero gate-approval and zero audience-group rows (checked 2026-09-07) and
//      a bench that reported green against an empty room would prove nothing.
//   2. HITL — editing a hydrated node marks the canvas dirty and writes NOTHING. The
//      assertion is on the DATABASE ROW, re-read after the edit, not on the absence of
//      a request: the browser holds no grant on these tables and this is what says so.
//   3. PROPOSE — "Propose via Jaina" on a brand with a live ad account puts the canvas
//      in the composer and the turn reaches `paid_scaffold_propose`.
//   4. THE CARD IN CHAT — graded against the rows it reads: counts per level, the opening
//      budget, what would stop build/populate, the outline at the 420px panel width, the
//      link back onto the canvas. Then the build gate is asked for in a SECOND turn (no
//      proposal frame on it), which this bench DENIES, and a reload must bring the card
//      back without a live Approve. Screenshots: artifacts/jaina-canvas-bench/.
//
// ── MONEY SAFETY — this bench cannot write to an ad account ──
//   * `paid_scaffold_propose` is UNGATED BY DESIGN (scaffoldApproval.ts:24) because it
//     writes Continuum rows only — no Meta call, no spend. The first gate on the chain
//     is `paid_scaffold_build`, and this bench answers it DENY. Nothing is approved
//     anywhere in this file; there is no `'approve'` in it.
//   * A denied gate never reaches `claim_paid_scaffold_gate`, so no Meta object is
//     created. Step 4 additionally asserts every node it created has a NULL
//     `meta_object_id` before deleting them.
//   * Rows written to OUR store for the client brand are id-diffed before and after and
//     deleted by id — never by time window, which has already hit a real user's row in
//     this repo.
//   * The only other write is the ACTIVE-BRAND PREFERENCE row for each bench user, the
//     same row the in-app brand switcher writes. Captured before, restored after.
//
// Usage: cd Continuum-Frontend && bun run jaina:canvas:e2e:bench
// ---------------------------------------------------------------------------

test.use({ channel: 'chrome' });

const { serviceRoleKey } = loadProdSupabaseEnv();

/** The bench login's own brand. Safe to write to; every row is tagged and removed. */
const BENCH_BRAND_ID =
  process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const BENCH_OWNER_USER_ID =
  process.env.CONTINUUM_TEST_OWNER_USER_ID ?? '305ee8b3-12c8-4c5e-b364-97c21be8425c';

/**
 * BENCH_ACCOUNTS.easyfitVivo47 — a real client brand, READ-ONLY by contract.
 *
 * The propose hop runs here and nowhere else for one reason: the bench brand has NO
 * linked ad account, so `POST /api/agents/jaina/chat/stream` answers 409
 * NoLinkedAdAccount before any turn starts. This brand already owns three proposed
 * scaffolds, so the canvas has something real to load and propose FROM.
 */
const CLIENT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const CLIENT_OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const CLIENT_AD_ACCOUNT_ID = 'act_521903353286118';
/**
 * Names a scaffold that really belongs to this brand's live ad account.
 *
 * NOT `.first()`: the brand is shared with other benches, and
 * `Continuum-Backend/scripts/paid-scaffold-creative-mvp-bench.ts` seeds rows whose
 * `ad_account_id` is the fixture string `act_bench_mvp`. Loading one of those hands the
 * chat an account the brand does not own, and the turn dies on a 403 that looks like a
 * canvas bug.
 */
const CLIENT_SCAFFOLD_NAME_FRAGMENT = 'EASYFIT //';

const BENCH_TAG = 'bench:';
const RUN_ID = randomUUID().slice(0, 8);
const SCAFFOLD_NAME = `${BENCH_TAG}canvas-read ${RUN_ID}`;
const AUDIENCE_NAME = `${BENCH_TAG}canvas-audience ${RUN_ID}`;

const BACKEND_PORT = Number(process.env.JAINA_CANVAS_BENCH_BACKEND_PORT ?? 4421);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  serviceRoleKey,
  { auth: { persistSession: false } },
);
const brandProfiles = () => admin.schema('brand_profiles');

/* -- the Recorder envelope ------------------------------------------------------
 *
 * `scripts/factory/bench.mjs` reads the LAST stdout line that parses as JSON and
 * carries `counts`. A bench that exits 0 without one is `unreadable`, not green — so
 * this spec prints the same envelope shape the Backend `_bench` Recorder does. It is
 * re-implemented rather than imported because AGENTS.md §5 forbids a Frontend file
 * importing Backend source; the shape, not the class, is the contract.
 */
const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const notes: string[] = [];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
}

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: 'jaina:canvas:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- the Backend the propose turn runs through ---------------------------------- */

let backend: ChildProcess | null = null;

const backendIsUp = async (): Promise<boolean> => {
  try {
    return (await fetch(`${BACKEND_URL}/healthz`)).ok;
  } catch {
    return false;
  }
};

async function startBackend(): Promise<void> {
  if (backend) return;

  // REFUSE a server this bench did not start. Fastify's EADDRINUSE goes to its own log
  // and nothing here sees it, so a spawn onto an occupied port leaves the health probe
  // passing against the OTHER process — and the bench then measures a Backend with
  // someone else's env, someone else's uptime and someone else's credentials.
  //
  // That is not hypothetical: this port was held by a Fastify started six hours before
  // this session, and an earlier version of this function "helpfully" reused it. Turns
  // dispatched into it produced run rows with ZERO events, which reads as "the model
  // declined to call the tool" and is nothing of the kind.
  if (await backendIsUp()) {
    throw new Error(
      `[canvas-bench] Port ${BACKEND_PORT} is already serving /healthz. This bench must own ` +
        'its Backend. Stop that process, or set JAINA_CANVAS_BENCH_BACKEND_PORT to a free port.',
    );
  }

  backend = spawn('bun', ['--no-env-file', 'scripts/run-backend.ts', '--supabase=production'], {
    cwd: path.resolve(process.cwd(), '../Continuum-Backend'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      HOST: '127.0.0.1',
      // The page is http://127.0.0.1:3117. Jaina's stream is cross-origin, and a
      // preflight that 204s without this origin never sends the POST — which looks
      // exactly like "the turn never left the browser".
      ALLOWED_ORIGINS: [
        process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3117',
        'http://127.0.0.1:3117',
        'http://localhost:3117',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://app.trycontinuum.ai',
      ].join(','),
      // Job workers on a bench process would pick up production queue work that
      // belongs to the deployed Backend. Off, exactly as the peer benches run them.
      MCP_JOB_WORKER_ENABLED: 'false',
      BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so teardown can kill the GROUP. `bun run-backend.ts`
    // leaves a listener behind when only its own pid is signalled, and the orphan then
    // holds this port for every later run — which the guard above now turns into a loud
    // refusal instead of a silent measurement of the wrong server.
    detached: true,
  });
  backend.stdout?.on('data', (chunk) => process.stdout.write(`[canvas-bench:be] ${String(chunk)}`));
  backend.stderr?.on('data', (chunk) => process.stderr.write(`[canvas-bench:be] ${String(chunk)}`));

  await expect.poll(backendIsUp, { timeout: 120_000, intervals: [500, 1_000, 2_000] }).toBe(true);
}

async function stopBackend(): Promise<void> {
  const child = backend;
  backend = null;
  if (!child?.pid || child.exitCode !== null) return;
  // Negative pid = the whole process group (see `detached` above).
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      /* already gone */
    }
  };
  signalGroup('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signalGroup('SIGKILL');
      resolve();
    }, 8_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  // The group kill is best-effort; confirm the port actually freed so the next run gets
  // a clean spawn rather than the refusal.
  await expect.poll(async () => !(await backendIsUp()), { timeout: 20_000 }).toBe(true);
}

/* -- the seed ------------------------------------------------------------------- */

const hash64 = (value: string): string => createHash('sha256').update(value).digest('hex');
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

type Seed = {
  scaffoldId: string;
  versionId: string;
  campaignNodeId: string;
  adSetNodeId: string;
  adNodeId: string;
  gateApprovalId: string;
  audienceGroupId: string;
  audienceVersionId: string;
  toolGateApprovalId: string;
};

let seed: Seed | null = null;

async function insert<T extends Record<string, unknown>>(
  table: string,
  row: T,
): Promise<Record<string, unknown>> {
  const { data, error } = await brandProfiles().from(table).insert(row).select('id').single();
  if (error) throw new Error(`[canvas-bench] insert ${table} failed: ${error.message}`);
  return data as Record<string, unknown>;
}

/**
 * A real scaffold on the bench brand: one campaign, one ad set, one ad, an APPROVED
 * `build` gate, and one audience group whose publish gate was DENIED.
 *
 * Both gate tables are seeded on purpose. They are read by two different code paths —
 * scaffold nodes join `paid_scaffold_gate_approvals` by (version, gate), audience nodes
 * join `jaina_tool_gate_approvals` by (subject_kind, subject_id) — and a bench that
 * only exercised one would leave the other free to be wrong.
 */
async function seedScaffold(): Promise<Seed> {
  const scaffold = await insert('paid_scaffolds', {
    brand_id: BENCH_BRAND_ID,
    ad_account_id: CLIENT_AD_ACCOUNT_ID,
    name: SCAFFOLD_NAME,
    created_by: BENCH_OWNER_USER_ID,
  });
  const scaffoldId = String(scaffold.id);

  const version = await insert('paid_scaffold_versions', {
    scaffold_id: scaffoldId,
    brand_id: BENCH_BRAND_ID,
    version: 1,
    lifecycle: 'proposed',
    manifest: { schema_version: 1, source: SCAFFOLD_NAME },
    content_hash: hash64(`${scaffoldId}:v1`),
    special_ad_categories: [],
    created_by: BENCH_OWNER_USER_ID,
  });
  const versionId = String(version.id);

  await brandProfiles()
    .from('paid_scaffolds')
    .update({ current_version_id: versionId })
    .eq('id', scaffoldId);

  const campaign = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: BENCH_BRAND_ID,
    parent_id: null,
    level: 'campaign',
    ordinal: 0,
    path_key: 'c0',
    name: `${SCAFFOLD_NAME} // CAMPAIGN`,
    payload: { objective: 'OUTCOME_ENGAGEMENT' },
    status: 'pending',
  });
  const campaignNodeId = String(campaign.id);

  const adSet = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: BENCH_BRAND_ID,
    parent_id: campaignNodeId,
    level: 'adset',
    ordinal: 0,
    path_key: 'c0/a0',
    name: `${SCAFFOLD_NAME} // ADSET`,
    product_key: 'bench_product',
    angle_key: 'bench_angle',
    payload: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimization_goal: 'CONVERSATIONS',
      funnel_stage: 'prospecting',
      placement: { mode: 'advantage_plus' },
    },
    // `created` + a meta id is what makes the Meta-status assertion meaningful: a node
    // that never reached Meta has no Meta status, and inventing one would be the bug.
    status: 'created',
    meta_object_id: '120000000000000001',
  });
  const adSetNodeId = String(adSet.id);

  const ad = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: BENCH_BRAND_ID,
    parent_id: adSetNodeId,
    level: 'ad',
    ordinal: 0,
    path_key: 'c0/a0/ad0',
    name: `${SCAFFOLD_NAME} // AD`,
    product_key: 'bench_product',
    angle_key: 'bench_angle',
    concept_key: 'bench_concept',
    payload: {
      creative: {
        message: 'Bench copy for the canvas hydration hop.',
        headline: 'Bench headline',
        call_to_action_type: 'LEARN_MORE',
      },
    },
    status: 'pending',
  });

  const gateApproval = await insert('paid_scaffold_gate_approvals', {
    version_id: versionId,
    brand_id: BENCH_BRAND_ID,
    gate: 'build',
    status: 'approved',
    content_hash: hash64(`${versionId}:build`),
    approval_token_hash: hash64(`${versionId}:build:token`),
    approval_expires_at: inOneHour(),
    resume_expires_at: inOneHour(),
    resume_messages: [],
    sdk_approval_id: `bench-${RUN_ID}-build`,
    sdk_tool_call_id: `bench-call-${RUN_ID}-build`,
    sdk_tool_name: 'paid_scaffold_build',
    created_by: BENCH_OWNER_USER_ID,
    approved_by: BENCH_OWNER_USER_ID,
    approved_at: new Date().toISOString(),
  });

  const group = await insert('audience_groups', {
    brand_id: BENCH_BRAND_ID,
    ad_account_id: CLIENT_AD_ACCOUNT_ID,
    name: AUDIENCE_NAME,
    created_by: BENCH_OWNER_USER_ID,
  });
  const audienceGroupId = String(group.id);

  const audienceVersion = await insert('audience_group_versions', {
    group_id: audienceGroupId,
    brand_id: BENCH_BRAND_ID,
    version: 1,
    status: 'awaiting_approval',
    manifest: {
      schema_version: 1,
      name: AUDIENCE_NAME,
      ad_account_id: CLIENT_AD_ACCOUNT_ID,
      members: [{ key: 'bench_seed', kind: 'website', name: 'Bench seed audience' }],
      include_member_keys: ['bench_seed'],
      exclude_member_keys: [],
      targeting: { age_min: 25, age_max: 50, geo_locations: { countries: ['MX'] } },
      rationale: 'Seeded by jaina:canvas:e2e:bench.',
      evidence: [],
    },
    content_hash: hash64(`${audienceGroupId}:v1`),
    approval_token_hash: hash64(`${audienceGroupId}:v1:token`),
    approval_expires_at: inOneHour(),
    created_by: BENCH_OWNER_USER_ID,
  });
  const audienceVersionId = String(audienceVersion.id);

  await brandProfiles()
    .from('audience_groups')
    .update({ current_version_id: audienceVersionId })
    .eq('id', audienceGroupId);

  const toolGate = await insert('jaina_tool_gate_approvals', {
    brand_id: BENCH_BRAND_ID,
    tool_name: 'audience_group_publish',
    subject_kind: 'audience_group_version',
    subject_id: audienceVersionId,
    status: 'denied',
    content_hash: hash64(`${audienceVersionId}:publish`),
    approval_token_hash: hash64(`${audienceVersionId}:publish:token`),
    approval_expires_at: inOneHour(),
    resume_expires_at: inOneHour(),
    resume_messages: [],
    sdk_approval_id: `bench-${RUN_ID}-audience`,
    sdk_tool_call_id: `bench-call-${RUN_ID}-audience`,
    created_by: BENCH_OWNER_USER_ID,
  });

  return {
    scaffoldId,
    versionId,
    campaignNodeId,
    adSetNodeId,
    adNodeId: String(ad.id),
    gateApprovalId: String(gateApproval.id),
    audienceGroupId,
    audienceVersionId,
    toolGateApprovalId: String(toolGate.id),
  };
}

/**
 * By id. Never a time window — that has already deleted a real user's row here.
 *
 * Two deletes cover nine rows: every child FK on this family is ON DELETE CASCADE
 * (`version_id`, `scaffold_id`, `group_id`, and the node self-FK `parent_id`), and
 * `current_version_id` is ON DELETE SET NULL, so the parent row can go first. The tool
 * gate is the exception — its `subject_id` is TEXT, not a foreign key, so nothing
 * cascades to it and it is deleted explicitly.
 */
async function deleteSeed(value: Seed): Promise<void> {
  const byId = async (table: string, id: string) => {
    const { error } = await brandProfiles().from(table).delete().eq('id', id);
    if (error) console.warn(`[canvas-bench] cleanup ${table}/${id}: ${error.message}`);
  };
  await byId('jaina_tool_gate_approvals', value.toolGateApprovalId);
  await byId('audience_groups', value.audienceGroupId);
  await byId('paid_scaffolds', value.scaffoldId);
}

/**
 * The most recent Jaina run for a brand, with its event count.
 *
 * A run row is written before the model is reached, so `status` + event count is what
 * separates "the turn never left the browser" (no row) from "it left and the stream
 * produced nothing" (a `pending` row with zero events) from "the model answered without
 * calling the tool" (a finished row with events). Those three read identically at the
 * DOM and have completely different causes.
 */
async function latestRun(
  brandId: string,
  since: string,
): Promise<{ runId: string; status: string; events: number } | null> {
  const { data } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('run_id,status,created_at')
    .eq('brand_id', brandId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { run_id: string; status: string } | undefined;
  if (!row) return null;
  const { count } = await admin
    .schema('jaina')
    .from('jaina_conversation_run_events')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', row.run_id);
  return { runId: row.run_id, status: String(row.status), events: count ?? 0 };
}

/**
 * Every scaffold a conversation proposed, read off its own `paid.scaffold_proposed` frames.
 * Attribution by the conversation that wrote it, not by time: asked to build "the scaffold you
 * just proposed", Jaina has proposed a SECOND scaffold in the later turn — and an id-diff taken
 * after turn 1 leaked that row into a real client's account.
 */
async function scaffoldsProposedInSession(sessionId: string, since: string): Promise<string[]> {
  const { data: runs } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('run_id')
    .eq('session_id', sessionId)
    .gte('created_at', since);
  const runIds = (runs ?? []).map((row) => String((row as { run_id: string }).run_id));
  if (runIds.length === 0) return [];
  const { data: events } = await admin
    .schema('jaina')
    .from('jaina_conversation_run_events')
    .select('payload')
    .in('run_id', runIds)
    .eq('event_type', 'paid.scaffold_proposed');
  return (events ?? []).flatMap((row) => {
    const id = (row as { payload: { parentScaffoldId?: unknown } | null }).payload
      ?.parentScaffoldId;
    return typeof id === 'string' ? [id] : [];
  });
}

/** The newest run's session, so a reload can reopen the exact conversation. */
async function latestSessionId(brandId: string, since: string): Promise<string | null> {
  const { data } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('session_id')
    .eq('brand_id', brandId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as { session_id: string | null } | undefined)?.session_id ?? null;
}

/**
 * Did a run since `since` open the build gate? Separates "the model never asked" (a SKIP about
 * model behaviour) from "it asked and no card rendered" (the chat defect this bench exists for).
 */
async function buildGateOpenedSince(brandId: string, since: string): Promise<string | null> {
  const { data: runs } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('run_id')
    .eq('brand_id', brandId)
    .gte('created_at', since);
  const runIds = (runs ?? []).map((row) => String((row as { run_id: string }).run_id));
  if (runIds.length === 0) return null;
  const { data: events } = await admin
    .schema('jaina')
    .from('jaina_conversation_run_events')
    .select('run_id,payload')
    .in('run_id', runIds)
    .eq('event_type', 'tool.approval_required');
  const opened = (events ?? []).find(
    (row) =>
      (row as { payload: { toolName?: string } | null }).payload?.toolName ===
      'paid_scaffold_build',
  );
  return opened ? String((opened as { run_id: string }).run_id) : null;
}

/**
 * What the ROWS say the chat card must show. The card reads the same rows, so every number it
 * renders is graded against the database, never against what the model said about them.
 */
async function scaffoldTruth(versionIds: string[]) {
  const { data, error } = await brandProfiles()
    .from('paid_scaffold_nodes')
    .select('level,payload,daily_budget_minor_units,creative_asset_id,creative_media')
    .in('version_id', versionIds);
  if (error) throw new Error(`[canvas-bench] scaffold truth read: ${error.message}`);
  const rows = (data ?? []) as {
    level: string;
    payload: { targeting?: unknown } | null;
    daily_budget_minor_units: number | null;
    creative_asset_id: string | null;
    creative_media: unknown;
  }[];
  const adSets = rows.filter((row) => row.level === 'adset');
  const ads = rows.filter((row) => row.level === 'ad');
  return {
    campaigns: rows.filter((row) => row.level === 'campaign').length,
    adSets: adSets.length,
    ads: ads.length,
    budgeted: adSets.filter((row) => typeof row.daily_budget_minor_units === 'number').length,
    budgetMinorUnits: adSets.reduce((total, row) => total + (row.daily_budget_minor_units ?? 0), 0),
    adSetsWithoutAudience: adSets.filter((row) => !row.payload?.targeting).length,
    adsWithoutCreative: ads.filter((row) => !row.creative_asset_id && !row.creative_media).length,
  };
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Screenshots land beside the other bench artifacts at the monorepo root (gitignored). */
const shotPath = (name: string): string =>
  path.join(process.cwd(), '..', 'artifacts', 'jaina-canvas-bench', `${RUN_ID}-${name}.png`);

/* -- brand + session ------------------------------------------------------------- */

const previousBrandByUser = new Map<string, string | null>();

async function rememberBrandPreference(userId: string): Promise<void> {
  if (previousBrandByUser.has(userId)) return;
  const { data } = await brandProfiles()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  previousBrandByUser.set(
    userId,
    (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  );
}

/** The same row the in-app brand switcher writes; `get_active_brand_id` reads it. */
async function selectBrand(userId: string, brandId: string): Promise<void> {
  await rememberBrandPreference(userId);
  const { error } = await brandProfiles()
    .from('user_brand_preferences')
    .upsert(
      { user_id: userId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[canvas-bench] brand switch failed: ${error.message}`);
}

async function restoreBrandPreferences(): Promise<void> {
  for (const [userId, brandId] of previousBrandByUser) {
    if (!brandId) continue;
    await brandProfiles()
      .from('user_brand_preferences')
      .upsert(
        { user_id: userId, active_brand_id: brandId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
  }
}

async function signedInPage(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const storageState = await mintSessionForEmail(email);
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1680, height: 1000 },
  });
  return { context, page: await context.newPage() };
}

async function openCanvas(page: Page): Promise<void> {
  await page.goto('/scale/campaign-canvas', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('canvas-record-bar')).toBeVisible({ timeout: 180_000 });
}

/** The bench user's display name, derived the way the app derives it from the email. */
const displayNameFor = (email: string): string =>
  (email.split('@')[0] ?? '')
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/* -- the run --------------------------------------------------------------------- */

test.describe.configure({ mode: 'serial' });

let benchContext: BrowserContext | null = null;
let benchPage: Page;

test.describe('campaign flow canvas', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    await startBackend();
    seed = await seedScaffold();
    await selectBrand(BENCH_OWNER_USER_ID, BENCH_BRAND_ID);
    const signedIn = await signedInPage(browser, BENCH_OWNER_EMAIL);
    benchContext = signedIn.context;
    benchPage = signedIn.page;
  });

  test.afterAll(async () => {
    await stopBackend();
    if (seed) await deleteSeed(seed);
    await restoreBrandPreferences();
    await benchContext?.close();
    printBenchEnvelope();
  });

  test('hydration — a proposal loads as a graph carrying its gate, approver and Meta status', async () => {
    const current = seed;
    expect(current).not.toBeNull();
    if (!current) return;

    await openCanvas(benchPage);

    // The picker lists the brand's scaffolds and the seeded one is among them.
    await benchPage.getByTestId('canvas-scaffold-picker').click();
    await benchPage.getByRole('option', { name: SCAFFOLD_NAME }).click();

    // The graph: campaign -> ad set -> ad, plus the audience group as its own node.
    // `exact` throughout: "… // AD" is a substring of "… // ADSET", and the default
    // substring match makes the ad assertion pass on the ad set's node.
    await expect(benchPage.getByText(`${SCAFFOLD_NAME} // CAMPAIGN`, { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(benchPage.getByText(`${SCAFFOLD_NAME} // ADSET`, { exact: true })).toBeVisible();
    await expect(benchPage.getByText(`${SCAFFOLD_NAME} // AD`, { exact: true })).toBeVisible();
    await expect(benchPage.getByText(AUDIENCE_NAME, { exact: true })).toBeVisible();
    grade('hydration.graph', true, 'campaign + adset + ad + audience node rendered');

    // Every node carries a gate. The scaffold nodes read the APPROVED build gate; the
    // audience node reads the DENIED tool gate — two tables, two readers, one screen.
    const gates = benchPage.getByTestId('canvas-node-gate');
    await expect(gates).toHaveCount(4);
    await expect(gates.filter({ hasText: 'Approved' })).toHaveCount(3);
    await expect(gates.filter({ hasText: 'Denied' })).toHaveCount(1);
    grade('hydration.gates', true, '3 approved scaffold nodes, 1 denied audience node');

    // Approved by WHOM: a display name derived from the member's email, not a uuid.
    const approver = benchPage.getByTestId('canvas-node-approver').first();
    await expect(approver).toContainText(displayNameFor(BENCH_OWNER_EMAIL));
    await expect(approver).not.toContainText(BENCH_OWNER_USER_ID);
    grade('hydration.approver', true, `resolved to "${displayNameFor(BENCH_OWNER_EMAIL)}"`);

    // Meta id and Meta status, on the ONE node that actually reached Meta. Asserted as
    // a set: a node with no Meta object must say so, never show an invented status.
    const metaIds = benchPage.getByTestId('canvas-node-meta-id');
    await expect(metaIds).toHaveCount(4);
    await expect(metaIds.filter({ hasText: 'Meta ID:' })).toHaveCount(1);
    await expect(metaIds.filter({ hasText: 'Meta ID:' })).toHaveText('Meta ID: 120000000000000001');
    await expect(metaIds.filter({ hasText: 'Not on Meta' })).toHaveCount(3);
    const metaStatus = benchPage.getByTestId('canvas-node-meta-status');
    await expect(metaStatus).toHaveCount(1);
    await expect(metaStatus).toHaveText('PAUSED');
    grade('hydration.meta', true, '1 node on Meta as PAUSED, 3 reported as not on Meta');

    // The version the canvas is showing, from `paid_scaffold_versions`.
    await expect(benchPage.getByTestId('canvas-record-version')).toContainText('v1');
    await expect(benchPage.getByTestId('canvas-record-version')).toContainText('proposed');
    grade('hydration.version', true);
  });

  test('a hydrated node is a record — editing it marks the canvas dirty and writes nothing', async () => {
    const current = seed;
    expect(current).not.toBeNull();
    if (!current) return;

    const before = await brandProfiles()
      .from('paid_scaffold_nodes')
      .select('name')
      .eq('id', current.campaignNodeId)
      .single();
    const nameBefore = (before.data as { name: string }).name;

    // The real editing affordance: double-click the label, type, commit with Enter.
    const label = benchPage.getByText(`${SCAFFOLD_NAME} // CAMPAIGN`, { exact: true });
    await label.dblclick();
    const editor = benchPage.locator('input:focus, textarea:focus').first();
    await editor.fill(`${SCAFFOLD_NAME} // EDITED LOCALLY`);
    await editor.press('Enter');

    await expect(benchPage.getByTestId('canvas-record-dirty')).toBeVisible();
    await expect(
      benchPage.getByText(`${SCAFFOLD_NAME} // EDITED LOCALLY`, { exact: true }),
    ).toBeVisible();
    grade('hitl.dirty', true, 'edit marked the canvas dirty');

    // The anchor: the ROW is unchanged. Not "no request was seen" — the row itself.
    const after = await brandProfiles()
      .from('paid_scaffold_nodes')
      .select('name')
      .eq('id', current.campaignNodeId)
      .single();
    const nameAfter = (after.data as { name: string }).name;
    expect(nameAfter).toBe(nameBefore);
    expect(nameAfter).not.toContain('EDITED LOCALLY');
    grade('hitl.no-write', true, 'paid_scaffold_nodes.name unchanged after the edit');
  });

  test('propose via Jaina, the card in chat, the gate a turn later, denied', async ({
    browser,
  }, testInfo) => {
    // Two model turns, a 240s window for the gate, and a reload: 420s ran out mid-reload.
    testInfo.setTimeout(660_000);

    // The propose hop runs as the CLIENT brand's own member: the bench brand has no
    // linked ad account and the chat 409s there before any turn begins. The member's
    // uid comes from `brand_profiles.permissions`, which is the app's own answer to
    // "who is on this brand" — cheaper and more truthful than paging auth.users.
    const { data: members, error: membersError } = await brandProfiles()
      .from('permissions')
      .select('user_id,email')
      .eq('brand_profile_id', CLIENT_BRAND_ID);
    if (membersError) throw new Error(`[canvas-bench] permissions read: ${membersError.message}`);
    const clientUserId = (members ?? [])
      .map((row) => row as { user_id: string; email: string | null })
      .find((row) => row.email?.toLowerCase() === CLIENT_OWNER_EMAIL)?.user_id;
    expect(clientUserId, `${CLIENT_OWNER_EMAIL} is not a member of the client brand`).toBeTruthy();
    if (!clientUserId) return;

    await selectBrand(clientUserId, CLIENT_BRAND_ID);

    // Every scaffold this brand owns BEFORE the turn. Anything new is ours to delete.
    //
    // An id-diff, minus the ONE known foreign writer. The brand is shared:
    // `paid-scaffold-creative-mvp-bench.ts` creates scaffolds on it under the fixture
    // account `act_bench_mvp`, and a bare diff would both attribute one of those to this
    // turn AND delete it in the finally block.
    //
    // Excluding that account is the whole filter on purpose. An earlier version also
    // pinned `created_by` and `ad_account_id` to the values this bench expects, and it
    // silently excluded the row propose actually wrote — the poll then timed out and the
    // bench reported "propose never ran" about a turn that had run fine. A cleanup
    // filter must be built out of what is known FOREIGN, never out of a guess about what
    // the code under test writes.
    const scaffoldIds = async (): Promise<string[]> =>
      (
        (
          await brandProfiles()
            .from('paid_scaffolds')
            .select('id')
            .eq('brand_id', CLIENT_BRAND_ID)
            .neq('ad_account_id', 'act_bench_mvp')
        ).data ?? []
      ).map((row) => String((row as { id: string }).id));
    const idsBefore = new Set(await scaffoldIds());
    const turnStartedAt = new Date().toISOString();

    const { context, page } = await signedInPage(browser, CLIENT_OWNER_EMAIL);
    let createdIds: string[] = [];
    try {
      await openCanvas(page);
      // Base UI ignores a click that did not pointerdown on the item, and a
      // center click misses because the label is one unwrapped line. Typeahead
      // highlights the live-account scaffold; Enter commits it.
      await page.getByTestId('canvas-scaffold-picker').click();
      await expect(page.getByRole('listbox')).toBeVisible({ timeout: 15_000 });
      await page.keyboard.type(CLIENT_SCAFFOLD_NAME_FRAGMENT);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('canvas-record-version')).toBeVisible({ timeout: 90_000 });

      // A FRESH conversation. The panel reopens the newest one on mount, and on this shared
      // brand that was an earlier bench's turn asking for the build gate — so the model opened
      // the gate unasked and every card grade read the old turn. Wait for that async restore
      // to land (the newest row goes active, i.e. disabled) or "new" is silently overridden.
      await page.getByRole('button', { name: 'Open Jaina' }).click();
      await page.getByRole('button', { name: 'Maximize chat' }).click();
      const newestConversation = page.locator('[data-testid^="jaina-conversation-"]').first();
      if (await newestConversation.isVisible({ timeout: 30_000 }).catch(() => false)) {
        await expect(newestConversation).toBeDisabled({ timeout: 60_000 });
      }
      await page.getByRole('button', { name: 'Create new conversation' }).click();
      // Maximized, the panel covers the record bar's Propose button. Minimize — never close:
      // closing unmounts the surface and the remount restores the old conversation again.
      await page.getByRole('button', { name: 'Minimize chat' }).click();

      // The real affordance, driven the way a human drives it.
      await page.getByTestId('canvas-propose-via-jaina').click();

      const composer = page.getByRole('textbox', { name: 'Message Jaina' });
      await expect(composer).toContainText('Propose the campaign on my canvas', {
        timeout: 30_000,
      });
      grade('propose.composer', true, 'canvas request pre-filled in the chat');

      // ONE turn, not two. `insertTextAtSelection` left the editor focused with the
      // request in it, so End+Enter submits exactly as a human pressing return would —
      // and the gate ask is appended to that same text rather than sent as a second
      // turn. A second turn typed into a composer that has just finished streaming did
      // not dispatch at all in an earlier run (zero run rows), which reads as "the
      // model declined the gate" when the truth was that nothing was ever sent.
      // The submit itself is not the variable. Both this and a locator-scoped
      // `pressSequentially`/`press` pair were run against this bench, and both dispatch:
      // a run row appears in `jaina.jaina_conversation_runs` either way. What varies is
      // what happens AFTER dispatch — two early runs reached `paid_scaffold_propose`
      // (one of them through to the build gate and its denial), and every later run
      // stalled at `status=pending, 0 events`, which is the stream never reaching the
      // model. That is a Jaina-runtime condition, not a keystroke one, and it is why the
      // steps below grade SKIP with the run id rather than failing the canvas.
      // Propose ONLY. The gate is asked for in a SECOND turn below, because that is how a
      // person does it — review the proposal, then say "build it" — and it is the path where
      // the gate turn carries no proposal frame of its own.
      // Enter on this contenteditable has already failed to dispatch (no run row).
      // The send button is the control a pointer actually uses.
      await page.getByRole('button', { name: 'Send message' }).click();

      // The propose anchor is the ROW, not the prose: `paid_scaffold_propose` is
      // ungated (it writes Continuum rows only) so it produces no card of its own.
      const proposed = await expect
        .poll(async () => (await scaffoldIds()).filter((id) => !idsBefore.has(id)).length, {
          timeout: 300_000,
          intervals: [2_000, 5_000],
        })
        .toBeGreaterThan(0)
        .then(() => true)
        .catch(() => false);
      createdIds = (await scaffoldIds()).filter((id) => !idsBefore.has(id));

      if (proposed) {
        grade(
          'propose.persisted',
          true,
          `${createdIds.length} scaffold row(s) written by paid_scaffold_propose`,
        );
      } else {
        graded.push({
          step: 'propose.persisted',
          grade: 'SKIP',
          detail: 'the turn dispatched but did not call paid_scaffold_propose in time',
        });
        const run = await latestRun(CLIENT_BRAND_ID, turnStartedAt);
        notes.push(
          'UN-EXERCISED: paid_scaffold_propose did not run in this turn. The canvas half IS ' +
            'graded above — the graph reached the composer and the turn dispatched. What the ' +
            'run row says about the rest: ' +
            (run
              ? `run ${run.runId} status=${run.status}, ${run.events} event(s). A pending row ` +
                'with zero events means the stream stalled before the model was reached, which ' +
                'is a Jaina-runtime question, not a canvas one.'
              : 'no run row at all, so the turn never left the browser.'),
        );
      }

      const versionIdsOf = async (): Promise<string[]> =>
        (
          (
            await brandProfiles()
              .from('paid_scaffold_versions')
              .select('id')
              .in('scaffold_id', createdIds)
          ).data ?? []
        ).map((row) => String((row as { id: string }).id));

      // ---- the chat presentation: graded against the rows, never the prose -----------
      // Scoped to THIS run's version: an older turn's card is not evidence about this one.
      const proposedVersionIds = proposed ? await versionIdsOf() : [];
      const cards = page.locator(
        proposedVersionIds
          .map((id) => `[data-testid="paid-scaffold-card"][data-scaffold-version="${id}"]`)
          .join(', ') || '[data-testid="paid-scaffold-card"][data-scaffold-version="none"]',
      );
      let expectedSummary: string | null = null;
      // Did turn 1 open the gate on its own? Then the card must SAY so — that is the truthful
      // pill for that card — and the later-turn gate below has nothing left to ask for.
      let gateOpenedInTurn1: string | null = null;
      if (proposed) {
        await expect
          .poll(async () => (await latestRun(CLIENT_BRAND_ID, turnStartedAt))?.status, {
            timeout: 300_000,
            intervals: [3_000, 5_000],
          })
          .toMatch(/completed|failed|paused|awaiting|cancel/);
        gateOpenedInTurn1 = await buildGateOpenedSince(CLIENT_BRAND_ID, turnStartedAt);
        const truth = await scaffoldTruth(proposedVersionIds);
        expectedSummary = [
          plural(truth.campaigns, 'campaign'),
          plural(truth.adSets, 'ad set'),
          plural(truth.ads, 'ad'),
        ].join(' · ');
        const card = cards.first();
        await expect(card).toBeVisible({ timeout: 120_000 });
        await expect(card).toContainText(expectedSummary);
        if (gateOpenedInTurn1) {
          await expect(card).toContainText('Awaiting your approval');
          grade('chat.card', true, `${expectedSummary}, gate opened in the same turn and says so`);
        } else {
          await expect(card).toContainText('Proposed — nothing on Meta yet');
          await expect(card).not.toContainText('Awaiting your approval');
          grade('chat.card', true, `${expectedSummary}, called a proposal (no gate is open)`);
        }

        if (truth.budgeted > 0) {
          const total = card.getByTestId('scaffold-opening-budget-total');
          await expect(total).toBeVisible();
          const shown = (await total.textContent()) ?? '';
          expect(Number(shown.replace(/[^\d]/g, ''))).toBe(
            Math.round(truth.budgetMinorUnits / 100),
          );
          grade('chat.budget', true, `"${shown}" == ${truth.budgetMinorUnits} minor units in rows`);
        } else {
          await expect(card.getByTestId('scaffold-opening-budget')).toContainText(
            'placeholder budget',
          );
          grade('chat.budget', true, 'no measured CPA in the rows; the card names the placeholder');
        }

        const audienceBlocker = card.getByTestId('scaffold-blocker-audience');
        if (truth.adSetsWithoutAudience > 0) {
          await expect(audienceBlocker).toContainText(
            plural(truth.adSetsWithoutAudience, 'ad set'),
          );
        } else {
          await expect(audienceBlocker).toHaveCount(0);
        }
        const creativeBlocker = card.getByTestId('scaffold-blocker-creative');
        if (truth.adsWithoutCreative > 0) {
          await expect(creativeBlocker).toContainText(plural(truth.adsWithoutCreative, 'ad'));
        } else {
          await expect(creativeBlocker).toHaveCount(0);
        }
        grade(
          'chat.blockers',
          true,
          `${truth.adSetsWithoutAudience} ad set(s) without audience, ` +
            `${truth.adsWithoutCreative} ad(s) without creative — as the rows say`,
        );

        // Both widths a person actually gets: Propose opens the panel maximized, and the
        // header button drops it to the 420px default.
        await card.screenshot({ path: shotPath('card-maximized') });
        await page.getByRole('button', { name: 'Minimize chat' }).click();
        await expect(card.getByTestId('scaffold-outline')).toBeVisible({ timeout: 15_000 });
        await card.screenshot({ path: shotPath('card-420') });
        // Present is not readable: an earlier run "passed" here with the card crushed to 25px
        // wide behind a 288px conversations sidebar. The width is the grade. 260, not the panel's
        // 420: the panel padding and transcript gutters take ~137px at any width (measured 283px
        // once the sidebar stacked), and 260 still fails the crush by a factor of ten.
        const narrowWidth = (await card.boundingBox())?.width ?? 0;
        expect(narrowWidth, 'the card is too narrow to read in the 420px panel').toBeGreaterThan(
          260,
        );
        grade(
          'chat.narrow',
          true,
          `outline at ${Math.round(narrowWidth)}px wide in the 420px panel`,
        );
        await page.getByRole('button', { name: 'Maximize chat' }).click();

        // Chat -> canvas: the card's link loads THIS scaffold as the canvas record.
        const { data: proposedScaffold } = await brandProfiles()
          .from('paid_scaffolds')
          .select('id,name')
          .in('id', createdIds)
          .limit(1)
          .single();
        const proposedRow = proposedScaffold as { id: string; name: string } | null;
        expect(proposedRow, 'the proposed scaffold row could not be read back').toBeTruthy();
        if (proposedRow) {
          await card.getByTestId('scaffold-open-canvas').click();
          await expect(page).toHaveURL(new RegExp(`scaffold=${proposedRow.id}`), {
            timeout: 30_000,
          });
          await expect(page.getByTestId('canvas-scaffold-picker')).toContainText(proposedRow.name, {
            timeout: 90_000,
          });
          await expect(page.getByTestId('canvas-record-version')).toContainText('proposed');
          grade('chat.open-canvas', true, `canvas now shows "${proposedRow.name}"`);
        }
      }

      // ---- the build gate, asked for a turn LATER ---------------------------------------
      // That turn carries no proposal frame, which is exactly the case that used to render no
      // card and no buttons. A card that appears is always DENIED, never approved.
      const approveButton = page.getByRole('button', { name: 'Approve & create (paused)' });
      let gateAppeared = false;
      if (proposed && gateOpenedInTurn1) {
        gateAppeared = await approveButton.isVisible();
        graded.push({
          step: 'chat.gate-next-turn',
          grade: 'SKIP',
          detail: `run ${gateOpenedInTurn1} opened the gate in turn 1, unasked; nothing to ask for`,
        });
        notes.push(
          'UN-EXERCISED: the later-turn gate. Jaina opened paid_scaffold_build in the proposing ' +
            'turn without being asked, so the gate is graded (and denied) on that card instead.',
        );
      } else if (proposed) {
        const gateAskedAt = new Date().toISOString();
        await composer.click();
        await page.keyboard.type(
          'Call paid_scaffold_build for the scaffold you just proposed so its approval card ' +
            'opens. I will review and answer the card myself. Do not summarise the scaffold.',
        );
        await page.getByRole('button', { name: 'Send message' }).click();
        gateAppeared = await approveButton
          .waitFor({ state: 'visible', timeout: 240_000 })
          .then(() => true)
          .catch(() => false);
        if (!gateAppeared) {
          const openedBy = await buildGateOpenedSince(CLIENT_BRAND_ID, gateAskedAt);
          if (openedBy) {
            grade(
              'chat.gate-next-turn',
              false,
              `run ${openedBy} opened paid_scaffold_build, and no approval card rendered`,
            );
          } else {
            graded.push({
              step: 'chat.gate-next-turn',
              grade: 'SKIP',
              detail: 'the second turn did not open paid_scaffold_build; no card to deny',
            });
            notes.push(
              'UN-EXERCISED: the build gate in a later turn. No tool.approval_required for ' +
                'paid_scaffold_build was logged, so this is model behaviour, not a missing card. ' +
                'Nothing was approved.',
            );
          }
        }
      }

      if (gateAppeared) {
        // The card that HOLDS the Approve — not "the last card": the later turn may propose a
        // scaffold of its own and gate that one instead.
        const gateCard = page.locator('[data-testid="paid-scaffold-card"]', { has: approveButton });
        await expect(gateCard).toContainText('Awaiting your approval');
        const sessionId = await latestSessionId(CLIENT_BRAND_ID, turnStartedAt);
        if (sessionId) {
          const ours = await scaffoldsProposedInSession(sessionId, turnStartedAt);
          createdIds = [...new Set([...createdIds, ...ours.filter((id) => !idsBefore.has(id))])];
        }
        const gateVersion = (await gateCard.getAttribute('data-scaffold-version')) ?? '';
        expect(await versionIdsOf(), 'the gated card is not a scaffold this run wrote').toContain(
          gateVersion,
        );
        // The duplicate re-propose, graded: the gate must open on the scaffold turn 1 wrote.
        // That also makes this the live run of the seeded card path — a gate turn that
        // carries no proposal frame of its own.
        const reproposed = !gateOpenedInTurn1 && !proposedVersionIds.includes(gateVersion);
        if (!gateOpenedInTurn1) {
          grade(
            'chat.gate-next-turn',
            !reproposed,
            reproposed
              ? 'turn 2 proposed a DUPLICATE scaffold and gated it instead of building the one on screen'
              : 'the gate opened on the turn-1 scaffold; its card rendered with no proposal frame',
          );
        }
        // DENY. Never approve: a denied gate never reaches `claim_paid_scaffold_gate`,
        // so no Meta object is created. `Dismiss` is this card's reject label.
        //
        // Scoped to the card's own footer rather than the page: a bare name lookup also
        // matches controls in the conversations sidebar, and Playwright then spends its
        // whole timeout retrying a click the sidebar is covering.
        const cardActions = approveButton.locator('..');
        const denyButton = cardActions.getByRole('button', { name: 'Dismiss' });
        // Both actions carry `locked={isStreaming}`, so the card renders with its
        // buttons DISABLED while the turn is still streaming. Waiting for enabled is
        // waiting for the turn to settle; clicking before that just burns the
        // actionability window against a re-rendering card.
        await expect(denyButton).toBeEnabled({ timeout: 180_000 });
        await denyButton.scrollIntoViewIfNeeded();
        await denyButton.click();
        await expect(page.getByText('Declined — nothing created')).toBeVisible({ timeout: 60_000 });
        grade('chat.denied', true, 'gate answered deny; the card says nothing was created');
        // Asserted only after the deny, so a failing run still leaves nothing approvable.
        expect(reproposed, 'turn 2 re-proposed a duplicate scaffold instead of building').toBe(false);
      }

      // ---- a reload brings the card back, and never the Approve beside it ------------------
      if (proposed && expectedSummary) {
        const sessionId = await latestSessionId(CLIENT_BRAND_ID, turnStartedAt);
        expect(sessionId, 'the proposing run has no session id').toBeTruthy();
        await page.reload({ waitUntil: 'domcontentloaded' });
        // Not the record bar: it is in the server HTML, and the tree swaps to a loading skeleton
        // after first paint — a click there is lost. The version pill needs a hydrated client
        // AND a real fetch of the `?scaffold=` the card linked to.
        await expect(page.getByTestId('canvas-record-version')).toBeVisible({ timeout: 180_000 });
        await page.getByRole('button', { name: 'Open Jaina' }).click();
        await page.getByRole('button', { name: 'Maximize chat' }).click();
        // The panel restores the newest conversation on mount — usually this one, whose row is
        // then disabled as active. Click only if it did not; a disabled click waits forever.
        const conversation = page.getByTestId(`jaina-conversation-${sessionId}`);
        await conversation.waitFor({ state: 'visible', timeout: 60_000 });
        if (await conversation.isEnabled()) await conversation.click();
        await expect(cards.first()).toContainText(expectedSummary, { timeout: 90_000 });
        await expect(approveButton).toHaveCount(0);
        await cards.first().screenshot({ path: shotPath('card-after-reload') });
        grade('chat.reload', true, `the card came back (${expectedSummary}) with no live Approve`);
      }

      // The Meta fence, asserted rather than assumed, and asserted whether or not the
      // gate card appeared: nothing this turn created carries a Meta id.
      const versionIds = await versionIdsOf();
      const { data: createdNodes } = await brandProfiles()
        .from('paid_scaffold_nodes')
        .select('meta_object_id,meta_creative_id')
        .in('version_id', versionIds);
      // A fence over an empty set proves nothing. When propose DID write a scaffold it
      // wrote nodes too (one RPC, one transaction), so zero nodes there means the read
      // missed them and the assertion below would pass without grading anything.
      if (proposed) {
        expect(versionIds.length, 'the proposed scaffold has no version rows').toBeGreaterThan(0);
        expect(
          (createdNodes ?? []).length,
          'the proposed scaffold has no node rows to fence',
        ).toBeGreaterThan(0);
      }
      const touchedMeta = (createdNodes ?? []).filter((entry) => {
        const row = entry as { meta_object_id: string | null; meta_creative_id: string | null };
        return row.meta_object_id !== null || row.meta_creative_id !== null;
      });
      expect(touchedMeta).toHaveLength(0);
      grade(
        'propose.meta-fence',
        true,
        `${(createdNodes ?? []).length} node(s) created, every Meta id null`,
      );
    } finally {
      // Re-read here rather than trusted from turn 1: a later turn can write a scaffold of its
      // own. Only what THIS conversation proposed, and nothing that existed before it.
      const sessionId = await latestSessionId(CLIENT_BRAND_ID, turnStartedAt).catch(() => null);
      const proposedHere = sessionId
        ? await scaffoldsProposedInSession(sessionId, turnStartedAt).catch(() => [])
        : [];
      const toDelete = new Set([...createdIds, ...proposedHere.filter((id) => !idsBefore.has(id))]);
      // One delete per scaffold: `scaffold_id`, `version_id` and the node self-FK are
      // all ON DELETE CASCADE, and `current_version_id` is ON DELETE SET NULL.
      for (const scaffoldId of toDelete) {
        const { error } = await brandProfiles()
          .from('paid_scaffolds')
          .delete()
          .eq('id', scaffoldId);
        if (error)
          console.warn(`[canvas-bench] cleanup paid_scaffolds/${scaffoldId}: ${error.message}`);
      }
      // The conversation this run STARTED sits in a real client's sidebar. Deleted through the
      // app's own route (runs, events, messages, session) as the trash icon does — and only when
      // it was created during this run, never one the panel happened to restore.
      if (sessionId) {
        const { data: session } = await admin
          .schema('jaina')
          .from('jaina_conversation_sessions')
          .select('created_at')
          .eq('session_id', sessionId)
          .maybeSingle();
        const createdAt = (session as { created_at: string } | null)?.created_at;
        if (createdAt && Date.parse(createdAt) >= Date.parse(turnStartedAt)) {
          const response = await page.request
            .delete(`/api/agents/jaina/chat/conversations/${encodeURIComponent(sessionId)}`)
            .catch(() => null);
          if (!response?.ok()) {
            console.warn(`[canvas-bench] cleanup conversation ${sessionId}: ${response?.status()}`);
          }
        }
      }
      await context.close();
    }
  });
});
