import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChatMediaItem } from '@continuum/contracts';
import { chatMediaRefKey } from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Request,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  BENCH_BE_URL,
  type BenchBackend,
  type BenchStill,
  BRAND_ID,
  BUCKET,
  benchObjectPath,
  localStackStatus,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  purgeFixture,
  STILL_SPECS,
  seedSession,
  startBenchBackend,
  stripDraftRow,
  stripFrames,
  stripItems,
  uploadObjects,
  videoAssetRow,
  videoOnlyDraftRow,
} from './support/chatMediaBench';
import { forgetCachedIntegrations, repairOnboarding, setActiveBrand } from './support/plannerBench';

// Organic chat media bench (wave 3a, part 2): `ui.media_strip` frames → the ref signer → real
// local storage → pixels, measured by a real browser.
//
// REAL: the Backend (this clone's, on :4021, workers off) and its sign route, the local Postgres
// rows the strips and the mention chip point at (drafts, a Library video with a poster), the
// stills in local storage, the session/message routes a reopen reads, and every byte the
// browser fetched.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY:
//   · The live agent turn. The "first thumbnail" case fulfils /api/organic/agent/chat with the
//     frames a media tool's turn emits (Playwright route); no model ran, no tool ran. The strip,
//     the sign call and the storage fetch behind it are real.
//   · Server-side resizing. Image transforms are off on the local stack (imgproxy is stopped), so
//     the sign route's `transform` comes back as the plain object URL. The stills are seeded at
//     the size a resized tile really is (≤480 px JPEG q72), so the byte budget measures the real
//     tile path, not imgproxy; organic:chat-media:bench (Backend) measures the resize on hosted.
//   · Distance. Backend and storage are on loopback, so the gated timings carry no real round
//     trip. An extra pass with 50 ms of emulated latency (CDP) is reported as WARN-or-PASS,
//     never gated: it is the honest hint of what a hosted round trip adds.
//   · Provider refs (own Instagram posts, competitors, Unsplash). Their thumb route needs a
//     provider URL a tool run remembered; the strip refs here are `draft` refs into storage.
//   · URL expiry by the clock. A signed URL lives an hour, so the expiry case rewrites the first
//     sign's URLs to ones storage refuses (a tampered token), which is what an expired URL is to
//     a tile: an <img> error. Then it reloads and checks again.
//   · The session tray and the hover card are never opened here (unit tests cover them:
//     DraftTrayPreview.test, videoBytes.test, mentionChips.test). "Reopen" is the in-app switch
//     from the sidebar; the page-reload path is checked for broken tiles, and its time reported.

const STRIP_TILES = 8;
const LIVE_SAMPLES = 8;
const LATENCY_SAMPLES = 4;
const EMULATED_LATENCY_MS = 50;
const BIG_SESSION_LENGTH = 50;
const REOPENS = 5;
const PERSISTED_STRIP_TURNS = [11, 45, 47, 49];
const VIDEO_ONLY_TURN = 43;
const MENTION_TURN = 48;

const BUDGET = {
  firstThumbP75Ms: 300,
  reopenPaintMs: 1_000,
  cardBytes: 400 * 1024,
  tileBytes: 40 * 1024,
};

const SCREENSHOTS = resolve(process.cwd(), '../artifacts/organic-chat-media');
const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_API_URL === BENCH_BE_URL,
);

test.describe.configure({ mode: 'serial' });
test.skip(
  !HAS_LOCAL_STACK,
  'Run through `bun run organic:chat-media:e2e:bench` (local stack env).',
);

const notes = [
  'Local stack: Backend :4021 (workers off) + local Supabase; loopback timings.',
  'Un-exercised: live model turn (frames route-fulfilled), imgproxy resize (stills seeded ≤480 px, so the byte gates prove only the signed still is fetched), provider/Unsplash refs, clock expiry (tampered tokens), tray/hover (unit-tested).',
  'Page reload paint is timed on next dev and reported, not gated; the ≤1 s gate is the in-app reopen.',
];
const recorder = createBenchRecorder('organic:chat-media:e2e:bench', notes);
/** Records the gate in the envelope and fails the test softly, so every gate is graded. */
function gate(step: string, ok: boolean, detail: string): void {
  recorder.record(step, ok ? 'PASS' : 'FAIL', detail);
  expect.soft(ok, `${step}: ${detail}`).toBe(true);
}

type Fixture = {
  bigSessionId: string;
  liveSessionId: string;
  bigTitle: string;
  liveTitle: string;
  /** Strip toolCallId → its ref keys, for the big session's persisted strips. */
  persistedStrips: Map<string, string[]>;
  videoOnlyStripId: string;
  videoAssetId: string;
  /** One cold card per live sample (the gated ones first, then the latency pass). */
  liveCards: Array<{ toolCallId: string; items: ChatMediaItem[] }>;
};

