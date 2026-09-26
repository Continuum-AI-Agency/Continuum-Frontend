import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// paste:e2e:bench
//
// WHAT IT PROVES: a large paste into the Organic and Canvas composers becomes a
// pasted-text attachment that reaches the model whole, as Jaina's already does.
//   Organic: 1. the paste lands as a `pasted-text.txt` chip; 2. the persisted user turn carries
//            the pasted text; 3. the agent answers with a code word that exists ONLY in the paste;
//            4. no ephemeral brand_documents row was uploaded for it (the old, slow path).
//   Canvas:  5. a paste longer than the old 4,000-char prompt cap is accepted by the Backend and
//            lands on the run row's request.prompt; 6. the composer writes the paste's code word
//            onto the canvas graph. Before this change Canvas dropped a paste entirely.
//
// REAL: hosted Postgres + GoTrue, a bench-owned Fastify Backend on hosted running both agents on
// their real models, the Next app, real Chrome dispatching a real ClipboardEvent.
//
// SEEDED, STATED: an Organic session with one prior exchange and an empty Canvas room, both
// run-owned ids on the bench login's brand, deleted by id afterwards.
//
// Run: bun run paste:e2e:bench

const BENCH = 'paste:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.PASTE_BENCH_APP_PORT ?? 3135);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4425);
process.env.PLAYWRIGHT_BASE_URL = APP;

// The bench login and its Vivo47-mirror brand: the only brand this bench writes to.
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';

const RUN_ID = `${Date.now()}`;
const SESSION_ID = randomUUID();
const ROOM_ID = randomUUID();
const ORGANIC_SECRET = `PASTE${RUN_ID.slice(-6)}`;
const CANVAS_SECRET = `CANVAS${RUN_ID.slice(-6)}`;

const ORGANIC_BRIEF = [
  'Autumn campaign brief',
  'Audience: city commuters who cycle.',
  `Internal code word for this campaign: ${ORGANIC_SECRET}`,
  'Tone: warm, practical, no hype.',
].join('\n');

// Over the old 4,000-char cap on purpose: that cap would have 400'd this turn.
const CANVAS_BRIEF = [
  'Product launch brief',
  `The launch code word is ${CANVAS_SECRET}.`,
  ...Array.from(
    { length: 60 },
    (_, index) =>
      `Background note ${index + 1}: the product is a reusable bottle; keep visuals clean and bright.`,
  ),
].join('\n');

/* -- the Recorder envelope (same shape as session-content.bench.spec.ts) ------------- */
type Grade = { step: string; grade: 'PASS' | 'FAIL'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

const SHOT_DIR = process.env.PASTE_BENCH_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'paste-bench');
let currentPage: Page | null = null;

async function step(name: string, run: () => Promise<string | undefined>): Promise<boolean> {
  try {
    grade(name, true, await run());
    return true;
  } catch (error) {
    if (currentPage) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const file = path.join(SHOT_DIR, `${RUN_ID}-${name.replace(/\W+/g, '-').slice(0, 50)}.png`);
      await currentPage.screenshot({ path: file, fullPage: true }).catch(() => undefined);
      notes.push(`screenshot: ${file}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    grade(
      name,
      false,
      message
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .slice(0, 12)
        .join(' ')
        .slice(0, 600),
    );
    return false;
  }
}

function printEnvelope(): void {
  const fail = graded.filter((result) => result.grade === 'FAIL').length;
  for (const note of notes) console.log(`· ${note}`);
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results: graded,
      notes,
      counts: { pass: graded.length - fail, warn: 0, skip: 0, fail },
      exitCode: fail > 0 ? 1 : 0,
    }),
  );
}

/* -- hosted service-role reads, seeds and residue ------------------------------------ */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const organic = () => db.schema('organic');
const brandProfiles = () => db.schema('brand_profiles');

const residue = {
  sessionSeeded: false,
  roomSeeded: false,
  brandPref: null as { userId: string; previous: string | null } | null,
};

async function pinActiveBrand(userId: string): Promise<void> {
  const { data } = await brandProfiles()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  residue.brandPref = {
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  };
  await brandProfiles()
    .from('user_brand_preferences')
    .upsert({ user_id: userId, active_brand_id: BENCH_BRAND }, { onConflict: 'user_id' })
    .throwOnError();
}

async function seedSession(userId: string): Promise<void> {
  const base = {
    session_id: SESSION_ID,
    brand_id: BENCH_BRAND,
    user_id: userId,
    user_email: BENCH_EMAIL,
  };
  residue.sessionSeeded = true;
  await organic()
    .from('organic_chat_sessions')
    .insert({
      ...base,
      title: `Paste bench ${RUN_ID}`,
      last_message_role: 'assistant',
      last_message_preview: 'Ready when you are.',
      last_message_at: new Date().toISOString(),
    })
    .throwOnError();
  await organic()
    .from('organic_chat_messages')
    .insert({ ...base, role: 'user', content: 'Hi, I will share a campaign brief next.' })
    .throwOnError();
  await organic()
    .from('organic_chat_messages')
    .insert({ ...base, role: 'assistant', content: 'Ready when you are.' })
    .throwOnError();
}

async function seedRoom(userId: string): Promise<void> {
  residue.roomSeeded = true;
  await brandProfiles()
    .from('canvas_rooms')
    .insert({
      id: ROOM_ID,
      brand_profile_id: BENCH_BRAND,
      name: `Paste bench ${RUN_ID}`,
      created_by: userId,
    })
    .throwOnError();
  await brandProfiles()
    .from('canvas_sessions')
    .upsert(
      {
        brand_profile_id: BENCH_BRAND,
        room_id: ROOM_ID,
        nodes: [],
        edges: [],
        deleted_node_ids: [],
        deleted_edge_ids: [],
        editor_session_id: randomUUID(),
        editor_user_id: userId,
      },
      { onConflict: 'brand_profile_id,room_id' },
    )
    .throwOnError();
}

type MessageRow = { id: number; role: string; content: string };

async function sessionMessages(): Promise<MessageRow[]> {
  const { data, error } = await organic()
    .from('organic_chat_messages')
    .select('id, role, content')
    .eq('session_id', SESSION_ID)
    .order('id', { ascending: true });
  if (error) throw new Error(`could not read the session: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

type RunRow = {
  run_id: string;
  status: string;
  error_message: string | null;
  request: { prompt?: string };
};

async function composerRuns(): Promise<RunRow[]> {
  const { data, error } = await brandProfiles()
    .from('ai_studio_canvas_composer_runs')
    .select('run_id, status, error_message, request')
    .eq('room_id', ROOM_ID);
  if (error) throw new Error(`could not read composer runs: ${error.message}`);
  return (data ?? []) as RunRow[];
}

/* -- the hosted app (same lifecycle as session-content.bench.spec.ts) ---------------- */

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function killGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), name);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const quit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!quit) signal('SIGKILL');
}

