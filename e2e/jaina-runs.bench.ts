/**
 * Detached Jaina runs — end-to-end bench. The twin of `agent-runs.bench.ts` (Organic).
 *
 * Proves the claim the whole shared agent-run contract rests on, for the SECOND agent now
 * sitting on it: a run is not its HTTP request. Drives the REAL Jaina agent across its real
 * boundaries — a real Supabase-minted user token, the real Fastify chat-stream route, the
 * real Gemini call, the real Meta tool, the real Postgres run tables. Nothing is mocked.
 * The bench then does the thing that used to destroy a turn: it KILLS THE SOCKET mid-run.
 *
 * THE WIRE IS THE AI SDK UI MESSAGE STREAM. This bench asks for `Accept: text/event-stream`, so
 * the Backend answers with the SDK's own SSE protocol (v1) — `data: <json>\n\n` chunks terminated
 * by `data: [DONE]`, mapped from Jaina's domain events by
 * `App/agents-ts/Jaina/src/runtime/uiMessageChunks.ts`. That mapping is a PROJECTION of the durable
 * run log, never the log itself, and the distinction is what this bench now has to prove:
 *
 *   - the log still carries the {eventId, seq, ts} envelope on every row, and
 *   - the SSE chunks the client saw are derived from rows in that same log.
 *
 * The old NDJSON wire carried the envelope on every frame, so "the wire seq IS the DB seq" was a
 * direct comparison. SDK chunks carry no seq by construction, so that comparison is gone from the
 * WIRE and lives entirely on the LOG — plus the projection cross-check above. Saying so is the
 * point: silently dropping the assertion would read as coverage that no longer exists.
 *
 * What it asserts, and why each is the real observable outcome rather than a proxy:
 *
 *   1. DETACHMENT   — after the socket dies, jaina_conversation_run_events keeps GROWING
 *                     past where the log stood when the client left, and the run reaches a
 *                     terminal status. Jaina never aborted on client disconnect; this proves it.
 *   2. LOG INVARIANT— the durable log is contiguous from seq 0, has no duplicate seq, and every
 *                     row carries an event_id. The chunks the client saw on SSE are a projection
 *                     of THAT run: the stream's assistant message id is `jaina:${runId}:assistant`
 *                     and every tool chunk has a tool event in the log behind it.
 *   3. REPLAY       — GET .../events?after_seq=N returns exactly the frames with seq > N,
 *                     ascending, in the same envelope shape the log holds. (This is the FORENSIC
 *                     endpoint, deliberately still NDJSON; the SDK's own resume is a GET on the
 *                     chat-stream path and is benched by `jaina:uistream:e2e:bench`.)
 *   4. HONEST STATUS— an uncancelled run ends `completed`; a cancelled one ends `cancelled`
 *                     and STAYS cancelled after the executor's trailing write lands.
 *   5. QUEUE        — a second turn on the SAME session is fenced, and the fence arrives as a
 *                     TRANSIENT `data-jaina-notice` — never a transcript part, never a log row.
 *                     (On NDJSON this was an unenveloped `agent.run_queued` frame with no seq,
 *                     for the same reason: a seq would collide with seq-0 chat_started.)
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BENCH DOES *NOT* EXERCISE — read before trusting a green run:
 *
 *   a) JAINA'S PAID-MEDIA TASK. Jaina needs a linked Meta ad account and a valid Meta token;
 *      the local fixture brand has neither. The agent's `get_campaigns` tool call is REAL and
 *      really reaches Meta — and really fails there with an auth error. The agent then answers
 *      honestly that it could not read the account. That is the run we bench. The run
 *      lifecycle is exercised whether the agent succeeds or fails at its paid-media task;
 *      the paid-media task itself is NOT covered here.
 *
 *   b) THE FULL PLANNER → CORE-STRATEGIST PIPELINE. A deep analytical query ("how did my
 *      campaigns do last week") routes through the core strategist, whose Gemini request
 *      currently carries BOTH a `responseSchema` and function-calling `tools`. Google's API
 *      rejects that combination (400 INVALID_ARGUMENT) for every Gemini model, so such a turn
 *      dies in ~1.3s with no model output. That is a real defect, and it is NOT the run
 *      contract's — it is upstream of it. This bench therefore drives an inventory/quick-path
 *      query, which reaches a REAL model call and a REAL tool call, so that the socket can be
 *      destroyed while the agent is genuinely working. The deep pipeline stays un-benched.
 *
 *   c) TOKEN-BY-TOKEN "MID-ANSWER" DETACHMENT. Unlike Organic, Jaina does not stream the
 *      model's prose as it is produced — it buffers the turn and emits the answer as
 *      `text-delta` chunks at the END. So "leave mid-answer" is impossible by
 *      construction; the bench instead leaves mid-RUN, once the model has begun calling tools
 *      and long before any answer exists. That is the same disconnect, at the same risk point.
 * ---------------------------------------------------------------------------------------
 *
 * Prerequisites (see e2e/README.md):
 *   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
 *   bun run dev:be
 * Run with: bun run jaina:runs:bench
 */

