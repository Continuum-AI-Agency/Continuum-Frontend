import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type OrganicStreamFrame,
  organicStreamFrameSchema,
  parseFrame,
} from '@continuum/contracts';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// organic:agent:chat:live:e2e:bench
//
// WHAT IT PROVES — the two human gates between the Organic agent and a live post, driven
// through the real browser:
//
//   Stage B (no model): the planner's Draft preview "Approve & Schedule" runs the gated
//     chain POST …/drafts/:id/approve → PATCH …/drafts/:id {status:'scheduled'}, the row is
//     scheduled, and the user is told so.
//   Stage A (live model): a message typed into the Organic agent composer is answered by
//     the LIVE stream; the stream carries a `tool.approval_required` frame for the gated
//     approveDraft; the card's Approve / Deny reach the agent as an `approvals` turn, and
//     the draft row moves (Approve) or does not (Deny).
//
// REAL: hosted Postgres + storage + GoTrue, a bench-owned Fastify Backend on hosted running
// THIS working tree (so the real agent, tool gate, HMAC-signed approval and persistence),
// Gemini via the live agent turn (Stage A only — the one spend, owner-approved), the Next
// app and its /api/organic/agent/chat proxy, real Chrome.
//
// SEEDED: only objects — publishable drafts on the bench brand (a real uploaded JPEG,
// a caption that carries the draft's title so the agent can find it with getDraft), tagged
// slot_data.benchTag and scheduled 10.5 years out. Every chat line comes from the stream.
// Also written, and undone by key: the bench owner's active-brand preference (put back as
// found — deleted if this run created it), each minted GoTrue session (signed out, which
// cascades the app's per-session brand pin) and the post image. The zero-residue check
// reads every one of them back.
//
// UN-EXERCISED, STATED: the Instagram publish itself. The bench tenant has a REAL Instagram
// account, so every draft that reaches `scheduled` sits 10.5 years out and is deleted by id
// straight after its assertions; the run FAILS if a tagged draft is ever left scheduled.
// The publisher's request shape is organic:publish:e2e:bench's job.
//
// PORTS: the registered script hands Playwright PORT/PLAYWRIGHT_BASE_URL 3134, so its
// config.webServer starts a LOCAL-stack Next there before this file loads (it sources
// .env.local). That server can never be pointed at hosted from here, so this bench spawns
// its own hosted-targeted Next on ORGANIC_AGENT_CHAT_APP_PORT (3144) after
// loadProdSupabaseEnv() — the same split organic-ship.bench.spec.ts makes (3123 vs 3133).
//
// Run: bun run organic:agent:chat:live:e2e:bench        (Stage B only: … -- --grep "stage B")

const BENCH = 'organic:agent:chat:live:e2e:bench';
const TAG = 'organic-agent-chat-live';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.ORGANIC_AGENT_CHAT_APP_PORT ?? 3144);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4424);

// The bench login and its Vivo47-mirror brand: the only brand this bench writes to.
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';

const RUN_ID = `${Date.now()}`;
// Deep-linked, so every chat row this run causes is attributable by one exact session id.
const SESSION_ID = randomUUID();
const title = (suffix: 'approve' | 'deny' | 'stageb') => `LIVE-CHAT-BENCH-${RUN_ID}-${suffix}`;

// Local copy of Continuum-Backend/scripts/_bench/scope.ts (NEVER_DUE_ISO, taggedBenchDrafts,
// deleteBenchDrafts, SCOPE_TABLES) — a Frontend spec may not import the Backend _bench kit.
const NEVER_DUE_DAY = new Date(Date.now() + 10.5 * 365 * 86_400_000).toISOString().slice(0, 10);
const NEVER_DUE_ISO = `${NEVER_DUE_DAY}T15:00:00.000Z`;
const TEN_YEARS_MS = 10 * 365 * 86_400_000;

