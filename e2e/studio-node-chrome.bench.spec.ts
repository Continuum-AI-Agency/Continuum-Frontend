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
// The node-chrome ticket wave (Airtable #284, #297, #295, #283, #292) added four more
// measurements, all read from the REAL rendered boxes and all GENERIC — they run over
// every seeded node, so the next node to make the same mistake fails here:
//   · draggable — no `nodrag` between the node root and its body, or its title bar.
//     `nodrag` is React Flow's own "never start a drag here" class; a node whose whole
//     NodeContent carries it cannot be moved at all. Two nodes are then really dragged
//     with the mouse and their position asserted to change.
//   · the card fills the node box — `Card`'s default width is `w-sm` (384px), so a node
//     created 420 wide drew a 384px card and the NodeResizer's handles floated 36px clear
//     of what the node actually rendered.
//   · nothing paints over the node's own title — `document.elementFromPoint` across the
//     title label must hit the label, not a floating pill parked at `top-2`.
//   · no config field a mode ignores — `video.extractFrames` with `mode: 'single'` reads
//     `atSec` and never `count`, so `count` is not offered.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · The form-heavy nodes' interior below the first fold (apiRender's variable fields,
//     publishing's target search). Those are scroll regions; only their chrome is asserted.
//   · Any node's behaviour. Nothing is run, generated or published here.
//   · Hover-revealed overlay controls. The floating Run button is asserted PRESENT and
//     inside its node, not that it reveals on hover — that is a CSS transition.
//   · The Design Reference's SPECIMEN. The bench brand has no design system, so the
//     specimen pane renders its empty state and Generate is disabled. What is asserted is
//     the layout contract — the token pane scrolls and Generate does not sit on it — not a
//     generated plate.
//   · Whether a dragged node's new position SURVIVES a reload. The drag is asserted at the
//     rendered transform; persistence is `canvas_sessions`' own bench.

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

// The nodes the node-chrome tickets name. Seeded alongside CASES; the edge-to-edge test
// runs over CASES only (these carry control strips and padded bodies by design), while
// every geometry test below runs over both lists.
const CHROME_CASES = [
  // #284 and #297: both put `nodrag` on their whole NodeContent.
  { id: 'chrome-layers', type: 'layerEditor', overrides: {} },
  { id: 'chrome-video', type: 'video', overrides: {} },
  // The third instance of the same mistake, which neither ticket named.
  { id: 'chrome-element', type: 'element', overrides: {} },
  // #295: the Style pill over the title, and a card narrower than its own node box.
  { id: 'chrome-hyperframes', type: 'hyperframesAgent', overrides: {} },
  // #283: title truncated, body clipped mid-word, Generate floating on the text.
  {
    id: 'chrome-designref',
    type: 'designRef',
    overrides: {
      mode: 'both',
      section: null,
      tokenSummary:
        'Typefaces: Playfair Display, Instrument Sans, Instrument Serif and JetBrains Mono. ' +
        'No other family may appear. Display copy sets in Playfair at 48/56 with -2% tracking; ' +
        'body copy sets in Instrument Sans at 16/24. Numerals are tabular everywhere a column ' +
        'of figures can occur. Never letterspace lowercase. Never synthesise a weight the ' +
        'family does not ship — if the weight is missing, change the family, not the render.',
    },
  },
  // #292: the reporter's exact config — five frames asked for, one returned.
  {
    id: 'chrome-frames',
    type: 'action',
    overrides: { actionId: 'video.extractFrames', config: { mode: 'single', count: 4 } },
  },
] as const;

const ALL_CASES = [...CASES, ...CHROME_CASES] as ReadonlyArray<{
  id: string;
  type: string;
  overrides: Record<string, unknown>;
}>;