let supabase: SupabaseClient;
let backend: BenchBackend | null = null;
let fixture: Fixture | null = null;
let cookies: Awaited<ReturnType<typeof mintSessionWithPassword>>['cookies'] = [];
const report: Record<string, unknown> = {};

function admin(): SupabaseClient {
  const status = localStackStatus();
  return createClient(status.API_URL ?? '', status.SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
}

const schema = (name: string) =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema(name);

/** Realistic tile stills: photographic noise over a gradient, JPEG q72, the way a tile is cut. */
async function makeStills(page: Page): Promise<BenchStill[]> {
  await page.goto('about:blank');
  const stills: BenchStill[] = [];
  for (const spec of STILL_SPECS) {
    const base64 = await page.evaluate(({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#2b4c7e');
      gradient.addColorStop(1, '#e3a857');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `hsla(${(i * 37) % 360}, 60%, 55%, 0.45)`;
        ctx.beginPath();
        ctx.arc((i * 97) % width, (i * 61) % height, 12 + ((i * 13) % 40), 0, Math.PI * 2);
        ctx.fill();
      }
      const image = ctx.getImageData(0, 0, width, height);
      for (let p = 0; p < image.data.length; p += 4) {
        const n = ((p * 2654435761) >>> 24) % 24;
        image.data[p] = Math.min(255, (image.data[p] ?? 0) + n);
        image.data[p + 1] = Math.min(255, (image.data[p + 1] ?? 0) + n);
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.72).split(',')[1] ?? '';
    }, spec);
    stills.push({ ...spec, bytes: Buffer.from(base64, 'base64') });
  }
  return stills;
}

async function seed(page: Page): Promise<Fixture> {
  const stills = await makeStills(page);
  report.stillBytes = Object.fromEntries(stills.map((still) => [still.name, still.bytes.length]));
  // Kinds as a real strip mixes them; the tile box follows the kind when w/h are unknown.
  const kinds: ChatMediaItem['kind'][] = [
    'image',
    'carousel',
    'video',
    'image',
    'carousel',
    'image',
    'video',
    'carousel',
  ];
  const draftIds = Array.from(
    { length: PERSISTED_STRIP_TURNS.length + LIVE_SAMPLES + LATENCY_SAMPLES },
    () => randomUUID(),
  );
  // Every draft slide is its own object, so no tile rides another tile's browser cache: each
  // card's bytes and first thumbnail are cold.
  const slidePath = (draftId: string, slide: number) => benchObjectPath(`${draftId}-${slide}.jpg`);
  const stillFor = (slide: number) => stills[[0, 1, 2, 0, 1, 0, 2, 1][slide] ?? 0] as BenchStill;
  // Real bytes behind the video refs: if anything handed the browser a video, the ledger sees it.
  const videoPath = benchObjectPath('reel.mp4');
  const posterPath = benchObjectPath('reel-poster.jpg');
  await uploadObjects(supabase, [
    ...draftIds.flatMap((draftId) =>
      kinds.map((_, slide) => ({
        path: slidePath(draftId, slide),
        bytes: stillFor(slide).bytes,
        contentType: 'image/jpeg',
      })),
    ),
    { path: videoPath, bytes: Buffer.alloc(64 * 1024, 7), contentType: 'video/mp4' },
    { path: posterPath, bytes: (stills[2] as BenchStill).bytes, contentType: 'image/jpeg' },
  ]);
  const { data: signedVideo } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(videoPath, 6 * 3600);

  const videoOnlyDraftId = randomUUID();
  await schema('organic')
    .from('organic_calendar_drafts')
    .insert([
      ...draftIds.map((id) =>
        stripDraftRow(
          id,
          kinds.map((_, slide) => ({ path: slidePath(id, slide) })),
        ),
      ),
      videoOnlyDraftRow(videoOnlyDraftId, videoPath),
    ])
    .throwOnError();
  const videoAssetId = randomUUID();
  await schema('media')
    .from('assets')
    .insert(videoAssetRow(videoAssetId, videoPath, posterPath))
    .throwOnError();

  // The 50-message session: strips on four assistant turns (three at the bottom, where a reopen
  // lands; one far above, which must not sign until scrolled to), a video with no poster, and a
  // user turn that mentions the Library video the way the composer saves it (its signed URL).
  const persistedStrips = new Map<string, string[]>();
  const stripAt = new Map(PERSISTED_STRIP_TURNS.map((turn, i) => [turn, draftIds[i] as string]));
  const videoOnlyStripId = `call_bench_${VIDEO_ONLY_TURN}`;
  const bigMessages = Array.from({ length: BIG_SESSION_LENGTH }, (_, index) => {
    const role = index % 2 === 0 ? ('user' as const) : ('assistant' as const);
    const draftId = stripAt.get(index);
    if (draftId) {
      const toolCallId = `call_bench_${index}`;
      const items = stripItems(draftId, kinds);
      persistedStrips.set(
        toolCallId,
        items.map((item) => chatMediaRefKey(item.ref)),
      );
      return {
        role,
        content: `Here are the drafts for turn ${index}.`,
        ui_cards: stripFrames(toolCallId, items, 31),
      };
    }
    if (index === VIDEO_ONLY_TURN) {
      return {
        role,
        content: 'This reel has no poster yet.',
        ui_cards: stripFrames(
          videoOnlyStripId,
          [
            {
              ref: { type: 'draft', draftId: videoOnlyDraftId },
              kind: 'video',
              w: null,
              h: null,
              durationMs: 9_000,
              label: 'Reel without a poster',
            },
          ],
          1,
        ),
      };
    }
    if (index === MENTION_TURN) {
      return {
        role,
        content: 'Cut a shorter version of @Launch reel for stories',
        metadata: {
          references: [
            {
              id: videoAssetId,
              type: 'media_asset',
              label: 'Launch reel',
              source: 'organic',
              metadata: {
                assetId: videoAssetId,
                kind: 'video',
                previewKind: 'video',
                previewUrl: signedVideo?.signedUrl,
              },
            },
          ],
        },
      };
    }
    return {
      role,
      content:
        role === 'user'
          ? `Question ${index}: what should we post next week about the spring launch?`
          : `Answer ${index}. Three ideas: a behind-the-scenes reel, a carousel of the new range, and a customer story. Each one ties back to the launch date and the offer.`,
    };
  });

  const bigSessionId = randomUUID();
  const liveSessionId = randomUUID();
  const bigTitle = 'Chat media bench: fifty turns';
  const liveTitle = 'Chat media bench: live strips';
  const now = Date.now();
  await seedSession(supabase, bigSessionId, bigTitle, bigMessages, new Date(now - 60_000));
  await seedSession(
    supabase,
    liveSessionId,
    liveTitle,
    [
      { role: 'user', content: 'Show me my drafts.' },
      { role: 'assistant', content: 'Ask me for drafts and I will list them.' },
    ],
    new Date(now),
  );

  const liveCards = draftIds.slice(PERSISTED_STRIP_TURNS.length).map((draftId, index) => ({
    toolCallId: `call_live_${index}_${randomUUID().slice(0, 8)}`,
    items: stripItems(draftId, kinds),
  }));
  return {
    bigSessionId,
    liveSessionId,
    bigTitle,
    liveTitle,
    persistedStrips,
    videoOnlyStripId,
    videoAssetId,
    liveCards,
  };
}

// --- Network ledger ------------------------------------------------------------------------------

type Ledger = {
  signs: Array<{ keys: string[] }>;
  images: Map<string, number>;
  videoBytes: number;
  videoRequests: string[];
};

const VIDEO_URL = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

function watch(page: Page): Ledger {
  const ledger: Ledger = { signs: [], images: new Map(), videoBytes: 0, videoRequests: [] };
  page.on('request', (request: Request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/organic/agent/media/sign')) {
      const body = request.postDataJSON() as { refs?: ChatMediaItem['ref'][] } | null;
      ledger.signs.push({ keys: (body?.refs ?? []).map((ref) => chatMediaRefKey(ref)) });
    }
    // Counted when ASKED, not when finished: an aborted range request for a video is still a
    // video fetch the reader never asked for.
    if (request.resourceType() === 'media' || VIDEO_URL.test(request.url())) {
      ledger.videoRequests.push(request.url());
    }
  });
  page.on('requestfinished', async (request: Request) => {
    const response = await request.response();
    if (!response) return;
    const type = response.headers()['content-type'] ?? '';
    const sizes = await request.sizes().catch(() => null);
    const bytes = sizes?.responseBodySize ?? 0;
    if (type.startsWith('video/')) {
      ledger.videoBytes += bytes;
      if (!ledger.videoRequests.includes(request.url())) ledger.videoRequests.push(request.url());
    } else if (type.startsWith('image/')) {
      ledger.images.set(request.url(), bytes);
    }
  });
  return ledger;
}

