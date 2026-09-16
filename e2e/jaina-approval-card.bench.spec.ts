import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createEnvelopeMint, serializeFrame } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { mintSessionWithPassword } from './support/auth';

// ---------------------------------------------------------------------------
// jaina:approval:card:e2e:bench — the tool-approval card's before → after table.
//
// A real Chrome, driving the REAL /scale?tab=jaina chat surface as a REAL
// authenticated local fixture member, with ONE thing faked: the chat-stream route is answered by
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
//   3. NO WRITE — nothing in the run touches graph.facebook.com or writes to any Backend.
//
// ── MONEY SAFETY ──
// Every network hop that could reach Meta is either stubbed or unreachable: the chat
// stream is fulfilled locally, the Backend port is dead, and the only decision this
// bench makes is DENY. The seeded local brand preference is read as-is; no Supabase
// row is written, and the config refuses to start against a non-local project.
//
// ── UN-EXERCISED HOP ──
// The Backend never emits this frame here. A REAL `tool.approval_required` carrying a
// real `previewOf` is covered by `jaina:edit:gate:bench`; this bench covers the card.
// ---------------------------------------------------------------------------

test.use({ channel: 'chrome' });

const CLIENT_BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const CLIENT_OWNER_EMAIL = 'local@continuum.test';
const CLIENT_OWNER_PASSWORD = 'localdev123';

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

const LIVE_PROMPT =
  'Show live communication angle × individual creative × audience segment performance for the last 30 days.';
