import { createNodeData } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';

// Node chrome bench — the edge-to-edge conversion of the block nodes.
//
// The claim under test is SPATIAL: after moving every block node onto the shared
// `NodeChrome` title bar and deleting the `rounded border` box that used to sit inside a
// padded `NodeContent`, the node's body should be the preview — not a container drawn
// inside a container. That is a layout fact, so it needs a real browser: happy-dom does
// no layout, and the unit tests can only prove the right strings render.
//
// Two measurements per node, both read from the REAL rendered boxes:
//   · body fill — the NodeContent box covers the node minus the title bar, within 2px.
//     A surviving inner container or leftover padding shows up here as lost area.
//   · no nested chrome — the node draws at most ONE bordered surface inside its body.
//
// Screenshots land in e2e/__screenshots__/studio-node-chrome for human sign-off. The
// geometry is asserted; whether it LOOKS right stays a human call.
//
// Prerequisites (same as studio-canvas-geometry.spec.ts, see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:fe:local-supabase   (PORT=3001)
//   Run with: bun run studio:node-chrome:bench
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · The form-heavy nodes' interior below the first fold (apiRender's variable fields,
//     publishing's target search). Those are scroll regions; only their chrome is asserted.
//   · Any node's behaviour. Nothing is run, generated or published here.
//   · Hover-revealed overlay controls. The floating Run button is asserted PRESENT and
//     inside its node, not that it reveals on hover — that is a CSS transition.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ROOM_ID = '00000000-0000-4000-8000-00000000ca03';

const SCREENSHOT_DIR =
  process.env.STUDIO_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/studio-node-chrome';

// The title bar is one shared constant in NodeChrome.tsx (`h-6`). Asserting the number
// here is what makes a future padding creep fail loudly instead of silently.
const TITLE_BAR_PX = 24;

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[studio:node-chrome:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
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

/** The REAL creation path — the same helper the add menu and the agent writer call. */
function makeNode(
  id: string,
  type: string,
  position: { x: number; y: number },
  overrides: Record<string, unknown> = {},
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

// One of each node the conversion touched. `action` carries a real op so the node renders
// its populated state (title, modality badge, config gear, floating Run) rather than the
// inert pick-an-operation placeholder.
const CASES = [
  { id: 'chrome-action', type: 'action', overrides: { actionId: 'image.rotate' } },
  { id: 'chrome-router', type: 'router', overrides: {} },
  { id: 'chrome-export', type: 'export', overrides: {} },
  { id: 'chrome-batch', type: 'batch', overrides: {} },
  // The widest config in the catalog. Its controls were laid out for a 288px popover;
  // the inspector is 320px, so this is the case that would overflow if any of them
  // carried a fixed width.
  { id: 'chrome-overlay', type: 'action', overrides: { actionId: 'video.overlay' } },
] as const;

function buildGraph(): { nodes: SeededNode[]; edges: unknown[] } {
  const nodes = CASES.map((testCase, index) =>
    makeNode(
      testCase.id,
      testCase.type,
      // One row, so fitView centres them in the clear band between the floating
      // toolbar (top-left) and the composer bar (bottom) — both paint OVER nodes, and an
      // element screenshot captures whatever is on top of it.
      { x: index * 360, y: 0 },
      testCase.overrides,
    ),
  );
  return { nodes, edges: [] };
}

async function seedRoom(supabase: SupabaseClient, graph: { nodes: unknown[]; edges: unknown[] }) {
  await brandProfiles(supabase)
    .from('canvas_rooms')
    .upsert(
      { id: ROOM_ID, brand_profile_id: BRAND_ID, name: 'Bench Node Chrome', created_by: OWNER_ID },
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
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string) {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

const nodeBox = (page: Page, nodeId: string) =>
  page.locator(`.react-flow__node[data-id="${nodeId}"]`);

/**
 * Layout px, not screen px — React Flow scales the viewport, so `boundingBox()` numbers
 * are unreadable while `offsetWidth/offsetHeight` read the element's own resolved box.
 */
async function bodyFill(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!node) return null;
    const card = node.querySelector('[data-slot="card"]') as HTMLElement | null;
    const body = node.querySelector('[data-slot="card-content"]') as HTMLElement | null;
    if (!card || !body) return null;
    // Every bordered/filled surface drawn INSIDE the body. One is the body itself when it
    // carries the preview background; more than one is a container inside a container.
    const nested = Array.from(body.querySelectorAll('*')).filter((el) => {
      const style = getComputedStyle(el as HTMLElement);
      const borders = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ].filter((w) => Number.parseFloat(w) > 0).length;
      const rounded = Number.parseFloat(style.borderRadius) > 0;
      return borders === 4 && rounded && (el as HTMLElement).offsetHeight > 40;
    }).length;
    const label = body.querySelector('span, img, video, p');
    return {
      bodyBg: getComputedStyle(body).backgroundColor,
      cardBg: getComputedStyle(card).backgroundColor,
      labelColor: label ? getComputedStyle(label as HTMLElement).color : null,
      bodyClass: body.className,
      cardHeight: card.offsetHeight,
      cardWidth: card.offsetWidth,
      bodyHeight: body.offsetHeight,
      bodyWidth: body.offsetWidth,
      nestedBoxes: nested,
    };
  }, nodeId);
}

