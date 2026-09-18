import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderJob,
  type ApiRenderVariableMap,
  apiRenderJobListQuerySchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
  apiRenderTemplateSummarySchema,
  apiRenderVariableMapSchema,
  type ForgeRenderSetRow,
  readableLayerName,
  type SlotPlacement,
  slotPlacementSchema,
} from '@continuum/contracts';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import {
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:studio:e2e:bench — preview-r2: the Render tab previews a row as a REAL render with only
// the slots the row changed painted over it.
//
// The backdrop is real: the newest finished StarCraft render of template 133 (a 1:1 still), read
// from prod with the service role (read-only), its bytes fetched and served to the browser from a
// fixture host by `context.route` — once WITH CORS headers (the prod hosts send
// `access-control-allow-origin: *`; checked with curl on 2026-09-18) and once allowing only another
// origin, to prove the tainted-canvas fallback. The slot boxes are that template version's real parse placements, and
// the input the render was made with is that job's real `render_input` column. Everything under
// /api/ai-studio/** is answered by contract-parsed fixtures (the backend is a dead port).
//
//   R1  "Base" rendered with exactly its values → the render alone, no toggle.
//   R2  "Base · new copy" (a child: new text in one boxed slot + a new colour) → Preview over
//       Base's render; the slot is repainted in colours sampled off the render; the colour is
//       listed "Not previewed"; and — against "Base · same", a child with no changes — pixels
//       differ ONLY inside that slot's measured box.
//   R3  "Solo", whose render recorded no input and predates the set's revision, served to another
//       origin only → Preview first, "can't tell what changed", a neutral fill that says so;
//       Rendered is one click away.
//
// Usage: cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3412 \
//   FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s2 \
//   bun run forge:studio:e2e:bench -- e2e/preview-r2.forge-studio.bench.spec.ts
// ---------------------------------------------------------------------------

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const RESULTS_PATH = join(tmpdir(), `forge-studio-preview-r2-bench-${RUN_ID}.jsonl`);
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const VIEWPORT = { width: 1440, height: 900 };

/** Prod template 133 ("Producto individual con descuento"), bound into StarCraft for benches. */
const REAL_TEMPLATE_KEY = '133';
const TEMPLATE_KEY = FORGE_FIXTURE.promo.templateKey;
const RENDER_HOST = 'https://render-fixture.continuum.test';
const NEW_COPY = 'CARRIER HAS ARRIVED';
const NEW_KEY_COLOUR = '#ff00aa';
const LABELS = { base: 'Base', same: 'Base · same', changed: 'Base · new copy', solo: 'Solo' };

// --- the real render -------------------------------------------------------------------------

const jobRowSchema = z.object({
  id: z.string().uuid(),
  outputs: z.array(z.object({ kind: z.string(), fileName: z.string(), url: z.string().url() })),
  render_input: apiRenderVariableMapSchema,
  template_source_asset_id: z.string().uuid(),
  template_source_version_id: z.string().uuid(),
});
const parseSchema = z.object({
  parse: z.object({
    slots: z.array(
      z.object({ key: z.string(), kind: z.string(), placement: slotPlacementSchema.nullish() }),
    ),
  }),
});

type RealRender = {
  jobId: string;
  fileName: string;
  bytes: Buffer;
  contentType: string;
  renderInput: ApiRenderVariableMap;
  slots: Array<{ key: string; kind: string; placement: SlotPlacement | null }>;
};

/** The newest finished StarCraft 1:1 still of template 133 with its input and parse. Read-only. */
async function loadRealRender(): Promise<RealRender | null> {
  const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .schema('media')
    .from('ad_render_jobs')
    .select(
      'id, outputs, render_input, template_source_asset_id, template_source_version_id, finished_at',
    )
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .eq('template_key', REAL_TEMPLATE_KEY)
    .eq('status', 'finished')
    .not('render_input', 'is', null)
    .not('template_source_version_id', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(`[preview-r2] job read failed: ${error.message}`);
  for (const raw of data ?? []) {
    const job = jobRowSchema.safeParse(raw);
    if (!job.success) continue;
    const still = job.data.outputs.find(
      (output) => output.kind === 'image' && /_1_1_[a-z0-9]+\.(jpe?g|png)$/i.test(output.fileName),
    );
    if (!still) continue;
    const { data: source } = await admin
      .schema('media')
      .from('template_sources')
      .select('parse')
      .eq('asset_id', job.data.template_source_asset_id)
      .eq('version_id', job.data.template_source_version_id)
      .maybeSingle();
    const parsed = parseSchema.safeParse(source);
    if (!parsed.success) continue;
    const response = await fetch(still.url);
    if (!response.ok) continue;
    return {
      jobId: job.data.id,
      fileName: still.fileName,
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: still.fileName.endsWith('.png') ? 'image/png' : 'image/jpeg',
      renderInput: job.data.render_input,
      slots: parsed.data.parse.slots.map((slot) => ({
        ...slot,
        placement: slot.placement ?? null,
      })),
    };
  }
  return null;
}

// --- the dress: template 133's real variables, boxes and render on the promo template -----------

/** `text__ref-descripci-n` → `ref_descripci_n`: the parse slot's public variable key. */
const publicKey = (slotKey: string) =>
  slotKey
    .replace(/^[a-z]+__/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase();

type Dress = {
  contract: ReturnType<typeof apiRenderTemplateContractSchema.parse>;
  comp: { name: string; width: number; height: number };
  /** The text slot this bench changes: boxed, not rigged, wholly inside the frame. */
  changedKey: string;
  /** A colour variable: it has no box, so it can only be listed as not previewed. */
  colourKey: string;
  changedBox: [number, number, number, number];
  ownValues: ApiRenderVariableMap;
};

function dress(real: RealRender): Dress {
  const bySlot = new Map(real.slots.map((slot) => [publicKey(slot.key), slot]));
  const variables = Object.entries(real.renderInput).map(([key, value]) => {
    const slot = bySlot.get(key);
    const pinned = typeof value === 'object';
    return {
      key,
      label: key,
      kind: pinned
        ? 'image'
        : typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
          ? 'color'
          : 'text',
      required: false,
      // A picture no slot names is Continuum's own autofill (the brand logo watermark).
      reserved: pinned && !slot,
      placement: slot?.placement ?? null,
    };
  });
  const square = variables.find(
    (variable) =>
      variable.placement && variable.placement.compSize[0] === variable.placement.compSize[1],
  )?.placement;
  if (!square) throw new Error('[preview-r2] template 133 has no measured 1:1 placement');
  const comp = { name: square.comp, width: square.compSize[0], height: square.compSize[1] };
  const boxes = variables.flatMap((variable) =>
    variable.placement?.comp === comp.name
      ? [
          {
            key: variable.key,
            label: variable.label,
            box: variable.placement.box,
            role: null,
            kind: variable.kind,
          },
        ]
      : [],
  );
  const changed = boxes.find((box) => {
    const variable = variables.find((entry) => entry.key === box.key);
    const [x0, y0, x1, y1] = box.box;
    return (
      box.kind === 'text' &&
      !variable?.placement?.rigged &&
      x0 >= 0 &&
      y0 >= 0 &&
      x1 <= comp.width &&
      y1 <= comp.height
    );
  });
  if (!changed)
    throw new Error('[preview-r2] template 133 has no boxed text slot inside its frame');
  const colour = variables.find((variable) => variable.kind === 'color');
  if (!colour) throw new Error('[preview-r2] template 133 has no colour variable');
  const summary = apiRenderTemplateSummarySchema.parse({
    key: TEMPLATE_KEY,
    name: TEMPLATE_KEY,
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'sc-promo-v1-contract-hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: variables.length,
    previewUrl: null,
    updatedAt: '2026-09-14T09:00:00.000Z',
    ratios: ['1:1'],
    sourceAssetId: FORGE_FIXTURE.promo.assetId,
    fontsMissing: 0,
    displayName: FORGE_FIXTURE.promo.title,
  });
  return {
    contract: apiRenderTemplateContractSchema.parse({
      template: summary,
      variables,
      fonts: [],
      layout: { comp, boxes },
      // Template 133's live contract: no outputs; its formats are its ratios.
      outputs: [],
    }),
    comp,
    changedKey: changed.key,
    colourKey: colour.key,
    changedBox: changed.box as [number, number, number, number],
    ownValues: Object.fromEntries(
      Object.entries(real.renderInput).filter(
        ([key]) => !variables.find((variable) => variable.key === key)?.reserved,
      ),
    ),
  };
}

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function dressAsRealRender(
  context: BrowserContext,
  fixtures: ForgeFixtures,
  real: RealRender,
  shape: Dress,
) {
  const set = fixtures.state.sets[0]!;
  const id = () => crypto.randomUUID();
  const ids = { base: id(), same: id(), changed: id(), solo: id() };
  const row = (
    key: keyof typeof ids,
    parentId: string | null,
    overrides: ApiRenderVariableMap,
  ): ForgeRenderSetRow => ({
    id: ids[key],
    parentId,
    label: LABELS[key],
    overrides,
    clearedKeys: [],
    outputIds: [],
  });
  set.rows = [
    row('base', null, shape.ownValues),
    row('same', ids.base, {}),
    row('changed', ids.base, { [shape.changedKey]: NEW_COPY, [shape.colourKey]: NEW_KEY_COLOUR }),
    row('solo', null, shape.ownValues),
  ];
  set.templateKey = TEMPLATE_KEY;

  const file = (path: 'cors' | 'nocors') => ({
    id: `${path}-${real.jobId}`.slice(0, 24),
    kind: 'image' as const,
    fileName: real.fileName,
    mimeType: real.contentType,
    url: `${RENDER_HOST}/${path}/${real.fileName}`,
    width: null,
    height: null,
    assetId: null,
    versionId: null,
  });
  const base = {
    brandId: STARCRAFT_BRAND_ID,
    templateKey: TEMPLATE_KEY,
    templateName: FORGE_FIXTURE.promo.title,
    contractHash: 'sc-promo-v1-contract-hash',
    taskUid: 'task_preview_r2',
    status: 'finished' as const,
    delivery: [],
    error: null,
    renderSetId: set.id,
    renderSetName: set.name,
  };
  const jobs: ApiRenderJob[] = [
    apiRenderJobSchema.parse({
      ...base,
      id: '0b6a1c1e-0000-4000-8000-0000000000a1',
      label: LABELS.base,
      labelPath: [LABELS.base],
      renderSetRowId: ids.base,
      renderSetRevision: set.revision,
      renderInput: real.renderInput,
      createdAt: ago(2 * HOUR + 120_000),
      finishedAt: ago(2 * HOUR),
      updatedAt: ago(2 * HOUR),
      outputs: [file('cors')],
    }),
    apiRenderJobSchema.parse({
      ...base,
      id: '0b6a1c1e-0000-4000-8000-0000000000a2',
      label: LABELS.solo,
      labelPath: [LABELS.solo],
      renderSetRowId: ids.solo,
      renderSetRevision: set.revision - 1,
      renderInput: null,
      createdAt: ago(26 * HOUR),
      finishedAt: ago(25 * HOUR),
      updatedAt: ago(25 * HOUR),
      outputs: [file('nocors')],
    }),
  ];

  await context.route(
    (url) => url.origin === RENDER_HOST,
    (route) => {
      const cors = new URL(route.request().url()).pathname.startsWith('/cors/');
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': real.contentType,
          // Playwright adds an allow-origin to a fulfilled CORS request that names none, so the
          // refusal is spelled out: this host allows another app, never this one.
          'access-control-allow-origin': cors ? '*' : 'https://another-app.example',
        },
        body: real.bytes,
      });
    },
  );
  const json = (body: unknown) => ({
    status: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
  await context.route(
    (url) => url.pathname.startsWith('/api/ai-studio/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET') return route.fallback();
      if (url.pathname === '/api/ai-studio/renders/templates') {
        return route.fulfill(
          json(
            apiRenderTemplateListResponseSchema.parse({
              items: [shape.contract.template],
              nextCursor: null,
            }),
          ),
        );
      }
      if (url.pathname === `/api/ai-studio/renders/templates/${TEMPLATE_KEY}/contract`) {
        return route.fulfill(json(shape.contract));
      }
      if (url.pathname === '/api/ai-studio/renders/jobs') {
        const query = apiRenderJobListQuerySchema.parse(Object.fromEntries(url.searchParams));
        const items = jobs
          .filter((job) => !query.templateKey || job.templateKey === query.templateKey)
          .filter((job) => !query.renderSetId || job.renderSetId === query.renderSetId)
          .filter((job) => !query.renderSetRowId || job.renderSetRowId === query.renderSetRowId)
          .filter((job) => !query.status || job.status === query.status)
          .slice(0, query.limit);
        return route.fulfill(
          json(apiRenderJobListResponseSchema.parse({ items, nextCursor: null })),
        );
      }
      return route.fallback();
    },
  );
}

// --- session, envelope -------------------------------------------------------------------------

let session: MintedSession | null = null;
let real: RealRender | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString());
  return { sub: payload.sub, session_id: payload.session_id };
}

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
  if (error) throw new Error(`[preview-r2] session brand pin failed: ${error.message}`);
}

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo, problem: unknown): void {
  const skipped = testInfo.status === 'skipped';
  const failed = !skipped && (problem !== null || testInfo.status !== 'passed');
  const grade: Grade = {
    step: testInfo.title,
    grade: skipped ? 'SKIP' : failed ? 'FAIL' : 'PASS',
    ...(failed || skipped
      ? {
          detail: (problem instanceof Error
            ? problem.message
            : (testInfo.error?.message ?? testInfo.annotations.map((a) => a.description).join(' '))
          )?.slice(0, 500),
        }
      : {}),
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
      bench: 'forge:studio:e2e:bench',
      spec: 'preview-r2',
      mode: 'fixtures',
      startedAt: new Date(Number(RUN_ID)).toISOString(),
      durationMs: Date.now() - Number(RUN_ID),
      results,
      notes: [
        `REAL: the backdrop bytes, the slot boxes (template_sources.parse placements) and the render input (ad_render_jobs.render_input) of StarCraft job ${real?.jobId ?? 'none found'}, read-only from prod.`,
        'FIXTURES: every /api/ai-studio/** call answered in the browser; the render file served from a fixture host with and without CORS. The backend is a dead port.',
        'NOT exercised: the Fastify backend mapping render_input onto ApiRenderJob.renderInput (S4) — the column is read straight from the row here.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  real = await loadRealRender();
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
  printEnvelope();
});

// --- page helpers --------------------------------------------------------------------------------

async function openForge(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => console.log(`[preview-r2] page error: ${error.message}`));
  await page.goto('/forge', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const tab = page.getByRole('tab', { name: 'Render', exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  return page;
}

/** Clicks a grid row's last cell, which makes it the previewed row. */
async function selectRow(page: Page, label: string): Promise<Locator> {
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole('cell').last().click();
  return page.getByRole('group', { name: 'Row preview' });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `preview-r2-${name}.png`) })
    .catch(() => undefined);
}

