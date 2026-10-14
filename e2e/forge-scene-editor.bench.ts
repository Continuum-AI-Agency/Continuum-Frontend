/**
 * forge:scene:ui:bench — the Blender scene editor, in a REAL Chrome, on the committed .blend
 * fixture, against a bench-owned Backend (hosted Supabase, every background worker off) and its own
 * Next app, signed in as the bench brand's owner for THIS session only.
 *
 *   1. FIXTURE  the pinned `forge-template.blend` and its sheet (the parse the forge returns for it)
 *               — the run plan is checked against the sheet before anything is written;
 *   2. UPLOAD   library-upload sign → PUT → register as the bench user, exactly a browser drop;
 *               the forge parses it into a `blender` template source;
 *   3. EDITOR   `/forge/scene/<assetId>` draws a first draft; typing the headline key by key is ONE
 *               more draft (the debounce), then a brand colour and Swatch location X = 0;
 *   4. DRAFT    the request carries exactly those three changes and `scope: 'all'`; the picture
 *               changes, and its pixels show the swatch moved and recoloured (red where it moved
 *               to, the world colour where it was);
 *   5. FINAL    Render final runs to `completed`, the file shows with its Library link, and after a
 *               reload the history lists it as completed.
 *
 * Cleanup deletes exactly what this run made — the uploaded template, its render jobs and their
 * Library outputs, every storage object behind them and the drafts cached under the template —
 * by id, never by diff: other sessions write into the bench brand concurrently.
 *
 * Run: `bun run forge:scene:ui:bench` (Frontend). `--dry-run` checks the fixture and the plan with
 * no network and no env; `--headed` to watch.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type BlendParse, blendParseSchema } from '@continuum/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from 'playwright';
import { z } from 'zod';
import { createBenchRecorder } from './support/benchRecorder';

const BENCH = 'forge:scene:ui:bench';
const USAGE = `${BENCH} — the Blender scene editor end to end on the committed .blend.

  bun run forge:scene:ui:bench [-- flags]

  --dry-run   fixture sha256, sheet and run plan; no network, no env, nothing written
  --headed    show the browser
  --scene-url=<url>  the continuum-scene the bench Backend renders on, when
                     CONTINUUM_SCENE_SERVICE_URL is not in the Backend env files
  --help      this text

  FORGE_SCENE_BRAND_ID / FORGE_SCENE_OWNER_EMAIL   another brand (it must have Forge)
  FORGE_SCENE_APP_PORT / FORGE_SCENE_BACKEND_PORT  ports (default 3146 / 4446)

Writes only to the bench brand and deletes what it wrote.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const DRY_RUN = argv.includes('--dry-run');
const SCENE_URL_FLAG = argv
  .find((arg) => arg.startsWith('--scene-url='))
  ?.slice('--scene-url='.length);

/** The bench brand and its owner (Backend `_bench/fixtures.ts`); identities stay overridable. */
const BRAND_ID = process.env.FORGE_SCENE_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = process.env.FORGE_SCENE_OWNER_EMAIL ?? 'bench@trycontinuum.ai';
const APP_PORT = Number(process.env.FORGE_SCENE_APP_PORT ?? 3146);
const BACKEND_PORT = Number(process.env.FORGE_SCENE_BACKEND_PORT ?? 4446);
const APP = `http://127.0.0.1:${APP_PORT}`;
const FRONTEND_DIR = process.cwd();
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '../Continuum-Backend');
const FIXTURE_DIR = path.join(BACKEND_DIR, 'scripts/fixtures/blend');
/** The bytes the sheet describes (pinned beside the Backend's forge:blend:e2e:bench). */
const FIXTURE_SHA256 = '66ec4acc49f5c7ffca6e8ea36690fd705d9640d8c67dd71b02d8427fe5439333';
const SHOTS = path.resolve(FRONTEND_DIR, 'e2e/__screenshots__/forge-scene-editor');
const OUTPUT = 'Main/CamWide';
const SWATCH_X = 0;
const RED = '#FF0000';
const WORLD = '#202020';
/** Per channel, over a 7×7 window: a draft is 8 samples, noisier than a final render. */
const CHANNEL_TOLERANCE = 28;
const PAGE_TIMEOUT_MS = 240_000;
const FIRST_DRAFT_MS = 180_000;
const FINAL_RENDER_MS = 10 * 60_000;
const RENDER_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';

