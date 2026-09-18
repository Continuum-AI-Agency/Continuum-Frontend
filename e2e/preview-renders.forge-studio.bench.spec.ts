import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  type ApiRenderJob,
  apiRenderJobListQuerySchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
  apiRenderTemplateSummarySchema,
  templateSourceSchema,
  templateSourceSummarySchema,
} from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import {
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:studio:e2e:bench — preview-renders: every Forge preview draws the picked format at its
// true shape, and shows THAT format's rendered file.
//
// Fixtures mode, in a real Chrome with a real minted StarCraft session. The promo template is
// re-dressed as prod template 133: its contract publishes `outputs: []`, its formats live only in
// the parse and `template.ratios`, and its jobs carry the REAL fleet file names
// (`Producto_individual_con_descuento_16_9_9w5xxwa.jpg`, …) in a different order per job. Every
// file is a PNG of its format's true pixel size, so the image the browser decoded proves which
// file is on screen.
//
// For template detail, the Render tab preview pane (also dragged to its min and max) and job
// detail, at 1280×800 and 1920×1200, every format chip is clicked and graded:
//   (a) the frame's rect ratio is within 1% of the format's,
//   (b) the frame rect sits fully inside the well,
//   (c) the shown image's natural ratio matches within 1% and its src is that format's file,
//   (d) the badge names the source.
//
// Usage: cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3141 \
//   FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-preview \
//   bun run forge:studio:e2e:bench -- e2e/preview-renders.forge-studio.bench.spec.ts
// ---------------------------------------------------------------------------

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const RESULTS_PATH = join(tmpdir(), `forge-studio-preview-bench-${RUN_ID}.jsonl`);
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
] as const;

const TEMPLATE_KEY = FORGE_FIXTURE.promo.templateKey;
const TITLE = FORGE_FIXTURE.promo.title;
const COMP = 'Producto individual con descuento';
const SET = FORGE_FIXTURE.set;

type Format = { ratio: '16:9' | '1:1' | '9:16'; comp: string; width: number; height: number };
const FORMATS: Format[] = [
  { ratio: '16:9', comp: `${COMP} 16:9`, width: 1920, height: 1080 },
  { ratio: '1:1', comp: `${COMP} 1:1`, width: 1080, height: 1080 },
  { ratio: '9:16', comp: `${COMP} 9:16`, width: 1080, height: 1920 },
];
const SUFFIX: Record<Format['ratio'], string> = {
  '16:9': '9w5xxwa',
  '1:1': '1mjxxwb',
  '9:16': 'ooqxxwb',
};
const fileNameOf = (format: Format, job: string) =>
  `Producto_individual_con_descuento_${format.ratio.replace(':', '_')}_${SUFFIX[format.ratio]}${job}.png`;

// --- real-size images ----------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** A solid PNG of exactly `width`×`height`, so the decoded image proves its format. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): string {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const COLOUR: Record<Format['ratio'], [number, number, number]> = {
  '16:9': [37, 99, 235],
  '1:1': [22, 163, 74],
  '9:16': [217, 70, 239],
};
const IMAGE = Object.fromEntries(
  FORMATS.map((format) => [
    format.ratio,
    solidPng(format.width, format.height, COLOUR[format.ratio]),
  ]),
) as Record<Format['ratio'], string>;

// --- the template-133 dress ------------------------------------------------------------------

const box = (key: string, label: string, coords: [number, number, number, number]) => ({
  key,
  label,
  box: coords,
  role: null,
  kind: key === 'hero' ? ('image' as const) : ('text' as const),
});

/** Boxes in each comp's own pixels. */
const BOXES: Record<Format['ratio'], Array<ReturnType<typeof box>>> = {
  '16:9': [
    box('headline', 'Headline', [120, 90, 1100, 330]),
    box('hero', 'Hero image', [1150, 90, 1800, 990]),
  ],
  '1:1': [
    box('headline', 'Headline', [80, 90, 1000, 330]),
    box('hero', 'Hero image', [80, 470, 1000, 940]),
  ],
  '9:16': [
    box('headline', 'Headline', [80, 160, 1000, 520]),
    box('hero', 'Hero image', [80, 600, 1000, 1700]),
  ],
};

