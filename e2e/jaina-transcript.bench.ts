/**
 * jaina:transcript:e2e:bench — does the FRONTEND render what the Backend streams?
 *
 * `jaina:uistream:e2e:bench` ends by saying, in its own words, that it does not prove this.
 * Every other Jaina bench either drives the Backend alone, or drives a browser against a
 * STUBBED stream. Nothing took a real Backend turn and proved the Frontend's real consumer
 * produced the right render shapes from it. This does.
 *
 * The chain, all real, nothing mocked:
 *
 *   real Supabase-minted bearer
 *     -> `buildJainaChatStreamRequest` (`src/lib/jaina/chatRequest.ts`) — the one place a turn
 *        becomes `jainaChatRequestSchema`, imported rather than re-stated
 *     -> `DefaultChatTransport` (the class `src/hooks/useJainaChat.ts` constructs, wired the
 *        same way: the body is `body.jainaInput` run through that builder, never assembled here)
 *        POSTs `/api/agents/jaina/chat/stream` with `Accept: text/event-stream`
 *     -> the SDK's own SSE -> `UIMessageChunk` decoder, inside that transport
 *     -> `readUIMessageStream` (the SDK's own chunk -> `UIMessage` reducer, the one
 *        `useChat` runs) -> a real `JainaUIMessage`
 *     -> `toJainaChatMessage` from `src/lib/jaina/uiMessageProjection.ts` — the REAL
 *        projection the transcript renders from
 *     -> assertions on the `JainaChatMessage` fields a reader actually sees.
 *
 * The bench NEVER parses SSE itself and never re-implements a chunk reducer: a bench that
 * re-parses the protocol grades its own copy of it, not the SDK's.
 *
 * It also proves THE GATE INVARIANT the deleted `mergePersistedMessagesWithLocal` /
 * `hasGateState` guard used to hold by hand: a persisted/replayed snapshot must never blank
 * out an in-flight card. Structurally that should now be free — one transcript owner, parts
 * addressed by stable id, replacement instead of a fold — but "should be structural" is not
 * evidence. So the bench takes a real mid-flight snapshot, really reconnects on GET through
 * the transport's own `reconnectToStream`, merges the replay through the SDK reducer with
 * that snapshot as the seed, and asserts nothing the reader could already see disappeared.
 *
 * NOTHING REACHES META WITH A WRITE. The prompt is the greeting `jaina:uistream:e2e:bench`
 * uses; every gated write tool refuses without a recorded human approval regardless, and
 * there is no `'approve'` anywhere in this file.
 *
 * Rows: the bench owns one brand-new session id and deletes exactly the runs, events,
 * messages and sessions carrying them. Ids are captured first and deleted by id — a
 * time-window delete has already destroyed a real user's row in this repo.
 *
 * Run:
 *   cd Continuum-Frontend
 *   bun --no-env-file --env-file=.env e2e/jaina-transcript.bench.ts [--analysis]
 *
 * `--analysis` adds a second, real analysis turn, which takes minutes and reads Meta but never
 * writes to it. A greeting never runs the planner or streams a report, so it cannot show the two
 * things that leaked in the field: the planner's markdown plan printed as the answer, and
 * streamed blocks rendered under the v1 "Checkpoint Blocks" heading. That turn grades every
 * snapshot, because both leaks only showed mid-stream.
 *
 * `--no-env-file --env-file=.env` is not decoration: Bun auto-loads `.env.local`, which on
 * this machine points Supabase at the LOCAL stack while the Backend is on prod — a 403
 * cascade that reads like a code bug. `loadProdSupabaseEnv()` below re-pins it anyway and
 * REFUSES any non-prod project, so the two guards cannot both be forgotten.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import type { JainaChatMessage } from '@/components/paid-media/jaina/types';
// The one place a turn becomes `jainaChatRequestSchema`. Imported, never re-implemented — see
// `makeTransport` below for why a hand-rolled body is the trap this bench exists to catch.
import { buildJainaChatStreamRequest, type JainaChatInput } from '@/lib/jaina/chatRequest';
// THE THING UNDER TEST. Not a copy of it, not a re-derivation: the module the transcript
// imports. If this file stops being what the surface renders from, this bench stops proving
// anything — which is why it is imported by the same specifier the app uses.
import { toJainaChatMessage } from '@/lib/jaina/uiMessageProjection';
import { mintAccessTokenForEmail } from './support/auth';
import { loadProdSupabaseEnv } from './support/prodEnv';

const { serviceRoleKey } = loadProdSupabaseEnv();

/**
 * BENCH_ACCOUNTS.easyfitVivo47 — a real client brand, READ-ONLY by contract.
 *
 * The same identity `jaina:uistream:e2e:bench` drives, for the same reason
 * `jaina:canvas:e2e:bench` gives: the dedicated bench brand has NO linked ad account, so
 * `POST /chat/stream` answers 409 NoLinkedAdAccount before any turn starts. Ids are
 * restated here rather than imported because AGENTS.md §5 forbids a Frontend file importing
 * Backend source (`scripts/_bench/accounts.ts` is where they are canonical).
 */