const notes: string[] = [];
const rec = createBenchRecorder(BENCH, notes);
let failed = false;
const check = (step: string, ok: boolean, detail?: string) => {
  if (!ok) failed = true;
  rec.record(step, ok ? 'PASS' : 'FAIL', detail);
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

// ── Fixture and plan ─────────────────────────────────────────────────────────────────────────

type Plan = {
  bytes: Buffer;
  sheet: BlendParse;
  output: BlendParse['outputs'][number];
  /** Where the swatch's centre is drawn now, and where X = 0 moves it, in output pixels. */
  swatchFrom: [number, number];
  swatchTo: [number, number];
};

function loadPlan(): Plan | null {
  const bytes = readFileSync(path.join(FIXTURE_DIR, 'forge-template.blend'));
  const digest = createHash('sha256').update(bytes).digest('hex');
  check(
    'the fixture is the pinned .blend',
    digest === FIXTURE_SHA256,
    `sha256 ${digest.slice(0, 16)}… · ${bytes.byteLength} B`,
  );
  if (digest !== FIXTURE_SHA256) return null;
  const sheet = blendParseSchema.safeParse(
    JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'forge-template.sheet.json'), 'utf8')),
  );
  check(
    'the sheet reads through blendParseSchema',
    sheet.success,
    sheet.success
      ? `${sheet.data.fields.length} fields · ${sheet.data.outputs.length} outputs`
      : sheet.error.message.slice(0, 300),
  );
  if (!sheet.success) return null;
  const field = (key: string) => sheet.data.fields.find((candidate) => candidate.key === key);
  const output = sheet.data.outputs.find((candidate) => candidate.id === OUTPUT);
  const location = field('swatch.location')?.default;
  const ortho = field('camwide.ortho_scale')?.default;
  const preconditions: Array<[string, boolean]> = [
    ['headline is a text field on Title', field('headline')?.kind === 'text'],
    ['brand_colour is the Swatch emission colour', field('brand_colour')?.kind === 'color'],
    ['swatch.location is a vector', field('swatch.location')?.kind === 'vector3'],
    ['camwide.ortho_scale is a number', typeof ortho === 'number' && ortho > 0],
    [
      `${OUTPUT} is the first output and a still`,
      sheet.data.outputs[0]?.id === OUTPUT && output?.mediaType === 'image',
    ],
    ['the file stores render samples', typeof output?.samples === 'number'],
  ];
  const broken = preconditions.filter(([, ok]) => !ok).map(([label]) => label);
  check(
    'the run plan matches the sheet',
    broken.length === 0,
    broken.length ? `not true: ${broken.join('; ')}` : `${preconditions.length} preconditions`,
  );
  if (broken.length || !output || !Array.isArray(location) || typeof ortho !== 'number')
    return null;
  // An orthographic camera looking down +Y: world X runs right, Z up, `ortho_scale` units across
  // the wider side. The manifest boxes where Blender actually drew the swatch, so the projection
  // is checked against it before any pixel is judged by it.
  const perUnit = Math.max(output.width, output.height) / ortho;
  const project = (x: number, z: number): [number, number] => [
    Math.round(output.width / 2 + x * perUnit),
    Math.round(output.height / 2 - z * perUnit),
  ];
  const swatchFrom = project(location[0], location[2]);
  const manifest = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'forge-template.manifest.json'), 'utf8'),
  ) as {
    views?: Array<{ output: string; boxes: Record<string, [number, number, number, number]> }>;
  };
  const box = manifest.views?.find((view) => view.output === OUTPUT)?.boxes.Swatch;
  const boxCentre = box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null;
  check(
    'the swatch projection lands on the manifest box',
    boxCentre?.[0] === swatchFrom[0] && boxCentre?.[1] === swatchFrom[1],
    `projected ${swatchFrom.join(',')} · manifest ${boxCentre?.join(',') ?? 'no Swatch box'}`,
  );
  if (!boxCentre || boxCentre[0] !== swatchFrom[0] || boxCentre[1] !== swatchFrom[1]) return null;
  return {
    bytes,
    sheet: sheet.data,
    output,
    swatchFrom,
    swatchTo: project(SWATCH_X, location[2]),
  };
}

// ── Live helpers ─────────────────────────────────────────────────────────────────────────────

