import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// jaina:corpus:screenshots — the 20 depth-corpus answers, as the reader sees them (jaina-prism
// Phase 3 gate: "screenshots of the 20 corpus answers", for Ramiro's review, decision 17).
//
// A real Chrome drives the real /scale?tab=jaina chat as the Easy Fit owner against the Backend
// the config names, asks each depth-corpus question in a fresh conversation, and captures the
// finished report at 1280px. A turn that stops on the business-result survey is answered the way
// a person answers it — "conversaciones" / "conversations", the controlled benchmark's result
// (Duane, 10-19) — and the report after it is the one captured.
//
// ── WRITES ── the bench user's active-brand preference (restored when it was another brand) and
// the conversations the asks create, deleted at the end through the product's DELETE endpoint.
// Output: <out>/<task-id>.png and <out>/manifest.json (default artifacts/factory/jaina/phase3/).
//
// Usage: cd Continuum-Frontend && bunx playwright test --config playwright.jaina-corpus-screenshots.config.ts
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());
loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const API_URL = process.env.JAINA_CORPUS_SHOTS_API_URL ?? 'http://localhost:4002';
const CORPUS = resolve(
  process.env.JAINA_CORPUS_PATH ??
    resolve(__dirname, '../../Continuum-Backend/App/agents-ts/Jaina/eval/golden/depth-corpus.json'),
);
const OUT_DIR = resolve(
  process.env.JAINA_CORPUS_SHOTS_DIR ?? resolve(__dirname, '../../artifacts/factory/jaina/phase3'),
);
const TURN_TIMEOUT_MS = 12 * 60_000;
/** The marker under a turn that stopped on a clarification (the business result, when the account's
 *  is unset). Exact text: the sidebar's conversation titles also say "Clarification requested". */
const CLARIFICATION = /^(?:Needs your input|Clarification needed\.?)$/i;

type Task = { id: string; question: string };
type Shot = {
  id: string;
  question: string;
  file: string | null;
  sessionId: string | null;
  surveyAnswered: boolean;
  note: string | null;
};

const tasks: Task[] = (JSON.parse(readFileSync(CORPUS, 'utf8')) as { tasks: Task[] }).tasks;
const notes: string[] = [];
const recorder = createBenchRecorder('jaina:corpus:screenshots', notes);
const shots: Shot[] = [];
const createdSessions = new Set<string>();
let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;

const admin = createClient(PROD_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const subjectOf = (token: string): string =>
  (
    JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      sub: string;
    }
  ).sub;