const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const AD_ACCOUNT_ID = 'act_521903353286118';

/** The greeting `jaina:uistream:e2e:bench` uses. This bench grades RENDER SHAPES, not analysis. */
const PROMPT = 'Reply with a one sentence greeting and nothing else.';

/** The ask from the field report that showed the plan as the reply. */
const ANALYSIS_PROMPT =
  'Find untapped audience opportunities for the current ad account and prioritize concrete tests.';

/** A line only `renderObjectivePlanMarkdown` writes. If a reader can see it, the plan leaked. */
const PLAN_MARKDOWN_SIGNATURE = 'Scope ceiling:';

const BACKEND_PORT = Number(process.env.JAINA_TRANSCRIPT_BENCH_BACKEND_PORT ?? 4423);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const STREAM_API = `${BACKEND_URL}/api/agents/jaina/chat/stream`;

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  serviceRoleKey,
  { auth: { persistSession: false } },
);

/* -- the Recorder envelope -------------------------------------------------------
 *
 * `scripts/factory/bench.mjs` reads the LAST stdout line that parses as JSON and carries
 * `counts`. A bench that exits 0 without one is `unreadable`, not green. The shape is the
 * Backend `_bench` Recorder's; it is mirrored rather than imported for the same §5 reason.
 */
type Grade = 'PASS' | 'FAIL' | 'SKIP';
const graded: { step: string; grade: Grade; detail?: string }[] = [];
const notes: string[] = [];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