async function openCanvas(page: Page) {
  await page.goto(`/ai-studio?roomId=${ROOM_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByTestId('studio-canvas-header')).toBeVisible({ timeout: 120_000 });
}

test.describe('studio node chrome — edge to edge', () => {
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

    await brandProfiles(supabase).from('canvas_rooms').delete().eq('id', ROOM_ID);
    await seedRoom(supabase, buildGraph());

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
    await brandProfiles(supabase).from('canvas_rooms').delete().eq('id', ROOM_ID);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('every converted node fills its body edge-to-edge, with no container inside the container', async () => {
    await openCanvas(page);
    await expect(nodeBox(page, 'chrome-action')).toBeVisible({ timeout: 60_000 });

    const measured: Record<string, Awaited<ReturnType<typeof bodyFill>>> = {};
    for (const testCase of CASES) {
      await expect(nodeBox(page, testCase.id)).toBeVisible({ timeout: 30_000 });
      measured[testCase.id] = await bodyFill(page, testCase.id);
    }

    for (const testCase of CASES) {
      const box = measured[testCase.id];
      expect(box, `${testCase.type}: node did not render a card + body`).not.toBeNull();
      if (!box) continue;

      // The body owns everything under the title bar. Any survivor of the old
      // `p-2` + `rounded border` shell costs height here.
      expect(
        box.cardHeight - box.bodyHeight,
        `${testCase.type}: body should be the card minus the ${TITLE_BAR_PX}px title bar`,
      ).toBeLessThanOrEqual(TITLE_BAR_PX + 2);
      expect(
        box.bodyWidth,
        `${testCase.type}: body should span the full card width`,
      ).toBeGreaterThanOrEqual(box.cardWidth - 2);
    }

    // The action node is the one the conversion was about: its preview is the body, so it
    // draws no bordered box inside itself at all.
    expect(
      measured['chrome-action']?.nestedBoxes,
      'action: the preview should BE the body, not sit in a box inside it',
    ).toBe(0);
    expect(
      measured['chrome-router']?.nestedBoxes,
      'router: the preview should BE the body, not sit in a box inside it',
    ).toBe(0);

    // globals.css carries `[data-theme="light"] [class*="bg-black"] { background:
    // var(--muted) !important }` and the same for text-white. A preview stage written as
    // `bg-black/90` therefore renders LAVENDER with dark "white" text and nobody notices,
    // because the class is right there in the markup. Semantic tokens only.
    for (const testCase of CASES) {
      const box = measured[testCase.id];
      expect(
        box?.bodyClass,
        `${testCase.type}: bg-black is rewritten to --muted by a global !important — use a semantic token`,
      ).not.toMatch(/bg-black/);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/all-nodes.png` });
    for (const testCase of CASES) {
      await nodeBox(page, testCase.id).screenshot({
        path: `${SCREENSHOT_DIR}/${testCase.type}.png`,
      });
    }
  });

  test('the action node carries its op label, modality badge and a floating Run inside its bounds', async () => {
    await openCanvas(page);
    const action = nodeBox(page, 'chrome-action');
    await expect(action).toBeVisible({ timeout: 60_000 });

    await expect(action.getByText('Rotate')).toBeVisible();
    await expect(action.getByText('Image')).toBeVisible();

    const run = action.getByRole('button', { name: /run/i });
    await expect(run).toBeVisible();

    // Floating, not stacked: the button overlaps the preview rather than reserving a row
    // beneath it, so its box must sit inside the node's own box.
    const nodeRect = await action.boundingBox();
    const runRect = await run.boundingBox();
    expect(nodeRect).not.toBeNull();
    expect(runRect).not.toBeNull();
    if (nodeRect && runRect) {
      expect(runRect.x).toBeGreaterThanOrEqual(nodeRect.x - 1);
      expect(runRect.y).toBeGreaterThanOrEqual(nodeRect.y - 1);
      expect(runRect.x + runRect.width).toBeLessThanOrEqual(nodeRect.x + nodeRect.width + 1);
      expect(runRect.y + runRect.height).toBeLessThanOrEqual(nodeRect.y + nodeRect.height + 1);
    }

    await action.screenshot({ path: `${SCREENSHOT_DIR}/action-closeup.png` });
  });

  test('selecting an action node opens its op config in the right-hand inspector', async () => {
    await openCanvas(page);
    const action = nodeBox(page, 'chrome-action');
    await expect(action).toBeVisible({ timeout: 60_000 });

    // `image.rotate` carries a real registry field (degrees), so an inspector that
    // renders the op's knobs shows a control here — where GenericSection, the fallback
    // this node used to land on, only ever printed a read-only key/value list.
    await action.click({ position: { x: 20, y: 60 } });

    const inspector = page.getByTestId('node-inspector');
    await expect(inspector).toBeVisible({ timeout: 15_000 });

    // The panel titles the OP, not the node type: "Action" names 31 different things.
    await expect(page.getByText('Rotate', { exact: true }).first()).toBeVisible();
    await expect(inspector.getByText('Configuration')).toBeVisible();

    const degrees = inspector.locator('#action-config-chrome-action-degrees');
    await expect(degrees).toBeVisible();

    // It is the WRITE path, not a readout — the same `useNodeConfigPatch` the gear uses.
    await degrees.fill('90');
    await expect(degrees).toHaveValue('90');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/action-inspector.png` });
  });

  test('the widest op config fits the inspector without overflowing it', async () => {
    await openCanvas(page);
    const overlay = nodeBox(page, 'chrome-overlay');
    await expect(overlay).toBeVisible({ timeout: 60_000 });
    await overlay.click({ position: { x: 20, y: 60 } });

    const inspector = page.getByTestId('node-inspector');
    await expect(inspector).toBeVisible({ timeout: 15_000 });

    const overflow = await inspector.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      'overlay config overflows the inspector horizontally',
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await inspector.screenshot({ path: `${SCREENSHOT_DIR}/overlay-inspector.png` });
  });
});
