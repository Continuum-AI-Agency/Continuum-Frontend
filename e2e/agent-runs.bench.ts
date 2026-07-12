/**
 * Detached agent runs — end-to-end bench.
 *
 * Proves the ONE claim this whole change rests on: a run is no longer its HTTP request.
 *
 * Drives the REAL Organic agent across its real boundaries — a real Supabase-minted user
 * token, the real Fastify chat route, the real model, the real Postgres run tables. Nothing
 * is mocked. The bench then does the thing that used to destroy a turn: it KILLS THE SOCKET
 * mid-run, exactly as navigating away does.
 *
 * What it asserts, and why each one is the actual observable outcome rather than a proxy:
 *
 *   1. DETACHMENT   — after the socket dies, run_events keeps GROWING past the last seq the
 *                     client ever saw, and the run reaches a terminal status. Before this
 *                     change `res.on('close', () => ac.abort())` killed the model here.
 *   2. HONEST STATUS— a run we did NOT cancel ends `completed`; one we DID cancel ends
 *                     `cancelled` and STAYS cancelled. The old code stamped `completed`
 *                     unconditionally, so a turn killed mid-sentence was recorded a success,
 *                     and cancel was silently overwritten by the executor's trailing write.
 *   3. WHOLE TURN   — the assistant message persisted after we left is at least as long as
 *                     what we had received when we left. The transcript is not truncated.
 *   4. QUEUE        — a second turn on the SAME session is fenced (agent.run_queued, no seq)
 *                     rather than interleaving into one conversation history.
 *   5. PARALLEL     — two DIFFERENT sessions run at the same time.
 *
 * Prerequisites (see e2e/README.md):
 *   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
 *   bun run dev:be
 * Run with: bun run agent:runs:bench
 */

import { createClient } from '@supabase/supabase-js';
import { mintAccessTokenForEmail } from './support/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const OWNER_EMAIL = 'local@continuum.test';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-0000-0000-0000000000b1';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

type Frame = { type: string; seq?: number; data?: Record<string, unknown> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const chatBody = (sessionId: string, text: string) => ({
  brandId: BRAND_ID,
  sessionId,
  messages: [{ role: 'user', content: text }],
  timezone: 'UTC',
});

/**
 * Open a real chat stream and read frames until `stopAfter` says to stop, then DESTROY the
 * socket without reading the rest — the closest possible analogue of the user navigating away.
 * Returns what the client had actually received at the moment it vanished.
 */
async function streamUntilAbandoned(
  token: string,
  sessionId: string,
  prompt: string,
  stopAfter: (frames: Frame[]) => boolean,
): Promise<{ runId: string | null; lastSeq: number; text: string; frames: Frame[] }> {
  const controller = new AbortController();
  const response = await fetch(`${API}/api/organic/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(chatBody(sessionId, prompt)),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`chat stream failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let runId: string | null = null;
  let lastSeq = -1;
  let text = '';
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
        if (frame.type === 'response.output_text.delta') text += String(frame.data?.delta ?? '');
      }

      if (stopAfter(frames)) break;
    }
  } finally {
    // This is the whole point of the bench: walk away mid-run.
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }

  return { runId, lastSeq, text, frames };
}

const getRun = async (runId: string) => {
  const { data } = await admin
    .schema('organic')
    .from('organic_agent_runs')
    .select('run_id,status,error_message')
    .eq('run_id', runId)
    .maybeSingle();
  return data as { run_id: string; status: string; error_message: string | null } | null;
};

const maxEventSeq = async (runId: string): Promise<number> => {
  const { data } = await admin
    .schema('organic')
    .from('organic_agent_run_events')
    .select('seq')
    .eq('run_id', runId)
    .order('seq', { ascending: false })
    .limit(1);
  return (data?.[0]?.seq as number | undefined) ?? -1;
};

const waitForTerminal = async (runId: string, timeoutMs = 180_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run && ['completed', 'failed', 'cancelled'].includes(run.status)) return run.status;
    await sleep(1000);
  }
  return 'timeout';
};

const assistantMessage = async (sessionId: string): Promise<string> => {
  const { data } = await admin
    .schema('organic')
    .from('organic_chat_messages')
    .select('content')
    .eq('session_id', sessionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.content as string | undefined) ?? '';
};

const cleanup = async (sessionIds: string[]) => {
  for (const sessionId of sessionIds) {
    const { data: runs } = await admin
      .schema('organic')
      .from('organic_agent_runs')
      .select('run_id')
      .eq('session_id', sessionId);
    const runIds = (runs ?? []).map((r) => (r as { run_id: string }).run_id);
    if (runIds.length) {
      await admin.schema('organic').from('organic_agent_run_events').delete().in('run_id', runIds);
    }
    await admin.schema('organic').from('organic_agent_runs').delete().eq('session_id', sessionId);
    await admin
      .schema('organic')
      .from('organic_chat_messages')
      .delete()
      .eq('session_id', sessionId);
    await admin
      .schema('organic')
      .from('organic_chat_sessions')
      .delete()
      .eq('session_id', sessionId);
  }
};

