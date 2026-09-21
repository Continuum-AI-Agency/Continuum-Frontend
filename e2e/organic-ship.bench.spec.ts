import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// organic:ship:fe:e2e:bench
//
// WHAT IT PROVES — the Frontend halves of three organic parity rows, on the real hosted
// stack, graded against the rows the product actually writes and reads:
//
//   1. ship-per-platform-options — in the planner's Publish tab a person sets Instagram's
//      first comment, a cover frame and then an uploaded cover image, and a different
//      TikTok cover; each lands in organic_calendar_drafts.content_json.publishOptions
//      under ITS platform, and comes back into the tab after a reload. TikTok's AI label
//      shows locked on because the draft publishes a generated reel.
//   2. learn-best-time-frequency — the organic dashboard's Best time and Posting frequency
//      tiles show exactly the slots and cadence public.organic_best_times returns.
//   3. learn-platform-compare-organic-paid — /dashboard?view=all shows per-platform organic
//      reach and Meta spend for one period, and both equal the reporting_cache rows the
//      edges wrote for exactly those dates.
//
// REAL: hosted Postgres + storage + GoTrue, the deployed edges (organic-reporting,
// paid-media-reporting, library-upload), a bench-owned Fastify Backend on hosted, the
// Next app, real Chrome (Playwright's Chromium cannot decode the H.264 reel).
//
// UN-EXERCISED, STATED:
//   · The live first comment read back from the Graph API. Owner decision: nothing posts
//     publicly this cycle. That the saved options reach the publisher is
//     publisher.spec.ts ("publishes with the options saved on the draft…"); the request
//     shape each platform receives is organic:publish:options:e2e:bench (Wave 1).
//   · A ≥20-post brand's tiles. The only prod brand over the bar is a client's; the bench
//     login's brand has 12 posts, so its tiles are graded as the early read they are.
//     Bulk plans landing on the learned slots at ≥20 posts is organic:best-time:e2e:bench.
//   · Non-zero paid spend: the only owned brand with an ad account (La Chica de la IA)
//     spent $0 in every cached window, so the spend equality is a real row matching 0.
//
// WHY IT STARTS ITS OWN NEXT SERVER: the registered script sources .env.local (the local
// stack) and Playwright starts config.webServer BEFORE it loads this file, so that server
// can never be pointed at hosted from here. This one is spawned after loadProdSupabaseEnv().
//
// Run: bun run organic:ship:fe:e2e:bench

const BENCH = 'organic:ship:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.ORGANIC_SHIP_APP_PORT ?? 3133);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4423);

// The bench login and its Vivo47-mirror brand: the only brand this bench writes to.
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
// Read-only: the owner's own brand with Instagram, a Page and a Meta ad account.
const ALL_VIEW_BRAND = '46f0deba-013f-4bd9-a70e-2526677a831d';
const OWNER_EMAIL = 'duane@continuumai.agency';

const RUN_ID = `${Date.now()}`;
const STORAGE_BUCKET = 'brand-profile-assets';
const REEL_PATH = `${BENCH_BRAND}/organic-ship-bench/${RUN_ID}.mp4`;
const DRAFT_TITLE = `SHIP BENCH ${RUN_ID} — publish options`;
const FIRST_COMMENT = `Link in bio — bench ${RUN_ID}`;
const IG_FRAME_MS = 2500;
const TIKTOK_FRAME_MS = 4000;

/* -- the Recorder envelope --------------------------------------------------------
 * scripts/factory/bench.mjs reads the LAST stdout JSON line carrying `counts`. Same shape
 * as the Backend _bench Recorder, re-implemented because a Frontend file may not import it. */