const STORAGE_BUCKET = 'brand-profile-assets';
const IMAGE_PATH = `${BENCH_BRAND}/organic-agent-chat-live/${RUN_ID}.jpg`;

const notes: string[] = [];
const rec = createBenchRecorder(BENCH, notes);

/* -- hosted service-role reads + cleanup ------------------------------------------- */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const organic = () => db.schema('organic');

type DraftRow = { id: string; status: string; scheduled_date: string | null };

async function readDraft(draftId: string): Promise<DraftRow> {
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .select('id, status, scheduled_date')
    .eq('id', draftId)
    .single();
  if (error || !data) throw new Error(`could not read draft ${draftId}: ${error?.message}`);
  return data as DraftRow;
}

function expectNeverDue(row: DraftRow): void {
  expect(row.scheduled_date, 'scheduled_date').not.toBeNull();
  expect(Date.parse(row.scheduled_date ?? '')).toBeGreaterThanOrEqual(Date.now() + TEN_YEARS_MS);
}

async function taggedDrafts(): Promise<DraftRow[]> {
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .select('id, status, scheduled_date')
    .eq('brand_id', BENCH_BRAND)
    .eq('slot_data->>benchTag', TAG);
  if (error) throw new Error(`tagged drafts unreadable: ${error.message}`);
  return (data ?? []) as DraftRow[];
}

async function deleteDrafts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await organic()
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', BENCH_BRAND)
    .in('id', ids);
  if (error) throw new Error(`could not delete bench drafts: ${error.message}`);
}

async function sweepTagged(): Promise<DraftRow[]> {
  const rows = await taggedDrafts();
  await deleteDrafts(rows.map((row) => row.id));
  return rows;
}

// SCOPE_TABLES' session-keyed tables in FK delete order. Run events carry no session id,
// so they go first, by the run ids found under this session.
const SESSION_TABLES = [
  ['organic_agent_runs', 'run_id'],
  ['post_generation_jobs', 'job_id'],
  ['organic_agent_plans', 'plan_id'],
  ['organic_chat_messages', 'id'],
  ['organic_chat_sessions', 'id'],
  ['organic_agent_turn_metrics', 'id'],
] as const;
const seenRunIds = new Set<string>();

async function sessionRowIds(table: string, pk: string): Promise<Array<string | number>> {
  const { data, error } = await organic()
    .from(table)
    .select(pk)
    .eq('session_id', SESSION_ID)
    .eq('brand_id', BENCH_BRAND);
  if (error) throw new Error(`${table} unreadable: ${error.message}`);
  return ((data ?? []) as unknown as Array<Record<string, string | number>>).map((row) => row[pk]);
}

async function runEventCount(): Promise<number> {
  if (seenRunIds.size === 0) return 0;
  const { count, error } = await organic()
    .from('organic_agent_run_events')
    .select('run_id', { count: 'exact', head: true })
    .in('run_id', [...seenRunIds]);
  if (error) throw new Error(`organic_agent_run_events unreadable: ${error.message}`);
  return count ?? 0;
}

async function sweepSession(): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const id of await sessionRowIds('organic_agent_runs', 'run_id')) seenRunIds.add(String(id));
  if (seenRunIds.size > 0) {
    const { count, error } = await organic()
      .from('organic_agent_run_events')
      .delete({ count: 'exact' })
      .in('run_id', [...seenRunIds]);
    if (error) throw new Error(`organic_agent_run_events delete failed: ${error.message}`);
    deleted.organic_agent_run_events = count ?? 0;
  }
  for (const [table, pk] of SESSION_TABLES) {
    const ids = await sessionRowIds(table, pk);
    if (ids.length === 0) continue;
    const { count, error } = await organic().from(table).delete({ count: 'exact' }).in(pk, ids);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    deleted[table] = count ?? 0;
  }
  return deleted;
}

