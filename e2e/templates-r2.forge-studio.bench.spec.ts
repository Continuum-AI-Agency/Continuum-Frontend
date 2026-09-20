import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderJob,
  type ApiRenderOutput,
  apiRenderJobListQuerySchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  listVersionsResponseSchema,
  renderWorkspaceSchema,
  type TemplateSource,
  type TemplateSourceSummary,
  templateSourceSchema,
  templateSourceSummarySchema,
  versionSignUploadResponseSchema,
  workspaceTemplateSchema,
} from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Route,
  type TestInfo,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { TemplateVariablesResponse } from '@/lib/library/templateSources';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import {
  BINDING_ID,
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:studio:e2e:bench · templates r2 — the Templates tab as round 2 left it, in a REAL Chrome:
//   GALLERY  every card shows its newest rendered frame (one list read, file matched by name,
//            never outputs[0]); a card that never rendered says "No render yet"; the version hash
//            left the card face for a hover card of facts; the page never scrolls sideways.
//   SHARED   "Use in StarCraft" says what it does inline, grants on click; a granted one reads
//            "In StarCraft ✓ · Remove".
//   DEDUPE   dropping bytes Forge already holds opens that template and uploads NOTHING.
//   NAME     dropping a known file name asks "New revision of X" or "New template"; both paths
//            reach storage, and storage's size refusal comes back as a sentence naming the limit.
//
// Real: Chrome, a minted StarCraft session pinned for this session only, the server-rendered /forge
// page against production Supabase, every Forge component on it.
// FIXTURES: /api/ai-studio/** from the shared contract-parsed fixtures, with the template list,
// render jobs, discover, adopt and variables overridden here. The two Supabase edge functions an
// upload calls (library-upload, library-creative-operations) and the storage TUS endpoint are
// answered HERE too — storage refuses with the real 413 — so no byte reaches production storage.
// NOT exercised: the Fastify backend, the forge engine, the render fleet, a real storage upload.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3411 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s1 \
//     bun run forge:studio:e2e:bench -- e2e/templates-r2.forge-studio.bench.spec.ts
// ---------------------------------------------------------------------------

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const RESULTS_PATH = join(tmpdir(), `forge-studio-templates-r2-bench-${RUN_ID}.jsonl`);

const PROMO = FORGE_FIXTURE.promo;
const DRAFT = FORGE_FIXTURE.draft;
const PROMO_VERSION_ID = '8b2f5d3c-4e6a-4b7c-8d9e-1f2a3b4c5d6e';
const DRAFT_VERSION_ID = 'd1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6';
const PROMO_FILENAME = 'StarCraft Promo.aep';
const PROMO_DIGEST = 'a1b2c3d4e5'.repeat(6).concat('f6a7');
const SQUARE = { comp: 'Square 1080', ratio: '1:1', width: 1080, height: 1080 };
const STORY = { comp: 'Story 1080x1920', ratio: '9:16', width: 1080, height: 1920 };
const RENDER_HOST = 'https://renders.forge-r2.test';
const PROMO_SQUARE_FILE = 'Square_1080_k3v9.png';
const PROMO_STORY_FILE = 'Story_1080x1920_q8r2.png';
const ZERG_SQUARE_FILE = 'Zerg_Square_1_1_y4.png';
const HYDRA = { templateKey: 'hydralisk_hunt', displayName: 'Hydralisk hunt' };
/** What the bench brand is called on the page. */
const BRAND = 'StarCraft: Remastered';

/** The bytes Forge already holds as the promo's current source revision. */
const HELD_BYTES = Buffer.from('StarCraft Promo — the exact package already in Forge');
const HELD_CHECKSUM = createHash('sha256').update(HELD_BYTES).digest('hex');
/** Over the 50 MB storage cap and under the 64 MB the upload hashes, like a real package. */
const BIG_BYTES = 60 * 1024 * 1024;

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhAG/7Z0t0QAAAABJRU5ErkJggg==',
  'base64',
);

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];

