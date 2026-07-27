import { createNodeData, getAspectRatioValue } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { nodeIsStale } from '../src/StudioCanvas/utils/generationSignature';
import { mintSessionWithPassword } from './support/auth';

// AI Studio canvas geometry + composer bench (Airtable #229, #230, #232, #224, #222, #221).
//
// Drives the REAL code path across its real boundaries: nodes are written to the real local
// Postgres (`brand_profiles.canvas_sessions`), loaded by the real canvas through
// `useCanvasRealtime`, re-signed against real Supabase storage holding real PNG bytes, and
// LAID OUT BY A REAL BROWSER. The composer turn is a real NDJSON stream from the real Backend
// agent — no route stub, no hand-written frames.
//
// Every claim in this file is a MEASUREMENT. The unit benches for this batch
// (e2e/studio-geometry.bench.ts, node-sizing.test.ts) prove the numbers the creation helpers
// COMPUTE; happy-dom does no layout, so nothing before this bench had ever seen a node's
// rendered box. Expected ratios here are derived from the ratio STRING (`getAspectRatioValue`),
// never from `generatorNodeStyle` — asserting the sizing helper against itself would prove
// nothing.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Frontend on :3001 and Backend on :4000, both on the LOCAL stack:
//     bun run dev:fe:local-supabase   (PORT=3001)
//     bun run dev:be:local-supabase
//   :3000 belongs to another project on this machine, and Continuum-Backend/App/cors.ts
//   allowlists 3000/3001/3002 only — a port outside that set fails CORS, not auth.
//   Run with: bun run studio:canvas:e2e:bench
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · Real Vertex/Veo generation. #221 asserts that the upstream image is never RE-RUN; the
//     downstream video run it triggers reaches the Backend and is expected to fail there for
//     want of cloud credentials on a dev machine. The regeneration SET is resolved before any
//     network call, so the claim is sound — but no pixel was ever generated here.
//   · Aesthetic judgement. #229's chip placement and #224's wrapped header are asserted
//     GEOMETRICALLY (containment, no overlap, no horizontal overflow). Whether the result
//     LOOKS right is a human call: the screenshots in e2e/__screenshots__/studio-canvas-geometry
//     are attached for sign-off and are not a substitute for it.
//   · The composer agent's authoring QUALITY. #222 proves Run starts an execution and Dismiss
//     retires the card; whether the graph the agent wrote is a GOOD graph is not asserted.
//   · Persisted-geometry migration. Pre-existing 9:16 nodes saved with a landscape box stay
//     landscape by design (approved: no migration, no autosave write-back), so this bench
//     seeds nodes through the real creation path rather than proving old rows self-heal.
//   · Every generator type. The seeded set is videoGen + nanoGen; veoDirector/veoFast/omniGen
//     share the same `nodeStyleFor` branch and are covered only by the pure bench.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
// The RFC-4122-valid fixture brand. The legacy fixture brand (…0000b1) has a zero version
// nibble, which the Backend's `z.uuid()` rejects outright.
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const GEOMETRY_ROOM_ID = '00000000-0000-4000-8000-00000000ca01';
const COMPOSER_ROOM_ID = '00000000-0000-4000-8000-00000000ca02';
const BENCH_ROOM_IDS = [GEOMETRY_ROOM_ID, COMPOSER_ROOM_ID];

const BUCKET = 'brand-profile-assets';
const SCREENSHOT_DIR =
  process.env.STUDIO_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/studio-canvas-geometry';

// A real 40x10 PNG — a 4:1 natural ratio that matches NO node box in this bench, so
// "letterboxed, not crop-zoomed" is a claim with something to prove.
const PNG_40x10 =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAIAAABJ+IsHAAAAHUlEQVR4nGM4YRM1IIhh1OLRoB5NXKPZyYbMMAAAZ70i/ynnDXAAAAAASUVORK5CYII=';
const PNG_NATURAL_RATIO = 40 / 10;

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

