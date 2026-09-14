import { randomUUID } from 'node:crypto';
import { createEnvelopeMint, serializeFrame } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';
import { loadProdSupabaseEnv } from './support/prodEnv';

// ---------------------------------------------------------------------------
// jaina:approval:card:e2e:bench — the tool-approval card's before → after table.
//
// A real Chrome, driving the REAL /scale?tab=jaina chat surface as a REAL
// authenticated member, with ONE thing faked: the chat-stream route is answered by
// `page.route` with an NDJSON body this file builds out of the vendored contracts'
// own `serializeFrame`. No Backend is spawned; `NEXT_PUBLIC_API_URL` points at a dead
// port, which is what proves the frames came from here.
//
// What it proves, in order:
//   1. TABLE — a `tool.approval_required` frame carrying `preview` rows renders as a
//      before → after table on the card: the subject, one row per preview row, and a
//      signed change rate. Asserted on the DOM cells, not on a parsed object.
//   2. DENY — clicking Deny re-POSTs the chat stream with `tool_action` naming THIS
//      frame's approval_id and tool_call_id, and posts no user turn into the
//      transcript (which is what `silentUserMessage: true` is observable as — the
//      flag itself is Frontend-only and never reaches the wire).
//   3. NO WRITE — nothing in the run touches graph.facebook.com or any Backend.
//
// ── MONEY SAFETY ──
// Every network hop that could reach Meta is either stubbed or unreachable: the chat
// stream is fulfilled locally, the Backend port is dead, and the only decision this
// bench makes is DENY. It writes exactly one Supabase row — the bench member's own
// `user_brand_preferences.active_brand_id` — snapshotted and restored in afterAll.
//
// ── UN-EXERCISED HOP ──
// The Backend never emits this frame here. A REAL `tool.approval_required` carrying a
// real `previewOf` is covered by `jaina:edit:gate:bench`; this bench covers the card.
// ---------------------------------------------------------------------------

test.use({ channel: 'chrome' });

const { serviceRoleKey } = loadProdSupabaseEnv();

/**
 * BENCH_ACCOUNTS.easyfitVivo47 — a real client brand, READ-ONLY by contract and never
 * touched over the network here.
 *
 * The chat runs on this brand for one reason, the same one `jaina-canvas.bench.spec.ts`
 * records: `dispatchMessage` refuses to send without an ad account, the bench brand has
 * none, and the ad account is server-rendered — so no stub can supply it.
 */
const CLIENT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const CLIENT_OWNER_EMAIL = 'mercadotecniavivo@gmail.com';

const RUN_ID = randomUUID().slice(0, 8);
/**
 * One STABLE conversation for the surface to land on.
 *
 * The sessions list must not come back empty. `bootstrapHistory` answers an empty list
 * by minting a fresh local session id and clearing the transcript — and because that id
 * is new on every pass, the effect re-runs and the turn the card hangs off is wiped as
 * fast as it is added. Handing back one session makes the bootstrap idempotent, which is
 * also what a returning user's page actually looks like.
 */
const BENCH_SESSION_ID = randomUUID();

/**
 * The frame under test. `duplicate_meta_entity` is one of the five newly labelled
 * gated writes, and duplicating an ad set as a paused copy with a raised budget is why
 * the preview carries BOTH shapes the table has to render: a numeric row with a rate,
 * and a status flip that has none.
 */
const APPROVAL = {
  approvalId: `appr_bench_${RUN_ID}`,
  toolCallId: `call_bench_${RUN_ID}`,
  toolName: 'duplicate_meta_entity',
  input: {
    entity_type: 'adset',
    entity_id: '120210000000000000',
    expected_status: 'ACTIVE',
    daily_budget: 50,
  },
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  preview: {
    subject: 'Ad set 120210000000000000 · EASYFIT // Prospecting',
    rows: [
      { field: 'daily_budget', before: 40, after: 50, changePct: 25, unit: 'USD' },
      { field: 'status', before: 'ACTIVE', after: 'PAUSED' },
    ],
  },
} as const;

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
      bench: 'jaina:approval:card:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/** The NDJSON a paused turn really looks like: opener, the gate, then silence. */
function approvalStreamBody(): string {
  const mint = createEnvelopeMint();
  let seq = 0;
  const frames = [
    {
      type: 'response.created',
      data: { id: `resp_${RUN_ID}`, object: 'realtime.response' as const, status: 'in_progress' },
    },
    { type: 'response.run.created', data: { run_id: `run_${RUN_ID}`, session_id: null } },
    { type: 'tool.approval_required', data: APPROVAL },
  ];
  return frames.map((frame) => serializeFrame(frame, mint(seq++))).join('');
}