const LIVE_DATASET_ID = 'live-creative-audience:browser-fixture';
const LIVE_ROW_ID = 'row:browser-fixture-alpha-25-34-female';
const LIVE_REPORT = {
  language: 'en',
  executive_summary:
    'Product demonstration was strongest for women 25–34; audience coverage is partial, so scale cautiously.',
  reasoning_trace: '',
  blocks: [
    {
      block_id: 'live_metrics',
      category: 'metric_grid',
      scope: 'current_account',
      title: 'Live delivery and coverage · Aug 17 → Sep 15',
      priority: 'secondary',
      dataset_id: `${LIVE_DATASET_ID}:summary`,
      evidence_refs: ['meta:act_browser:insights:unbroken', 'meta:act_browser:insights:age_gender'],
      provenance: {
        source: 'computed',
        tool: 'get_live_creative_audience_matrix',
        period: { since: '2026-08-17', until: '2026-09-15', requested_label: 'last_30d' },
        entity_label: 'Synthetic Meta account',
        record_count: 2,
      },
      metrics: [
        { label: 'Delivered spend', value: 1500, unit: 'USD', format: 'currency' },
        { label: 'Audience coverage', value: 93.3, unit: null, format: 'percent' },
        { label: 'Primary KPI', value: 'purchases', unit: null, format: 'number' },
      ],
    },
    {
      block_id: 'live_chart',
      category: 'chart',
      scope: 'current_account',
      title: 'Measured spend by delivered audience',
      priority: 'secondary',
      dataset_id: `${LIVE_DATASET_ID}:matrix`,
      evidence_refs: [LIVE_ROW_ID],
      provenance: {
        source: 'computed',
        tool: 'get_live_creative_audience_matrix',
        period: { since: '2026-08-17', until: '2026-09-15', requested_label: 'last_30d' },
        entity_label: 'Individual creative × audience cells',
        record_count: 1,
      },
      chart_type: 'bar',
      data: [{ audience: 'age=25-34|gender=female', spend: 900 }],
      chart_config: { spend: { label: 'Spend', color: 'hsl(221 83% 53%)' } },
      category_key: 'audience',
      value_key: 'spend',
      x_axis_label: 'Delivered audience segment',
      y_axis_label: 'Spend (USD)',
      value_format: 'currency',
      currency_code: 'USD',
      annotation: 'Measured delivery only; configured targeting is shown separately.',
      description: 'Spend by delivered age × gender cell.',
      data_meta: [{ row_id: LIVE_ROW_ID, evidence_kind: 'measured_delivery' }],
    },
    {
      block_id: 'live_table',
      category: 'data_table',
      scope: 'current_account',
      title: 'Individual creative × audience evidence',
      priority: 'primary',
      dataset_id: `${LIVE_DATASET_ID}:matrix`,
      evidence_refs: [
        LIVE_ROW_ID,
        'classifier:act_browser:fingerprint-alpha',
        'meta:act_browser:insights:age_gender',
      ],
      provenance: {
        source: 'computed',
        tool: 'get_live_creative_audience_matrix',
        period: { since: '2026-08-17', until: '2026-09-15', requested_label: 'last_30d' },
        entity_label: 'Individual creative × audience cells',
        record_count: 2,
      },
      columns: [
        { key: 'creative', label: 'Creative', format: 'creative' },
        { key: 'communication_angle', label: 'Communication angle (derived)', format: 'text' },
        { key: 'angle_confidence', label: 'Derived confidence', format: 'percent' },
        { key: 'audience_segment', label: 'Audience segment', format: 'text' },
        { key: 'evidence_kind', label: 'Audience evidence', format: 'text' },
        { key: 'evidence_status', label: 'Status', format: 'text' },
        { key: 'spend', label: 'Spend', format: 'currency' },
        { key: 'currency', label: 'Currency', format: 'text' },
      ],
      rows: [
        {
          creative: 'Creative Alpha',
          communication_angle: 'product_demonstration',
          angle_confidence: 91,
          audience_segment: 'age=25-34|gender=female',
          evidence_kind: 'measured_delivery',
          evidence_status: 'measured',
          spend: 900,
          currency: 'USD',
        },
        {
          creative: 'Creative Beta',
          communication_angle: 'unclassified',
          angle_confidence: null,
          audience_segment: 'age=unknown|gender=unknown',
          evidence_kind: 'measured_delivery',
          evidence_status: 'suppressed',
          spend: null,
          currency: 'USD',
        },
      ],
      notes:
        'Communication angles are derived classifications. Delivery is measured; targeting is a separate configured fact.',
      row_meta: [
        {
          row_id: LIVE_ROW_ID,
          evidence_refs: [LIVE_ROW_ID, 'classifier:act_browser:fingerprint-alpha'],
          currency: 'USD',
          creative: {
            brand_id: CLIENT_BRAND_ID,
            ad_account_id: 'act_browser',
            ad_id: 'ad_alpha',
            creative_id: 'creative_alpha',
          },
        },
        {
          row_id: 'row:browser-fixture-suppressed',
          evidence_refs: ['meta:privacy:suppressed'],
          currency: 'USD',
        },
      ],
      render_mode: 'table',
      card_fields: null,
    },
    {
      block_id: 'live_actions',
      category: 'insight_list',
      scope: 'current_account',
      title: 'Actions and limitations',
      priority: 'secondary',
      dataset_id: `${LIVE_DATASET_ID}:recommendations`,
      evidence_refs: [LIVE_ROW_ID, 'meta:coverage:partial'],
      provenance: {
        source: 'computed',
        tool: 'get_live_creative_audience_matrix',
        period: { since: '2026-08-17', until: '2026-09-15', requested_label: 'last_30d' },
        entity_label: 'Evidence-backed recommendations',
        record_count: 2,
      },
      items: [
        {
          item_type: 'action',
          title: 'Scale cautiously',
          summary: 'Scale Creative Alpha for women 25–34 inside the current measured range.',
          rationale: 'Its recomputed cost per purchase is below its like-for-like audience cohort.',
          impact: 'Potentially more purchases without extrapolating to unmeasured audiences.',
          evidence_refs: [LIVE_ROW_ID],
        },
        {
          item_type: 'insight',
          title: 'Coverage limitation',
          summary:
            'Broken-down spend covers 93.3% of delivered spend; suppressed rows remain unknown.',
          rationale: 'Meta did not return demographic detail for all delivered spend.',
          impact: 'Do not treat the missing 6.7% as zero delivery.',
          severity: 'watch',
          evidence_refs: ['meta:coverage:partial'],
        },
      ],
      citations: [],
    },
  ],
  follow_up_questions: [],
  media_map: {},
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  _meta: {
    schema_version: '2',
    block_count: 4,
    has_charts: true,
    has_media: true,
    primary_scope: 'current_account',
  },
};

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

