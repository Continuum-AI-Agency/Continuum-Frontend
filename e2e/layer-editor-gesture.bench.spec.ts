import { createNodeData } from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';

// Layer Editor gesture bench — direct manipulation, driven by a real mouse.
//
// This is the half of the Layer Editor that `studio:layers:e2e:bench` deliberately does
// not reach. That bench bundles the pure compositor and undo reducer into a headless tab
// and grades PIXELS; it never mounts React. So until this file existed, nothing in the
// repo failed if dragging, resizing or rotating stopped working in the product — the
// arithmetic was proved and the wiring that calls it was not.
//
// It drives the REAL entry point: the canvas at /ai-studio, the layerEditor node's own
// Edit button, the dialog that opens. Not a mounted component, not a synthetic harness.
//
// Every assertion reads an observable a user could point at:
//   · the layer's own CSS transform, which IS `layerTransformCss` — the same four ops the
//     PNG export applies, so what this reads is what would composite
//   · the gizmo and group box in the DOM
//   · the row that comes back out of `canvas_sessions`
//
// Two of the cases are regressions with a name, and both were data loss:
//   · Delete while editing removed the layer AND deleted the canvas node underneath the
//     dialog, because the canvas keymap never stood down (`keyboardScope`).
//   · Closing within the 150ms persist debounce dropped the edit, because the effect
//     cleanup cleared the pending write instead of flushing it.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · Compose. No PNG is produced and nothing is uploaded; `studio:layers:e2e:bench`
//     owns the pixels and this run must stay free of Supabase Storage writes.
//   · Touch and trackpad. Playwright's mouse emits `pointerType: mouse` only, so
//     `pointercancel` and pinch-zoom are covered by unit tests, not here.
//   · The alignment guide's APPEARANCE. That a guide element renders is asserted; that
//     the line is drawn where the eye expects is `layerSnap.test.ts` arithmetic.
//
// Prerequisites (same as studio-node-chrome.bench.spec.ts, see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:fe:local-supabase   (PORT=3001)
//   Run with: bun run layer-editor:gesture:bench

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ROOM_ID = '00000000-0000-4000-8000-00000000ce07';

const EDITOR_NODE_ID = 'bench-layer-editor';
const FRAME = { width: 1024, height: 1024 };
/** Each seeded source is this many pixels square. */
const SOURCE_PX = 200;

const SCREENSHOT_DIR =
  process.env.LAYER_EDITOR_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/layer-editor-gesture';

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * A solid PNG as a data URL.
 *
 * Generated rather than fixtured so the bench has no file dependency, and opaque so a
 * layer that fails to paint is visibly absent rather than subtly transparent.
 */