async function startHostedApp(backendUrl: string): Promise<{ stop: () => Promise<void> }> {
  if (await answers(APP)) {
    throw new Error(
      `${APP} already answers; this bench needs its own hosted-targeted Next server.`,
    );
  }
  const child: ChildProcess = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/paste-e2e',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 30) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const stop = () => killGroup(child);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (await answers(`${APP}/login`)) return { stop };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await stop();
  throw new Error(`hosted Next app never came up on ${APP}\n${tail.join('')}`);
}

/** A real ClipboardEvent, the same event a Cmd+V delivers to the composer. */
async function paste(editor: Locator, text: string): Promise<void> {
  await editor.click();
  await editor.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

/* -- the run ------------------------------------------------------------------------- */

const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

let backend: LocalBackend | null = null;
let app: { stop: () => Promise<void> } | null = null;
let reachedTheEnd = false;

test.beforeAll(async () => {
  test.setTimeout(900_000);
  // A Backend on hosted from a laptop must not act on prod's queues or scheduled posts.
  Object.assign(process.env, {
    MCP_JOB_WORKER_ENABLED: 'false',
    BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    ORGANIC_SCHEDULED_PUBLISH_INTERVAL_MS: '2147483647',
    ORGANIC_REALIZE_DRIVER_INTERVAL_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_KICKOFF_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_INTERVAL_MS: '2147483647',
  });
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
  app = await startHostedApp(backend.url);
});

test.afterAll(async () => {
  if (residue.sessionSeeded) {
    await organic().from('organic_chat_messages').delete().eq('session_id', SESSION_ID);
    await organic().from('organic_chat_sessions').delete().eq('session_id', SESSION_ID);
  }
  if (residue.roomSeeded) {
    const runIds = (await composerRuns().catch(() => [])).map((run) => run.run_id);
    if (runIds.length > 0) {
      await brandProfiles()
        .from('ai_studio_canvas_composer_run_events')
        .delete()
        .in('run_id', runIds);
      await brandProfiles().from('ai_studio_canvas_composer_runs').delete().in('run_id', runIds);
    }
    // canvas_sessions cascades on the room FK.
    await brandProfiles().from('canvas_rooms').delete().eq('id', ROOM_ID);
  }
  if (residue.brandPref?.previous) {
    await brandProfiles()
      .from('user_brand_preferences')
      .upsert(
        { user_id: residue.brandPref.userId, active_brand_id: residue.brandPref.previous },
        { onConflict: 'user_id' },
      );
  }
  await app?.stop();
  await backend?.stop();
  if (!reachedTheEnd) grade('the run reached its last step', false, 'aborted — see the test error');
  printEnvelope();
});

test('pasted text reaches the Organic and Canvas agents whole', async ({ page, context }) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  currentPage = page;
  page.on('console', (message) => {
    if (message.type() === 'error' && notes.length < 40)
      notes.push(`console: ${message.text().slice(0, 200)}`);
  });

  const session = await mintSessionBundleForEmail(BENCH_EMAIL);
  await context.clearCookies();
  await context.addCookies(session.state.cookies);

  const seeded = await step('setup: an Organic session and an empty Canvas room', async () => {
    await pinActiveBrand(session.userId);
    await seedSession(session.userId);
    await seedRoom(session.userId);
    return `session ${SESSION_ID}, room ${ROOM_ID}`;
  });
  expect(seeded).toBe(true);

  /* ---- Organic ---------------------------------------------------------------------- */
  const organicEditor = page.getByRole('textbox', { name: 'Message the organic agent' });

  const organicChip = await step('Organic: the paste lands as a pasted-text chip', async () => {
    await page.goto(`${APP}/organic?tab=agent&sessionId=${SESSION_ID}`, NAV);
    await expect(page.getByText('Ready when you are.')).toBeVisible({ timeout: 180_000 });
    await paste(organicEditor, ORGANIC_BRIEF);
    await expect(page.getByText('pasted-text.txt').first()).toBeVisible();
    await expect(organicEditor).not.toContainText(ORGANIC_SECRET);
    return 'chip shown, editor holds none of the pasted text';
  });

  if (organicChip) {
    await step('Organic: the persisted user turn carries the paste', async () => {
      await organicEditor.click();
      await page.keyboard.type(
        'What is the internal code word in the pasted brief? Reply with only the code word.',
      );
      await page.keyboard.press('Enter');
      await expect
        .poll(
          async () =>
            (await sessionMessages()).some(
              (row) => row.role === 'user' && row.content.includes(ORGANIC_SECRET),
            ),
          { timeout: 60_000 },
        )
        .toBe(true);
      return `organic_chat_messages user row contains ${ORGANIC_SECRET}`;
    });

    await step('Organic: the agent answers with the code word only the paste holds', async () => {
      let answer: MessageRow | undefined;
      await expect
        .poll(
          async () => {
            const assistants = (await sessionMessages()).filter((row) => row.role === 'assistant');
            answer = assistants.at(-1);
            return assistants.length;
          },
          { timeout: 300_000, intervals: [3_000] },
        )
        .toBe(2);
      expect(answer?.content).toContain(ORGANIC_SECRET);
      return `answer: ${answer?.content.slice(0, 120)}`;
    });

    await step('Organic: no ephemeral document was uploaded for the paste', async () => {
      const { data, error } = await brandProfiles()
        .from('brand_documents')
        .select('id')
        .eq('brand_id', BENCH_BRAND)
        .eq('name', 'pasted-text.txt')
        .gte('created_at', startedAt);
      if (error) throw new Error(error.message);
      expect(data ?? []).toHaveLength(0);
      return '0 brand_documents rows named pasted-text.txt since the run began';
    });
  }

  /* ---- Canvas ----------------------------------------------------------------------- */
  const canvasEditor = page.getByLabel('Describe the workflow you want on the canvas');

  const canvasChip = await step('Canvas: the paste lands as a pasted-text chip', async () => {
    await page.goto(`${APP}/ai-studio?roomId=${ROOM_ID}`, NAV);
    await expect(canvasEditor).toBeEnabled({ timeout: 180_000 });
    await paste(canvasEditor, CANVAS_BRIEF);
    await expect(page.getByText('pasted-text.txt').first()).toBeVisible();
    return `${CANVAS_BRIEF.length}-char paste held as a chip`;
  });

  if (canvasChip) {
    await step('Canvas: the Backend accepts a >4,000-char pasted prompt', async () => {
      await canvasEditor.click();
      await page.keyboard.type(
        'Add one text prompt node whose text is exactly the launch code word from the brief.',
      );
      await page.keyboard.press('Enter');
      let run: RunRow | undefined;
      await expect
        .poll(
          async () => {
            run = (await composerRuns())[0];
            return run?.request.prompt?.includes(CANVAS_SECRET) ?? false;
          },
          { timeout: 90_000 },
        )
        .toBe(true);
      const promptLength = run?.request.prompt?.length ?? 0;
      expect(promptLength).toBeGreaterThan(4000);
      return `run ${run?.run_id} request.prompt is ${promptLength} chars and holds ${CANVAS_SECRET}`;
    });

    await step('Canvas: the composer writes the paste-only code word onto the graph', async () => {
      await expect
        .poll(
          async () => {
            const { data } = await brandProfiles()
              .from('canvas_sessions')
              .select('nodes')
              .eq('brand_profile_id', BENCH_BRAND)
              .eq('room_id', ROOM_ID)
              .maybeSingle();
            return JSON.stringify((data as { nodes?: unknown } | null)?.nodes ?? []).includes(
              CANVAS_SECRET,
            );
          },
          { timeout: 300_000, intervals: [3_000] },
        )
        .toBe(true);
      const [run] = await composerRuns();
      return `canvas_sessions.nodes holds ${CANVAS_SECRET}; run status ${run?.status}`;
    });
  }

  notes.push('seeded: one prior Organic exchange and an empty Canvas room (run-owned ids)');
  notes.push('unexercised: Jaina paste, which is the unchanged reference path');
  reachedTheEnd = true;
  expect(graded.filter((result) => result.grade === 'FAIL').map((result) => result.step)).toEqual(
    [],
  );
});
