import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type HeadlessBatchQuote,
  type HeadlessBatchStatus,
  type PublishAccountCandidate,
  publishAccountLabel,
  publishAccountsResponseSchema,
} from '@continuum/contracts';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  ASSISTANT_TEXTS,
  adminClient,
  approvalInput,
  type BenchBackend,
  BRAND_ID,
  completePlanRun,
  type Fixture,
  type FixtureBatch,
  fenceBatchJobs,
  flipItem,
  ownerAccessToken,
  purgeFixture,
  quoteFor,
  readBatchRow,
  readBatchStatus,
  readDraftCaption,
  residue,
  seedDecoyBatch,
  seedFixture,
  seedPlanBatch,
  seedPlanDrafts,
  seedPlanRun,
  setBatchCreatedAt,
  startBenchBackend,
} from './support/headlessBatchBench';
import { BENCH_BE_URL, localStackStatus } from './support/headlessBatchBenchEnv';
import {
  forgetCachedIntegrations,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD,
  repairOnboarding,
  setActiveBrand,
} from './support/plannerBench';

// Organic headless batch bench: the one approval card and the live batch card, driven by a real
// browser against the real Backend status and cast routes on the LOCAL stack, at $0.
//
// REAL: the Backend (this clone's, on :4041, workers off, no cache) and its GET /api/headless/batch
// (which derives every state from the seeded rows and reconciles first), its POST
// /api/headless/cast/approve (approveTypedElementRevision on a seeded scene revision, the batch's
// cast_pins, and the reconcile that releases the waiting pieces), the sign route behind a ready
// tile, the stills in local storage, the session/message routes a reload reads, and the quote:
// the Backend's own quoteBatchFor run in a subprocess against the local DB.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY:
//   · The live agent turn. /api/organic/agent/chat is route-fulfilled with the frames the SDK gate
//     emits for headlessBatchCreate (tool.call → tool.approval_required with batchPreview →
//     response.done). No model ran and the gate did not run; the batchPreview in it is real.
//   · The approval resume. Approve really POSTs `approvals: [{ id, approved: true }]`, but its
//     answer is fulfilled: no batch is created, and the `ui.headless_batch` it carries is the real
//     status route answer for seeded batch A.
//   · The pieces' runs. Workers are off, so no job is claimed: a piece moves when the bench writes
//     what the worker would (its job's status, its draft's publishingAssets), and the status route
//     derives the new state from those rows. Every job is fenced (a decade-out run time and a
//     generation no poller has), the ones the cast release queues included.
//   · The persisted frame's own update. The Backend persists `ui.headless_batch` only when a tool
//     runs, so the reloaded frames are the seeded (older) answers; that is what A5 relies on.

const SCREENSHOTS = resolve(process.cwd(), '../artifacts/organic-headless-batch');
const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_API_URL === BENCH_BE_URL,
);
/** First fetch on view, then 10 s × 1.5 per unchanged refresh, capped at 60 s. */
const MAX_REFRESH_MS = 60_000;
const QUIET_AFTER_DONE_MS = 35_000;
/** The shortest timer refresh is 10 s; 9.5 s leaves room for clock jitter, not a second request. */
const MIN_GAP_MS = 9_500;
const DECODE_TIMEOUT_MS = 20_000;
/**
 * While anything runs or queues the refresh is capped at 15 s, counted from the last answer: a
 * gap between two request starts is that delay plus one answer's time, given 1.5 s here.
 */
const MAX_ACTIVE_GAP_MS = 15_000 + 1_500;
/** B7: how long the agent panel stays hidden. Longer than staleTime, so showing it refetches. */
const B7_HIDDEN_MS = 20_000;
/** The fulfilled chat body reaches the stream reader one NDJSON line per this many ms. */
const CHAT_LINE_GAP_MS = 400;
/** A Playwright route matches a predicate by reference: unroute with the same const. */
const statusRoute = (url: URL) => url.pathname === '/api/headless/batch';
const castRoute = (url: URL) => url.pathname === '/api/headless/cast/approve';

test.describe.configure({ mode: 'serial' });
test.skip(
  !HAS_LOCAL_STACK,
  'Run through `bun run organic:headless-batch:e2e:bench` (local stack env).',
);

const UNEXERCISED = [
  'Live agent turn: /api/organic/agent/chat is route-fulfilled (model → SDK approval gate → frame hop un-exercised) and paced to the reader one line per 400 ms; the batchPreview it carries is the real quoteBatchFor answer.',
  "Approval resume: Approve's real POST (approvals [{id, approved:true}]) is answered by the bench, so no batch is created; the ui.headless_batch frame it returns is the real status route answer for seeded batch A.",
  "Piece runs: workers off; a piece moves when the bench writes the worker's rows (job status, draft publishingAssets); the status route's derivation from them is real.",
  'Persisted frame refresh: the Backend persists ui.headless_batch only when a tool runs, so the reload restores the seeded frames.',
  "Bulk plan run (A9): the plan-approval control POST is fulfilled with no ui.headless_batch, and the bench writes what bulkExecution would (the run row, the plan's drafts, its run_completed event, then the plan's batch rows with plan_id); the events replay, Realtime delivery and the plan-id status lookup are real.",
];
const recorder = createBenchRecorder('organic:headless-batch:e2e:bench', [
  'Local stack: Backend :4041 (workers off, every cache key stripped) + local Supabase; Next :3041.',
  ...UNEXERCISED,
]);

type Assertion = { pass: boolean | null; evidence: unknown };
const assertions: Record<string, Assertion> = Object.fromEntries(
  [
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7',
    'A8',
    'B1',
    'B1b',
    'B1c',
    'B2',
    'B3',
    'B4',
    'B5',
    'B6',
    'B7',
    'B8',
    'A9',
  ].map((id) => [id, { pass: null, evidence: 'not reached' }]),
);
const report: Record<string, unknown> = { unexercised: UNEXERCISED };

/**
 * Grades the step in the envelope and the report. It does not fail the test: in serial mode a
 * failed test skips the rest, so every gate runs and the closing verdict test fails the run.
 */
function gate(id: string, ok: boolean, evidence: unknown): void {
  assertions[id] = { pass: ok, evidence };
  recorder.record(id, ok ? 'PASS' : 'FAIL', JSON.stringify(evidence).slice(0, 600));
}

let supabase: SupabaseClient;
let backend: BenchBackend | null = null;
let fixture: Fixture | null = null;
let quote: HeadlessBatchQuote | null = null;
let refusedQuote: HeadlessBatchQuote | null = null;
let token = '';
let cookies: Awaited<ReturnType<typeof mintSessionWithPassword>>['cookies'] = [];
/** The bulk plan's batch, made mid-test (A9): its id joins the residue check. */
let planBatch: FixtureBatch | null = null;
let decoyBatch: FixtureBatch | null = null;
const stack = () => localStackStatus();

// --- Helpers -----------------------------------------------------------------------------------

/** A tile-sized still (≤480 px JPEG q72), drawn in the browser the way a cut tile looks. */
async function makeStill(page: Page): Promise<Buffer> {
  await page.goto('about:blank');
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 480;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const gradient = ctx.createLinearGradient(0, 0, 384, 480);
    gradient.addColorStop(0, '#2b4c7e');
    gradient.addColorStop(1, '#e3a857');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 384, 480);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `hsla(${(i * 37) % 360}, 60%, 55%, 0.45)`;
      ctx.beginPath();
      ctx.arc((i * 97) % 384, (i * 61) % 480, 12 + ((i * 13) % 40), 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas.toDataURL('image/jpeg', 0.72).split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

const usd = (value: number) => `$${value.toFixed(2)}`;
const itemStates = (status: HeadlessBatchStatus) =>
  status.items.map((item) => `${item.index}:${item.state}`);

type CardState = { done: string | null; items: string[]; counts: Record<string, string> };

async function cardStates(page: Page, batchId: string): Promise<CardState[]> {
  return page.evaluate(
    (id) =>
      [
        ...document.querySelectorAll(
          `section[data-slot="headless-batch-card"][data-batch-id="${id}"]`,
        ),
      ].map((card) => ({
        done: card.getAttribute('data-done'),
        items: [...card.querySelectorAll('li[data-slot="headless-batch-item"]')].map(
          (row) => `${row.getAttribute('data-item-index')}:${row.getAttribute('data-item-state')}`,
        ),
        counts: Object.fromEntries(
          [...card.querySelectorAll('[data-count-state]')].map((el) => [
            el.getAttribute('data-count-state') ?? '?',
            (el.textContent ?? '').trim(),
          ]),
        ),
      })),
    batchId,
  );
}

/** Every card of the batch shows the route's per-item states and counts. */
function cardsMatch(cards: CardState[], status: HeadlessBatchStatus): boolean {
  const states = itemStates(status).join(' ');
  return (
    cards.length > 0 &&
    cards.every(
      (card) =>
        card.items.join(' ') === states &&
        Object.entries(status.counts).every(([state, n]) =>
          new RegExp(`^${n}(\\D|$)`).test(card.counts[state] ?? ''),
        ),
    )
  );
}

async function mustRead(batchId: string): Promise<HeadlessBatchStatus> {
  const read = await readBatchStatus(token, batchId);
  if (!read.status) throw new Error(`status route ${read.httpStatus}: ${JSON.stringify(read.raw)}`);
  return read.status;
}

// The network the page makes: every status request (by batch), its responses, the cast POSTs.
type StatusHit = { batchId: string; at: number; code?: number };
type Ledger = {
  statusRequests: StatusHit[];
  statusResponses: StatusHit[];
  castPosts: Array<{ at: number; body: unknown }>;
  castResponses: Array<{ at: number; status: number; json: unknown }>;
  fullLoads: number;
};

function watch(page: Page): Ledger {
  const ledger: Ledger = {
    statusRequests: [],
    statusResponses: [],
    castPosts: [],
    castResponses: [],
    fullLoads: 0,
  };
  const statusBatch = (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname === '/api/headless/batch' ? parsed.searchParams.get('batchId') : null;
  };
  page.on('request', (request) => {
    const batchId = request.method() === 'GET' ? statusBatch(request.url()) : null;
    if (batchId) ledger.statusRequests.push({ batchId, at: Date.now() });
    if (request.method() === 'POST' && request.url().endsWith('/api/headless/cast/approve')) {
      ledger.castPosts.push({ at: Date.now(), body: request.postDataJSON() });
    }
  });
  page.on('response', async (response) => {
    const request = response.request();
    const batchId = request.method() === 'GET' ? statusBatch(response.url()) : null;
    if (batchId) ledger.statusResponses.push({ batchId, at: Date.now(), code: response.status() });
    if (request.method() === 'POST' && response.url().endsWith('/api/headless/cast/approve')) {
      const at = Date.now();
      ledger.castResponses.push({
        at,
        status: response.status(),
        json: await response.json().catch(() => null),
      });
    }
  });
  page.on('load', () => {
    ledger.fullLoads += 1;
  });
  return ledger;
}

const requestsOf = (ledger: Ledger, batchId: string, from = 0, to = Number.POSITIVE_INFINITY) =>
  ledger.statusRequests.filter((hit) => hit.batchId === batchId && hit.at > from && hit.at < to);

async function newContext(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  // Tall enough that all four batch cards are on screen at once: a card polls only while it
  // intersects the viewport, and two cards of one batch both observing is the shared-request case.
  const context = await browser.newContext({ viewport: { width: 1440, height: 3600 } });
  await context.addCookies(cookies);
  return context;
}

type Box = { x: number; y: number; w: number; h: number };
type RowBoxes = { index: string | null; row: Box | null; output: Box | null; text: Box | null };

/** Per card of the batch, every row's box, its output slot's and its text column's. */
function rowGeometry(page: Page, batchId: string): Promise<RowBoxes[][]> {
  return page.evaluate((id) => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return [
      ...document.querySelectorAll(
        `section[data-slot="headless-batch-card"][data-batch-id="${id}"]`,
      ),
    ].map((card) =>
      [...card.querySelectorAll('li[data-slot="headless-batch-item"]')].map((row) => ({
        index: row.getAttribute('data-item-index'),
        row: box(row),
        output: box(row.querySelector('[data-slot="headless-batch-item-output"]')),
        text: box(row.querySelector('[data-slot="headless-batch-item-output"] + div')),
      })),
    );
  }, batchId);
}