function buildGraph(): { nodes: SeededNode[]; edges: unknown[] } {
  // A grid rather than a row: eleven nodes on one line zooms fitView down far enough that
  // a pointer drag no longer resolves. Four per row keeps every node comfortably clear of
  // the floating toolbar (top-left) and the composer bar (bottom), both of which paint
  // OVER nodes — and an element screenshot captures whatever is on top of it.
  const nodes = ALL_CASES.map((testCase, index) =>
    makeNode(
      testCase.id,
      testCase.type,
      { x: (index % 4) * 560, y: Math.floor(index / 4) * 620 },
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

/**
 * The four chrome facts, all read off the REAL rendered boxes.
 *
 * `nodrag` is React Flow's own class: a pointerdown whose element chain up to the node
 * carries it never starts a drag. So "does this node drag from here" is literally "is
 * there a `nodrag` between here and the node root", and that is what is measured — no
 * heuristic, the same predicate the library uses.
 */
async function nodeChrome(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!node) return null;
    const card = node.querySelector('[data-slot="card"]') as HTMLElement | null;
    const body = node.querySelector('[data-slot="card-content"]') as HTMLElement | null;
    const title = node.querySelector('[data-slot="node-title"]') as HTMLElement | null;
    if (!card || !body) return null;

    const box = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    /** The first `nodrag` between `el` and the node root, or null when the drag can start. */
    const blockedBy = (el: Element | null): string | null => {
      for (let cursor = el; cursor && cursor !== node; cursor = cursor.parentElement) {
        if (cursor.classList.contains('nodrag')) return String(cursor.className).slice(0, 90);
      }
      return null;
    };

    // Whatever the NODE paints on its own title. An ancestor (the bar, the card) is not a
    // cover, and neither is app chrome that happens to float above the canvas — the
    // floating toolbar overlaps whatever node fitView parks under it, which is a fact about
    // where this bench puts nodes, not about the node. The defect #295 filed is a node's
    // OWN child painted over its OWN title, so the hit has to be inside the node.
    let titleCoveredBy: string | null = null;
    if (title) {
      const rect = title.getBoundingClientRect();
      for (const fraction of [0.04, 0.2, 0.5, 0.8]) {
        const hit = document.elementFromPoint(
          rect.left + rect.width * fraction,
          rect.top + rect.height / 2,
        );
        if (!hit || !node.contains(hit)) continue;
        if (hit === title || title.contains(hit) || hit.contains(title)) continue;
        titleCoveredBy = `${hit.tagName}.${String(hit.className).slice(0, 90)}`;
        break;
      }
    }

    return {
      nodeBox: box(node),
      cardBox: box(card),
      bodyBlockedBy: blockedBy(body),
      titleBlockedBy: title ? blockedBy(title) : null,
      hasTitleBar: Boolean(title),
      titleCoveredBy,
      titleBox: title ? box(title) : null,
      titleText: title?.textContent ?? null,
      titleTruncated: title ? title.scrollWidth > title.clientWidth + 1 : null,
    };
  }, nodeId);
}

/** The node's own transform, in flow coordinates — what a drag has to change. */
async function nodeTranslate(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
    const match = /translate\(\s*(-?[\d.]+)px[,\s]+(-?[\d.]+)px/.exec(node?.style.transform ?? '');
    if (!match?.[1] || !match[2]) return null;
    return { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) };
  }, nodeId);
}