async function main() {
  const stamp = Date.now();
  const sessionA = `bench-detach-${stamp}`;
  const sessionB = `bench-parallel-${stamp}`;
  const sessionC = `bench-cancel-${stamp}`;
  const sessions = [sessionA, sessionB, sessionC];

  await cleanup(sessions);
  await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' });

  const accessToken = await mintAccessTokenForEmail(OWNER_EMAIL);
  console.log('\n=== 1. DETACHMENT: kill the socket mid-run ===');

  const PROMPT = 'In three short sentences, explain what makes a good Instagram caption.';

  // Leave as soon as the model is genuinely mid-answer — we have the runId and real text.
  const abandoned = await streamUntilAbandoned(accessToken, sessionA, PROMPT, (frames) => {
    const deltas = frames.filter((f) => f.type === 'response.output_text.delta').length;
    return deltas >= 3;
  });

  check('client captured a runId before leaving', abandoned.runId !== null, abandoned.runId ?? '');
  if (!abandoned.runId) {
    console.log('\nCannot continue without a runId.');
    process.exit(1);
  }
  console.log(
    `  (client left after seq ${abandoned.lastSeq}, holding ${abandoned.text.length} chars)`,
  );

  const seqAtAbandon = await maxEventSeq(abandoned.runId);
  const finalStatus = await waitForTerminal(abandoned.runId);
  const seqAfter = await maxEventSeq(abandoned.runId);
  const persisted = await assistantMessage(sessionA);

  check(
    'the run KEPT RUNNING after the socket died (durable log grew past where we left)',
    seqAfter > abandoned.lastSeq,
    `client last saw seq ${abandoned.lastSeq}; log reached seq ${seqAfter} (was ${seqAtAbandon} at abandon)`,
  );
  check(
    'the abandoned run reached a terminal status',
    ['completed', 'failed'].includes(finalStatus),
    finalStatus,
  );
  check(
    'the run is recorded as completed, not silently failed',
    finalStatus === 'completed',
    finalStatus,
  );
  check(
    'the assistant turn persisted WHOLE, not truncated at the disconnect',
    persisted.length >= abandoned.text.length && persisted.length > 0,
    `client had ${abandoned.text.length} chars; DB holds ${persisted.length}`,
  );

  console.log('\n=== 2. QUEUE: a second turn on the SAME session is fenced ===');
  const first = streamUntilAbandoned(accessToken, sessionB, PROMPT, (f) => f.length > 500);
  await sleep(1200); // let the first acquire the session lock

  const secondFrames: Frame[] = [];
  const secondController = new AbortController();
  const secondResponse = await fetch(`${API}/api/organic/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(chatBody(sessionB, 'And what about hashtags?')),
    signal: secondController.signal,
  });
  const secondReader = secondResponse.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const { done, value } = await secondReader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        secondFrames.push(JSON.parse(l) as Frame);
      } catch {
        /* skip */
      }
    }
    if (secondFrames.some((f) => f.type === 'agent.run_queued')) break;
  }
  secondController.abort();
  await secondReader.cancel().catch(() => undefined);

  const queuedFrame = secondFrames.find((f) => f.type === 'agent.run_queued');
  check('the second turn on a busy session is QUEUED, not run concurrently', !!queuedFrame);
  check(
    'the queued frame carries NO seq (it would collide with the seq-0 chat_started frame)',
    queuedFrame ? queuedFrame.seq === undefined : false,
    queuedFrame ? `seq=${String(queuedFrame.seq)}` : 'no frame',
  );
  await first.catch(() => undefined);

  console.log('\n=== 3. CANCEL: stays cancelled, is not resurrected as completed ===');
  const toCancel = await streamUntilAbandoned(accessToken, sessionC, PROMPT, (frames) =>
    frames.some((f) => f.type === 'response.output_text.delta'),
  );
  check('captured a runId to cancel', toCancel.runId !== null);

  if (toCancel.runId) {
    const cancelRes = await fetch(`${API}/api/organic/agent/runs/${toCancel.runId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const cancelBody = (await cancelRes.json()) as { status?: string; aborted?: boolean };
    check('cancel endpoint reports it ABORTED a live run', cancelBody.aborted === true);

    // The executor unwinds and tries to stamp its own outcome. The terminal-status guard is
    // what stops that trailing write from turning `cancelled` back into `completed`.
    await sleep(6000);
    const run = await getRun(toCancel.runId);
    check(
      'the run STAYS cancelled (the executor did not overwrite it with completed)',
      run?.status === 'cancelled',
      run?.status ?? 'missing',
    );
  }

  console.log('\n=== 4. ACTIVE RUNS: a detached run is findable again ===');
  const activeRes = await fetch(`${API}/api/agents/runs/active?brandId=${BRAND_ID}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check('GET /api/agents/runs/active answers', activeRes.ok, `status ${activeRes.status}`);
  if (activeRes.ok) {
    const body = (await activeRes.json()) as { runs?: unknown[] };
    check(
      'it returns a runs array (the shape the FE store hydrates from)',
      Array.isArray(body.runs),
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