function templateSources(title: string) {
  return [
    templateSourceSchema.parse({
      assetId: FORGE_FIXTURE.promo.assetId,
      brandId: STARCRAFT_BRAND_ID,
      versionId: '8b2f5d3c-4e6a-4b7c-8d9e-1f2a3b4c5d6e',
      family: 'after_effects',
      parseState: 'parsed',
      parse: {
        parser: 'py_aep',
        sourceFamily: 'after_effects',
        appVersion: '25.2',
        filename: `${FORGE_FIXTURE.promo.assetId}.aep`,
        comps: FORMATS.map((format) => ({
          name: format.comp,
          width: format.width,
          height: format.height,
          layerCount: 14,
          isTop: true,
          isDelivery: true,
        })),
        ratios: FORMATS.map((format) => ({
          ratio: format.ratio,
          width: format.width,
          height: format.height,
          comps: [format.comp],
        })),
        slots: ['headline', 'hero'].map((key) => ({
          key,
          name: key === 'hero' ? 'Hero image' : 'Headline',
          kind: key === 'hero' ? 'image' : 'text',
          origin: 'essential' as const,
          driver: 'static' as const,
          comps: FORMATS.map((format) => format.comp),
          layerIds: [3],
          instances: FORMATS.map((format, index) => ({
            compId: index + 1,
            comp: format.comp,
            layerId: 3,
            box: [...BOXES[format.ratio].find((entry) => entry.key === key)!.box],
            compSize: [format.width, format.height],
          })),
        })),
        fonts: [{ family: 'HeadingNow-36CompBold', layers: 2 }],
        staticText: [],
        warnings: [],
      },
      fonts: ['HeadingNow-36CompBold'],
      ratios: FORMATS.map((format) => format.ratio),
      slotCount: 2,
      forgeRunId: 'run_sc_promo_v1',
      forgeState: 'published',
      templateKey: TEMPLATE_KEY,
      displayName: title,
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-14T09:00:00.000Z',
    }),
  ];
}

const summary = (title: string) =>
  apiRenderTemplateSummarySchema.parse({
    key: TEMPLATE_KEY,
    name: TEMPLATE_KEY,
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'sc-promo-v1-contract-hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: 2,
    previewUrl: null,
    updatedAt: '2026-09-14T09:00:00.000Z',
    ratios: FORMATS.map((format) => format.ratio),
    sourceAssetId: FORGE_FIXTURE.promo.assetId,
    fontsMissing: 0,
    displayName: title,
  });

const contract = (title: string) =>
  apiRenderTemplateContractSchema.parse({
    template: summary(title),
    variables: [
      { key: 'headline', label: 'Headline', kind: 'text', required: true, charBudget: 40 },
      { key: 'tagline', label: 'Tagline', kind: 'text', required: false },
      { key: 'price', label: 'Price', kind: 'number', required: false },
      { key: 'accent', label: 'Accent colour', kind: 'color', required: false },
      { key: 'hero', label: 'Hero image', kind: 'image', required: false },
    ],
    fonts: [{ family: 'HeadingNow-36CompBold', layers: 2, held: true }],
    // One comp's layout, as the forge publishes it: only 1:1 has a drawable estimate.
    layout: { comp: { name: FORMATS[1]!.comp, width: 1080, height: 1080 }, boxes: BOXES['1:1'] },
    // Template 133's live contract: no outputs. Formats come from the parse and the ratios only.
    outputs: [],
  });

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Seeded = { jobs: ApiRenderJob[]; newest: ApiRenderJob; stale: ApiRenderJob };

