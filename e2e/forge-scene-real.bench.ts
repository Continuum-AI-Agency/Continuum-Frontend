/**
 * forge:scene:real:bench — the Blender scene editor on three REAL .blend files from blender.org, in
 * a real Chrome, against a bench-owned Backend (hosted Supabase, every background worker off) and
 * its own Next app, signed in as the bench brand's owner for THIS session only.
 *
 *   1. ATV        Blender 2.66, as shipped: the forge refuses it `too_old`, and its Forge sheet says
 *                 so in words ("Saved in Blender 2.79 or older…"), never as the raw code;
 *   2. BMW27      a still that kept Blender's default 1–1000 range: the editor draws a draft (no 422
 *                 "frame range must be 1..600 frames"), Render as defaults to Still · frame 1 with
 *                 the 1000-frame animation disabled and explained, and Render final asks for an
 *                 image and completes;
 *   3. LONE MONK  5,579 fields over 1,368 objects: the inspector is interactive within 10 s of the
 *                 heading, the page stays under 25,000 DOM nodes, a hide switch flips within 1 s of
 *                 Space, and a 250-frame 1440×1080 animation is refused as too heavy before any job
 *                 exists;
 *   4. CLEANUP    every template whose page was opened is removed through its sheet (opening one
 *                 writes an immutable baseline revision, so the app's soft delete is all that is
 *                 possible), then everything the run made is deleted by tracked id.
 *
 * Parse goes through the DEPLOYED Backend and forge (register → the deployed parse), so the parse
 * times, the refusal and the still/video hint are what production does today. The editor talks to
 * the bench-owned local Backend (this checkout), which renders drafts and finals on the real
 * continuum-scene and decides the picker's request and the heavy-render refusal.
 *
 * The files are sha256-pinned in GCS (`blend-real/files/`; benchmarks live in GCS by owner rule)
 * and cached in `<tmp>/forge-scene-real-cache/`; `--files=<dir>` reads local copies instead.
 *
 * Run: `bun run forge:scene:real:bench` (Frontend). `--dry-run` verifies the cached digests and
 * prints the plan, with no network and nothing written; `--headed` to watch.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type BlendParse, blendParseSchema } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import type { Page, Request } from 'playwright';
import { createBenchRecorder } from './support/benchRecorder';
import {
  cleanupMade,
  forwardProductionEnv,
  type SceneBenchMade,
  startApp,
  uploadAsBrowserDrop,
  waitForParse,
} from './support/sceneBench';

const BENCH = 'forge:scene:real:bench';

const FILES = {
  atv: {
    file: 'atv-buggy-2.66.blend',
    sha256: 'b942ba82732f75c3c83fbbd4f8bc4d96dbda7872bf5406bf45a2075d3c414956',
    plan: 'refused too_old; its sheet says why in words',
  },
  bmw27: {
    file: 'bmw27.blend',
    sha256: '10cc861e4da6c2db02f3057296bce273e47c13db3a9c4b71e5b7e75e268e1474',
    plan: 'a still on a 1–1000 range: draft, Render as picker, Render final as an image',
  },
  'lone-monk': {
    file: 'lone-monk.blend',
    sha256: 'eea2bbfb3f9271050f523c8351fca40f2f559ce84b42b0143e949ecdb4594c3b',
    plan: 'the editor at 5,579 fields; a hide toggle; a 250-frame animation refused as too heavy',
  },
} as const;
type FileKey = keyof typeof FILES;
const KEYS = Object.keys(FILES) as FileKey[];

const USAGE = `${BENCH} — the Blender scene editor on real .blend files from blender.org.

  bun run forge:scene:real:bench [-- flags]

  --dry-run          verify the cached files' sha256 and print the plan; no network, nothing written
  --only=<keys>      a subset of ${KEYS.join(',')} (default all)
  --files=<dir>      read the files from <dir> instead of GCS (named as in blend-real/files/)
  --headed           show the browser
  --scene-url=<url>  the continuum-scene the bench Backend renders on, when
                     CONTINUUM_SCENE_SERVICE_URL is not in the Backend env files
  --help             this text

  FORGE_SCENE_BRAND_ID / FORGE_SCENE_OWNER_EMAIL             another brand (it must have Forge)
  FORGE_SCENE_REAL_APP_PORT / FORGE_SCENE_REAL_BACKEND_PORT  ports (default 3147 / 4447)

Writes only to the bench brand and deletes what it wrote.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const flag = (name: string) =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = argv.includes('--dry-run');
const SCENE_URL_FLAG = flag('scene-url');
const FILES_DIR = flag('files');
const ONLY = flag('only')
  ?.split(',')
  .map((key) => key.trim())
  .filter(Boolean) ?? [...KEYS];
const unknownKeys = ONLY.filter((key) => !(key in FILES));
if (unknownKeys.length) {
  console.error(`unknown --only key(s): ${unknownKeys.join(', ')}\n\n${USAGE}`);
  process.exit(2);
}
const SELECTED = KEYS.filter((key) => ONLY.includes(key));

/** The bench brand and its owner (Backend `_bench/fixtures.ts`); identities stay overridable. */
const BRAND_ID = process.env.FORGE_SCENE_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = process.env.FORGE_SCENE_OWNER_EMAIL ?? 'bench@trycontinuum.ai';
const APP_PORT = Number(process.env.FORGE_SCENE_REAL_APP_PORT ?? 3147);
const BACKEND_PORT = Number(process.env.FORGE_SCENE_REAL_BACKEND_PORT ?? 4447);
const APP = `http://127.0.0.1:${APP_PORT}`;
const FRONTEND_DIR = process.cwd();
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '../Continuum-Backend');
const SHOTS = path.resolve(FRONTEND_DIR, 'e2e/__screenshots__/forge-scene-real');
const GCS_BUCKET = 'continuum-production-477821-creative-benchmarks';
const GCS_PREFIX = 'blend-real/files/';
const CACHE_DIR = path.join(os.tmpdir(), 'forge-scene-real-cache');
const SOURCE_DIR = FILES_DIR ? path.resolve(FILES_DIR) : CACHE_DIR;
/** The first forge that marks a scene with no animation a still, whatever its frame range. */
const HINT_PARSER = [1, 2, 0];
/** The render frame cap (`MAX_FRAMES` in the contract): a longer range cannot be an animation. */
const MAX_FRAMES = 600;
const MIN_FIELDS = 5_000;
const INTERACTIVE_AFTER_H1_MS = 10_000;
const MAX_DOM_NODES = 25_000;
const TOGGLE_MS = 1_000;
/** An object Lone Monk carries, and whose hide switch the search reaches. */
const HIDE_OBJECT = 'arch.001';
const PAGE_TIMEOUT_MS = 240_000;
const FIRST_DRAFT_MS = 180_000;
const FINAL_RENDER_MS = 5 * 60_000;
/** Past the editor's 600 ms draft debounce, so an edit that would ask for a draft has asked. */
const DRAFT_SETTLE_MS = 1_500;
const RENDER_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';