/** Every box edge that moved more than half a pixel between two reads. */
function geometryShifts(before: RowBoxes[][], after: RowBoxes[][]): string[] {
  const shifts = before.length === after.length ? [] : [`cards ${before.length}→${after.length}`];
  before.forEach((rows, c) => {
    rows.forEach((row, r) => {
      for (const part of ['row', 'output', 'text'] as const) {
        const was = row[part];
        const now = after[c]?.[r]?.[part];
        if (!was || !now) {
          shifts.push(`card${c} row${row.index} ${part} missing`);
          continue;
        }
        for (const edge of ['x', 'y', 'w', 'h'] as const) {
          if (Math.abs(was[edge] - now[edge]) > 0.5) {
            shifts.push(`card${c} row${row.index} ${part}.${edge} ${was[edge]}→${now[edge]}`);
          }
        }
      }
    });
  });
  return shifts;
}

async function openSession(page: Page, sessionId: string): Promise<void> {
  await page.goto(`/organic?tab=agent&sessionId=${sessionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-tour-id="organic-agent-panel"]')).toBeVisible({
    timeout: 180_000,
  });
}

function git(dir: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
  } catch {
    return 'unknown';
  }
}

// HEAD alone does not pin an uncommitted tree: the hash of the working diff and new files does.
function gitRev(dir: string, paths: string[]): { head: string; treeSha1: string } {
  const tree = createHash('sha1').update(git(dir, ['diff', 'HEAD', '--', ...paths]));
  const untracked = git(dir, ['ls-files', '--others', '--exclude-standard', '--', ...paths]);
  for (const file of untracked.split('\n').filter(Boolean).sort()) {
    tree.update(file);
    if (existsSync(join(dir, file))) tree.update(readFileSync(join(dir, file)));
  }
  return {
    head: git(dir, ['rev-parse', '--short', 'HEAD']).trim(),
    treeSha1: tree.digest('hex').slice(0, 12),
  };
}

// --- The bench -----------------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(SCREENSHOTS, { recursive: true });
  supabase = adminClient(stack());
  await purgeFixture(supabase, stack());
  // Quoted before the fixture's own batches exist: what the brand's window held when it was asked.
  quote = quoteFor(approvalInput(), stack());
  report.quote = quote;
  // The same pieces under a $10 maxUsd: the Backend's own refusal, for the disabled Approve.
  refusedQuote = quoteFor({ ...approvalInput(), maxUsd: 10 }, stack());
  report.refusedQuote = refusedQuote;
  backend = await startBenchBackend(stack());
  report.backendPid = backend.pid;
  await setActiveBrand(supabase, BRAND_ID);
  await repairOnboarding(supabase);
  await forgetCachedIntegrations();
  cookies = (await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD)).cookies;
  token = await ownerAccessToken(stack());
  const page = await browser.newPage();
  const still = await makeStill(page);
  await page.close();
  report.stillBytes = still.length;
  fixture = await seedFixture(supabase, token, still);
  report.fixture = {
    batchA: fixture.a.batchId,
    batchB: fixture.b.batchId,
    batchC: fixture.c.batchId,
    bulkSessionId: fixture.bulkSessionId,
    planId: fixture.plan.planId,
    olderSessionBatch: fixture.older.batchId,
    sessionId: fixture.sessionId,
    recastSessionId: fixture.recastSessionId,
    approvalSessionId: fixture.approvalSessionId,
    scene: fixture.scene.elementId,
    recastScene: fixture.recast.elementId,
    seededA: itemStates(fixture.frames.a),
    seededALater: itemStates(fixture.frames.aLater),
    seededB: itemStates(fixture.frames.b),
    seededC: { states: itemStates(fixture.frames.c), cast: fixture.frames.c.cast },
  };
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    recorder.record(
      `test:${testInfo.title}`,
      'FAIL',
      testInfo.error?.message?.split('\n')[0] ?? testInfo.status ?? 'failed',
    );
  }
});

test.afterAll(async () => {
  if (supabase) {
    await purgeFixture(supabase, stack());
    const left = await residue(
      supabase,
      fixture
        ? [
            fixture.a.batchId,
            fixture.b.batchId,
            fixture.c.batchId,
            fixture.older.batchId,
            ...(planBatch ? [planBatch.batchId] : []),
            ...(decoyBatch ? [decoyBatch.batchId] : []),
            fixture.scene.elementId,
            fixture.recast.elementId,
          ]
        : [],
      stack(),
    );
    report.residueAfterPurge = left;
    recorder.record(
      'purge.zero-residue',
      Object.values(left).every((n) => n === 0) ? 'PASS' : 'FAIL',
      JSON.stringify(left),
    );
  }
  if (backend) {
    report.backendStopped = await backend.stop();
    recorder.record(
      'backend.stopped',
      report.backendStopped ? 'PASS' : 'FAIL',
      `pid ${backend.pid}`,
    );
  }
  const written = {
    generatedAt: new Date().toISOString(),
    gitRev: {
      frontend: gitRev('.', ['src', 'e2e', 'package.json']),
      contracts: gitRev('..', ['packages/contracts']),
      backend: gitRev('../Continuum-Backend', ['App']),
    },
    assertions,
    ...report,
  };
  writeFileSync(join(SCREENSHOTS, 'bench-report.json'), `${JSON.stringify(written, null, 2)}\n`);
  console.log(`[headless-batch bench] ${JSON.stringify({ assertions })}`);
  recorder.print();
});

test('A1 the approval card shows the real quote; B1 Approve mounts the live batch card; A8 the publish card', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const f = fixture as Fixture;
  const q = quote as HeadlessBatchQuote;
  const refused = refusedQuote as HeadlessBatchQuote;
  const input = approvalInput();
  const A = f.a.batchId;

  // A8 only when the bench Backend lists a real publish account for the bench brand.
  const accountsResponse = await fetch(
    `${BENCH_BE_URL}/api/organic/publish-accounts?brandId=${BRAND_ID}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const accounts = publishAccountsResponseSchema.safeParse(
    await accountsResponse.json().catch(() => null),
  );
  const candidate: PublishAccountCandidate | null = accounts.success
    ? (accounts.data.accounts[0] ?? null)
    : null;

  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);
  const batchCall = `call_bench_batch_${randomUUID().slice(0, 8)}`;
  const refusedCall = `call_bench_refused_${randomUUID().slice(0, 8)}`;
  const unreadableCall = `call_bench_unreadable_${randomUUID().slice(0, 8)}`;
  const publishCall = `call_bench_publish_${randomUUID().slice(0, 8)}`;
  // A batch the Backend has no row for: its status route answers permanently (B1c).
  const goneBatchId = randomUUID();
  // The resume answer: the status route's real answer for batch A, read when Approve is pressed.
  let resumeStatus = null as HeadlessBatchStatus | null;
  const chatBodies: Array<{ at: number; body: unknown }> = [];
  let messageTurns = 0;
  const approvalFrame = (call: string, batchPreview?: HeadlessBatchQuote) => ({
    type: 'tool.approval_required',
    data: {
      approvalId: `approval_${call}`,
      toolCallId: call,
      toolName: 'headlessBatchCreate',
      input,
      ...(batchPreview ? { batchPreview } : {}),
    },
  });
  const callFrame = (call: string) => ({
    type: 'tool.call',
    data: { toolCallId: call, toolName: 'headlessBatchCreate', args: input },
  });
  await page.route('**/api/organic/agent/chat', async (route) => {
    const body = route.request().postDataJSON() as { approvals?: unknown[] } | null;
    chatBodies.push({ at: Date.now(), body });
    let frames: unknown[];
    if (body?.approvals?.length) {
      resumeStatus = await mustRead(A);
      frames = [
        { type: 'response.created', data: {} },
        {
          type: 'tool.result',
          data: { toolCallId: batchCall, toolName: 'headlessBatchCreate', ok: true },
        },
        { type: 'ui.headless_batch', data: resumeStatus },
        { type: 'response.output_text.delta', data: { delta: 'Your batch is on its way.' } },
        { type: 'response.done', data: {} },
      ];
    } else if (messageTurns++ === 0) {
      frames = [
        { type: 'response.created', data: {} },
        callFrame(batchCall),
        approvalFrame(batchCall, q),
        ...(candidate
          ? [
              {
                type: 'tool.approval_required',
                data: {
                  approvalId: `approval_${publishCall}`,
                  toolCallId: publishCall,
                  toolName: 'publishDraft',
                  input: {
                    platform: candidate.platform,
                    account: publishAccountLabel(candidate),
                    accountId: candidate.id,
                    finalCaption: 'Spring launch, in the studio.',
                  },
                },
              },
            ]
          : []),
        { type: 'response.done', data: {} },
      ];
    } else {
      frames = [
        { type: 'response.created', data: {} },
        callFrame(refusedCall),
        approvalFrame(refusedCall, refused),
        callFrame(unreadableCall),
        approvalFrame(unreadableCall),
        {
          type: 'ui.headless_batch',
          data: { ...(resumeStatus ?? f.frames.a), batchId: goneBatchId },
        },
        { type: 'response.done', data: {} },
      ];
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
      body: `${frames.map((frame, seq) => JSON.stringify({ ...(frame as object), seq: seq + 1 })).join('\n')}\n`,
    });
  });

  // route.fulfill lands a body in one chunk, so every frame of a turn (response.done included)
  // reaches the reducer in one render and nothing ever renders as the streaming row. The Backend
  // writes each NDJSON line as it happens: hand the fulfilled lines to the reader one at a time.
  await page.addInitScript(
    ({ chatPath, lineGapMs }) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await realFetch(input, init);
        const href = input instanceof Request ? input.url : String(input);
        if (new URL(href, location.href).pathname !== chatPath || !response.ok) return response;
        const lines = (await response.text()).split('\n').filter(Boolean);
        const encoder = new TextEncoder();
        const paced = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (const line of lines) {
              controller.enqueue(encoder.encode(`${line}\n`));
              await new Promise((resolve) => setTimeout(resolve, lineGapMs));
            }
            controller.close();
          },
        });
        return new Response(paced, { status: response.status, headers: response.headers });
      };
    },
    { chatPath: '/api/organic/agent/chat', lineGapMs: CHAT_LINE_GAP_MS },
  );

  const send = async (text: string) => {
    await page.getByRole('textbox', { name: 'Message the organic agent' }).click();
    await page.keyboard.type(text);
    await page.getByRole('button', { name: 'Send message' }).click();
  };

  await openSession(page, f.approvalSessionId);
  await expect(page.getByText('Ask me for a batch of reels and still sets.')).toBeVisible({
    timeout: 60_000,
  });
  await send('Make 8 reels and 4 still sets for the spring launch');

  // --- A1: the readable quote, field by field, and the Approve named with its first pass --------
  const card = page.locator('[data-slot="headless-batch-approval"][data-quote="readable"]');
  await expect(card).toBeVisible({ timeout: 60_000 });
  const field = async (name: string) => {
    const located = card.locator(`[data-field="${name}"]`);
    return (await located.count()) ? ((await located.first().textContent()) ?? '').trim() : null;
  };
  const shown = {
    items: await field('items'),
    reels: await field('reels'),
    stillSets: await field('still-sets'),
    boundUsd: await field('bound-usd'),
    capUsd: await field('cap-usd'),
    expectedUsd: await field('expected-usd'),
    maxUsd: await field('max-usd'),
    windowRemainingUsd: await field('window-remaining-usd'),
    copyUsd: await field('copy-usd'),
    castPackUsd: await field('cast-pack-usd'),
    castStep: await field('cast-step'),
  };
  // A zero part of the split, and a zero copy or pack hold, has no element.
  const expected = {
    items: String(q.items),
    reels: q.reels > 0 ? String(q.reels) : null,
    stillSets: q.stillSets > 0 ? String(q.stillSets) : null,
    copyUsd: q.copyUsd > 0 ? usd(q.copyUsd) : null,
    castPackUsd: q.castPackUsd > 0 ? usd(q.castPackUsd) : null,
    boundUsd: usd(q.boundUsd),
    capUsd: usd(q.capUsd),
    expectedUsd: usd(q.expectedUsd),
    maxUsd: usd(q.maxUsd),
    windowRemainingUsd: q.windowRemainingUsd === null ? null : usd(q.windowRemainingUsd),
  };
  const approveName = `Approve batch of ${q.items} pieces, first pass up to ${usd(q.boundUsd)}`;
  const approve = card.getByRole('button', { name: approveName, exact: true });
  const denyName = `Deny batch of ${q.items} pieces`;
  const deny = card.getByRole('button', { name: denyName, exact: true });
  // The card's buttons stay off while its turn still streams: read them once the turn has ended.
  await expect(deny)
    .toBeEnabled({ timeout: 15_000 })
    .catch(() => {});
  const cardText = ((await card.textContent()) ?? '').replace(/\s+/g, ' ');
  const copy = {
    firstPass: cardText.includes(`First pass up to ${usd(q.boundUsd)}`),
    withRedirects:
      cardText.includes(`With re-directs, up to${usd(q.maxUsd)}`) ||
      cardText.includes(`With re-directs, up to ${usd(q.maxUsd)}`),
  };
  const buttons = {
    approve: await approve.count(),
    approveEnabled: (await approve.count()) ? await approve.isEnabled() : false,
    deny: await deny.count(),
  };
  await card.screenshot({ path: join(SCREENSHOTS, 'approval-card.png') });
  const mismatched = Object.entries(expected).filter(
    ([key, value]) => shown[key as keyof typeof shown] !== value,
  );
  gate(
    'A1',
    mismatched.length === 0 &&
      (shown.castStep !== null) === q.castApprovalNeeded &&
      q.refusal === null &&
      copy.firstPass &&
      copy.withRedirects &&
      buttons.approve === 1 &&
      buttons.approveEnabled &&
      buttons.deny === 1 &&
      chatBodies.length === 1,
    {
      quote: q,
      shown,
      mismatched,
      castStepShown: shown.castStep !== null,
      copy,
      approveAccessibleName: approveName,
      denyAccessibleName: denyName,
      buttons,
      chatTurnsFulfilled: chatBodies.length,
    },
  );

  if (!candidate) {
    assertions.A8 = {
      pass: null,
      evidence: `NOT EXERCISED: GET /api/organic/publish-accounts?brandId=${BRAND_ID} on the bench Backend returned ${accountsResponse.status} and ${accounts.success ? 'no accounts' : 'an unparseable body'}: the bench seeds no integration or token rows, so no publish card was raised.`,
    };
    recorder.record('A8', 'SKIP', 'no local publish account for the bench brand');
  } else {
    const row = page.locator('[data-slot="approval-account"]');
    await expect(row.first()).toBeVisible({ timeout: 30_000 });
    const publishCard = row.first().locator('xpath=ancestor::*[.//button][1]');
    const text = ((await publishCard.textContent()) ?? '').replace(/\s+/g, ' ');
    const avatar = await row
      .first()
      .locator('img')
      .first()
      .getAttribute('src')
      .catch(() => null);
    const reauth = await page.locator('[data-account-reauth="true"]').count();
    const label = publishAccountLabel(candidate);
    const platformWords = candidate.platform === 'x' ? 'X' : candidate.platform;
    gate(
      'A8',
      text.includes(label) &&
        new RegExp(platformWords, 'i').test(text) &&
        (candidate.avatarUrl === null || avatar === candidate.avatarUrl) &&
        reauth > 0 === candidate.needsReauth &&
        !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text),
      {
        candidate: { ...candidate, id: 'redacted' },
        label,
        avatarSrc: avatar,
        reauthShown: reauth,
        cardText: text.slice(0, 300),
      },
    );
  }

  // --- B1: Approve resumes the turn; its batch card mounts in place and starts polling ----------
  // A live frame is the batch as it is now: its first status request waits a full refresh.
  const marker = `hb-${randomUUID()}`;
  await page.evaluate((value) => {
    (window as unknown as { __hbMarker: string }).__hbMarker = value;
  }, marker);
  const loadsBefore = ledger.fullLoads;
  const clickAt = Date.now();
  await approve.click({ timeout: 30_000 }).catch(() => {});
  const batchCard = page.locator(`section[data-slot="headless-batch-card"][data-batch-id="${A}"]`);
  let mountedAt = null as number | null;
  await expect(batchCard.first())
    .toBeVisible({ timeout: 60_000 })
    .then(() => {
      mountedAt = Date.now();
    })
    .catch(() => {});
  await expect
    .poll(() => (mountedAt ? requestsOf(ledger, A, mountedAt - 1).length : 0), {
      timeout: MAX_ACTIVE_GAP_MS + 5_000,
    })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  const resumeBody = chatBodies[1]?.body as
    | { approvals?: Array<{ id: string; approved: boolean }>; messages?: unknown[] }
    | undefined;
  const pollsAfterMount = mountedAt ? requestsOf(ledger, A, mountedAt - 1) : [];
  const firstPollAfterMountMs =
    mountedAt && pollsAfterMount[0] ? pollsAfterMount[0].at - (mountedAt as number) : null;
  const readableLeft = await card.count();
  const markerAfter = await page.evaluate(
    () => (window as unknown as { __hbMarker?: string }).__hbMarker ?? null,
  );
  const resumed = resumeStatus;
  const shownResume = await cardStates(page, A);
  if (mountedAt) {
    await batchCard.first().screenshot({ path: join(SCREENSHOTS, 'approved-batch-card.png') });
  }
  // The approval's reply row: copyable, never retried or regenerated (that would re-run a spend).
  const replyRow = page.locator('[data-slot="message-scroller-item"]', { has: batchCard });
  await replyRow.hover({ timeout: 5_000 }).catch(() => {});
  const replyActions = {
    rows: await replyRow.count(),
    copy: await replyRow.getByRole('button', { name: 'Copy message', exact: true }).count(),
    regenerate: await replyRow
      .getByRole('button', { name: 'Regenerate response', exact: true })
      .count(),
    retry: await replyRow.getByRole('button', { name: /^Retry/ }).count(),
  };
  gate(
    'B1',
    mountedAt !== null &&
      resumed !== null &&
      shownResume.length === 1 &&
      (shownResume[0]?.items.length ?? 0) === resumed.items.length &&
      firstPollAfterMountMs !== null &&
      firstPollAfterMountMs >= MIN_GAP_MS &&
      ledger.fullLoads === loadsBefore &&
      markerAfter === marker &&
      resumeBody?.approvals?.length === 1 &&
      resumeBody.approvals[0]?.id === `approval_${batchCall}` &&
      resumeBody.approvals[0]?.approved === true &&
      replyActions.rows === 1 &&
      replyActions.copy >= 1 &&
      replyActions.regenerate === 0 &&
      replyActions.retry === 0,
    {
      replyActions,
      resumeRequestBody: resumeBody ?? null,
      cardMountedAfterClickMs: mountedAt ? (mountedAt as number) - clickAt : null,
      firstStatusRequestAfterMountMs: firstPollAfterMountMs,
      minFirstRequestMs: MIN_GAP_MS,
      statusRequestsAfterMountMs: pollsAfterMount.map((hit) => hit.at - (mountedAt as number)),
      resumeFrameStates: resumed ? itemStates(resumed) : null,
      shown: shownResume,
      readableApprovalCardsLeft: readableLeft,
      fullLoads: ledger.fullLoads - loadsBefore,
      windowMarkerKept: markerAfter === marker,
    },
  );

  // --- B1b: a refused quote's Approve is disabled; an unreadable quote offers Deny only ---------
  // --- B1c: a batch the route answers 404 for says so and stops asking --------------------------
  await send('Twelve more, but keep it under $10. And one more batch.');
  const refusedCard = page
    .locator('[data-slot="headless-batch-approval"][data-quote="readable"]')
    .filter({ has: page.locator('[data-field="refusal"]') });
  const unreadableCard = page.locator(
    '[data-slot="headless-batch-approval"][data-quote="unreadable"]',
  );
  await expect(refusedCard)
    .toBeVisible({ timeout: 60_000 })
    .catch(() => {});
  await expect(unreadableCard)
    .toBeVisible({ timeout: 60_000 })
    .catch(() => {});
  // Read once the turn has ended (its Deny comes on), or a refused Approve is off for the wrong reason.
  await expect(unreadableCard.getByRole('button', { name: 'Deny batch', exact: true }))
    .toBeEnabled({ timeout: 15_000 })
    .catch(() => {});
  const refusedApprove = refusedCard.getByRole('button', { name: /^Approve/ });
  const refusedButtons = {
    approve: await refusedApprove.count(),
    approveDisabled: (await refusedApprove.count()) ? await refusedApprove.isDisabled() : null,
    deny: await refusedCard
      .getByRole('button', { name: `Deny batch of ${refused.items} pieces`, exact: true })
      .count(),
  };
  // The card says it in its own words: never the Backend's sentence, never "maxUsd".
  const refusedText = (
    (await refusedCard
      .locator('[data-field="refusal"]')
      .textContent({ timeout: 5_000 })
      .catch(() => '')) ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim();
  const unreadableButtons = {
    approve: await unreadableCard.getByRole('button', { name: /^Approve/ }).count(),
    deny: await unreadableCard.getByRole('button', { name: 'Deny batch', exact: true }).count(),
    denyEnabled: await unreadableCard
      .getByRole('button', { name: 'Deny batch', exact: true })
      .isEnabled({ timeout: 5_000 })
      .catch(() => false),
  };
  const unreadableText = (
    (await unreadableCard.textContent({ timeout: 5_000 }).catch(() => '')) ?? ''
  ).replace(/\s+/g, ' ');
  await unreadableCard
    .screenshot({ path: join(SCREENSHOTS, 'unreadable-approval.png'), timeout: 10_000 })
    .catch(() => {});
  gate(
    'B1b',
    refused.refusal !== null &&
      refusedButtons.approve === 1 &&
      refusedButtons.approveDisabled === true &&
      refusedButtons.deny === 1 &&
      refusedText.length > 0 &&
      !refusedText.includes('maxUsd') &&
      refusedText !== refused.refusal &&
      (await unreadableCard.count()) === 1 &&
      unreadableButtons.approve === 0 &&
      unreadableButtons.deny === 1 &&
      unreadableButtons.denyEnabled &&
      unreadableText.includes(
        "The cost of this batch could not be read, so it can't be approved here.",
      ),
    {
      backendRefusal: refused.refusal,
      shownRefusal: refusedText,
      refusedQuote: { boundUsd: refused.boundUsd, maxUsd: refused.maxUsd },
      refusedButtons,
      unreadableButtons,
      unreadableText: unreadableText.slice(0, 200),
    },
  );

  const goneCard = page.locator(
    `section[data-slot="headless-batch-card"][data-batch-id="${goneBatchId}"]`,
  );
  const goneSaid = goneCard.locator('[data-slot="headless-batch-unreadable"]');
  let goneSaidAt = null as number | null;
  await expect(goneSaid)
    .toBeVisible({ timeout: 60_000 })
    .then(() => {
      goneSaidAt = Date.now();
    })
    .catch(() => {});
  if (goneSaidAt) await page.waitForTimeout(20_000);
  const goneRequests = requestsOf(ledger, goneBatchId);
  const goneAnswers = ledger.statusResponses.filter((hit) => hit.batchId === goneBatchId);
  gate(
    'B1c',
    goneSaidAt !== null &&
      goneAnswers.length >= 1 &&
      goneAnswers.every((hit) => hit.code === 400 || hit.code === 403 || hit.code === 404) &&
      goneRequests.length === 1 &&
      ((await goneSaid.textContent()) ?? '').includes("This batch can't be read any more."),
    {
      unknownBatchId: 'random uuid (no row)',
      answers: goneAnswers.map((hit) => hit.code),
      statusRequests: goneRequests.length,
      quietAfterSayingMs: goneSaidAt ? 20_000 : null,
    },
  );
  await context.close();
});