/** Values only production's env carries; nothing else of it reaches the bench processes. */
function forwardProductionEnv(keys: string[]) {
  const file = path.join(BACKEND_DIR, '.env.production');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const found = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (found && keys.includes(found[1]!) && !process.env[found[1]!])
      process.env[found[1]!] = found[2]!.trim().replace(/^["']|["']$/g, '');
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

function killGroup(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

async function startApp(backendUrl: string): Promise<() => void> {
  if (await answers(APP)) throw new Error(`${APP} already answers; set FORGE_SCENE_APP_PORT`);
  const child = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/forge-scene-bench',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  for (const deadline = Date.now() + PAGE_TIMEOUT_MS; Date.now() < deadline; ) {
    if (await answers(`${APP}/login`)) return () => killGroup(child);
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  killGroup(child);
  throw new Error(`the Next app never came up on ${APP}\n${tail.slice(-20).join('')}`);
}

const ticketSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  token: z.string().min(1),
  assetId: z.string().uuid(),
});
const draftSchema = z.object({ url: z.string().url(), width: z.number(), height: z.number() });
const previewBodySchema = z.object({
  outputId: z.string(),
  scope: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
});

const rgbOf = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const hexOf = (rgb: number[]) =>
  `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * Mean RGB over a 7×7 window at each point, read in the page from the PNG's bytes. The bytes come
 * in as a data URL, so the canvas is same-origin whatever CORS the storage bucket sends.
 */
async function probeInPage(page: Page, png: Buffer, points: Array<[number, number]>) {
  return page.evaluate(
    async ({ dataUrl, points }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0);
      return points.map(([cx, cy]) => {
        const x = Math.max(0, cx - 3);
        const y = Math.max(0, cy - 3);
        const { data } = context.getImageData(x, y, 7, 7);
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4)
          for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
        return sum.map((value) => Math.round(value / (data.length / 4)));
      });
    },
    { dataUrl: `data:image/png;base64,${png.toString('base64')}`, points },
  );
}

async function removeFlatPrefix(admin: SupabaseClient, bucket: string, prefix: string) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${prefix}/${entry.name}`);
  if (paths.length) await admin.storage.from(bucket).remove(paths);
  return paths.length;
}

// ── Live run ─────────────────────────────────────────────────────────────────────────────────

