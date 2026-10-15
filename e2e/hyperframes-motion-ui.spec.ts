import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  createNodeData,
  type MotionDoc,
  type MotionTarget,
  readMotionFromHtml,
} from '@continuum/contracts';
import { expect, type Frame, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { PNG } from 'pngjs';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, type Server } from './video-editor-workspace/harness';

// ---------------------------------------------------------------------------
// hyperframes:motion:ui:bench — the HyperFrames motion timeline and speak-your-change, end to
// end: the bench login on the bench brand against PRODUCTION Supabase, a local Backend from
// this tree (workers off) and a Next dev server. The pair's joint anchor (fe-motion + hf-agent).
//
//   seed (hf-agent's CLI): a real 2-scene revision with motion data → a canvas room holding a
//   HyperFrames node on that run → the Interactive composition lists the animations → a pixel
//   probe of the real <hyperframes-player> finds the headline onset and scene 2's window
//   → the headline bar is dragged +0.5 s → the route commits a new revision (new fingerprint)
//   → after a reload the onset sits 0.5 s later (±1 frame) → an edit made OUTSIDE the page
//   makes the page's revision stale: its next edit gets a 409, refetches and replays → a stub
//   SpeechRecognition fills the prompt and the turn request carries motionTarget.
//
// $0: no model turn (the turn request is captured and answered by the page route, never sent).
// Writes: the seed's session (its revisions, including the ones committed here, removed by
// the seed's cleanup), one canvas room + its session row (deleted), and the bench login's
// active brand (restored). Net zero is asserted by id.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 900_000 });

const BENCH = 'hyperframes:motion:ui:bench';
const ROOT = resolve(__dirname, '../..');
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const SPOKEN = 'stagger this animation';
const DRAG_SEC = 0.5;
/** Fraction of a region's pixels that must change when an element is masked for it to count as painted. */
const PAINTED = 0.002;

const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();
process.env.SUPABASE_URL = supabaseUrl;
// The revision bucket the seed writes to; the bench Backend inherits it (as the report benches do).
process.env.HYPERFRAMES_GCS_BUCKET ??= 'continuum-production-477821-hyperframes';
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const rec = new Recorder(BENCH);
const results: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP' | 'WARN'; detail?: string }[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function check(step: string, ok: boolean, detail?: string): boolean {
  rec.check(step, ok, detail);
  results.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  return ok;
}
function note(message: string): void {
  rec.note(message);
  notes.push(message);
}
function printEnvelope(): number {
  const counts = rec.summary();
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
  return counts.fail;
}

/**
 * The page fetches the composition from a signed URL on the HyperFrames bucket, whose CORS
 * allowlist names only these dev origins (gcloud storage buckets describe … cors_config).
 */