function seedJobs(fixtures: ForgeFixtures): Seeded {
  const rows = fixtures.state.sets[0]!.rows;
  const rowId = (label: string) => rows.find((row) => row.label === label)!.id;
  const revision = fixtures.state.sets[0]!.revision;
  const outputs = (order: Format['ratio'][], job: string) =>
    order.map((ratio) => {
      const format = FORMATS.find((entry) => entry.ratio === ratio)!;
      return {
        id: `${job}${ratio.replace(':', '')}0000000000000000`.slice(0, 24),
        kind: 'image' as const,
        fileName: fileNameOf(format, job),
        mimeType: 'image/png',
        url: IMAGE[ratio],
        width: null,
        height: null,
        assetId: null,
        versionId: null,
      };
    });
  const base = {
    brandId: STARCRAFT_BRAND_ID,
    templateKey: TEMPLATE_KEY,
    templateName: TITLE,
    contractHash: 'sc-promo-v1-contract-hash',
    taskUid: 'task_preview',
    status: 'finished' as const,
    delivery: [],
    error: null,
    renderSetId: SET.id,
    renderSetName: SET.name,
  };
  const frame = (
    output: { id: string; fileName: string },
    ratio: string,
    state: 'pass' | 'fail',
  ) => ({
    outputId: output.id,
    fileName: output.fileName,
    ratio,
    state,
    verdict: {
      overall: state,
      confidence: 0.9,
      findings:
        state === 'fail'
          ? [
              { kind: 'clipped', layerHint: 'Headline', severity: 'high' },
              { kind: 'occluded', layerHint: 'Hero image', severity: 'medium' },
            ]
          : [],
    },
    model: 'gemini-3.8-flash',
    level: 'high',
    votes: 1,
  });
  const newestOutputs = outputs(['16:9', '1:1', '9:16'], 'a');
  const newest = apiRenderJobSchema.parse({
    ...base,
    id: '0b6a1c1e-0000-4000-8000-00000000000a',
    label: SET.rows.launch,
    labelPath: [SET.rows.launch],
    renderSetRowId: rowId(SET.rows.launch),
    renderSetRevision: revision,
    createdAt: ago(2 * HOUR + 150_000),
    finishedAt: ago(2 * HOUR),
    updatedAt: ago(HOUR),
    outputs: newestOutputs,
    fit: {
      comp: { name: FORMATS[1]!.comp, width: 1080, height: 1080 },
      slots: [
        {
          key: 'hero',
          state: 'unknown',
          box: [80, 470, 1000, 940],
          why: 'placed by a rig in the template, which fits the asset at render time — checked on the finished frame',
        },
      ],
      escalate: true,
      why: '1 slot could not be measured — the finished frame goes to the judge',
    },
    judge: {
      state: 'fail',
      model: 'gemini-3.8-flash',
      level: 'high',
      votes: 1,
      judgedAt: ago(2 * HOUR - 60_000),
      frames: [
        frame(newestOutputs[0]!, '16:9', 'pass'),
        frame(newestOutputs[1]!, '1:1', 'pass'),
        frame(newestOutputs[2]!, '9:16', 'fail'),
      ],
    },
  });
  const stale = apiRenderJobSchema.parse({
    ...base,
    id: '0b6a1c1e-0000-4000-8000-00000000000b',
    label: SET.rows.root,
    labelPath: [SET.rows.root],
    renderSetRowId: rowId(SET.rows.root),
    renderSetRevision: revision - 1,
    createdAt: ago(26 * HOUR),
    finishedAt: ago(25 * HOUR),
    updatedAt: ago(25 * HOUR),
    outputs: outputs(['9:16', '16:9', '1:1'], 'b'),
  });
  const unset = apiRenderJobSchema.parse({
    ...base,
    id: '0b6a1c1e-0000-4000-8000-00000000000c',
    label: 'Canvas node',
    labelPath: ['Canvas node'],
    renderSetId: null,
    renderSetName: null,
    createdAt: ago(30 * HOUR),
    finishedAt: ago(29 * HOUR),
    updatedAt: ago(29 * HOUR),
    outputs: outputs(['1:1', '9:16', '16:9'], 'c'),
  });
  const otherTemplate = apiRenderJobSchema.parse({
    ...base,
    id: '0b6a1c1e-0000-4000-8000-00000000000d',
    templateKey: FORGE_FIXTURE.shared.templateKey,
    templateName: FORGE_FIXTURE.shared.displayName,
    label: 'Hatchery',
    labelPath: ['Hatchery'],
    renderSetName: 'Zerg teaser',
    renderSetId: null,
    createdAt: ago(HOUR),
    finishedAt: ago(HOUR),
    updatedAt: ago(HOUR),
    outputs: outputs(['1:1'], 'd'),
  });
  return { jobs: [newest, otherTemplate, stale, unset], newest, stale };
}

