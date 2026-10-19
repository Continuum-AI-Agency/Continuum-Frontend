// Plumbing for organic:headless-batch:e2e:bench: the bench's own Backend (:4041, workers off, no
// cache), the REAL quote (the Backend's quoteBatchFor in a subprocess with the same env), and the
// fixture: two headless batches whose status the real GET /api/headless/batch derives from the
// rows seeded here (the batch row, its organic.post_generation_jobs, its drafts, Library assets
// with stills in local storage, one drafted scene element), and chat sessions whose persisted
// `ui.headless_batch` frames carry that route's real answer.
//
// Every row is prefix-tagged and purged before and after a run, including what the Backend writes
// on its own while the bench drives it: the jobs a cast approval's reconcile queues and the
// element approval it records.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type BulkContentPlan,
  bulkContentPlanSchema,
  HEADLESS_BATCH_PIECE_COST_USD,
  type HeadlessBatchCreateInput,
  type HeadlessBatchFormat,
  type HeadlessBatchItemState,
  type HeadlessBatchQuote,
  type HeadlessBatchStatus,
  type HeadlessCastDraft,
  headlessBatchQuoteSchema,
  headlessBatchStatusSchema,
} from '@continuum/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { seedSession, uploadObjects } from './chatMediaBench';
import {
  BACKEND_DIR,
  BENCH_BE_PORT,
  BENCH_BE_URL,
  backendBenchEnv,
  localStackStatus,
} from './headlessBatchBenchEnv';
import {
  BRAND_ID,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD,
  MEDIA_BUCKET,
  OWNER_ID,
  schemaOf,
} from './plannerBench';

export { BRAND_ID, OWNER_ID };
export const PREFIX = 'bench-headlessbatch-';
export const SESSION_TITLE = 'Headless batch bench';
const ELEMENT_KEY_PREFIX = `element:${PREFIX}`;
const STORAGE_DIR = `${BRAND_ID}/headless-batch-bench`;
/** Above every deployed worker's generation, and a run time a decade out: no poller claims these. */
const FENCED_GENERATION = 2_147_483_647;
const FAR = '2036-01-05T15:00:00.000Z';

// --- The bench's own Backend -------------------------------------------------------------------

const pidFile = path.join(os.tmpdir(), `continuum-headless-batch-backend-${BENCH_BE_PORT}.pid`);

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${BENCH_BE_URL}/healthz`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/** Detached spawn: its pid is its own process group, so this reaches its tree and nothing else. */
function signalTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // gone
    }
  }
}

export type BenchBackend = { url: string; pid: number; stop: () => Promise<boolean> };

/** The real Fastify Backend on :4041 against the LOCAL stack, every worker off, no cache keys. */
export async function startBenchBackend(status = localStackStatus()): Promise<BenchBackend> {
  if (await healthy()) {
    throw new Error(
      `[headless-batch bench] :${BENCH_BE_PORT} already answers /healthz and this bench did not start it. Stop it (by its PID) and re-run.`,
    );
  }
  const child: ChildProcess = spawn('bun', ['--no-env-file', 'App/Index.ts'], {
    cwd: BACKEND_DIR,
    detached: true,
    env: backendBenchEnv(status),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 60) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const pid = child.pid;
  if (!pid) throw new Error('[headless-batch bench] the Backend did not spawn');
  fs.writeFileSync(pidFile, String(pid));

  /** Resolves true once the process is gone. */
  const stop = async () => {
    if (!exited) {
      signalTree(pid, 'SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          signalTree(pid, 'SIGKILL');
          resolve(null);
        }, 8_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve(null);
        });
      });
    }
    fs.rmSync(pidFile, { force: true });
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  };

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await healthy()) return { url: BENCH_BE_URL, pid, stop };
    if (exited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`[headless-batch bench] the Backend never became healthy.\n${tail.join('')}`);
}

// --- Clients -----------------------------------------------------------------------------------

export function adminClient(status = localStackStatus()): SupabaseClient {
  return createClient(status.API_URL ?? '', status.SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
}

/** The local owner's access token through GoTrue's real password flow. */
export async function ownerAccessToken(status = localStackStatus()): Promise<string> {
  const anon = createClient(status.API_URL ?? '', status.ANON_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: LOCAL_OWNER_EMAIL,
    password: LOCAL_OWNER_PASSWORD,
  });
  if (error || !data.session) throw new Error(`[headless-batch bench] sign-in: ${error?.message}`);
  return data.session.access_token;
}

export async function readBatchStatus(
  token: string,
  batchId: string,
): Promise<{ httpStatus: number; status: HeadlessBatchStatus | null; raw: unknown }> {
  const response = await fetch(
    `${BENCH_BE_URL}/api/headless/batch?brandId=${BRAND_ID}&batchId=${batchId}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const raw = await response.json().catch(() => null);
  const parsed = headlessBatchStatusSchema.safeParse(raw);
  return { httpStatus: response.status, status: parsed.success ? parsed.data : null, raw };
}

