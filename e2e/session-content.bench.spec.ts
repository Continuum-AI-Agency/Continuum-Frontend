import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// organic:session-content:e2e:bench
//
// WHAT IT PROVES — the organic chat's Session tray is a working pointer, not a picture:
//   1. a draft the session generated is listed in the tray, rebuilt from the session's
//      persisted ui.pipeline_card frame exactly as a reload rebuilds it;
//   2. dragging its tile onto the composer drops a `draft` chip there (clicking does too);
//   3. the sent turn persists that reference on organic_chat_messages.metadata.references;
//   4. the agent FOLLOWS the pointer: it calls getDraft with that draft id and quotes a token
//      that exists ONLY in the draft row's content_json.copy.caption — never in the chip, whose
//      caption preview is a different string. Quoting it proves the full draft reached the model.
//
// REAL: hosted Postgres + GoTrue, a bench-owned Fastify Backend on hosted running the real
// organic agent on its real model, the Next app, real Chrome doing a native HTML5 drag.
//
// SEEDED, STATED: the session's history (one assistant turn whose pipeline card names the
// draft) and the draft row. Generating a draft live would spend a full generation pipeline to
// produce the one thing this bench does not test; the tray reads the same persisted frame shape.
//
// UN-EXERCISED, STATED: the Jaina half. Its tray lists creatives by media.assets id and the
// Backend resolves that id with resolveLibraryMediaContext, which organic's media refs already
// bench; the derivation itself is pinned by src/components/paid-media/jaina/sessionContent.test.ts.
//
// Run: bun run organic:session-content:e2e:bench

const BENCH = 'organic:session-content:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.SESSION_CONTENT_APP_PORT ?? 3134);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4424);
// mintSessionBundleForEmail writes its cookies for this host.
process.env.PLAYWRIGHT_BASE_URL = APP;

// The bench login and its Vivo47-mirror brand: the only brand this bench writes to.
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';

const RUN_ID = `${Date.now()}`;
const SESSION_ID = randomUUID();
const JOB_ID = `session-content-bench-${RUN_ID}`;
// In the draft row only. The chip carries CHIP_CAPTION, so the token can reach the model's
// answer by one road: getDraft reading the row.
const SECRET = `TRAY${RUN_ID.slice(-6)}`;
const DRAFT_CAPTION = `Autumn drop is live — code ${SECRET} unlocks early access.`;
// Distinct from the session title: the sidebar row is a button too.
const CHIP_CAPTION = `Autumn drop teaser ${RUN_ID}`;