const badgeOf = (preview: Locator) => preview.locator('[data-slot="format-preview-badge"]');
const captionOf = (preview: Locator) => preview.locator('[data-slot="format-preview-caption"]');
const warningOf = (preview: Locator) => preview.locator('[data-slot="format-preview-warning"]');
const svgOf = (preview: Locator) => preview.locator('[data-slot="format-preview-frame"] svg');

const lumaOf = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** A screenshot of the preview's SVG, once two in a row agree (the backdrop has painted). */
async function settledShot(svg: Locator): Promise<Buffer> {
  let previous = await svg.screenshot();
  for (let attempt = 0; attempt < 20; attempt++) {
    await svg.page().waitForTimeout(250);
    const next = await svg.screenshot();
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw new Error('[preview-r2] the preview never settled');
}

/** Pixels (max channel delta > 32) that differ inside and outside one screenshot-space box. */
async function diffShots(
  page: Page,
  a: Buffer,
  b: Buffer,
  box: [number, number, number, number],
): Promise<{ inside: number; outside: number; strays: number[][]; size: string }> {
  return page.evaluate(
    async ({ first, second, box }) => {
      const pixels = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [one, two] = await Promise.all([pixels(first), pixels(second)]);
      if (one.width !== two.width || one.height !== two.height) {
        return {
          inside: -1,
          outside: -1,
          strays: [],
          size: `${one.width}x${one.height} vs ${two.width}x${two.height}`,
        };
      }
      let inside = 0;
      let outside = 0;
      const strays: number[][] = [];
      for (let y = 0; y < one.height; y++) {
        for (let x = 0; x < one.width; x++) {
          const at = (y * one.width + x) * 4;
          const delta = Math.max(
            Math.abs(one.data[at]! - two.data[at]!),
            Math.abs(one.data[at + 1]! - two.data[at + 1]!),
            Math.abs(one.data[at + 2]! - two.data[at + 2]!),
          );
          if (delta <= 32) continue;
          if (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) inside += 1;
          else {
            outside += 1;
            if (strays.length < 8) strays.push([x, y, delta]);
          }
        }
      }
      return { inside, outside, strays, size: `${one.width}x${one.height}` };
    },
    { first: a.toString('base64'), second: b.toString('base64'), box },
  );
}

// --- the run -------------------------------------------------------------------------------------

test.describe('Forge row preview — a real render, repainted only where the row changed', () => {
  test.skip(LIVE, 'fixtures only');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    let problem: unknown = null;
    try {
      if (testInfo.status === 'passed') {
        for (const fixture of activeFixtures) {
          expect(fixture.violations, 'a body the real contract refuses').toEqual([]);
        }
      }
    } catch (error) {
      problem = error;
    } finally {
      await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
      activeFixtures.length = 0;
      recordGrade(testInfo, problem);
    }
    if (problem) throw problem;
  });

  test('R1–R3 · Render tab preview over the real template-133 render', async ({ browser }) => {
    test.skip(
      !real,
      'No finished StarCraft render of template 133 with a recorded input and a 1:1 still — run forge:starcraft:e2e:bench first.',
    );
    if (!session || !real) throw new Error('[preview-r2] no session or render');
    const shape = dress(real);
    const context = await browser.newContext({ storageState: session.state, viewport: VIEWPORT });
    opened.push(context);
    const fixtures = await installForgeFixtures(context);
    activeFixtures.push(fixtures);
    await dressAsRealRender(context, fixtures, real, shape);
    const page = await openForge(context);
    const corsUrl = `${RENDER_HOST}/cors/${real.fileName}`;

    // R1 — the render made with exactly these values is the picture, alone.
    const preview = await selectRow(page, LABELS.base);
    await expect(badgeOf(preview)).toHaveText(/^Rendered · \d+h ago$/);
    await expect(preview.getByRole('img', { name: 'Last render' })).toHaveAttribute('src', corsUrl);
    await expect(preview.getByRole('group', { name: 'Picture' })).toHaveCount(0);
    await expect(warningOf(preview)).toHaveText('');
    await shoot(page, 'r1-base');

    // R2 — a child with a new description and a new key colour, over Base's render.
    await selectRow(page, LABELS.changed);
    await expect(badgeOf(preview)).toHaveText('Preview');
    const repaint = preview.locator(`[data-repaint="${shape.changedKey}"]`);
    await expect(repaint.locator('text')).toHaveText(NEW_COPY);
    // Colours sampled off the render: the description sits dark on white.
    await expect(repaint.locator('rect')).toHaveAttribute('fill', /^#[0-9a-f]{6}$/);
    const fill = (await repaint.locator('rect').getAttribute('fill')) ?? '';
    const ink = (await repaint.locator('text').getAttribute('fill')) ?? '';
    console.log(`[preview-r2] ${shape.changedKey} sampled fill ${fill} ink ${ink}`);
    expect(lumaOf(fill), 'the fill is the render’s own light ground').toBeGreaterThan(200);
    expect(lumaOf(ink), 'the ink is the render’s own dark type').toBeLessThan(100);
    await expect(preview.locator('[data-repaint]')).toHaveCount(1);
    await expect(captionOf(preview)).toContainText(
      `Based on '${LABELS.base}' render · 2h ago · stand-in font`,
    );
    await expect(captionOf(preview)).not.toContainText('neutral fill');
    await expect(warningOf(preview)).toContainText(
      `Not previewed: ${readableLayerName(shape.colourKey)}`,
    );
    await expect(preview.getByRole('group', { name: 'Picture' })).toHaveCount(0);
    await shoot(page, 'r2-changed');
    const svg = svgOf(preview);
    const changedShot = await settledShot(svg);
    const geometry = await svg.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    await selectRow(page, LABELS.same);
    await expect(badgeOf(preview)).toHaveText('Preview');
    await expect(captionOf(preview)).toContainText(
      `Based on '${LABELS.base}' render · 2h ago · same values`,
    );
    await expect(preview.locator('[data-repaint]')).toHaveCount(0);
    const sameShot = await settledShot(svg);

    // The comp box mapped into the screenshot (viewBox `meet`), with a 3px anti-aliasing margin.
    const scale = Math.min(geometry.width / shape.comp.width, geometry.height / shape.comp.height);
    const offsetX = (geometry.width - shape.comp.width * scale) / 2;
    const offsetY = (geometry.height - shape.comp.height * scale) / 2;
    const [x0, y0, x1, y1] = shape.changedBox;
    const screenBox: [number, number, number, number] = [
      offsetX + x0 * scale - 3,
      offsetY + y0 * scale - 3,
      offsetX + x1 * scale + 3,
      offsetY + y1 * scale + 3,
    ];
    const diff = await diffShots(page, sameShot, changedShot, screenBox);
    console.log(
      `[preview-r2] diff ${diff.size} box ${screenBox.map((n) => n.toFixed(1)).join(',')} inside ${diff.inside} outside ${diff.outside} strays ${JSON.stringify(diff.strays)}`,
    );
    expect(diff.inside, 'the changed description is repainted').toBeGreaterThan(200);
    expect(diff.outside, 'nothing outside the changed box moved').toBe(0);

    // R3 — a render with no recorded input, older than the set's revision, served without CORS.
    await selectRow(page, LABELS.solo);
    await expect(badgeOf(preview)).toHaveText('Preview');
    await expect(captionOf(preview)).toContainText(`Based on '${LABELS.solo}' render · 1d ago`);
    await expect(captionOf(preview)).toContainText("can't tell what changed");
    await expect(captionOf(preview)).toContainText(
      "neutral fill: the render's colours can't be read",
    );
    await expect(preview.locator(`[data-repaint="${shape.changedKey}"] rect`)).toHaveAttribute(
      'class',
      'fill-muted',
    );
    await shoot(page, 'r3-solo-neutral');
    await preview
      .getByRole('group', { name: 'Picture' })
      .getByRole('button', { name: 'Rendered' })
      .click();
    await expect(badgeOf(preview)).toHaveText('Rendered · before latest edits');
    await expect(preview.getByRole('img', { name: 'Last render' })).toHaveAttribute(
      'src',
      `${RENDER_HOST}/nocors/${real.fileName}`,
    );
  });
});