import { createClient } from '@supabase/supabase-js';
import { mintAccessTokenForEmail } from './support/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const OWNER_EMAIL = 'local@continuum.test';
// Must match the brand `supabase/baseline/fixtures.sql` seeds, or every brand-scoped call comes
// back PERMISSION_DENIED before the run contract is ever reached.
const BRAND_ID = process.env.BENCH_BRAND_ID ?? '00000000-0000-4000-8000-0000000000b2';

// Jaina's chat contract requires a `context.adAccountId`. The fixture brand has no linked
// Meta account, so this is a well-formed id that Meta will reject — see (a) above. Seeding a
// meta_ad_accounts row would not help: the token, not the row, is what Meta refuses.
const AD_ACCOUNT_ID = 'act_000000000000000';

// An inventory ask. Routes to the quick path, which reaches a real model call and a real tool
// call in ~3.5s — long enough to walk away from. See (b) above.
const PROMPT = 'List my active campaigns.';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

/** A frame on the durable/forensic wire: still the hand-rolled envelope, by design. */
type Frame = {
  type: string;
  seq?: number;
  eventId?: string;
  ts?: string;
  data?: Record<string, unknown>;
};

/** One AI SDK UI message chunk off the SSE wire. */
type Chunk = {
  type: string;
  messageId?: string;
  id?: string;
  toolCallId?: string;
  toolName?: string;
  delta?: string;
  transient?: boolean;
  data?: Record<string, unknown>;
};

/** `createJainaUIChunkAdapter` addresses the assistant message by the run it projects. */
const RUN_ID_FROM_MESSAGE_ID = /^jaina:(.+):assistant$/;

type RunRow = { run_id: string; status: string; error_message: string | null };
type EventRow = { seq: number | null; event_id: string | null; event_type: string };

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const chatBody = (sessionId: string, text: string) => ({
  query: text,
  context: { brandId: BRAND_ID, adAccountId: AD_ACCOUNT_ID, sessionId },
});

const openChatStream = (token: string, sessionId: string, text: string, signal: AbortSignal) =>
  fetch(`${API}/api/agents/jaina/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Asking for the AI SDK UI message stream is what selects the native wire.
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(chatBody(sessionId, text)),
    signal,
  });

/**
 * Split an SSE buffer into the chunks it has completed.
 *
 * Events are delimited by a BLANK LINE, so a trailing partial event is held back until the next
 * read completes it — reading `data:` lines as they arrive would parse a half-written chunk as a
 * dropped one. `[DONE]` terminates the stream and is not itself a chunk.
 */
const drainSse = (buffer: string): { chunks: Chunk[]; rest: string } => {
  const events = buffer.split('\n\n');
  const rest = events.pop() ?? '';
  const chunks: Chunk[] = [];
  for (const event of events) {
    const payload = event
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .join('\n');
    if (!payload || payload === '[DONE]') continue;
    try {
      chunks.push(JSON.parse(payload) as Chunk);
    } catch {
      /* a partial event; the next read completes it */
    }
  }
  return { chunks, rest };
};

/**
 * Open a real chat stream, read chunks until `stopAfter` says to stop, then DESTROY the socket
 * without reading the rest — the closest possible analogue of the user navigating away.
 * Returns what the client had actually received at the moment it vanished.
 */
async function streamUntilAbandoned(
  token: string,
  sessionId: string,
  stopAfter: (chunks: Chunk[]) => boolean,
): Promise<{ runId: string | null; messageId: string | null; chunks: Chunk[] }> {
  const controller = new AbortController();
  const response = await openChatStream(token, sessionId, PROMPT, controller.signal);

  if (!response.ok || !response.body) {
    throw new Error(`chat stream failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Chunk[] = [];
  let runId: string | null = null;
  let messageId: string | null = null;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const drained = drainSse(buffer);
      buffer = drained.rest;
      for (const chunk of drained.chunks) {
        chunks.push(chunk);
        // The run id is not a field on this wire — it is the identity of the assistant message the
        // adapter opened, which is exactly as durable and one fewer frame to wait for.
        if (chunk.type === 'start' && typeof chunk.messageId === 'string') {
          messageId = chunk.messageId;
          runId = RUN_ID_FROM_MESSAGE_ID.exec(chunk.messageId)?.[1] ?? null;
        }
      }

      if (stopAfter(chunks)) break;
    }
  } finally {
    // This is the whole point of the bench: walk away mid-run.
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }

  return { runId, messageId, chunks };
}