type Box = { x: number; y: number; width: number; height: number };

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[studio:canvas:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function brandProfiles(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema('brand_profiles');
}

// ── the sig1 recipe, spelled out ────────────────────────────────────────────────
//
// #221 self-heals: a node whose sig1 signature triggered one spurious regeneration is
// stamped sig2 afterwards and never reproduces. A bench that seeds a sig2 node proves
// nothing. This rebuilds the sig1 signature INDEPENDENTLY of generationSignature.ts (whose
// own sig1 table is the thing under test) so a seeded node is stamped exactly as a node
// generated before the version bump was.
const SIG1_NANO_FIELDS = [
  'positivePrompt',
  'model',
  'aspectRatio',
  'imageSize',
  'stylePreset',
  'skillIds',
  'seed',
  'steps',
  'guidance',
  'scheduler',
  'promptEnhancement',
] as const;

function serializeSignatureValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return [...value].map(serializeSignatureValue).sort().join(',');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sig1SignatureForNanoGen(data: Record<string, unknown>): string {
  const own = SIG1_NANO_FIELDS.map(
    (field) => `${field}=${serializeSignatureValue(data[field])}`,
  ).join('|');
  return `sig1:nanoGen|${own}|refs()`;
}

// ── seeded graph ────────────────────────────────────────────────────────────────

const LETTERBOX_PATH = `${BRAND_ID}/studio-bench/letterbox-40x10.png`;
const SIG1_PATH = `${BRAND_ID}/studio-bench/sig1-upstream-40x10.png`;

const RATIO_CASES = [
  { id: 'bench-video-169', type: 'videoGen' as const, ratio: '16:9', x: 0, y: 0 },
  { id: 'bench-video-916', type: 'videoGen' as const, ratio: '9:16', x: 700, y: 0 },
  { id: 'bench-image-45', type: 'nanoGen' as const, ratio: '4:5', x: 1200, y: 0 },
];

const LETTERBOX_ID = 'bench-image-letterbox';
const SIG1_IMAGE_ID = 'bench-sig1-image';
const SIG1_VIDEO_ID = 'bench-sig1-video';

type SeededNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: Record<string, number>;
  width?: number;
  height?: number;
};

function makeNode(
  id: string,
  type: string,
  position: { x: number; y: number },
  overrides: Record<string, unknown>,
): SeededNode {
  // The REAL creation path — the same helper the canvas add menu, the edge-drop menu, the
  // planner starter and the agent writer all call. Hand-writing `style` here would seed the
  // very hardcode #230 was about.
  const created = createNodeData(type as Parameters<typeof createNodeData>[0], overrides);
  const style = created.style;
  return {
    id,
    type,
    position,
    data: created.data,
    ...(style ? { style, width: style.width, height: style.height } : {}),
  };
}

function buildGeometryGraph(): { nodes: SeededNode[]; edges: unknown[] } {
  const nodes: SeededNode[] = RATIO_CASES.map((testCase) =>
    makeNode(
      testCase.id,
      testCase.type,
      { x: testCase.x, y: testCase.y },
      {
        aspectRatio: testCase.ratio,
        ...(testCase.type === 'nanoGen'
          ? { positivePrompt: `bench ${testCase.ratio}` }
          : { prompt: `bench ${testCase.ratio}` }),
      },
    ),
  );

  // #232's crop victim: a 4:1 image inside a 16:9 box. The removed Radix AspectRatio sized
  // itself from the WIDTH inside an overflow-hidden card, so the content computed taller than
  // its box and got clipped — "come too zoomed".
  const letterbox = makeNode(
    LETTERBOX_ID,
    'nanoGen',
    { x: 1600, y: 0 },
    {
      aspectRatio: '16:9',
      positivePrompt: 'bench letterbox subject',
      generatedImageStoragePath: LETTERBOX_PATH,
      generatedImageBucket: BUCKET,
    },
  );
  nodes.push(letterbox);

  // #221's fixture: an upstream image stamped with a sig1 signature that is CORRECT for its
  // own settings, feeding a video generator with no output of its own.
  const sig1Image = makeNode(
    SIG1_IMAGE_ID,
    'nanoGen',
    { x: 0, y: 800 },
    {
      aspectRatio: '1:1',
      positivePrompt: 'a ceramic mug on a windowsill, morning light',
      generatedImageStoragePath: SIG1_PATH,
      generatedImageBucket: BUCKET,
    },
  );
  sig1Image.data.generationSignature = sig1SignatureForNanoGen(sig1Image.data);
  nodes.push(sig1Image);

  const sig1Video = makeNode(
    SIG1_VIDEO_ID,
    'videoGen',
    { x: 600, y: 800 },
    {
      aspectRatio: '16:9',
      prompt: 'the mug steams gently as the light moves across it',
    },
  );
  nodes.push(sig1Video);

  return {
    nodes,
    edges: [
      {
        id: 'bench-edge-sig1',
        source: SIG1_IMAGE_ID,
        target: SIG1_VIDEO_ID,
        sourceHandle: 'image',
        targetHandle: 'image',
      },
    ],
  };
}

async function seedRoom(
  supabase: SupabaseClient,
  roomId: string,
  name: string,
  graph: { nodes: unknown[]; edges: unknown[] },
): Promise<void> {
  await brandProfiles(supabase)
    .from('canvas_rooms')
    .upsert(
      { id: roomId, brand_profile_id: BRAND_ID, name, created_by: OWNER_ID },
      { onConflict: 'id' },
    )
    .throwOnError();

  await brandProfiles(supabase)
    .from('canvas_sessions')
    .upsert(
      {
        brand_profile_id: BRAND_ID,
        room_id: roomId,
        nodes: graph.nodes,
        edges: graph.edges,
        deleted_node_ids: [],
        deleted_edge_ids: [],
        // A fresh writer identity: the canvas ignores realtime echoes of its OWN session id.
        editor_session_id: crypto.randomUUID(),
        editor_user_id: OWNER_ID,
      },
      { onConflict: 'brand_profile_id,room_id' },
    )
    .throwOnError();
}