async function selectBrand(brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[corpus-screenshots] brand switch failed: ${error.message}`);
}

async function startFreshConversation(page: Page): Promise<void> {
  await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
  const composer = page.getByRole('textbox', { name: 'Message Jaina' });
  await expect(composer).toBeVisible({ timeout: 240_000 });
  // The panel restores the newest thread on mount; a "new" clicked before that lands is undone.
  const conversations = page.locator('[data-testid^="jaina-conversation-"]');
  const restored = await conversations
    .first()
    .waitFor({ state: 'visible', timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  if (restored) await expect(conversations.first()).toBeDisabled({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Create new conversation' }).click();
  await expect(conversations.and(page.locator(':disabled'))).toHaveCount(0, { timeout: 15_000 });
}

/** Sends one message and waits for its stream to finish; the request's session id is kept. */
async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'Message Jaina' });
  await composer.click();
  await composer.fill(text);
  const streamed = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/api/agents/jaina/chat/stream'),
    { timeout: 120_000 },
  );
  // A send that throws must not leave this wait to reject on its own when the page closes.
  void streamed.catch(() => undefined);
  await page.getByRole('button', { name: 'Send message' }).click();
  const response = await streamed;
  try {
    const body = response.request().postDataJSON() as {
      context?: { sessionId?: string };
      sessionId?: string;
    };
    const sessionId = body?.context?.sessionId ?? body?.sessionId;
    if (sessionId) createdSessions.add(sessionId);
  } catch {
    // an unreadable body leaves the id to the conversation-create listener below
  }
  await Promise.race([
    response.finished(),
    new Promise((done) => setTimeout(done, TURN_TIMEOUT_MS)),
  ]);
  await page.waitForTimeout(2_000);
}

const reportRoot = (page: Page) =>
  page.locator('[data-report-section="answer"]').last().locator('xpath=..');

async function shoot(context: BrowserContext, task: Task): Promise<void> {
  const page = await context.newPage();
  page.on('response', async (r) => {
    if (
      r.request().method() === 'POST' &&
      r.url().endsWith('/api/agents/jaina/chat/conversations')
    ) {
      const body = (await r.json().catch(() => null)) as { session_id?: string } | null;
      if (body?.session_id) createdSessions.add(body.session_id);
    }
  });
  const shot: Shot = {
    id: task.id,
    question: task.question,
    file: null,
    sessionId: null,
    surveyAnswered: false,
    note: null,
  };
  try {
    await startFreshConversation(page);
    await send(page, task.question);
    await reportRoot(page)
      .waitFor({ state: 'visible', timeout: 90_000 })
      .catch(() => undefined);
    if (
      await page
        .getByText(CLARIFICATION)
        .last()
        .isVisible()
        .catch(() => false)
    ) {
      // The business-result clarification: answered as a person would, then the report it leads to.
      const reports = await reportRoot(page).count();
      await send(page, /[¿¡ñáéíóú]/u.test(task.question) ? 'conversaciones' : 'conversations');
      shot.surveyAnswered = true;
      await expect
        .poll(() => reportRoot(page).count(), { timeout: 120_000 })
        .toBeGreaterThan(reports)
        .catch(() => undefined);
    }
    await page.waitForTimeout(2_000);
    mkdirSync(OUT_DIR, { recursive: true });
    const file = resolve(OUT_DIR, `${task.id}.png`);
    // A report is captured whole; an answer in plain text (a lookup the fast path answers) is the
    // chat as the reader sees it, once the composer is back.
    if ((await reportRoot(page).count()) > 0) await reportRoot(page).screenshot({ path: file });
    else {
      await expect(page.getByRole('textbox', { name: 'Message Jaina' })).toBeVisible({
        timeout: 60_000,
      });
      await page.screenshot({ path: file });
    }
    shot.file = file;
    recorder.record(
      task.id,
      'PASS',
      `captured${shot.surveyAnswered ? ' after the result survey' : ''}`,
    );
  } catch (error) {
    shot.note = error instanceof Error ? error.message.slice(0, 300) : String(error);
    recorder.record(task.id, 'FAIL', shot.note);
  } finally {
    shot.sessionId = [...createdSessions].at(-1) ?? null;
    shots.push(shot);
    await page.close().catch(() => undefined);
  }
}

test.describe('Jaina — the 20 depth-corpus answers, as the reader sees them', () => {
  test.describe.configure({ mode: 'parallel' });

  test.beforeAll(async () => {
    // One magic link per email at a time: links minted at once invalidate each other ("Email link
    // is invalid or has expired"), so each worker mints in turn.
    await new Promise((done) => setTimeout(done, test.info().parallelIndex * 10_000));
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    memberToken = session.accessToken;
    memberId = subjectOf(memberToken);
    storageState = session.state;
    const { data } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', memberId)
      .maybeSingle();
    originalBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    await selectBrand(EASYFIT_BRAND_ID);
    notes.push(`backend ${API_URL} · corpus ${CORPUS}`);
  });

  test.afterAll(async () => {
    for (const sessionId of createdSessions) {
      const response = await fetch(
        `${API_URL}/api/agents/jaina/chat/conversations/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${memberToken}` },
          signal: AbortSignal.timeout(20_000),
        },
      ).catch(() => ({ status: 'error' }));
      notes.push(`cleanup: DELETE conversation ${sessionId} → ${response.status}`);
    }
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    // The client session this worker minted ends with it (sign out what a bench creates).
    const revoked = await revokeBenchSession(storageState, memberToken).catch((error: unknown) => ({
      sessionId: '?',
      revoked: false,
      detail: String(error),
    }));
    notes.push(
      `session ${revoked.sessionId}: ${revoked.revoked ? 'signed out' : `NOT signed out — ${revoked.detail}`}`,
    );
    mkdirSync(OUT_DIR, { recursive: true });
    const manifest = resolve(OUT_DIR, `manifest-${process.pid}.json`);
    writeFileSync(
      manifest,
      JSON.stringify({ captured_at: new Date().toISOString(), shots }, null, 2),
    );
    recorder.print();
  });

  for (const task of tasks) {
    test(task.id, async ({ browser }) => {
      test.setTimeout(2 * TURN_TIMEOUT_MS + 6 * 60_000);
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1280, height: 3200 },
      });
      try {
        await shoot(context, task);
      } finally {
        await context.close().catch(() => undefined);
      }
    });
  }
});