test('A2–A7 the batch card: real states, one refresh per batch, cast once, restore, stop when done', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const f = fixture as Fixture;
  const A = f.a.batchId;
  const B = f.b.batchId;
  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);
  const cardsOf = (batchId: string): Locator =>
    page.locator(`section[data-slot="headless-batch-card"][data-batch-id="${batchId}"]`);

  // --- A2: every card shows the status route's states and counts ------------------------------
  const opened = Date.now();
  await openSession(page, f.sessionId);
  await expect(cardsOf(A).first()).toBeVisible({ timeout: 60_000 });
  await expect(cardsOf(B).first()).toBeVisible({ timeout: 60_000 });
  const openGeometry = await rowGeometry(page, A);
  await expect
    .poll(() => requestsOf(ledger, A, opened).length + requestsOf(ledger, B, opened).length, {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(2)
    .catch(() => {});
  const routeA = await mustRead(A);
  const routeB = await mustRead(B);
  await expect
    .poll(
      async () =>
        cardsMatch(await cardStates(page, A), routeA) &&
        cardsMatch(await cardStates(page, B), routeB),
      { timeout: 30_000 },
    )
    .toBe(true)
    .catch(() => {});
  const shownA = await cardStates(page, A);
  const shownB = await cardStates(page, B);
  gate(
    'A2',
    cardsMatch(shownA, routeA) &&
      cardsMatch(shownB, routeB) &&
      routeB.cast.drafts.length > 0 &&
      routeB.counts.needs_cast_approval === routeB.items.length,
    {
      routeA: { states: itemStates(routeA), counts: routeA.counts },
      routeB: { states: itemStates(routeB), counts: routeB.counts, castDrafts: routeB.cast.drafts },
      shownA,
      shownB,
    },
  );
  await cardsOf(A)
    .first()
    .screenshot({ path: join(SCREENSHOTS, 'mixed-batch-card.png') });

  // --- A3: a piece lands in the DB; its tile shows within one refresh, no reload ---------------
  // --- B2: the tile's still really decodes. B3: no row of either A card moves when it lands -----
  const marker = `hb-${randomUUID()}`;
  await page.evaluate((value) => {
    (window as unknown as { __hbMarker: string }).__hbMarker = value;
  }, marker);
  const tileOf = (index: number) =>
    page.locator(
      `figure[data-slot="media-strip"][data-strip-id="headless-batch:${A}:${index}"] li[data-tile-state="ready"]`,
    );
  // Each assistant turn's text is a lazy chunk (SafeMarkdownLazy, no placeholder) that can land
  // after the cards and push them down: B3 measures the flip on a settled transcript, and records
  // what the text's arrival moved since the cards first showed.
  for (const text of ASSISTANT_TEXTS) {
    await expect(page.getByText(text, { exact: true }))
      .toBeVisible({ timeout: 60_000 })
      .catch(() => {});
  }
  await page.waitForTimeout(1_000);
  const geometryBefore = await rowGeometry(page, A);
  const openShifts = geometryShifts(openGeometry, geometryBefore);
  if (openShifts.length > 0) {
    report.findings = [
      ...((report.findings as string[] | undefined) ?? []),
      `Session open: the batch cards rendered before their messages' text; when the lazy SafeMarkdown text landed, the rows moved (${openShifts.filter((shift) => shift.includes('row0 row.y')).join('; ')}).`,
    ];
  }
  const flipped = f.a.items[1] as Fixture['a']['items'][number];
  const loadsBefore = ledger.fullLoads;
  const lastBeforeFlip = requestsOf(ledger, A).at(-1)?.at ?? null;
  const flipAt = Date.now();
  await flipItem(supabase, flipped, 'ready');
  const tile = tileOf(flipped.index);
  let tileAt = null as number | null;
  await expect(tile.first())
    .toBeVisible({ timeout: MAX_REFRESH_MS + 30_000 })
    .then(() => {
      tileAt = Date.now();
    })
    .catch(() => {});
  const between = tileAt ? requestsOf(ledger, A, flipAt, tileAt) : requestsOf(ledger, A, flipAt);
  const markerAfter = await page.evaluate(
    () => (window as unknown as { __hbMarker?: string }).__hbMarker ?? null,
  );
  gate(
    'A3',
    tileAt !== null &&
      // ≤ 1: a flip that lands inside an in-flight request is carried by that request itself.
      between.length <= 1 &&
      ledger.fullLoads === loadsBefore &&
      markerAfter === marker,
    {
      flippedIndex: flipped.index,
      lastRequestBeforeFlipMsAgo: lastBeforeFlip ? flipAt - lastBeforeFlip : null,
      requestsStartedBetweenFlipAndTile: between.map((hit) => hit.at - flipAt),
      tileAfterFlipMs: tileAt ? (tileAt as number) - flipAt : null,
      readyTiles: await tile.count(),
      fullLoads: ledger.fullLoads - loadsBefore,
      windowMarkerKept: markerAfter === marker,
    },
  );

  // B2: every ready tile of the piece (one per A card) holds a decoded still. A reel tile with no
  // img at all is a poster that never signed: a still set is flipped and gated on instead.
  let decodedItem = flipped;
  let stillSetFallback = false;
  if (tileAt && (await tile.first().locator('img').count()) === 0) {
    await page.waitForTimeout(5_000);
    if ((await tile.first().locator('img').count()) === 0) {
      stillSetFallback = true;
      decodedItem = f.a.items[4] as Fixture['a']['items'][number];
      await flipItem(supabase, decodedItem, 'ready');
      await expect(tileOf(decodedItem.index).first())
        .toBeVisible({ timeout: MAX_REFRESH_MS + 30_000 })
        .catch(() => {});
    }
  }
  const decodedTiles = tileOf(decodedItem.index);
  const readDecode = () =>
    decodedTiles.evaluateAll((tiles) =>
      tiles.map((li) => {
        const img = li.querySelector('img');
        return {
          img: Boolean(img),
          complete: Boolean(img?.complete),
          naturalWidth: img?.naturalWidth ?? 0,
          naturalHeight: img?.naturalHeight ?? 0,
        };
      }),
    );
  const decodeStart = Date.now();
  let decodedAt = null as number | null;
  await expect
    .poll(
      async () => {
        const tiles = await readDecode();
        return tiles.length > 0 && tiles.every((t) => t.complete && t.naturalWidth > 0);
      },
      { timeout: DECODE_TIMEOUT_MS },
    )
    .toBe(true)
    .then(() => {
      decodedAt = Date.now();
    })
    .catch(() => {});
  const decode = await readDecode();
  gate('B2', decodedAt !== null && decode.length >= 1, {
    item: { index: decodedItem.index, format: decodedItem.format },
    stillSetFallback,
    tiles: decode,
    decodedAfterTileMs: decodedAt ? (decodedAt as number) - decodeStart : null,
  });

  // B3: every row, its output slot and its text column, before the flip and after the still.
  const geometryAfter = await rowGeometry(page, A);
  const shifts = geometryShifts(geometryBefore, geometryAfter);
  const textLefts = geometryAfter.map((rows) => rows.map((row) => row.text?.x ?? null));
  const outputSizes = geometryAfter.flatMap((rows) =>
    rows.map((row) => (row.output ? `${row.output.w}x${row.output.h}` : null)),
  );
  gate(
    'B3',
    geometryBefore.length === 2 &&
      geometryBefore.every((rows) => rows.length === f.a.items.length) &&
      shifts.length === 0 &&
      textLefts.every((lefts) =>
        lefts.every((x) => x !== null && Math.abs(x - (lefts[0] as number)) <= 0.5),
      ) &&
      new Set(outputSizes).size === 1 &&
      !outputSizes.includes(null),
    {
      cards: geometryBefore.length,
      sessionOpenShiftsBeforeSettle: openShifts.filter((shift) => shift.includes('row0 row.y')),
      rowsPerCard: geometryBefore.map((rows) => rows.length),
      shifts,
      textColumnLeftX: textLefts,
      outputSlotSizes: [...new Set(outputSizes)],
      firstRowBefore: geometryBefore[0]?.[0] ?? null,
      firstRowAfter: geometryAfter[0]?.[0] ?? null,
    },
  );
  if (tileAt) {
    await cardsOf(A)
      .first()
      .screenshot({ path: join(SCREENSHOTS, 'ready-tile-after-flip.png') });
  }

  // --- A4: approve the cast (double click on one of B's two cards): one POST, scene approved -----
  // --- B6: the cast block as the user meets it, below the list, before the click --------------
  const castButton = cardsOf(B).first().locator('button[data-slot="headless-batch-approve-cast"]');
  const otherCastButton = cardsOf(B)
    .nth(1)
    .locator('button[data-slot="headless-batch-approve-cast"]');
  await expect(castButton).toBeVisible({ timeout: 30_000 });
  const bCards = await cardsOf(B).count();
  const castBlocksBefore = await cardsOf(B).locator('[data-slot="headless-batch-cast"]').count();
  // Below the list, in the list's own column: a cast step coming or going never moves a row.
  const castBelowList = await cardsOf(B).evaluateAll((cards) =>
    cards.map((card) => {
      const list = card.querySelector('ul[aria-label="Pieces"]');
      const cast = card.querySelector('[data-slot="headless-batch-cast"]');
      return Boolean(
        list &&
          cast &&
          list.parentElement === cast.parentElement &&
          list.compareDocumentPosition(cast) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  );
  const castWaitingPath = join(SCREENSHOTS, 'cast-waiting.png');
  await cardsOf(B)
    .first()
    .locator('[data-slot="headless-batch-cast"]')
    .screenshot({ path: castWaitingPath, timeout: 10_000 })
    .catch(() => {});
  gate(
    'B6',
    existsSync(castWaitingPath) && castBlocksBefore === 2 && castBelowList.every(Boolean),
    { screenshot: 'cast-waiting.png', castBlocksBefore, castBlockFollowsList: castBelowList },
  );
  const castName = ((await castButton.textContent()) ?? '').trim();
  // The POST is held until the other card's button has been seen disabled and clicked anyway.
  let releaseCast = () => {};
  const castHeld = new Promise<void>((resolveHeld) => {
    releaseCast = resolveHeld;
  });
  await page.route(castRoute, async (route) => {
    await Promise.race([castHeld, new Promise((resolveCap) => setTimeout(resolveCap, 30_000))]);
    await route.continue().catch(() => {});
  });
  const castClickAt = Date.now();
  await castButton.dblclick();
  let otherDisabledAt = null as number | null;
  await expect
    .poll(() => otherCastButton.isDisabled({ timeout: 1_000 }).catch(() => false), {
      timeout: 5_000,
      intervals: [50],
    })
    .toBe(true)
    .then(() => {
      otherDisabledAt = Date.now();
    })
    .catch(() => {});
  // A real click on the disabled button (force: the user's pointer does not wait for it).
  const secondClickAt = Date.now();
  await otherCastButton.click({ force: true, timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const postsWhileHeld = ledger.castPosts.length;
  releaseCast();
  await expect
    .poll(() => ledger.castResponses.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  await page.unroute(castRoute);
  await page.waitForTimeout(3_000);
  const fenced = await fenceBatchJobs(supabase, [A, B]);
  const castResponse = ledger.castResponses[0];
  const approved = (castResponse?.json as { approved?: Array<{ elementId: string }> } | null)
    ?.approved;
  const afterCast = await mustRead(B);
  const rowB = await readBatchRow(supabase, B);
  const pins = rowB?.cast_pins as { sceneElementIds?: string[] } | null;
  await expect
    .poll(
      async () =>
        (await cardStates(page, B)).every(
          (card) =>
            card.items.length > 0 && !card.items.some((s) => s.endsWith('needs_cast_approval')),
        ),
      { timeout: MAX_REFRESH_MS + 30_000 },
    )
    .toBe(true)
    .catch(() => {});
  const shownBAfter = await cardStates(page, B);
  const castBlocksAfter = await cardsOf(B).locator('[data-slot="headless-batch-cast"]').count();
  gate(
    'A4',
    castName.startsWith('Approve cast') &&
      ledger.castPosts.length === 1 &&
      postsWhileHeld === 1 &&
      otherDisabledAt !== null &&
      castResponse !== undefined &&
      secondClickAt < castResponse.at &&
      castResponse?.status === 200 &&
      Boolean(approved?.some((element) => element.elementId === f.scene.elementId)) &&
      afterCast.counts.needs_cast_approval === 0 &&
      Boolean(pins?.sceneElementIds?.includes(f.scene.elementId)) &&
      shownBAfter.length === 2 &&
      shownBAfter.every((card) => !card.items.some((s) => s.endsWith('needs_cast_approval'))) &&
      castBlocksAfter === 0,
    {
      buttonText: castName,
      castPosts: ledger.castPosts.map((post) => ({
        afterClickMs: post.at - castClickAt,
        body: post.body,
      })),
      otherCardDisabledAfterClickMs: otherDisabledAt
        ? (otherDisabledAt as number) - castClickAt
        : null,
      secondClickBeforeCastAnswerMs: castResponse ? castResponse.at - secondClickAt : null,
      postsWhileHeld,
      castResponse,
      releasedJobsFenced: fenced,
      routeAfter: { states: itemStates(afterCast), counts: afterCast.counts, cast: afterCast.cast },
      castPins: rowB?.cast_pins ?? null,
      shownAfter: shownBAfter,
      castBlocksAfter,
    },
  );
  await cardsOf(B)
    .first()
    .screenshot({ path: join(SCREENSHOTS, 'cast-approved.png') });

  // --- A5: reload; both A cards render the LATER persisted frame before any status answer -------
  // Every status request is held until the restored cards are read and photographed. A's two
  // turns persisted different answers; latest wins across turns, so both show the later one.
  let held = 0;
  let releaseStatus = () => {};
  const statusHeld = new Promise<void>((resolveHeld) => {
    releaseStatus = resolveHeld;
  });
  await page.route(statusRoute, async (route) => {
    held += 1;
    await Promise.race([statusHeld, new Promise((resolveCap) => setTimeout(resolveCap, 60_000))]);
    await route.continue().catch(() => {});
  });
  const reloadAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(cardsOf(A).first()).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(async () => (await cardStates(page, A)).length, { timeout: 30_000 })
    .toBe(2)
    .catch(() => {});
  const cardAt = Date.now();
  const restored = await cardStates(page, A);
  await cardsOf(A)
    .first()
    .screenshot({ path: join(SCREENSHOTS, 'restored-after-reload.png') });
  const answeredBeforeRelease = ledger.statusResponses.filter(
    (hit) => hit.batchId === A && hit.at > reloadAt,
  ).length;
  const releasedAt = Date.now();
  releaseStatus();
  const routeAfterReload = await mustRead(A);
  await expect
    .poll(async () => cardsMatch(await cardStates(page, A), routeAfterReload), {
      timeout: MAX_REFRESH_MS,
    })
    .toBe(true)
    .catch(() => {});
  const fetchedShown = await cardStates(page, A);
  const firstAnswerAfterReload = ledger.statusResponses.find(
    (hit) => hit.batchId === A && hit.at > reloadAt,
  );
  await page.unroute(statusRoute);
  const later = itemStates(f.frames.aLater).join(' ');
  gate(
    'A5',
    answeredBeforeRelease === 0 &&
      restored.length === 2 &&
      later !== itemStates(f.frames.a).join(' ') &&
      restored.every((card) => card.items.join(' ') === later) &&
      requestsOf(ledger, A, reloadAt).length >= 1 &&
      cardsMatch(fetchedShown, routeAfterReload),
    {
      cardsVisibleAfterReloadMs: cardAt - reloadAt,
      statusAnswersBeforeRelease: answeredBeforeRelease,
      heldRequests: held,
      releasedAfterReloadMs: releasedAt - reloadAt,
      firstStatusAnswerAfterReloadMs: firstAnswerAfterReload
        ? firstAnswerAfterReload.at - reloadAt
        : null,
      persistedTurn1: itemStates(f.frames.a),
      persistedTurn3: itemStates(f.frames.aLater),
      restored: restored.map((card) => card.items.join(' ')),
      routeStates: itemStates(routeAfterReload),
      fetchedShown: fetchedShown.map((card) => card.items.join(' ')),
    },
  );

  // --- B7: a hidden agent panel asks nothing; shown again, a stale batch is asked at once -------
  const tabs = page.locator('nav', {
    has: page.locator('button[data-tour-id="organic-agent-tab"]'),
  });
  const agentPanel = page.locator('[data-tour-id="organic-agent-panel"]');
  const activeBatches = [A, B];
  await tabs.getByRole('button', { name: 'Planner', exact: true }).click({ timeout: 10_000 });
  await expect(agentPanel)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => {});
  const hiddenAt = Date.now();
  const panelHidden = !(await agentPanel.isVisible().catch(() => true));
  await page.waitForTimeout(B7_HIDDEN_MS);
  const hiddenRequests = activeBatches.map((id) => requestsOf(ledger, id, hiddenAt).length);
  const lastAnswerAgo = activeBatches.map((id) => {
    const last = ledger.statusResponses.filter((hit) => hit.batchId === id).at(-1);
    return last ? Date.now() - last.at : null;
  });
  await tabs.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 10_000 });
  await expect(agentPanel)
    .toBeVisible({ timeout: 10_000 })
    .catch(() => {});
  const shownAt = Date.now();
  await expect
    .poll(() => activeBatches.every((id) => requestsOf(ledger, id, shownAt - 1).length >= 1), {
      timeout: 5_000,
      intervals: [100],
    })
    .toBe(true)
    .catch(() => {});
  const askedAfterShow = activeBatches.map((id) => {
    const first = requestsOf(ledger, id, shownAt - 1)[0];
    return first ? first.at - shownAt : null;
  });
  gate(
    'B7',
    panelHidden &&
      hiddenRequests.every((n) => n === 0) &&
      lastAnswerAgo.every((ms) => ms !== null && ms > 10_000) &&
      askedAfterShow.every((ms) => ms !== null && ms <= 2_000),
    {
      agentPanelHidden: panelHidden,
      hiddenForMs: shownAt - hiddenAt,
      statusRequestsWhileHidden: { A: hiddenRequests[0], B: hiddenRequests[1] },
      lastAnswerAgoAtShowMs: { A: lastAnswerAgo[0], B: lastAnswerAgo[1] },
      firstRequestAfterShowMs: { A: askedAfterShow[0], B: askedAfterShow[1] },
    },
  );

  // --- A7: every remaining piece lands or fails; once done, no more status requests -------------
  for (const item of f.a.items) {
    if (item.index === 2 || item.index === 5) await flipItem(supabase, item, 'ready');
    if (item.index === 4 && !stillSetFallback) await flipItem(supabase, item, 'failed');
  }
  let doneAt: number | null = null;
  await expect
    .poll(
      async () => {
        const cards = await cardStates(page, A);
        return cards.length > 0 && cards.every((card) => card.done === 'true');
      },
      { timeout: MAX_REFRESH_MS * 2, intervals: [250] },
    )
    .toBe(true)
    .then(() => {
      doneAt = Date.now();
    })
    .catch(() => {});
  const routeDone = await mustRead(A);
  await cardsOf(A)
    .first()
    .screenshot({ path: join(SCREENSHOTS, 'terminal.png') });
  if (doneAt) await page.waitForTimeout(QUIET_AFTER_DONE_MS);
  const afterDone = doneAt ? requestsOf(ledger, A, doneAt) : [];
  const rowA = await readBatchRow(supabase, A);
  gate(
    'A7',
    doneAt !== null &&
      routeDone.done &&
      cardsMatch(await cardStates(page, A), routeDone) &&
      afterDone.length === 0,
    {
      routeDone: { done: routeDone.done, states: itemStates(routeDone), counts: routeDone.counts },
      settledAt: rowA?.settled_at ?? null,
      quietWindowMs: QUIET_AFTER_DONE_MS,
      statusRequestsAfterDone: afterDone.length,
    },
  );

  // --- A6: per batch, one status request per refresh, with two cards of A on screen -------------
  // Gaps are measured within one page life (the reload starts a new first fetch), and the one
  // refresh the cast approval asks for on success is an action, not the timer. The 15 s cap is
  // checked on timer gaps only (see gapsOf).
  const castAnsweredAt = ledger.castResponses[0]?.at ?? null;
  const gapsOf = (batchId: string) => {
    const times = ledger.statusRequests
      .filter((hit) => hit.batchId === batchId)
      .map((hit) => hit.at)
      .filter(
        (at) =>
          !(
            batchId === B &&
            castAnsweredAt !== null &&
            at >= castAnsweredAt &&
            at - castAnsweredAt < 2_000
          ),
      );
    const gaps: number[] = [];
    // A has pieces running throughout; B only once the cast released its pieces to the queue.
    const activeGaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const previous = times[i - 1] as number;
      const current = times[i] as number;
      if (previous < reloadAt && current >= reloadAt) continue;
      gaps.push(current - previous);
      // Not timer gaps: one whose first request A5 held, or one spanning B7's hidden panel.
      const heldByA5 = previous >= reloadAt && previous <= releasedAt;
      const spansHidden = previous < shownAt && current > hiddenAt;
      if (heldByA5 || spansHidden) continue;
      if (batchId === A || (castAnsweredAt !== null && previous >= castAnsweredAt)) {
        activeGaps.push(current - previous);
      }
    }
    return { requests: times.length, gaps, activeGaps };
  };
  const perBatch = { A: gapsOf(A), B: gapsOf(B) };
  const cardsOfA = await cardsOf(A).count();
  gate(
    'A6',
    cardsOfA === 2 &&
      perBatch.A.requests > 1 &&
      [...perBatch.A.gaps, ...perBatch.B.gaps].every((gap) => gap >= MIN_GAP_MS) &&
      perBatch.A.activeGaps.length > 0 &&
      [...perBatch.A.activeGaps, ...perBatch.B.activeGaps].every((gap) => gap <= MAX_ACTIVE_GAP_MS),
    {
      cardsOfBatchA: cardsOfA,
      minGapMs: MIN_GAP_MS,
      maxActiveGapMs: MAX_ACTIVE_GAP_MS,
      excludedFromCap: 'gaps whose first request A5 held, and the gap across B7 hidden',
      A: perBatch.A,
      B: perBatch.B,
      excludedCastRefresh: castAnsweredAt !== null,
    },
  );
  report.statusRequests = {
    A: requestsOf(ledger, A).map((hit) => hit.at - opened),
    B: requestsOf(ledger, B).map((hit) => hit.at - opened),
  };

  // --- B5: B's two cards share one cast approval and one refresh timer ------------------------
  const cardsOfB = await cardsOf(B).count();
  gate(
    'B5',
    bCards === 2 &&
      cardsOfB === 2 &&
      ledger.castPosts.length === 1 &&
      otherDisabledAt !== null &&
      castResponse !== undefined &&
      secondClickAt < castResponse.at &&
      shownBAfter.length === 2 &&
      shownBAfter.every((card) => !card.items.some((s) => s.endsWith('needs_cast_approval'))) &&
      perBatch.B.requests > 1 &&
      perBatch.B.gaps.every((gap) => gap >= MIN_GAP_MS),
    {
      cardsOfBatchB: cardsOfB,
      castPosts: ledger.castPosts.length,
      otherCardDisabledWhilePostOut: otherDisabledAt !== null,
      secondClickBeforeCastAnswerMs: castResponse ? castResponse.at - secondClickAt : null,
      shownAfter: shownBAfter.map((card) => card.items.join(' ')),
      minGapMs: MIN_GAP_MS,
      gapsB: perBatch.B.gaps,
    },
  );

  // --- B4: "Open draft for Reel 2" shows that very draft in the planner, with no navigation -----
  // No element carries the previewed draft's id (a 2036 slot is off the month grid), so the
  // preview is identified by the draft's real caption, read from its row, against another piece's.
  const pressedTab = async () =>
    (
      (await tabs
        .locator('button[aria-pressed="true"]')
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => null)) ?? ''
    ).trim();
  const reel2 = (await mustRead(A)).items.find((item) => item.index === 1) ?? null;
  const other = f.a.items.find((item) => item.index === 0) ?? null;
  const caption = reel2 ? await readDraftCaption(supabase, reel2.draftId) : null;
  const otherCaption = other ? await readDraftCaption(supabase, other.draftId) : null;
  const preview = page.locator('[aria-label="Draft preview"]');
  const visibleIn = (text: string | null) =>
    text
      ? preview
          .getByText(text, { exact: true })
          .evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length)
      : Promise.resolve(0);
  const openButton = cardsOf(A)
    .first()
    .getByRole('button', { name: 'Open draft for Reel 2', exact: true });
  const openNamed = await openButton.count();
  const tabBefore = await pressedTab();
  const openMarker = `hb-open-${randomUUID()}`;
  await page.evaluate((value) => {
    (window as unknown as { __hbMarker: string }).__hbMarker = value;
  }, openMarker);
  const loadsBeforeOpen = ledger.fullLoads;
  await openButton.click({ timeout: 10_000 }).catch(() => {});
  await expect
    .poll(pressedTab, { timeout: 10_000 })
    .toBe('Planner')
    .catch(() => {});
  const tabAfterClick = await pressedTab();
  await expect
    .poll(() => visibleIn(caption), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  const captionVisible = await visibleIn(caption);
  const otherCaptionVisible = await visibleIn(otherCaption);
  const pressed = await page
    .locator('[data-draft-id][aria-pressed="true"]')
    .evaluateAll((cards) =>
      cards
        .filter((card) => card.checkVisibility())
        .map(
          (card) =>
            card.getAttribute('data-backend-draft-id') ?? card.getAttribute('data-draft-id'),
        ),
    );
  const openedUrl = new URL(page.url());
  const agentPanelVisible = await agentPanel.isVisible().catch(() => false);
  const openMarkerAfter = await page.evaluate(
    () => (window as unknown as { __hbMarker?: string }).__hbMarker ?? null,
  );
  await page.screenshot({ path: join(SCREENSHOTS, 'open-draft-planner.png') }).catch(() => {});
  gate(
    'B4',
    reel2 !== null &&
      caption !== null &&
      otherCaption !== null &&
      caption !== otherCaption &&
      openNamed === 1 &&
      tabAfterClick === 'Planner' &&
      !agentPanelVisible &&
      openedUrl.searchParams.get('tab') === 'planner' &&
      openedUrl.searchParams.get('draftId') === reel2.draftId &&
      captionVisible >= 1 &&
      otherCaptionVisible === 0 &&
      // Only when a card of the selection is on screen: it must be this draft.
      (pressed.length === 0 || pressed.every((id) => id === reel2.draftId)) &&
      ledger.fullLoads === loadsBeforeOpen &&
      openMarkerAfter === openMarker,
    {
      routeDraftId: reel2?.draftId ?? null,
      openDraftButtons: openNamed,
      tabBefore,
      tabAfterClick,
      agentPanelVisible,
      url: {
        tab: openedUrl.searchParams.get('tab'),
        draftId: openedUrl.searchParams.get('draftId'),
      },
      caption,
      captionVisibleInPreview: captionVisible,
      otherCaption,
      otherCaptionVisibleInPreview: otherCaptionVisible,
      pressedVisibleCards: pressed,
      fullLoads: ledger.fullLoads - loadsBeforeOpen,
      windowMarkerKept: openMarkerAfter === openMarker,
    },
  );
  await context.close();
});

test('B8 a piece re-parked on a new place raises the cast again; one click releases it', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const f = fixture as Fixture;
  const C = f.c.batchId;
  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);
  const card = page.locator(`section[data-slot="headless-batch-card"][data-batch-id="${C}"]`);
  await openSession(page, f.recastSessionId);
  await expect(card)
    .toBeVisible({ timeout: 60_000 })
    .catch(() => {});
  // The batch's cast is pinned already; its first piece then drafted a new place and parked.
  const routeBefore = await mustRead(C);
  const castBlock = card.locator('[data-slot="headless-batch-cast"]');
  await expect(castBlock)
    .toBeVisible({ timeout: 30_000 })
    .catch(() => {});
  const blockShown = await castBlock.isVisible().catch(() => false);
  const blockText = blockShown ? ((await castBlock.textContent()) ?? '').replace(/\s+/g, ' ') : '';
  if (blockShown) {
    await castBlock.screenshot({ path: join(SCREENSHOTS, 'recast-waiting.png') }).catch(() => {});
  }
  const clickAt = Date.now();
  await card
    .locator('button[data-slot="headless-batch-approve-cast"]')
    .click({ timeout: 10_000 })
    .catch(() => {});
  await expect
    .poll(() => ledger.castResponses.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  // approveCast wakes the parked job: fence it before anything can claim it.
  const fenced = await fenceBatchJobs(supabase, [C]);
  await page.waitForTimeout(2_000);
  const post = ledger.castPosts[0]?.body as
    | { batchId?: string; draftElementIds?: string[] }
    | undefined;
  const response = ledger.castResponses[0];
  const approved = (response?.json as { approved?: Array<{ elementId: string }> } | null)?.approved;
  const routeAfter = await mustRead(C);
  await expect
    .poll(
      async () =>
        (await cardStates(page, C)).every(
          (shown) =>
            shown.items.length > 0 && !shown.items.some((s) => s.endsWith('needs_cast_approval')),
        ),
      { timeout: MAX_REFRESH_MS },
    )
    .toBe(true)
    .catch(() => {});
  const shownAfter = await cardStates(page, C);
  const blocksAfter = await castBlock.count();
  await card.screenshot({ path: join(SCREENSHOTS, 'recast-approved.png') }).catch(() => {});
  gate(
    'B8',
    routeBefore.cast.approved &&
      routeBefore.cast.drafts.some((draft) => draft.elementId === f.recast.elementId) &&
      routeBefore.items[0]?.state === 'needs_cast_approval' &&
      blockShown &&
      blockText.includes(f.recast.summary) &&
      ledger.castPosts.length === 1 &&
      post?.batchId === C &&
      JSON.stringify(post?.draftElementIds) === JSON.stringify([f.recast.elementId]) &&
      response?.status === 200 &&
      Boolean(approved?.some((element) => element.elementId === f.recast.elementId)) &&
      routeAfter.counts.needs_cast_approval === 0 &&
      shownAfter.length === 1 &&
      shownAfter.every((shown) => !shown.items.some((s) => s.endsWith('needs_cast_approval'))) &&
      blocksAfter === 0,
    {
      routeBefore: {
        states: itemStates(routeBefore),
        cast: routeBefore.cast,
      },
      castBlockShown: blockShown,
      castBlockNamesNewPlace: blockText.includes(f.recast.summary),
      castPosts: ledger.castPosts.map((hit) => ({
        afterClickMs: hit.at - clickAt,
        body: hit.body,
      })),
      castResponse: response ?? null,
      releasedJobsFenced: fenced,
      routeAfter: {
        states: itemStates(routeAfter),
        counts: routeAfter.counts,
        cast: routeAfter.cast,
      },
      shownAfter: shownAfter.map((shown) => shown.items.join(' ')),
      castBlocksAfter: blocksAfter,
    },
  );
  await context.close();
});