async function sessionResidue(): Promise<Record<string, number>> {
  const residue: Record<string, number> = { organic_agent_run_events: await runEventCount() };
  for (const [table, pk] of SESSION_TABLES) {
    residue[table] = (await sessionRowIds(table, pk)).length;
  }
  return residue;
}

/** The approval ids the interrupted turn persisted — what the next turn pairs its answer with. */
async function pendingApprovalIds(): Promise<string[]> {
  const { data, error } = await organic()
    .from('organic_chat_messages')
    .select('metadata')
    .eq('session_id', SESSION_ID)
    .eq('brand_id', BENCH_BRAND)
    .eq('role', 'assistant');
  if (error) throw new Error(`organic_chat_messages unreadable: ${error.message}`);
  type Row = { metadata: { pendingApprovals?: Array<{ approvalId?: string }> } | null };
  return ((data ?? []) as Row[]).flatMap((row) =>
    (row.metadata?.pendingApprovals ?? []).map((approval) => approval.approvalId ?? ''),
  );
}

const prefs = () => db.schema('brand_profiles').from('user_brand_preferences');
// Each user's active brand as this run FIRST found it; null = no row, so the run made it.
const brandPrefs = new Map<string, string | null>();

async function pinActiveBrand(userId: string): Promise<void> {
  if (!brandPrefs.has(userId)) {
    const { data, error } = await prefs()
      .select('active_brand_id')
      .eq('user_id', userId)
      .maybeSingle();
    // A failed read must not pass for "no row": cleanup would delete the user's real one.
    if (error) throw new Error(`user_brand_preferences unreadable: ${error.message}`);
    brandPrefs.set(userId, (data as { active_brand_id: string } | null)?.active_brand_id ?? null);
  }
  await prefs()
    .upsert({ user_id: userId, active_brand_id: BENCH_BRAND }, { onConflict: 'user_id' })
    .throwOnError();
}

async function restoreBrandPrefs(): Promise<void> {
  for (const [userId, previous] of brandPrefs) {
    const { error } = previous
      ? await prefs().upsert(
          { user_id: userId, active_brand_id: previous },
          { onConflict: 'user_id' },
        )
      : await prefs().delete().eq('user_id', userId);
    if (error) throw new Error(`user_brand_preferences restore failed: ${error.message}`);
    notes.push(
      `active-brand preference ${userId}: ${previous ? `restored to ${previous}` : 'created by this run, deleted'}`,
    );
  }
}

/** Preference rows this run created — each must be gone by the residue read. */
async function createdPrefRows(): Promise<number> {
  const created = [...brandPrefs].flatMap(([userId, previous]) => (previous ? [] : [userId]));
  if (created.length === 0) return 0;
  const { count, error } = await prefs()
    .select('user_id', { count: 'exact', head: true })
    .in('user_id', created);
  if (error) throw new Error(`user_brand_preferences unreadable: ${error.message}`);
  return count ?? 0;
}

// Every GoTrue session this run minted. Rendering the app pins each one in
// user_session_brands (resolve_active_brand_for_session); signing the session out takes
// that pin with it through the FK cascade.
const minted: Array<{ accessToken: string; sessionId: string }> = [];

function sessionIdOf(accessToken: string): string {
  const claims: unknown = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  );
  const sessionId = (claims as { session_id?: unknown } | null)?.session_id;
  if (typeof sessionId !== 'string') throw new Error('the minted token carries no session_id');
  return sessionId;
}

async function signOutMinted(): Promise<void> {
  notes.push(
    `minted sessions: ${minted.length}, brand pins before sign-out: ${await sessionPinRows()}`,
  );
  for (const { accessToken } of minted) {
    // 'local' = this session only; the default 'global' would end every bench-owner session.
    const { error } = await db.auth.admin.signOut(accessToken, 'local');
    if (error) throw new Error(`could not sign out a minted session: ${error.message}`);
  }
}