function record(step: string, grade: Grade, detail?: string): void {
  const glyph = grade === 'PASS' ? '✓' : grade === 'SKIP' ? '–' : '✗';
  graded.push({ step, grade, ...(detail ? { detail } : {}) });
  console.log(`${glyph} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
}

const check = (step: string, ok: boolean, detail?: string): void =>
  record(step, ok ? 'PASS' : 'FAIL', detail);

/** A hop this run did NOT exercise, by name. Silence reads as full coverage. */
function note(message: string): void {
  notes.push(message);
  console.log(`· ${message}`);
}

function printBenchEnvelope(): number {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  const exitCode = counts.fail > 0 ? 1 : 0;
  console.log(
    `\n${counts.pass} pass, ${counts.skip} skip, ${counts.fail} fail — ` +
      `${exitCode === 0 ? 'BENCH GREEN' : 'BENCH RED'}`,
  );
  console.log(
    JSON.stringify({
      bench: 'jaina:transcript:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode,
    }),
  );
  return exitCode;
}

/* -- the Backend this turn really runs through ----------------------------------- */

let backend: ChildProcess | null = null;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backendIsUp = async (): Promise<boolean> => {
  try {
    return (await fetch(`${BACKEND_URL}/healthz`)).ok;
  } catch {
    return false;
  }
};

/**
 * Spawn a Backend this bench OWNS, and refuse one it did not start.
 *
 * `jaina:canvas:e2e:bench` learned this the expensive way: a Fastify left on the port from
 * hours earlier passed the health probe, so the bench measured a server with someone else's
 * env and someone else's credentials, and the turns it dispatched produced run rows with
 * zero events — which reads as "the model declined" and is nothing of the kind.
 */
async function startBackend(): Promise<void> {
  if (await backendIsUp()) {
    throw new Error(
      `[jaina-transcript-bench] Port ${BACKEND_PORT} already serves /healthz. This bench must ` +
        'own its Backend. Stop that process, or set JAINA_TRANSCRIPT_BENCH_BACKEND_PORT to a ' +
        'free port.',
    );
  }

  backend = spawn('bun', ['--no-env-file', 'scripts/run-backend.ts', '--supabase=production'], {
    cwd: path.resolve(process.cwd(), '../Continuum-Backend'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      HOST: '127.0.0.1',
      // A bench process must not pick up production queue work owned by the deployed Backend.
      MCP_JOB_WORKER_ENABLED: 'false',
      BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group: `run-backend.ts` leaves a listener behind when only its own pid
    // is signalled, and that orphan then holds the port for every later run.
    detached: true,
  });
  backend.stdout?.on('data', (chunk) => process.stdout.write(`[be] ${String(chunk)}`));
  backend.stderr?.on('data', (chunk) => process.stderr.write(`[be] ${String(chunk)}`));

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await backendIsUp()) return;
    if (backend.exitCode !== null) throw new Error('[jaina-transcript-bench] Backend exited early');
    await sleep(1_000);
  }
  throw new Error('[jaina-transcript-bench] Backend never answered /healthz within 120s');
}

async function stopBackend(): Promise<void> {
  const child = backend;
  backend = null;
  if (!child?.pid || child.exitCode !== null) return;
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), signal);
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
}

/* -- the transport, configured as `useJainaChat` configures it -------------------- */

type AnyPart = {
  type: string;
  id?: string;
  text?: string;
  data?: unknown;
  toolCallId?: string;
  toolName?: string;
  state?: string;
};

const partsOf = (message: JainaUIMessage): AnyPart[] => message.parts as unknown as AnyPart[];

/** A part's render identity: its type plus the id the SDK replaces it by. */
const partKey = (part: AnyPart): string => `${part.type}:${part.id ?? part.toolCallId ?? ''}`;

const countOf = (message: JainaUIMessage, type: string): number =>
  partsOf(message).filter((part) => part.type === type).length;

/**
 * The transport, wired exactly as `src/hooks/useJainaChat.ts` wires it.
 *
 * `prepareSendMessagesRequest` does NOT assemble a body: it reads `body.jainaInput` and hands it
 * to `buildJainaChatStreamRequest` — the one place a turn becomes `jainaChatRequestSchema`. A
 * bench that hand-rolled `{ query, context: { adAccountId, brandId, sessionId } }` would keep
 * passing after a real turn silently stopped sending `include_thoughts`, the entity `dataScope`,
 * references, attachments or the plan/scaffold/tool actions. It would be grading its own copy of
 * the request, which is the exact trap this bench exists to catch.
 *
 * `onRequest` is the SDK's own `fetch` middleware hook, used here only to capture what really
 * went on the wire so the assertions below read the POST body rather than a re-derivation of it.
 */
function makeTransport(
  bearer: string,
  onRequest: (body: Record<string, unknown>) => void,
): DefaultChatTransport<JainaUIMessage> {
  return new DefaultChatTransport<JainaUIMessage>({
    api: STREAM_API,
    headers: {
      // Asking for the AI SDK stream is what selects the native wire.
      Accept: 'text/event-stream',
      Authorization: `Bearer ${bearer}`,
    },
    fetch: (input, init) => {
      if (typeof init?.body === 'string') {
        try {
          onRequest(JSON.parse(init.body) as Record<string, unknown>);
        } catch {
          /* a non-JSON body is not this bench's to interpret */
        }
      }
      return fetch(input as string, init);
    },
    prepareSendMessagesRequest: ({ body }) => {
      const input = (body as { jainaInput?: JainaChatInput } | undefined)?.jainaInput;
      if (!input) throw new Error('Jaina turn dispatched without a request input.');
      return { body: buildJainaChatStreamRequest(input) };
    },
    // Jaina resumes on the same path with the session as a query parameter, and answers 204
    // when nothing is in flight.
    prepareReconnectToStreamRequest: ({ id }) => ({
      api: `${STREAM_API}?session_id=${encodeURIComponent(id)}`,
    }),
  });
}

/* -- projected-field grading ------------------------------------------------------
 *
 * `toJainaChatMessage` is being grown from 6 fields to the full `JainaChatMessage` in a
 * parallel workstream. Asserting on a field nobody fills yet would pass silently and prove
 * nothing, so each field is graded three ways:
 *
 *   evidence absent          -> SKIP, naming the part type this turn never produced
 *   evidence present, unset  -> SKIP, naming the FIELD as a projection gap
 *   evidence present, set    -> a real PASS/FAIL against the parts it came from
 *
 * The middle case is the point: it turns into a real assertion the moment the field lands,
 * with no edit here, and until then it is a gap printed by name rather than a green tick.
 */
function gradeProjectedField(options: {
  field: keyof JainaChatMessage;
  evidence: string;
  evidenceCount: number;
  projected: unknown;
  expectation?: { ok: boolean; detail: string };
}): void {
  const { field, evidence, evidenceCount, projected, expectation } = options;
  const step = `toJainaChatMessage fills \`${String(field)}\` from ${evidence}`;

  if (evidenceCount === 0) {
    record(step, 'SKIP', `this turn produced no ${evidence} part — nothing to project`);
    return;
  }

  const empty =
    projected === undefined ||
    projected === null ||
    (Array.isArray(projected) && projected.length === 0) ||
    (typeof projected === 'object' && Object.keys(projected as object).length === 0);

  if (empty) {
    record(
      step,
      'SKIP',
      `PROJECTION GAP: ${evidenceCount} ${evidence} part(s) arrived and reached the SDK message, ` +
        `but \`${String(field)}\` is empty on the rendered JainaChatMessage`,
    );
    return;
  }

  check(
    step,
    expectation?.ok ?? true,
    expectation?.detail ?? `${evidenceCount} ${evidence} part(s)`,
  );
}

/* -- cleanup ---------------------------------------------------------------------- */

async function cleanup(sessionIds: string[]): Promise<void> {
  const jaina = () => admin.schema('jaina');
  const { data: runs } = await jaina()
    .from('jaina_conversation_runs')
    .select('run_id')
    .in('session_id', sessionIds);
  const runIds = (runs ?? []).map((row) => (row as { run_id: string }).run_id);

  if (runIds.length > 0) {
    await jaina().from('jaina_conversation_run_events').delete().in('run_id', runIds);
    await jaina().from('jaina_conversation_runs').delete().in('run_id', runIds);
  }
  await jaina().from('jaina_conversation_messages').delete().in('session_id', sessionIds);
  await jaina().from('jaina_conversation_sessions').delete().in('session_id', sessionIds);
}

/* -- the run ---------------------------------------------------------------------- */

async function main(): Promise<void> {
  const sessionId = `bench_jaina_transcript_${randomUUID().replace(/-/g, '')}`;
  const sessions = [sessionId];

  await startBackend();

  try {
    const bearer = await mintAccessTokenForEmail(OWNER_EMAIL);
    let sentBody: Record<string, unknown> | null = null;
    const transport = makeTransport(bearer, (body) => {
      sentBody ??= body;
    });

    // What the composer hands over for one turn — the same `JainaChatInput` `sendTurn` passes.
    const turnInput: JainaChatInput = {
      query: PROMPT,
      adAccountId: AD_ACCOUNT_ID,
      brandId: BRAND_ID,
      sessionId,
    };

    const userMessage = {
      id: `${sessionId}:user`,
      role: 'user',
      parts: [{ type: 'text', text: PROMPT }],
    } as unknown as JainaUIMessage;

    // ---- 1. A REAL TURN, THROUGH THE REAL CONSUMER ---------------------------------
    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: sessionId,
      messageId: undefined,
      messages: [userMessage],
      abortSignal: undefined,
      body: { jainaInput: turnInput },
    });

    let live: JainaUIMessage | undefined;
    let snapshots = 0;
    // A mid-flight copy of exactly what the reader could already see, captured as soon as
    // the transcript has domain content in it. This is the seed for the gate invariant.
    let midFlight: JainaUIMessage | undefined;
    let mergeTask: Promise<JainaUIMessage | null> | null = null;
    let resumeError: unknown = null;

    for await (const message of readUIMessageStream<JainaUIMessage>({ stream })) {
      live = message;
      snapshots += 1;
      if (!midFlight && partsOf(message).some((part) => part.type.startsWith('data-'))) {
        midFlight = structuredClone(message);
        // Fired here and awaited after the live stream drains. The reconnect has to land
        // while the run is genuinely in flight, and abandoning the live iterator mid-turn
        // makes the SDK close a controller twice.
        mergeTask = resumeAndMerge(transport, sessionId, midFlight).catch((error) => {
          resumeError = error;
          return null;
        });
      }
    }

    if (!live) {
      check('the real turn produced a UI message', false, 'the SDK reader yielded nothing');
      return;
    }
    const finalMessage: JainaUIMessage = live;
    const parts = partsOf(finalMessage);

    // What actually went on the wire, read off the POST body the SDK sent — not re-derived. The
    // failure this catches is a turn that quietly does less: a body missing `include_thoughts`
    // still answers, still renders, and is simply a smaller, plausible answer.
    const sentContext = (sentBody?.context ?? {}) as Record<string, unknown>;
    check(
      'the turn goes out through buildJainaChatStreamRequest, not a body the caller narrowed',
      sentBody !== null &&
        sentBody.include_thoughts === true &&
        sentContext.brandId === BRAND_ID &&
        sentContext.adAccountId === AD_ACCOUNT_ID &&
        sentContext.sessionId === sessionId &&
        typeof sentContext.timezone === 'string',
      sentBody
        ? `POST keys: ${JSON.stringify(Object.keys(sentBody))}; context keys: ${JSON.stringify(Object.keys(sentContext))}`
        : 'no request body was captured',
    );
    // `prepareSendMessagesRequest` must REPLACE the body, not merge into the SDK's own
    // `{ id, messages, trigger }`. A merged body reaches the route with fields
    // `jainaChatRequestSchema` never declared, and Fastify's validator drops them silently.
    check(
      'the builder’s output is the whole POST body — the SDK adds nothing to it',
      JSON.stringify(sentBody) === JSON.stringify(buildJainaChatStreamRequest(turnInput)),
      `wire keys: ${JSON.stringify(Object.keys(sentBody ?? {}))}`,
    );

    check(
      'a real SSE turn reaches the SDK reader as an incrementally built UI message',
      snapshots > 1 && parts.length > 0,
      `${snapshots} message snapshots, ${parts.length} final parts: ` +
        `${JSON.stringify([...new Set(parts.map((part) => part.type))])}`,
    );
    check(
      'the assistant message carries the run-stable id the Backend opened with',
      finalMessage.role === 'assistant' && String(finalMessage.id).startsWith('jaina:'),
      `${finalMessage.role} ${finalMessage.id}`,
    );

    // ---- 2. THE RENDER SHAPES ------------------------------------------------------
    const rendered = toJainaChatMessage(finalMessage, { isStreaming: false });

    // Ground truth is read off the raw parts, never off the projection's own helpers —
    // comparing `content` to `textOf()` would be the projection grading itself.
    const textParts = parts.filter((part) => part.type === 'text');
    const concatenated = textParts.map((part) => part.text ?? '').join('');

    check(
      'the reader is shown a non-empty answer',
      rendered.content.trim().length > 0,
      `${rendered.content.length} chars: ${JSON.stringify(rendered.content.slice(0, 120))}`,
    );
    check(
      'the answer is exactly the concatenation of the turn’s text parts, in order',
      rendered.content === concatenated,
      `${textParts.length} text part(s), ${concatenated.length} chars concatenated`,
    );
    check(
      'the rendered message keeps the SDK message identity and role',
      rendered.id === finalMessage.id && rendered.role === 'assistant',
      `${rendered.role} ${rendered.id}`,
    );
    // `status` has two sources and a declared precedence: the Backend's own terminal verdict on
    // `message.metadata.status` wins, and `isStreaming` is only the fallback when the run has not
    // stated one. Asserting "isStreaming always wins" would be asserting the wrong contract — the
    // whole point of the metadata is that a finished run stays finished however the caller asks.
    const metadataStatus = (finalMessage.metadata as { status?: string } | undefined)?.status;
    const streamingView = toJainaChatMessage(finalMessage, { isStreaming: true }).status;
    check(
      metadataStatus
        ? 'the run’s own terminal verdict decides the rendered status, not the caller'
        : 'with no terminal verdict on the wire, the rendered status follows isStreaming',
      metadataStatus
        ? rendered.status === (metadataStatus === 'failed' ? 'error' : 'done') &&
            streamingView === rendered.status
        : rendered.status === 'done' && streamingView === 'streaming',
      `metadata.status=${String(metadataStatus)}; isStreaming=false -> ${rendered.status}, ` +
        `isStreaming=true -> ${streamingView}`,
    );

    const blockCount = countOf(finalMessage, JAINA_UI_DATA_PART.reportBlock);
    const metaCount = countOf(finalMessage, JAINA_UI_DATA_PART.reportMeta);
    const renderedBlocks = (rendered.reportV2 as { blocks?: unknown[] } | undefined)?.blocks ?? [];
    gradeProjectedField({
      field: 'reportV2',
      evidence: JAINA_UI_DATA_PART.reportBlock,
      evidenceCount: blockCount + metaCount,
      projected: rendered.reportV2,
      expectation: {
        ok: renderedBlocks.length === blockCount,
        detail: `${blockCount} report-block part(s) + ${metaCount} meta -> ${renderedBlocks.length} rendered block(s)`,
      },
    });

    const objectiveCount = countOf(finalMessage, JAINA_UI_DATA_PART.objective);
    gradeProjectedField({
      field: 'objectives',
      evidence: JAINA_UI_DATA_PART.objective,
      evidenceCount: objectiveCount,
      projected: rendered.objectives,
      expectation: {
        ok: (rendered.objectives ?? []).length === objectiveCount,
        detail: `${objectiveCount} objective part(s) -> ${(rendered.objectives ?? []).length} rendered`,
      },
    });

    const toolParts = parts.filter(
      (part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
    );
    gradeProjectedField({
      field: 'toolCalls',
      evidence: 'dynamic-tool',
      evidenceCount: toolParts.length,
      projected: rendered.toolCalls,
      expectation: {
        ok: (rendered.toolCalls ?? []).length === toolParts.length,
        detail: `${toolParts.length} tool part(s) -> ${(rendered.toolCalls ?? []).length} tool row(s)`,
      },
    });
    gradeProjectedField({
      field: 'toolResults',
      evidence: 'dynamic-tool (output-available)',
      evidenceCount: toolParts.filter((part) => part.state === 'output-available').length,
      projected: rendered.toolResults,
    });

    const delegationCount = countOf(finalMessage, JAINA_UI_DATA_PART.delegation);
    gradeProjectedField({
      field: 'delegations',
      evidence: JAINA_UI_DATA_PART.delegation,
      evidenceCount: delegationCount,
      projected: rendered.delegations,
      expectation: {
        ok: (rendered.delegations ?? []).length === delegationCount,
        detail: `${delegationCount} delegation part(s) -> ${(rendered.delegations ?? []).length} rendered`,
      },
    });

    gradeProjectedField({
      field: 'reasoning',
      evidence: 'reasoning',
      evidenceCount: parts.filter((part) => part.type === 'reasoning').length,
      projected: rendered.reasoning,
    });
    gradeProjectedField({
      field: 'scaffold',
      evidence: JAINA_UI_DATA_PART.scaffold,
      evidenceCount: countOf(finalMessage, JAINA_UI_DATA_PART.scaffold),
      projected: rendered.scaffold,
    });
    gradeProjectedField({
      field: 'artifacts',
      evidence: JAINA_UI_DATA_PART.artifact,
      evidenceCount: countOf(finalMessage, JAINA_UI_DATA_PART.artifact),
      projected: rendered.artifacts,
    });
    gradeProjectedField({
      field: 'paidCreativeRenders',
      evidence: JAINA_UI_DATA_PART.creativeRender,
      evidenceCount: countOf(finalMessage, JAINA_UI_DATA_PART.creativeRender),
      projected: rendered.paidCreativeRenders,
    });
    gradeProjectedField({
      field: 'pendingClarification',
      evidence: JAINA_UI_DATA_PART.clarification,
      evidenceCount: countOf(finalMessage, JAINA_UI_DATA_PART.clarification),
      projected: rendered.pendingClarification,
    });
    gradeProjectedField({
      field: 'reportAssembly',
      evidence: JAINA_UI_DATA_PART.reportAssembly,
      evidenceCount: countOf(finalMessage, JAINA_UI_DATA_PART.reportAssembly),
      projected: rendered.reportAssembly,
    });
    gradeProjectedField({
      field: 'pendingToolApprovals',
      evidence: `${JAINA_UI_DATA_PART.approval} / tool state approval-requested`,
      evidenceCount:
        countOf(finalMessage, JAINA_UI_DATA_PART.approval) +
        toolParts.filter((part) => part.state === 'approval-requested').length,
      projected: rendered.pendingToolApprovals,
    });
    gradeProjectedField({
      field: 'resolvedApprovals',
      evidence: 'tool state approval-responded',
      evidenceCount: toolParts.filter((part) => part.state === 'approval-responded').length,
      projected: rendered.resolvedApprovals,
    });

    // `runId` / `status` come from `message.metadata`, which the Backend declares
    // (`JainaUIMessageMetadata`) but does not yet emit — so the field is graded against the
    // metadata actually on the wire rather than assumed.
    const metadata = (finalMessage.metadata ?? {}) as Record<string, unknown>;
    gradeProjectedField({
      field: 'runId',
      evidence: 'message metadata',
      evidenceCount: Object.keys(metadata).length,
      projected: rendered.runId,
      expectation: {
        ok: rendered.runId === metadata.runId,
        detail: `metadata.runId=${String(metadata.runId)} -> rendered.runId=${String(rendered.runId)}`,
      },
    });
    if (Object.keys(metadata).length === 0) {
      note(
        'UN-EXERCISED: message metadata. The Backend emits no `messageMetadata`, so ' +
          '`message.metadata` is undefined on the wire and `toJainaChatMessage` can never fill ' +
          '`runId` or the run `status` from it. The run id is recoverable ONLY from the message ' +
          `id (${finalMessage.id}). This is the declared-but-never-emitted gap, not a projection bug.`,
      );
    }

    // ---- 3. THE GATE INVARIANT -----------------------------------------------------
    const merged = mergeTask ? await mergeTask : null;

    if (!midFlight) {
      record(
        'a replayed snapshot never blanks out what the reader could already see',
        'SKIP',
        'no mid-flight snapshot was captured — the turn finished before any data part arrived',
      );
    } else if (resumeError) {
      check(
        'a replayed snapshot never blanks out what the reader could already see',
        false,
        `the GET resume threw: ${resumeError instanceof Error ? resumeError.message : String(resumeError)}`,
      );
    } else if (!merged) {
      record(
        'a replayed snapshot never blanks out what the reader could already see',
        'SKIP',
        'GET resume answered 204 (nothing in flight) — the run finished before the reconnect ' +
          'landed, so the merge was never exercised',
      );
    } else {
      const before = partsOf(midFlight).map(partKey);
      const after = new Set(partsOf(merged).map(partKey));
      const lost = before.filter((key) => !after.has(key));

      check(
        'a replayed snapshot never blanks out what the reader could already see',
        lost.length === 0,
        lost.length === 0
          ? `${before.length} live part(s) survived the replay merge; the merged message carries ` +
              `${after.size}`
          : `LOST ${lost.length}: ${lost.slice(0, 5).join(', ')}`,
      );

      // The same claim in render terms: the invariant is about what a reader sees, and a part
      // surviving the reducer while the projection drops it would still be a blanked card.
      const renderedBefore = toJainaChatMessage(midFlight, { isStreaming: true });
      const renderedAfter = toJainaChatMessage(merged, { isStreaming: true });
      const blocksOf = (message: JainaChatMessage) =>
        ((message.reportV2 as { blocks?: unknown[] } | undefined)?.blocks ?? []).length;

      check(
        'the replayed transcript is a superset of the live one, field for field',
        renderedAfter.content.length >= renderedBefore.content.length &&
          (renderedAfter.objectives ?? []).length >= (renderedBefore.objectives ?? []).length &&
          blocksOf(renderedAfter) >= blocksOf(renderedBefore) &&
          renderedAfter.id === renderedBefore.id,
        `answer ${renderedBefore.content.length}->${renderedAfter.content.length} chars, ` +
          `objectives ${(renderedBefore.objectives ?? []).length}->${(renderedAfter.objectives ?? []).length}, ` +
          `report blocks ${blocksOf(renderedBefore)}->${blocksOf(renderedAfter)}`,
      );

      const gateKinds = partsOf(midFlight).filter(
        (part) =>
          part.type === JAINA_UI_DATA_PART.approval ||
          part.type === JAINA_UI_DATA_PART.gate ||
          part.state === 'approval-requested',
      );
      record(
        'an IN-FLIGHT APPROVAL CARD specifically survives the replay merge',
        gateKinds.length > 0 ? 'PASS' : 'SKIP',
        gateKinds.length > 0
          ? `${gateKinds.length} gate part(s) in the snapshot, all present after the merge`
          : 'this turn never reached the approval gate, so no gate part existed to preserve — ' +
              'the invariant above is proven over every OTHER part kind this turn produced',
      );
    }

    note(
      `TURN COVERAGE: ${parts.length} parts of ${new Set(parts.map((p) => p.type)).size} kind(s) ` +
        `(${[...new Set(parts.map((p) => p.type))].join(', ')}). A single greeting turn is a LOWER ` +
        'BOUND, not coverage: every part kind it did not produce is a SKIP above, named.',
    );
    note(
      'UN-EXERCISED: `useJainaChat` / `useChat` themselves. `useJainaChat` is a React hook and ' +
        'cannot be called headlessly, so this bench constructs `DefaultChatTransport` with the ' +
        'same api/Accept/prepareSendMessagesRequest/prepareReconnectToStreamRequest wiring. The ' +
        'request builder, the SDK classes, the SSE decode, the chunk reducer and the projection ' +
        'are all the real ones; what is NOT covered is the hook’s useMemo/useCallback shell, ' +
        'its `sendTurn` displayText/silent handling, its per-request `getBrowserAccessToken()` ' +
        'bearer, and its onError -> onDispatchError path.',
    );
    note(
      'UN-EXERCISED: `silent` user messages (`JainaUIMessageMetadata.silent`). A verdict-only turn ' +
        'must be sent but never rendered; that filter lives on the surface, not in ' +
        '`toJainaChatMessage`, and this bench grades the assistant message only.',
    );
    note(
      'UN-EXERCISED: the browser. No React render, no `JainaMessageItem`, no DOM. This proves the ' +
        'projection produces the right JainaChatMessage; that the components render it is ' +
        'jaina:approval:card:e2e:bench and jaina:canvas:e2e:bench.',
    );
    note(
      'UN-EXERCISED: the approval gate end to end. Reaching a real gate means a gated write tool ' +
        'against a live ad account; this bench deliberately never approves anything. The gate ' +
        'invariant is therefore proven structurally over the parts this turn did produce.',
    );
    note(
      'UN-EXERCISED: persisted history. This bench reads the LIVE turn and its GET resume only. ' +
        'Whether `GET /chat/conversations/:id/messages` returns part-for-part identical UI ' +
        'messages is jaina:history:e2e:bench.',
    );

    if (process.argv.includes('--analysis')) {
      const analysisSessionId = `bench_jaina_transcript_${randomUUID().replace(/-/g, '')}`;
      sessions.push(analysisSessionId);
      await analysisTurn(transport, analysisSessionId);
    } else {
      note(
        'UN-EXERCISED: an analysis turn — the planner, its plan part and blocks streamed ahead of ' +
          'the final report. Run with --analysis.',
      );
    }
  } finally {
    await cleanup(sessions).catch((error) =>
      console.error('[jaina-transcript-bench] cleanup failed:', error),
    );
    await stopBackend();
  }
}