test('A9 approving a bulk plan shows its batch card live, without a reload', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const f = fixture as Fixture;
  const plan = f.plan;
  const runId = `run_${plan.planId}`;
  const D = f.older.batchId;
  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);

  // What the real routes answered: every batch lookup the page makes (its query, and the batch
  // each answer named) and the replay.
  const lookups: Array<{
    at: number;
    code: number;
    query: Record<string, string>;
    batchId: string | null;
  }> = [];
  const replays: Array<{ at: number; code: number; body: string }> = [];
  // Every page request to organic_calendar_drafts: the plan's batch is no longer matched by them.
  const draftRequests: Array<{ at: number; method: string; query: string }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/organic_calendar_drafts') {
      draftRequests.push({ at: Date.now(), method: request.method(), query: url.search });
    }
  });
  // Realtime frames that name the run: the live run_completed must come this way.
  const realtime: Array<{
    at: number;
    type: string | null;
    createdAt: string | null;
    sample: string;
  }> = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/api/headless/batch' && response.request().method() === 'GET') {
      const json = (await response.json().catch(() => null)) as { batchId?: string } | null;
      lookups.push({
        at: Date.now(),
        code: response.status(),
        query: Object.fromEntries(url.searchParams),
        batchId: json?.batchId ?? null,
      });
    }
    if (url.pathname === `/api/organic/agent/runs/${runId}/events`) {
      const body = await response.text().catch(() => '');
      replays.push({ at: Date.now(), code: response.status(), body: body.slice(0, 400) });
    }
  });
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      if (!text.includes(runId)) return;
      realtime.push({
        at: Date.now(),
        // The record may sit in the frame as JSON or as a JSON string (escaped quotes).
        type: /\\?"type\\?":\s*\\?"(run_[a-z]+)/.exec(text)?.[1] ?? null,
        createdAt: /\\?"created_at\\?":\s*\\?"([^"\\]+)/.exec(text)?.[1] ?? null,
        sample: text.slice(0, 240),
      });
    });
  });
  // The plan-approval control turn: answered with NO ui.headless_batch. The batch is made after
  // the background run ends, so no turn is listening by then; that is the point of the cell.
  const chatPosts: Array<{ at: number; body: unknown }> = [];
  await page.route('**/api/organic/agent/chat', async (route) => {
    chatPosts.push({ at: Date.now(), body: route.request().postDataJSON() });
    const frames = [
      { type: 'response.created', data: {} },
      { type: 'response.output_text.delta', data: { delta: 'Generating the week now.' } },
      { type: 'response.done', data: {} },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
      body: `${frames.map((frame, seq) => JSON.stringify({ ...frame, seq: seq + 1 })).join('\n')}\n`,
    });
  });

  await openSession(page, f.bulkSessionId);
  const planRow = page.locator('[data-slot="message-scroller-item"]', {
    has: page.getByTestId('bulk-plan-card'),
  });
  const approvePlan = planRow.getByTestId('bulk-plan-approve');
  await expect(approvePlan)
    .toBeVisible({ timeout: 60_000 })
    .catch(() => {});
  // createRun writes the run in the control turn, before its panel subscribes.
  await seedPlanRun(supabase, plan, f.bulkSessionId);
  // A batch in the same session with no plan id: from here on the session's newest.
  decoyBatch = await seedDecoyBatch(supabase, f.bulkSessionId, f.scene);
  const F = decoyBatch.batchId;
  const marker = `hb-${randomUUID()}`;
  await page.evaluate((value) => {
    (window as unknown as { __hbMarker: string }).__hbMarker = value;
  }, marker);
  const loadsBefore = ledger.fullLoads;
  const clickAt = Date.now();
  await approvePlan.click({ timeout: 10_000 }).catch(() => {});
  // The panel subscribes, then replays the run's events: none yet.
  await expect
    .poll(() => replays.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  // The run writes the plan's drafts (persistGeneratedDraft), then ends.
  const planDrafts = await seedPlanDrafts(supabase, f.bulkSessionId, f.scene, plan);
  const runCompletedAt = await completePlanRun(supabase, runId);
  const completedAt = Date.now();
  // The decoy was made after the run ended, with no plan id: no lookup by plan may name it.
  const decoyCreatedAt = new Date(Date.parse(runCompletedAt) + 1).toISOString();
  await setBatchCreatedAt(supabase, F, decoyCreatedAt);
  // The plan's lookup finds no batch of the plan yet: a 404, which it retries.
  await expect
    .poll(() => lookups.filter((hit) => hit.code === 404).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {});
  planBatch = await seedPlanBatch(supabase, f.bulkSessionId, f.scene, planDrafts, plan.planId);
  const E = planBatch.batchId;
  const planBatchAt = Date.now();
  const planCard = planRow.locator(
    `section[data-slot="headless-batch-card"][data-batch-id="${E}"]`,
  );
  // Page-wide, so stricter than under the plan: neither batch has a card anywhere.
  const olderCards = page.locator(`[data-slot="headless-batch-card"][data-batch-id="${D}"]`);
  const decoyCards = page.locator(`[data-slot="headless-batch-card"][data-batch-id="${F}"]`);
  let olderSeen = 0;
  let decoySeen = 0;
  let shownAt = null as number | null;
  await expect
    .poll(
      async () => {
        olderSeen = Math.max(olderSeen, await olderCards.count());
        decoySeen = Math.max(decoySeen, await decoyCards.count());
        return planCard.isVisible();
      },
      { timeout: 45_000 },
    )
    .toBe(true)
    .then(() => {
      shownAt = Date.now();
    })
    .catch(() => {});
  const route = await mustRead(E);
  const shown = await cardStates(page, E);
  // A few seconds more: no second POST, and neither other batch takes the plan's place.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    olderSeen = Math.max(olderSeen, await olderCards.count());
    decoySeen = Math.max(decoySeen, await decoyCards.count());
  }
  const markerAfter = await page.evaluate(
    () => (window as unknown as { __hbMarker?: string }).__hbMarker ?? null,
  );
  if (shownAt) {
    await planRow
      .screenshot({ path: join(SCREENSHOTS, 'bulk-plan-batch-live.png'), timeout: 10_000 })
      .catch(() => {});
  }
  const approval = (
    chatPosts[0]?.body as
      | {
          messages?: Array<{
            metadata?: { planApproval?: { decision?: string; planId?: string } };
          }>;
        }
      | undefined
  )?.messages?.[0]?.metadata?.planApproval;
  const planAnswers = lookups.filter(
    (hit) => hit.code === 200 && hit.batchId === E && !hit.query.batchId,
  );
  // The plan's lookups (by plan id); a card's own polls carry its batchId and are counted apart.
  const planLookups = lookups.filter((hit) => !hit.query.batchId);
  const byPlanOnly = planLookups.every(
    (hit) =>
      hit.query.brandId === BRAND_ID && hit.query.planId === plan.planId && !hit.query.sessionId,
  );
  const missesBeforePlan = planLookups.filter((hit) => hit.code === 404 && hit.at < planBatchAt);
  const decoyAnswers = lookups.filter((hit) => hit.batchId === F || hit.batchId === D);
  const draftRequestsAfterClick = draftRequests.filter((hit) => hit.at >= clickAt);
  const evidence = {
    planId: plan.planId,
    runId,
    chatPosts: chatPosts.map((hit) => ({ afterClickMs: hit.at - clickAt })),
    planApproval: approval ?? null,
    replays: replays.map((hit) => ({
      afterClickMs: hit.at - clickAt,
      code: hit.code,
      body: hit.body,
    })),
    runCompletedAt,
    realtime: realtime.map((hit) => ({
      afterCompleteMs: hit.at - completedAt,
      type: hit.type,
      createdAt: hit.createdAt,
      ...(hit.type ? {} : { sample: hit.sample }),
    })),
    lookups: lookups.map((hit) => ({
      afterCompleteMs: hit.at - completedAt,
      code: hit.code,
      query: hit.query,
      batch:
        hit.batchId === E
          ? 'plan'
          : hit.batchId === F
            ? 'decoy'
            : hit.batchId === D
              ? 'older'
              : hit.batchId,
    })),
    everyPlanLookupByPlanIdOnly: byPlanOnly,
    missesBeforePlanBatch: missesBeforePlan.length,
    cardPollsByBatchId: lookups.length - planLookups.length,
    draftRequests: {
      beforeClick: draftRequests.length - draftRequestsAfterClick.length,
      afterClick: draftRequestsAfterClick.length,
      queries: draftRequests.map((hit) => `${hit.method} ${hit.query}`.slice(0, 200)),
    },
    decoyBatch: F,
    decoyCreatedAt,
    decoyAfterRunCompletedMs: Date.parse(decoyCreatedAt) - Date.parse(runCompletedAt),
    answersNamingDecoyOrOlder: decoyAnswers.length,
    decoyCardsSeen: decoySeen,
    planBatch: E,
    planBatchSeededAfterCompleteMs: planBatchAt - completedAt,
    cardShownAfterPlanBatchMs: shownAt ? (shownAt as number) - planBatchAt : null,
    olderBatch: D,
    olderCardsSeen: olderSeen,
    routeStates: itemStates(route),
    shown: shown.map((card) => card.items.join(' ')),
    fullLoads: ledger.fullLoads - loadsBefore,
    windowMarkerKept: markerAfter === marker,
    statusRouteFulfilledByBench: false,
  };
  if (
    !shownAt &&
    (replays[0]?.code !== 200 || !realtime.some((hit) => hit.type === 'run_completed'))
  ) {
    const hop =
      replays[0]?.code !== 200
        ? `GET /api/organic/agent/runs/${runId}/events answered ${replays[0]?.code ?? 'nothing'}`
        : 'Realtime delivered no run_completed INSERT for the run';
    assertions.A9 = { pass: null, evidence: { notExercised: hop, ...evidence } };
    recorder.record('A9', 'SKIP', `not exercised: ${hop}`);
  } else {
    gate(
      'A9',
      chatPosts.length === 1 &&
        approval?.decision === 'approve' &&
        approval.planId === plan.planId &&
        replays[0]?.code === 200 &&
        shownAt !== null &&
        planLookups.length >= 2 &&
        byPlanOnly &&
        missesBeforePlan.length >= 1 &&
        planAnswers.length >= 1 &&
        decoyAnswers.length === 0 &&
        draftRequests.length === 0 &&
        decoySeen === 0 &&
        olderSeen === 0 &&
        shown.length === 1 &&
        cardsMatch(shown, route) &&
        ledger.fullLoads === loadsBefore &&
        markerAfter === marker,
      evidence,
    );
  }
  await context.close();
});

test('verdict: every assertion that ran passed', () => {
  const failed = Object.entries(assertions)
    .filter(([, assertion]) => assertion.pass === false)
    .map(([id, assertion]) => `${id}: ${JSON.stringify(assertion.evidence).slice(0, 400)}`);
  expect(failed, failed.join('\n')).toEqual([]);
});