/** Answers the reads the 133 dress changes. Registered after the fixtures, so it wins. */
async function dressAsTemplate133(context: BrowserContext, fixtures: ForgeFixtures) {
  const seeded = seedJobs(fixtures);
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
      const title = fixtures.state.promoTitle;
      if (request.method() !== 'GET') return route.fallback();
      if (url.pathname === '/api/ai-studio/templates') {
        // The gallery list carries the compact parse, as the server sends it.
        const items = templateSources(title).map(({ parse, ...source }) =>
          templateSourceSummarySchema.parse({
            ...source,
            parse: parse && {
              parser: parse.parser,
              sourceFamily: parse.sourceFamily,
              filename: parse.filename,
              comps: parse.comps.map(({ name, width, height, isDelivery }) => ({
                name,
                width,
                height,
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
            },
          }),
        );
        return route.fulfill(json({ items }));
      }
      if (url.pathname === '/api/ai-studio/renders/templates') {
        return route.fulfill(
          json(
            apiRenderTemplateListResponseSchema.parse({
              items: [summary(title)],
              nextCursor: null,
            }),
          ),
        );
      }
      if (url.pathname === `/api/ai-studio/renders/templates/${TEMPLATE_KEY}/contract`) {
        return route.fulfill(json(contract(title)));
      }
      if (url.pathname === '/api/ai-studio/renders/jobs') {
        const query = apiRenderJobListQuerySchema.parse(Object.fromEntries(url.searchParams));
        const items = seeded.jobs
          .filter((job) => !query.templateKey || job.templateKey === query.templateKey)
          .filter((job) => !query.renderSetId || job.renderSetId === query.renderSetId)
          .filter((job) => !query.renderSetRowId || job.renderSetRowId === query.renderSetRowId)
          .filter((job) => !query.status || job.status === query.status)
          .slice(0, query.limit);
        return route.fulfill(
          json(apiRenderJobListResponseSchema.parse({ items, nextCursor: null })),
        );
      }
      const one = /^\/api\/ai-studio\/renders\/jobs\/([0-9a-f-]{36})$/.exec(url.pathname);
      const found = one ? seeded.jobs.find((job) => job.id === one[1]) : undefined;
      if (found) return route.fulfill(json(found));
      return route.fallback();
    },
  );
  return seeded;
}

// --- session, envelope -------------------------------------------------------------------------

let session: MintedSession | null = null;
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
  if (error) throw new Error(`[preview-bench] session brand pin failed: ${error.message}`);
}

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo, problem: unknown): void {
  const failed = problem !== null || testInfo.status !== 'passed';
  const grade: Grade = {
    step: testInfo.title,
    grade: failed ? 'FAIL' : 'PASS',
    ...(failed
      ? {
          detail: (problem instanceof Error ? problem.message : testInfo.error?.message)?.slice(
            0,
            500,
          ),
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
      spec: 'preview-renders',
      mode: 'fixtures',
      startedAt: new Date(Number(RUN_ID)).toISOString(),
      durationMs: Date.now() - Number(RUN_ID),
      results,
      notes: [
        'FIXTURES: every /api/ai-studio/** call answered in the browser; the promo template dressed as template 133 (contract outputs [], real fleet file names, true-size PNGs). The backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the render fleet and the judge itself — their outputs are seeded, parsed through the real contracts.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

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
  printEnvelope();
});

// --- page helpers --------------------------------------------------------------------------------

async function openForge(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; seeded: Seeded }> {
  if (!session) throw new Error('[preview-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);
  const seeded = await dressAsTemplate133(context, fixtures);
  const page = await context.newPage();
  // An action that cannot happen fails with its reason, never as a silent five-minute timeout.
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => console.log(`[preview-bench] page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[preview-bench] console error: ${message.text().slice(0, 300)}`);
    }
  });
  await page.goto('/forge', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  return { page, seeded };
}

const openTab = async (page: Page, name: 'Templates' | 'Render' | 'Render ledger') => {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
};

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `preview-${name}.png`) }).catch(() => undefined);
}