function liveReportStreamBody(): string {
  const mint = createEnvelopeMint();
  let seq = 0;
  const frames = [
    {
      type: 'response.created',
      data: {
        id: `resp_live_${RUN_ID}`,
        object: 'realtime.response' as const,
        status: 'in_progress',
      },
    },
    { type: 'response.run.created', data: { run_id: `run_live_${RUN_ID}`, session_id: null } },
    {
      type: 'response.checkpoint_report',
      data: { item_id: `item_live_${RUN_ID}`, part_id: 'part_live', report: LIVE_REPORT },
    },
    {
      type: 'response.done',
      data: {
        id: `resp_live_${RUN_ID}`,
        object: 'realtime.response' as const,
        status: 'completed',
        status_details: null,
        output: [],
      },
    },
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

test.describe.configure({ mode: 'serial' });

test.describe('jaina tool approval card', () => {
  let context: BrowserContext;
  let page: Page;
  const streamPosts: StreamPost[] = [];
  const requestLog: { method: string; url: string }[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    const storageState = await mintSessionWithPassword(CLIENT_OWNER_EMAIL, CLIENT_OWNER_PASSWORD);
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
        body: body.tool_action
          ? denialStreamBody()
          : body.query === LIVE_PROMPT
            ? liveReportStreamBody()
            : approvalStreamBody(),
      });
    });

    await context.route('**/api/agents/jaina/creative-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thumbnail_url:
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="48"%3E%3Crect width="64" height="48" fill="%232563eb"/%3E%3C/svg%3E',
          image_url: null,
          preview_iframe: null,
          creative_id: 'creative_alpha',
          ad_id: 'ad_alpha',
        }),
      });
    });

    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
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
    const backendWrites = backendCalls.filter(
      (entry) => entry.method !== 'GET' && entry.method !== 'OPTIONS',
    );
    const streamCalls = requestLog.filter(
      (entry) => entry.method === 'POST' && entry.url.includes('/api/agents/jaina/chat/stream'),
    );
    expect(graphCalls, `unexpected Meta Graph traffic: ${JSON.stringify(graphCalls)}`).toHaveLength(
      0,
    );
    expect(
      backendWrites,
      `unexpected Backend write: ${JSON.stringify(backendWrites)}`,
    ).toHaveLength(0);
    expect(streamCalls).toHaveLength(2);
    grade(
      'no_write',
      true,
      `0 graph.facebook.com writes, 0 Backend writes, exactly 2 chat-stream POSTs; ${backendCalls.length} dead-port GETs`,
    );

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

  test('renders the live creative × angle × audience report with evidence and preview', async () => {
    await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: 'Message Jaina' });
    await expect(composer).toBeVisible({ timeout: 180_000 });
    await composer.fill(LIVE_PROMPT);
    await composer.press('Enter');

    await expect(page.getByText('Individual creative × audience evidence')).toBeVisible();
    await expect(page.getByText('Measured spend by delivered audience')).toBeVisible();
    await expect(page.getByText('Live delivery and coverage · Aug 17 → Sep 15')).toBeVisible();
    await expect(page.getByText('Actions and limitations')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Report modules' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Creative Alpha' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'product_demonstration' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'age=25-34|gender=female' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'measured_delivery' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'suppressed' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$900.00' })).toBeVisible();
    await expect(page.getByText('Coverage limitation')).toBeVisible();
    grade('live_report.blocks', true, 'four focused report modules rendered from one checkpoint');

    await page.getByRole('button', { name: 'Data provenance' }).first().hover();
    await expect(page.getByText('get_live_creative_audience_matrix').first()).toBeVisible();
    await expect(page.getByText('Evidence references:').first()).toBeVisible();
    grade('live_report.provenance', true, 'dataset provenance and evidence references are visible');

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Export report as PDF' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(download.suggestedFilename()).toMatch(/^jaina-report-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(downloadPath).not.toBeNull();
    const pdf = await readFile(downloadPath!);
    expect(pdf.byteLength).toBeGreaterThan(1_000);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain('Creative Alpha');
    grade('live_report.pdf', true, `downloaded ${pdf.byteLength} byte PDF after response.done`);

    await page.getByText('Creative Alpha', { exact: true }).hover();
    await expect(page.getByRole('img', { name: 'Creative Alpha' })).toBeVisible();
    grade('live_report.creative_preview', true, 'creative identity lazy-resolved a preview image');

    expect(requestLog.filter((entry) => entry.url.includes('graph.facebook.com'))).toHaveLength(0);
    expect(
      requestLog.filter(
        (entry) =>
          entry.url.startsWith(process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4499') &&
          entry.method !== 'GET' &&
          entry.method !== 'OPTIONS' &&
          !entry.url.includes('/api/agents/jaina/creative-preview'),
      ),
    ).toHaveLength(0);
    grade(
      'live_report.no_provider',
      true,
      '0 Meta/model/Backend writes; preview was fixture-routed',
    );
  });
});
