import { randomUUID } from 'node:crypto';
import { JAINA_UI_DATA_PART } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import {
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessageChunk,
  uiMessageChunkSchema,
} from 'ai';
import { mintSessionWithPassword } from './support/auth';

// ---------------------------------------------------------------------------
// jaina:approval:card:e2e:bench — the tool-approval card's before → after table.
//
// A real Chrome, driving the REAL /scale?tab=jaina chat surface as a REAL
// authenticated local fixture member, with ONE thing faked: the chat-stream route is answered by
// `page.route` with an AI SDK UI message stream (SSE, protocol v1) this file builds out of the
// SDK's own chunk schema and SSE transform. No Backend is spawned; `NEXT_PUBLIC_API_URL` points at
// a dead port, which is what proves the chunks came from here.
//
// ── THE WIRE ──
// SSE, not the retired NDJSON envelope: `content-type: text/event-stream` plus
// `x-vercel-ai-ui-message-stream: v1`, `data: <json>\n\n` lines, terminated by `data: [DONE]`.
// Chunk shapes mirror `App/agents-ts/Jaina/src/runtime/uiMessageChunks.ts` — assistant message id
// `jaina:${runId}:assistant`, report blocks as `data-jaina-report-block` addressed
// `${runId}:block:${blockId}`, and the HITL gate as the SDK's NATIVE `tool-approval-request` /
// `tool-approval-response` / `tool-output-denied` chunks plus a `data-jaina-approval` part
// carrying the before → after preview.
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
const FINAL_SHELL_PROMPT =
  'Render the ad metrics and keep them visible when the response completes.';
const SCROLL_PROMPT = 'Stream a long campaign analysis while I review earlier sections.';
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

/**
 * SSE lines for one turn — and the self-check that they really are an AI SDK UI message stream.
 *
 * Two things make this verifiable rather than hopeful, and both come from the SDK itself:
 *   1. every chunk is validated against `uiMessageChunkSchema`, so a stub that drifts from the
 *      protocol throws HERE, naming the chunk, instead of rendering nothing in the browser and
 *      reading as an app bug;
 *   2. the framing is `JsonToSseTransformStream` — the exact transform the server pipes through —
 *      so `data: <json>\n\n` and the terminating `data: [DONE]\n\n` can never drift from it.
 */
async function sseLines(chunks: UIMessageChunk[]): Promise<string[]> {
  const schema = uiMessageChunkSchema();
  for (const chunk of chunks) {
    const validated = await schema.validate(chunk);
    if (!validated.success) {
      throw new Error(
        `stub emitted a chunk the AI SDK would reject: ${JSON.stringify(chunk)}\n${String(validated.error)}`,
      );
    }
  }
  const reader = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  })
    .pipeThrough(new JsonToSseTransformStream())
    .getReader();

  const lines: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    lines.push(value);
  }
  return lines;
}

const sseBody = async (chunks: UIMessageChunk[]): Promise<string> =>
  (await sseLines(chunks)).join('');

const messageIdFor = (runId: string) => `jaina:${runId}:assistant`;

/**
 * The opening and closing chunks as the Backend now sends them. `messageMetadata` is not garnish:
 * the report acknowledges its delivery against `runId`, and with no run id it sends no ack at all —
 * so a stub without it would pass a delivery assertion only by never reaching one.
 */
const startOf = (runId: string): UIMessageChunk => ({
  type: 'start',
  messageId: messageIdFor(runId),
  messageMetadata: { runId },
});
const finishOf = (runId: string): UIMessageChunk => ({
  type: 'finish',
  messageMetadata: { runId, status: 'completed' },
});

/** The gated tool call itself. Jaina's tools are discovered at run time, so they are DYNAMIC. */
const gatedToolCall: UIMessageChunk = {
  type: 'tool-input-available',
  toolCallId: APPROVAL.toolCallId,
  toolName: APPROVAL.toolName,
  input: APPROVAL.input,
  dynamic: true,
};

/** A paused turn on the native wire: the gated call, the gate, the preview, then silence. */
function approvalStreamBody(): Promise<string> {
  const runId = `run_${RUN_ID}`;
  return sseBody([
    startOf(runId),
    gatedToolCall,
    {
      type: 'tool-approval-request',
      approvalId: APPROVAL.approvalId,
      toolCallId: APPROVAL.toolCallId,
    },
    // The card shows what WILL change. A uuid on an approval card is consent to nothing, so the
    // before → after preview rides alongside the native chunk as its own typed part.
    {
      type: JAINA_UI_DATA_PART.approval,
      id: `${runId}:approval:${APPROVAL.approvalId}`,
      data: APPROVAL,
    },
    { type: 'finish' },
  ]);
}