const signsTouching = (ledger: Ledger, keys: readonly string[]) => {
  const inStrip = new Set(keys);
  return ledger.signs.filter((sign) => sign.keys.some((key) => inStrip.has(key))).length;
};

// --- In-page measurement -------------------------------------------------------------------------

const LAST_STRIP_ID = `call_bench_${BIG_SESSION_LENGTH - 1}`;
const FAR_STRIP_ID = `call_bench_${PERSISTED_STRIP_TURNS[0]}`;

/**
 * The visible area is painted when the newest turn (its strip) is on screen and every strip tile
 * on screen has settled: a decoded still, or the placeholder of a ref with nothing to show.
 * Polled each frame, measured from `t0` on the page's clock.
 */
async function paintedVisibleArea(page: Page, t0: number, timeoutMs = 15_000): Promise<number> {
  return page.evaluate(
    ({ start, timeout, lastStripId }) =>
      new Promise<number>((resolvePaint, reject) => {
        const deadline = performance.now() + timeout;
        // On screen = inside the transcript's own scroll viewport, which clips what scrolled past.
        const onScreen = (el: Element) => {
          const box = el.getBoundingClientRect();
          const vp = el
            .closest('[data-slot="message-scroller-viewport"]')
            ?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
          return box.bottom > vp.top && box.top < vp.bottom && box.width > 0;
        };
        const tick = () => {
          const last = document.querySelector(`[data-strip-id="${lastStripId}"]`);
          const tiles = [
            ...document.querySelectorAll('[data-slot="media-strip"] [data-media-key]'),
          ].filter(onScreen);
          const painted =
            last !== null &&
            onScreen(last) &&
            tiles.length > 0 &&
            tiles.every((tile) => {
              const state = tile.getAttribute('data-tile-state');
              if (state === 'empty') return true;
              if (state !== 'ready') return false;
              const img = tile.querySelector('img');
              return Boolean(img?.complete && img.naturalWidth > 0);
            });
          if (painted) return resolvePaint(performance.now() - start);
          if (performance.now() > deadline) return reject(new Error('visible area never painted'));
          requestAnimationFrame(tick);
        };
        tick();
      }),
    { start: t0, timeout: timeoutMs, lastStripId: LAST_STRIP_ID },
  );
}