// --- The real quote ----------------------------------------------------------------------------

const QUOTE_MARK = '@@HEADLESS_BATCH_QUOTE@@';
const QUOTE_SCRIPT = `
const { quoteBatchFor } = await import('./App/headless-content/batch.ts');
const quote = await quoteBatchFor(process.env.HB_QUOTE_BRAND, JSON.parse(process.env.HB_QUOTE_INPUT));
process.stdout.write('\\n${QUOTE_MARK}' + JSON.stringify(quote) + '\\n');
process.exit(0);
`;

/**
 * The Backend's own quoteBatchFor, run in Continuum-Backend with the bench Backend's env (local
 * stack, no cache): the window read, the open batches' holds and the cast readiness are real.
 */
export function quoteFor(
  input: HeadlessBatchCreateInput,
  status = localStackStatus(),
): HeadlessBatchQuote {
  const out = execFileSync('bun', ['--no-env-file', '-e', QUOTE_SCRIPT], {
    cwd: BACKEND_DIR,
    env: {
      ...backendBenchEnv(status),
      HB_QUOTE_BRAND: BRAND_ID,
      HB_QUOTE_INPUT: JSON.stringify(input),
    },
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    timeout: 180_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = out.split('\n').find((entry) => entry.startsWith(QUOTE_MARK));
  if (!line)
    throw new Error(`[headless-batch bench] the quote subprocess printed no quote:\n${out}`);
  return headlessBatchQuoteSchema.parse(JSON.parse(line.slice(QUOTE_MARK.length)));
}

/** The approval card's ask: 8 reels and 4 still sets on new slots, every one captioned. */
export function approvalInput(): HeadlessBatchCreateInput {
  return {
    items: Array.from({ length: 12 }, (_, index) => ({
      format: index < 8 ? ('reel' as const) : ('still_set' as const),
      slot: {
        scheduledAt: new Date(Date.parse(FAR) + index * 86_400_000).toISOString(),
        platform: 'instagram' as const,
      },
      caption: `Spring launch, piece ${index + 1}: the new range, in the studio.`,
    })),
  };
}

// --- Fixture -----------------------------------------------------------------------------------

/** How a piece is seeded; `state` is what the status route must derive from those rows. */
type Seeded = 'queued' | 'running' | 'ready' | 'failed_redirected' | 'cast_parked' | 'cast_waiting';
type Planned = { format: HeadlessBatchFormat; seed: Seeded };

const STATE_OF: Record<Seeded, HeadlessBatchItemState> = {
  queued: 'queued',
  running: 'running',
  ready: 'ready',
  failed_redirected: 'failed',
  cast_parked: 'needs_cast_approval',
  cast_waiting: 'needs_cast_approval',
};

const BATCH_A: Planned[] = [
  { format: 'still_set', seed: 'ready' },
  { format: 'reel', seed: 'running' },
  { format: 'reel', seed: 'queued' },
  { format: 'still_set', seed: 'failed_redirected' },
  { format: 'still_set', seed: 'queued' },
  { format: 'reel', seed: 'running' },
];
const BATCH_B: Planned[] = [
  { format: 'reel', seed: 'cast_parked' },
  { format: 'still_set', seed: 'cast_waiting' },
  { format: 'reel', seed: 'cast_waiting' },
];
// Its cast already pinned, then a piece drafted a NEW place and parked on it.
const BATCH_C: Planned[] = [
  { format: 'reel', seed: 'cast_parked' },
  { format: 'still_set', seed: 'queued' },
];
// The bulk plan's session: an older batch made in it before, then the plan's own.
const BATCH_D: Planned[] = [{ format: 'reel', seed: 'queued' }];
// A batch made in the plan's session after its run ended, on drafts that are not the plan's.
const BATCH_F: Planned[] = [{ format: 'still_set', seed: 'queued' }];
const BATCH_E: Planned[] = [
  { format: 'reel', seed: 'running' },
  { format: 'still_set', seed: 'queued' },
];

export const OVER_ITEM_CAP =
  'guided_refused:over_item_cap: the plan needs $7.40, over the $5.00 still-set cap';
export const PROVIDER_FAILURE = 'run_failed:omni_provider_error: bench forced failure';

export type FixtureItem = {
  index: number;
  format: HeadlessBatchFormat;
  draftId: string;
  /** The job the status reads (the re-direct when there is one); null while it waits on the cast. */
  jobId: string | null;
  assetId: string | null;
  seededState: HeadlessBatchItemState;
};
export type FixtureBatch = { batchId: string; items: FixtureItem[] };
export type Fixture = {
  sessionId: string;
  sessionTitle: string;
  approvalSessionId: string;
  approvalSessionTitle: string;
  recastSessionId: string;
  a: FixtureBatch;
  b: FixtureBatch;
  /** Pinned to `scene`, with one piece parked on `recast`, a place drafted after the pin. */
  c: FixtureBatch;
  /** A session whose persisted turn carries a bulk plan card with director pieces. */
  bulkSessionId: string;
  plan: BulkContentPlan;
  /** A batch made in the bulk plan's session before the plan ran: never the plan's card. */
  older: FixtureBatch;
  scene: HeadlessCastDraft;
  recast: HeadlessCastDraft;
  /**
   * The real status route's answers the persisted frames carry. A's later turn carries a later
   * answer (piece 6 landed between the two reads).
   */
  frames: {
    a: HeadlessBatchStatus;
    aLater: HeadlessBatchStatus;
    b: HeadlessBatchStatus;
    c: HeadlessBatchStatus;
  };
};

const organic = (supabase: SupabaseClient) => schemaOf(supabase, 'organic');
const media = (supabase: SupabaseClient) => schemaOf(supabase, 'media');

const sumOf = (plan: Planned[], key: 'capUsd' | 'expectedUsd') =>
  Math.round(
    plan.reduce((sum, item) => sum + HEADLESS_BATCH_PIECE_COST_USD[item.format][key], 0) * 100,
  ) / 100;

const objectPath = (name: string) => `${STORAGE_DIR}/${name}`;

/** What a landed piece leaves on its draft: the reel, or the still set's slides. */
function publishingAssets(item: FixtureItem) {
  if (item.format === 'reel') {
    return [
      {
        role: 'primary',
        kind: 'video',
        slideIndex: 0,
        bucket: MEDIA_BUCKET,
        storagePath: objectPath(`${item.assetId}.mp4`),
        storageUrl: '',
        mimeType: 'video/mp4',
        assetId: item.assetId,
        width: 1080,
        height: 1920,
      },
    ];
  }
  return [0, 1, 2].map((slideIndex) => ({
    role: slideIndex === 0 ? 'primary' : `slide_${slideIndex + 1}`,
    kind: 'image',
    slideIndex,
    bucket: MEDIA_BUCKET,
    storagePath: objectPath(`${item.assetId}.jpg`),
    storageUrl: '',
    mimeType: 'image/jpeg',
    ...(slideIndex === 0 ? { assetId: item.assetId, width: 1080, height: 1350 } : {}),
  }));
}

function assetRow(item: FixtureItem) {
  const reel = item.format === 'reel';
  return {
    id: item.assetId,
    brand_id: BRAND_ID,
    created_by: OWNER_ID,
    kind: reel ? 'video' : 'image',
    bucket: MEDIA_BUCKET,
    storage_path: objectPath(`${item.assetId}.${reel ? 'mp4' : 'jpg'}`),
    thumbnail_path: reel ? objectPath(`${item.assetId}-poster.jpg`) : null,
    file_name: `${PREFIX}${item.assetId}.${reel ? 'mp4' : 'jpg'}`,
    mime_type: reel ? 'video/mp4' : 'image/jpeg',
    source: 'ai_generated',
    status: 'ready',
    title: `Headless batch piece ${item.index + 1}`,
    width: 1080,
    height: reel ? 1920 : 1350,
    tags: [],
    detected_objects: [],
    review_status: 'none',
    integrity_state: 'unknown',
  };
}

const batchItemKey = (batchId: string, index: number) => `batch:${batchId}:${index}`;

async function seedBatch(
  supabase: SupabaseClient,
  label: 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
  plan: Planned[],
  sessionId: string,
  scene: HeadlessCastDraft,
  still: Buffer,
  /**
   * `draftKeys` replaces each draft's prefixed client_key (a plan's drafts carry the plan's own).
   * `only` writes half: the drafts (a plan run writes them first), or, for `batch`, the jobs and
   * the batch row made from those drafts afterwards.
   */
  opts: {
    draftKeys?: string[];
    batch?: FixtureBatch;
    only?: 'drafts' | 'rows';
    /** The bulk plan the batch was made for (createHeadlessBatch writes it as plan_id). */
    planId?: string;
  } = {},
): Promise<FixtureBatch> {
  const batchId = opts.batch?.batchId ?? randomUUID();
  const now = new Date().toISOString();
  const items: FixtureItem[] =
    opts.batch?.items ??
    plan.map((piece, index) => ({
      index,
      format: piece.format,
      draftId: randomUUID(),
      jobId: piece.seed === 'cast_waiting' ? null : randomUUID(),
      assetId: label === 'A' ? randomUUID() : null,
      seededState: STATE_OF[piece.seed],
    }));

  if (opts.only !== 'rows') await seedDrafts();
  if (opts.only !== 'drafts') await seedRows();
  return { batchId, items };

  async function seedDrafts(): Promise<void> {
    // A's assets exist from the start (the Library row and its stills), so a flip to ready only
    // lands them on the draft, as landHeadlessMedia does.
    const withAssets = items.filter((item) => item.assetId);
    if (withAssets.length > 0) {
      await uploadObjects(
        supabase,
        withAssets.flatMap((item) =>
          item.format === 'reel'
            ? [
                {
                  path: objectPath(`${item.assetId}.mp4`),
                  bytes: Buffer.alloc(64 * 1024, 7),
                  contentType: 'video/mp4',
                },
                {
                  path: objectPath(`${item.assetId}-poster.jpg`),
                  bytes: still,
                  contentType: 'image/jpeg',
                },
              ]
            : [
                {
                  path: objectPath(`${item.assetId}.jpg`),
                  bytes: still,
                  contentType: 'image/jpeg',
                },
              ],
        ),
      );
      await media(supabase).from('assets').insert(withAssets.map(assetRow)).throwOnError();
    }

    await organic(supabase)
      .from('organic_calendar_drafts')
      .insert(
        items.map((item) => {
          const seed = plan[item.index]?.seed as Seeded;
          return {
            id: item.draftId,
            brand_id: BRAND_ID,
            user_id: OWNER_ID,
            platform: 'instagram',
            platform_account_id: 'unassigned',
            status:
              seed === 'ready' ? 'draft' : seed === 'failed_redirected' ? 'failed' : 'placeholder',
            media_stage:
              seed === 'ready'
                ? 'realized'
                : seed === 'failed_redirected'
                  ? 'failed'
                  : seed === 'running'
                    ? 'realizing'
                    : 'text_only',
            scheduled_date: new Date(Date.parse(FAR) + item.index * 86_400_000).toISOString(),
            client_key: opts.draftKeys?.[item.index] ?? `${PREFIX}${batchId}:${item.index}`,
            slot_data: {
              title: `Headless batch ${label} piece ${item.index + 1}`,
              platform: 'instagram',
              format: item.format === 'reel' ? 'reel' : 'carousel',
              origin: 'agent',
            },
            content_json: {
              content: { format: item.format === 'reel' ? 'reel' : 'carousel' },
              copy: {
                caption: `Headless batch ${label}, piece ${item.index + 1}.`,
                hashtags: { high: [], medium: [], low: [] },
              },
              creative: {
                ...(seed === 'running' ? { headlessPending: { jobId: item.jobId } } : {}),
                ...(seed === 'cast_parked'
                  ? {
                      headlessCast: {
                        state: 'needs_cast_approval',
                        jobId: item.jobId,
                        drafts: [scene],
                        at: now,
                      },
                    }
                  : {}),
              },
              ...(seed === 'ready' ? { publishingAssets: publishingAssets(item) } : {}),
            },
          };
        }),
      )
      .throwOnError();
  }

  async function seedRows(): Promise<void> {
    const job = (item: FixtureItem, jobId: string, clientKey: string, fields: object) => ({
      job_id: jobId,
      session_id: sessionId,
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      scheduled_at: new Date(Date.parse(FAR) + item.index * 86_400_000).toISOString(),
      platform: 'instagram',
      job_type: 'headless_media',
      plan_id: batchId,
      client_key: clientKey,
      draft_id: item.draftId,
      payload: {
        draftId: item.draftId,
        format: item.format,
        pieceCapUsd: HEADLESS_BATCH_PIECE_COST_USD[item.format].capUsd,
      },
      min_worker_generation: FENCED_GENERATION,
      next_run_at: FAR,
      ...fields,
    });
    const jobs = items.flatMap((item) => {
      const seed = plan[item.index]?.seed as Seeded;
      if (!item.jobId) return [];
      const key = batchItemKey(batchId, item.index);
      if (seed === 'queued' || seed === 'cast_parked')
        return [job(item, item.jobId, key, { status: 'queued' })];
      if (seed === 'running')
        return [
          job(item, item.jobId, key, {
            status: 'running',
            started_at: now,
            worker_id: `${PREFIX}fenced`,
          }),
        ];
      if (seed === 'ready')
        return [
          job(item, item.jobId, key, { status: 'completed', started_at: now, completed_at: now }),
        ];
      // Refused, re-directed once, refused again: failed for good.
      const firstId = randomUUID();
      return [
        job(item, firstId, key, {
          status: 'failed',
          completed_at: now,
          error: { message: OVER_ITEM_CAP },
        }),
        job(item, item.jobId, `${key}:r1`, {
          status: 'failed',
          completed_at: now,
          error: { message: OVER_ITEM_CAP },
        }),
      ];
    });
    await organic(supabase).from('post_generation_jobs').insert(jobs).throwOnError();

    await organic(supabase)
      .from('headless_batches')
      .insert({
        id: batchId,
        brand_id: BRAND_ID,
        session_id: sessionId,
        user_id: OWNER_ID,
        idempotency_key: `${PREFIX}${batchId}`,
        max_usd: Math.ceil(sumOf(plan, 'capUsd') * 1.6),
        cap_usd: sumOf(plan, 'capUsd'),
        expected_usd: sumOf(plan, 'expectedUsd'),
        items: items.map((item) => ({
          index: item.index,
          format: item.format,
          draftId: item.draftId,
          minted: true,
          scheduledAt: new Date(Date.parse(FAR) + item.index * 86_400_000).toISOString(),
          platform: 'instagram',
        })),
        cast_needed: label === 'B' || label === 'C',
        ...(opts.planId ? { plan_id: opts.planId } : {}),
      })
      .throwOnError();
  }
}

/** A drafted place: the element and its first revision, so approveTypedElementRevision passes. */
async function seedScene(
  supabase: SupabaseClient,
  title = 'Bench studio floor',
  summary = 'Bench studio floor, morning light',
): Promise<HeadlessCastDraft> {
  const elementId = randomUUID();
  await media(supabase)
    .from('asset_groups')
    .insert({
      id: elementId,
      brand_id: BRAND_ID,
      kind: 'element',
      external_key: `${ELEMENT_KEY_PREFIX}${elementId}`,
      title,
      created_by: OWNER_ID,
      origin_ref: {
        kind: 'element',
        category: 'setting',
        rightsNote: 'bench fixture: owned',
        surface: 'headless_content_element',
        typedKind: 'scene',
        tags: [],
      },
    })
    .throwOnError();
  await media(supabase)
    .from('headless_element_revisions')
    .insert({
      brand_id: BRAND_ID,
      element_id: elementId,
      revision: 1,
      kind: 'scene',
      schema_version: 1,
      payload: { description: summary, references: [] },
      rights_ref: 'bench fixture: owned',
      created_by: OWNER_ID,
    })
    .throwOnError();
  return { elementId, revision: 1, kind: 'scene', summary };
}

export const batchFrame = (data: HeadlessBatchStatus) => ({ type: 'ui.headless_batch', data });

/**
 * Seeds both batches, reads each one's REAL status with the owner's token, and persists those
 * answers as `ui.headless_batch` frames: batch A on two assistant turns of one session (two cards,
 * one batch), batch B between them. A second session holds the live approval turn.
 */
/** The batches session's assistant turns, in order: A, B, A, B. */
export const ASSISTANT_TEXTS = [
  'Six pieces are on their way.',
  'The first piece drafted a place. Approve it once and the rest follow.',
  'Here is where it stands.',
  'It is waiting on its cast.',
] as const;

export async function seedFixture(
  supabase: SupabaseClient,
  token: string,
  still: Buffer,
): Promise<Fixture> {
  const sessionId = randomUUID();
  const approvalSessionId = randomUUID();
  const recastSessionId = randomUUID();
  const sessionTitle = `${SESSION_TITLE}: batches`;
  const approvalSessionTitle = `${SESSION_TITLE}: approval`;
  const scene = await seedScene(supabase);
  const recast = await seedScene(supabase, 'Bench loading dock', 'Bench loading dock, at dusk');
  const a = await seedBatch(supabase, 'A', BATCH_A, sessionId, scene, still);
  const b = await seedBatch(supabase, 'B', BATCH_B, sessionId, scene, still);
  const c = await seedBatch(supabase, 'C', BATCH_C, recastSessionId, recast, still);
  const bulkSessionId = randomUUID();
  const older = await seedBatch(supabase, 'D', BATCH_D, bulkSessionId, scene, still);
  await setBatchCreatedAt(supabase, older.batchId, new Date(Date.now() - 5 * 60_000).toISOString());
  const plan = bulkPlan();
  await organic(supabase)
    .from('headless_batches')
    .update({ cast_pins: { characterElementIds: [], sceneElementIds: [scene.elementId] } })
    .eq('id', c.batchId)
    .throwOnError();

  const read = async (batchId: string) => {
    const answer = await readBatchStatus(token, batchId);
    if (!answer.status) {
      throw new Error(
        `[headless-batch bench] status route ${batchId}: ${answer.httpStatus} ${JSON.stringify(answer.raw)}`,
      );
    }
    return answer.status;
  };
  const firstA = await read(a.batchId);
  // Piece 6 lands between A's two turns, so the later turn's frame is further along.
  await flipItem(supabase, a.items[5] as FixtureItem, 'ready');
  const frames = {
    a: firstA,
    aLater: await read(a.batchId),
    b: await read(b.batchId),
    c: await read(c.batchId),
  };

  const now = Date.now();
  await seedSession(
    supabase,
    sessionId,
    sessionTitle,
    [
      { role: 'user', content: 'Make six pieces for the spring launch.' },
      { role: 'assistant', content: ASSISTANT_TEXTS[0], ui_cards: [batchFrame(frames.a)] },
      { role: 'user', content: 'And three more, with a new set.' },
      { role: 'assistant', content: ASSISTANT_TEXTS[1], ui_cards: [batchFrame(frames.b)] },
      { role: 'user', content: 'How is the first batch doing?' },
      { role: 'assistant', content: ASSISTANT_TEXTS[2], ui_cards: [batchFrame(frames.aLater)] },
      // A second card of B: one cast approval must serve both.
      { role: 'user', content: 'Is the new set still waiting?' },
      { role: 'assistant', content: ASSISTANT_TEXTS[3], ui_cards: [batchFrame(frames.b)] },
    ],
    new Date(now - 60_000),
  );
  await seedSession(
    supabase,
    approvalSessionId,
    approvalSessionTitle,
    [
      { role: 'user', content: 'Plan the spring launch.' },
      { role: 'assistant', content: 'Ask me for a batch of reels and still sets.' },
    ],
    new Date(now),
  );
  await seedSession(
    supabase,
    recastSessionId,
    `${SESSION_TITLE}: recast`,
    [
      { role: 'user', content: 'Two more on the approved set.' },
      {
        role: 'assistant',
        content: 'One of them drafted a new place.',
        ui_cards: [batchFrame(frames.c)],
      },
    ],
    new Date(now - 30_000),
  );
  await seedSession(
    supabase,
    bulkSessionId,
    `${SESSION_TITLE}: bulk plan`,
    [
      { role: 'user', content: 'Plan a week of spring posts.' },
      {
        role: 'assistant',
        content: 'Two pieces, both made by the director.',
        ui_cards: [{ type: 'ui.plan_card', data: plan }],
      },
    ],
    new Date(now - 45_000),
  );
  return {
    sessionId,
    sessionTitle,
    approvalSessionId,
    approvalSessionTitle,
    recastSessionId,
    a,
    b,
    c,
    bulkSessionId,
    plan,
    older,
    scene,
    recast,
    frames,
  };
}

/** A bulk plan whose two pieces the director makes (`headless`), valid against the contract. */
function bulkPlan(): BulkContentPlan {
  const piece = (specId: string, format: 'reel' | 'carousel', angle: string) => ({
    specId,
    platform: 'instagram' as const,
    format,
    pillar: 'Launch',
    angle,
    hook: 'Doors open at nine.',
    objective: 'follow' as const,
    trendId: null,
    headless: { format: format === 'reel' ? ('reel' as const) : ('still_set' as const) },
  });
  return bulkContentPlanSchema.parse({
    planId: `${PREFIX}plan-${randomUUID()}`,
    kind: 'bulk',
    title: 'Bench spring week',
    strategyBrief: {
      summary: 'Two director pieces for the spring launch.',
      pillars: [{ name: 'Launch' }],
      mix: [
        { format: 'reel', weight: 0.5 },
        { format: 'carousel', weight: 0.5 },
      ],
      platformSplit: [{ platform: 'instagram', weight: 1 }],
      cadencePerDayPerPlatform: 1,
      horizonWeeks: 1,
    },
    schedule: { horizonWeeks: 1, postsPerDayPerPlatform: 1 },
    placements: [
      piece('spec-1', 'reel', 'The studio at dawn'),
      piece('spec-2', 'carousel', 'Four looks for spring'),
    ],
  });
}

/** The plan's run as bulkExecution's createRun writes it (`run_<planId>`), then marks running. */
export async function seedPlanRun(
  supabase: SupabaseClient,
  plan: BulkContentPlan,
  sessionId: string,
): Promise<string> {
  const runId = `run_${plan.planId}`;
  await organic(supabase)
    .from('organic_agent_runs')
    .insert({
      run_id: runId,
      session_id: sessionId,
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      status: 'running',
      idempotency_key: plan.planId,
      request_payload: {
        origin: 'agent.bulkPlanApproval',
        planId: plan.planId,
        placements: plan.placements.length,
      },
      started_at: new Date().toISOString(),
    })
    .throwOnError();
  return runId;
}

/**
 * The run's end as bulkExecution writes it: the run_completed event row, then the run's status.
 * Returns the event row's created_at, the database clock the plan's batch is matched against.
 */
export async function completePlanRun(supabase: SupabaseClient, runId: string): Promise<string> {
  const seq = 1;
  const { data } = await organic(supabase)
    .from('organic_agent_run_events')
    .insert({
      run_id: runId,
      seq,
      event_id: `${runId}:${seq}`,
      type: 'run_completed',
      payload: { sequence: seq, event: { type: 'run_completed' } },
    })
    .select('created_at')
    .single()
    .throwOnError();
  await organic(supabase)
    .from('organic_agent_runs')
    .update({ status: 'completed', finished_at: new Date().toISOString() })
    .eq('run_id', runId)
    .throwOnError();
  return (data as { created_at: string }).created_at;
}

/** The drafts a plan's run writes (persistGeneratedDraft): client_key `plan:<planId>:<specId>`. */
export function seedPlanDrafts(
  supabase: SupabaseClient,
  sessionId: string,
  scene: HeadlessCastDraft,
  plan: BulkContentPlan,
): Promise<FixtureBatch> {
  const draftKeys = plan.placements
    .filter((spec) => spec.headless)
    .map((spec) => `plan:${plan.planId}:${spec.specId}`);
  return seedBatch(supabase, 'E', BATCH_E, sessionId, scene, Buffer.alloc(0), {
    draftKeys,
    only: 'drafts',
  });
}

/**
 * The plan's ONE headless batch on those drafts, made after its run ended (attachHeadless), with
 * the plan's id as createHeadlessBatch writes it.
 */
export function seedPlanBatch(
  supabase: SupabaseClient,
  sessionId: string,
  scene: HeadlessCastDraft,
  drafts: FixtureBatch,
  planId: string,
): Promise<FixtureBatch> {
  return seedBatch(supabase, 'E', BATCH_E, sessionId, scene, Buffer.alloc(0), {
    batch: drafts,
    only: 'rows',
    planId,
  });
}

/** A batch in the plan's session with no plan id: not the plan's, whenever it was made. */
export function seedDecoyBatch(
  supabase: SupabaseClient,
  sessionId: string,
  scene: HeadlessCastDraft,
): Promise<FixtureBatch> {
  return seedBatch(supabase, 'F', BATCH_F, sessionId, scene, Buffer.alloc(0));
}

export async function setBatchCreatedAt(
  supabase: SupabaseClient,
  batchId: string,
  createdAt: string,
): Promise<void> {
  await organic(supabase)
    .from('headless_batches')
    .update({ created_at: createdAt })
    .eq('id', batchId)
    .throwOnError();
}

/** The caption the draft's row really holds, as the planner preview shows it. */
export async function readDraftCaption(
  supabase: SupabaseClient,
  draftId: string,
): Promise<string | null> {
  const { data } = await organic(supabase)
    .from('organic_calendar_drafts')
    .select('content_json')
    .eq('id', draftId)
    .maybeSingle()
    .throwOnError();
  const caption = (data?.content_json as { copy?: { caption?: unknown } } | null)?.copy?.caption;
  return typeof caption === 'string' ? caption : null;
}

export async function flipItem(
  supabase: SupabaseClient,
  item: FixtureItem,
  to: 'ready' | 'failed',
): Promise<void> {
  if (!item.jobId) throw new Error(`piece ${item.index} has no job to flip`);
  if (to === 'ready' && !item.assetId) throw new Error(`piece ${item.index} has no asset to land`);
  const now = new Date().toISOString();
  await organic(supabase)
    .from('post_generation_jobs')
    .update(
      to === 'ready'
        ? { status: 'completed', completed_at: now }
        : { status: 'failed', completed_at: now, error: { message: PROVIDER_FAILURE } },
    )
    .eq('job_id', item.jobId)
    .throwOnError();
  const { data } = await organic(supabase)
    .from('organic_calendar_drafts')
    .select('content_json')
    .eq('id', item.draftId)
    .single()
    .throwOnError();
  const content = (data?.content_json ?? {}) as Record<string, unknown>;
  const { headlessPending: _landed, ...creative } = (content.creative ?? {}) as Record<
    string,
    unknown
  >;
  await organic(supabase)
    .from('organic_calendar_drafts')
    .update(
      to === 'ready'
        ? {
            status: 'draft',
            media_stage: 'realized',
            content_json: { ...content, creative, publishingAssets: publishingAssets(item) },
          }
        : { status: 'failed', media_stage: 'failed', content_json: { ...content, creative } },
    )
    .eq('id', item.draftId)
    .throwOnError();
}

/** The jobs a reconcile queued (a cast release) at the normal generation: fence them at once. */
export async function fenceBatchJobs(
  supabase: SupabaseClient,
  batchIds: string[],
): Promise<number> {
  const { data } = await organic(supabase)
    .from('post_generation_jobs')
    .update({ min_worker_generation: FENCED_GENERATION, next_run_at: FAR })
    .eq('brand_id', BRAND_ID)
    .in('plan_id', batchIds)
    .eq('status', 'queued')
    .lt('min_worker_generation', FENCED_GENERATION)
    .select('job_id')
    .throwOnError();
  return data?.length ?? 0;
}

export async function readBatchRow(
  supabase: SupabaseClient,
  batchId: string,
): Promise<{ cast_pins: unknown; settled_at: string | null } | null> {
  const { data } = await organic(supabase)
    .from('headless_batches')
    .select('cast_pins,settled_at')
    .eq('id', batchId)
    .maybeSingle()
    .throwOnError();
  return data as { cast_pins: unknown; settled_at: string | null } | null;
}

export async function countBatchJobs(supabase: SupabaseClient, batchId: string): Promise<number> {
  const { count } = await organic(supabase)
    .from('post_generation_jobs')
    .select('job_id', { count: 'exact', head: true })
    .eq('brand_id', BRAND_ID)
    .eq('plan_id', batchId)
    .throwOnError();
  return count ?? 0;
}

// --- Purge -------------------------------------------------------------------------------------

function psql(status: Record<string, string>, sql: string): string {
  return execFileSync('psql', [status.DB_URL ?? '', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

// Constants only (the brand id and the prefix), never caller text.
const BATCHES = `select id::text from organic.headless_batches where brand_id = '${BRAND_ID}' and idempotency_key like '${PREFIX}%'`;
const ELEMENTS = `select id from media.asset_groups where brand_id = '${BRAND_ID}' and external_key like '${ELEMENT_KEY_PREFIX}%'`;
const SESSIONS = `select session_id from organic.organic_chat_sessions where brand_id = '${BRAND_ID}' and title like '${SESSION_TITLE}%'`;
const DRAFTS = `organic.organic_calendar_drafts where brand_id = '${BRAND_ID}' and (client_key like '${PREFIX}%' or client_key like 'plan:${PREFIX}%')`;
const ASSETS = `media.assets where brand_id = '${BRAND_ID}' and file_name like '${PREFIX}%'`;
const RUNS = `organic.organic_agent_runs where brand_id = '${BRAND_ID}' and run_id like 'run_${PREFIX}%'`;
const RUN_EVENTS = `organic.organic_agent_run_events where run_id like 'run_${PREFIX}%'`;

/** Every fixture row and object, plus what the Backend wrote for them (released jobs, approvals). */
export async function purgeFixture(
  supabase: SupabaseClient,
  status = localStackStatus(),
): Promise<void> {
  psql(
    status,
    `begin;
     delete from organic.post_generation_jobs where brand_id = '${BRAND_ID}' and plan_id in (${BATCHES});
     delete from organic.headless_batches where id::text in (${BATCHES});
     delete from ${DRAFTS};
     delete from ${ASSETS};
     delete from media.headless_element_approvals where element_id in (${ELEMENTS});
     set local session_replication_role = replica;
     delete from media.headless_element_revisions where element_id in (${ELEMENTS});
     set local session_replication_role = origin;
     delete from media.asset_groups where id in (${ELEMENTS});
     delete from ${RUNS};
     delete from organic.organic_chat_messages where session_id in (${SESSIONS});
     delete from organic.organic_chat_sessions where session_id in (${SESSIONS});
     commit;`,
  );
  const { data } = await supabase.storage.from(MEDIA_BUCKET).list(STORAGE_DIR, { limit: 1000 });
  const names = (data ?? []).map((file) => `${STORAGE_DIR}/${file.name}`);
  if (names.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(names);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * What the purge left: every table it covers, plus, by the run's own ids (its batches and its
 * scene element), the jobs the Backend queued and the approval it recorded.
 */
export async function residue(
  supabase: SupabaseClient,
  runIds: string[],
  status = localStackStatus(),
): Promise<Record<string, number>> {
  const ids = runIds.filter((id) => UUID.test(id)).map((id) => `'${id}'`);
  const counts = psql(
    status,
    `select json_build_object(
       'headless_batches', (select count(*) from organic.headless_batches where brand_id = '${BRAND_ID}' and (idempotency_key like '${PREFIX}%'${ids.length ? ` or id in (${ids.join(',')})` : ''})),
       'post_generation_jobs', (select count(*) from organic.post_generation_jobs where brand_id = '${BRAND_ID}' and (worker_id like '${PREFIX}%'${ids.length ? ` or plan_id in (${ids.join(',')})` : ''})),
       'drafts', (select count(*) from ${DRAFTS}),
       'assets', (select count(*) from ${ASSETS}),
       'elements', (select count(*) from media.asset_groups where brand_id = '${BRAND_ID}' and external_key like '${ELEMENT_KEY_PREFIX}%'),
       'element_approvals', (select count(*) from media.headless_element_approvals where brand_id = '${BRAND_ID}' and element_id::text in (${ids.length ? ids.join(',') : 'null'})),
       'chat_sessions', (select count(*) from (${SESSIONS}) s),
       'agent_runs', (select count(*) from ${RUNS}),
       'agent_run_events', (select count(*) from ${RUN_EVENTS})
     )`,
  );
  const { data } = await supabase.storage.from(MEDIA_BUCKET).list(STORAGE_DIR, { limit: 1000 });
  return { ...(JSON.parse(counts) as Record<string, number>), storage_objects: data?.length ?? 0 };
}