/* -- the Recorder envelope (same shape organic-ship.bench.spec.ts prints) ------------ */
type Grade = { step: string; grade: 'PASS' | 'WARN' | 'FAIL'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  const result = ok ? 'PASS' : 'FAIL';
  graded.push({ step, grade: result, ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${result} ${step}${detail ? ` — ${detail}` : ''}`);
}

const SHOT_DIR =
  process.env.SESSION_CONTENT_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'session-content-bench');
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
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else counts.fail += 1;
  }
  for (const note of notes) console.log(`· ${note}`);
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- hosted service-role writes + residue -------------------------------------------- */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const organic = () => db.schema('organic');

// Everything this run creates, by id. The session id is run-owned, so its messages are too.
const residue = {
  draftId: null as string | null,
  sessionSeeded: false,
  brandPref: null as { userId: string; previous: string | null } | null,
};

async function pinActiveBrand(userId: string): Promise<void> {
  const { data } = await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  residue.brandPref = {
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  };
  await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: userId, active_brand_id: BENCH_BRAND }, { onConflict: 'user_id' })
    .throwOnError();
}

async function seedDraft(userId: string): Promise<string> {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 30);
  const dayId = day.toISOString().slice(0, 10);
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .insert({
      brand_id: BENCH_BRAND,
      user_id: userId,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${dayId}T15:00:00.000Z`,
      slot_data: { dayId, weekStart: dayId, timeLabel: '3:00 PM', platform: 'instagram' },
      content_json: {
        copy: { caption: DRAFT_CAPTION },
        content: { format: 'single_image', type: 'image', cta: 'Shop the drop' },
      },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not seed the draft: ${error?.message}`);
  residue.draftId = (data as { id: string }).id;
  return residue.draftId;
}

async function seedSession(userId: string, draftId: string): Promise<void> {
  const now = new Date().toISOString();
  residue.sessionSeeded = true;
  await organic()
    .from('organic_chat_sessions')
    .insert({
      session_id: SESSION_ID,
      brand_id: BENCH_BRAND,
      user_id: userId,
      user_email: BENCH_EMAIL,
      title: `Session content bench ${RUN_ID}`,
      last_message_role: 'assistant',
      last_message_preview: 'Your Instagram post is drafted.',
      last_message_at: now,
    })
    .throwOnError();
  const base = {
    session_id: SESSION_ID,
    brand_id: BENCH_BRAND,
    user_id: userId,
    user_email: BENCH_EMAIL,
  };
  await organic()
    .from('organic_chat_messages')
    .insert({ ...base, role: 'user', content: 'Draft an Instagram post for the autumn drop.' })
    .throwOnError();
  await organic()
    .from('organic_chat_messages')
    .insert({
      ...base,
      role: 'assistant',
      content: 'Your Instagram post is drafted.',
      // The frame a live generation persists; restoreSession parses it with the live parser.
      ui_cards: [
        {
          type: 'ui.pipeline_card',
          data: {
            jobId: JOB_ID,
            brandId: BENCH_BRAND,
            platform: 'instagram',
            status: 'completed',
            preview: { caption: CHIP_CAPTION, imageUrl: null, format: 'single_image' },
            draftId,
          },
        },
      ],
    })
    .throwOnError();
}

type MessageRow = {
  id: number;
  role: string;
  content: string;
  metadata: { references?: Array<{ id: string; type: string }> } | null;
  ui_cards: Array<{ type: string; data: Record<string, unknown> }>;
};

async function sessionMessages(): Promise<MessageRow[]> {
  const { data, error } = await organic()
    .from('organic_chat_messages')
    .select('id, role, content, metadata, ui_cards')
    .eq('session_id', SESSION_ID)
    .order('id', { ascending: true });
  if (error) throw new Error(`could not read the session: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

/* -- the hosted app (same lifecycle as organic-ship.bench.spec.ts) ------------------- */

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
      NEXT_DIST_DIR: '.next/session-content-e2e',
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
  if (residue.draftId) {
    await organic().from('organic_calendar_drafts').delete().eq('id', residue.draftId);
  }
  if (residue.brandPref?.previous) {
    await db
      .schema('brand_profiles')
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

async function openTray(page: Page) {
  await page.getByRole('button', { name: 'Content generated in this session' }).click();
  return page.getByRole('button', { name: CHIP_CAPTION, exact: true });
}

test('organic session tray: list, drag to the composer, the agent follows the pointer', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  currentPage = page;
  // The panel swallows a failed history fetch, so the bench records what the fetch returned.
  page.on('response', (response) => {
    if (!response.url().includes(`/sessions/${SESSION_ID}/messages`)) return;
    void response
      .text()
      .then((body) => notes.push(`history fetch ${response.status()}: ${body.slice(0, 300)}`))
      .catch(() => notes.push(`history fetch ${response.status()}: body unreadable`));
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && notes.length < 40)
      notes.push(`console: ${message.text().slice(0, 200)}`);
  });

  const session = await mintSessionBundleForEmail(BENCH_EMAIL);
  await context.clearCookies();
  await context.addCookies(session.state.cookies);
  let draftId = '';

  const seeded = await step(
    'setup: a real draft and a session whose history generated it',
    async () => {
      await pinActiveBrand(session.userId);
      draftId = await seedDraft(session.userId);
      await seedSession(session.userId, draftId);
      return `session ${SESSION_ID}, draft ${draftId}`;
    },
  );
  expect(seeded).toBe(true);

  const editor = page.getByRole('textbox', { name: 'Message the organic agent' });

  const listed = await step('the Session tray lists the draft the session generated', async () => {
    await page.goto(`${APP}/organic?tab=agent&sessionId=${SESSION_ID}`, NAV);
    await expect(page.getByText('Your Instagram post is drafted.')).toBeVisible({
      timeout: 180_000,
    });
    const trigger = page.getByRole('button', { name: 'Content generated in this session' });
    await expect(trigger).toContainText('1');
    await expect(await openTray(page)).toBeVisible();
    return 'one tile, labelled with the pipeline card caption';
  });

  const dropped = await step('dragging the tile onto the composer drops a draft chip', async () => {
    const tile = page.getByRole('button', { name: CHIP_CAPTION, exact: true });
    await tile.dragTo(editor);
    const chip = editor.locator('[data-mention-chip="true"]');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText(CHIP_CAPTION);
    return 'native HTML5 drag, one chip';
  });

  // The next step spends a real agent turn; without a chip it would only grade a turn that
  // never carried the pointer.
  expect(listed && dropped, 'stopped before the agent turn: no chip to send').toBe(true);

  await step('the sent turn persists the draft reference', async () => {
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(
      ' Read this draft and quote its current caption exactly, word for word. Do not change anything.',
    );
    await page.keyboard.press('Enter');
    await expect
      .poll(
        async () =>
          (await sessionMessages()).some(
            (row) =>
              row.role === 'user' &&
              row.metadata?.references?.some((ref) => ref.type === 'draft' && ref.id === draftId),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
    return `metadata.references carries draft ${draftId}`;
  });

  await step(
    'the agent follows the pointer: getDraft on that id, and quotes the real caption',
    async () => {
      let answer: MessageRow | undefined;
      await expect
        .poll(
          async () => {
            const rows = await sessionMessages();
            answer = rows.filter((row) => row.role === 'assistant').at(-1);
            return rows.filter((row) => row.role === 'assistant').length;
          },
          { timeout: 300_000, intervals: [3_000] },
        )
        .toBe(2);
      const calls = (answer?.ui_cards ?? []).filter((frame) => frame.type === 'tool.call');
      const getDraft = calls.find(
        (frame) =>
          frame.data.toolName === 'getDraft' &&
          (frame.data.args as { draftId?: string })?.draftId === draftId,
      );
      expect(
        getDraft,
        `tool calls: ${calls.map((frame) => String(frame.data.toolName)).join(', ') || 'none'}`,
      ).toBeTruthy();
      expect(answer?.content).toContain(SECRET);
      return `getDraft(${draftId}) called; the answer quotes ${SECRET}, which only the row holds`;
    },
  );

  await step('clicking a tile inserts the same chip', async () => {
    await expect(editor.locator('[data-mention-chip="true"]')).toHaveCount(0, { timeout: 30_000 });
    await (await openTray(page)).click();
    await expect(editor.locator('[data-mention-chip="true"]')).toContainText(CHIP_CAPTION);
    return 'click path';
  });

  notes.push(
    'seeded: the session history and the draft (a live generation is not what is under test)',
  );
  notes.push(
    'unexercised: the Jaina tray end to end — derivation unit-pinned, media_asset resolution shared',
  );
  reachedTheEnd = true;
  expect(graded.filter((result) => result.grade === 'FAIL').map((result) => result.step)).toEqual(
    [],
  );
});