/** The answer to a denial: the gate resolves, nothing ran. */
function denialStreamBody(): string {
  const mint = createEnvelopeMint();
  let seq = 0;
  const frames = [
    {
      type: 'response.created',
      data: {
        id: `resp_deny_${RUN_ID}`,
        object: 'realtime.response' as const,
        status: 'completed',
      },
    },
    {
      type: 'tool.approval_resolved',
      data: {
        approvalId: APPROVAL.approvalId,
        toolCallId: APPROVAL.toolCallId,
        toolName: APPROVAL.toolName,
        decision: 'denied' as const,
        resolvedAt: new Date().toISOString(),
      },
    },
    { type: 'response.output_text.delta', data: { delta: 'Understood — nothing was changed.' } },
  ];
  return frames.map((frame) => serializeFrame(frame, mint(seq++))).join('');
}

type StreamPost = Record<string, unknown>;

/**
 * What the Backend would have written by now.
 *
 * A real run persists the USER turn as it starts; the assistant turn is not written
 * until the run completes, and a gate-paused run has not. `refreshConversationSnapshot`
 * re-reads this list the moment the turn settles and folds it over local state — and
 * `mergePersistedMessagesWithLocal` short-circuits an EMPTY persisted list by returning
 * it verbatim, which wipes the card a quarter-second after it renders. Persisting the
 * user turn here is what a Backend does, and it is what puts the merge on its real
 * branch: persisted history + the local assistant that carries the gate.
 */
const persistedMessages: Record<string, unknown>[] = [];

let previousBrandId: string | null | undefined;
let benchUserId: string | null = null;