async function purgeBenchRooms(supabase: SupabaseClient): Promise<void> {
  // canvas_sessions cascades on the room FK.
  await brandProfiles(supabase).from('canvas_rooms').delete().in('id', BENCH_ROOM_IDS);
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

// ── DOM measurement helpers ─────────────────────────────────────────────────────

const nodeBox = (page: Page, nodeId: string) =>
  page.locator(`.react-flow__node[data-id="${nodeId}"]`);

/**
 * Layout px, not screen px. `boundingBox()` is multiplied by the React Flow viewport's
 * `scale()`, so raw numbers there are unreadable; ratios survive a uniform scale but exact
 * dimensions do not. `offsetWidth/offsetHeight` read the element's own resolved box.
 */
async function layoutSize(
  page: Page,
  selector: string,
): Promise<{ width: number; height: number }> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => ({
      width: (el as HTMLElement).offsetWidth,
      height: (el as HTMLElement).offsetHeight,
    }));
}

function contains(outer: Box, inner: Box, slackPx = 1): boolean {
  return (
    inner.x >= outer.x - slackPx &&
    inner.y >= outer.y - slackPx &&
    inner.x + inner.width <= outer.x + outer.width + slackPx &&
    inner.y + inner.height <= outer.y + outer.height + slackPx
  );
}

function intersects(a: Box, b: Box, slackPx = 1): boolean {
  return (
    a.x + a.width - slackPx > b.x &&
    b.x + b.width - slackPx > a.x &&
    a.y + a.height - slackPx > b.y &&
    b.y + b.height - slackPx > a.y
  );
}

async function requireBox(page: Page, selector: string, index = 0): Promise<Box> {
  const box = await page.locator(selector).nth(index).boundingBox();
  if (!box) throw new Error(`[studio:canvas:e2e:bench] no bounding box for ${selector}[${index}]`);
  return box;
}