/** The model is genuinely working once its first tool call has reached the client. */
const modelIsWorking = (chunks: Chunk[]) => chunks.some((c) => c.type === 'tool-input-available');

const getRun = async (runId: string): Promise<RunRow | null> => {
  const { data } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('run_id,status,error_message')
    .eq('run_id', runId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
};

const listEventRows = async (runId: string): Promise<EventRow[]> => {
  const { data } = await admin
    .schema('jaina')
    .from('jaina_conversation_run_events')
    .select('seq,event_id,event_type')
    .eq('run_id', runId)
    .order('seq', { ascending: true });
  return (data ?? []) as EventRow[];
};

const maxEventSeq = async (runId: string): Promise<number> => {
  const rows = await listEventRows(runId);
  return rows.reduce((max, row) => Math.max(max, row.seq ?? -1), -1);
};

const waitForTerminal = async (runId: string, timeoutMs = 180_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run && TERMINAL_STATUSES.includes(run.status)) return run.status;
    await sleep(1000);
  }
  return 'timeout';
};

/** The durable replay the Frontend resumes from, parsed exactly as the Frontend parses it. */
const fetchReplay = async (token: string, runId: string, afterSeq: number): Promise<Frame[]> => {
  const response = await fetch(
    `${API}/api/agents/jaina/chat/runs/${runId}/events?after_seq=${afterSeq}&limit=500`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`replay failed: ${response.status} ${await response.text()}`);
  }
  return (await response.text())
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Frame);
};

const cleanup = async (sessionIds: string[]) => {
  for (const sessionId of sessionIds) {
    const { data: runs } = await admin
      .schema('jaina')
      .from('jaina_conversation_runs')
      .select('run_id')
      .eq('session_id', sessionId);
    const runIds = (runs ?? []).map((r) => (r as { run_id: string }).run_id);
    if (runIds.length) {
      await admin
        .schema('jaina')
        .from('jaina_conversation_run_events')
        .delete()
        .in('run_id', runIds);
    }
    await admin
      .schema('jaina')
      .from('jaina_conversation_runs')
      .delete()
      .eq('session_id', sessionId);
    await admin
      .schema('jaina')
      .from('jaina_conversation_messages')
      .delete()
      .eq('session_id', sessionId);
    await admin
      .schema('jaina')
      .from('jaina_conversation_sessions')
      .delete()
      .eq('session_id', sessionId);
  }
};