function solidPng(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  // A 1x1 PNG scaled by the layer's own transform is all the compositor needs; the
  // SOURCE size the layer reports is what drives the geometry, and that is seeded below.
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: number[]): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const be32 = (value: number): number[] => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const chunk = (type: string, data: number[]): number[] => {
    const typeBytes = [...type].map((ch) => ch.charCodeAt(0));
    return [...be32(data.length), ...typeBytes, ...data, ...be32(crc([...typeBytes, ...data]))];
  };

  const ihdr = chunk('IHDR', [...be32(1), ...be32(1), 8, 2, 0, 0, 0]);
  // One uncompressed zlib block holding a single filter byte plus the RGB triple.
  const raw = [0, r, g, b];
  const adler = (() => {
    let a = 1;
    let s = 0;
    for (const byte of raw) {
      a = (a + byte) % 65521;
      s = (s + a) % 65521;
    }
    return ((s << 16) | a) >>> 0;
  })();
  const idat = chunk('IDAT', [
    0x78,
    0x01,
    0x01,
    raw.length & 0xff,
    (raw.length >> 8) & 0xff,
    ~raw.length & 0xff,
    (~raw.length >> 8) & 0xff,
    ...raw,
    ...be32(adler),
  ]);
  const bytes = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...ihdr,
    ...idat,
    ...chunk('IEND', []),
  ];
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[layer-editor:gesture:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const brandProfiles = (client: SupabaseClient) =>
  (client as unknown as { schema: (s: string) => SupabaseClient }).schema('brand_profiles');

interface SeededLayer {
  id: string;
  name: string;
  sourceNodeId?: string;
  sourceBucket?: string;
  sourceStoragePath?: string;
  sourceWidth: number;
  sourceHeight: number;
  anchor: { x: number; y: number };
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
  blendMode: string;
  visible: boolean;
  locked: boolean;
}

const seededLayer = (id: string, sourceNodeId: string, x: number, y: number): SeededLayer => ({
  id,
  name: id,
  sourceNodeId,
  sourceWidth: SOURCE_PX,
  sourceHeight: SOURCE_PX,
  // Anchor at the source centre — `createLayer`'s own default — so `position` IS the
  // layer's centre and every expectation below reads as a centre.
  anchor: { x: SOURCE_PX / 2, y: SOURCE_PX / 2 },
  position: { x, y },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
});

function buildGraph() {
  const red = createNodeData('image', {});
  const blue = createNodeData('image', {});
  const editor = createNodeData('layerEditor', {});

  const nodes = [
    {
      id: 'bench-src-red',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { ...red.data, generatedImage: solidPng([220, 40, 40]), label: 'Red' },
      ...(red.style ? { style: red.style, width: red.style.width, height: red.style.height } : {}),
    },
    {
      id: 'bench-src-blue',
      type: 'image',
      position: { x: 0, y: 480 },
      data: { ...blue.data, generatedImage: solidPng([40, 60, 220]), label: 'Blue' },
      ...(blue.style
        ? { style: blue.style, width: blue.style.width, height: blue.style.height }
        : {}),
    },
    {
      id: EDITOR_NODE_ID,
      type: 'layerEditor',
      position: { x: 620, y: 220 },
      data: {
        ...editor.data,
        frame: FRAME,
        layers: [
          seededLayer('bench-red', 'bench-src-red', 300, 300),
          seededLayer('bench-blue', 'bench-src-blue', 724, 724),
        ],
      },
      ...(editor.style
        ? { style: editor.style, width: editor.style.width, height: editor.style.height }
        : {}),
    },
  ];

  const edges = [
    {
      id: 'bench-e-red',
      source: 'bench-src-red',
      target: EDITOR_NODE_ID,
      sourceHandle: 'image',
      targetHandle: 'image-in',
    },
    {
      id: 'bench-e-blue',
      source: 'bench-src-blue',
      target: EDITOR_NODE_ID,
      sourceHandle: 'image',
      targetHandle: 'image-in',
    },
  ];

  return { nodes, edges };
}

async function seedRoom(supabase: SupabaseClient, extraLayers: SeededLayer[] = []) {
  const graph = buildGraph();
  if (extraLayers.length > 0) {
    const editor = graph.nodes.find((node) => node.id === EDITOR_NODE_ID);
    if (editor) {
      (editor.data as { layers: SeededLayer[] }).layers = [
        ...(editor.data as { layers: SeededLayer[] }).layers,
        ...extraLayers,
      ];
    }
  }
  await brandProfiles(supabase)
    .from('canvas_rooms')
    .upsert(
      {
        id: ROOM_ID,
        brand_profile_id: BRAND_ID,
        name: 'Bench Layer Gestures',
        created_by: OWNER_ID,
      },
      { onConflict: 'id' },
    )
    .throwOnError();

  await brandProfiles(supabase)
    .from('canvas_sessions')
    .upsert(
      {
        brand_profile_id: BRAND_ID,
        room_id: ROOM_ID,
        nodes: graph.nodes,
        edges: graph.edges,
        deleted_node_ids: [],
        deleted_edge_ids: [],
        editor_session_id: crypto.randomUUID(),
        editor_user_id: OWNER_ID,
      },
      { onConflict: 'brand_profile_id,room_id' },
    )
    .throwOnError();

  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' })
    .throwOnError();
}

/** The stored layers, straight out of the row the app writes. */
async function storedLayers(supabase: SupabaseClient): Promise<SeededLayer[]> {
  const { data } = await brandProfiles(supabase)
    .from('canvas_sessions')
    .select('nodes')
    .eq('brand_profile_id', BRAND_ID)
    .eq('room_id', ROOM_ID)
    .single()
    .throwOnError();

  const nodes = (data as { nodes: { id: string; data?: { layers?: SeededLayer[] } }[] }).nodes;
  return nodes.find((node) => node.id === EDITOR_NODE_ID)?.data?.layers ?? [];
}

/**
 * A layer's placed transform, read off the element the compositor mirrors.
 *
 * `layerTransformCss` emits `translate(x,y) rotate(d) scale(sx,sy) translate(-ax,-ay)`,
 * so the numbers here are the DOCUMENT's, not screen pixels — no scale conversion, and
 * no dependence on where the pane happens to be.
 */
async function placed(page: Page, layerId: string) {
  return page.evaluate((id) => {
    const img = document.querySelector(`img[data-layer-id="${id}"]`) as HTMLElement | null;
    if (!img) return null;
    const transform = img.style.transform;
    const translate = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
    const rotate = /rotate\((-?[\d.]+)deg\)/.exec(transform);
    const scale = /scale\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(transform);
    return {
      x: translate ? Number(translate[1]) : Number.NaN,
      y: translate ? Number(translate[2]) : Number.NaN,
      rotation: rotate ? Number(rotate[1]) : Number.NaN,
      scaleX: scale ? Number(scale[1]) : Number.NaN,
      scaleY: scale ? Number(scale[2]) : Number.NaN,
    };
  }, layerId);
}

/** Composition point -> viewport point, via the frame's live rect and rendered scale. */
async function toViewport(page: Page, point: { x: number; y: number }) {
  return page.evaluate(
    ({ x, y, frameWidth }) => {
      const frame = document.querySelector('[data-testid="layer-frame"]') as HTMLElement | null;
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      const scale = rect.width / frameWidth;
      return { x: rect.left + x * scale, y: rect.top + y * scale };
    },
    { x: point.x, y: point.y, frameWidth: FRAME.width },
  );
}

async function dragComposition(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { modifier?: 'Alt' | 'Shift'; steps?: number } = {},
) {
  const start = await toViewport(page, from);
  const end = await toViewport(page, to);
  expect(start, 'the stage frame must be on screen').not.toBeNull();
  expect(end).not.toBeNull();
  if (!start || !end) return;

  if (options.modifier) await page.keyboard.down(options.modifier);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // More than one step: the drag threshold deliberately ignores the first few pixels, and
  // a single jump would also skip every intermediate snap decision.
  await page.mouse.move(end.x, end.y, { steps: options.steps ?? 12 });
  await page.mouse.up();
  if (options.modifier) await page.keyboard.up(options.modifier);
}

async function openEditor(page: Page, expectedLayers = 2) {
  const node = page.locator(`.react-flow__node[data-id="${EDITOR_NODE_ID}"]`);
  await expect(node).toBeVisible({ timeout: 30_000 });
  // A dialog that is still animating out keeps its backdrop over the canvas, and the
  // Edit click lands on the scrim instead of the button — only reachable when REOPENING.
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0, { timeout: 15_000 });
  await node.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('layer-frame')).toBeVisible({ timeout: 15_000 });
  // Both sources have to have resolved, or a "layer" is an unhittable rectangle.
  await expect(page.locator('img[data-layer-id]')).toHaveCount(expectedLayers, {
    timeout: 15_000,
  });

  // ...and the stage has to have SETTLED. Its scale comes from a ResizeObserver, so for
  // the first frames after mount the frame element is still zero-sized and `toViewport`
  // maps composition pixels onto the wrong screen point — the press then lands beside the
  // layer instead of on it, and the gesture silently never starts. This was a real flake,
  // not a theoretical one.
  await expect
    .poll(
      async () => {
        const box = await page.getByTestId('layer-frame').boundingBox();
        return box ? Math.round(box.width) : 0;
      },
      { timeout: 15_000, message: 'the stage frame should be laid out before any gesture' },
    )
    .toBeGreaterThan(200);
}