async function openCanvas(page: Page, roomId: string): Promise<void> {
  await page.goto(`/ai-studio?roomId=${roomId}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByTestId('studio-canvas-header')).toBeVisible({ timeout: 120_000 });
}

test.describe('ai studio canvas geometry', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'needs the local Supabase stack — bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let context: BrowserContext | null = null;
  let page: Page;
  let previousActiveBrandId: string | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    const supabase = admin();

    const { data: pref } = await brandProfiles(supabase)
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;
    await setActiveBrand(supabase, BRAND_ID);

    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (bucketError && !/already exists/i.test(bucketError.message)) {
      throw new Error(`[studio:canvas:e2e:bench] bucket ${BUCKET}: ${bucketError.message}`);
    }
    const bytes = Buffer.from(PNG_40x10, 'base64');
    for (const path of [LETTERBOX_PATH, SIG1_PATH]) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'image/png', upsert: true });
      if (error) throw new Error(`[studio:canvas:e2e:bench] upload ${path}: ${error.message}`);
    }

    await purgeBenchRooms(supabase);
    await seedRoom(supabase, GEOMETRY_ROOM_ID, 'Bench Geometry', buildGeometryGraph());
    await seedRoom(supabase, COMPOSER_ROOM_ID, 'Bench Composer', { nodes: [], edges: [] });

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    await context?.close();
    const supabase = admin();
    await purgeBenchRooms(supabase);
    await supabase.storage.from(BUCKET).remove([LETTERBOX_PATH, SIG1_PATH]);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('#230 a 9:16 node renders PORTRAIT and 16:9 renders landscape — the boxes differ', async () => {
    await openCanvas(page, GEOMETRY_ROOM_ID);
    await expect(nodeBox(page, 'bench-video-916')).toBeVisible({ timeout: 60_000 });

    const measured: Record<string, { box: Box; layout: { width: number; height: number } }> = {};
    for (const testCase of RATIO_CASES) {
      const selector = `.react-flow__node[data-id="${testCase.id}"]`;
      measured[testCase.id] = {
        box: await requireBox(page, selector),
        layout: await layoutSize(page, selector),
      };
    }

    for (const testCase of RATIO_CASES) {
      const { box, layout } = measured[testCase.id];
      const expected = getAspectRatioValue(testCase.ratio);
      const renderedRatio = box.width / box.height;
      // One pixel of slack on a ~300px box is ~0.007 of ratio; the min-width clamp on a 9:16
      // video node (300x533 rather than 288x512) costs another ~0.0004. 0.02 covers both and
      // is nowhere near wide enough to let a landscape box pass as portrait (1.78 vs 0.56).
      expect(
        Math.abs(renderedRatio - expected),
        `${testCase.type} ${testCase.ratio} rendered ${layout.width}x${layout.height} (ratio ${renderedRatio.toFixed(4)}, expected ${expected.toFixed(4)})`,
      ).toBeLessThan(0.02);
    }

    // The headline claim, in the tester's own terms: 9:16 and 16:9 do NOT look the same.
    const portrait = measured['bench-video-916'].layout;
    const landscape = measured['bench-video-169'].layout;
    expect(portrait.height, `9:16 measured ${portrait.width}x${portrait.height}`).toBeGreaterThan(
      portrait.width,
    );
    expect(landscape.width, `16:9 measured ${landscape.width}x${landscape.height}`).toBeGreaterThan(
      landscape.height,
    );
    const fourFive = measured['bench-image-45'].layout;
    expect(fourFive.height, `4:5 measured ${fourFive.width}x${fourFive.height}`).toBeGreaterThan(
      fourFive.width,
    );

    console.log(
      '[#230] rendered boxes:',
      RATIO_CASES.map(
        (c) =>
          `${c.type} ${c.ratio} = ${measured[c.id].layout.width}x${measured[c.id].layout.height} (${(measured[c.id].box.width / measured[c.id].box.height).toFixed(4)})`,
      ).join(' · '),
    );

    await page.screenshot({ path: `${SCREENSHOT_DIR}/nodes-per-ratio.png` });
  });

  test('#232 the ratio survives a resize drag, and generated media is letterboxed not cropped', async () => {
    await openCanvas(page, GEOMETRY_ROOM_ID);

    const target = nodeBox(page, 'bench-video-916');
    await expect(target).toBeVisible({ timeout: 60_000 });

    // NodeResizer only mounts on a selected node.
    await target.click({ position: { x: 20, y: 20 } });
    const handle = target.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(handle).toBeVisible({ timeout: 20_000 });

    const before = await layoutSize(page, '.react-flow__node[data-id="bench-video-916"]');
    const handleBox = await requireBox(
      page,
      '.react-flow__node[data-id="bench-video-916"] .react-flow__resize-control.handle.bottom.right',
    );

    // Drag the corner OUT along x only. Without keepAspectRatio the height would not follow
    // and the box would flatten toward landscape — the #232 report.
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    const ratiosDuringDrag: number[] = [];
    for (const step of [30, 60, 90, 120]) {
      await page.mouse.move(
        handleBox.x + handleBox.width / 2 + step,
        handleBox.y + handleBox.height / 2 + step * 0.25,
        { steps: 4 },
      );
      const mid = await layoutSize(page, '.react-flow__node[data-id="bench-video-916"]');
      ratiosDuringDrag.push(mid.width / mid.height);
    }
    await page.mouse.up();

    const after = await layoutSize(page, '.react-flow__node[data-id="bench-video-916"]');
    const expected = getAspectRatioValue('9:16');

    expect(
      after.width,
      `drag did not resize the node (before ${before.width}x${before.height}, after ${after.width}x${after.height})`,
    ).toBeGreaterThan(before.width);

    for (const ratio of [...ratiosDuringDrag, after.width / after.height]) {
      expect(
        Math.abs(ratio - expected),
        `ratio during/after drag: ${ratiosDuringDrag.map((r) => r.toFixed(4)).join(', ')} → ${(after.width / after.height).toFixed(4)} (expected ${expected.toFixed(4)}); box went ${before.width}x${before.height} → ${after.width}x${after.height}`,
      ).toBeLessThan(0.02);
    }

    console.log(
      `[#232] resize drag: ${before.width}x${before.height} → ${after.width}x${after.height}; ratios ${[...ratiosDuringDrag, after.width / after.height].map((r) => r.toFixed(4)).join(' → ')}`,
    );

    // The generated 4:1 image inside a 16:9 node: it must FIT, not overflow.
    const letterboxNode = nodeBox(page, LETTERBOX_ID);
    await expect(letterboxNode).toBeVisible({ timeout: 30_000 });
    const img = letterboxNode.locator('img');
    await expect
      .poll(
        async () =>
          img.evaluateAll((els) => els.some((el) => (el as HTMLImageElement).naturalWidth > 0)),
        { timeout: 60_000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);

    const outerBox = await requireBox(page, `.react-flow__node[data-id="${LETTERBOX_ID}"]`);
    const previewBox = await requireBox(
      page,
      `.react-flow__node[data-id="${LETTERBOX_ID}"] [data-testid="studio-node-preview"]`,
    );
    const imgBox = await requireBox(page, `.react-flow__node[data-id="${LETTERBOX_ID}"] img`);

    expect(
      contains(outerBox, previewBox),
      `preview ${JSON.stringify(previewBox)} escapes node ${JSON.stringify(outerBox)}`,
    ).toBe(true);
    expect(
      contains(previewBox, imgBox),
      `img ${JSON.stringify(imgBox)} escapes preview ${JSON.stringify(previewBox)}`,
    ).toBe(true);

    // Letterboxed, not crop-zoomed: `contain` fits the whole frame inside the box; `cover`
    // would fill it by cutting the sides off, which is what "come too zoomed" described.
    const objectFit = await page
      .locator(`.react-flow__node[data-id="${LETTERBOX_ID}"] img`)
      .first()
      .evaluate((el) => getComputedStyle(el).objectFit);
    expect(objectFit).toBe('contain');

    const natural = await page
      .locator(`.react-flow__node[data-id="${LETTERBOX_ID}"] img`)
      .first()
      .evaluate((el) => ({
        w: (el as HTMLImageElement).naturalWidth,
        h: (el as HTMLImageElement).naturalHeight,
      }));
    expect(natural.w / natural.h).toBeCloseTo(PNG_NATURAL_RATIO, 2);

    console.log(
      `[#232] letterbox node ${outerBox.width.toFixed(0)}x${outerBox.height.toFixed(0)}, preview ${previewBox.width.toFixed(0)}x${previewBox.height.toFixed(0)}, img ${imgBox.width.toFixed(0)}x${imgBox.height.toFixed(0)} natural ${natural.w}x${natural.h}, object-fit=${objectFit}`,
    );

    await page.screenshot({ path: `${SCREENSHOT_DIR}/resize-and-letterbox.png` });
  });

  test('#229 the grounding chip sits INSIDE its node — with a screenshot for human sign-off', async () => {
    await openCanvas(page, GEOMETRY_ROOM_ID);

    const chipHosts = [...RATIO_CASES.map((c) => c.id), LETTERBOX_ID];
    const report: string[] = [];

    for (const nodeId of chipHosts) {
      const node = nodeBox(page, nodeId);
      await expect(node).toBeVisible({ timeout: 30_000 });
      const chip = node.locator('[data-testid="studio-grounding-chip"]');
      if ((await chip.count()) === 0) continue;

      const outer = await requireBox(page, `.react-flow__node[data-id="${nodeId}"]`);
      const chipBox = await requireBox(
        page,
        `.react-flow__node[data-id="${nodeId}"] [data-testid="studio-grounding-chip"]`,
      );
      const overhangTop = outer.y - chipBox.y;
      report.push(`${nodeId}: chip top overhang ${overhangTop.toFixed(1)}px`);
      expect(
        contains(outer, chipBox),
        `grounding chip ${JSON.stringify(chipBox)} is not contained by node ${JSON.stringify(outer)} (top overhang ${overhangTop.toFixed(1)}px)`,
      ).toBe(true);
    }

    expect(
      report.length,
      'no grounding chip was rendered on any seeded generator node',
    ).toBeGreaterThan(0);
    console.log(`[#229] ${report.join(' · ')}`);

    // The placement itself (inside the card at left-2 top-2, translucent backdrop) is a
    // JUDGEMENT CALL. Containment is measurable; "looks right" is not. Sign-off wanted.
    await page.screenshot({ path: `${SCREENSHOT_DIR}/grounding-chip-placement.png` });
    const chipNode = nodeBox(page, RATIO_CASES[0].id);
    await chipNode.screenshot({ path: `${SCREENSHOT_DIR}/grounding-chip-closeup.png` });
  });

  test('#221 a sig1-stamped upstream image is NOT regenerated by a downstream video run', async () => {
    await openCanvas(page, GEOMETRY_ROOM_ID);

    const imageNode = nodeBox(page, SIG1_IMAGE_ID);
    const videoNode = nodeBox(page, SIG1_VIDEO_ID);
    await expect(imageNode).toBeVisible({ timeout: 60_000 });
    await expect(videoNode).toBeVisible({ timeout: 60_000 });

    // Fixture validity, asserted before the run: the seeded signature really is a sig1
    // signature that the CURRENT build reads as fresh. Without this guard a typo in the
    // recipe above would make the bench pass for the wrong reason.
    const seeded = buildGeometryGraph();
    const seededNodes = seeded.nodes;
    const byId = new Map(seededNodes.map((n) => [n.id, n as never]));
    const seededImage = seededNodes.find((n) => n.id === SIG1_IMAGE_ID);
    if (!seededImage) throw new Error('fixture image node missing');
    expect(String(seededImage.data.generationSignature).startsWith('sig1:')).toBe(true);
    expect(
      nodeIsStale(seededImage as never, seeded.edges as never, byId),
      `seeded sig1 signature reads as STALE — the fixture would prove nothing: ${seededImage.data.generationSignature}`,
    ).toBe(false);
    // ...and the mechanism still detects a real edit under sig1.
    const editedImage = {
      ...seededImage,
      data: { ...seededImage.data, positivePrompt: 'a completely different subject' },
    };
    expect(
      nodeIsStale(editedImage as never, seeded.edges as never, byId),
      'an EDITED sig1 node reads as fresh — staleness detection is broken, not tolerant',
    ).toBe(true);

    // Pixel truth before the run: the upstream image re-signed and decoded.
    const imageSelector = `.react-flow__node[data-id="${SIG1_IMAGE_ID}"] img`;
    await expect
      .poll(
        async () =>
          page
            .locator(imageSelector)
            .evaluateAll((els) => els.some((el) => (el as HTMLImageElement).naturalWidth > 0)),
        { timeout: 60_000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);
    const srcBefore = await page.locator(imageSelector).first().getAttribute('src');

    // A post-hoc `toHaveCount(0)` can race past a fast failure, so watch the subtree for the
    // whole run instead of sampling it.
    await page.evaluate((nodeId) => {
      const w = window as unknown as { __benchGenerating?: Record<string, number> };
      w.__benchGenerating = { upstream: 0 };
      const host = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
      if (!host) throw new Error('upstream node not in DOM');
      const observer = new MutationObserver(() => {
        if (host.querySelector('[aria-label="Generating media"]')) {
          const state = w.__benchGenerating;
          if (state) state.upstream += 1;
        }
      });
      observer.observe(host, { childList: true, subtree: true, attributes: true });
    }, SIG1_IMAGE_ID);

    // Run the VIDEO node only. `targetNodeId` scopes execution to its upstream closure, which
    // is exactly the image + the video — so if the image is regenerated, it is regenerated here.
    await videoNode.hover();
    const runButton = page.locator('.react-flow__node-toolbar [title="Run Node"]').first();
    await expect(runButton).toBeVisible({ timeout: 20_000 });
    await runButton.click();

    // The video node itself DOES start — proof the run happened at all rather than being
    // blocked by preflight, which would make the negative assertion vacuous.
    await expect(
      videoNode.locator('[aria-label="Generating media"]'),
      'the downstream video node never started, so "the image was not regenerated" proves nothing',
    ).toBeVisible({ timeout: 60_000 });

    // Give the run time to reach (and fail at) the Backend before reading the verdict.
    await expect
      .poll(
        async () =>
          videoNode
            .locator('[aria-label="Generating media"]')
            .count()
            .then((c) => c === 0),
        { timeout: 180_000, intervals: [2000, 3000, 5000] },
      )
      .toBe(true);

    const generatingHits = await page.evaluate(
      () =>
        (window as unknown as { __benchGenerating?: { upstream: number } }).__benchGenerating
          ?.upstream ?? -1,
    );
    const srcAfter = await page.locator(imageSelector).first().getAttribute('src');

    expect(
      generatingHits,
      `the sig1 upstream image entered the generating state ${generatingHits} time(s) during a downstream video run`,
    ).toBe(0);
    expect(srcAfter, 'the upstream image source changed — it was regenerated').toBe(srcBefore);

    console.log(
      `[#221] upstream generating-state observations: ${generatingHits}; src unchanged: ${srcAfter === srcBefore}`,
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/sig1-no-regeneration.png` });
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('#222 the composer card Run starts an execution and Dismiss retires the card', async ({}, testInfo) => {
    testInfo.setTimeout(600_000);
    await openCanvas(page, COMPOSER_ROOM_ID);

    const promptBox = page.getByLabel('Describe the workflow you want on the canvas');
    await expect(promptBox).toBeVisible({ timeout: 60_000 });
    await expect(promptBox).toBeEnabled({ timeout: 60_000 });

    // ── Dismiss, on a RUNNING turn — the exact shape of the bug. `cancel()` aborted a fetch
    //    that had often already ended and never settled the turn's status, so the panel (which
    //    hides only at 'idle') stayed up forever and X read as dead.
    await promptBox.fill('Build a prompt node feeding an image generator.');
    await promptBox.press('Enter');

    const dismiss = page.getByTestId('composer-card-dismiss');
    await expect(dismiss).toBeVisible({ timeout: 60_000 });
    // Submitting moves the composer from the centred hero to the slim bar, so the button is
    // mid-flight for a beat; `force` skips the stability wait rather than racing the motion.
    // The click is retried because a re-mount can detach it — the count that matters is how
    // many it took, and it is logged.
    let dismissClicks = 0;
    await expect
      .poll(
        async () => {
          const button = page.getByTestId('composer-card-dismiss');
          if ((await button.count()) === 0) return 0;
          dismissClicks += 1;
          await button
            .first()
            .click({ force: true, timeout: 5_000 })
            .catch(() => {});
          await page.waitForTimeout(600);
          return button.count();
        },
        { timeout: 45_000, intervals: [500, 1000, 2000] },
      )
      .toBe(0);
    expect(dismissClicks, 'Dismiss never had to be pressed').toBeGreaterThan(0);
    console.log(`[#222] Dismiss retired a RUNNING composer turn after ${dismissClicks} press(es)`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/composer-dismissed.png` });

    // ── Run, on a completed turn.
    await expect(promptBox).toBeEnabled({ timeout: 30_000 });
    await promptBox.fill('Add one prompt node wired into one image generator, nothing else.');
    await promptBox.press('Enter');

    // A completed turn offers Run in TWO places, and only one of them exists at a time: the
    // slim card (`composer-card-run`) when the chat is collapsed, the transcript's own button
    // (`composer-turn-run`) when it is expanded. The composer auto-expands the first time the
    // room streams, so waiting on the card alone hangs forever.
    await expect
      .poll(
        async () =>
          (await page.getByTestId('composer-turn-run').count()) +
          (await page.getByTestId('composer-card-run').count()),
        { timeout: 240_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);

    const collapseChat = page.getByRole('button', { name: 'Collapse composer chat' });
    if ((await collapseChat.count()) > 0) {
      await collapseChat.first().click({ force: true });
    }

    const run = page.getByTestId('composer-card-run');
    await expect(run, 'the collapsed composer card offers no Run').toBeVisible({ timeout: 30_000 });

    // The agent's nodes arrive through canvas_sessions + realtime, not through the stream.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 60_000 });
    const nodeCountBefore = await page.locator('.react-flow__node').count();
    expect(nodeCountBefore).toBeGreaterThan(0);

    await run.click({ force: true });

    // Run retires the card...
    await expect(
      page.getByTestId('composer-card-run'),
      'the composer card survived Run',
    ).toHaveCount(0, { timeout: 20_000 });

    // ...and an execution ACTUALLY STARTS. The canvas toolbar swaps Run Flow for Abort while a
    // run is in flight; a node painting the generating loader is the same fact from the other
    // side. Either is proof the handler did more than fire.
    await expect
      .poll(
        async () => {
          const abort = await page.getByRole('button', { name: 'Abort' }).count();
          const generating = await page.locator('[aria-label="Generating media"]').count();
          return abort + generating;
        },
        { timeout: 90_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);

    console.log(`[#222] composer authored ${nodeCountBefore} node(s); Run started an execution`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/composer-run-started.png` });
  });
});

// ── #224 — the planner handoff header ───────────────────────────────────────────
//
// The tester opened the Studio FROM the planner, which is the only state that mounts the
// readiness pill and the Back/Apply buttons into the header row. Landing on /ai-studio without
// that handoff renders a header with four fewer children and proves nothing.

const HANDOFF_CLIENT_KEY = 'bench-studio-header';
const HEADER_ROOM_ID = '00000000-0000-4000-8000-00000000ca03';
const HEADER_PNG_PATH = `${BRAND_ID}/studio-bench/header-40x10.png`;

test.describe('ai studio canvas header from the planner handoff', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'needs the local Supabase stack — bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let context: BrowserContext | null = null;
  let page: Page;
  let draftId: string | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const supabase = admin();
    await setActiveBrand(supabase, BRAND_ID);

    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .delete()
      .eq('brand_id', BRAND_ID)
      .like('client_key', `${HANDOFF_CLIENT_KEY}%`);

    const today = new Date();
    const dayId = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    const { data: inserted } = await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .insert({
        brand_id: BRAND_ID,
        user_id: OWNER_ID,
        platform: 'instagram',
        platform_account_id: 'unassigned',
        status: 'draft',
        scheduled_date: `${dayId}T12:00:00.000Z`,
        client_key: HANDOFF_CLIENT_KEY,
        media_stage: 'text_only',
        slot_data: {
          placementId: HANDOFF_CLIENT_KEY,
          dayId,
          weekStart: dayId,
          timeLabel: '9:00 AM',
          platform: 'instagram',
          title: 'Studio header bench draft',
          caption: 'The header must not stack itself when the Studio opens from the planner.',
        },
      })
      .select('id')
      .single()
      .throwOnError();
    draftId = (inserted as { id: string }).id;

    await brandProfiles(supabase)
      .from('canvas_rooms')
      .upsert(
        {
          id: HEADER_ROOM_ID,
          brand_profile_id: BRAND_ID,
          name: 'Bench Header',
          created_by: OWNER_ID,
        },
        { onConflict: 'id' },
      )
      .throwOnError();
    // Real bytes so the seeded generator has a real output — the readiness pill (the widest
    // child in the header, `min-w-[18rem]` and two lines tall) only mounts once the canvas can
    // actually satisfy the handoff's concept. An empty canvas renders a narrower header than
    // the one the tester photographed.
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (bucketError && !/already exists/i.test(bucketError.message)) {
      throw new Error(`[studio:canvas:e2e:bench] bucket ${BUCKET}: ${bucketError.message}`);
    }
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(HEADER_PNG_PATH, Buffer.from(PNG_40x10, 'base64'), {
        contentType: 'image/png',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(
        `[studio:canvas:e2e:bench] upload ${HEADER_PNG_PATH}: ${uploadError.message}`,
      );
    }

    const headerNode = makeNode(
      'bench-header-image',
      'nanoGen',
      { x: 0, y: 0 },
      {
        aspectRatio: '4:5',
        positivePrompt: 'a ceramic mug on a windowsill, morning light',
        generatedImageStoragePath: HEADER_PNG_PATH,
        generatedImageBucket: BUCKET,
      },
    );

    await brandProfiles(supabase)
      .from('canvas_sessions')
      .upsert(
        {
          brand_profile_id: BRAND_ID,
          room_id: HEADER_ROOM_ID,
          nodes: [headerNode],
          edges: [],
          editor_session_id: crypto.randomUUID(),
          editor_user_id: OWNER_ID,
        },
        { onConflict: 'brand_profile_id,room_id' },
      )
      .throwOnError();

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(state.cookies);

    // The handoff payload the planner really writes (`buildAiStudioStorageKey` +
    // `plannerAiStudioHandoffSchema`). Without it `organicPlannerSeed` is null and the header
    // never grows the children that collided.
    const handoff = {
      schemaVersion: 'planner_ai_handoff_v1',
      draftId,
      brandProfileId: BRAND_ID,
      weekStartId: dayId,
      platform: 'instagram',
      postType: 'post',
      workflowConcept: 'ig_post_single_image',
      format: 'FeedPost',
      authoritativeCount: 1,
      title: 'Studio header bench draft',
      summary: 'A header that wraps instead of stacking.',
      captionPreview: 'The header must not stack itself when the Studio opens from the planner.',
      creativeDirectionPrompt: 'A ceramic mug on a windowsill, morning light',
      updatedAt: new Date().toISOString(),
    };
    await context.addInitScript(
      ([key, payload]) => {
        window.localStorage.setItem(key as string, payload as string);
      },
      [`continuum:organic-planner:ai-studio-context:${draftId}`, JSON.stringify(handoff)] as const,
    );

    page = await context.newPage();
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    await context?.close();
    const supabase = admin();
    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .delete()
      .eq('brand_id', BRAND_ID)
      .like('client_key', `${HANDOFF_CLIENT_KEY}%`);
    await brandProfiles(supabase).from('canvas_rooms').delete().eq('id', HEADER_ROOM_ID);
    await supabase.storage.from(BUCKET).remove([HEADER_PNG_PATH]);
  });

  for (const width of [1280, 1440]) {
    test(`#224 the header neither overflows nor overlaps itself at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/ai-studio?mode=canvas&source=organic-planner&draftId=${draftId}&roomId=${HEADER_ROOM_ID}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

      const header = page.getByTestId('studio-canvas-header');
      await expect(header).toBeVisible({ timeout: 120_000 });
      // The handoff really landed: Back/Apply only exist when organicPlannerSeed is non-null.
      await expect(page.getByRole('button', { name: 'Back to Planner', exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByRole('button', { name: 'Apply Back to Planner', exact: true }),
      ).toBeVisible();
      // The local regression that was removed: exactly ONE Back to Planner.
      expect(await page.getByRole('button', { name: 'Back to Planner', exact: true }).count()).toBe(
        1,
      );

      const overflow = await header.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        height: (el as HTMLElement).offsetHeight,
      }));
      expect(
        overflow.scrollWidth,
        `header overflows horizontally at ${width}px: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
      ).toBeLessThanOrEqual(overflow.clientWidth);

      // The readiness pill is the widest child (min-w-[18rem], two lines) and the reason the
      // old single row ran out of space. Its presence is what makes this the tester's state.
      const readinessPill = page.getByText('Single-image workflow', { exact: true });
      const hasReadinessPill = (await readinessPill.count()) > 0;

      // No two header CONTROLS may share pixels — the direct children alone are only two
      // flex groups, which would hide exactly the collision the tester photographed (the pill
      // and the Back/Apply buttons painted over the workspace tabs). This walks the header's
      // leaf controls instead, dropping anything nested inside another control.
      const controlBoxes = await header.evaluate((el) => {
        const candidates = Array.from(
          el.querySelectorAll('button, [data-testid="canvas-rooms-tabs"], [role="combobox"]'),
        ) as HTMLElement[];
        const visible = candidates.filter((node) => node.getClientRects().length > 0);
        const topLevel = visible.filter(
          (node) => !visible.some((other) => other !== node && other.contains(node)),
        );
        return topLevel.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label:
              node.getAttribute('data-testid') ??
              node.innerText?.slice(0, 32).replace(/\s+/g, ' ') ??
              node.tagName,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      });
      expect(
        controlBoxes.length,
        'no header controls were measured — the selector missed the header',
      ).toBeGreaterThan(4);
      for (let i = 0; i < controlBoxes.length; i += 1) {
        for (let j = i + 1; j < controlBoxes.length; j += 1) {
          expect(
            intersects(controlBoxes[i], controlBoxes[j]),
            `header controls overlap at ${width}px: ${JSON.stringify(controlBoxes[i])} vs ${JSON.stringify(controlBoxes[j])}`,
          ).toBe(false);
        }
      }
      const childBoxes = controlBoxes;

      // The rooms tabs are the element the buttons were painted over.
      const tabsBox = await requireBox(page, '[data-testid="canvas-rooms-tabs"]');
      const backBox = await requireBox(page, 'button:text-is("Back to Planner")');
      expect(
        intersects(tabsBox, backBox),
        `"Back to Planner" ${JSON.stringify(backBox)} overlaps the rooms tabs ${JSON.stringify(tabsBox)} at ${width}px`,
      ).toBe(false);

      console.log(
        `[#224] ${width}px: header ${overflow.clientWidth}px wide, scrollWidth ${overflow.scrollWidth}, height ${overflow.height}px, ${childBoxes.length} controls, readiness pill ${hasReadinessPill ? 'PRESENT' : 'absent'}, no overlap`,
      );

      await page.screenshot({ path: `${SCREENSHOT_DIR}/header-${width}.png` });
    });
  }
});