async function live(plan: Plan) {
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
  forwardProductionEnv([
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
  /** Everything this run created, by id. Cleanup touches nothing else. */
  const made = { assets: new Set<string>(), jobs: new Set<string>(), objects: new Set<string>() };
  let templateAssetId: string | null = null;

  let backend: Awaited<ReturnType<typeof localBackend.startLocalBackend>> | null = null;
  let stopApp: (() => void) | null = null;
  let browser: import('playwright').Browser | null = null;
  const session = await mintSessionBundleForEmail(OWNER_EMAIL);
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

    // ── 2. Upload, as a browser drop does ─────────────────────────────────────────────────────
    const libraryUpload = async (body: Record<string, unknown>) => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/library-upload`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          apikey: publishableKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      if (!response.ok)
        throw new Error(
          `library-upload ${String(body.action)} ${response.status}: ${text.slice(0, 300)}`,
        );
      return JSON.parse(text) as unknown;
    };
    const fileName = `bench-forge-scene-${runId}.blend`;
    const ticket = ticketSchema.parse(
      await libraryUpload({
        action: 'sign_upload',
        brandId: BRAND_ID,
        fileName,
        mimeType: 'application/octet-stream',
        sizeBytes: plan.bytes.byteLength,
      }),
    );
    made.assets.add(ticket.assetId);
    made.objects.add(`${ticket.bucket}::${ticket.path}`);
    templateAssetId = ticket.assetId;
    const put = await admin.storage
      .from(ticket.bucket)
      .uploadToSignedUrl(ticket.path, ticket.token, plan.bytes, {
        contentType: 'application/octet-stream',
      });
    if (put.error) throw new Error(`storage PUT: ${put.error.message}`);
    await libraryUpload({
      action: 'register',
      brandId: BRAND_ID,
      assetId: ticket.assetId,
      bucket: ticket.bucket,
      storagePath: ticket.path,
      fileName,
      mimeType: 'application/octet-stream',
      sizeBytes: plan.bytes.byteLength,
      checksum: FIXTURE_SHA256,
    });
    // Register asks the deployed Backend to parse; if that has not landed in 45 s, the bench's own
    // Backend parses it through the same internal route.
    const parseState = async () =>
      ((
        await media()
          .from('template_sources')
          .select('family,parse_state')
          .eq('asset_id', ticket.assetId)
          .maybeSingle()
      ).data as { family: string; parse_state: string } | null) ?? null;
    let row = await parseState();
    for (let tries = 0; tries < 45 && row?.parse_state !== 'parsed'; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      row = await parseState();
    }
    if (row?.parse_state !== 'parsed') {
      const secret =
        readBackendEnv('INTERNAL_TEMPLATE_PARSE_SECRET') ??
        process.env.INTERNAL_TEMPLATE_PARSE_SECRET;
      note(
        `deployed parse did not land (state ${row?.parse_state ?? 'no row'}); parsing on the bench Backend`,
      );
      const response = await fetch(`${backend.url}/api/ai-studio/templates/parse`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret ?? ''}`, 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: BRAND_ID, assetId: ticket.assetId }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok)
        note(`bench parse answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
      row = await parseState();
    }
    check(
      'the uploaded .blend is a parsed blender template',
      row?.family === 'blender' && row.parse_state === 'parsed',
      `asset ${ticket.assetId} · ${row ? `${row.family} ${row.parse_state}` : 'no template_sources row'}`,
    );
    if (row?.parse_state !== 'parsed') return;

    // ── 3. The editor ─────────────────────────────────────────────────────────────────────────
    stopApp = await startApp(backend.url);
    note(`bench-owned Backend ${backend.url} (workers off) · app ${APP} · brand ${BRAND_ID}`);
    browser = await chromium.launch({ headless: !argv.includes('--headed') });
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    mkdirSync(SHOTS, { recursive: true });
    page.on('pageerror', (error) => note(`page error: ${error.message.slice(0, 200)}`));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/api/'))
        note(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    });
    const drafts: Array<z.infer<typeof previewBodySchema>> = [];
    let lastDraft: z.infer<typeof draftSchema> | null = null;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/scene/previews')) {
        const body = previewBodySchema.safeParse(request.postDataJSON());
        if (body.success) drafts.push(body.data);
      }
      if (request.method() === 'POST' && request.url().endsWith('/scene/renders'))
        note('Render final posted');
    });
    page.on('response', async (response) => {
      if (!response.url().endsWith('/scene/previews') || !response.ok()) return;
      const draft = draftSchema.safeParse(await response.json().catch(() => null));
      if (draft.success) lastDraft = draft.data;
    });
    page.on('response', async (response) => {
      if (!response.url().endsWith('/scene/renders') || response.status() !== 202) return;
      const body = (await response.json().catch(() => null)) as { jobId?: string } | null;
      if (body?.jobId) made.jobs.add(body.jobId);
    });

    await page.goto(`${APP}/forge/scene/${ticket.assetId}`, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!page.url().includes('/forge/scene/')) {
      check('the editor opens', false, `landed on ${page.url()} — does ${BRAND_ID} have Forge?`);
      return;
    }
    const draftImage = page.locator('img[alt^="Draft preview of"]');
    const opened = Date.now();
    await draftImage.waitFor({ timeout: FIRST_DRAFT_MS });
    const firstSrc = await draftImage.getAttribute('src');
    check(
      'the editor draws a first draft',
      Boolean(firstSrc),
      `${Date.now() - opened} ms to the first draft`,
    );
    await page.screenshot({ path: path.join(SHOTS, 'first-draft.png'), fullPage: true });

    // The headline key by key: the debounce must turn it into ONE draft, not one per key.
    const before = drafts.length;
    const headline = `Bench ${runId}`;
    const headlineBox = page.getByRole('textbox', { name: 'Title text default', exact: true });
    await headlineBox.fill('');
    await headlineBox.pressSequentially(headline, { delay: 60 });
    await page.waitForTimeout(1_500);
    check(
      'typing the headline key by key asks for at most two drafts',
      drafts.length - before <= 2,
      `${headline.length} keys → ${drafts.length - before} draft request(s)`,
    );

    await page
      .getByRole('button', { name: 'Swatch Emission Color default colour', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Hex colour' }).fill(RED);
    await page.keyboard.press('Escape');
    const swatchX = page.getByLabel('Swatch location X', { exact: true });
    await swatchX.fill(String(SWATCH_X));
    await swatchX.press('Tab');

    // ── 4. The draft that carries all three ───────────────────────────────────────────────────
    const wanted = (body: z.infer<typeof previewBodySchema>) =>
      body.values.headline === headline &&
      String(body.values.brand_colour).toUpperCase() === RED &&
      JSON.stringify(body.values['swatch.location']) ===
        JSON.stringify([
          SWATCH_X,
          ...(
            plan.sheet.fields.find((f) => f.key === 'swatch.location')?.default as number[]
          ).slice(1),
        ]);
    for (const deadline = Date.now() + FIRST_DRAFT_MS; Date.now() < deadline; ) {
      const shown = await draftImage.getAttribute('src');
      const badge = await page.locator('[data-slot="format-preview-badge"]').textContent();
      if (drafts.some(wanted) && shown !== firstSrc && !badge?.includes('updating')) break;
      await page.waitForTimeout(500);
    }
    const sent = drafts.findLast(wanted);
    check(
      'the draft request carries exactly the three changes and scope all',
      Boolean(sent) &&
        sent?.scope === 'all' &&
        Object.keys(sent?.values ?? {})
          .sort()
          .join(',') === 'brand_colour,headline,swatch.location',
      sent ? JSON.stringify(sent) : `no matching request among ${drafts.length}`,
    );
    const shownSrc = await draftImage.getAttribute('src');
    check('the draft picture changes', Boolean(shownSrc) && shownSrc !== firstSrc);
    await page.screenshot({ path: path.join(SHOTS, 'edited-draft.png'), fullPage: true });

    const draft = lastDraft as z.infer<typeof draftSchema> | null;
    if (draft) {
      const png = Buffer.from(await (await fetch(draft.url)).arrayBuffer());
      const sx = draft.width / plan.output.width;
      const sy = draft.height / plan.output.height;
      const at = ([x, y]: [number, number]): [number, number] => [
        Math.round(x * sx),
        Math.round(y * sy),
      ];
      const [moved, vacated] = await probeInPage(page, png, [
        at(plan.swatchTo),
        at(plan.swatchFrom),
      ]);
      const near = (got: number[] | undefined, hex: string) =>
        Boolean(got) &&
        rgbOf(hex).every((want, c) => Math.abs((got?.[c] ?? 0) - want) <= CHANNEL_TOLERANCE);
      check(
        'pixels: the swatch is red where X = 0 put it',
        near(moved, RED),
        `${at(plan.swatchTo).join(',')} ${moved ? hexOf(moved) : '?'} vs ${RED} ±${CHANNEL_TOLERANCE} · draft ${draft.width}×${draft.height}`,
      );
      check(
        'pixels: where the swatch was is the world colour',
        near(vacated, WORLD),
        `${at(plan.swatchFrom).join(',')} ${vacated ? hexOf(vacated) : '?'} vs ${WORLD} ±${CHANNEL_TOLERANCE}`,
      );
    } else {
      check('pixels: a draft answer was read', false, 'no 200 from /scene/previews was captured');
    }

    // ── 5. Render final ───────────────────────────────────────────────────────────────────────
    const started = Date.now();
    await page.getByRole('button', { name: 'Render final', exact: true }).click();
    const thisRender = page.getByRole('region', { name: 'This render' });
    await thisRender.waitFor({ timeout: 60_000 });
    const terminal = thisRender.getByText(/^(Completed|Failed|Cancelled|Superseded)$/);
    await terminal.waitFor({ timeout: FINAL_RENDER_MS });
    const state = (await terminal.textContent())?.trim();
    check(
      'Render final runs to completed',
      state === 'Completed',
      `${state} after ${Math.round((Date.now() - started) / 1000)} s`,
    );
    const finalImage = thisRender.locator('img[alt^="Render of"]');
    const loaded = await finalImage
      .waitFor({ timeout: 60_000 })
      .then(() =>
        finalImage.evaluate((node) =>
          (node as HTMLImageElement).decode().then(() => (node as HTMLImageElement).naturalWidth),
        ),
      )
      .catch(() => 0);
    check(
      'the finished file shows, with its Library link',
      loaded > 0 && (await thisRender.getByRole('link', { name: /Open in Library/ }).count()) > 0,
      `${loaded} px wide`,
    );
    await page.screenshot({ path: path.join(SHOTS, 'final-render.png'), fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const history = page.getByRole('list', { name: 'Render history' });
    await history.waitFor({ timeout: 60_000 });
    const top = (await history.getByRole('listitem').first().textContent()) ?? '';
    check(
      'after a reload the history lists the render as completed',
      top.includes('Completed'),
      top.slice(0, 120),
    );
    note(`screenshots: ${SHOTS}`);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed)
      await browser
        ?.contexts()[0]
        ?.pages()[0]
        ?.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true })
        .catch(() => undefined);
    await browser?.close().catch(() => undefined);
    stopApp?.();
    await backend?.stop().catch(() => undefined);

    // ── Cleanup: tracked ids only ─────────────────────────────────────────────────────────────
    if (templateAssetId) {
      // Every scene job names its template, and this template is this run's own upload — so this
      // also finds a job the API saved but answered without an id, and every output it wrote.
      const { data: jobs } = await media()
        .from('client_render_jobs')
        .select('id, result_asset_refs')
        .eq('kind', 'scene_render')
        .eq('brand_id', BRAND_ID)
        .eq('source_id', `blend:${templateAssetId}`);
      for (const job of (jobs ?? []) as Array<{
        id: string;
        result_asset_refs: Array<{ assetId: string }> | null;
      }>) {
        made.jobs.add(job.id);
        for (const ref of job.result_asset_refs ?? []) made.assets.add(ref.assetId);
      }
    }
    const ids = [...made.assets];
    // Only this brand's rows: an id is never deleted on the strength of where it was read.
    const { data: owned } = ids.length
      ? await media().from('assets').select('id').in('id', ids).eq('brand_id', BRAND_ID)
      : { data: [] };
    const assets = ((owned ?? []) as Array<{ id: string }>).map((asset) => asset.id);
    if (assets.length) {
      const { data: versions } = await media()
        .from('asset_versions')
        .select('bucket, storage_path')
        .in('asset_id', assets);
      for (const v of (versions ?? []) as Array<{ bucket: string; storage_path: string }>)
        made.objects.add(`${v.bucket}::${v.storage_path}`);
    }
    if (made.jobs.size)
      await media()
        .from('client_render_jobs')
        .delete()
        .in('id', [...made.jobs]);
    if (assets.length) await media().from('template_source_events').delete().in('asset_id', assets);
    for (const id of assets) {
      // One row at a time: a multi-row delete deadlocks (40P01) against fresh-asset writers.
      for (let attempt = 1; attempt <= 5; attempt++) {
        const del = await media().from('assets').delete().eq('id', id).eq('brand_id', BRAND_ID);
        if (!del.error || del.error.code !== '40P01') break;
        await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
      }
    }
    for (const entry of made.objects) {
      const [bucket, objectPath] = entry.split('::') as [string, string];
      await admin.storage.from(bucket).remove([objectPath]);
    }
    let previews = 0;
    if (templateAssetId)
      previews = await removeFlatPrefix(
        admin,
        RENDER_BUCKET,
        `${BRAND_ID}/scene-previews/${templateAssetId}`,
      );
    for (const jobId of made.jobs)
      await removeFlatPrefix(admin, RENDER_BUCKET, `${BRAND_ID}/scene-renders/${jobId}`);
    const left = assets.length
      ? ((await media().from('assets').select('id').in('id', assets)).data?.length ?? 0)
      : 0;
    check(
      'cleanup leaves nothing behind',
      left === 0,
      `${assets.length} asset(s), ${made.jobs.size} job(s), ${made.objects.size} object(s), ${previews} draft(s) removed · ${left} left`,
    );
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

const plan = loadPlan();
if (!plan) {
  failed = true;
} else if (DRY_RUN) {
  note(
    `plan: ${OUTPUT} ${plan.output.width}×${plan.output.height} · swatch ${plan.swatchFrom.join(',')} → ${plan.swatchTo.join(',')} · brand ${BRAND_ID} as ${OWNER_EMAIL} · app :${APP_PORT} backend :${BACKEND_PORT}`,
  );
  rec.record(
    'the live chain',
    'SKIP',
    '--dry-run: nothing was uploaded, drawn, rendered or cleaned up',
  );
} else {
  await live(plan).catch((error: unknown) => {
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