const notes: string[] = [];
const rec = createBenchRecorder(BENCH, notes);
let failed = false;
const check = (step: string, ok: boolean, detail?: string) => {
  if (!ok) failed = true;
  rec.record(step, ok ? 'PASS' : 'FAIL', detail);
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};
/** A speed sample or a draft on a shared renderer: graded WARN when it misses, never FAIL. */
const sample = (step: string, ok: boolean, detail?: string) => {
  rec.record(step, ok ? 'PASS' : 'WARN', detail);
  console.log(`${ok ? '✓ PASS' : '! WARN'} ${step}${detail ? ` — ${detail}` : ''}`);
};
const skip = (step: string, detail: string) => {
  rec.record(step, 'SKIP', detail);
  console.log(`– SKIP ${step} — ${detail}`);
};
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
/** `blend-library@1.1.0` → is it at least `min`? An unreadable version is not. */
const parserAtLeast = (parser: string, min: number[]) => {
  const version = /@(\d+)\.(\d+)\.(\d+)/.exec(parser)?.slice(1).map(Number);
  const weight = (parts: number[]) => parts.reduce((sum, part) => sum * 1_000 + part, 0);
  return Boolean(version) && weight(version ?? []) >= weight(min);
};

// ── The files ────────────────────────────────────────────────────────────────────────────────

async function downloadFromGcs(file: string, to: string) {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage({ keyFilename: path.join(BACKEND_DIR, 'GOOGLE_CREDS.json') });
  mkdirSync(path.dirname(to), { recursive: true });
  await storage.bucket(GCS_BUCKET).file(`${GCS_PREFIX}${file}`).download({ destination: to });
}

/**
 * The pinned bytes of every selected file. A cached copy is reused only when its digest matches;
 * a live run downloads a missing or stale one through `.part`, so the cache only ever holds bytes
 * that matched once. `--dry-run` reads only what is already on disk.
 */