// --- session ---------------------------------------------------------------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[templates-r2-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[templates-r2-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/** Pins THIS session to StarCraft through the member's own RLS, then reads it back. */
async function pinSessionToStarCraft(accessToken: string): Promise<void> {
  const { sub, session_id } = claimsOf(accessToken);
  const member = createClient(PROD_SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[templates-r2-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[templates-r2-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

// --- envelope ----------------------------------------------------------------------------------

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo): void {
  const grade: Grade = {
    step: testInfo.title,
    grade: testInfo.status === 'passed' ? 'PASS' : testInfo.status === 'skipped' ? 'SKIP' : 'FAIL',
    ...(testInfo.error?.message ? { detail: testInfo.error.message.slice(0, 500) } : {}),
  };
  appendFileSync(RESULTS_PATH, `${JSON.stringify(grade)}\n`);
}

function printEnvelope(): void {
  const results: Grade[] = existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Grade)
    : [];
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of results) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: 'forge:studio:e2e:bench · templates-r2',
      mode: 'fixtures',
      results,
      notes: [
        'FIXTURES: /api/ai-studio/** from the shared contract-parsed fixtures; the template list, render jobs, discover, adopt and variables were overridden in this spec. The backend URL is a dead port.',
        'The library-upload and library-creative-operations edge functions and the storage TUS endpoint were answered in the browser (storage refusing with 413), so nothing was written to production storage.',
        'NOT exercised: the Fastify backend, the forge engine, the render fleet, a real storage upload. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and the Templates tab components.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

// --- fixtures ------------------------------------------------------------------------------------

function parseOf(filename: string) {
  const formats = [SQUARE, STORY];
  const slots = [
    { key: 'headline', name: 'Headline', kind: 'text' },
    { key: 'ref_price_text', name: 'ref_price_text', kind: 'text' },
    { key: 'ref_imagen_logo', name: 'ref_imagen_logo', kind: 'image' },
  ];
  return {
    parser: 'py_aep',
    sourceFamily: 'after_effects',
    appVersion: '25.2',
    filename,
    comps: formats.map((format) => ({
      name: format.comp,
      width: format.width,
      height: format.height,
      layerCount: 12,
      isTop: true,
      isDelivery: true,
    })),
    ratios: formats.map((format) => ({
      ratio: format.ratio,
      width: format.width,
      height: format.height,
      comps: [format.comp],
    })),
    slots: slots.map((slot, index) => ({
      ...slot,
      origin: 'essential',
      driver: 'static',
      comps: formats.map((format) => format.comp),
      layerIds: [3 + index],
      instances: formats.map((format, compIndex) => ({
        compId: compIndex + 1,
        comp: format.comp,
        layerId: 3 + index,
        box: [80, 80 + index * 240, format.width - 80, 260 + index * 240],
        compSize: [format.width, format.height],
      })),
    })),
    fonts: [{ family: 'HeadingNow-36CompBold', layers: 2 }],
    staticText: [],
    warnings: [],
  };
}

function templateSources(): TemplateSource[] {
  return [
    {
      assetId: PROMO.assetId,
      versionId: PROMO_VERSION_ID,
      parse: parseOf(PROMO_FILENAME),
      forgeState: 'published',
      templateKey: PROMO.templateKey,
      displayName: PROMO.title,
      aepSha256: PROMO_DIGEST,
      sourceChecksum: HELD_CHECKSUM,
      parsedAt: '2026-09-10T09:00:00.000Z',
      createdAt: '2026-09-08T09:00:00.000Z',
      updatedAt: '2026-09-14T09:00:00.000Z',
    },
    {
      assetId: DRAFT.assetId,
      versionId: DRAFT_VERSION_ID,
      parse: parseOf(DRAFT.filename),
      forgeState: 'draft_ready',
      templateKey: null,
      displayName: null,
      createdAt: '2026-09-12T09:00:00.000Z',
      updatedAt: '2026-09-13T09:00:00.000Z',
    },
  ].map((source) =>
    templateSourceSchema.parse({
      brandId: STARCRAFT_BRAND_ID,
      family: 'after_effects',
      parseState: 'parsed',
      fonts: ['HeadingNow-36CompBold'],
      ratios: [SQUARE.ratio, STORY.ratio],
      slotCount: 3,
      forgeRunId: 'run_r2',
      ...source,
    }),
  );
}

/** Card-sized parse geometry only, exactly as the Backend's list route serves it. */
function asSummary(source: TemplateSource): TemplateSourceSummary {
  const { parse } = source;
  return templateSourceSummarySchema.parse({
    ...source,
    parse: parse
      ? {
          parser: parse.parser,
          sourceFamily: parse.sourceFamily,
          filename: parse.filename,
          comps: parse.comps.map(({ name, width, height, durationSec, isDelivery }) => ({
            name,
            width,
            height,
            durationSec,
            isDelivery,
          })),
          ratios: parse.ratios,
          slots: parse.slots.map(({ key, kind, comps, box, placement, instances }) => ({
            key,
            kind,
            comps,
            box,
            placement,
            instances,
          })),
        }
      : null,
  });
}

const output = (fileName: string): ApiRenderOutput => ({
  id: createHash('sha256').update(fileName).digest('hex').slice(0, 24),
  kind: 'image',
  fileName,
  mimeType: 'image/png',
  url: `${RENDER_HOST}/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

function finishedJobs(): ApiRenderJob[] {
  const base = {
    brandId: STARCRAFT_BRAND_ID,
    contractHash: 'sc-promo-v1-contract-hash',
    status: 'finished',
    delivery: [],
    error: null,
  };
  return [
    {
      ...base,
      id: randomUUID(),
      templateKey: PROMO.templateKey,
      templateName: PROMO.title,
      taskUid: 'T-r2-promo',
      // The fleet listed the 9:16 file first: outputs[0] is the wrong picture for this card.
      outputs: [output(PROMO_STORY_FILE), output(PROMO_SQUARE_FILE)],
      createdAt: '2026-09-15T09:00:00.000Z',
      updatedAt: '2026-09-15T09:03:00.000Z',
      finishedAt: '2026-09-15T09:02:00.000Z',
      templateSource: {
        assetId: PROMO.assetId,
        versionId: PROMO_VERSION_ID,
        sha256: PROMO_DIGEST,
        versionNumber: 2,
      },
    },
    {
      ...base,
      id: randomUUID(),
      templateKey: FORGE_FIXTURE.shared.templateKey,
      templateName: FORGE_FIXTURE.shared.displayName,
      taskUid: 'T-r2-zerg',
      outputs: [output('Zerg_Story_9_16_x1.png'), output(ZERG_SQUARE_FILE)],
      createdAt: '2026-09-14T09:00:00.000Z',
      updatedAt: '2026-09-14T09:03:00.000Z',
      finishedAt: '2026-09-14T09:02:00.000Z',
    },
  ].map((job) => apiRenderJobSchema.parse(job));
}

const WORKSPACE = renderWorkspaceSchema.parse({
  id: '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091',
  picinst: 'Continuum_app',
  environmentKey: 'prod',
  clientKey: 'starcraft_b17d81',
  isDefault: true,
});

function variablesResponse(): TemplateVariablesResponse {
  const variable = (key: string, kind: string) => ({
    key,
    label: key,
    kind,
    required: false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: null,
    roleSource: null,
    charBudget: kind === 'text' ? 24 : null,
    comps: [SQUARE.comp, STORY.comp],
    sample: null,
    placement: null,
  });
  return {
    parseState: 'parsed',
    edits: [],
    variables: [
      variable('Headline', 'text'),
      variable('ref_price_text', 'text'),
      variable('ref_imagen_logo', 'image'),
    ],
  };
}

type Uploads = {
  /** Every call to the upload edge functions and the storage endpoint, by what it asked for. */
  calls: string[];
  adopted: unknown[];
  /** Every render-jobs list query the page sent. */
  jobReads: Array<Record<string, string>>;
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  const origin = (await route.request().headerValue('origin')) ?? '*';
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** A CORS preflight answered the way Supabase's gateway would, echoing what was asked for. */
async function preflight(route: Route): Promise<void> {
  const request = route.request();
  await route.fulfill({
    status: 204,
    headers: {
      'access-control-allow-origin': (await request.headerValue('origin')) ?? '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, HEAD, DELETE, OPTIONS',
      'access-control-allow-headers':
        (await request.headerValue('access-control-request-headers')) ?? '*',
      'access-control-expose-headers': 'Location, Upload-Offset, Upload-Length, Tus-Resumable',
      'access-control-max-age': '600',
    },
  });
}

/** Registered after the shared fixtures, so these answer first. */
async function overrideRoutes(context: BrowserContext): Promise<Uploads> {
  const uploads: Uploads = { calls: [], adopted: [], jobReads: [] };
  let hydraGranted = false;

  await context.route(
    (url) => url.pathname === '/api/ai-studio/templates',
    (route) =>
      route.request().method() === 'GET'
        ? json(route, { items: templateSources().map(asSummary) })
        : route.fallback(),
  );
  await context.route(
    (url) => url.pathname === '/api/ai-studio/renders/jobs',
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const query = Object.fromEntries(new URL(route.request().url()).searchParams.entries());
      uploads.jobReads.push(query);
      // The real list query schema: a page over 50 is a 400 from the real route, too.
      const parsed = apiRenderJobListQuerySchema.safeParse(query);
      if (!parsed.success) return json(route, { error: 'jobs_query_refused' }, 400);
      const items = finishedJobs()
        .filter((job) => !parsed.data.templateKey || job.templateKey === parsed.data.templateKey)
        .filter((job) => !parsed.data.status || job.status === parsed.data.status);
      return json(route, apiRenderJobListResponseSchema.parse({ items, nextCursor: null }));
    },
  );
  await context.route(
    (url) => url.pathname === '/api/ai-studio/templates/discover',
    (route) =>
      route.request().method() !== 'GET'
        ? route.fallback()
        : json(route, {
            workspace: WORKSPACE,
            items: [
              {
                templateKey: 'terran_dropship_launch',
                templateId: 131,
                bindingId: BINDING_ID,
                name: '[DRAFT/agent] terran_dropship_launch',
                granted: false,
                sourceAssetId: DRAFT.assetId,
                draft: true,
              },
              {
                templateKey: FORGE_FIXTURE.shared.templateKey,
                templateId: 132,
                bindingId: BINDING_ID,
                name: FORGE_FIXTURE.shared.templateKey,
                updatedAt: '2026-09-11T09:00:00.000Z',
                granted: true,
                draft: false,
              },
              {
                templateKey: HYDRA.templateKey,
                templateId: 134,
                bindingId: BINDING_ID,
                name: HYDRA.templateKey,
                updatedAt: '2026-09-09T09:00:00.000Z',
                granted: hydraGranted,
                draft: false,
              },
            ].map((item) => workspaceTemplateSchema.parse(item)),
          }),
  );
  await context.route(
    (url) => url.pathname === '/api/ai-studio/templates/adopt',
    (route) => {
      if (route.request().method() === 'OPTIONS') return preflight(route);
      const body = route.request().postDataJSON() as { templateKey?: string; enabled?: boolean };
      uploads.adopted.push(body);
      if (body.templateKey === HYDRA.templateKey) hydraGranted = body.enabled === true;
      return json(route, { granted: body.enabled === true });
    },
  );
  await context.route(
    (url) => /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/variables$/.test(url.pathname),
    (route) =>
      route.request().method() === 'GET' ? json(route, variablesResponse()) : route.fallback(),
  );

  // The rendered files: a real PNG per file name, so a card's <img> decodes.
  await context.route(`${RENDER_HOST}/**`, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
      body: PIXEL_PNG,
    }),
  );

  // Uploads: every hop answered here and recorded, and storage refuses like the real cap does.
  await context.route(/\/functions\/v1\/library-upload/, async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const body = route.request().postDataJSON() as { action?: string };
    uploads.calls.push(`library-upload:${body.action}`);
    if (body.action !== 'sign_upload') return json(route, { message: 'unexpected' }, 500);
    return json(route, {
      bucket: 'media-source',
      path: `${STARCRAFT_BRAND_ID}/${randomUUID()}/upload.aep`,
      token: 'fixture-token',
      assetId: randomUUID(),
    });
  });
  await context.route(/\/functions\/v1\/library-creative-operations/, async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const body = route.request().postDataJSON() as { action?: string; assetId?: string };
    uploads.calls.push(`creative-operations:${body.action}:${body.assetId ?? ''}`);
    if (body.action === 'list_asset_versions') {
      return json(
        route,
        listVersionsResponseSchema.parse({
          versions: [
            {
              id: DRAFT_VERSION_ID,
              brandId: STARCRAFT_BRAND_ID,
              assetId: body.assetId ?? DRAFT.assetId,
              versionNumber: 1,
              bucket: 'media-source',
              storagePath: `${STARCRAFT_BRAND_ID}/${DRAFT.assetId}/v1/${DRAFT.filename}`,
              fileName: DRAFT.filename,
              mimeType: 'application/octet-stream',
              isHead: true,
              createdAt: '2026-09-12T09:00:00.000Z',
            },
          ],
        }),
      );
    }
    if (body.action === 'sign_version_upload') {
      return json(
        route,
        versionSignUploadResponseSchema.parse({
          bucket: 'media-source',
          path: `${STARCRAFT_BRAND_ID}/${DRAFT.assetId}/v2/upload.aep`,
          token: 'fixture-token',
          versionNumber: 2,
        }),
      );
    }
    return json(route, { code: 'unexpected', message: `unexpected ${body.action}` }, 500);
  });
  await context.route(/\/storage\/v1\/upload\/resumable/, async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    uploads.calls.push(`storage:${route.request().method()}`);
    await route.fulfill({
      status: 413,
      headers: {
        'access-control-allow-origin': (await route.request().headerValue('origin')) ?? '*',
        'content-type': 'text/plain',
        'tus-resumable': '1.0.0',
      },
      body: 'The object exceeded the maximum allowed size',
    });
  });
  return uploads;
}

// --- page helpers ----------------------------------------------------------------------------------

async function openForge(
  browser: Browser,
  viewport = { width: 1280, height: 800 },
): Promise<{ page: Page; fixtures: ForgeFixtures; uploads: Uploads }> {
  if (!session) throw new Error('[templates-r2-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  const uploads = await overrideRoutes(context);
  const page = await context.newPage();
  // Printed, not asserted: the page carries surfaces this spec does not own.
  page.on('pageerror', (error) => console.log(`[templates-r2-bench] pageerror ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[templates-r2-bench] console.error ${message.text().slice(0, 300)}`);
    }
  });
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole('button', { name: `Open ${PROMO.title}`, exact: true })).toBeVisible({
    timeout: 60_000,
  });
  return { page, fixtures, uploads };
}

const cardOf = (page: Page, name: string): Locator =>
  page
    .getByRole('article')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });

const sharedCardOf = (page: Page, name: string): Locator =>
  page.getByRole('article').filter({ has: page.getByText(name, { exact: true }) });

/** Picks files through the tile's own input — what a drop and "click to choose" both feed. */
async function dropFiles(
  page: Page,
  files: Array<{ name: string; buffer?: Buffer; path?: string }>,
): Promise<void> {
  const input = page.getByLabel('Project files');
  await input.setInputFiles(
    files.map((file) =>
      file.path
        ? file.path
        : { name: file.name, mimeType: '', buffer: file.buffer ?? Buffer.from('') },
    ),
  );
}

/** A package over the storage cap, written once to disk: Playwright takes big files by path. */
const BIG_DIR = join(tmpdir(), `forge-r2-${RUN_ID}`);
function bigPackage(name: string): string {
  const dir = BIG_DIR;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  if (!existsSync(path)) writeFileSync(path, Buffer.alloc(BIG_BYTES, 7));
  return path;
}

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `templates-r2-${name}.png`) });
}

// --- the run -----------------------------------------------------------------------------------------

test.beforeAll(async () => {
  test.setTimeout(120_000);
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  if (session) {
    const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
    session = null;
  }
  rmSync(BIG_DIR, { recursive: true, force: true });
  printEnvelope();
});

test.describe('Forge Studio — templates r2', () => {
  test.skip(LIVE, 'the templates r2 bench runs on fixtures only');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
    recordGrade(testInfo);
  });

  test('GALLERY · real frames by file name, hover facts, no hash on the face, no sideways scroll', async ({
    browser,
  }) => {
    const { page, fixtures, uploads } = await openForge(browser);

    // The promo's picture is the file for its FIRST format, found by name — not outputs[0].
    const promo = cardOf(page, PROMO.title);
    const frame = promo.getByRole('img', { name: `${PROMO.title} · last render` });
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('src', `${RENDER_HOST}/${PROMO_SQUARE_FILE}`);
    expect(await frame.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // A shared template shows its render too; a template that never rendered says so.
    const zerg = sharedCardOf(page, FORGE_FIXTURE.shared.displayName);
    await expect(
      zerg.getByRole('img', { name: `${FORGE_FIXTURE.shared.displayName} · last render` }),
    ).toHaveAttribute('src', `${RENDER_HOST}/${ZERG_SQUARE_FILE}`);
    await expect(cardOf(page, DRAFT.displayName).getByText('No render yet')).toBeVisible();

    // One gallery read of finished renders, a page the real route accepts.
    expect(uploads.jobReads.map((query) => query.status)).toEqual(['finished']);
    expect(Number(uploads.jobReads[0]?.limit)).toBeLessThanOrEqual(50);

    // The hash left the card face.
    expect(await promo.textContent()).not.toContain(PROMO_DIGEST.slice(0, 10));

    // Held, the card shows its facts, all from what the page already read.
    await promo.getByRole('button', { name: `Open ${PROMO.title}`, exact: true }).hover();
    const facts = page.locator('[data-slot="hover-card-content"]');
    await expect(facts).toBeVisible();
    const fact = (label: string) =>
      facts
        .locator('dt', { hasText: new RegExp(`^${label}$`) })
        .locator('xpath=following-sibling::dd[1]');
    await expect(fact('Formats')).toHaveText('1:19:16');
    await expect(fact('Variables')).toHaveText('3');
    await expect(fact('Fonts')).toHaveText('1');
    await expect(fact('Last render')).toHaveText(/ago$/);
    // The revision the last render used and the day it used it — the ledger's own reading.
    await expect(fact('Version')).toHaveText('Rev 2 · Sep 15');
    await expect(fact('Digest')).toHaveText(PROMO_DIGEST);
    await shoot(page, 'gallery-hover');

    // Once the template has been opened, the hover knows which variables are still layer names —
    // and the detail shows them as words while the Name field keeps what is stored.
    await page.mouse.move(0, 0);
    await promo.getByRole('button', { name: `Open ${PROMO.title}`, exact: true }).click();
    const variables = page.getByRole('list', { name: 'Variables' });
    await expect(variables.getByText('Price text', { exact: true })).toBeVisible();
    await expect(variables.getByText('Imagen logo', { exact: true })).toBeVisible();
    // The sheet holds the widest things on this tab — its renders table and the variable rows.
    const sheetScroll = await noHorizontalScroll(page);
    console.log(`[templates-r2-bench] sheet overflow ${JSON.stringify(sheetScroll)}`);
    expect(sheetScroll.document).toBeLessThanOrEqual(0);
    expect(sheetScroll.main).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Templates', exact: true }).click();
    await cardOf(page, PROMO.title)
      .getByRole('button', { name: `Open ${PROMO.title}`, exact: true })
      .hover();
    await expect(fact('Variables')).toHaveText('3 · 2 unnamed');

    const scroll = await noHorizontalScroll(page);
    console.log(`[templates-r2-bench] overflow ${JSON.stringify(scroll)}`);
    expect(scroll.document).toBeLessThanOrEqual(0);
    expect(scroll.main).toBeLessThanOrEqual(0);

    expect(fixtures.violations, 'a body the real contract refuses').toEqual([]);
    expect([...fixtures.brandIds]).toEqual([STARCRAFT_BRAND_ID]);
  });

  test('SHARED · "Use in StarCraft" explains itself and grants; a granted one reads In StarCraft · Remove', async ({
    browser,
  }) => {
    const { page, uploads } = await openForge(browser);
    await page.getByRole('button', { name: /^Shared with you/ }).click();

    const explanation = `Lets ${BRAND} render this template. Nothing is copied — it stays in the shared library. Remove any time.`;
    const hydra = sharedCardOf(page, HYDRA.displayName);
    await expect(hydra.getByText(explanation, { exact: true })).toBeVisible();
    await hydra.getByRole('button', { name: `Use in ${BRAND}`, exact: true }).click();
    await expect(hydra.getByText(`In ${BRAND}`, { exact: true })).toBeVisible();
    await expect(
      hydra.getByRole('button', { name: `Remove ${HYDRA.displayName} from ${BRAND}` }),
    ).toBeVisible();
    expect(uploads.adopted).toEqual([
      expect.objectContaining({ templateKey: HYDRA.templateKey, enabled: true }),
    ]);

    const zerg = sharedCardOf(page, FORGE_FIXTURE.shared.displayName);
    await expect(zerg.getByText(`In ${BRAND}`, { exact: true })).toBeVisible();
    await expect(zerg.getByText(explanation, { exact: true })).toBeVisible();
    await shoot(page, 'shared');
  });

  test('DEDUPE · the same bytes open the template that holds them and upload nothing', async ({
    browser,
  }) => {
    const { page, uploads } = await openForge(browser);
    await dropFiles(page, [{ name: 'promo copy from the drive.aep', buffer: HELD_BYTES }]);

    await expect(page.getByText(`Already in Forge as ${PROMO.title}`)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: PROMO.title }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Variables', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Give a stray upload time to show itself before asserting there was none. The opened
    // template's Source revision panel LISTS its versions; that read is not an upload.
    await page.waitForTimeout(1_500);
    expect(uploads.calls.filter((call) => !call.includes(':list_asset_versions:'))).toEqual([]);
    await shoot(page, 'dedupe');
  });

  test('NAME · a known file name asks; both answers reach storage, and its size refusal names the limit', async ({
    browser,
  }) => {
    const { page, uploads } = await openForge(browser);
    const refusal = `${PROMO_FILENAME} is 60 MB, over the 50 MB upload limit, so it was not uploaded. Ask an admin to raise the limit.`;
    const dialog = page.getByRole('alertdialog');

    // New template: a separate upload through the gallery path, refused by storage in words.
    await dropFiles(page, [{ name: PROMO_FILENAME, path: bigPackage(PROMO_FILENAME) }]);
    await expect(dialog.getByText(`${PROMO.title} already has this file name`)).toBeVisible();
    await shoot(page, 'same-name');
    await dialog.getByRole('button', { name: 'New template', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: refusal })).toBeVisible({
      timeout: 30_000,
    });
    expect(uploads.calls).toEqual(['library-upload:sign_upload', 'storage:POST']);

    // New revision: the template opens on its Source revision tab and uploads through the revision
    // path (never a new card), and storage's refusal comes back the same way.
    // Cleared first, so the sentence asserted next can only have come from the revision path.
    await page.getByRole('button', { name: `Cancel ${PROMO_FILENAME}`, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: refusal })).toHaveCount(0);
    uploads.calls.length = 0;
    await dropFiles(page, [{ name: PROMO_FILENAME, path: bigPackage(PROMO_FILENAME) }]);
    await dialog
      .getByRole('button', { name: `New revision of ${PROMO.title}`, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: PROMO.title }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Source revision', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText(refusal)).toBeVisible({ timeout: 30_000 });
    expect(uploads.calls).toContain(`creative-operations:sign_version_upload:${PROMO.assetId}`);
    expect(uploads.calls).toContain('storage:POST');
    expect(uploads.calls.filter((call) => call.startsWith('library-upload'))).toEqual([]);
    await shoot(page, 'revision-refused');
  });
});