async function corsAllowedPort(): Promise<number> {
  for (const port of [3113, 3112, 3111, 3110]) {
    const free = await new Promise<boolean>((done) => {
      const probe = createServer()
        .once('error', () => done(false))
        .listen(port, () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error(
    'localhost:3110-3113 are all busy; the HyperFrames bucket allows no other dev origin',
  );
}

type Seed = {
  sessionId: string;
  runId: string;
  revisionId: string;
  fingerprint: string;
  brandId: string;
  userId: string;
  canvasId: string;
  nodeId: string;
};

function seedCli(...args: string[]): string {
  return execFileSync(
    'bun',
    [
      '--env-file=Continuum-Backend/.env',
      'Continuum-Backend/scripts/fixtures/hyperframes-motion/seed.ts',
      ...args,
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
}

type Api = { base: string; token: string };
type LatestRevision = {
  revision: {
    revisionId: string;
    fingerprint: string;
    parentRevisionId: string | null;
    model: string;
  };
  compositionUrl: string;
};

async function api<T>(
  client: Api,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${client.base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as T };
}

async function latest(client: Api, runId: string): Promise<LatestRevision & { motion: MotionDoc }> {
  const { status, body } = await api<LatestRevision>(
    client,
    `/api/ai-studio/hyperframes-agent/runs/${runId}/revision`,
  );
  if (status !== 200) throw new Error(`GET revision → ${status}`);
  const html = await (await fetch(body.compositionUrl)).text();
  return { ...body, motion: readMotionFromHtml(html) };
}

const startOf = (motion: MotionDoc, id: string) =>
  motion.animations.find((animation) => animation.id === id)?.startSec ?? Number.NaN;

// ── the player ─────────────────────────────────────────────────────────────────────

type Pin = { userId: string; brandId: string };

/** The bench login's active brand: the canvas only opens a room of that brand. */
async function pinActiveBrand({ userId, brandId }: Pin): Promise<void> {
  await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: userId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .throwOnError();
}

async function openInteractive(page: Page, url: string, nodeId: string, pin: Pin): Promise<Frame> {
  // Other benches share this login and re-pin its active brand; a room of another brand
  // never opens. Pin it again right before every load.
  await pinActiveBrand(pin);
  await page.goto(url, { timeout: 300_000 });
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  await expect(node)
    .toBeVisible({ timeout: 240_000 })
    .catch(async (error: unknown) => {
      const { data } = await admin
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .select('active_brand_id')
        .eq('user_id', pin.userId)
        .maybeSingle();
      const active = (data as { active_brand_id?: string } | null)?.active_brand_id;
      throw new Error(
        `the seeded room never opened (active brand now ${active ?? 'none'}, expected ${pin.brandId}): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    });
  await node.getByRole('button', { name: 'Interactive composition' }).click();
  await expect(node.getByTestId('hyperframes-motion-panel')).toBeVisible({ timeout: 120_000 });
  return playerFrame(page);
}

async function playerFrame(page: Page): Promise<Frame> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (!frame.url().startsWith('data:text/html')) continue;
      const ready = await frame
        .evaluate(() => Boolean((window as unknown as { __playerReady?: boolean }).__playerReady))
        .catch(() => false);
      if (ready) return frame;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('the HyperFrames player never became ready');
}

const nextPaint = (frame: Frame) =>
  frame.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

async function seek(page: Page, frame: Frame, t: number): Promise<void> {
  await page.locator('hyperframes-player').evaluate((element, time) => {
    (element as HTMLElement & { seek(time: number): void }).seek(time);
  }, t);
  await frame.waitForFunction(
    (time) =>
      Math.abs(
        ((window as unknown as { __player?: { getTime(): number } }).__player?.getTime() ?? -1) -
          time,
      ) < 1e-3,
    t,
  );
  await nextPaint(frame);
}

type Clip = { x: number; y: number; width: number; height: number };

/** An element's box on the page, padded, from its box inside the player's iframe. */
async function regionOf(page: Page, frame: Frame, hfId: string, pad = 0.25): Promise<Clip> {
  const outer = await page.locator('hyperframes-player').evaluate((element) => {
    const box = (
      element as HTMLElement & { iframeElement: HTMLIFrameElement }
    ).iframeElement.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width };
  });
  const inner = await frame.evaluate((id) => {
    const box = document.querySelector(`[data-hf-id="${id}"]`)?.getBoundingClientRect();
    if (!box) throw new Error(`no element ${id}`);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      viewport: window.innerWidth,
    };
  }, hfId);
  const scale = outer.width / inner.viewport;
  return {
    x: outer.x + inner.x * scale,
    y: outer.y + (inner.y - inner.height * pad) * scale,
    width: inner.width * scale,
    height: inner.height * (1 + pad * 2) * scale,
  };
}

const luma = (png: PNG, index: number) =>
  0.2126 * (png.data[index] ?? 0) +
  0.7152 * (png.data[index + 1] ?? 0) +
  0.0722 * (png.data[index + 2] ?? 0);

/**
 * How much of the region `hfId` paints at the current frame: the screenshot against the same
 * frame with that element forced to opacity 0. Other motion in the region cancels out.
 */
async function paintedFraction(
  page: Page,
  frame: Frame,
  hfId: string,
  clip: Clip,
): Promise<number> {
  const shot = async () => PNG.sync.read(await page.screenshot({ clip }));
  const shown = await shot();
  await frame.evaluate((id) => {
    (document.querySelector(`[data-hf-id="${id}"]`) as HTMLElement).style.setProperty(
      'opacity',
      '0',
      'important',
    );
  }, hfId);
  await nextPaint(frame);
  const masked = await shot();
  await frame.evaluate((id) => {
    (document.querySelector(`[data-hf-id="${id}"]`) as HTMLElement).style.removeProperty('opacity');
  }, hfId);
  await nextPaint(frame);
  let changed = 0;
  const pixels = Math.min(shown.data.length, masked.data.length) / 4;
  for (let index = 0; index < pixels * 4; index += 4)
    if (Math.abs(luma(shown, index) - luma(masked, index)) > 8) changed += 1;
  return changed / Math.max(1, pixels);
}

/** The first frame at which `hfId` paints, scanning [0, untilSec] at the film's frame rate. */
async function onsetSec(page: Page, frame: Frame, hfId: string, untilSec: number, fps: number) {
  await seek(page, frame, untilSec);
  const clip = await regionOf(page, frame, hfId);
  for (let index = 0; index <= Math.round(untilSec * fps); index += 1) {
    const t = index / fps;
    await seek(page, frame, t);
    if ((await paintedFraction(page, frame, hfId, clip)) > PAINTED) return t;
  }
  return Number.NaN;
}

/** The panel's status once a commit settles: 'Saved', or the refusal it shows. */
async function settledStatus(page: Page, nodeId: string): Promise<string> {
  const status = page
    .locator(`.react-flow__node[data-id="${nodeId}"]`)
    .getByTestId('motion-status');
  await expect
    .poll(async () => (await status.textContent()) ?? '', { timeout: 60_000 })
    .not.toMatch(/Saving…|animations$/);
  return (await status.textContent()) ?? '';
}

const SPEECH_STUB = `
  // Both names: Chrome now ships an unprefixed SpeechRecognition, which the button prefers.
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start() {
      window.__benchSpeechStarted = true;
      setTimeout(() => {
        const result = Object.assign([{ transcript: ${JSON.stringify(SPOKEN)} }], { isFinal: true });
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        this.onend && this.onend();
      }, 50);
    }
    stop() { this.onend && this.onend(); }
    abort() {}
  };
`;

test(BENCH, async ({ browser }) => {
  const servers: Server[] = [];
  let seed: Seed | null = null;
  let roomId: string | null = null;
  let previousActiveBrand: string | null | undefined;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let client: Api | null = null;
  try {
    // ── servers + identity + seed ─────────────────────────────────────────────────────
    const fePort = await corsAllowedPort();
    const backend = await bootBackend(`http://localhost:${fePort}`);
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url, '.next/hyperframes-motion-e2e');
    servers.push(frontend);
    note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    client = { base: backend.url, token: session.accessToken };

    const seeded = JSON.parse(seedCli('seed').trim().split('\n').at(-1) ?? '{}') as Seed;
    seed = seeded;
    check(
      'seed: a real 2-scene revision with motion data, owned by the bench login',
      Boolean(seeded.revisionId && seeded.fingerprint?.length === 64) &&
        seeded.userId === session.userId,
      `session ${seeded.sessionId} run ${seeded.runId} revision ${seeded.revisionId}`,
    );
    const seededLatest = await latest(client, seeded.runId);
    const headlineStart = startOf(seededLatest.motion, 'headline');

    const { data: preference } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    previousActiveBrand =
      (preference as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    const pin = { userId: session.userId, brandId: seeded.brandId };
    await pinActiveBrand(pin);

    roomId = randomUUID();
    const created = createNodeData('hyperframesAgent', {
      label: 'Bench motion timeline',
      prompt: 'Motion as data — bench film',
      aspectRatio: '16:9',
      durationSeconds: 6,
      fps: 30,
      status: 'completed',
      sessionId: seeded.sessionId,
      activeRunId: seeded.runId,
      revisionId: seeded.revisionId,
    });
    await admin
      .schema('brand_profiles')
      .from('canvas_rooms')
      .upsert(
        {
          id: roomId,
          brand_profile_id: seeded.brandId,
          name: `bench motion ui ${roomId.slice(0, 8)}`,
          created_by: session.userId,
        },
        { onConflict: 'id' },
      )
      .throwOnError();
    await admin
      .schema('brand_profiles')
      .from('canvas_sessions')
      .upsert(
        {
          brand_profile_id: seeded.brandId,
          room_id: roomId,
          nodes: [
            {
              id: seeded.nodeId,
              type: 'hyperframesAgent',
              position: { x: 0, y: 0 },
              data: created.data,
              style: { width: 760, height: 1150 },
              width: 760,
              height: 1150,
            },
          ],
          edges: [],
          deleted_node_ids: [],
          deleted_edge_ids: [],
          editor_session_id: randomUUID(),
          editor_user_id: session.userId,
        },
        { onConflict: 'brand_profile_id,room_id' },
      )
      .throwOnError();

    // ── the panel lists the composition's animations ──────────────────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1200 },
    });
    await context.addInitScript(SPEECH_STUB);
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const roomUrl = `${frontend.url}/ai-studio?roomId=${roomId}`;
    let frame = await openInteractive(page, roomUrl, seeded.nodeId, pin);
    const node = page.locator(`.react-flow__node[data-id="${seeded.nodeId}"]`);
    const rows = await node
      .locator('[data-testid^="motion-row-"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-testid')?.slice('motion-row-'.length)),
      );
    check(
      'the panel lists one row per animation in the stored motion data',
      rows.length === seededLatest.motion.animations.length &&
        seededLatest.motion.animations.every((animation) => rows.includes(animation.id)),
      rows.join(', '),
    );

    // ── pixel probes on the seeded revision ───────────────────────────────────────────
    await page.mouse.move(2, 2);
    const fps = 30;
    const before = await onsetSec(page, frame, 'hook-title', 1.6, fps);
    check(
      'pixel probe: the headline paints from its stored start',
      Math.abs(before - headlineStart) <= 3 / fps,
      `onset ${before.toFixed(3)} s, startSec ${headlineStart}`,
    );
    await seek(page, frame, 3);
    const payoffClip = await regionOf(page, frame, 'payoff-title', 0.1);
    const sceneTwo: string[] = [];
    let sceneTwoOk = true;
    for (const [t, expected] of [
      [1.9, false],
      [2.1, true],
      [3, true],
      [3.9, true],
      [5.5, true],
    ] as const) {
      await seek(page, frame, t);
      const fraction = await paintedFraction(page, frame, 'payoff-title', payoffClip);
      sceneTwo.push(`${t}s ${fraction.toFixed(4)}`);
      if (fraction > PAINTED !== expected) sceneTwoOk = false;
    }
    check(
      'pixel probe: scene 2 (data-start 2) paints inside its window and not before (no 2× start)',
      sceneTwoOk,
      sceneTwo.join(', '),
    );

    // ── drag the headline bar +0.5 s → a committed revision ───────────────────────────
    const bar = node.getByTestId('motion-bar-headline');
    const lane = node.locator('[data-testid="motion-row-headline"] [data-motion-lane]');
    const [barBox, laneBox] = [await bar.boundingBox(), await lane.boundingBox()];
    if (!barBox || !laneBox) throw new Error('the headline bar is not on screen');
    const fromX = barBox.x + Math.min(12, barBox.width / 2);
    const y = barBox.y + barBox.height / 2;
    const dx = (DRAG_SEC / 6) * laneBox.width;
    await page.mouse.move(fromX, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(fromX + (dx * step) / 8, y);
    await page.mouse.up();
    const dragStatus = await settledStatus(page, seeded.nodeId);
    check('the panel reports the drag saved', dragStatus === 'Saved', dragStatus);
    const afterDrag = await latest(client, seeded.runId);
    const draggedStart = startOf(afterDrag.motion, 'headline');
    check(
      'drag +0.5 s commits a new revision with a new fingerprint through the route',
      afterDrag.revision.revisionId !== seeded.revisionId &&
        afterDrag.revision.fingerprint !== seeded.fingerprint &&
        afterDrag.revision.parentRevisionId === seeded.revisionId &&
        afterDrag.revision.model === 'manual-motion',
      `${afterDrag.revision.revisionId} (${afterDrag.revision.fingerprint.slice(0, 12)}…) ← ${seeded.revisionId}, model ${afterDrag.revision.model}`,
    );
    check(
      'the stored headline starts 0.5 s later (±1 frame); the other animations are untouched',
      Math.abs(draggedStart - headlineStart - DRAG_SEC) <= 1 / fps + 1e-6 &&
        seededLatest.motion.animations
          .filter((animation) => animation.id !== 'headline')
          .every(
            (animation) =>
              JSON.stringify(
                afterDrag.motion.animations.find((other) => other.id === animation.id),
              ) === JSON.stringify(animation),
          ),
      `headline ${headlineStart} → ${draggedStart}`,
    );

    // ── the committed revision, reloaded, plays the onset 0.5 s later ─────────────────
    frame = await openInteractive(page, roomUrl, seeded.nodeId, pin);
    await page.mouse.move(2, 2);
    const after = await onsetSec(page, frame, 'hook-title', 1.6, fps);
    check(
      'pixel probe after reload: the headline onset is delayed by 0.5 s ±1 frame',
      Math.abs(after - before - DRAG_SEC) <= 1 / fps + 1e-6,
      `onset ${before.toFixed(3)} s → ${after.toFixed(3)} s (Δ ${(after - before).toFixed(3)} s)`,
    );

    // ── an edit from outside makes the page stale: 409 → refetch → replay ─────────────
    const subtitleStart = startOf(afterDrag.motion, 'subtitle');
    const outside = await api<{ revision: { id: string; fingerprint: string } }>(
      client,
      `/api/ai-studio/hyperframes-agent/revisions/${afterDrag.revision.revisionId}/motion`,
      {
        method: 'POST',
        body: JSON.stringify({
          ops: [
            {
              type: 'retime',
              animationId: 'subtitle',
              startSec: Math.round((subtitleStart + 0.1) * 1000) / 1000,
            },
          ],
          expectedFingerprint: afterDrag.revision.fingerprint,
        }),
      },
    );
    const stale = await api<{ error?: string }>(
      client,
      `/api/ai-studio/hyperframes-agent/revisions/${afterDrag.revision.revisionId}/motion`,
      {
        method: 'POST',
        body: JSON.stringify({
          ops: [
            {
              type: 'retime',
              animationId: 'subtitle',
              startSec: Math.round((subtitleStart + 0.2) * 1000) / 1000,
            },
          ],
          expectedFingerprint: afterDrag.revision.fingerprint,
        }),
      },
    );
    check(
      'the route: a fresh fingerprint commits (201), the same stale one is refused (409)',
      outside.status === 201 && stale.status === 409,
      `${outside.status} ${outside.body?.revision?.id ?? ''}; stale ${stale.status} ${stale.body?.error ?? ''}`,
    );
    const logoStart = startOf(afterDrag.motion, 'logo');
    await node.getByTestId('motion-bar-logo').press('ArrowRight');
    const replayStatus = await settledStatus(page, seeded.nodeId);
    check('the panel reports the replayed edit saved', replayStatus === 'Saved', replayStatus);
    const replayed = await latest(client, seeded.runId);
    check(
      'the page’s stale edit gets a 409, refetches and replays onto the outside edit',
      replayed.revision.parentRevisionId === outside.body?.revision?.id &&
        Math.abs(startOf(replayed.motion, 'logo') - logoStart - 1 / fps) < 2e-3 &&
        Math.abs(startOf(replayed.motion, 'subtitle') - subtitleStart - 0.1) < 1e-6 &&
        startOf(replayed.motion, 'headline') === draggedStart,
      `logo ${logoStart} → ${startOf(replayed.motion, 'logo')}, subtitle ${startOf(replayed.motion, 'subtitle')}, parent ${replayed.revision.parentRevisionId}`,
    );

    // ── speak the change: the prompt fills and the turn carries motionTarget ──────────
    let turnBody: {
      brandId?: string;
      turn?: { prompt?: string; sessionId?: string; motionTarget?: MotionTarget };
    } | null = null;
    const cors = {
      'access-control-allow-origin': frontend.url,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    };
    await page.route(`${backend.url}/api/ai-studio/hyperframes-agent/turns`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      turnBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({
          sessionId: seeded.sessionId,
          runId: seeded.runId,
          status: 'queued',
        }),
      });
    });
    await node.locator('[data-testid="motion-row-headline"] input[type="checkbox"]').check();
    await node.getByRole('button', { name: 'Dictate' }).click();
    const prompt = node.getByLabel('Global video feedback');
    await expect(prompt).toHaveValue(SPOKEN, { timeout: 10_000 });
    check(
      'a stub SpeechRecognition fills the revision prompt',
      (await prompt.inputValue()) === SPOKEN,
      SPOKEN,
    );
    const send = node.getByRole('button', { name: 'Send motion revision' });
    await expect(send).toBeEnabled({ timeout: 10_000 });
    // The node is taller than the viewport and a canvas cannot scroll a button into view;
    // the keyboard activates it wherever it sits.
    await send.press('Enter');
    await expect.poll(() => turnBody !== null, { timeout: 30_000 }).toBe(true);
    const sent = turnBody as {
      turn?: { prompt?: string; sessionId?: string; motionTarget?: MotionTarget };
    } | null;
    check(
      'the turn request carries motionTarget for the selected row on the latest revision',
      sent?.turn?.motionTarget?.revisionId === replayed.revision.revisionId &&
        JSON.stringify(sent.turn.motionTarget.animationIds) === JSON.stringify(['headline']) &&
        sent.turn.prompt === SPOKEN &&
        sent.turn.sessionId === seeded.sessionId,
      JSON.stringify(sent?.turn?.motionTarget ?? null),
    );
    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');
    note(
      'the turn itself is answered by the page route and never reaches the Backend: no model turn, $0 (the agent half is hf-agent’s hyperframes:motion:bench)',
    );
    await context.close();
  } catch (error) {
    check('journey', false, error instanceof Error ? error.message.split('\n')[0] : String(error));
  } finally {
    // ── cleanup + net zero ────────────────────────────────────────────────────────────
    try {
      if (roomId) {
        await admin
          .schema('brand_profiles')
          .from('canvas_rooms')
          .delete()
          .eq('id', roomId)
          .throwOnError();
        await admin
          .schema('brand_profiles')
          .from('canvas_sessions')
          .delete()
          .eq('room_id', roomId)
          .throwOnError();
        const { count } = await admin
          .schema('brand_profiles')
          .from('canvas_rooms')
          .select('id', { count: 'exact', head: true })
          .eq('id', roomId);
        check('net zero: the canvas room is gone', count === 0, roomId);
      }
      if (session && previousActiveBrand !== undefined) {
        await admin
          .schema('brand_profiles')
          .from('user_brand_preferences')
          .upsert(
            {
              user_id: session.userId,
              active_brand_id: previousActiveBrand,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          .throwOnError();
      }
      if (seed) {
        seedCli('cleanup', seed.sessionId);
        const gone = client
          ? await api(client, `/api/ai-studio/hyperframes-agent/runs/${seed.runId}/revision`)
          : null;
        check(
          'net zero: the seeded session and every revision committed here are gone',
          gone?.status === 404,
          `GET revision → ${gone?.status}`,
        );
      }
    } catch (error) {
      check('cleanup', false, error instanceof Error ? error.message : String(error));
    }
    for (const server of servers.reverse()) server.stop();
  }
  expect(printEnvelope(), 'see the envelope above').toBe(0);
});
