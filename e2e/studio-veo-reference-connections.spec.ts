import { createNodeData } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';

// Veo reference-connection e2e bench.
//
// The regression: a video-generator node drew its image-reference handle as `ref-image`
// while the store's legacy remap rewrote every incoming edge to `ref-images`. Both ids are
// in the node's ALLOWED set, so nothing was rejected and nothing was logged — the edge
// simply pointed at a handle that did not exist in the DOM, and React Flow never drew it.
// Store state looked perfect the whole time. Reported as "I can't connect references to
// Veo 3.1", while Veo 3.1 Fast (which defaults to first/last FRAME handles, no alias, no
// remap) worked fine.
//
// Everything asserted here is a REAL BROWSER OBSERVATION: nodes are seeded into the real
// local Postgres (`brand_profiles.canvas_sessions`), loaded by the real canvas, connected by
// a real mouse drag between two real handles, and the resulting edge is read back out of the
// rendered SVG. The unit bench (studio-handle-parity.bench.tsx) proves the vocabularies
// agree; only this one proves an edge is DRAWN and SURVIVES A RELOAD.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run studio:veo-refs:e2e:bench   (starts the FE on :3001 itself)
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · Continuum-Backend. The canvas reads and writes its graph through Supabase directly, so
//     no Backend route is touched here. The Veo REQUEST BUILDER that consumes these edges
//     (reference_images vs first_frame/last_frame) is proven by the Backend's own
//     veo-reference-mode-e2e-bench, not by this file.
//   · Real Vertex/Veo generation. No pixel is generated; pressing Run is out of scope. That
//     this graph would produce the right REQUEST is a contract claim, asserted in the unit
//     benches, not a rendered-video claim.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const REFS_ROOM_ID = '00000000-0000-4000-8000-00000000cb01';
const SWITCH_ROOM_ID = '00000000-0000-4000-8000-00000000cb02';
const BENCH_ROOM_IDS = [REFS_ROOM_ID, SWITCH_ROOM_ID];

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// A real 2x2 PNG so the image nodes carry actual bytes rather than an empty placeholder.
const PNG_2x2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8z4AATAxkc4EAAB0EAgn0ivZBAAAAAElFTkSuQmCC';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[studio:veo-refs:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function brandProfiles(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema('brand_profiles');
}

type SeededNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: Record<string, number>;
  width?: number;
  height?: number;
};

// The REAL creation path — the same helper the add menu, the edge-drop menu and the agent
// writer call. Hand-writing node data here would seed a shape the app never produces.
function makeNode(
  id: string,
  type: string,
  position: { x: number; y: number },
  overrides: Record<string, unknown>,
): SeededNode {
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

function imageNode(id: string, x: number, y: number): SeededNode {
  return {
    id,
    type: 'image',
    position: { x, y },
    data: { image: `data:image/png;base64,${PNG_2x2}`, fileName: `${id}.png` },
    style: { width: 220, height: 220 },
    width: 220,
    height: 220,
  };
}

async function seedRoom(
  supabase: SupabaseClient,
  roomId: string,
  name: string,
  graph: { nodes: SeededNode[]; edges: unknown[] },
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
        editor_session_id: crypto.randomUUID(),
        editor_user_id: OWNER_ID,
      },
      { onConflict: 'brand_profile_id,room_id' },
    )
    .throwOnError();
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

/**
 * Waits for React Flow's viewport transform to stop moving. `fitView` animates after load, so
 * a handle's bounding box read too early is stale by the time the mouse gets there — the drag
 * then starts on empty canvas and pans instead of connecting.
 */