async function loadFiles(): Promise<Map<FileKey, Buffer>> {
  const loaded = new Map<FileKey, Buffer>();
  for (const key of SELECTED) {
    const { file, sha256: pinned } = FILES[key];
    const at = path.join(SOURCE_DIR, file);
    const step = `${key}: ${file} is the pinned file`;
    let bytes = existsSync(at) ? readFileSync(at) : null;
    if (bytes && !DRY_RUN && !FILES_DIR && sha256(bytes) !== pinned) {
      note(`${at} is not the pinned file; downloading it again`);
      bytes = null;
    }
    if (!bytes) {
      if (DRY_RUN) {
        skip(
          step,
          `not at ${at}; a live run ${FILES_DIR ? 'needs it there' : `downloads gs://${GCS_BUCKET}/${GCS_PREFIX}${file}`}`,
        );
        continue;
      }
      if (FILES_DIR) {
        check(step, false, `missing: ${at}`);
        continue;
      }
      const part = `${at}.part`;
      const started = Date.now();
      try {
        await downloadFromGcs(file, part);
      } catch (error) {
        rmSync(part, { force: true });
        check(step, false, `download failed: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      bytes = readFileSync(part);
      if (sha256(bytes) === pinned) renameSync(part, at);
      else rmSync(part, { force: true });
      note(
        `downloaded ${file} (${megabytes(bytes.byteLength)}) in ${seconds(Date.now() - started)}`,
      );
    }
    const digest = sha256(bytes);
    check(
      step,
      digest === pinned,
      `sha256 ${digest.slice(0, 16)}… · ${bytes.byteLength} B · ${at}`,
    );
    if (digest === pinned) loaded.set(key, bytes);
  }
  return loaded;
}

// ── Live run ─────────────────────────────────────────────────────────────────────────────────

type Uploaded = {
  assetId: string;
  state: string | null;
  parseError: string | null;
  parse: BlendParse | null;
  /** Why a parsed row did not read through `blendParseSchema`. */
  schemaError: string | null;
};

type SentBody = { values?: Record<string, unknown>; overrides?: unknown };
/** One POST to a scene route, as the browser saw it. */
type Exchange = {
  assetId: string;
  route: 'previews' | 'renders';
  at: number;
  status: number;
  serverTiming: string | null;
  sent: SentBody | null;
  answer: Record<string, unknown> | null;
};
const SCENE_POST = /\/templates\/([0-9a-f-]{36})\/scene\/(previews|renders)$/;

function sentBody(request: Request): SentBody | null {
  try {
    return request.postDataJSON() as SentBody | null;
  } catch {
    return null;
  }
}

const describe = (exchange: Exchange) =>
  `HTTP ${exchange.status} · Server-Timing ${exchange.serverTiming ?? 'none'}${exchange.answer?.cached === true ? ' · cached' : ''}`;

async function until<T>(probe: () => T | undefined, ms: number): Promise<T | undefined> {
  for (const deadline = Date.now() + ms; Date.now() < deadline; ) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return probe();
}

async function live(files: Map<FileKey, Buffer>) {
  // Loaded here, not at the top: these read env at call time, and --help / --dry-run need none.
  const [{ loadProdSupabaseEnv, readBackendEnv }, { mintSessionBundleForEmail }, localBackend] =
    await Promise.all([
      import('./support/prodEnv'),
      import('./support/auth'),
      import('./support/localBackend'),
    ]);
  const { chromium } = await import('playwright');
  const { url: SUPABASE_URL, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
  process.env.PLAYWRIGHT_BASE_URL = APP;
  process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
  process.env.BACKGROUND_WORKERS_ENABLED = 'false';
  forwardProductionEnv(BACKEND_DIR, [
    'TEMPLATE_FORGE_URL',
    'TEMPLATE_FORGE_TOKEN',
    'CONTINUUM_SCENE_SERVICE_URL',
    'INTERNAL_TEMPLATE_PARSE_SECRET',
  ]);
  if (SCENE_URL_FLAG) process.env.CONTINUUM_SCENE_SERVICE_URL = SCENE_URL_FLAG;
  if (!process.env.CONTINUUM_SCENE_SERVICE_URL) {
    // Without it every draft answers 502 and the editor waits out FIRST_DRAFT_MS for nothing.
    check(
      'the bench Backend knows a continuum-scene',
      false,
      'no CONTINUUM_SCENE_SERVICE_URL in the Backend env — pass --scene-url=<url>',
    );
    return;
  }
  const admin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const media = () => admin.schema('media');
  const runId = randomUUID().slice(0, 8);
  const made: SceneBenchMade = {
    templates: new Set(),
    assets: new Set(),
    jobs: new Set(),
    objects: new Set(),
  };
  /** Templates whose sheet or editor this run opened; each is removed through its sheet. */
  const opened = new Map<string, FileKey>();
  const exchanges: Exchange[] = [];
  const postsTo = (assetId: string, route: Exchange['route'], since: number) =>
    exchanges.filter(
      (exchange) =>
        exchange.assetId === assetId && exchange.route === route && exchange.at >= since,
    );

  let backend: Awaited<ReturnType<typeof localBackend.startLocalBackend>> | null = null;
  let stopApp: (() => void) | null = null;
  let browser: import('playwright').Browser | null = null;
  let page: Page | null = null;
  const session = await mintSessionBundleForEmail(OWNER_EMAIL);

  const shoot = (activePage: Page, name: string) =>
    activePage.screenshot({ path: path.join(SHOTS, name), fullPage: true }).catch(() => undefined);

  /** The sheet's Remove → "Remove from brand", then the row read until it is gone or deleted. */
  const removeThroughSheet = async (activePage: Page, assetId: string) => {
    await activePage.goto(`${APP}/forge?template=${assetId}`, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    const remove = activePage.getByRole('button', { name: 'Remove', exact: true });
    await remove.waitFor({ timeout: PAGE_TIMEOUT_MS });
    await remove.click();
    await activePage.getByRole('button', { name: 'Remove from brand' }).click();
    for (let tries = 0; tries < 30; tries++) {
      const { data } = await media()
        .from('assets')
        .select('deleted_at')
        .eq('id', assetId)
        .maybeSingle();
      const row = data as { deleted_at: string | null } | null;
      if (!row || row.deleted_at) return row ? 'soft-deleted' : 'row deleted';
      await activePage.waitForTimeout(1_000);
    }
    return 'still live after 30 s';
  };

  try {
    const claims = JSON.parse(
      Buffer.from(session.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { sub: string; session_id: string };
    const member = createClient(SUPABASE_URL, publishableKey, {
      global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const pinned = await member.schema('brand_profiles').from('user_session_brands').upsert(
      {
        user_id: claims.sub,
        session_id: claims.session_id,
        active_brand_id: BRAND_ID,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_id' },
    );
    if (pinned.error) throw new Error(`session brand pin failed: ${pinned.error.message}`);

    backend = await localBackend.startLocalBackend({
      port: BACKEND_PORT,
      browserOrigin: APP,
      supabase: 'hosted',
      label: BENCH,
    });

    // ── Upload each, as a browser drop does; the DEPLOYED Backend and forge parse it ──────────
    const parseSecret =
      readBackendEnv('INTERNAL_TEMPLATE_PARSE_SECRET') ??
      process.env.INTERNAL_TEMPLATE_PARSE_SECRET;
    const uploaded = new Map<FileKey, Uploaded>();
    for (const [key, bytes] of files) {
      const started = Date.now();
      const ticket = await uploadAsBrowserDrop({
        supabaseUrl: SUPABASE_URL,
        publishableKey,
        accessToken: session.accessToken,
        admin,
        brandId: BRAND_ID,
        fileName: `bench-forge-scene-real-${runId}-${key}.blend`,
        bytes,
        checksum: FILES[key].sha256,
        made,
      });
      const registered = Date.now();
      await waitForParse({
        admin,
        assetId: ticket.assetId,
        brandId: BRAND_ID,
        backendUrl: backend.url,
        parseSecret,
        note,
        // A refusal is an answer too: a failed parse is not handed to the bench Backend again.
        settled: (state) => state === 'parsed' || state === 'failed',
      });
      const parsedAfter = Date.now() - registered;
      const { data } = await media()
        .from('template_sources')
        .select('parse_state, parse_error, parse')
        .eq('asset_id', ticket.assetId)
        .maybeSingle();
      const row = data as {
        parse_state: string;
        parse_error: string | null;
        parse: unknown;
      } | null;
      const read = row?.parse_state === 'parsed' ? blendParseSchema.safeParse(row.parse) : null;
      uploaded.set(key, {
        assetId: ticket.assetId,
        state: row?.parse_state ?? null,
        parseError: row?.parse_error ?? null,
        parse: read?.success ? read.data : null,
        schemaError: read && !read.success ? read.error.message.slice(0, 300) : null,
      });
      note(
        `${key}: ${megabytes(bytes.byteLength)} uploaded in ${seconds(registered - started)} · ${row?.parse_state ?? 'no row'} ≈${seconds(parsedAfter)} after register (1 s polls) · asset ${ticket.assetId}`,
      );
    }

    stopApp = await startApp({
      frontendDir: FRONTEND_DIR,
      port: APP_PORT,
      distDir: '.next/forge-scene-real-bench',
      backendUrl: backend.url,
      portEnv: 'FORGE_SCENE_REAL_APP_PORT',
      timeoutMs: PAGE_TIMEOUT_MS,
    });
    note(`bench-owned Backend ${backend.url} (workers off) · app ${APP} · brand ${BRAND_ID}`);
    browser = await chromium.launch({ headless: !argv.includes('--headed') });
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const activePage = await context.newPage();
    page = activePage;
    mkdirSync(SHOTS, { recursive: true });
    activePage.on('pageerror', (error) => note(`page error: ${error.message.slice(0, 200)}`));
    activePage.on('requestfailed', (request) => {
      if (request.url().includes('/api/'))
        note(`request failed ${request.method()} ${request.url().slice(0, 160)} · ${request.failure()?.errorText}`);
    });
    activePage.on('response', async (response) => {
      if (response.status() >= 400 && response.url().includes('/api/'))
        note(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
      const hit = SCENE_POST.exec(new URL(response.url()).pathname);
      if (!hit || response.request().method() !== 'POST') return;
      const at = Date.now();
      const headers = await response.allHeaders().catch(() => ({}) as Record<string, string>);
      const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const exchange: Exchange = {
        assetId: hit[1] ?? '',
        route: hit[2] as Exchange['route'],
        at,
        status: response.status(),
        serverTiming: headers['server-timing'] ?? null,
        sent: sentBody(response.request()),
        answer,
      };
      exchanges.push(exchange);
      if (
        exchange.route === 'renders' &&
        exchange.status === 202 &&
        typeof answer?.jobId === 'string'
      )
        made.jobs.add(answer.jobId);
    });
    const openEditor = async (assetId: string, label: string) => {
      await activePage.goto(`${APP}/forge/scene/${assetId}`, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      const ok = activePage.url().includes('/forge/scene/');
      if (!ok)
        check(
          `${label}: the editor opens`,
          false,
          `landed on ${activePage.url()} — does ${BRAND_ID} have Forge?`,
        );
      return ok;
    };
    const draftImage = activePage.locator('img[alt^="Draft preview of"]');
    const renderAs = activePage.getByRole('radiogroup', { name: 'Render as' });
    const renderFinal = activePage.getByRole('button', { name: 'Render final', exact: true });
    const nextRenderPost = (assetId: string) =>
      activePage
        .waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            SCENE_POST.exec(new URL(response.url()).pathname)?.slice(1).join('/') ===
              `${assetId}/renders`,
          { timeout: 60_000 },
        )
        .catch(() => null);

    // ── 1. ATV: a pre-2.80 file is refused, in words ──────────────────────────────────────────
    const atv = uploaded.get('atv');
    if (atv) {
      check(
        'ATV (2.66): the forge refuses it too_old',
        atv.state === 'failed' && /too_old\s*$/.test(atv.parseError ?? ''),
        `${atv.state ?? 'no row'} · ${atv.parseError ?? 'no parse_error'}`,
      );
      opened.set(atv.assetId, 'atv');
      await activePage.goto(`${APP}/forge?template=${atv.assetId}`, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      const sentence = activePage.getByText(/^Saved in Blender 2\.79 or older/).first();
      const said = await sentence
        .waitFor({ timeout: PAGE_TIMEOUT_MS })
        .then(() => sentence.textContent())
        .catch(() => null);
      const raw = await activePage.evaluate(() => document.body.innerText.includes('too_old'));
      check(
        'ATV: its sheet says why in words, never the raw code',
        Boolean(said) && !raw,
        `${said ?? 'no "Saved in Blender 2.79 or older" sentence'}${raw ? ' · the page also shows too_old' : ''}`,
      );
      await shoot(activePage, 'atv-sheet.png');
    }

    // ── 2. BMW27: a still on a long default range ─────────────────────────────────────────────
    const bmw = uploaded.get('bmw27');
    const bmwParse = bmw?.parse;
    const bmwOutput = bmwParse?.outputs[0];
    if (bmw) {
      check(
        'BMW27: the forge parses it',
        bmw.state === 'parsed' && Boolean(bmwOutput),
        bmwParse
          ? `${bmwParse.parser} · ${bmwParse.fields.length} fields · ${bmwParse.outputs.length} outputs · first ${bmwOutput?.id} ${bmwOutput?.mediaType} ${bmwOutput?.frameStart}–${bmwOutput?.frameEnd}`
          : `${bmw.state ?? 'no row'}${bmw.schemaError ? ` · ${bmw.schemaError}` : ''}`,
      );
    }
    if (bmwParse && bmwOutput) {
      if (parserAtLeast(bmwParse.parser, HINT_PARSER))
        check(
          'BMW27: the parse hints a still',
          bmwOutput.mediaType === 'image',
          `${bmwOutput.id} ${bmwOutput.mediaType} · ${bmwParse.parser}`,
        );
      else
        skip(
          'BMW27: the parse hints a still',
          `deployed forge predates the still/video hint (parser ${bmwParse.parser})`,
        );
    }
    if (bmw && bmwOutput) opened.set(bmw.assetId, 'bmw27');
    if (bmw && bmwParse && bmwOutput && (await openEditor(bmw.assetId, 'BMW27'))) {
      const since = Date.now();
      // A refused draft never draws: stop waiting at the first 422 instead of at the timeout.
      const drew = await Promise.race([
        draftImage
          .waitFor({ timeout: FIRST_DRAFT_MS })
          .then(() => true)
          .catch(() => false),
        until(
          () =>
            postsTo(bmw.assetId, 'previews', since).some((exchange) => exchange.status === 422) ||
            undefined,
          FIRST_DRAFT_MS,
        ).then(() => false),
      ]);
      check(
        'BMW27: the editor draws a first draft',
        drew,
        `${Date.now() - since} ms after the page loaded`,
      );
      const drafts = postsTo(bmw.assetId, 'previews', since);
      const refused = drafts.filter((exchange) => exchange.status === 422);
      check(
        'BMW27: no draft is refused 422 (was "frame range must be 1..600 frames")',
        refused.length === 0,
        refused.length
          ? refused
              .map((exchange) => JSON.stringify(exchange.answer))
              .join('; ')
              .slice(0, 300)
          : `${drafts.length} draft answer(s)`,
      );
      for (const exchange of drafts) note(`BMW27 draft: ${describe(exchange)}`);
      await shoot(activePage, 'bmw27-draft.png');

      const frames = bmwOutput.frameEnd - bmwOutput.frameStart + 1;
      const pickerShown = await renderAs.isVisible();
      check('BMW27: the editor offers Render as', pickerShown);
      const still = renderAs.getByRole('radio', {
        name: `Still · frame ${bmwOutput.frameStart}`,
        exact: true,
      });
      const animation = renderAs.getByRole('radio', {
        name: `Animation · ${frames} frames`,
        exact: true,
      });
      const stillChecked = pickerShown
        ? (await still.getAttribute('aria-checked', { timeout: 5_000 }).catch(() => null)) ===
          'true'
        : false;
      check(
        `BMW27: a ${frames}-frame range defaults to Still · frame ${bmwOutput.frameStart}`,
        stillChecked,
      );
      const animationDisabled = pickerShown
        ? (await animation.getAttribute('data-disabled', { timeout: 5_000 }).catch(() => null)) !==
            null || (await animation.isDisabled({ timeout: 5_000 }).catch(() => false))
        : false;
      const reason = `Blender's range is ${frames} frames; renders take at most ${MAX_FRAMES}`;
      const explained = await activePage.getByText(reason, { exact: true }).isVisible();
      check(
        `BMW27: Animation · ${frames} frames is disabled and says why`,
        animationDisabled && explained,
        `disabled ${animationDisabled} · "${reason}" ${explained ? 'shown' : 'missing'}`,
      );

      const posted = nextRenderPost(bmw.assetId);
      const started = Date.now();
      await renderFinal.click();
      const response = await posted;
      const sent = response ? sentBody(response.request()) : null;
      check(
        'BMW27: Render final asks for a still and is accepted',
        response?.status() === 202 &&
          JSON.stringify(sent?.overrides) === JSON.stringify({ mediaType: 'image' }),
        `${response ? `HTTP ${response.status()}` : 'no answer'} · overrides ${JSON.stringify(sent?.overrides ?? null)}`,
      );
      if (response?.status() === 202) {
        const thisRender = activePage.getByRole('region', { name: 'This render' });
        const terminal = thisRender.getByText(/^(Completed|Failed|Cancelled|Superseded)$/);
        const state = await terminal
          .waitFor({ timeout: FINAL_RENDER_MS })
          .then(() => terminal.textContent())
          .catch(() => null);
        const took = Date.now() - started;
        check(
          'BMW27: the still renders to Completed within 5 min',
          state?.trim() === 'Completed',
          `${state?.trim() ?? 'not finished'} after ${seconds(took)}`,
        );
        note(`BMW27 final render: ${seconds(took)} from Render final`);
        const finalImage = thisRender.locator('img[alt^="Render of"]');
        const width = await finalImage
          .waitFor({ timeout: 60_000 })
          .then(() =>
            finalImage.evaluate((node) =>
              (node as HTMLImageElement)
                .decode()
                .then(() => (node as HTMLImageElement).naturalWidth),
            ),
          )
          .catch(() => 0);
        check('BMW27: the finished still shows', width > 0, `${width} px wide`);
      }
      await shoot(activePage, 'bmw27-final.png');
    }

    // ── 3. Lone Monk: the editor at scale ─────────────────────────────────────────────────────
    const monk = uploaded.get('lone-monk');
    const monkParse = monk?.parse;
    const monkOutput = monkParse?.outputs[0];
    if (monk) {
      check(
        `Lone Monk: the forge parses it, with at least ${MIN_FIELDS.toLocaleString('en')} fields`,
        monk.state === 'parsed' &&
          Boolean(monkOutput) &&
          (monkParse?.fields.length ?? 0) >= MIN_FIELDS,
        monkParse
          ? `${monkParse.parser} · ${monkParse.fields.length} fields · ${monkParse.outputs.length} output(s) · first ${monkOutput?.id} ${monkOutput?.width}×${monkOutput?.height} ${monkOutput?.frameStart}–${monkOutput?.frameEnd} s${monkOutput?.samples}`
          : `${monk.state ?? 'no row'}${monk.schemaError ? ` · ${monk.schemaError}` : ''}`,
      );
    }
    if (monk && monkParse && monkOutput) {
      const opening = Date.now();
      opened.set(monk.assetId, 'lone-monk');
      const editorOpen = await openEditor(monk.assetId, 'Lone Monk');
      const heading = activePage
        .locator('header', { has: activePage.getByRole('link', { name: 'Template', exact: true }) })
        .getByRole('heading', { level: 1 });
      const headingMs = editorOpen
        ? await heading
            .waitFor({ timeout: PAGE_TIMEOUT_MS })
            .then(() => Date.now() - opening)
            .catch(() => null)
        : null;
      const search = activePage.getByRole('textbox', { name: 'Search fields' });
      let interactiveMs: number | null = null;
      for (
        const deadline = Date.now() + PAGE_TIMEOUT_MS;
        headingMs !== null && Date.now() < deadline;
      ) {
        if (
          (await search.isVisible()) &&
          (await search.isEnabled({ timeout: 1_000 }).catch(() => false))
        ) {
          interactiveMs = Date.now() - opening;
          break;
        }
        await activePage.waitForTimeout(50);
      }
      const afterHeading =
        headingMs !== null && interactiveMs !== null ? interactiveMs - headingMs : null;
      check(
        'Lone Monk: the inspector is interactive within 10 s of the heading',
        afterHeading !== null && afterHeading <= INTERACTIVE_AFTER_H1_MS,
        `h1 ${headingMs ?? 'never'} ms · Search fields visible and enabled ${interactiveMs ?? 'never'} ms after goto (+${afterHeading ?? '?'} ms; a cold dev route compiles inside the h1 time)`,
      );
      if (interactiveMs !== null) {
        const nodes = await activePage.evaluate(() => document.querySelectorAll('*').length);
        check(
          `Lone Monk: the page holds under ${MAX_DOM_NODES.toLocaleString('en')} DOM nodes`,
          nodes < MAX_DOM_NODES,
          `${nodes} nodes`,
        );

        const drew = await draftImage
          .waitFor({ timeout: FIRST_DRAFT_MS })
          .then(() => true)
          .catch(() => false);
        const firstDraft = postsTo(monk.assetId, 'previews', opening).find(
          (exchange) => exchange.status === 200,
        );
        sample(
          'Lone Monk: the first draft draws',
          drew && Boolean(firstDraft),
          `${seconds(Date.now() - opening)} after goto · ${firstDraft ? describe(firstDraft) : 'no 200 from /scene/previews'}`,
        );
        await shoot(activePage, 'lone-monk-editor.png');

        const hideField = monkParse.fields.find(
          (field) => field.target.idName === HIDE_OBJECT && field.target.path === 'hide_render',
        );
        // As `sceneFieldLabel` speaks it ("arch.001 · hide in render" → "arch.001 hide in render"),
        // and the boolean control adds " default".
        const switchName = hideField ? `${hideField.name.replaceAll(' · ', ' ')} default` : '';
        const matches = activePage.getByRole('region', { name: 'Matching fields' });
        const hide = matches.getByRole('switch', { name: switchName, exact: true });
        if (hideField) await search.fill(HIDE_OBJECT);
        const found =
          Boolean(hideField) &&
          (await hide
            .waitFor({ timeout: 30_000 })
            .then(() => true)
            .catch(() => false));
        if (!hideField || !found) {
          const offered = await matches
            .getByRole('switch')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
            .catch(() => []);
          check(
            `Lone Monk: Space on ${HIDE_OBJECT}'s hide switch flips it within 1 s`,
            false,
            hideField
              ? `no switch "${switchName}" in Matching fields; switches: ${offered.join(', ') || 'none'}`
              : `the parse has no ${HIDE_OBJECT} hide_render field`,
          );
        } else {
          const was = await hide.getAttribute('aria-checked');
          const want = was !== 'true';
          await hide.focus();
          const pressed = Date.now();
          await activePage.keyboard.press('Space');
          const flippedMs = await matches
            .getByRole('switch', { name: switchName, exact: true, checked: want })
            .waitFor({ timeout: 10_000 })
            .then(() => Date.now() - pressed)
            .catch(() => null);
          check(
            `Lone Monk: Space on ${HIDE_OBJECT}'s hide switch flips it within 1 s`,
            flippedMs !== null && flippedMs <= TOGGLE_MS,
            `${flippedMs ?? '> 10000'} ms · aria-checked ${was} → ${want} · switch "${switchName}"`,
          );

          const edited = await until(
            () =>
              postsTo(monk.assetId, 'previews', pressed).find(
                (exchange) =>
                  exchange.status === 200 && exchange.sent?.values?.[hideField.key] === want,
              ),
            FIRST_DRAFT_MS,
          );
          sample(
            'Lone Monk: the edited draft draws',
            Boolean(edited),
            edited
              ? `${seconds(edited.at - pressed)} after Space · ${describe(edited)}`
              : `no 200 carrying ${hideField.key} = ${want}`,
          );

          // Back to the file's value: the editor still holds that draft, so it may ask nothing.
          const toggledBack = Date.now();
          await hide.press('Space');
          await activePage.waitForTimeout(DRAFT_SETTLE_MS);
          const back = postsTo(monk.assetId, 'previews', toggledBack);
          note(
            `Lone Monk toggle back: ${back.length ? back.map(describe).join('; ') : "no request — the editor's own cache holds the file's draft"}`,
          );
        }

        // The same draft asked again by a fresh page: the Backend's cache answers it.
        const reloaded = Date.now();
        await activePage.reload({ waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
        const repeat = await until(
          () =>
            postsTo(monk.assetId, 'previews', reloaded).find((exchange) => exchange.status === 200),
          FIRST_DRAFT_MS,
        );
        sample(
          'Lone Monk: a repeated draft is served from the Backend cache',
          repeat?.answer?.cached === true,
          repeat ? `after a reload · ${describe(repeat)}` : 'no 200 after a reload',
        );

        // A heavy animation is refused before anything is queued.
        const frames = monkOutput.frameEnd - monkOutput.frameStart + 1;
        const animation = renderAs.getByRole('radio', {
          name: `Animation · ${frames} frames`,
          exact: true,
        });
        const offered = await animation
          .waitFor({ timeout: PAGE_TIMEOUT_MS })
          .then(() => true)
          .catch(() => false);
        const refusal = `Lone Monk: Render final as a ${frames}-frame animation is refused scene_render_too_heavy`;
        if (!offered) {
          check(refusal, false, `no "Animation · ${frames} frames" radio under Render as`);
        } else {
          await animation.click();
          const posted = nextRenderPost(monk.assetId);
          await renderFinal.click();
          const response = await posted;
          const answer = response
            ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
            : null;
          const sent = response ? sentBody(response.request()) : null;
          check(
            refusal,
            response?.status() === 422 && answer?.error === 'scene_render_too_heavy',
            `${response ? `HTTP ${response.status()}` : 'no answer'} · ${JSON.stringify(answer).slice(0, 240)} · asked ${JSON.stringify(sent?.overrides ?? null)}`,
          );
          const lead = `${frames} frames at ${monkOutput.width}×${monkOutput.height}`;
          const shown = activePage.getByRole('alert').filter({ hasText: lead }).first();
          const said = await shown
            .waitFor({ timeout: 30_000 })
            .then(() => shown.textContent())
            .catch(() => null);
          check(
            "Lone Monk: the editor shows the Backend's sentence",
            Boolean(said?.trim().startsWith(lead)),
            said?.trim() ?? `no alert beginning "${lead}"`,
          );
          const { count, error } = await media()
            .from('client_render_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('kind', 'scene_render')
            .eq('brand_id', BRAND_ID)
            .eq('source_id', `blend:${monk.assetId}`);
          const accepted = postsTo(monk.assetId, 'renders', 0).filter(
            (exchange) => exchange.status === 202,
          ).length;
          check(
            'Lone Monk: no render job was enqueued',
            !error && count === 0 && accepted === 0,
            `${error ? error.message : `${count} scene_render row(s)`} · ${accepted} accepted answer(s)`,
          );
          await shoot(activePage, 'lone-monk-too-heavy.png');
        }
      }
    }
    note(`screenshots: ${SHOTS}`);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed && page) await shoot(page, 'failure.png');

    // ── 4. Cleanup: through the sheet for what was opened, then tracked ids only ───────────────
    for (const [assetId, key] of opened) {
      const removal = page
        ? await removeThroughSheet(page, assetId).catch(
            (error: unknown) =>
              `not removed: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
          )
        : 'no page to remove it from';
      check(
        `${key}: Remove on its sheet takes the template out of the brand`,
        removal === 'soft-deleted' || removal === 'row deleted',
        removal,
      );
    }
    await browser?.close().catch(() => undefined);
    stopApp?.();
    await backend?.stop().catch(() => undefined);
    const cleanup = await cleanupMade({
      admin,
      brandId: BRAND_ID,
      renderBucket: RENDER_BUCKET,
      made,
    });
    check('cleanup leaves nothing behind', cleanup.left === 0, cleanup.detail);
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

const files = await loadFiles();
if (failed) {
  // A wrong or missing file: nothing is uploaded.
} else if (DRY_RUN) {
  for (const key of SELECTED) note(`plan: ${key} — ${FILES[key].plan}`);
  note(
    `plan: ${SELECTED.length} file(s) from ${FILES_DIR ? SOURCE_DIR : `gs://${GCS_BUCKET}/${GCS_PREFIX} via ${CACHE_DIR}`} · brand ${BRAND_ID} as ${OWNER_EMAIL} · app :${APP_PORT} backend :${BACKEND_PORT}`,
  );
  rec.record(
    'the live chain',
    'SKIP',
    '--dry-run: nothing was downloaded, uploaded, drawn, rendered or cleaned up',
  );
} else {
  await live(files).catch((error: unknown) => {
    failed = true;
    console.error(error);
    rec.record(
      'the bench ran to its end',
      'FAIL',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
  });
}
rec.print();
process.exit(failed ? 1 : 0);