type Grade = { step: string; grade: 'PASS' | 'WARN' | 'FAIL'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function grade(step: string, ok: boolean | 'warn', detail?: string): void {
  const result = ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  graded.push({ step, grade: result, ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${result} ${step}${detail ? ` — ${detail}` : ''}`);
}

type StepOutcome = string | undefined | { warn: string };

async function step(name: string, run: () => Promise<StepOutcome>): Promise<boolean> {
  try {
    const outcome = await run();
    if (typeof outcome === 'object') grade(name, 'warn', outcome.warn);
    else grade(name, true, outcome);
    return true;
  } catch (error) {
    if (SCREENSHOT_DIR && currentPage) {
      const file = path.join(
        SCREENSHOT_DIR,
        `${graded.length + 1}-${name.replace(/\W+/g, '-').slice(0, 60)}.png`,
      );
      await currentPage.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    }
    // Keep the diff: an expect() message's first line is only "deep equality".
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
    else if (result.grade === 'WARN') counts.warn += 1;
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

/* -- hosted service-role reads + residue ------------------------------------------ */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Everything this run creates, by id — never a sweep by pattern or time window.
const residue = {
  draftIds: [] as string[],
  storage: [] as Array<{ bucket: string; path: string }>,
  assetIds: [] as string[],
  brandPrefs: [] as Array<{ userId: string; previous: string | null }>,
};

type DraftRow = { id: string; status: string; content_json: Record<string, unknown> | null };

async function readDraft(draftId: string): Promise<DraftRow> {
  const { data, error } = await db
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, status, content_json')
    .eq('id', draftId)
    .single();
  if (error || !data) throw new Error(`could not read draft ${draftId}: ${error?.message}`);
  return data as DraftRow;
}

async function savedOptions(draftId: string): Promise<Record<string, Record<string, unknown>>> {
  const row = await readDraft(draftId);
  return (row.content_json?.publishOptions ?? {}) as Record<string, Record<string, unknown>>;
}

async function pinActiveBrand(userId: string, brandId: string): Promise<void> {
  const { data } = await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  residue.brandPrefs.push({
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  });
  await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: userId, active_brand_id: brandId }, { onConflict: 'user_id' })
    .throwOnError();
}

/* -- fixtures: a real H.264 reel and a real cover frame ---------------------------- */

function renderFixtures(): { reel: Buffer; cover: Buffer } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organic-ship-bench-'));
  const reel = path.join(dir, 'reel.mp4');
  const cover = path.join(dir, 'cover.png');
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=duration=6:size=540x960:rate=24',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    reel,
  ]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', '3', '-i', reel, '-frames:v', '1', cover]);
  const out = { reel: fs.readFileSync(reel), cover: fs.readFileSync(cover) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

/**
 * A draft that goes out on Instagram AND TikTok (pre fan-out) and publishes its generated
 * reel record — no attached media — so TikTok's AI label is certain from the browser.
 */
async function seedReelDraft(ownerId: string, reelUrl: string): Promise<string> {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  const dayId = day.toISOString().slice(0, 10);
  const mediaSuggestion = {
    kind: 'video',
    mediaStatus: 'ready',
    reel: {
      generated: true,
      bucket: STORAGE_BUCKET,
      url: REEL_PATH,
      signedUrl: reelUrl,
      mimeType: 'video/mp4',
      durationSec: 6,
    },
  };
  const { data, error } = await db
    .schema('organic')
    .from('organic_calendar_drafts')
    .insert({
      brand_id: BENCH_BRAND,
      user_id: ownerId,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${dayId}T15:00:00.000Z`,
      media_stage: 'realized',
      slot_data: {
        dayId,
        weekStart: dayId,
        timeLabel: '3:00 PM',
        platform: 'instagram',
        title: DRAFT_TITLE,
        draftSnapshot: {
          title: DRAFT_TITLE,
          status: 'draft',
          platforms: ['instagram', 'tiktok'],
          format: 'Reel',
          timeLabel: '3:00 PM',
          dateLabel: dayId,
          mediaCount: 1,
          mediaSuggestion,
        },
      },
      content_json: {
        copy: { caption: 'SHIP BENCH caption — the copy is not what is under test.' },
        content: { format: 'Reel', type: 'reel', titleTopic: DRAFT_TITLE },
        creative: { creativeIdea: DRAFT_TITLE, mediaSuggestion },
      },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not seed the draft: ${error?.message}`);
  const draftId = (data as { id: string }).id;
  residue.draftIds.push(draftId);
  return draftId;
}

/* -- the hosted app ---------------------------------------------------------------- */

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * SIGTERM the child's whole process group, then SIGKILL whatever is still there after 5s.
 * A gate re-run left this bench's Deno edge listening for 45 minutes: a detached child
 * that outlives its bench holds the port and silently serves the NEXT run.
 */
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
        'a foreign one may read the local stack. Stop it or set ORGANIC_SHIP_APP_PORT.',
    );
  }
  const child: ChildProcess = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/organic-ship-e2e-hosted',
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

/**
 * The SAME organic-reporting handler, run locally under Deno against hosted. Only used while
 * the deployed edge predates `bestTimes`, and the step that uses it is graded WARN with the
 * substituted hop named — see the best-time step. Deploying the edge retires this path.
 */
async function serveLocalReportingEdge(): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = Number(process.env.ORGANIC_SHIP_EDGE_PORT ?? 8433);
  const url = `http://127.0.0.1:${port}`;
  if (await answers(url)) {
    throw new Error(
      `${url} already answers — a leftover edge from an earlier run would serve this one. ` +
        'Stop it (lsof -iTCP:' +
        `${port}) or set ORGANIC_SHIP_EDGE_PORT.`,
    );
  }
  const entry = path.resolve(FRONTEND_DIR, '../supabase/functions/organic-reporting/index.ts');
  const child = spawn(
    'deno',
    [
      'eval',
      `import { handleOrganicReporting } from ${JSON.stringify(`file://${entry}`)};` +
        `Deno.serve({ port: ${port}, hostname: '127.0.0.1' }, handleOrganicReporting);`,
    ],
    {
      detached: true,
      env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const stop = () => killGroup(child);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const up = await fetch(url, { method: 'OPTIONS', signal: AbortSignal.timeout(2_000) })
      .then(() => true)
      .catch(() => false);
    if (up) return { url, stop };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`the local organic-reporting edge never answered on ${url}`);
}

async function signIn(
  context: BrowserContext,
  email: string,
): Promise<{ userId: string; token: string }> {
  const session = await mintSessionBundleForEmail(email);
  await context.clearCookies();
  await context.addCookies(session.state.cookies);
  return { userId: session.userId, token: session.accessToken };
}

function fieldsSaved(page: Page, draftId: string, timeout = 30_000) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(`/api/organic/calendar/drafts/${draftId}/fields`) &&
      response.request().method() === 'PATCH' &&
      response.ok(),
    { timeout },
  );
}

async function openPublishTab(page: Page, draftId: string): Promise<void> {
  // ?draftId= opens the preview on its own; the draft sits weeks out, off the visible grid.
  await page.goto(`${APP}/organic?tab=planner&draftId=${draftId}`, NAV);
  const publishTab = page.getByRole('tab', { name: 'Publish' });
  await publishTab.waitFor({ state: 'visible', timeout: 120_000 });
  await publishTab.click();
}

/** The Publish tab's own platform switch — never the header's platform chips, which edit the post. */
async function optionsFor(page: Page, abbr: 'IG' | 'TT'): Promise<void> {
  const button = page.getByRole('group', { name: 'Options for' }).getByRole('button', {
    name: abbr,
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Keep what a node SHOWS, for a human to look at — geometry assertions cannot see colour. */
async function snap(target: Page | ReturnType<Page['locator']>, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  await target
    .screenshot({ path: path.join(SCREENSHOT_DIR, `ok-${name}.png`) })
    .catch(() => undefined);
}

async function scrubAndUseFrame(page: Page, offsetMs: number): Promise<void> {
  // The product's own ready state: the slider exists only once THIS video reports a finite
  // duration. Waiting on "enabled" alone raced a slow metadata load under machine load.
  await expect(page.locator('[data-cover-frames]')).toHaveAttribute('data-cover-frames', 'ready', {
    timeout: 120_000,
  });
  const slider = page.getByLabel('Cover frame');
  await expect(slider).toBeEnabled();
  // Keys, not fill(): fill() writes .value directly, which React's value tracker reads as
  // no change, so onChange never fires. Arrow keys move the native slider like a person.
  await slider.focus();
  await slider.press('Home');
  for (let ms = 0; ms < offsetMs; ms += 100) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(offsetMs));
  await page.getByRole('button', { name: 'Use this frame' }).click();
}

/* -- the run ------------------------------------------------------------------------ */

// A first visit compiles the route in the bench's own dev server; that is not a hang.
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

test.use({ channel: 'chrome' });

let backend: LocalBackend | null = null;
let localEdge: { stop: () => Promise<void> } | null = null;
let currentPage: Page | null = null;
const SCREENSHOT_DIR = process.env.ORGANIC_SHIP_BENCH_SCREENSHOT_DIR;
// A run that dies before its last step must not print an envelope that reads green.
let reachedTheEnd = false;
let app: { stop: () => Promise<void> } | null = null;

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
  for (const id of residue.draftIds) {
    await db.schema('organic').from('organic_calendar_drafts').delete().eq('id', id);
  }
  for (const id of residue.assetIds) {
    await db.schema('media').from('assets').delete().eq('id', id).eq('brand_id', BENCH_BRAND);
  }
  for (const object of residue.storage) {
    await db.storage.from(object.bucket).remove([object.path]);
  }
  for (const pref of residue.brandPrefs.reverse()) {
    if (!pref.previous) continue;
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: pref.userId, active_brand_id: pref.previous }, { onConflict: 'user_id' });
  }
  await localEdge?.stop();
  await app?.stop();
  await backend?.stop();
  if (!reachedTheEnd) grade('the run reached its last step', false, 'aborted — see the test error');
  printEnvelope();
});