async function viewportSettled(page: Page): Promise<void> {
  const readTransform = () =>
    page.evaluate(
      () =>
        (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform ??
        '',
    );

  let previous = await readTransform();
  for (let stableTicks = 0; stableTicks < 3; ) {
    await page.waitForTimeout(250);
    const current = await readTransform();
    stableTicks = current === previous ? stableTicks + 1 : 0;
    previous = current;
  }
}

async function openCanvas(page: Page, roomId: string): Promise<void> {
  await page.goto(`/ai-studio?roomId=${roomId}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByTestId('studio-canvas-header')).toBeVisible({ timeout: 120_000 });
}

const nodeLocator = (page: Page, nodeId: string) =>
  page.locator(`.react-flow__node[data-id="${nodeId}"]`);

const handleLocator = (page: Page, nodeId: string, handleId: string) =>
  nodeLocator(page, nodeId).locator(`[data-handleid="${handleId}"]`);

/**
 * Edges React Flow has actually PAINTED. Counts edge GROUPS, not paths — React Flow renders
 * several <path> elements per edge (the wide invisible interaction path plus the visible
 * one), so counting paths triples the answer. An edge whose target handle is missing from
 * the DOM produces no group at all, which is exactly the failure being guarded against.
 */
async function paintedEdgeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.react-flow__edge')).filter((edge) =>
        Array.from(edge.querySelectorAll('path')).some((p) => {
          const d = p.getAttribute('d');
          return typeof d === 'string' && d.trim().length > 0 && !d.includes('NaN');
        }),
      ).length,
  );
}

/** Drags from a source handle to a target handle the way a user does. */
async function dragConnect(
  page: Page,
  from: { nodeId: string; handleId: string },
  to: { nodeId: string; handleId: string },
): Promise<void> {
  await viewportSettled(page);
  const source = await handleLocator(page, from.nodeId, from.handleId).boundingBox();
  const target = await handleLocator(page, to.nodeId, to.handleId).boundingBox();
  if (!source || !target) {
    throw new Error(
      `[studio:veo-refs:e2e:bench] missing handle box: ${from.nodeId}/${from.handleId} → ${to.nodeId}/${to.handleId}`,
    );
  }

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  // A short move off the handle, then a settle: React Flow enters its connecting state on the
  // first pointermove after pointerdown, and dropping in the same tick lands before it does.
  await page.mouse.move(source.x + 40, source.y + 10, { steps: 5 });
  await page.waitForTimeout(300);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

async function storedEdges(
  supabase: SupabaseClient,
  roomId: string,
): Promise<Array<{ target?: string; targetHandle?: string }>> {
  const { data } = await brandProfiles(supabase)
    .from('canvas_sessions')
    .select('edges')
    .eq('brand_profile_id', BRAND_ID)
    .eq('room_id', roomId)
    .maybeSingle();
  return (data?.edges as Array<{ target?: string; targetHandle?: string }>) ?? [];
}

test.describe('veo reference connections', () => {
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

    await brandProfiles(supabase).from('canvas_rooms').delete().in('id', BENCH_ROOM_IDS);

    // Room 1: a Veo 3.1 node in images mode + a Pixverse node (the only model that renders
    // the SINGULAR alias) — both waiting to be wired by hand.
    await seedRoom(supabase, REFS_ROOM_ID, 'Bench Veo Refs', {
      nodes: [
        imageNode('bench-img-veo', 0, 0),
        makeNode(
          'bench-veo31',
          'videoGen',
          { x: 480, y: 0 },
          {
            model: 'veo-3.1',
            referenceMode: 'images',
            prompt: 'bench veo 3.1 references',
          },
        ),
        imageNode('bench-img-pix', 0, 520),
        makeNode(
          'bench-pixverse',
          'videoGen',
          { x: 480, y: 520 },
          {
            model: 'pixverse-v6',
            prompt: 'bench pixverse reference',
          },
        ),
      ],
      edges: [],
    });

    // Room 2: a Veo 3.1 FAST node in frames mode, already wired first-frame + last-frame.
    // This is Kevin's screenshot: switching it to Veo 3.1 removed both connections.
    await seedRoom(supabase, SWITCH_ROOM_ID, 'Bench Veo Switch', {
      nodes: [
        imageNode('bench-img-first', 0, 0),
        imageNode('bench-img-last', 0, 320),
        makeNode(
          'bench-veofast',
          'videoGen',
          { x: 480, y: 0 },
          {
            model: 'veo-3.1-fast',
            referenceMode: 'frames',
            prompt: 'bench frames',
          },
        ),
      ],
      edges: [
        {
          id: 'bench-e-first',
          source: 'bench-img-first',
          sourceHandle: 'image',
          target: 'bench-veofast',
          targetHandle: 'first-frame',
          type: 'dataType',
          data: { dataType: 'image', pathType: 'bezier' },
        },
        {
          id: 'bench-e-last',
          source: 'bench-img-last',
          sourceHandle: 'image',
          target: 'bench-veofast',
          targetHandle: 'last-frame',
          type: 'dataType',
          data: { dataType: 'image', pathType: 'bezier' },
        },
      ],
    });

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
    await brandProfiles(supabase).from('canvas_rooms').delete().in('id', BENCH_ROOM_IDS);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('a Veo 3.1 node in images mode draws the reference handle the graph keeps', async () => {
    await openCanvas(page, REFS_ROOM_ID);
    await expect(nodeLocator(page, 'bench-veo31')).toBeVisible({ timeout: 60_000 });

    // The regression drew `ref-image`; the store rewrote edges to `ref-images`, which was
    // then absent from the DOM. Assert the drawn id directly.
    await expect(handleLocator(page, 'bench-veo31', 'ref-images')).toHaveCount(1);
    await expect(handleLocator(page, 'bench-veo31', 'ref-image')).toHaveCount(0);
  });

  test('dragging an image onto it produces an edge that is actually PAINTED', async () => {
    await openCanvas(page, REFS_ROOM_ID);
    await expect(nodeLocator(page, 'bench-veo31')).toBeVisible({ timeout: 60_000 });
    expect(await paintedEdgeCount(page)).toBe(0);

    await dragConnect(
      page,
      { nodeId: 'bench-img-veo', handleId: 'image' },
      { nodeId: 'bench-veo31', handleId: 'ref-images' },
    );

    await expect.poll(() => paintedEdgeCount(page), { timeout: 20_000 }).toBe(1);
  });

  test('the painted edge survives a reload — it reached the database intact', async () => {
    const supabase = admin();
    await expect
      .poll(async () => (await storedEdges(supabase, REFS_ROOM_ID)).length, { timeout: 30_000 })
      .toBe(1);

    const [edge] = await storedEdges(supabase, REFS_ROOM_ID);
    expect(edge.target).toBe('bench-veo31');
    expect(edge.targetHandle).toBe('ref-images');

    await openCanvas(page, REFS_ROOM_ID);
    await expect(nodeLocator(page, 'bench-veo31')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => paintedEdgeCount(page), { timeout: 30_000 }).toBe(1);
  });

  test('pixverse-v6 draws the singular alias and accepts an image on it', async () => {
    await openCanvas(page, REFS_ROOM_ID);
    await expect(nodeLocator(page, 'bench-pixverse')).toBeVisible({ timeout: 60_000 });

    await expect(handleLocator(page, 'bench-pixverse', 'ref-image')).toHaveCount(1);
    await expect(handleLocator(page, 'bench-pixverse', 'ref-images')).toHaveCount(0);

    const before = await paintedEdgeCount(page);
    await dragConnect(
      page,
      { nodeId: 'bench-img-pix', handleId: 'image' },
      { nodeId: 'bench-pixverse', handleId: 'ref-image' },
    );

    await expect.poll(() => paintedEdgeCount(page), { timeout: 20_000 }).toBe(before + 1);
  });

  test('switching Veo 3.1 Fast → Veo 3.1 keeps both frame connections', async () => {
    await openCanvas(page, SWITCH_ROOM_ID);
    await expect(nodeLocator(page, 'bench-veofast')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => paintedEdgeCount(page), { timeout: 30_000 }).toBe(2);

    await nodeLocator(page, 'bench-veofast').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Model' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Veo 3.1', exact: true }).click();

    // The whole point: veo-3.1 supports frames, so the mode carries over and NOTHING is cut.
    await expect(page.getByText(/incompatible connection/i)).toHaveCount(0);
    await expect(handleLocator(page, 'bench-veofast', 'first-frame')).toHaveCount(1);
    await expect.poll(() => paintedEdgeCount(page), { timeout: 20_000 }).toBe(2);

    const supabase = admin();
    await expect
      .poll(async () => (await storedEdges(supabase, SWITCH_ROOM_ID)).length, { timeout: 30_000 })
      .toBe(2);
  });
});