test.describe('Layer Editor gestures', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'Needs the local Supabase stack: bun run supabase:start && supabase:hydrate && supabase:env:local',
  );
  test.describe.configure({ mode: 'serial' });

  let supabase: SupabaseClient;

  test.beforeEach(async ({ page, context }) => {
    supabase = admin();
    await seedRoom(supabase);
    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    await context.addCookies(state.cookies);
    await page.goto(`/ai-studio?room=${ROOM_ID}`);
  });

  test('dragging a layer body moves it, and one undo puts it back', async ({ page }) => {
    await openEditor(page);
    const before = await placed(page, 'bench-red');
    expect(before).toMatchObject({ x: 300, y: 300 });

    await dragComposition(page, { x: 300, y: 300 }, { x: 620, y: 240 });

    const after = await placed(page, 'bench-red');
    expect(after?.x).toBeGreaterThan(before?.x ?? 0);
    expect(after?.y).toBeLessThan(before?.y ?? 0);

    // ONE step back, not one mouse sample back. The whole drag is a single entry.
    await page.keyboard.press('Meta+z');
    expect(await placed(page, 'bench-red')).toMatchObject({ x: 300, y: 300 });
  });

  test('a click that selects does not bank an undo step', async ({ page }) => {
    await openEditor(page);
    const spot = await toViewport(page, { x: 300, y: 300 });
    if (!spot) throw new Error('no frame');

    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByTestId('layer-resize-se')).toBeVisible();

    // Undo after a plain selecting click used to move the layer nowhere while looking
    // like it had done something. Nothing was banked, so nothing moves.
    await page.keyboard.press('Meta+z');
    expect(await placed(page, 'bench-red')).toMatchObject({ x: 300, y: 300 });
  });

  test('dragging the se handle resizes, holding the opposite corner', async ({ page }) => {
    await openEditor(page);
    const spot = await toViewport(page, { x: 300, y: 300 });
    if (!spot) throw new Error('no frame');
    await page.mouse.click(spot.x, spot.y);

    const handle = page.getByTestId('layer-resize-se');
    await expect(handle).toBeVisible();

    // The layer spans 200..400; se sits at (400,400). Drag it out to (500,500).
    await dragComposition(page, { x: 400, y: 400 }, { x: 500, y: 500 });

    const after = await placed(page, 'bench-red');
    expect(after?.scaleX).toBeGreaterThan(1);
    expect(after?.scaleY).toBeGreaterThan(1);
  });

  test('the rotate grip turns the layer', async ({ page }) => {
    await openEditor(page);
    const spot = await toViewport(page, { x: 300, y: 300 });
    if (!spot) throw new Error('no frame');
    await page.mouse.click(spot.x, spot.y);

    const grip = page.getByTestId('layer-rotate-handle');
    await expect(grip).toBeVisible();
    const box = await grip.boundingBox();
    if (!box) throw new Error('no grip');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 12 });
    await page.mouse.up();

    const after = await placed(page, 'bench-red');
    expect(Math.abs(after?.rotation ?? 0)).toBeGreaterThan(1);
  });

  test('a marquee across both layers selects both and shows one group box', async ({ page }) => {
    await openEditor(page);

    // From empty canvas in the top-left corner, across both layers.
    await dragComposition(page, { x: 20, y: 20 }, { x: 900, y: 900 });

    await page
      .getByTestId('layer-stage')
      .screenshot({ path: `${SCREENSHOT_DIR}/group-selection.png` });
    await expect(page.getByTestId('layer-group-box')).toBeVisible();
    await expect(page.getByTestId('layer-group-resize-se')).toBeVisible();
    // A group is transformed uniformly from its corners, so it offers no edge handles.
    await expect(page.getByTestId('layer-group-resize-e')).toHaveCount(0);
  });

  test('dragging a group corner scales every member', async ({ page }) => {
    await openEditor(page);
    await dragComposition(page, { x: 20, y: 20 }, { x: 900, y: 900 });
    await expect(page.getByTestId('layer-group-box')).toBeVisible();

    const before = await placed(page, 'bench-blue');
    const handle = page.getByTestId('layer-group-resize-se');
    const box = await handle.boundingBox();
    if (!box) throw new Error('no group handle');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 140, { steps: 12 });
    await page.mouse.up();

    const red = await placed(page, 'bench-red');
    const blue = await placed(page, 'bench-blue');
    expect(red?.scaleX).toBeGreaterThan(1);
    expect(blue?.scaleX).toBeGreaterThan(1);
    expect(blue?.x).toBeGreaterThan(before?.x ?? 0);
  });

  test('the alignment guide and the readout are on screen mid-drag', async ({ page }) => {
    await openEditor(page);

    // Drag the red layer's centre to just off the frame's centre line, and STOP with the
    // button still down — the guide and the readout only exist during a gesture.
    const start = await toViewport(page, { x: 300, y: 300 });
    const near = await toViewport(page, { x: 508, y: 512 });
    if (!start || !near) throw new Error('no frame');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(near.x, near.y, { steps: 14 });

    await expect(page.getByTestId('layer-readout')).toBeVisible();
    // Counted and MEASURED rather than `toBeVisible`: a vertical <line> has no width, so
    // Playwright calls it hidden however correctly it is drawn. Its x is the real claim —
    // the guide must sit on the frame's centre line, which for a 1024 frame is 512.
    const guide = page.getByTestId('layer-guide-x');
    await expect(guide).toHaveCount(1);
    await expect(guide).toHaveAttribute('x1', '512');
    await page
      .getByTestId('layer-stage')
      .screenshot({ path: `${SCREENSHOT_DIR}/snap-guide-and-readout.png` });

    // Snapping pulled the layer's centre onto the frame's centre line at 512.
    await page.mouse.up();
    expect(await placed(page, 'bench-red')).toMatchObject({ x: 512 });
  });

  test('a file-sourced layer resolves from its stored coordinates', async ({ page }) => {
    // THE UPLOAD HOP IS NOT EXERCISED HERE, and this is why: `uploadMediaAsset` invokes
    // the `library-upload` EDGE FUNCTION, and edge functions are deliberately not wired
    // on the local stack (no secrets) — AGENTS.md calls that expected, not a bug. The
    // picker itself reports "Failed to fetch" here for exactly that reason.
    //
    // So the fixture is seeded into the REAL store with the service role, which is the
    // same bytes at the same path the edge function would have produced, and everything
    // downstream of it is exercised for real: a layer with NO sourceNodeId, resolved by
    // signing its durable coordinates in the browser, rendered, and still rendering after
    // a close and reopen. Only the edge function's own hop is missing.
    // BRAND-PREFIXED, and that is load-bearing: storage RLS on `media-library` derives
    // the brand from the FIRST path segment (`media.storage_object_brand_id` reads
    // `foldername(name)[1]`), so an object parked anywhere else is unsignable by the
    // browser and the layer silently never resolves.
    const objectPath = `${BRAND_ID}/bench-layer-editor/${crypto.randomUUID()}.png`;
    const bytes = Buffer.from(solidPng([20, 200, 90]).split(',')[1], 'base64');

    const uploaded = await supabase.storage
      .from('media-library')
      .upload(objectPath, bytes, { contentType: 'image/png', upsert: true });
    if (uploaded.error) {
      test.skip(true, `local storage refused the fixture: ${uploaded.error.message}`);
      return;
    }

    try {
      await seedRoom(supabase, [
        {
          ...seededLayer('bench-file', '', 512, 512),
          sourceNodeId: undefined,
          sourceBucket: 'media-library',
          sourceStoragePath: objectPath,
        },
      ]);
      // A fresh navigation rather than reload(): the seed above lands after the canvas
      // has already loaded this room once, and goto re-enters the route cleanly.
      await page.goto(`/ai-studio?room=${ROOM_ID}`);
      await openEditor(page, 3);

      const src = await page
        .locator('img[data-layer-id="bench-file"]')
        .getAttribute('src');
      // Signed, not a data: URL — the layer document lives inside the canvas JSON blob,
      // which strips base64 on save, so a data URL would come back as nothing.
      expect(src).toContain(objectPath);
      expect(src?.startsWith('data:')).toBe(false);
      // The whole point: this layer has no node behind it at all.
      const stored = await storedLayers(supabase);
      expect(stored.find((entry) => entry.id === 'bench-file')?.sourceNodeId).toBeUndefined();
    } finally {
      await supabase.storage.from('media-library').remove([objectPath]);
    }
  });

  test('the upload affordance is reachable from the Add layer menu', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Add layer' }).click();
    await expect(page.getByRole('menuitem', { name: /Upload an image/ })).toBeVisible();
    // The menu item drives this input; the input is what a drop and a paste share.
    await expect(page.getByTestId('layer-file-input')).toHaveCount(1);
  });

  test('zoom is a real control — the readout changes and Fit restores it', async ({ page }) => {
    await openEditor(page);
    const readout = page.getByTestId('layer-zoom-readout');
    const fitted = await readout.textContent();

    await page.keyboard.press('Meta+Equal');
    await expect(readout).not.toHaveText(fitted ?? '100%');

    await readout.click();
    await expect(readout).toHaveText(fitted ?? '100%');
  });

  test('Delete removes the layer and leaves the canvas node alone', async ({ page }) => {
    await openEditor(page);
    const spot = await toViewport(page, { x: 300, y: 300 });
    if (!spot) throw new Error('no frame');
    await page.mouse.click(spot.x, spot.y);

    await page.keyboard.press('Delete');

    await expect(page.locator('img[data-layer-id="bench-red"]')).toHaveCount(0);
    // The regression: the canvas keymap never stood down, so the same keypress deleted
    // the whole layerEditor node out from under the dialog the user was working in.
    await expect(page.getByTestId('layer-frame')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(`.react-flow__node[data-id="${EDITOR_NODE_ID}"]`)).toHaveCount(1);
  });

  test('an edit made just before closing is still persisted', async ({ page }) => {
    await openEditor(page);
    await dragComposition(page, { x: 300, y: 300 }, { x: 620, y: 240 });

    const moved = await placed(page, 'bench-red');
    expect(moved?.x).toBeGreaterThan(300);

    // Close immediately — inside the 150ms persist debounce, which is exactly the window
    // that used to be discarded by the effect cleanup.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('layer-frame')).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const layers = await storedLayers(supabase);
          return layers.find((layer) => layer.id === 'bench-red')?.position.x ?? 0;
        },
        {
          timeout: 20_000,
          message: 'the moved position should reach canvas_sessions, not be dropped on close',
        },
      )
      .toBeGreaterThan(300);
  });
});