async function sessionPinRows(): Promise<number> {
  if (minted.length === 0) return 0;
  const { count, error } = await db
    .schema('brand_profiles')
    .from('user_session_brands')
    .select('session_id', { count: 'exact', head: true })
    .in(
      'session_id',
      minted.map((session) => session.sessionId),
    );
  if (error) throw new Error(`user_session_brands unreadable: ${error.message}`);
  return count ?? 0;
}

/* -- fixtures: one real JPEG and publishable drafts that carry it ------------------- */

let imageUrl = '';

async function uploadPostImage(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organic-agent-chat-live-'));
  const file = path.join(dir, 'post.jpg');
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1080x1350:rate=1',
    '-frames:v',
    '1',
    file,
  ]);
  const image = fs.readFileSync(file);
  fs.rmSync(dir, { recursive: true, force: true });
  const upload = await db.storage
    .from(STORAGE_BUCKET)
    .upload(IMAGE_PATH, image, { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw new Error(`image upload failed: ${upload.error.message}`);
  const signed = await db.storage.from(STORAGE_BUCKET).createSignedUrl(IMAGE_PATH, 6 * 3600);
  if (!signed.data?.signedUrl)
    throw new Error(`could not sign the image: ${signed.error?.message}`);
  return signed.data.signedUrl;
}

/**
 * One Instagram feed post that clears every approve gate (caption, media, quality) and
 * carries its own title in the caption — getDraft shows the model the caption, and
 * listDrafts shows no titles at all.
 */
async function seedDraft(userId: string, draftTitle: string): Promise<string> {
  const caption = `${draftTitle} is a bench draft: it is scheduled years out and deleted by id when the run ends, so it never publishes.`;
  const mediaSuggestion = {
    kind: 'image',
    mediaStatus: 'ready',
    bucket: STORAGE_BUCKET,
    url: IMAGE_PATH,
    assetUrl: imageUrl,
    signedUrl: imageUrl,
    alt: 'Bench test pattern',
  };
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .insert({
      brand_id: BENCH_BRAND,
      user_id: userId,
      platform: 'instagram',
      // NULL, not the planner's 'unassigned': any truthy value skips the read-time bind of
      // the brand's single Instagram account (bindResolvableDraftAccount) → account_missing.
      platform_account_id: null,
      status: 'draft',
      scheduled_date: NEVER_DUE_ISO,
      media_stage: 'realized',
      slot_data: {
        benchTag: TAG,
        dayId: NEVER_DUE_DAY,
        weekStart: NEVER_DUE_DAY,
        timeLabel: '3:00 PM',
        platform: 'instagram',
        title: draftTitle,
        draftSnapshot: {
          title: draftTitle,
          status: 'draft',
          platforms: ['instagram'],
          format: 'Post',
          timeLabel: '3:00 PM',
          dateLabel: NEVER_DUE_DAY,
          mediaCount: 1,
          mediaSuggestion,
        },
      },
      content_json: {
        copy: { caption, hashtags: { high: [], medium: [], low: [] }, claims: [] },
        content: { format: 'Post', type: 'post', titleTopic: draftTitle },
        creative: { creativeIdea: draftTitle, mediaSuggestion },
        quality: { passed: true },
      },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not seed the draft: ${error?.message}`);
  return (data as { id: string }).id;
}

/* -- the hosted app (same shape as organic-ship.bench.spec.ts) ---------------------- */

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** SIGTERM the child's whole process group, then SIGKILL whatever is still there after 5s. */
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
      `${APP} already answers. This bench needs its own hosted-targeted Next server there; ` +
        'a foreign one may read the local stack. Stop it or set ORGANIC_AGENT_CHAT_APP_PORT.',
    );
  }
  const child: ChildProcess = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/organic-agent-chat-live-e2e-hosted',
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

async function signIn(context: BrowserContext): Promise<string> {
  const session = await mintSessionBundleForEmail(BENCH_EMAIL);
  minted.push({ accessToken: session.accessToken, sessionId: sessionIdOf(session.accessToken) });
  await context.clearCookies();
  await context.addCookies(session.state.cookies);
  return session.userId;
}

/* -- the agent turn ------------------------------------------------------------------ */

type ChatBody = { sessionId?: unknown; messages?: unknown; approvals?: unknown };
type ApprovalCard = { approvalId: string; toolName: string };

/** Marks a waiter handled so a step that dies before awaiting it is not an unhandled rejection. */
function armed<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

const isChatPost = (response: Response): boolean =>
  response.request().method() === 'POST' &&
  new URL(response.url()).pathname === '/api/organic/agent/chat';

function parseFrames(ndjson: string): OrganicStreamFrame[] {
  return ndjson.split('\n').flatMap((line) => {
    const frame = line.trim() ? parseFrame(line, organicStreamFrameSchema) : null;
    return frame ? [frame] : [];
  });
}

function describeTurn(frames: OrganicStreamFrame[]): string {
  const calls = frames.flatMap((f) => (f.type === 'tool.call' ? [f.data.toolName] : []));
  const results = frames.flatMap((f) =>
    f.type === 'tool.result' ? [`${f.data.toolName}:${f.data.ok ? 'ok' : 'error'}`] : [],
  );
  const errors = frames.flatMap((f) => (f.type === 'response.error' ? [f.data.message] : []));
  return `${frames.length} frames, calls=[${calls.join(',')}], results=[${results.join(',')}]${
    errors.length > 0 ? `, errors=[${errors.join(' | ').slice(0, 300)}]` : ''
  }`;
}

/** A refused turn's body is the reason; a 200's body is the stream, read by the caller. */
async function expectChatOk(response: Response): Promise<void> {
  if (response.status() === 200) return;
  throw new Error(`chat POST ${response.status()}: ${(await response.text()).slice(0, 300)}`);
}

let liveTurns = 0;

/** Type → Send → the live stream, read to its end. Asserts the wire, returns the frames. */
async function sendTurn(page: Page, panel: Locator, prompt: string): Promise<OrganicStreamFrame[]> {
  const composer = panel.getByRole('textbox', { name: 'Message the organic agent' });
  const send = panel.getByRole('button', { name: 'Send message' });
  await expect(composer).toBeEditable({ timeout: 120_000 });
  const responded = armed(page.waitForResponse(isChatPost, { timeout: 180_000 }));
  await composer.pressSequentially(prompt, { delay: 5 });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  // A toast can park over Send in the bottom-right corner (organic-loop-fe.ts hit one); Enter
  // is the same submit, and a keypress cannot be intercepted by an overlay.
  await send.click({ timeout: 15_000 }).catch(async () => {
    notes.push('stage A: Send was covered; submitted with Enter');
    await composer.press('Enter');
  });
  const response = await responded;
  liveTurns += 1;
  const body = response.request().postDataJSON() as ChatBody;
  expect(body.sessionId, "the turn rides this run's own session").toBe(SESSION_ID);
  await expectChatOk(response);
  expect(response.headers()['content-type']).toContain('application/x-ndjson');
  const frames = parseFrames(await response.text());
  notes.push(`turn "${prompt}": ${describeTurn(frames)}`);
  return frames;
}

/**
 * The prompt, then exactly ONE explicit retry. A card for any other tool or draft is a FAIL
 * with no click — Approve on a publishDraft card would post to the real account.
 */
async function raiseCard(
  page: Page,
  panel: Locator,
  draftTitle: string,
  draftId: string,
): Promise<ApprovalCard> {
  const prompts = [
    `Approve the draft post titled '${draftTitle}'.`,
    `Use the approveDraft tool on the draft post titled '${draftTitle}'.`,
  ];
  for (const [attempt, prompt] of prompts.entries()) {
    const frames = await sendTurn(page, panel, prompt);
    const cards = frames.flatMap((f) => (f.type === 'tool.approval_required' ? [f.data] : []));
    if (cards.length === 0) continue;
    expect(cards, 'one approval card in the turn').toHaveLength(1);
    const [card] = cards;
    expect(card.toolName).toBe('approveDraft');
    expect((card.input as { draftId?: unknown } | null)?.draftId).toBe(draftId);
    if (attempt > 0) notes.push(`stage A: "${draftTitle}" needed the one retry prompt`);
    return { approvalId: card.approvalId, toolName: card.toolName };
  }
  throw new Error('no tool.approval_required frame after the prompt and its one retry');
}

async function decisionPath(
  page: Page,
  panel: Locator,
  userId: string,
  decision: 'approve' | 'deny',
): Promise<void> {
  const draftTitle = title(decision);
  const approved = decision === 'approve';
  const label = approved ? 'Approve' : 'Deny';
  const draftId = await rec.step(`stage A ${decision}: seed a publishable tagged draft`, () =>
    seedDraft(userId, draftTitle),
  );
  try {
    const card = await rec.step(
      `stage A ${decision}: POST /api/organic/agent/chat is 200 x-ndjson and streams tool.approval_required for approveDraft on this draft`,
      () => raiseCard(page, panel, draftTitle, draftId),
    );
    notes.push(
      `stage A ${decision}: approvalId ${card.approvalId} (${card.toolName} on ${draftId})`,
    );

    const approveButton = panel.getByRole('button', { name: 'Approve', exact: true });
    const denyButton = panel.getByRole('button', { name: 'Deny', exact: true });
    await rec.step(
      `stage A ${decision}: the card shows Approve and Deny in the agent panel`,
      async () => {
        await expect(approveButton).toBeVisible({ timeout: 60_000 });
        await expect(denyButton).toBeVisible({ timeout: 60_000 });
      },
    );

    await rec.step(`stage A ${decision}: the interrupted turn persisted pendingApprovals`, () =>
      expect
        .poll(pendingApprovalIds, { timeout: 60_000, intervals: [1_000] })
        .toContain(card.approvalId),
    );

    await rec.step(
      `stage A ${decision}: ${label} posts messages:[] + approvals:[{id, approved:${approved}}]`,
      async () => {
        const button = approved ? approveButton : denyButton;
        await expect(button).toBeEnabled({ timeout: 120_000 });
        const followUp = armed(page.waitForResponse(isChatPost, { timeout: 120_000 }));
        await button.click();
        const response = await followUp;
        liveTurns += 1;
        const body = response.request().postDataJSON() as ChatBody;
        expect(body.sessionId).toBe(SESSION_ID);
        expect(body.messages).toEqual([]);
        expect(body.approvals).toEqual([{ id: card.approvalId, approved }]);
        await expectChatOk(response);
        // Read to the end: the resumed turn is where the gated tool runs (or is refused).
        notes.push(
          `resumed turn (${decision}): ${describeTurn(parseFrames(await response.text()))}`,
        );
      },
    );

    await rec.step(
      `stage A ${decision}: the card is gone and nothing says it was not delivered`,
      async () => {
        await expect(denyButton).toHaveCount(0);
        await expect(approveButton).toHaveCount(0);
        await expect(
          page.getByText(approved ? 'Approval not delivered' : 'Denial not delivered'),
        ).toHaveCount(0);
      },
    );

    await rec.step(
      approved
        ? 'stage A approve: the draft is approved/scheduled and still ≥10y out'
        : 'stage A deny: the draft is still a draft, still ≥10y out',
      async () => {
        if (approved) {
          await expect
            .poll(async () => (await readDraft(draftId)).status, { timeout: 30_000 })
            .toMatch(/^(approved|scheduled)$/);
        } else {
          expect((await readDraft(draftId)).status).toBe('draft');
        }
        expectNeverDue(await readDraft(draftId));
      },
    );
  } finally {
    // A scheduled bench draft lives only as long as its assertions.
    await deleteDrafts([draftId]);
  }
}

/* -- the run ------------------------------------------------------------------------ */

// A first visit compiles the route in the bench's own dev server; that is not a hang.
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

test.use({ channel: 'chrome', screenshot: 'only-on-failure' });
// One worker, one Backend, one envelope: a failed test must not restart the worker.
test.describe.configure({ mode: 'serial' });

let backend: LocalBackend | null = null;
let app: { stop: () => Promise<void> } | null = null;
let setupDone = false;
// A run that dies before a stage's last step must not print an envelope that reads green.
const stages = new Map<'stage B' | 'stage A', 'started' | 'finished'>();

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
  const swept = await sweepTagged();
  if (swept.length > 0) {
    notes.push(
      `start sweep deleted ${swept.length} tagged draft(s) left by an earlier run: ${swept
        .map((row) => `${row.id}(${row.status})`)
        .join(', ')}`,
    );
  }
  imageUrl = await uploadPostImage();
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
  app = await startHostedApp(backend.url);
  setupDone = true;
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  // Servers first: a turn still running in the Backend would write rows after the sweep.
  await app?.stop();
  await backend?.stop();
  // Undone by key before the residue read, each on its own so one failure skips none.
  const undo: Array<[string, () => Promise<void>]> = [
    ['restore the active-brand preference', restoreBrandPrefs],
    ['sign out the minted sessions', signOutMinted],
    [
      'remove the post image',
      async () => {
        const { error } = await db.storage.from(STORAGE_BUCKET).remove([IMAGE_PATH]);
        if (error) throw new Error(error.message);
      },
    ],
  ];
  for (const [what, step] of undo) {
    await step().catch((error: unknown) =>
      rec.record(
        `cleanup: ${what}`,
        'FAIL',
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
  try {
    const leftover = await sweepTagged();
    const scheduled = leftover.filter((row) => row.status === 'scheduled');
    rec.record(
      'cleanup: no tagged draft was left scheduled',
      scheduled.length === 0 ? 'PASS' : 'FAIL',
      scheduled.length > 0 ? scheduled.map((row) => row.id).join(', ') : undefined,
    );
    const deleted = await sweepSession();
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await sweepTagged();
    await sweepSession();
    const residue = {
      tagged_drafts: (await taggedDrafts()).length,
      user_brand_preferences_created: await createdPrefRows(),
      user_session_brands: await sessionPinRows(),
      post_image: Number((await db.storage.from(STORAGE_BUCKET).exists(IMAGE_PATH)).data),
      ...(await sessionResidue()),
    };
    const left = Object.values(residue).reduce((sum, n) => sum + n, 0);
    notes.push(`cleanup deleted for session ${SESSION_ID}: ${JSON.stringify(deleted)}`);
    rec.record(
      "cleanup: zero residue (tagged drafts, this session's rows, created brand preference, minted-session brand pins, post image)",
      left === 0 ? 'PASS' : 'FAIL',
      JSON.stringify(residue),
    );
  } catch (error) {
    rec.record('cleanup', 'FAIL', error instanceof Error ? error.message : String(error));
  }
  if (!setupDone) rec.record('setup: hosted Backend + Next came up', 'FAIL', 'see the hook error');
  for (const stage of ['stage B', 'stage A'] as const) {
    const state = stages.get(stage);
    if (!state)
      rec.record(`${stage}: ran`, 'SKIP', 'not selected, or skipped after an earlier failure');
    else if (state === 'started') rec.record(`${stage}: reached its last step`, 'FAIL', 'aborted');
  }
  notes.push(`stage A live agent turns (Gemini) this run: ${liveTurns}`);
  notes.push(
    'unexercised: the Instagram publish itself — every scheduled draft sat 10.5y out and was deleted by id',
  );
  rec.print();
});

test('stage B — Approve & Schedule in the Draft preview schedules the draft', async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  stages.set('stage B', 'started');
  page.setDefaultTimeout(60_000);
  const userId = await signIn(context);
  await pinActiveBrand(userId);
  let draftId = '';
  try {
    draftId = await rec.step('stage B: seed a publishable tagged draft 10.5y out', () =>
      seedDraft(userId, title('stageb')),
    );
    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await rec.step('stage B: ?draftId= opens the Draft preview', async () => {
      await page.goto(`${APP}/organic?tab=planner&draftId=${draftId}`, NAV);
      await expect(preview).toBeVisible({ timeout: 180_000 });
    });

    const approveButton = preview.getByRole('button', { name: 'Approve & Schedule', exact: true });
    const approveCall = armed(
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/api/organic/calendar/drafts/${draftId}/approve`),
        { timeout: 90_000 },
      ),
    );
    const scheduleCall = armed(
      page.waitForResponse(
        (r) =>
          r.request().method() === 'PATCH' &&
          r.url().endsWith(`/api/organic/calendar/drafts/${draftId}`) &&
          (r.request().postData() ?? '').includes('"status"'),
        { timeout: 90_000 },
      ),
    );
    await rec.step('stage B: Approve & Schedule is enabled and clicked', async () => {
      await expect(approveButton).toBeEnabled({ timeout: 60_000 });
      await approveButton.click();
    });
    await rec.step('stage B: POST …/approve (no request body) answers 200', async () => {
      const response = await approveCall;
      expect(response.request().postData()).toBeNull();
      expect(response.status(), (await response.text()).slice(0, 300)).toBe(200);
    });
    await rec.step("stage B: PATCH …/drafts/:id {status:'scheduled'} succeeds", async () => {
      const response = await scheduleCall;
      expect(response.request().postDataJSON()).toEqual({ status: 'scheduled' });
      expect(response.ok(), (await response.text()).slice(0, 300)).toBe(true);
    });
    await rec.step('stage B: the toast reads "Approved & scheduled"', () =>
      expect(page.getByText('Approved & scheduled', { exact: true })).toBeVisible({
        timeout: 15_000,
      }),
    );
    await rec.step('stage B: the row is scheduled and still ≥10y out', async () => {
      const row = await readDraft(draftId);
      expect(row.status).toBe('scheduled');
      expectNeverDue(row);
    });
    stages.set('stage B', 'finished');
  } finally {
    if (draftId) await deleteDrafts([draftId]);
  }
});

