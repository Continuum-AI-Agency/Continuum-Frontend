/**
 * Detached Jaina runs — end-to-end bench. The twin of `agent-runs.bench.ts` (Organic).
 *
 * Proves the claim the whole shared agent-run contract rests on, for the SECOND agent now
 * sitting on it: a run is not its HTTP request. Drives the REAL Jaina agent across its real
 * boundaries — a real Supabase-minted user token, the real Fastify chat-stream route, the
 * real Gemini call, the real Meta tool, the real Postgres run tables. Nothing is mocked.
 * The bench then does the thing that used to destroy a turn: it KILLS THE SOCKET mid-run.
 *
 * What it asserts, and why each is the real observable outcome rather than a proxy:
 *
 *   1. DETACHMENT   — after the socket dies, jaina_conversation_run_events keeps GROWING
 *                     past the last seq the client ever saw, and the run reaches a terminal
 *                     status. Jaina never aborted on client disconnect; this proves it.
 *   2. SEQ INVARIANT— every frame the client saw on the wire has a DB row at the SAME seq
 *                     with the same type and the same event_id. One allocator mints both.
 *                     If this breaks, the Frontend's live+replay merge silently double-
 *                     renders or drops frames — it has never been checked against a live run.
 *   3. REPLAY       — GET .../events?after_seq=N returns exactly the frames with seq > N,
 *                     ascending, in the same envelope shape the live stream writes.
 *   4. HONEST STATUS— an uncancelled run ends `completed`; a cancelled one ends `cancelled`
 *                     and STAYS cancelled after the executor's trailing write lands.
 *   5. QUEUE        — a second turn on the SAME session is fenced (agent.run_queued), and
 *                     that frame carries NO seq (a seq would collide with seq-0 chat_started).
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
 *      `response.output_text.delta` chunks at the END. So "leave mid-answer" is impossible by
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
const BRAND_ID = '00000000-0000-0000-0000-0000000000b1';

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

type Frame = {
  type: string;
  seq?: number;
  eventId?: string;
  ts?: string;
  data?: Record<string, unknown>;
};

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
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(chatBody(sessionId, text)),
    signal,
  });

/**
 * Open a real chat stream, read frames until `stopAfter` says to stop, then DESTROY the socket
 * without reading the rest — the closest possible analogue of the user navigating away.
 * Returns what the client had actually received at the moment it vanished.
 */