test('organic ship: publish options, best-time tiles, organic + paid view', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  currentPage = page;
  // No single action may hang the run: a missing element fails its step, not the whole bench.
  page.setDefaultTimeout(60_000);

  /* ---- 1. the Publish tab writes per-platform options onto the saved draft ---- */
  const bench = await signIn(context, BENCH_EMAIL);
  let draftId = '';
  const fixtures = renderFixtures();
  const seeded = await step(
    'setup: a real H.264 reel draft on the bench brand, open in the planner',
    async () => {
      await pinActiveBrand(bench.userId, BENCH_BRAND);
      const upload = await db.storage
        .from(STORAGE_BUCKET)
        .upload(REEL_PATH, fixtures.reel, { contentType: 'video/mp4', upsert: true });
      if (upload.error) throw new Error(`reel upload failed: ${upload.error.message}`);
      residue.storage.push({ bucket: STORAGE_BUCKET, path: REEL_PATH });
      const signed = await db.storage.from(STORAGE_BUCKET).createSignedUrl(REEL_PATH, 3600);
      if (!signed.data?.signedUrl)
        throw new Error(`could not sign the reel: ${signed.error?.message}`);
      draftId = await seedReelDraft(bench.userId, signed.data.signedUrl);
      await openPublishTab(page, draftId);
      return `draft ${draftId}`;
    },
  );

  if (seeded) {
    await step('publish tab: the Instagram first comment is saved on the draft', async () => {
      const saved = fieldsSaved(page, draftId);
      await page.getByLabel('First comment').fill(FIRST_COMMENT);
      await saved;
      const options = await savedOptions(draftId);
      expect(options.instagram?.firstComment).toBe(FIRST_COMMENT);
      return `content_json.publishOptions.instagram.firstComment = "${FIRST_COMMENT}"`;
    });

    await step('publish tab: a scrubbed frame is saved as the Instagram cover', async () => {
      const saved = fieldsSaved(page, draftId);
      await scrubAndUseFrame(page, IG_FRAME_MS);
      await saved;
      const options = await savedOptions(draftId);
      expect(options.instagram).toEqual({
        firstComment: FIRST_COMMENT,
        thumbnail: { offsetMs: IG_FRAME_MS },
      });
      return `instagram = ${JSON.stringify(options.instagram)}`;
    });

    await step(
      'publish tab: TikTok keeps its own cover and shows the AI label locked on',
      async () => {
        await optionsFor(page, 'TT');
        const aiLabel = page.getByRole('switch', { name: 'AI-generated content' });
        await expect(aiLabel).toHaveAttribute('aria-checked', 'true');
        await expect(aiLabel).toHaveAttribute('data-disabled', /.*/);
        await expect(page.getByLabel('First comment')).toHaveCount(0);
        const saved = fieldsSaved(page, draftId);
        await scrubAndUseFrame(page, TIKTOK_FRAME_MS);
        await saved;
        const options = await savedOptions(draftId);
        expect(options.tiktok).toEqual({ thumbnail: { offsetMs: TIKTOK_FRAME_MS } });
        expect(options.instagram?.thumbnail).toEqual({ offsetMs: IG_FRAME_MS });
        return `tiktok = ${JSON.stringify(options.tiktok)}, instagram untouched`;
      },
    );

    await step('publish tab: an uploaded image replaces the Instagram cover', async () => {
      await optionsFor(page, 'IG');
      // The upload is a real library-upload round trip before the save; under machine load
      // it outlasted a 30s window. A real upload failure shows the product's own alert, and
      // that — not a timeout — is what fails this step.
      const saved = fieldsSaved(page, draftId, 150_000);
      await page
        .getByLabel('Upload cover image')
        .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: fixtures.cover });
      const failed = page
        .getByRole('alert')
        .filter({ hasText: 'did not upload' })
        .waitFor({ timeout: 150_000 })
        .then(() => 'failed' as const)
        .catch(() => 'no-alert' as const);
      const outcome = await Promise.race([
        saved.then(() => 'saved' as const).catch(() => 'no-save' as const),
        failed,
      ]);
      if (outcome === 'failed') throw new Error('the product reported "The image did not upload"');
      if (outcome !== 'saved') throw new Error('no cover save within 150s of choosing the file');
      const options = await savedOptions(draftId);
      const url = (options.instagram?.thumbnail as { url?: string } | undefined)?.url ?? '';
      const match = /\/media-library\/([0-9a-f-]{36})\/([0-9a-f-]{36})\//.exec(url);
      if (match?.[2]) {
        residue.assetIds.push(match[2]);
        const objectPath = decodeURIComponent(url.split('/media-library/')[1].split('?')[0]);
        residue.storage.push({ bucket: 'media-library', path: objectPath });
      }
      expect(url.startsWith('https://')).toBe(true);
      expect(match?.[1]).toBe(BENCH_BRAND);
      expect(options.instagram?.firstComment).toBe(FIRST_COMMENT);
      return `instagram.thumbnail.url is this brand's library object ${match?.[2]}`;
    });

    await step('publish tab: the saved options come back into the tab after a reload', async () => {
      await openPublishTab(page, draftId);
      await expect(page.getByLabel('First comment')).toHaveValue(FIRST_COMMENT, {
        timeout: 30_000,
      });
      await expect(page.locator('[data-cover-status]')).toHaveText('Uploaded image');
      const row = await readDraft(draftId);
      expect(row.status).toBe('draft');
      await snap(page, 'publish-tab');
      return 'first comment + uploaded cover rehydrated; draft still status=draft';
    });
  }

  /* ---- 2. the Best time / Posting frequency tiles equal organic_best_times ---- */
  const tilesShown = await step(
    'best time: the tiles show the slots organic_best_times returns',
    async () => {
      // Probe the deployed edge first: before its deploy it cannot carry bestTimes, and a
      // 3-minute wait for tiles that can never render would say less than this one call.
      const probe = await fetch(`${SUPABASE_URL}/functions/v1/organic-reporting/insights`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bench.token}`,
          apikey: publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: BENCH_BRAND,
          integrationAccountId: 'b85359c3-e7e9-454a-a20b-d11657aa7278',
          platform: 'instagram',
          range: { preset: 'last_7d' },
        }),
      }).then((response) => response.json() as Promise<Record<string, unknown>>);
      const deployed = 'bestTimes' in probe;
      if (!deployed) {
        localEdge = await serveLocalReportingEdge();
        const edgeUrl = localEdge.url;
        await page.route('**/api/organic/insights', async (route) => {
          const response = await fetch(`${edgeUrl}/organic-reporting/insights`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bench.token}`, 'Content-Type': 'application/json' },
            body: route.request().postData() ?? '{}',
          });
          await route.fulfill({
            status: response.status,
            contentType: 'application/json',
            body: await response.text(),
          });
        });
      }
      await page.goto(`${APP}/organic?tab=metrics`, NAV);
      const tiles = page.locator('[data-tour-id="organic-best-time-tiles"]');
      await expect(tiles).toBeVisible({ timeout: 180_000 });
      const platform = (await tiles.getAttribute('data-platform')) ?? '';
      const { data, error } = await db.rpc('organic_best_times', {
        p_brand_id: BENCH_BRAND,
        p_platform: platform,
        p_window_days: 90,
      });
      if (error) throw new Error(`organic_best_times failed: ${error.message}`);
      const truth = data as {
        postsAnalyzed: number;
        postsPerWeek: number;
        slots: Array<{ weekday: number; rank: number; time: string }>;
      };
      const shown = await tiles.locator('[data-slot-time]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          weekday: Number(node.closest('[data-weekday]')?.getAttribute('data-weekday')),
          rank: Number(node.getAttribute('data-slot-rank')),
          time: node.getAttribute('data-slot-time'),
        })),
      );
      const key = (slot: { weekday: number; rank: number; time: string | null }) =>
        `${slot.weekday}/${slot.rank}/${slot.time}`;
      expect(shown.map(key).sort()).toEqual(truth.slots.map(key).sort());
      expect(truth.slots.length).toBeGreaterThan(0);
      await snap(tiles, 'best-time-tiles');
      notes.push(
        `best time: ${platform} brand ${BENCH_BRAND} has ${truth.postsAnalyzed} posts in 90d — ` +
          'the tile says it is an early read below the 20-post bar',
      );
      const equal = `${shown.length}/${truth.slots.length} slots equal (${platform}, ${truth.postsAnalyzed} posts)`;
      if (deployed) return equal;
      return {
        warn:
          `${equal} — the deployed organic-reporting edge predates bestTimes, so the browser's ` +
          "/api/organic/insights hop was served by this commit's handler run locally on hosted. " +
          'Deploy organic-reporting and re-run to exercise the deployed hop.',
      };
    },
  );

  if (tilesShown)
    await step('best time: Posting frequency equals postsPerWeek', async () => {
      const shown = await page
        .locator('[data-tour-id="organic-best-time-tiles"] [data-posts-per-week]')
        .getAttribute('data-posts-per-week');
      const platform =
        (await page
          .locator('[data-tour-id="organic-best-time-tiles"]')
          .getAttribute('data-platform')) ?? '';
      const { data } = await db.rpc('organic_best_times', {
        p_brand_id: BENCH_BRAND,
        p_platform: platform,
        p_window_days: 90,
      });
      const truth = (data as { postsPerWeek: number }).postsPerWeek;
      expect(Number(shown)).toBe(truth);
      return `${shown} posts / week`;
    });

  // The planner and the metrics page talk to the Backend; the all view reads through the
  // edges only. Stop it now: a laptop Backend on hosted runs pollers with no env gate
  // (angle tagging first ticks at 10 min), so its lifetime is kept short.
  await backend?.stop();
  backend = null;

  /* ---- 3. /dashboard?view=all equals the reporting_cache rows for one period ---- */
  const owner = await signIn(context, OWNER_EMAIL);
  await pinActiveBrand(owner.userId, ALL_VIEW_BRAND);
  await page.goto(`${APP}/dashboard?view=all`, NAV);
  const view = page.locator('[data-tour-id="dashboard-all-view"]');
  const periodReady = expect(view.locator('[data-period]')).not.toHaveAttribute('data-period', '', {
    timeout: 240_000,
  });

  await step('all view: per-platform organic reach equals the reporting_cache rows', async () => {
    await periodReady;
    const [since, until] = (
      (await view.locator('[data-period]').getAttribute('data-period')) ?? ''
    ).split('..');
    const rows = await view.locator('[data-organic-platform]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        platform: node.getAttribute('data-organic-platform') ?? '',
        reach: node.getAttribute('data-reach') ?? '',
        accountIds: (node.getAttribute('data-account-ids') ?? '').split(',').filter(Boolean),
      })),
    );
    expect(rows.length).toBeGreaterThan(0);
    const details: string[] = [];
    for (const row of rows) {
      let total = 0;
      for (const accountId of row.accountIds) {
        const { data, error } = await db
          .schema('brand_profiles')
          .from('reporting_cache')
          .select('payload, cache_key, fetched_at')
          .eq('scope_type', `organic_analytics_${row.platform}`)
          .eq('account_id', accountId)
          .eq('range_since', since)
          .eq('range_until', until)
          .like('cache_key', `%:${row.platform}:kpis:%`)
          .order('fetched_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) {
          throw new Error(`no kpis cache row for ${row.platform} ${accountId} ${since}..${until}`);
        }
        total += Number(
          (data.payload as { metrics?: { reach?: number } }).metrics?.reach ?? Number.NaN,
        );
      }
      expect(Number(row.reach)).toBe(total);
      details.push(`${row.platform} ${row.reach}`);
    }
    return `${since}..${until}: ${details.join(', ')}`;
  });

  await step('all view: Meta spend for the same dates equals the reporting_cache row', async () => {
    await periodReady;
    const [since, until] = (
      (await view.locator('[data-period]').getAttribute('data-period')) ?? ''
    ).split('..');
    const accounts = await view.locator('[data-ad-account]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-ad-account') ?? '',
        spend: node.getAttribute('data-spend') ?? '',
      })),
    );
    expect(accounts.length).toBeGreaterThan(0);
    const details: string[] = [];
    for (const account of accounts) {
      const bare = account.id.replace(/^act_/, '');
      const { data, error } = await db
        .schema('brand_profiles')
        .from('reporting_cache')
        .select('payload')
        .eq('scope_type', 'paid_account_overview')
        .in('account_id', [bare, `act_${bare}`])
        .eq('range_preset', 'custom')
        .eq('range_since', since)
        .eq('range_until', until)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data)
        throw new Error(`no paid_account_overview row for ${account.id} ${since}..${until}`);
      const truth = Number((data.payload as { metrics?: { spend?: number } }).metrics?.spend);
      expect(Number(account.spend)).toBe(truth);
      details.push(`${account.id} ${account.spend}`);
      if (truth === 0)
        notes.push(`paid: ${account.id} spent 0 in ${since}..${until} — a real row, but a zero`);
    }
    await snap(page, 'dashboard-all');
    return `${since}..${until}: ${details.join(', ')}`;
  });

  notes.push(
    'unexercised: the live first comment read back from Graph (nothing posts publicly this cycle)',
  );
  reachedTheEnd = true;
  expect(graded.filter((result) => result.grade === 'FAIL').map((result) => result.step)).toEqual(
    [],
  );
});