test('stage A — the live agent stream raises the approveDraft card; Approve and Deny reach it', async ({
  page,
  context,
}) => {
  test.setTimeout(1_200_000);
  stages.set('stage A', 'started');
  page.setDefaultTimeout(60_000);
  const userId = await signIn(context);
  await pinActiveBrand(userId);

  // Next keeps prior pages mounted; only the visible panel is this one.
  const panel = page.locator('[data-tour-id="organic-agent-panel"]:visible');
  await rec.step("stage A: the agent panel opens on this run's own session", async () => {
    const hydrated = armed(
      page.waitForRequest(
        (r) => r.url().includes(`/api/organic/agent/sessions/${SESSION_ID}/messages`),
        { timeout: 180_000 },
      ),
    );
    await page.goto(`${APP}/organic?tab=agent&sessionId=${SESSION_ID}`, NAV);
    await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 120_000 });
    await expect(panel.getByRole('textbox', { name: 'Message the organic agent' })).toBeVisible({
      timeout: 180_000,
    });
    // The deep link was adopted (the panel read this session) before any model spend.
    await hydrated;
  });

  // Each path is graded on its own, so one red path still leaves the other's evidence.
  const outcomes: string[] = [];
  for (const decision of ['approve', 'deny'] as const) {
    await decisionPath(page, panel, userId, decision).catch((error: unknown) => {
      outcomes.push(
        `${decision}: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
      );
    });
  }
  stages.set('stage A', 'finished');
  expect(outcomes).toEqual([]);
});