/**
 * One real analysis turn, projected at EVERY snapshot the SDK reader yields. The final message alone
 * cannot show either leak: the plan text is displaced once the answer lands, and the v1 report is
 * replaced once the final report's meta arrives.
 */
async function analysisTurn(
  transport: DefaultChatTransport<JainaUIMessage>,
  sessionId: string,
): Promise<void> {
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: sessionId,
    messageId: undefined,
    messages: [
      {
        id: `${sessionId}:user`,
        role: 'user',
        parts: [{ type: 'text', text: ANALYSIS_PROMPT }],
      } as unknown as JainaUIMessage,
    ],
    abortSignal: undefined,
    body: {
      jainaInput: {
        query: ANALYSIS_PROMPT,
        adAccountId: AD_ACCOUNT_ID,
        brandId: BRAND_ID,
        sessionId,
      } satisfies JainaChatInput,
    },
  });

  let last: JainaUIMessage | undefined;
  let snapshots = 0;
  const planVisibleAt: number[] = [];
  let blocksAheadOfReport = 0;
  const v1ReportAt: number[] = [];

  for await (const message of readUIMessageStream<JainaUIMessage>({ stream })) {
    last = message;
    snapshots += 1;
    const view = toJainaChatMessage(message, { isStreaming: true });
    const visible = [view.content, ...(view.reasoning ?? []).map((entry) => entry.detail ?? '')];
    if (visible.some((value) => value.includes(PLAN_MARKDOWN_SIGNATURE))) {
      planVisibleAt.push(snapshots);
    }
    if (
      countOf(message, JAINA_UI_DATA_PART.reportBlock) > 0 &&
      countOf(message, JAINA_UI_DATA_PART.reportMeta) === 0
    ) {
      blocksAheadOfReport += 1;
      if (view.report !== undefined || view.reportV2 === undefined) v1ReportAt.push(snapshots);
    }
  }

  if (!last) {
    check('the analysis turn produced a UI message', false, 'the SDK reader yielded nothing');
    return;
  }
  const rendered = toJainaChatMessage(last, { isStreaming: false });

  check(
    'the planner’s markdown plan is never shown as the answer or a thought, at any snapshot',
    planVisibleAt.length === 0,
    planVisibleAt.length === 0
      ? `${snapshots} snapshots graded`
      : `visible at ${planVisibleAt.length}/${snapshots} snapshots, first #${planVisibleAt[0]}`,
  );

  if (blocksAheadOfReport === 0) {
    record(
      'blocks streamed ahead of the final report render as V2, never the v1 "Checkpoint Blocks"',
      'SKIP',
      'no report block streamed before the final report this turn',
    );
  } else {
    check(
      'blocks streamed ahead of the final report render as V2, never the v1 "Checkpoint Blocks"',
      v1ReportAt.length === 0,
      v1ReportAt.length === 0
        ? `${blocksAheadOfReport} pre-report snapshot(s), all V2`
        : `v1 at ${v1ReportAt.length}/${blocksAheadOfReport}, first #${v1ReportAt[0]}`,
    );
  }

  const planParts = countOf(last, JAINA_UI_DATA_PART.plan);
  if (planParts === 0) {
    record(
      'the planner’s plan arrives as a part and names the turn',
      'SKIP',
      'no data-jaina-plan part: the planner did not run (quick path) this turn',
    );
  } else {
    check(
      'the planner’s plan arrives as a part and names the turn',
      planParts === 1 && Boolean(rendered.plan?.title.trim()),
      `${planParts} plan part(s); title ${JSON.stringify(rendered.plan?.title)}`,
    );
  }

  check(
    'the analysis turn ends with a non-empty answer',
    rendered.content.trim().length > 0,
    `${rendered.content.length} chars; reportV2 ${rendered.reportV2 ? 'set' : 'absent'}`,
  );
}

/**
 * The real reconnect: GET the same path with `?session_id=`, through the transport's own
 * `reconnectToStream`, and fold the replay into the snapshot with the SDK's reducer. This is
 * exactly what `useChat({ resume: true })` does on mount after a reload.
 */
async function resumeAndMerge(
  transport: DefaultChatTransport<JainaUIMessage>,
  sessionId: string,
  seed: JainaUIMessage,
): Promise<JainaUIMessage | null> {
  const replay = await transport.reconnectToStream({
    chatId: sessionId,
    metadata: undefined,
    headers: undefined,
    body: undefined,
  } as Parameters<DefaultChatTransport<JainaUIMessage>['reconnectToStream']>[0]);
  if (!replay) return null;

  let merged: JainaUIMessage | undefined;
  for await (const message of readUIMessageStream<JainaUIMessage>({
    message: seed,
    stream: replay,
  })) {
    merged = message;
  }
  return merged ?? null;
}

main()
  .then(() => process.exit(printBenchEnvelope()))
  .catch((error) => {
    console.error(error);
    record('bench run', 'FAIL', error instanceof Error ? error.message : String(error));
    void stopBackend().finally(() => process.exit(printBenchEnvelope() || 1));
  });