async function streamUntilAbandoned(
  token: string,
  sessionId: string,
  stopAfter: (frames: Frame[]) => boolean,
): Promise<{ runId: string | null; lastSeq: number; frames: Frame[] }> {
  const controller = new AbortController();
  const response = await openChatStream(token, sessionId, PROMPT, controller.signal);

  if (!response.ok || !response.body) {
    throw new Error(`chat stream failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let runId: string | null = null;
  let lastSeq = -1;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let frame: Frame;
        try {
          frame = JSON.parse(line) as Frame;
        } catch {
          continue;
        }
        frames.push(frame);
        if (typeof frame.seq === 'number') lastSeq = Math.max(lastSeq, frame.seq);
        if (frame.type === 'agent.chat_started') runId = String(frame.data?.runId ?? '') || null;
      }

      if (stopAfter(frames)) break;
    }
  } finally {
    // This is the whole point of the bench: walk away mid-run.
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }

  return { runId, lastSeq, frames };
}

/** The model is genuinely working once it has issued its first tool call. */
const modelIsWorking = (frames: Frame[]) => frames.some((f) => f.type === 'tool.batch');

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

  check('client captured a runId before leaving', abandoned.runId !== null, abandoned.runId ?? '');
  if (!abandoned.runId) {
    console.log('\nCannot continue without a runId.');
    process.exit(1);
  }
  const runId = abandoned.runId;

  const chatStarted = abandoned.frames.find((f) => f.type === 'agent.chat_started');
  check(
    'the run announces itself with agent.chat_started at seq 0',
    chatStarted?.seq === 0,
    `seq=${String(chatStarted?.seq)}`,
  );
  check(
    'the client left while the model was still working (it saw a tool call, no answer yet)',
    modelIsWorking(abandoned.frames) &&
      !abandoned.frames.some((f) => f.type === 'response.output_text.delta'),
    `left after seq ${abandoned.lastSeq} of ${abandoned.frames.length} frames`,
  );

  const seqAtAbandon = await maxEventSeq(runId);
  const finalStatus = await waitForTerminal(runId);
  const seqAfter = await maxEventSeq(runId);

  check(
    'the run KEPT RUNNING after the socket died (durable log grew past where we left)',
    seqAfter > abandoned.lastSeq,
    `client last saw seq ${abandoned.lastSeq}; log reached seq ${seqAfter} (was ${seqAtAbandon} at abandon)`,
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

  console.log('\n=== 2. SEQ INVARIANT: the wire seq IS the DB seq ===');
  const eventRows = await listEventRows(runId);
  const bySeq = new Map(eventRows.map((row) => [row.seq ?? -1, row]));
  const wireFrames = abandoned.frames.filter((f) => typeof f.seq === 'number');

  const mismatches = wireFrames.filter((frame) => {
    const row = bySeq.get(frame.seq as number);
    return !row || row.event_type !== frame.type || row.event_id !== frame.eventId;
  });

  check(
    'every frame the client saw has a DB row at the SAME seq, with the same type and event_id',
    wireFrames.length > 0 && mismatches.length === 0,
    mismatches.length
      ? `${mismatches.length} mismatched: ${mismatches
          .slice(0, 3)
          .map(
            (f) =>
              `seq ${f.seq} wire=${f.type}/${f.eventId} db=${bySeq.get(f.seq as number)?.event_type}/${bySeq.get(f.seq as number)?.event_id}`,
          )
          .join('; ')}`
      : `${wireFrames.length} wire frames matched their DB rows exactly`,
  );
  check(
    'every wire frame carried a full envelope (eventId + seq + ts)',
    wireFrames.every((f) => typeof f.eventId === 'string' && f.eventId.length > 0 && !!f.ts),
    `${wireFrames.length}/${abandoned.frames.length} frames enveloped`,
  );

  const durableSeqs = eventRows.map((row) => row.seq ?? -1);
  check(
    'the durable log has no duplicate seqs (two frames sharing one seq would drop on merge)',
    new Set(durableSeqs).size === durableSeqs.length,
    `${durableSeqs.length} events, ${new Set(durableSeqs).size} distinct seqs`,
  );

  console.log('\n=== 3. REPLAY: resume from where the client left ===');
  const replay = await fetchReplay(accessToken, runId, abandoned.lastSeq);
  const expectedSeqs = durableSeqs.filter((seq) => seq > abandoned.lastSeq);

  check(
    'replay returns exactly the frames the client missed (seq > lastSeq), in order',
    replay.length === expectedSeqs.length &&
      replay.every((frame, i) => frame.seq === expectedSeqs[i]),
    `asked after_seq=${abandoned.lastSeq}; got ${replay.length} frames (expected ${expectedSeqs.length})`,
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
  const firstTurn = streamUntilAbandoned(accessToken, sessionQueue, (f) => f.length > 5000);
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
  const secondFrames: Frame[] = [];
  let queueBuffer = '';
  const queueDeadline = Date.now() + 20_000;
  while (Date.now() < queueDeadline) {
    const { done, value } = await queueReader.read();
    if (done) break;
    queueBuffer += queueDecoder.decode(value, { stream: true });
    const lines = queueBuffer.split('\n');
    queueBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        secondFrames.push(JSON.parse(line) as Frame);
      } catch {
        /* skip */
      }
    }
    if (secondFrames.some((f) => f.type === 'agent.run_queued')) break;
  }
  queueController.abort();
  await queueReader.cancel().catch(() => undefined);

  const queuedFrame = secondFrames.find((f) => f.type === 'agent.run_queued');
  check('the second turn on a busy session is QUEUED, not run concurrently', !!queuedFrame);
  check(
    'the queued frame carries NO seq (it would collide with the seq-0 chat_started frame)',
    queuedFrame ? queuedFrame.seq === undefined : false,
    queuedFrame ? `seq=${String(queuedFrame.seq)}` : 'no frame',
  );

  await firstTurn.catch(() => undefined);
  // The fenced run inherits the lock once the first finishes and executes detached, like any
  // other. Let it land before cleanup, or it writes rows behind the delete.
  const queuedRunId = queuedFrame?.data?.runId;
  if (typeof queuedRunId === 'string') {
    const queuedStatus = await waitForTerminal(queuedRunId);
    check(
      'the fenced run then runs on its own — a queued turn is not a dropped turn',
      TERMINAL_STATUSES.includes(queuedStatus),
      queuedStatus,
    );
  }

  console.log('\n=== 5. CANCEL: stays cancelled, is not resurrected ===');
  // Leave once the run is provably `running` (the state.delta that follows markRunning), so
  // cancel lands on a live run rather than racing the row insert.
  const toCancel = await streamUntilAbandoned(accessToken, sessionCancel, (frames) =>
    frames.some((f) => f.type === 'state.delta'),
  );
  check('captured a runId to cancel', toCancel.runId !== null);

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