type StripState = {
  id: string;
  onScreen: boolean;
  states: string[];
  broken: number;
  srcs: string[];
};

/** Every strip in the DOM: its tiles' states, how many shown tiles failed, and their URLs. */
async function stripStates(page: Page): Promise<StripState[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="media-strip"]')].map((strip) => {
      const box = strip.getBoundingClientRect();
      const vp = strip
        .closest('[data-slot="message-scroller-viewport"]')
        ?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const tiles = [...strip.querySelectorAll('[data-media-key]')];
      const decoded = (tile: Element) => {
        const img = tile.querySelector('img');
        return img?.complete && img.naturalWidth > 0 ? img : null;
      };
      return {
        id: strip.getAttribute('data-strip-id') ?? '?',
        onScreen: box.bottom > vp.top && box.top < vp.bottom,
        states: tiles.map((tile) => tile.getAttribute('data-tile-state') ?? '?'),
        // A tile meant to show a still that does not: pending forever, or ready with no pixels.
        broken: tiles.filter(
          (tile) => tile.getAttribute('data-tile-state') !== 'empty' && !decoded(tile),
        ).length,
        srcs: tiles.flatMap((tile) => {
          const img = decoded(tile);
          return img ? [img.currentSrc || img.src] : [];
        }),
      };
    }),
  );
}

/**
 * Scrolls to each strip the way a reader does (the wheel, which also releases the transcript's
 * follow-the-live-edge latch), waits for its tiles to settle, and reports each strip as it was
 * while on screen.
 */
async function visitEveryStrip(page: Page, stripIds: readonly string[]): Promise<StripState[]> {
  const seen: StripState[] = [];
  for (const id of stripIds) {
    const offset = async () =>
      page.evaluate((stripId) => {
        const strip = document.querySelector(
          `[data-slot="media-strip"][data-strip-id="${stripId}"]`,
        );
        const viewport = strip?.closest('[data-slot="message-scroller-viewport"]');
        if (!strip || !viewport) return null;
        const box = strip.getBoundingClientRect();
        const vp = viewport.getBoundingClientRect();
        if (box.top >= vp.top && box.bottom <= vp.bottom) return 0;
        return box.top < vp.top ? box.top - vp.top - 40 : box.bottom - vp.bottom + 40;
      }, id);
    const viewport = page.locator('[data-slot="message-scroller-viewport"]:visible').first();
    const vpBox = await viewport.boundingBox();
    if (vpBox) await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
    for (let step = 0; step < 60; step++) {
      const delta = await offset();
      if (delta === null || delta === 0) break;
      await page.mouse.wheel(0, Math.sign(delta) * Math.min(Math.abs(delta), 700));
      await page.waitForTimeout(60);
    }
    const settled = async () => (await stripStates(page)).find((state) => state.id === id);
    await expect
      .poll(
        async () => {
          const state = await settled();
          return state ? state.broken === 0 && !state.states.includes('pending') : false;
        },
        { timeout: 15_000 },
      )
      .toBe(true)
      .catch(() => {});
    const state = await settled();
    if (state) seen.push(state);
  }
  return seen;
}