type Measured = {
  frame: {
    width: number;
    height: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  well: { left: number; top: number; right: number; bottom: number };
  image: { src: string; natural: number } | null;
  badge: string;
};

/** The frame, the well and the decoded image of one preview, read in one pass. */
const measure = (preview: Locator): Promise<Measured> =>
  preview.evaluate((root) => {
    const rect = (element: Element | null) => {
      const r = element?.getBoundingClientRect();
      return r
        ? {
            width: r.width,
            height: r.height,
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
          }
        : { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };
    };
    const img = root.querySelector(
      '[data-slot="format-preview-frame"] img',
    ) as HTMLImageElement | null;
    return {
      frame: rect(root.querySelector('[data-slot="format-preview-frame"]')),
      well: rect(root.querySelector('[data-slot="format-preview-well"]')),
      image:
        img && img.naturalHeight
          ? { src: img.currentSrc || img.src, natural: img.naturalWidth / img.naturalHeight }
          : null,
      badge: root.querySelector('[data-slot="format-preview-badge"]')?.textContent ?? '',
    };
  });

const within1 = (actual: number, expected: number) => Math.abs(actual / expected - 1) <= 0.01;

/**
 * Click every chip of one preview and grade (a)–(d). `chipName` is the chip's accessible name;
 * `file` is the format's expected file URL, or null where the preview must NOT show a file.
 */
async function gradeEveryChip(
  page: Page,
  preview: Locator,
  label: string,
  chips: Array<{ name: string; format: Format; file: string | null; badge: RegExp }>,
): Promise<void> {
  for (const chip of chips) {
    const button = preview.getByRole('button', { name: chip.name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    if (chip.file) {
      await expect
        .poll(async () => (await measure(preview)).image?.src ?? '', { timeout: 15_000 })
        .toBe(chip.file);
    }
    const shown = await measure(preview);
    const target = chip.format.width / chip.format.height;
    const tag = `${label} ${chip.format.ratio}`;
    console.log(
      `[preview-bench] ${tag} frame ${shown.frame.width.toFixed(1)}×${shown.frame.height.toFixed(1)} ` +
        `well ${(shown.well.right - shown.well.left).toFixed(0)}×${(shown.well.bottom - shown.well.top).toFixed(0)} ` +
        `image ${shown.image?.natural.toFixed(4) ?? 'none'} badge "${shown.badge}"`,
    );
    expect(shown.frame.width, `${tag}: the frame is laid out`).toBeGreaterThan(20);
    expect(within1(shown.frame.width / shown.frame.height, target), `${tag}: (a) frame ratio`).toBe(
      true,
    );
    expect(
      shown.frame.left >= shown.well.left - 0.5 &&
        shown.frame.top >= shown.well.top - 0.5 &&
        shown.frame.right <= shown.well.right + 0.5 &&
        shown.frame.bottom <= shown.well.bottom + 0.5,
      `${tag}: (b) frame inside the well`,
    ).toBe(true);
    if (chip.file) {
      expect(shown.image, `${tag}: (c) a decoded image`).not.toBeNull();
      expect(within1(shown.image!.natural, target), `${tag}: (c) image natural ratio`).toBe(true);
      expect(shown.image!.src, `${tag}: (c) that format's file`).toBe(chip.file);
    } else {
      expect(shown.image, `${tag}: (c) no file shown for a format with none`).toBeNull();
    }
    expect(shown.badge, `${tag}: (d) badge`).toMatch(chip.badge);
  }
}

const RENDERED_RECENTLY = /^Rendered · 2h ago$/;

// --- the run -------------------------------------------------------------------------------------

test.describe('Forge previews — true shape, that format’s file', () => {
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

  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;

    test(`P1 · template detail at ${size}: every chip draws its format and its file; renders list this template only`, async ({
      browser,
    }) => {
      const { page, seeded } = await openForge(browser, viewport);
      await page.getByRole('button', { name: `Open ${TITLE}`, exact: true }).click();
      const preview = page.getByRole('group', { name: 'Template preview' });
      await expect(preview).toBeVisible();
      const fileOf = (job: ApiRenderJob, format: Format) =>
        job.outputs.find((output) =>
          output.fileName.includes(`_${format.ratio.replace(':', '_')}_`),
        )!.url;

      await gradeEveryChip(
        page,
        preview,
        `template-detail@${size}`,
        FORMATS.map((format) => ({
          name: format.comp,
          format,
          file: fileOf(seeded.newest, format),
          badge: RENDERED_RECENTLY,
        })),
      );
      await shoot(page, `template-detail-${size}`);

      // The estimate of the same format, when a person asks for it.
      await preview.getByRole('button', { name: 'Estimate', exact: true }).click();
      await expect(preview.locator('[data-slot="format-preview-badge"]')).toHaveText(
        'Estimate · wireframe',
      );
      await expect(preview.getByRole('img', { name: '9:16 layout' })).toBeVisible();
      await preview.getByRole('button', { name: 'Rendered', exact: true }).click();

      // Renders: this template's jobs only, grouped by set, newest first.
      const renders = page.getByRole('region', { name: 'Renders' });
      await expect(renders.getByRole('button', { name: new RegExp(SET.name) })).toBeVisible();
      await expect(renders.getByRole('button', { name: /No set/ })).toBeVisible();
      await expect(renders.getByText('Hatchery')).toHaveCount(0);
      await expect(renders.getByText(SET.rows.launch, { exact: true })).toBeVisible();
      await renders.scrollIntoViewIfNeeded();
      await shoot(page, `template-renders-${size}`);

      // Opening one shows job detail in place, with the judge naming all three formats.
      await renders.getByText(SET.rows.launch, { exact: true }).click();
      await expect(page.getByRole('heading', { level: 2, name: SET.rows.launch })).toBeVisible();
      const judge = page
        .getByRole('list', { name: 'Checks' })
        .getByRole('listitem')
        .filter({ hasText: /^.*Judge/ })
        .last();
      await expect(judge).toContainText('16:9 ✓ · 1:1 ✓ · 9:16 ✗ 2 problems');
      const detail = page.getByRole('group', { name: 'Render preview' });
      await gradeEveryChip(
        page,
        detail,
        `template-job-detail@${size}`,
        FORMATS.map((format) => ({
          name: format.comp,
          format,
          file: fileOf(seeded.newest, format),
          badge: RENDERED_RECENTLY,
        })),
      );
      await judge.getByRole('button', { name: 'Judge details' }).click();
      await expect(judge).toContainText('9:16: Headline is cut off at the edge');
      await shoot(page, `job-detail-${size}`);
    });

    test(`P2 · Render tab preview pane at ${size}: every chip, then dragged to its min and max`, async ({
      browser,
    }) => {
      const { page, seeded } = await openForge(browser, viewport);
      await openTab(page, 'Render');
      const launch = page.getByRole('row').filter({
        has: page.getByRole('button', { name: `Drag ${SET.rows.launch}`, exact: true }),
      });
      await expect(launch).toBeVisible({ timeout: 60_000 });
      await launch.getByRole('cell').last().click();
      const preview = page.getByRole('group', { name: 'Row preview' });
      await expect(preview).toBeVisible();
      const chips = (job: ApiRenderJob, badge: RegExp) =>
        FORMATS.map((format) => ({
          name: format.ratio,
          format,
          file: job.outputs.find((output) =>
            output.fileName.includes(`_${format.ratio.replace(':', '_')}_`),
          )!.url,
          badge,
        }));

      await gradeEveryChip(
        page,
        preview,
        `render-pane@${size}`,
        chips(seeded.newest, RENDERED_RECENTLY),
      );
      await shoot(page, `render-pane-${size}`);

      // The pane is resizable: the frame must still fit both axes at either end of the handle.
      const handle = page
        .locator('[data-slot="resizable-panel"]')
        .filter({ has: preview })
        .last()
        .locator('xpath=preceding-sibling::*[@data-slot="resizable-handle"][1]');
      for (const [end, dx] of [
        ['max', -viewport.width],
        ['min', viewport.width],
      ] as const) {
        const grip = await handle.boundingBox();
        expect(grip, 'the preview pane has a resize handle').not.toBeNull();
        await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip!.x + dx, grip!.y + grip!.height / 2, { steps: 12 });
        await page.mouse.up();
        await gradeEveryChip(
          page,
          preview,
          `render-pane-${end}@${size}`,
          chips(seeded.newest, RENDERED_RECENTLY),
        );
        await shoot(page, `render-pane-${end}-${size}`);
      }

      // A row whose last render predates the set's current revision says so.
      const root = page
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: `Drag ${SET.rows.root}`, exact: true }) });
      await root.getByRole('cell').last().click();
      // A stale row opens on its repainted Preview; its own (older) render is one toggle away.
      await preview
        .getByRole('group', { name: 'Picture' })
        .getByRole('button', { name: 'Rendered', exact: true })
        .click();
      await gradeEveryChip(
        page,
        preview,
        `render-pane-stale@${size}`,
        chips(seeded.stale, /^Rendered · before latest edits$/),
      );
    });

    test(`P3 · Render ledger job detail at ${size}: every chip shows that format's file`, async ({
      browser,
    }) => {
      const { page, seeded } = await openForge(browser, viewport);
      await openTab(page, 'Render ledger');
      const ledger = page.getByRole('tabpanel', { name: 'Render ledger' });
      await ledger.getByText(SET.rows.root, { exact: true }).click();
      await expect(page.getByRole('heading', { level: 2, name: SET.rows.root })).toBeVisible();
      const detail = page.getByRole('group', { name: 'Render preview' });
      await gradeEveryChip(
        page,
        detail,
        `ledger-job-detail@${size}`,
        FORMATS.map((format) => ({
          // The contract publishes `outputs: []`; the gallery's cached parse names the comps.
          name: format.comp,
          format: { ...format },
          file: seeded.stale.outputs.find((output) =>
            output.fileName.includes(`_${format.ratio.replace(':', '_')}_`),
          )!.url,
          badge: /^Rendered · 1d ago$/,
        })),
      );
      await shoot(page, `ledger-job-detail-${size}`);
    });
  }
});