async function rememberAndSelectBrand(): Promise<void> {
  const { data: members, error: membersError } = await brandProfiles()
    .from('permissions')
    .select('user_id,email')
    .eq('brand_profile_id', CLIENT_BRAND_ID);
  if (membersError)
    throw new Error(`[approval-card-bench] permissions read: ${membersError.message}`);
  const userId = (members ?? [])
    .map((row) => row as { user_id: string; email: string | null })
    .find((row) => row.email?.toLowerCase() === CLIENT_OWNER_EMAIL)?.user_id;
  if (!userId) throw new Error(`[approval-card-bench] ${CLIENT_OWNER_EMAIL} is not a brand member`);
  benchUserId = userId;

  const { data: existing } = await brandProfiles()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  previousBrandId =
    (existing as { active_brand_id?: string | null } | null)?.active_brand_id ?? null;

  const { error } = await brandProfiles()
    .from('user_brand_preferences')
    .upsert(
      { user_id: userId, active_brand_id: CLIENT_BRAND_ID, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[approval-card-bench] brand switch failed: ${error.message}`);
}

async function restoreBrand(): Promise<void> {
  if (!benchUserId || previousBrandId === undefined) return;
  await brandProfiles().from('user_brand_preferences').upsert(
    {
      user_id: benchUserId,
      active_brand_id: previousBrandId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('jaina tool approval card', () => {
  let context: BrowserContext;
  let page: Page;
  const streamPosts: StreamPost[] = [];
  const requestLog: { method: string; url: string }[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    await rememberAndSelectBrand();

    const storageState = await mintSessionForEmail(CLIENT_OWNER_EMAIL);
    context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
    context.on('request', (request) => {
      requestLog.push({ method: request.method(), url: request.url() });
    });

    // The chat surface's own routes, answered locally. `ensureConversationSession`
    // runs BEFORE every stream POST and would otherwise die on the dead Backend,
    // taking the dispatch with it.
    await context.route('**/api/agents/jaina/chat/conversations**', async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());

      if (pathname.endsWith('/runs')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ runs: [] }),
        });
        return;
      }

      if (request.method() === 'POST' && pathname.endsWith('/conversations')) {
        // ECHO the requested session id. Handing back a different one is what the real
        // Backend does only for a brand-new conversation, and the surface answers it by
        // SWITCHING conversations — which reloads history and wipes the local turn the
        // card hangs off. Honouring the preferred id is both faithful and stable.
        const body = (request.postDataJSON() ?? {}) as {
          context?: { sessionId?: string; adAccountId?: string };
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: body.context?.sessionId ?? BENCH_SESSION_ID,
            brand_id: CLIENT_BRAND_ID,
            ad_account_id: body.context?.adAccountId ?? null,
            conversation_title: null,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessions: [
            {
              sessionId: BENCH_SESSION_ID,
              brandId: CLIENT_BRAND_ID,
              adAccountId: null,
              title: 'Approval card bench',
              lastMessageRole: null,
              lastMessagePreview: null,
              lastMessageAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: persistedMessages,
          nextCursor: null,
        }),
      });
    });

    await context.route('**/api/agents/jaina/chat/stream', async (route) => {
      const body = (route.request().postDataJSON() ?? {}) as StreamPost;
      streamPosts.push(body);
      if (!body.tool_action) {
        persistedMessages.push({
          id: persistedMessages.length + 1,
          sessionId: BENCH_SESSION_ID,
          brandId: CLIENT_BRAND_ID,
          adAccountId: null,
          role: 'user',
          content: String(body.query ?? ''),
          createdAt: new Date().toISOString(),
        });
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
        body: body.tool_action ? denialStreamBody() : approvalStreamBody(),
      });
    });

    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    await restoreBrand();
    printBenchEnvelope();
  });

  test('renders the preview as a before → after table and denies it', async () => {
    test.setTimeout(240_000);

    await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });

    const composer = page.getByRole('textbox', { name: 'Message Jaina' });
    await expect(composer).toBeVisible({ timeout: 180_000 });

    await composer.click();
    await page.keyboard.type('Duplicate the prospecting ad set as a paused copy.');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => streamPosts.length, { timeout: 60_000, intervals: [250, 500, 1_000] })
      .toBeGreaterThan(0);
    grade('stream.dispatched', true, 'the real composer POSTed the real chat-stream route');

    // ── 1. the table ──────────────────────────────────────────────────────────
    const table = page.locator('table').filter({ hasText: 'daily_budget' }).first();
    await expect(table).toBeVisible({ timeout: 60_000 });
    await expect(table).toContainText(APPROVAL.preview.subject);
    await expect(table.getByRole('cell', { name: 'daily_budget' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '40 USD' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '50 USD' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '+25.0%' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'status' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'ACTIVE' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'PAUSED' })).toBeVisible();
    grade('card.table', true, 'field / before / after / +25.0% are real DOM cells');

    await expect(page.getByText('Duplicate as a paused copy')).toBeVisible();
    // The exact input never leaves the card — a preview only collapses it.
    await expect(page.getByText('Exact input')).toBeVisible();
    grade('card.label_and_input', true, 'new TOOL_LABELS entry + the collapsed exact-input list');

    // ── 2. deny ───────────────────────────────────────────────────────────────
    // Scoped to the card's own footer: a bare name lookup also matches controls in
    // the conversations sidebar. Both buttons carry `locked={isStreaming}`, so wait
    // for the turn to settle rather than burning the actionability window.
    const approveButton = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveButton).toBeVisible({ timeout: 60_000 });
    const denyButton = approveButton.locator('..').getByRole('button', { name: 'Deny' });
    await expect(denyButton).toBeEnabled({ timeout: 60_000 });
    await denyButton.click();

    await expect
      .poll(() => streamPosts.length, { timeout: 60_000, intervals: [250, 500, 1_000] })
      .toBe(2);

    const decision = streamPosts[1] as {
      tool_action?: { decision?: string; approval_id?: string; tool_call_id?: string };
      scaffold_action?: unknown;
    };
    expect(decision.tool_action).toEqual({
      decision: 'deny',
      approval_id: APPROVAL.approvalId,
      tool_call_id: APPROVAL.toolCallId,
    });
    expect(decision.scaffold_action).toBeUndefined();
    grade('deny.tool_action', true, 'the re-POST names THIS frame, on tool_action, as deny');

    // `silentUserMessage` is Frontend-only and never reaches the wire; the observable
    // is that the decision posted no second user turn into the transcript.
    await expect(page.getByText('Declined — nothing ran')).toBeVisible({ timeout: 60_000 });
    const userTurns = await page
      .getByText('Duplicate the prospecting ad set as a paused copy.')
      .count();
    expect(userTurns).toBe(1);
    grade('deny.silent', true, 'the denial added no user turn — one message in the transcript');

    // ── 3. no write ───────────────────────────────────────────────────────────
    const graphCalls = requestLog.filter((entry) => entry.url.includes('graph.facebook.com'));
    const backendCalls = requestLog.filter((entry) =>
      entry.url.startsWith(process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4499'),
    );
    const streamCalls = requestLog.filter(
      (entry) => entry.method === 'POST' && entry.url.includes('/api/agents/jaina/chat/stream'),
    );
    expect(graphCalls, `unexpected Meta Graph traffic: ${JSON.stringify(graphCalls)}`).toHaveLength(
      0,
    );
    expect(
      backendCalls,
      `unexpected Backend traffic: ${JSON.stringify(backendCalls)}`,
    ).toHaveLength(0);
    expect(streamCalls).toHaveLength(2);
    grade('no_write', true, '0 graph.facebook.com, 0 Backend, exactly 2 chat-stream POSTs');

    const otherWrites = [
      ...new Set(
        requestLog
          .filter((entry) => entry.method !== 'GET' && entry.method !== 'OPTIONS')
          .filter((entry) => !entry.url.includes('/api/agents/jaina/chat/'))
          .map(
            (entry) => `${entry.method} ${new URL(entry.url).origin}${new URL(entry.url).pathname}`,
          ),
      ),
    ];
    notes.push(
      `other non-GET requests observed (page background, not this feature): ${
        otherWrites.length === 0 ? 'none' : otherWrites.join(', ')
      }`,
    );
    notes.push(
      'UN-EXERCISED: a real Backend `tool.approval_required` frame. This bench fulfils the ' +
        'chat-stream route locally and spawns no Fastify — the Backend emit side is covered by ' +
        'jaina:edit:gate:bench.',
    );
  });
});