/**
 * The answer to a denial: the gate resolves, nothing ran.
 *
 * The decision POSTs a NEW turn, so this is a NEW assistant message — and the SDK resolves both
 * `tool-approval-request` and `tool-approval-response` against tool parts of the message CURRENTLY
 * streaming (`getToolInvocation` / `getToolInvocationByApprovalId`, ai@7). A chunk that names a
 * tool call this message has not announced raises `UIMessageStreamError` and the message comes out
 * with ZERO parts — the whole turn is lost, not just the card, and the only trace is `onError`. So
 * the resolving turn re-announces the gated call and its request before answering them, which is
 * what the Backend must emit for the native chunks to survive the decision hop.
 */
function denialStreamBody(): Promise<string> {
  const runId = `run_deny_${RUN_ID}`;
  const textBlock = `${runId}:text`;
  return sseBody([
    startOf(runId),
    gatedToolCall,
    {
      type: 'tool-approval-request',
      approvalId: APPROVAL.approvalId,
      toolCallId: APPROVAL.toolCallId,
    },
    { type: 'tool-approval-response', approvalId: APPROVAL.approvalId, approved: false },
    { type: 'tool-output-denied', toolCallId: APPROVAL.toolCallId },
    { type: 'text-start', id: textBlock },
    { type: 'text-delta', id: textBlock, delta: 'Understood — nothing was changed.' },
    { type: 'text-end', id: textBlock },
    { type: 'finish' },
  ]);
}

/**
 * One checkpoint report, as the mapper projects it: one part PER BLOCK addressed by the block's own
 * id, plus the report's metadata under `${runId}:report`. Never one part for the whole report — a
 * 19KB report re-sent on every delta is what made the old client re-fold and freeze the tab.
 */
const reportChunks = (runId: string, report: Record<string, unknown>): UIMessageChunk[] => {
  const { blocks, ...rest } = report as { blocks?: { block_id: string }[] };
  // Mirrors the Backend's `reportMetaOf`: the final report names its blocks in its own order, and
  // an empty report names none so the streamed blocks stand.
  const order = (blocks ?? []).map((block) => block.block_id);
  const meta = order.length > 0 ? { ...rest, block_order: order } : rest;
  return [
    ...(blocks ?? []).map(
      (block): UIMessageChunk => ({
        type: JAINA_UI_DATA_PART.reportBlock,
        id: `${runId}:block:${block.block_id}`,
        data: block,
      }),
    ),
    { type: JAINA_UI_DATA_PART.reportMeta, id: `${runId}:report`, data: meta },
  ];
};

function liveReportStreamBody(): Promise<string> {
  const runId = `run_live_${RUN_ID}`;
  return sseBody([startOf(runId), ...reportChunks(runId, LIVE_REPORT), finishOf(runId)]);
}

function finalShellStreamBody(): Promise<string> {
  const runId = `run_final_shell_${RUN_ID}`;
  return sseBody([
    startOf(runId),
    // A streamed block, then a final checkpoint whose own block list is EMPTY. Same part id both
    // times is the whole point: the SDK replaces a part rather than appending a second copy, so the
    // shell cannot erase what streamed.
    {
      type: JAINA_UI_DATA_PART.reportBlock,
      id: `${runId}:block:ad_metrics`,
      data: {
        block_id: 'ad_metrics',
        category: 'metric_grid',
        scope: 'ad',
        title: 'Ad metrics',
        priority: 'primary',
        metrics: [{ label: 'Spend', value: 686.46, unit: 'USD', format: 'currency' }],
      },
    },
    ...reportChunks(runId, {
      language: 'en',
      executive_summary: 'Performance metrics for the ad.',
      reasoning_trace: '',
      blocks: [],
      follow_up_questions: [],
      media_map: {},
      handoff_trace: [],
      execution_objectives: [],
      cached_sources: [],
      _meta: {
        schema_version: '2',
        block_count: 0,
        has_charts: false,
        has_media: false,
        primary_scope: 'ad',
      },
    }),
    { type: 'finish' },
  ]);
}

