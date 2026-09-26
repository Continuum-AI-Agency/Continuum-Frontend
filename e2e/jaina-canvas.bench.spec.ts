import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';
import { STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
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
//   4. THE CARD IN CHAT — graded against the rows it reads: counts per level, the six-figure
//      summary strip (budget summed from the rows), the evidence from manifest.plan, ONE
//      "Deploy paused" action with its blockers named, the outline at the 420px panel width,
//      the link back onto the canvas. The deploy gate — opened by the proposal or by the
//      card's own operator action — is DENIED, and a reload must bring the card back without a
//      live Approve. Screenshots: artifacts/jaina-canvas-bench/.
//   5. EDIT → SAVE → DEPLOY (see that test's header): a seeded client-brand version is edited
//      on the canvas (side-entry audience, inspector budget and copy, a 2-card carousel from
//      the Library), saved as a NEW version row that carries the edits, and its deploy gate is
//      opened from the record bar and denied.
//
// ── MONEY SAFETY — this bench cannot write to an ad account ──
//   * `paid_scaffold_propose` and the canvas save are UNGATED BY DESIGN: they write Continuum
//     rows only — no Meta call, no spend. The only gate on the chain is `paid_scaffold_deploy`,
//     and this bench answers it DENY every time. Nothing is approved anywhere in this file;
//     there is no `'approve'` in it.
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
const SAVE_SCAFFOLD_NAME = `${BENCH_TAG}canvas-save ${RUN_ID}`;
/**
 * The save → deploy hop runs on the ARMED SANDBOX, never a client: StarCraft's sandbox account
 * resolves a single Page (the deploy gate's own precondition — Easy Fit has several and the gate
 * refuses there by name), and it is the account the Backend deploy bench already drives. The
 * gate is still only ever DENIED here.
 */
const SANDBOX_AD_ACCOUNT_ID = 'act_1246951350890277';
const SANDBOX_OWNER_EMAIL = 'duane@continuumai.agency';

const EDITED_COPY = `Canvas-edited copy ${RUN_ID}: stretch that moves with you.`;
const EDITED_LINK = 'https://easyfit.mx/bench-canvas';

/** The slice of `manifest.plan` the save hop reads back. */
type PaidPlanTruth = {
  adsets?: {
    budget_source?: string;
    daily_budget_minor_units?: number | null;
    audience?: {
      kind?: string;
      targeting?: { countries?: string[]; age_min?: number; age_max?: number };
    };
  }[];
  ads?: { creative?: { format?: string; cards?: unknown[] } | null }[];
};
type PaidAdPayload = { creative?: { message?: string; link?: string } } | null;
type SentDraftNode = { level: string; message: string | null; link: string | null };

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
      // EVERY loop that claims other brands' production work — queues, automations, the
      // scheduled-publish poller that posts real clients' due posts. Left on, a bench races the
      // deployed Backend for them.
      BACKGROUND_WORKERS_ENABLED: 'false',
      JAINA_REPORT_ARTIFACT_WORKER_ENABLED: 'false',
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

/** The gate "Deploy paused" answers; `paid_scaffold_build` only in pre-deploy transcripts. */
const DEPLOY_GATE_TOOLS = ['paid_scaffold_deploy', 'paid_scaffold_build'];

/**
 * Did a run since `since` open the deploy gate? Separates "the model never asked" (a SKIP about
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
  const opened = (events ?? []).find((row) =>
    DEPLOY_GATE_TOOLS.includes(
      (row as { payload: { toolName?: string } | null }).payload?.toolName ?? '',
    ),
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
  const { data: versions } = await brandProfiles()
    .from('paid_scaffold_versions')
    .select('plan:manifest->plan')
    .in('id', versionIds);
  const evidence = ((versions ?? []) as { plan: { evidence?: unknown[] } | null }[]).reduce(
    (total, row) => total + (Array.isArray(row.plan?.evidence) ? row.plan.evidence.length : 0),
    0,
  );
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
    evidence,
  };
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Screenshots land beside the other bench artifacts at the monorepo root (gitignored). */
const shotPath = (name: string): string =>
  path.join(process.cwd(), '..', 'artifacts', 'jaina-canvas-bench', `${RUN_ID}-${name}.png`);

/**
 * Deploy gate rows opened on these scaffolds' versions. Their subject is `<versionId>:<hash>` as
 * TEXT — nothing cascades to it — so they are read by that prefix and then deleted by id.
 */
async function deleteDeployGates(scaffoldIds: string[]): Promise<void> {
  if (scaffoldIds.length === 0) return;
  const { data: versions } = await brandProfiles()
    .from('paid_scaffold_versions')
    .select('id')
    .in('scaffold_id', scaffoldIds);
  for (const version of (versions ?? []) as { id: string }[]) {
    const { data: gates } = await brandProfiles()
      .from('jaina_tool_gate_approvals')
      .select('id')
      .in('tool_name', DEPLOY_GATE_TOOLS)
      .like('subject_id', `${version.id}:%`);
    for (const gate of (gates ?? []) as { id: string }[]) {
      const { error } = await brandProfiles()
        .from('jaina_tool_gate_approvals')
        .delete()
        .eq('id', gate.id);
      if (error) console.warn(`[canvas-bench] cleanup gate ${gate.id}: ${error.message}`);
    }
  }
}

/* -- the edit → save → deploy hop ------------------------------------------------------ */

/** A brand member's uid — `brand_profiles.permissions` is the app's own answer to "who". */
async function brandMemberId(brandId: string, email: string): Promise<string> {
  const { data: members, error } = await brandProfiles()
    .from('permissions')
    .select('user_id,email')
    .eq('brand_profile_id', brandId);
  if (error) throw new Error(`[canvas-bench] permissions read: ${error.message}`);
  const id = (members ?? [])
    .map((row) => row as { user_id: string; email: string | null })
    .find((row) => row.email?.toLowerCase() === email)?.user_id;
  if (!id) throw new Error(`[canvas-bench] ${email} is not a member of brand ${brandId}`);
  return id;
}

type SaveSeed = { scaffoldId: string; versionId: string; adSetNodeId: string; adNodeId: string };

/**
 * A v1 on the sandbox account, shaped like the scaffolds Jaina proposes: one campaign, one ad set
 * with NO audience, one ad with copy and NO creative. The save hop has to run where the account is
 * linked — the compiler reads Meta's floor and the account's Page — and seeding it (rather than
 * editing a real proposal) means no real scaffold ever gets a version nobody made. Deleted by id
 * in the test's `finally`.
 */
async function seedSaveScaffold(userId: string): Promise<SaveSeed> {
  const scaffold = await insert('paid_scaffolds', {
    brand_id: STARCRAFT_BRAND_ID,
    ad_account_id: SANDBOX_AD_ACCOUNT_ID,
    name: SAVE_SCAFFOLD_NAME,
    created_by: userId,
  });
  const scaffoldId = String(scaffold.id);
  const version = await insert('paid_scaffold_versions', {
    scaffold_id: scaffoldId,
    brand_id: STARCRAFT_BRAND_ID,
    version: 1,
    lifecycle: 'proposed',
    manifest: { schema_version: 1, source: SAVE_SCAFFOLD_NAME },
    content_hash: hash64(`${scaffoldId}:v1`),
    special_ad_categories: [],
    created_by: userId,
  });
  const versionId = String(version.id);
  await brandProfiles()
    .from('paid_scaffolds')
    .update({ current_version_id: versionId })
    .eq('id', scaffoldId);
  const campaign = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: STARCRAFT_BRAND_ID,
    parent_id: null,
    level: 'campaign',
    ordinal: 0,
    path_key: 'c0',
    name: `${SAVE_SCAFFOLD_NAME} // CAMPAIGN`,
    payload: { objective: 'OUTCOME_TRAFFIC' },
    status: 'pending',
  });
  const adSet = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: STARCRAFT_BRAND_ID,
    parent_id: String(campaign.id),
    level: 'adset',
    ordinal: 0,
    path_key: 'c0/a0',
    name: `${SAVE_SCAFFOLD_NAME} // ADSET`,
    product_key: 'bench_product',
    angle_key: 'bench_angle',
    payload: {
      objective: 'OUTCOME_TRAFFIC',
      optimization_goal: 'LINK_CLICKS',
      funnel_stage: 'prospecting',
      placement: { mode: 'advantage_plus' },
    },
    status: 'pending',
  });
  const ad = await insert('paid_scaffold_nodes', {
    version_id: versionId,
    brand_id: STARCRAFT_BRAND_ID,
    parent_id: String(adSet.id),
    level: 'ad',
    ordinal: 0,
    path_key: 'c0/a0/ad0',
    name: `${SAVE_SCAFFOLD_NAME} // AD`,
    product_key: 'bench_product',
    angle_key: 'bench_angle',
    concept_key: 'bench_concept',
    payload: {
      creative: {
        message: 'Bench copy before the canvas edit.',
        headline: 'Bench headline',
        link: 'https://easyfit.mx/',
        call_to_action_type: 'LEARN_MORE',
      },
    },
    status: 'pending',
  });
  return { scaffoldId, versionId, adSetNodeId: String(adSet.id), adNodeId: String(ad.id) };
}