/** A real mouse drag from a point inside the node, in screen pixels. */
async function dragBy(
  page: Page,
  origin: { x: number; y: number },
  delta: { x: number; y: number },
) {
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + delta.x / 2, origin.y + delta.y / 2, { steps: 6 });
  // A human drag is not six instant frames: without a tick React Flow's position update
  // has not rendered by the time the button comes up, and the node reads as unmoved.
  await page.waitForTimeout(60);
  await page.mouse.move(origin.x + delta.x, origin.y + delta.y, { steps: 6 });
  await page.waitForTimeout(60);
  await page.mouse.up();
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

    // `degrees` is −360…360 at step 1 — a range a drag CAN resolve — so the panel draws a
    // fader, not a number box. Its id lives on the field, and the value round-trips through
    // node data, so reading it back is the proof the write landed.
    const degrees = inspector.locator('[data-slot="slider-field"]').filter({ hasText: 'Degrees' });
    await expect(degrees).toBeVisible();
    const range = degrees.locator('input[type="range"]');
    await expect(range).toHaveValue('90');

    // It is the WRITE path, not a readout — the same `useNodeConfigPatch` the gear uses.
    // Clicking the middle of the track asks for the midpoint of −360…360.
    const track = degrees.locator('[data-slot="slider-track"]');
    const trackBox = await track.boundingBox();
    expect(trackBox).not.toBeNull();
    if (trackBox) {
      await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2);
    }
    await expect
      .poll(async () => Number.parseFloat((await range.inputValue()) || 'NaN'))
      .toBeLessThan(60);
    expect(Number.parseFloat(await range.inputValue())).toBeGreaterThan(-60);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/action-inspector.png` });
  });

  // ── the node-chrome ticket wave ───────────────────────────────────────────────────

  test('every node drags from its body and from its title bar', async () => {
    await openCanvas(page);
    await expect(nodeBox(page, 'chrome-action')).toBeVisible({ timeout: 60_000 });

    const blocked: string[] = [];
    for (const testCase of ALL_CASES) {
      await expect(nodeBox(page, testCase.id)).toBeVisible({ timeout: 30_000 });
      const chrome = await nodeChrome(page, testCase.id);
      expect(chrome, `${testCase.type}: node did not render a card + body`).not.toBeNull();
      if (!chrome) continue;
      if (chrome.bodyBlockedBy) blocked.push(`${testCase.type} body → ${chrome.bodyBlockedBy}`);
      if (chrome.titleBlockedBy) blocked.push(`${testCase.type} title → ${chrome.titleBlockedBy}`);
    }

    // `nodrag` on a whole NodeContent is React Flow refusing to start a drag from the node
    // at all — the defect behind #284 and #297, and the shape every node with an interior
    // drop zone can repeat. It belongs on the controls.
    expect(blocked, 'nodrag between a node root and its own body or title bar').toEqual([]);
  });

  test("nothing paints over a node's own title", async () => {
    await openCanvas(page);
    await expect(nodeBox(page, 'chrome-hyperframes')).toBeVisible({ timeout: 60_000 });

    const covered: string[] = [];
    const truncated: string[] = [];
    for (const testCase of ALL_CASES) {
      const chrome = await nodeChrome(page, testCase.id);
      if (!chrome?.hasTitleBar) continue;
      if (chrome.titleCoveredBy) {
        covered.push(`${testCase.id} "${chrome.titleText}" ← ${chrome.titleCoveredBy}`);
      }
      if (chrome.titleTruncated) {
        truncated.push(
          `${testCase.id} "${chrome.titleText}" in ${chrome.titleBox?.width.toFixed(0)}px`,
        );
      }
    }

    // #295: a Style pill parked at `left-2 top-2` on a node that HAS a title bar painted
    // over the first characters of it, so the header read "…mes Agent".
    expect(covered, 'a floating control is painted over a node title').toEqual([]);
    // #283: "Design Referen…" — the mode select's widest option starved the title.
    expect(truncated, 'a node title is truncated at its default width').toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/titles.png` });
  });

  test('the card fills its node box, so the selection handles bound what is rendered', async () => {
    await openCanvas(page);
    await expect(nodeBox(page, 'chrome-hyperframes')).toBeVisible({ timeout: 60_000 });

    const drift: string[] = [];
    for (const testCase of ALL_CASES) {
      const chrome = await nodeChrome(page, testCase.id);
      if (!chrome) continue;
      const widthGap = Math.abs(chrome.nodeBox.width - chrome.cardBox.width);
      const heightGap = Math.abs(chrome.nodeBox.height - chrome.cardBox.height);
      if (widthGap > 2 || heightGap > 2) {
        drift.push(
          `${testCase.type}: node ${chrome.nodeBox.width.toFixed(0)}×${chrome.nodeBox.height.toFixed(0)} vs card ${chrome.cardBox.width.toFixed(0)}×${chrome.cardBox.height.toFixed(0)}`,
        );
      }
    }
    // #295's "flying point in the end": `Card` defaults to `w-sm` (384px), so a node created
    // 420 wide drew a 384px card and the resizer's handles sat 36px clear of it.
    expect(drift, 'a card does not fill its own node box').toEqual([]);

    // And the handles themselves, on the node the ticket filed.
    const hyper = nodeBox(page, 'chrome-hyperframes');
    await hyper.click({ position: { x: 12, y: 4 } });
    const handles = page.locator(
      '.react-flow__node[data-id="chrome-hyperframes"] .react-flow__resize-control.handle',
    );
    await expect(handles.first()).toBeVisible({ timeout: 15_000 });

    const cardRect = await hyper.locator('[data-slot="card"]').boundingBox();
    expect(cardRect).not.toBeNull();
    const count = await handles.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const handle = await handles.nth(index).boundingBox();
      if (!handle || !cardRect) continue;
      const centre = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      expect(centre.x, `handle ${index} sits left of the card`).toBeGreaterThanOrEqual(
        cardRect.x - 2,
      );
      expect(centre.x, `handle ${index} sits right of the card`).toBeLessThanOrEqual(
        cardRect.x + cardRect.width + 2,
      );
      expect(centre.y, `handle ${index} sits above the card`).toBeGreaterThanOrEqual(
        cardRect.y - 2,
      );
      expect(centre.y, `handle ${index} sits below the card`).toBeLessThanOrEqual(
        cardRect.y + cardRect.height + 2,
      );
    }

    await hyper.screenshot({ path: `${SCREENSHOT_DIR}/hyperframes-selected.png` });
  });

  test('the Design Reference body is readable, and Generate does not sit on it', async () => {
    await openCanvas(page);
    const designRef = nodeBox(page, 'chrome-designref');
    await expect(designRef).toBeVisible({ timeout: 60_000 });

    const pane = designRef.getByTestId('design-ref-tokens');
    await expect(pane).toBeVisible({ timeout: 15_000 });

    // styleguide.md §4: bound the frame, put the overflow in an inner scroll pane.
    // "Clipping is a bug" — so the last line has to be REACHABLE, not merely present.
    const scroll = await pane.evaluate((el) => {
      const style = getComputedStyle(el);
      el.scrollTop = el.scrollHeight;
      return {
        overflowY: style.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrolledTo: el.scrollTop + el.clientHeight,
      };
    });
    expect(['auto', 'scroll'], 'the token pane must be able to scroll').toContain(scroll.overflowY);
    expect(scroll.scrolledTo, 'the end of the summary is unreachable').toBeGreaterThanOrEqual(
      scroll.scrollHeight - 2,
    );

    // The blue button floating on top of the text is the other half of #283.
    const generate = designRef.getByRole('button', { name: /Generate|Regenerate/ });
    await expect(generate).toBeVisible();
    const paneRect = await pane.boundingBox();
    const generateRect = await generate.boundingBox();
    expect(paneRect).not.toBeNull();
    expect(generateRect).not.toBeNull();
    if (paneRect && generateRect) {
      const overlaps =
        generateRect.x < paneRect.x + paneRect.width &&
        generateRect.x + generateRect.width > paneRect.x &&
        generateRect.y < paneRect.y + paneRect.height &&
        generateRect.y + generateRect.height > paneRect.y;
      expect(overlaps, 'Generate is painted over the token summary').toBe(false);
    }

    await designRef.screenshot({ path: `${SCREENSHOT_DIR}/design-reference.png` });
  });

  test('Extract Frames offers no config field the selected mode ignores', async () => {
    await openCanvas(page);
    const frames = nodeBox(page, 'chrome-frames');
    await expect(frames).toBeVisible({ timeout: 60_000 });
    await frames.click({ position: { x: 20, y: 60 } });

    const inspector = page.getByTestId('node-inspector');
    await expect(inspector).toBeVisible({ timeout: 15_000 });
    // The control id carries the node id, so this is unambiguously `chrome-frames`' own
    // config rather than whatever the inspector had open before.
    const modeSelect = inspector.locator('#action-config-chrome-frames-mode');
    await expect(modeSelect).toBeVisible({ timeout: 15_000 });

    // The reporter's config: mode 'single' with count 4. `single` takes ONE frame at
    // `atSec` and never reads `count`, so offering `count` is the bug (#292).
    await expect(inspector.getByText('At Seconds', { exact: true })).toBeVisible();
    await expect(inspector.getByText('Count', { exact: true })).toHaveCount(0);
    await expect(inspector.getByText('Interval Seconds', { exact: true })).toHaveCount(0);
    await expect(inspector.getByText('Threshold', { exact: true })).toHaveCount(0);

    // Every mode is still reachable, and picking one swaps in the field it DOES read.
    await modeSelect.click();
    await page.getByRole('option', { name: 'evenly', exact: true }).click();

    await expect(inspector.getByText('Count', { exact: true })).toBeVisible();
    await expect(inspector.getByText('At Seconds', { exact: true })).toHaveCount(0);

    await inspector.screenshot({ path: `${SCREENSHOT_DIR}/extract-frames-inspector.png` });
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

  // LAST on purpose: dragging moves nodes, and every test above reads their geometry.
  test('a real pointer drag from the body moves the node', async () => {
    await openCanvas(page);

    for (const nodeId of ['chrome-layers', 'chrome-video']) {
      const locator = nodeBox(page, nodeId);
      await expect(locator).toBeVisible({ timeout: 60_000 });
      const before = await nodeTranslate(page, nodeId);
      const rect = await locator.boundingBox();
      expect(before, `${nodeId}: no transform to read`).not.toBeNull();
      expect(rect).not.toBeNull();
      if (!before || !rect) continue;

      // The centre of the body: past the badge and the Edit button, on the surface the
      // ticket says cannot be grabbed.
      await dragBy(
        page,
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        { x: 90, y: 60 },
      );

      // Poll, don't read once: React Flow writes the new position through React state, so
      // the transform lands on the next render rather than on `mouse.up()`.
      await expect
        .poll(async () => (await nodeTranslate(page, nodeId))?.x ?? before.x, {
          message: `${nodeId} did not move right`,
        })
        .toBeGreaterThan(before.x + 5);
      const after = await nodeTranslate(page, nodeId);
      expect(after, `${nodeId}: no transform after the drag`).not.toBeNull();
      expect(after ? after.y - before.y : 0, `${nodeId} did not move down`).toBeGreaterThan(5);
    }

    // And from the title bar, on a node that has one.
    const hyper = nodeBox(page, 'chrome-hyperframes');
    const beforeHyper = await nodeTranslate(page, 'chrome-hyperframes');
    const titleRect = await hyper.locator('[data-slot="node-title"]').boundingBox();
    expect(beforeHyper).not.toBeNull();
    expect(titleRect).not.toBeNull();
    if (beforeHyper && titleRect) {
      await dragBy(
        page,
        { x: titleRect.x + titleRect.width / 2, y: titleRect.y + titleRect.height / 2 },
        { x: 80, y: 50 },
      );
      await expect
        .poll(async () => (await nodeTranslate(page, 'chrome-hyperframes'))?.x ?? beforeHyper.x, {
          message: 'hyperframes did not drag by its header',
        })
        .toBeGreaterThan(beforeHyper.x + 5);
      const afterHyper = await nodeTranslate(page, 'chrome-hyperframes');
      expect(afterHyper).not.toBeNull();
      expect(
        afterHyper ? afterHyper.y - beforeHyper.y : 0,
        'hyperframes did not drag by its header',
      ).toBeGreaterThan(5);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/after-drag.png` });
  });
});