function scrollStreamChunks(): Promise<string[]> {
  const runId = `run_scroll_${RUN_ID}`;
  // `blockKeyOf` falls back to DEFAULT_BLOCK when a delta carries no (item_id, part_id).
  const textBlock = 'text';
  return sseLines([
    startOf(runId),
    { type: 'text-start', id: textBlock },
    ...Array.from(
      { length: 45 },
      (_, index): UIMessageChunk => ({
        type: 'text-delta',
        id: textBlock,
        delta:
          `\n\n## Analysis section ${index + 1}\n` +
          'Campaign evidence remains grounded in measured delivery. '.repeat(8) +
          `\n\n| Metric | Value |\n| --- | ---: |\n| Section | ${index + 1} |`,
      }),
    ),
    { type: 'text-delta', id: textBlock, delta: '\n\nStreaming response complete.' },
    { type: 'text-end', id: textBlock },
    { type: 'finish' },
  ]);
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

/**
 * The protocol, proved WITHOUT the browser.
 *
 * Deliberately outside the serial describe and touching no page: the rendering assertions below
 * cannot run until `JainaChatSurface` is swapped from the NDJSON reader to `useChat`, and a stub
 * whose correctness is only observable through a surface that cannot read it yet is a stub nobody
 * can trust. This asserts every body this file serves is a well-formed AI SDK UI message stream —
 * chunk shapes via `uiMessageChunkSchema` inside `sseLines`, framing on the bytes here.
 */
test('the stub speaks the AI SDK UI message stream, not NDJSON', async () => {
  const bodies: Record<string, string> = {
    approval: await approvalStreamBody(),
    denial: await denialStreamBody(),
    liveReport: await liveReportStreamBody(),
    finalShell: await finalShellStreamBody(),
    scroll: (await scrollStreamChunks()).join(''),
  };

  const opened: string[] = [];
  for (const [name, body] of Object.entries(bodies)) {
    const events = body.split('\n\n').filter((event) => event.length > 0);
    expect(
      events.every((event) => event.startsWith('data: ')),
      `${name}: every SSE event`,
    ).toBe(true);
    expect(events.at(-1), `${name}: terminator`).toBe('data: [DONE]');
    const first = JSON.parse(events[0]!.slice('data: '.length)) as {
      type: string;
      messageId?: string;
    };
    expect(first.type, `${name}: opening chunk`).toBe('start');
    expect(first.messageId, `${name}: assistant message id`).toMatch(/^jaina:.+:assistant$/);
    opened.push(`${name}=${events.length} events`);
  }

  // The headers the route answers with are the SDK's own constant, so they cannot drift from it.
  expect(UI_MESSAGE_STREAM_HEADERS['content-type']).toBe('text/event-stream');
  expect(UI_MESSAGE_STREAM_HEADERS['x-vercel-ai-ui-message-stream']).toBe('v1');

  // The gate crosses as the SDK's NATIVE chunks. `tool-approval-request` resolves against a tool
  // part of the message CURRENTLY streaming, so the gated call has to be announced first — without
  // it the SDK drops the ENTIRE message, not just the card.
  const approvalChunkTypes = bodies
    .approval!.split('\n\n')
    .filter((event) => event.startsWith('data: ') && event !== 'data: [DONE]')
    .map((event) => (JSON.parse(event.slice('data: '.length)) as { type: string }).type);
  expect(approvalChunkTypes).toEqual([
    'start',
    'tool-input-available',
    'tool-approval-request',
    JAINA_UI_DATA_PART.approval,
    'finish',
  ]);

  grade(
    'stream.sse_protocol',
    true,
    `${opened.join(', ')}; every event is a data: line terminated by [DONE], served as text/event-stream + x-vercel-ai-ui-message-stream: v1`,
  );
});

test.describe.configure({ mode: 'serial' });

test.describe('jaina tool approval card', () => {
  let context: BrowserContext;
  let page: Page;
  const streamPosts: StreamPost[] = [];
  /** The exact bytes this bench put on the wire, so the SSE framing itself can be asserted. */
  const servedBodies: string[] = [];
  const deliveryPosts: Array<{ kind: string; status: string; report_id: string }> = [];
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

    // `**` after the path: `useChat`'s `resume` reconnects with GET …/stream?session_id=…, and a
    // glob anchored at `stream` would let that fall through to the deliberately dead Backend port.
    await context.route('**/api/agents/jaina/chat/stream**', async (route) => {
      // 204 is the "nothing in flight" answer the SDK's reconnect transport expects.
      if (route.request().method() !== 'POST') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

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
      const served = await (body.tool_action
        ? denialStreamBody()
        : body.query === LIVE_PROMPT
          ? liveReportStreamBody()
          : body.query === FINAL_SHELL_PROMPT
            ? finalShellStreamBody()
            : approvalStreamBody());
      servedBodies.push(served);
      await route.fulfill({
        status: 200,
        headers: UI_MESSAGE_STREAM_HEADERS as Record<string, string>,
        body: served,
      });
    });

    await context.route('**/api/agents/jaina/chat/runs/*/delivery', async (route) => {
      deliveryPosts.push(
        (route.request().postDataJSON() ?? {}) as {
          kind: string;
          status: string;
          report_id: string;
        },
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
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

    // What the route actually PUT ON THE WIRE is SSE, not just what the builder can make — the
    // protocol itself is proved independently by `the stub speaks the AI SDK UI message stream`.
    expect(servedBodies[0] ?? '').toMatch(/^data: \{"type":"start"/);
    grade('stream.served_sse', true, 'the fulfilled body opened with an SSE `start` chunk');

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
      (entry) =>
        entry.method !== 'GET' &&
        entry.method !== 'OPTIONS' &&
        // The turns themselves. Since the AI SDK cutover the browser posts them straight to the
        // Backend origin rather than through a Next proxy (AGENTS.md §5); the stub answers them
        // and `streamCalls` below counts them exactly, so excluding them here hides nothing.
        !entry.url.includes('/api/agents/jaina/chat/stream'),
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
    // `requestLog` spans the serial suite, so this test grades only the requests it caused.
    const logStart = requestLog.length;
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

    // Export no longer downloads a file. Since 8697e834 it composes the visible modules into a
    // document in an iframe and hands it to the browser's print engine, which writes a vector
    // PDF — and a print dialog never fires Playwright's `download` event. Headless Chrome returns
    // from print() at once, so capture what was handed to it. The patch sits on the PARENT realm's
    // `contentWindow` getter, which is what the export reads, so it cannot miss a frame the way an
    // init script can miss a scripted about:blank iframe. Byte-level PDF validity is
    // jaina:report:export:e2e:bench's job, not this one's.
    await page.evaluate(() => {
      const host = window as Window & { __jainaPrintedHtml?: string };
      const getter = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        'contentWindow',
      )?.get;
      if (!getter) throw new Error('HTMLIFrameElement.contentWindow has no getter to observe');
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        get(this: HTMLIFrameElement) {
          const frame = getter.call(this) as (Window & { __observed?: boolean }) | null;
          if (frame && !frame.__observed) {
            frame.__observed = true;
            frame.print = () => {
              host.__jainaPrintedHtml = frame.document.documentElement.outerHTML;
            };
          }
          return frame;
        },
      });
    });
    await page.getByRole('button', { name: 'Export report as PDF' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as { __jainaPrintedHtml?: string }).__jainaPrintedHtml ?? ''),
      )
      .toContain('Creative Alpha');
    const printedLength = await page.evaluate(
      () => ((window as { __jainaPrintedHtml?: string }).__jainaPrintedHtml ?? '').length,
    );
    grade(
      'live_report.pdf',
      true,
      `handed the print engine a ${printedLength}-char document carrying the report`,
    );
    await expect.poll(() => deliveryPosts.length).toBe(2);
    expect(deliveryPosts[0]).toEqual({
      kind: 'live_render',
      status: 'success',
      report_id: `run_live_${RUN_ID}:checkpoint_report`,
    });
    expect(deliveryPosts[1]).toEqual({
      kind: 'pdf',
      status: expect.stringMatching(/^(success|fallback)$/),
      report_id: `run_live_${RUN_ID}:checkpoint_report`,
    });
    grade(
      'live_report.delivery',
      true,
      `live render and ${deliveryPosts[1]?.status} PDF acknowledged one run identity`,
    );

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
          !entry.url.includes('/api/agents/jaina/creative-preview') &&
          !entry.url.includes('/delivery') &&
          // The turn itself. Since the AI SDK cutover the browser posts it straight to the Backend
          // origin rather than through a Next proxy (AGENTS.md §5), so it now lands on this origin
          // — still answered by the stub above, never by a Backend. Counted exactly below instead,
          // so this exclusion cannot hide a second, unexpected turn.
          !entry.url.includes('/api/agents/jaina/chat/stream'),
      ),
    ).toHaveLength(0);
    const turnPosts = requestLog
      .slice(logStart)
      .filter(
        (entry) => entry.method === 'POST' && entry.url.includes('/api/agents/jaina/chat/stream'),
      );
    expect(turnPosts).toHaveLength(1);
    grade(
      'live_report.no_provider',
      true,
      '0 Meta/model writes; one stubbed turn, and only preview and delivery acknowledgements besides',
    );
  });

  test('keeps a streamed metric block rendered after an empty final checkpoint shell', async () => {
    await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: 'Message Jaina' });
    await expect(composer).toBeVisible({ timeout: 180_000 });
    await composer.fill(FINAL_SHELL_PROMPT);
    await composer.press('Enter');

    await expect(page.getByRole('button', { name: 'Analysis complete' })).toBeVisible();
    await expect(page.getByText('Ad metrics', { exact: true })).toBeVisible();
    await expect(page.getByText('Spend', { exact: true })).toBeVisible();
    await expect(page.getByText(/686\.46/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Report modules' })).toBeVisible();
    grade(
      'stream.final_shell_retains_blocks',
      true,
      'the completed response kept its metric block',
    );
  });

  test('keeps manual scrolling responsive while a long response streams', async () => {
    const scrollPage = await context.newPage();
    const chunks = await scrollStreamChunks();
    // A page-level fetch stub rather than `context.route`, because this case needs the SSE lines to
    // arrive SPACED OUT: the assertion is about what the viewport does between deltas.
    await scrollPage.addInitScript(
      ({ prompt, streamChunks, headers }) => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const [input, init] = args;
          const url =
            typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
          if (url.includes('/api/agents/jaina/chat/stream')) {
            const method = (
              init?.method ?? (input instanceof Request ? input.method : 'GET')
            ).toUpperCase();
            // `useChat`'s `resume` reconnect. Unanswered it reaches the dead Backend port.
            if (method === 'GET') return new Response(null, { status: 204 });

            if (typeof init?.body === 'string') {
              const body = JSON.parse(init.body) as { query?: string };
              if (body.query === prompt) {
                const encoder = new TextEncoder();
                return new Response(
                  new ReadableStream({
                    start(controller) {
                      let index = 0;
                      const push = () => {
                        const chunk = streamChunks[index];
                        if (chunk === undefined) {
                          controller.close();
                          return;
                        }
                        index += 1;
                        controller.enqueue(encoder.encode(chunk));
                        window.setTimeout(push, 80);
                      };
                      push();
                    },
                  }),
                  { status: 200, headers },
                );
              }
            }
          }
          return originalFetch(...args);
        };
      },
      {
        prompt: SCROLL_PROMPT,
        streamChunks: chunks,
        headers: UI_MESSAGE_STREAM_HEADERS as Record<string, string>,
      },
    );

    try {
      await scrollPage.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
      const composer = scrollPage.getByRole('textbox', { name: 'Message Jaina' });
      await expect(composer).toBeVisible({ timeout: 180_000 });
      await composer.fill(SCROLL_PROMPT);
      await composer.press('Enter');

      const viewport = scrollPage.locator('[data-slot="message-scroller-viewport"]');
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollHeight > node.clientHeight))
        .toBe(true);
      const box = await viewport.boundingBox();
      expect(box).not.toBeNull();
      await scrollPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await scrollPage.mouse.wheel(0, -700);
      await expect
        .poll(() =>
          viewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
        )
        .toBeGreaterThan(100);

      const heldScrollTop = await viewport.evaluate((node) => node.scrollTop);
      await scrollPage.waitForTimeout(640);
      const afterMoreChunks = await viewport.evaluate((node) => node.scrollTop);
      expect(Math.abs(afterMoreChunks - heldScrollTop)).toBeLessThan(24);
      grade('stream.manual_scroll', true, 'wheel input released auto-follow during later deltas');

      await viewport.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect
        .poll(() =>
          viewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
        )
        .toBeLessThan(24);
      await scrollPage.waitForTimeout(480);
      await expect
        .poll(() =>
          viewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
        )
        .toBeLessThan(24);
      grade('stream.follow_resume', true, 'returning to the live edge resumed auto-follow');

      await expect(scrollPage.getByText('Streaming response complete.')).toBeVisible();
      grade('stream.final_visible', true, 'completed streamed response remained visible');
    } finally {
      await scrollPage.close();
    }
  });
});