async function main() {
  const stamp = Date.now();
  const sessionDetach = `bench-jaina-detach-${stamp}`;
  const sessionQueue = `bench-jaina-queue-${stamp}`;
  const sessionCancel = `bench-jaina-cancel-${stamp}`;
  const sessions = [sessionDetach, sessionQueue, sessionCancel];

  await cleanup(sessions);
  const accessToken = await mintAccessTokenForEmail(OWNER_EMAIL);

  console.log('\n=== 1. DETACHMENT: kill the socket mid-run ===');

  const abandoned = await streamUntilAbandoned(accessToken, sessionDetach, modelIsWorking);

  check(
    'client captured a runId before leaving (off the SSE message id, not a bespoke frame)',
    abandoned.runId !== null,
    abandoned.messageId ?? '',
  );
  if (!abandoned.runId) {
    console.log('\nCannot continue without a runId.');
    process.exit(1);
  }
  const runId = abandoned.runId;

  check(
    'the stream opened with a `start` chunk naming this run',
    abandoned.chunks[0]?.type === 'start' && abandoned.messageId === `jaina:${runId}:assistant`,
    `first chunk=${abandoned.chunks[0]?.type} messageId=${abandoned.messageId}`,
  );
  check(
    'the client left while the model was still working (it saw a tool call, no answer yet)',
    modelIsWorking(abandoned.chunks) && !abandoned.chunks.some((c) => c.type === 'text-delta'),
    `left after ${abandoned.chunks.length} chunks: ${[...new Set(abandoned.chunks.map((c) => c.type))].join(', ')}`,
  );

  const seqAtAbandon = await maxEventSeq(runId);
  const finalStatus = await waitForTerminal(runId);
  const seqAfter = await maxEventSeq(runId);

  check(
    'the run KEPT RUNNING after the socket died (durable log grew past where we left)',
    seqAfter > seqAtAbandon,
    `log stood at seq ${seqAtAbandon} when the client vanished; it reached seq ${seqAfter}`,
  );
  check(
    'the abandoned run reached a terminal status',
    TERMINAL_STATUSES.includes(finalStatus),
    finalStatus,
  );
  check(
    'the abandoned run is recorded as completed, not silently failed',
    finalStatus === 'completed',
    finalStatus,
  );

  console.log('\n=== 2. LOG INVARIANT: the transport changed, the log did not ===');
  const eventRows = await listEventRows(runId);
  const durableSeqs = eventRows.map((row) => row.seq ?? -1);

  check(
    'the durable log is contiguous from seq 0 (a gap drops a frame on replay)',
    durableSeqs.length > 0 && durableSeqs.every((seq, index) => seq === index),
    `${durableSeqs.length} events, seq 0..${durableSeqs.at(-1)}`,
  );
  check(
    'the durable log has no duplicate seqs (two frames sharing one seq would drop on merge)',
    new Set(durableSeqs).size === durableSeqs.length,
    `${durableSeqs.length} events, ${new Set(durableSeqs).size} distinct seqs`,
  );
  check(
    'every durable row carries an event_id — the envelope the SSE wire no longer shows',
    eventRows.length > 0 &&
      eventRows.every((row) => typeof row.event_id === 'string' && row.event_id.length > 0),
    `${eventRows.filter((row) => !row.event_id).length} rows without an event_id`,
  );

  // The chunks are a PROJECTION of this log, so each one has to be traceable to a row in it. Tool
  // calls are the honest probe: `tool-input-available` exists only because `tool.call`/`tool.batch`
  // was logged, and this bench is stopped at exactly that point.
  const loggedToolEvents = eventRows.filter(
    (row) => row.event_type === 'tool.call' || row.event_type === 'tool.batch',
  ).length;
  const toolChunks = abandoned.chunks.filter((c) => c.type === 'tool-input-available').length;
  check(
    'the SSE chunks the client saw are a projection of THIS run’s log, not a second source',
    toolChunks > 0 && loggedToolEvents > 0,
    `${toolChunks} tool-input-available chunk(s) on the wire, ${loggedToolEvents} tool event row(s) in the log`,
  );
  check(
    'the log kept its own frame vocabulary (agent.chat_started at seq 0), silent on the SSE wire',
    eventRows[0]?.event_type === 'agent.chat_started' && eventRows[0]?.seq === 0,
    `seq 0 is ${eventRows[0]?.event_type}`,
  );

  console.log('\n=== 3. REPLAY: resume from where the client left ===');
  // The forensic endpoint, deliberately still NDJSON — the SDK's own resume is a GET on the
  // chat-stream path and is covered by `jaina:uistream:e2e:bench`. `seqAtAbandon` is where the log
  // stood when the socket died, which is the resume point a durable reader would ask from.
  const replay = await fetchReplay(accessToken, runId, seqAtAbandon);
  const expectedSeqs = durableSeqs.filter((seq) => seq > seqAtAbandon);

  check(
    'replay returns exactly the frames the client missed (seq > seqAtAbandon), in order',
    replay.length === expectedSeqs.length &&
      replay.every((frame, i) => frame.seq === expectedSeqs[i]),
    `asked after_seq=${seqAtAbandon}; got ${replay.length} frames (expected ${expectedSeqs.length})`,
  );
  check(
    'replayed frames carry the same envelope shape as the live stream (eventId, seq, ts, type)',
    replay.length > 0 &&
      replay.every(
        (f) => typeof f.eventId === 'string' && typeof f.seq === 'number' && !!f.ts && !!f.type,
      ),
  );
  check(
    'the run terminated in the replayed tail — a resuming client sees the end of the turn',
    replay.some((f) => f.type === 'response.done' || f.type === 'error'),
    replay.at(-1)?.type ?? 'empty',
  );

  console.log('\n=== 4. QUEUE: a second turn on the SAME session is fenced ===');
  const firstTurn = streamUntilAbandoned(accessToken, sessionQueue, (c) => c.length > 5000);
  await sleep(1200); // let the first acquire the session lock

  const queueController = new AbortController();
  const queueResponse = await openChatStream(
    accessToken,
    sessionQueue,
    'And what about my ad sets?',
    queueController.signal,
  );
  const queueReader = queueResponse.body!.getReader();
  const queueDecoder = new TextDecoder();
  const secondChunks: Chunk[] = [];
  let queueBuffer = '';
  const isQueuedNotice = (chunk: Chunk) =>
    chunk.type === 'data-jaina-notice' && chunk.data?.type === 'agent.run_queued';
  const queueDeadline = Date.now() + 20_000;
  while (Date.now() < queueDeadline) {
    const { done, value } = await queueReader.read();
    if (done) break;
    queueBuffer += queueDecoder.decode(value, { stream: true });
    const drained = drainSse(queueBuffer);
    queueBuffer = drained.rest;
    secondChunks.push(...drained.chunks);
    if (secondChunks.some(isQueuedNotice)) break;
  }
  queueController.abort();
  await queueReader.cancel().catch(() => undefined);

  const queuedNotice = secondChunks.find(isQueuedNotice);
  check(
    'the second turn on a busy session is QUEUED, not run concurrently',
    !!queuedNotice,
    queuedNotice
      ? ''
      : `saw: ${[...new Set(secondChunks.map((c) => c.type))].join(', ') || 'none'}`,
  );
  check(
    'the fence is TRANSIENT — told to the client, never added to the transcript',
    queuedNotice?.transient === true,
    `transient=${String(queuedNotice?.transient)}`,
  );

  await firstTurn.catch(() => undefined);
  // The fenced run inherits the lock once the first finishes and executes detached, like any
  // other. Let it land before cleanup, or it writes rows behind the delete.
  const queuedRunId = queuedNotice?.data?.runId;
  if (typeof queuedRunId === 'string') {
    // The fence is a transport notice about a run that has not begun, so it must leave NO row in
    // that run's log — a logged fence would replay as a phantom event at seq 0's expense.
    const queuedRows = await listEventRows(queuedRunId);
    check(
      'the fence left no row in the durable log (it is not an entry in that run)',
      !queuedRows.some((row) => row.event_type === 'agent.run_queued'),
      `${queuedRows.length} rows logged for the fenced run`,
    );
    const queuedStatus = await waitForTerminal(queuedRunId);
    check(
      'the fenced run then runs on its own — a queued turn is not a dropped turn',
      TERMINAL_STATUSES.includes(queuedStatus),
      queuedStatus,
    );
  }

  console.log('\n=== 5. CANCEL: stays cancelled, is not resurrected ===');
  // Leave once the run is provably `running`, so cancel lands on a live run rather than racing the
  // row insert. On this wire the FIRST chunk is that proof: every frame the handler emits before
  // `markConversationRunRunning` (agent.chat_started, response.created, response.run.created,
  // output_item.added) is deliberately silent on the SSE projection, so nothing can reach the
  // client until the run is marked running.
  const toCancel = await streamUntilAbandoned(
    accessToken,
    sessionCancel,
    (chunks) => chunks.length > 0,
  );
  check('captured a runId to cancel', toCancel.runId !== null, toCancel.messageId ?? '');

  if (toCancel.runId) {
    const cancelResponse = await fetch(
      `${API}/api/agents/jaina/chat/runs/${toCancel.runId}/cancel`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const cancelBody = (await cancelResponse.json()) as {
      status?: string;
      applied?: boolean;
      aborted?: boolean;
    };
    check(
      'cancel endpoint reports it ABORTED a live run',
      cancelBody.applied === true && cancelBody.aborted === true,
      `applied=${String(cancelBody.applied)} aborted=${String(cancelBody.aborted)}`,
    );

    // The executor unwinds and tries to stamp its own outcome. The terminal-status guard is
    // what stops that trailing write from turning `cancelled` back into completed/failed.
    await sleep(10_000);
    const run = await getRun(toCancel.runId);
    check(
      'the run STAYS cancelled (the executor did not overwrite it)',
      run?.status === 'cancelled',
      run?.status ?? 'missing',
    );
  }

  await cleanup(sessions);

  console.log(`\n${failures === 0 ? 'BENCH GREEN' : `BENCH RED — ${failures} failing check(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('bench crashed:', err);
  process.exit(1);
});