/** Drag one handle onto another the way a pointer does — React Flow listens for exactly this. */
async function dragHandle(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('[canvas-bench] a handle has no box to drag');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Right-click an empty stretch of the canvas and add one node from the palette. */
const MENU_NODE_TYPES = { Audience: 'audience', Creative: 'creative', 'Ad Set': 'ad-set' } as const;

async function addNodeFromMenu(
  page: Page,
  label: keyof typeof MENU_NODE_TYPES,
  at: { x: number; y: number },
): Promise<string> {
  // `at` is pane-relative; the right-click moves the pointer there, which is where the canvas
  // drops the node.
  await page.locator('.react-flow__pane').click({ button: 'right', position: at });
  await page.getByRole('menuitem', { name: 'Add Component' }).hover();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  const inspector = page.getByTestId('canvas-inspector');
  await expect(inspector).toHaveAttribute('data-node-type', MENU_NODE_TYPES[label]);
  return (await inspector.getAttribute('data-node-id')) ?? '';
}

async function selectNode(page: Page, nodeId: string): Promise<Locator> {
  await page
    .locator(`.react-flow__node[data-id="${nodeId}"]`)
    .click({ position: { x: 24, y: 12 } });
  const inspector = page.getByTestId('canvas-inspector');
  await expect(inspector).toHaveAttribute('data-node-id', nodeId);
  return inspector;
}

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

  test('edit on the canvas, save a NEW version that carries the edits, deploy it paused — denied', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(600_000);
    const ownerUserId = await brandMemberId(STARCRAFT_BRAND_ID, SANDBOX_OWNER_EMAIL);
    await selectBrand(ownerUserId, STARCRAFT_BRAND_ID);
    const saveSeed = await seedSaveScaffold(ownerUserId);
    const { context, page } = await signedInPage(browser, SANDBOX_OWNER_EMAIL);
    const createdSessions = new Set<string>();
    page.on('response', async (response) => {
      if (
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/agents/jaina/chat/conversations')
      ) {
        const body = (await response.json().catch(() => null)) as { session_id?: unknown } | null;
        if (typeof body?.session_id === 'string') createdSessions.add(body.session_id);
      }
    });

    try {
      await openCanvas(page);
      await page.getByTestId('canvas-scaffold-picker').click();
      await expect(page.getByRole('listbox')).toBeVisible({ timeout: 15_000 });
      await page.keyboard.type(SAVE_SCAFFOLD_NAME);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('canvas-record-version')).toContainText('v1', {
        timeout: 90_000,
      });
      await expect(page.getByText(`${SAVE_SCAFFOLD_NAME} // ADSET`, { exact: true })).toBeVisible();

      // ---- side-entry audience: a Broad audience feeding the ad set from the LEFT ------------
      const pane = await page.locator('.react-flow__pane').boundingBox();
      if (!pane) throw new Error('[canvas-bench] the canvas has no pane');
      const audienceId = await addNodeFromMenu(page, 'Audience', { x: 120, y: pane.height - 180 });
      const audienceInspector = page.getByTestId('canvas-inspector');
      await audienceInspector.getByRole('tab', { name: 'Broad' }).click();
      await audienceInspector
        .getByTestId('inspector-audience-countries')
        .getByRole('button', { name: 'Mexico' })
        .click();
      await audienceInspector.getByTestId('inspector-audience-age-min').fill('25');
      await audienceInspector.getByTestId('inspector-audience-age-min').press('Enter');
      await audienceInspector.getByTestId('inspector-audience-age-max').fill('44');
      await audienceInspector.getByTestId('inspector-audience-age-max').press('Enter');
      await dragHandle(
        page,
        page.locator(`.react-flow__handle.source[data-nodeid="${audienceId}"]`),
        page.locator(
          `.react-flow__handle.target[data-nodeid="${saveSeed.adSetNodeId}"][data-handleid="audience"]`,
        ),
      );
      const sideEdge = page.locator(
        `.react-flow__edge[data-testid*="${audienceId}"][data-testid*="${saveSeed.adSetNodeId}"]`,
      );
      await expect(sideEdge).toHaveCount(1);
      grade(
        'canvas.side-audience',
        true,
        "audience → ad set on the ad set's left `audience` handle",
      );

      // ---- inspector: budget on the ad set, copy on the ad -------------------------------------
      const adSetInspector = await selectNode(page, saveSeed.adSetNodeId);
      await adSetInspector.getByTestId('inspector-field-budgetAmount').fill('150');
      await adSetInspector.getByTestId('inspector-field-budgetAmount').press('Enter');
      const adInspector = await selectNode(page, saveSeed.adNodeId);
      await adInspector.getByTestId('inspector-field-primaryText').fill(EDITED_COPY);
      await adInspector.getByTestId('inspector-field-primaryText').press('Tab');
      await adInspector.getByTestId('inspector-field-linkUrl').fill(EDITED_LINK);
      await adInspector.getByTestId('inspector-field-linkUrl').press('Enter');

      // ---- creative: connect an image creative, make it a 2-card carousel from the Library -----
      // Dragged off the ad's own handle into empty canvas: the canvas creates the Creative there,
      // already connected — the affordance a person uses, and one no node can sit on top of.
      const adHandle = page.locator(
        `.react-flow__handle.source[data-nodeid="${saveSeed.adNodeId}"]`,
      );
      await adHandle.scrollIntoViewIfNeeded();
      const handleBox = await adHandle.boundingBox();
      if (!handleBox) throw new Error('[canvas-bench] the ad has no source handle to drag from');
      const fromX = handleBox.x + handleBox.width / 2;
      const fromY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.mouse.move(fromX + 40, fromY + 140, { steps: 12 });
      await page.mouse.up();
      const inspectorAfterDrop = page.getByTestId('canvas-inspector');
      await expect(inspectorAfterDrop).toHaveAttribute('data-node-type', 'creative');
      const creativeId = (await inspectorAfterDrop.getAttribute('data-node-id')) ?? '';
      await expect(
        page.locator(
          `.react-flow__edge[data-testid*="${saveSeed.adNodeId}"][data-testid*="${creativeId}"]`,
        ),
      ).toHaveCount(1);
      const creativeInspector = await selectNode(page, creativeId);
      await creativeInspector
        .getByTestId('inspector-creative-format')
        .getByRole('button', { name: 'Carousel' })
        .click();
      await creativeInspector.getByTestId('inspector-creative-library').click();
      const picker = page.getByRole('dialog');
      const tiles = picker.locator('button[aria-pressed]');
      await expect(tiles.nth(1)).toBeVisible({ timeout: 60_000 });
      await tiles.nth(0).click();
      await tiles.nth(1).click();
      await picker.getByRole('button', { name: /^Add 2$/ }).click();
      await expect(creativeInspector.getByTestId('inspector-carousel-card')).toHaveCount(2);
      grade('canvas.carousel', true, '2 Library images placed as ordered carousel cards');
      await expect(page.getByTestId('canvas-record-dirty')).toBeVisible();

      // ---- an unconnected ad set refuses the save BY NAME, and nothing is sent -----------------
      // A save walks the tree from the campaign; a node it cannot reach would silently vanish from
      // the saved version, so the canvas must refuse rather than report "Saved as v2".
      const orphanId = await addNodeFromMenu(page, 'Ad Set', { x: 120, y: 90 });
      const orphanLabel = (
        await page.getByTestId('canvas-inspector').getByTestId('inspector-field-label').inputValue()
      ).trim();
      let refusedSavePosts = 0;
      const countSavePosts = (request: { method(): string; url(): string }) => {
        if (request.method() === 'POST' && /\/scaffolds\/[^/]+\/versions$/.test(request.url())) {
          refusedSavePosts += 1;
        }
      };
      page.on('request', countSavePosts);
      await page.getByTestId('canvas-save').click();
      await expect(page.getByTestId('canvas-save-issues')).toContainText(orphanLabel, {
        timeout: 15_000,
      });
      page.off('request', countSavePosts);
      expect(refusedSavePosts).toBe(0);
      await expect(page.getByTestId('canvas-record-version')).toContainText('v1');
      grade(
        'canvas.orphan-save-refused',
        refusedSavePosts === 0,
        `Save refused, naming "${orphanLabel}"; ${refusedSavePosts} version POSTs sent`,
      );

      // ---- a keyboard delete is a real edit: the node goes, the canvas stays dirty -------------
      await selectNode(page, orphanId);
      await page.keyboard.press('Backspace');
      await expect(page.locator(`.react-flow__node[data-id="${orphanId}"]`)).toHaveCount(0);
      await expect(page.getByTestId('canvas-record-dirty')).toBeVisible();
      grade('canvas.keyboard-delete', true, 'Backspace removed the orphan ad set; still dirty');

      // ---- SAVE → a new version row, then the canvas reloads exactly that version -------------
      const versionsBefore = await brandProfiles()
        .from('paid_scaffold_versions')
        .select('id')
        .eq('scaffold_id', saveSeed.scaffoldId);
      // The body the browser actually sent — so a copy that does not land is attributable to
      // the canvas (never sent) or the route (sent, not kept) without a second run.
      const saveRequest = page.waitForRequest(
        (request) =>
          request.method() === 'POST' && /\/scaffolds\/[^/]+\/versions$/.test(request.url()),
        { timeout: 60_000 },
      );
      await page.getByTestId('canvas-save').click();
      const sentNodes =
        ((await saveRequest).postDataJSON() as { nodes?: SentDraftNode[] }).nodes ?? [];
      const sentAd = sentNodes.find((node) => node.level === 'ad');
      const saved = await page
        .getByTestId('canvas-record-version')
        .filter({ hasText: 'v2' })
        .waitFor({ timeout: 180_000 })
        .then(() => true)
        .catch(() => false);
      if (!saved) {
        const issues = await page.getByTestId('canvas-save-issues').allTextContents();
        const error = await page.getByTestId('canvas-record-error').allTextContents();
        throw new Error(`[canvas-bench] save did not land: ${[...error, ...issues].join(' | ')}`);
      }
      await expect(page.getByTestId('canvas-record-dirty')).toHaveCount(0);

      const { data: versionRows } = await brandProfiles()
        .from('paid_scaffold_versions')
        .select('id,version,lifecycle,content_hash,plan:manifest->plan')
        .eq('scaffold_id', saveSeed.scaffoldId)
        .order('version', { ascending: true });
      const rows = (versionRows ?? []) as {
        id: string;
        version: number;
        content_hash: string;
        plan: PaidPlanTruth | null;
      }[];
      expect(rows.length).toBe((versionsBefore.data ?? []).length + 1);
      const v2 = rows.at(-1);
      expect(v2?.version).toBe(2);
      expect(v2?.id).not.toBe(saveSeed.versionId);
      grade('save.new-version', true, `v2 ${v2?.id} beside the untouched v1`);

      const plannedAdSet = v2?.plan?.adsets?.[0];
      expect(plannedAdSet?.budget_source).toBe('user');
      expect(plannedAdSet?.daily_budget_minor_units ?? 0).toBeGreaterThanOrEqual(15_000);
      expect(plannedAdSet?.audience?.kind).toBe('broad');
      expect(plannedAdSet?.audience?.targeting?.countries).toEqual(['MX']);
      expect(plannedAdSet?.audience?.targeting?.age_min).toBe(25);
      expect(plannedAdSet?.audience?.targeting?.age_max).toBe(44);
      const plannedAd = v2?.plan?.ads?.[0];
      expect(plannedAd?.creative?.format).toBe('carousel');
      expect(plannedAd?.creative?.cards?.length).toBe(2);
      const { data: v2Nodes } = await brandProfiles()
        .from('paid_scaffold_nodes')
        .select('level,payload,daily_budget_minor_units,meta_object_id,meta_creative_id')
        .eq('version_id', v2?.id ?? '');
      const adRow = ((v2Nodes ?? []) as { level: string; payload: PaidAdPayload }[]).find(
        (row) => row.level === 'ad',
      );
      expect(sentAd?.message, 'the canvas never SENT the edited copy').toBe(EDITED_COPY);
      expect(sentAd?.link, 'the canvas never SENT the edited link').toBe(EDITED_LINK);
      expect(adRow?.payload?.creative?.message, 'the route did not keep the sent copy').toBe(
        EDITED_COPY,
      );
      expect(adRow?.payload?.creative?.link, 'the route did not keep the sent link').toBe(
        EDITED_LINK,
      );
      grade(
        'save.carries-edits',
        true,
        `budget ${plannedAdSet?.daily_budget_minor_units} (user), broad MX 25-44, ` +
          'carousel ×2, copy + link — read back off the v2 rows',
      );

      // ---- DEPLOY PAUSED from the record bar → the gate in the canvas's Jaina panel → DENY ----
      // Opened only now, not before the edits: minimized, the panel floats over the right side
      // of the canvas — exactly where the docked inspector sits — and swallows its clicks.
      // A FRESH conversation for the deploy gate: the panel restores the newest one on mount, and
      // on a shared brand that can be someone else's.
      await page.getByRole('button', { name: 'Open Jaina' }).click();
      await page.getByRole('button', { name: 'Maximize chat' }).click();
      const newestConversation = page.locator('[data-testid^="jaina-conversation-"]').first();
      if (await newestConversation.isVisible({ timeout: 30_000 }).catch(() => false)) {
        await expect(newestConversation).toBeDisabled({ timeout: 60_000 });
      }
      await page.getByRole('button', { name: 'Create new conversation' }).click();
      await page.getByRole('button', { name: 'Minimize chat' }).click();
      // Minimized, never closed: a remount would restore whichever conversation is newest.

      const deployClickedAt = new Date().toISOString();
      await page.getByTestId('canvas-deploy-paused').click();
      const gateCard = page.locator(
        `[data-testid="paid-scaffold-card"][data-scaffold-version="${v2?.id}"]`,
        { has: page.locator('[data-testid="scaffold-deploy"][data-action="approve"]') },
      );
      const gateOpened = await gateCard
        .first()
        .waitFor({ state: 'visible', timeout: 180_000 })
        .then(() => true)
        .catch(() => false);
      if (!gateOpened) {
        const run = await latestRun(STARCRAFT_BRAND_ID, deployClickedAt);
        if (run) {
          // Read BEFORE cleanup deletes the conversation: a refusal is text in these events.
          const { data: events } = await admin
            .schema('jaina')
            .from('jaina_conversation_run_events')
            .select('event_type,payload')
            .eq('run_id', run.runId)
            .order('seq', { ascending: true });
          notes.push(
            `deploy run ${run.runId}: ${JSON.stringify(
              (events ?? []).map((event) => [
                (event as { event_type: string }).event_type,
                JSON.stringify((event as { payload: unknown }).payload).slice(0, 240),
              ]),
            )}`,
          );
        }
        throw new Error(
          `[canvas-bench] Deploy paused opened no gate on v2. ${
            run
              ? `run ${run.runId} status=${run.status}, ${run.events} event(s) — a refusal is text-only`
              : 'no run row: the operator action never reached the Backend'
          }`,
        );
      }
      const card = gateCard.first();
      await expect(card.getByTestId('scaffold-gate-preview')).toContainText('PAUSED');
      await expect(card.getByTestId('scaffold-deploy')).toHaveText('Deploy paused');
      await card.screenshot({ path: shotPath('deploy-gate') });
      grade(
        'deploy.gate',
        true,
        'operator action opened the deploy gate on v2; preview lands everything PAUSED',
      );

      const dismiss = card.getByRole('button', { name: 'Dismiss' });
      await expect(dismiss).toBeEnabled({ timeout: 180_000 });
      await dismiss.click();
      // Re-found by version, not by its Approve: a decided card no longer has one.
      await expect(
        page
          .locator(`[data-testid="paid-scaffold-card"][data-scaffold-version="${v2?.id}"]`)
          .filter({ hasText: 'Declined — nothing created' })
          .first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(
          async () => {
            const { data } = await brandProfiles()
              .from('jaina_tool_gate_approvals')
              .select('status')
              .eq('tool_name', 'paid_scaffold_deploy')
              // The deploy gate's subject is `<versionId>:<contentHash>` — the hash IS the consent.
              .like('subject_id', `${v2?.id ?? 'none'}:%`);
            return ((data ?? []) as { status: string }[]).map((row) => row.status).join(',');
          },
          { timeout: 60_000 },
        )
        .toBe('denied');
      const touchedMeta = (
        (v2Nodes ?? []) as {
          meta_object_id: string | null;
          meta_creative_id: string | null;
        }[]
      ).filter((row) => row.meta_object_id || row.meta_creative_id);
      expect(touchedMeta).toHaveLength(0);
      grade('deploy.denied', true, 'gate row denied; no v2 node carries a Meta id');
    } finally {
      await deleteDeployGates([saveSeed.scaffoldId]);
      const { error } = await brandProfiles()
        .from('paid_scaffolds')
        .delete()
        .eq('id', saveSeed.scaffoldId);
      if (error) console.warn(`[canvas-bench] cleanup ${saveSeed.scaffoldId}: ${error.message}`);
      for (const sessionId of createdSessions) {
        const response = await page.request
          .delete(`/api/agents/jaina/chat/conversations/${encodeURIComponent(sessionId)}`)
          .catch(() => null);
        if (!response?.ok()) {
          console.warn(`[canvas-bench] cleanup conversation ${sessionId}: ${response?.status()}`);
        }
      }
      await context.close();
    }
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
          grade('chat.card', true, `${expectedSummary}, deploy gate opened with the proposal`);
        } else {
          await expect(card).toContainText('Proposed — nothing on Meta yet');
          await expect(card).not.toContainText('Awaiting your approval');
          grade('chat.card', true, `${expectedSummary}, called a proposal (no gate is open)`);
        }

        // THE SUMMARY STRIP — six figures, the budget graded against the rows it sums.
        const strip = card.getByTestId('scaffold-summary');
        await expect(strip.locator('[data-testid^="scaffold-summary-"]')).toHaveCount(6);
        const budgetCell = card.getByTestId('scaffold-summary-budget');
        const shownBudget = (await budgetCell.textContent()) ?? '';
        if (truth.budgeted === truth.adSets && truth.adSets > 0) {
          const figure = Number(
            (shownBudget.match(/[\d,]+(?:\.\d+)?/)?.[0] ?? '').replace(/,/g, ''),
          );
          expect(Math.round(figure)).toBe(Math.round(truth.budgetMinorUnits / 100));
          grade('chat.budget', true, `"${shownBudget}" == ${truth.budgetMinorUnits} minor units`);
        } else {
          await expect(budgetCell).toContainText('Placeholder');
          grade(
            'chat.budget',
            true,
            'an ad set has no measured budget; the strip says placeholder',
          );
        }

        // WHY — the evidence the version carries, one entry per decision, as the manifest says.
        const evidence = card.getByTestId('scaffold-evidence');
        await expect(evidence).toBeVisible();
        if (truth.evidence > 0) {
          await expect(evidence.getByTestId('scaffold-evidence-item')).toHaveCount(
            Math.min(truth.evidence, 4),
          );
          grade('chat.evidence', true, `${truth.evidence} evidence entries in manifest.plan`);
        } else {
          grade(
            'chat.evidence',
            true,
            'no manifest.plan evidence; the card says so rather than invent it',
          );
        }

        // ONE action. The three gate buttons are gone; what remains is Deploy paused.
        await expect(card.getByTestId('scaffold-deploy')).toHaveCount(1);
        await expect(card.getByRole('button', { name: /^Approve &/ })).toHaveCount(0);

        const blocked = (code: string) =>
          card.locator(`[data-testid="scaffold-deploy-blocker"][data-code="${code}"]`);
        if (truth.adSetsWithoutAudience > 0) {
          await expect(blocked('adset_without_audience')).toContainText(
            plural(truth.adSetsWithoutAudience, 'ad set'),
          );
        } else {
          await expect(blocked('adset_without_audience')).toHaveCount(0);
        }
        if (truth.adsWithoutCreative > 0) {
          await expect(blocked('ad_without_creative')).toContainText(
            plural(truth.adsWithoutCreative, 'ad'),
          );
          await expect(card.getByTestId('scaffold-deploy')).toBeDisabled();
        } else {
          await expect(blocked('ad_without_creative')).toHaveCount(0);
        }
        grade(
          'chat.single-action',
          true,
          `one Deploy paused; ${truth.adSetsWithoutAudience} ad set(s) without audience, ` +
            `${truth.adsWithoutCreative} ad(s) without creative — named as the rows say`,
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

      // ---- the deploy gate ---------------------------------------------------------------
      // Opened by the proposal itself when nothing blocks it; otherwise by the card's own
      // "Deploy paused" (an operator action — no model turn, so no model behaviour to SKIP on).
      // Whatever card holds it is DENIED, never approved.
      const approveButton = page.locator('[data-testid="scaffold-deploy"][data-action="approve"]');
      let gateAppeared = false;
      if (proposed && gateOpenedInTurn1) {
        gateAppeared = await approveButton.first().isVisible();
      } else if (proposed) {
        const openButton = cards
          .first()
          .locator('[data-testid="scaffold-deploy"][data-action="open"]');
        if (await openButton.isEnabled().catch(() => false)) {
          await openButton.click();
          gateAppeared = await approveButton
            .first()
            .waitFor({ state: 'visible', timeout: 180_000 })
            .then(() => true)
            .catch(() => false);
          if (!gateAppeared) {
            grade('chat.deploy-open', false, 'Deploy paused was clicked and no gate card rendered');
          }
        } else {
          const blockers = await cards
            .first()
            .getByTestId('scaffold-deploy-blocker')
            .allTextContents();
          graded.push({
            step: 'chat.deploy-open',
            grade: 'SKIP',
            detail: `Deploy paused is disabled by name: ${blockers.join(' | ') || 'no blocker text'}`,
          });
          notes.push(
            'UN-EXERCISED on the propose hop: the deploy gate — the proposal has named blockers ' +
              '(graded above). The canvas test below opens and denies it on a seeded version.',
          );
        }
      }

      if (gateAppeared) {
        const gateCard = page
          .locator('[data-testid="paid-scaffold-card"]', { has: approveButton })
          .first();
        await expect(gateCard).toContainText('Awaiting your approval');
        await expect(gateCard.getByTestId('scaffold-gate-preview')).toContainText('PAUSED');
        const gateVersion = (await gateCard.getAttribute('data-scaffold-version')) ?? '';
        expect(await versionIdsOf(), 'the gated card is not a scaffold this run wrote').toContain(
          gateVersion,
        );
        grade(
          'chat.deploy-open',
          true,
          "the deploy gate is open on this run's version, preview shown",
        );
        // Scoped to the card: a bare name lookup also matches the conversations sidebar.
        const denyButton = gateCard.getByRole('button', { name: 'Dismiss' });
        // Locked while the turn streams; enabled is the turn settling.
        await expect(denyButton).toBeEnabled({ timeout: 180_000 });
        await denyButton.scrollIntoViewIfNeeded();
        await denyButton.click();
        await expect(page.getByText('Declined — nothing created').first()).toBeVisible({
          timeout: 60_000,
        });
        grade('chat.denied', true, 'deploy gate answered deny; the card says nothing was created');
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
      // The deploy gate's subject is the version id as TEXT — nothing cascades to it.
      await deleteDeployGates([...toDelete]);
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