async function chipState(page: Page): Promise<{ src: string | null; decoded: boolean }> {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('img.mention-inline__thumb');
    return {
      src: img?.currentSrc || img?.src || null,
      decoded: Boolean(img?.complete && img.naturalWidth > 0),
    };
  });
}

function p75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)] ?? Number.NaN;
}

async function openOrganic(page: Page, sessionId: string): Promise<void> {
  await page.goto(`/organic?tab=agent&sessionId=${sessionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-tour-id="organic-agent-panel"]')).toBeVisible({
    timeout: 180_000,
  });
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  return context;
}

function git(dir: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
  } catch {
    return 'unknown';
  }
}

// HEAD alone does not pin an uncommitted tree: the hash of the working diff and of the new
// source files does.
function gitRev(dir: string, paths: string[]): { head: string; treeSha1: string } {
  const tree = createHash('sha1').update(git(dir, ['diff', 'HEAD', '--', ...paths]));
  const untracked = git(dir, ['ls-files', '--others', '--exclude-standard', '--', ...paths]);
  for (const file of untracked.split('\n').filter(Boolean).sort()) {
    tree.update(file);
    if (existsSync(join(dir, file))) tree.update(readFileSync(join(dir, file)));
  }
  return {
    head: git(dir, ['rev-parse', '--short', 'HEAD']).trim(),
    treeSha1: tree.digest('hex').slice(0, 12),
  };
}

// --- The bench -----------------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(SCREENSHOTS, { recursive: true });
  supabase = admin();
  backend = await startBenchBackend();
  report.backendPid = backend.pid;
  await setActiveBrand(supabase, BRAND_ID);
  await repairOnboarding(supabase);
  await forgetCachedIntegrations();
  cookies = (await mintSessionWithPassword(OWNER_EMAIL, OWNER_PASSWORD)).cookies;
  const page = await browser.newPage();
  fixture = await seed(page);
  await page.close();
});

// A test that throws before its gates (a page that never paints) still fails the envelope.
// biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    recorder.record(
      `test:${testInfo.title}`,
      'FAIL',
      testInfo.error?.message?.split('\n')[0] ?? testInfo.status ?? 'failed',
    );
  }
});

test.afterAll(async () => {
  if (supabase && fixture) {
    await purgeFixture(
      supabase,
      [fixture.bigSessionId, fixture.liveSessionId],
      [fixture.videoAssetId],
    );
  }
  await backend?.stop();
  const written = {
    generatedAt: new Date().toISOString(),
    gitRev: {
      frontend: gitRev('.', ['src', 'e2e', 'package.json']),
      contracts: gitRev('..', ['packages/contracts']),
    },
    ...report,
  };
  writeFileSync(join(SCREENSHOTS, 'bench-report.json'), `${JSON.stringify(written, null, 2)}\n`);
  console.log(`[chat-media bench] ${JSON.stringify(written)}`);
  recorder.print();
});

test('a 50-message session reopens painted in ≤1 s: one sign per card on view, ≤400 KB a card, no video', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const f = fixture as Fixture;
  const reopenMs: number[] = [];
  const perRound: Array<Record<string, unknown>> = [];
  let videoRequests: string[] = [];
  let videoBytes = 0;

  // Each round is cold: a fresh context (no HTTP cache, no sign cache, no query cache) opens the
  // small session, then the big one is opened from the sidebar, the way a reader comes back to it.
  for (let round = 0; round < REOPENS; round++) {
    const context = await newContext(browser);
    const page = await context.newPage();
    const ledger = watch(page);
    await openOrganic(page, f.liveSessionId);
    await expect(page.getByText('Ask me for drafts and I will list them.')).toBeVisible({
      timeout: 60_000,
    });
    const bigButton = page.getByRole('button', { name: new RegExp(f.bigTitle) });
    await expect(bigButton).toBeVisible({ timeout: 60_000 });
    const handle = await bigButton.elementHandle();
    const t0 = await page.evaluate((button) => {
      const start = performance.now();
      (button as HTMLButtonElement).click();
      return start;
    }, handle);
    reopenMs.push(Math.round(await paintedVisibleArea(page, t0)));
    await expect
      .poll(async () => (await chipState(page)).decoded, { timeout: 10_000 })
      .toBe(true)
      .catch(() => {});

    const strips = await stripStates(page);
    const signs = Object.fromEntries(
      [...f.persistedStrips].map(([id, keys]) => [id, signsTouching(ledger, keys)]),
    );
    const onScreen = strips.filter((strip) => strip.onScreen && f.persistedStrips.has(strip.id));
    const missingBytes: string[] = [];
    const cardBytes = Object.fromEntries(
      onScreen.map((strip) => {
        const sizes = strip.srcs.map((src) => {
          const bytes = ledger.images.get(src);
          if (bytes === undefined) missingBytes.push(src);
          return bytes ?? 0;
        });
        return [
          strip.id,
          {
            tiles: sizes.length,
            bytes: sizes.reduce((sum, n) => sum + n, 0),
            maxTile: Math.max(0, ...sizes),
          },
        ];
      }),
    );
    const chip = await chipState(page);
    perRound.push({
      reopenMs: reopenMs.at(-1),
      onScreen: onScreen.map((strip) => strip.id),
      signs,
      cardBytes,
      missingBytes: missingBytes.length,
      chip,
    });
    videoRequests = [...videoRequests, ...ledger.videoRequests];
    videoBytes += ledger.videoBytes;

    if (round === 0) await page.screenshot({ path: join(SCREENSHOTS, 'reopen-50-messages.png') });
    await context.close();
  }

  report.reopen = { reopenMs, p75Ms: p75(reopenMs), rounds: perRound };
  report.videoBytesBeforePlay = videoBytes;
  report.videoRequests = videoRequests;

  for (const [index, round] of perRound.entries()) {
    const signs = round.signs as Record<string, number>;
    const onScreen = round.onScreen as string[];
    const cards = Object.entries(
      round.cardBytes as Record<string, { tiles: number; bytes: number; maxTile: number }>,
    );
    gate(
      `reopen.${index}.one-sign-per-card-on-screen`,
      onScreen.length > 0 && onScreen.every((id) => signs[id] === 1),
      `on screen ${onScreen.join(',')} → ${JSON.stringify(signs)}`,
    );
    gate(
      `reopen.${index}.off-screen-cards-not-signed-twice`,
      Object.values(signs).every((n) => n <= 1),
      JSON.stringify(signs),
    );
    // The first strip sits ~40 turns above the paint: signing on view means it is never asked for.
    gate(
      `reopen.${index}.far-strip-unsigned`,
      !onScreen.includes(FAR_STRIP_ID) && (signs[FAR_STRIP_ID] ?? 0) === 0,
      `${FAR_STRIP_ID} → ${signs[FAR_STRIP_ID] ?? 0} signs`,
    );
    gate(
      `reopen.${index}.every-tile-measured`,
      (round.missingBytes as number) === 0 &&
        cards.length === onScreen.length &&
        cards.every(([, card]) => card.tiles === STRIP_TILES),
      `${cards.length}/${onScreen.length} cards, ${round.missingBytes} tiles without a ledger entry`,
    );
    gate(
      `reopen.${index}.card-bytes-signed-stills-only`,
      cards.every(([, card]) => card.bytes <= BUDGET.cardBytes),
      cards.map(([id, card]) => `${id}=${card.bytes}B`).join(' '),
    );
    gate(
      `reopen.${index}.tile-bytes-signed-stills-only`,
      cards.every(([, card]) => card.maxTile <= BUDGET.tileBytes),
      cards.map(([id, card]) => `${id} max ${card.maxTile}B`).join(' '),
    );
    const chip = round.chip as { src: string | null; decoded: boolean };
    gate(
      `reopen.${index}.video-chip-shows-its-poster`,
      chip.decoded && Boolean(chip.src) && !VIDEO_URL.test(chip.src ?? ''),
      chip.src ?? 'no chip still',
    );
  }
  gate(
    'reopen.no-video-bytes',
    videoBytes === 0 && videoRequests.length === 0,
    `${videoBytes}B ${videoRequests.join(' ')}`,
  );
  gate(
    'reopen.cold-paint',
    Math.max(...reopenMs) <= BUDGET.reopenPaintMs,
    `${reopenMs.join('/')} ms (max ≤ ${BUDGET.reopenPaintMs})`,
  );
});

test('a live strip shows its first thumbnail ≤300 ms p75 after the frame, one sign per card', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const f = fixture as Fixture;
  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);
  let sample = 0;
  await page.route('**/api/organic/agent/chat', async (route) => {
    const card = f.liveCards[sample];
    sample += 1;
    if (!card) return route.abort();
    const frames = [
      { type: 'response.created', data: {} },
      ...stripFrames(card.toolCallId, card.items, card.items.length),
      { type: 'response.output_text.delta', data: { delta: 'Here are your drafts.' } },
      { type: 'response.done', data: {} },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
      body: `${frames.map((frame, seq) => JSON.stringify({ ...frame, seq: seq + 1 })).join('\n')}\n`,
    });
  });

  // The frame's arrival on the page's clock: the moment the chat response's body is in hand.
  await page.addInitScript(() => {
    const arrivals: number[] = [];
    (window as unknown as { __frameArrivals: number[] }).__frameArrivals = arrivals;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/organic/agent/chat')) arrivals.push(performance.now());
      return response;
    };
  });
  await openOrganic(page, f.liveSessionId);
  await expect(page.getByText('Ask me for drafts and I will list them.')).toBeVisible({
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const times: Record<string, { mounted?: number; firstThumb?: number }> = {};
    (window as unknown as { __stripTimes: typeof times }).__stripTimes = times;
    new MutationObserver(() => {
      for (const strip of document.querySelectorAll('[data-slot="media-strip"]')) {
        const id = strip.getAttribute('data-strip-id') ?? '';
        times[id] ??= {};
        times[id].mounted ??= performance.now();
      }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener(
      'load',
      (event) => {
        const target = event.target as Element | null;
        if (target?.tagName !== 'IMG') return;
        const id = target.closest('[data-slot="media-strip"]')?.getAttribute('data-strip-id');
        if (!id || !times[id]) return;
        times[id].firstThumb ??= performance.now();
      },
      true,
    );
  });

  const composer = page.getByRole('textbox', { name: 'Message the organic agent' });
  const runSample = async (index: number) => {
    const card = f.liveCards[index] as Fixture['liveCards'][number];
    await composer.click();
    await page.keyboard.type('Show me the drafts');
    await page.getByRole('button', { name: 'Send message' }).click();
    const strip = page.locator(`[data-slot="media-strip"][data-strip-id="${card.toolCallId}"]`);
    await expect(strip).toBeVisible({ timeout: 30_000 });
    const elapsed = await page.waitForFunction(
      ({ id, sample: at }) => {
        const w = window as unknown as {
          __stripTimes: Record<string, { mounted?: number; firstThumb?: number }>;
          __frameArrivals: number[];
        };
        const t = w.__stripTimes[id];
        const arrived = w.__frameArrivals[at];
        return t?.mounted !== undefined && t.firstThumb !== undefined && arrived !== undefined
          ? { fromFrame: t.firstThumb - arrived, fromMount: t.firstThumb - t.mounted }
          : null;
      },
      { id: card.toolCallId, sample: index },
      { timeout: 15_000 },
    );
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({
      timeout: 30_000,
    });
    return (await elapsed.jsonValue()) as { fromFrame: number; fromMount: number };
  };

  const firstThumbMs: number[] = [];
  const mountToThumbMs: number[] = [];
  for (let index = 0; index < LIVE_SAMPLES; index++) {
    const { fromFrame, fromMount } = await runSample(index);
    firstThumbMs.push(Math.round(fromFrame));
    mountToThumbMs.push(Math.round(fromMount));
  }
  await page.screenshot({ path: join(SCREENSHOTS, 'live-strip.png') });

  // The latency pass: every real request (sign, storage) pays an emulated round trip.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: EMULATED_LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const latencyThumbMs: number[] = [];
  for (let index = LIVE_SAMPLES; index < LIVE_SAMPLES + LATENCY_SAMPLES; index++) {
    latencyThumbMs.push(Math.round((await runSample(index)).fromFrame));
  }

  const signsPerLiveCard = f.liveCards.map((card) =>
    signsTouching(
      ledger,
      card.items.map((item) => chatMediaRefKey(item.ref)),
    ),
  );
  report.live = {
    firstThumbMs,
    p75Ms: p75(firstThumbMs),
    stripMountToThumbMs: mountToThumbMs,
    signsPerCard: signsPerLiveCard,
    videoBytes: ledger.videoBytes,
    emulatedLatencyMs: EMULATED_LATENCY_MS,
    latencyFirstThumbMs: latencyThumbMs,
    latencyP75Ms: p75(latencyThumbMs),
  };

  gate(
    'live.one-sign-per-card',
    signsPerLiveCard.every((n) => n === 1),
    signsPerLiveCard.join(','),
  );
  gate(
    'live.first-thumb-p75',
    p75(firstThumbMs) <= BUDGET.firstThumbP75Ms,
    `${firstThumbMs.join('/')} ms → p75 ${p75(firstThumbMs)} (≤ ${BUDGET.firstThumbP75Ms})`,
  );
  gate(
    'live.no-video-bytes',
    ledger.videoRequests.length === 0,
    ledger.videoRequests.join(' ') || '0',
  );
  // Informational: what a round trip adds. Environmental, so WARN, never a failure.
  recorder.record(
    'live.first-thumb-p75-with-latency',
    p75(latencyThumbMs) <= BUDGET.firstThumbP75Ms ? 'PASS' : 'WARN',
    `${EMULATED_LATENCY_MS} ms RTT: ${latencyThumbMs.join('/')} ms → p75 ${p75(latencyThumbMs)}`,
  );
  await context.close();
});

test('0 broken tiles after the signed URLs expire, on every strip of the thread, then a reload', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const f = fixture as Fixture;
  const context = await newContext(browser);
  const page = await context.newPage();
  const ledger = watch(page);
  // Every ref's FIRST signed URL is one storage refuses (what a lapsed URL is to an <img>); any
  // later sign of that ref is the real answer. Strip tiles and the mention chip alike.
  const lapsed = new Set<string>();
  await page.route(`${BENCH_BE_URL}/api/organic/agent/media/sign`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    const json = (await response.json()) as {
      items: Array<{ key: string; thumbUrl: string | null }>;
    };
    for (const item of json.items) {
      if (item.thumbUrl && !lapsed.has(item.key)) {
        lapsed.add(item.key);
        item.thumbUrl = item.thumbUrl.replace(/token=([^&]+)/, 'token=$1x');
      }
    }
    return route.fulfill({ response, json });
  });

  const everyStrip = [...f.persistedStrips.keys(), f.videoOnlyStripId].sort().reverse();
  await openOrganic(page, f.bigSessionId);
  await paintedVisibleArea(page, await page.evaluate(() => performance.now()), 30_000);
  await expect
    .poll(async () => (await chipState(page)).decoded, { timeout: 10_000 })
    .toBe(true)
    .catch(() => {});
  const chipAfterRecovery = await chipState(page);
  await page.screenshot({ path: join(SCREENSHOTS, 'after-expiry-recovered.png') });
  const afterRecovery = await visitEveryStrip(page, everyStrip);
  const signsPerCard = Object.fromEntries(
    [...f.persistedStrips].map(([id, keys]) => [id, signsTouching(ledger, keys)]),
  );

  await page.unrouteAll({ behavior: 'wait' });
  const reloadStart = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await paintedVisibleArea(page, await page.evaluate(() => performance.now()), 30_000);
  const reloadPaintMs = Date.now() - reloadStart;
  const afterReload = await visitEveryStrip(page, everyStrip);

  const brokenOf = (states: StripState[]) =>
    Object.fromEntries(states.map((state) => [state.id, state.broken]));
  const videoOnly = afterRecovery.find((state) => state.id === f.videoOnlyStripId);
  report.expiry = {
    tampered: lapsed.size,
    chipAfterRecovery,
    brokenAfterRecovery: brokenOf(afterRecovery),
    brokenAfterReload: brokenOf(afterReload),
    signsPerCard,
    videoOnlyTile: videoOnly?.states,
    reloadPaintMs,
    videoRequests: ledger.videoRequests,
  };

  // `next dev` compiles and hydrates the whole page on a reload; the ≤1 s budget is the in-app
  // reopen. Reported, never gated: a production build is the fair clock for this one.
  recorder.record('expiry.reload-paint-not-gated', 'PASS', `${reloadPaintMs} ms (next dev, informational)`);
  gate('expiry.tampered', lapsed.size > 0, `${lapsed.size} URLs handed out lapsed`);
  gate(
    'expiry.every-strip-visited',
    everyStrip.every((id) => afterRecovery.some((state) => state.id === id)),
    afterRecovery.map((state) => state.id).join(','),
  );
  gate(
    'expiry.zero-broken-after-recovery',
    afterRecovery.every((state) => state.broken === 0),
    JSON.stringify(brokenOf(afterRecovery)),
  );
  gate(
    'expiry.zero-broken-after-reload',
    afterReload.every((state) => state.broken === 0),
    JSON.stringify(brokenOf(afterReload)),
  );
  gate(
    'expiry.chip-recovered',
    chipAfterRecovery.decoded,
    chipAfterRecovery.src ?? 'no chip still',
  );
  // One sign on view plus at most one coalesced re-sign per card.
  gate(
    'expiry.bounded-resigns',
    Object.values(signsPerCard).every((n) => n >= 1 && n <= 2),
    JSON.stringify(signsPerCard),
  );
  gate(
    'expiry.video-without-poster-is-a-placeholder',
    videoOnly?.states.join() === 'empty',
    videoOnly?.states.join() ?? 'strip missing',
  );
  gate(
    'expiry.no-video-bytes',
    ledger.videoRequests.length === 0,
    ledger.videoRequests.join(' ') || '0',
  );
  await context.close();
});
