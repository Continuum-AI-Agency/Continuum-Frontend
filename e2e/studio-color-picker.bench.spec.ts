import { createNodeData } from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';

// Colour picker bench — the hop happy-dom cannot reach.
//
// `studio:config-controls:bench` already proves, for EVERY op in the registry, that a
// `#rrggbb` schema field mounts a picker rather than a text box. What it cannot prove is
// that the picker WORKS: happy-dom does no layout, so a pointer drag across the
// saturation square has no geometry to read, and a popover opened from inside another
// popover has no stacking to get wrong. Both of those are the whole feature.
//
// So this drives the real thing in a real browser: open a chroma-key node's config, open
// the colour popover from inside it, drag on the saturation square, and read the colour
// back OUT OF THE PERSISTED NODE CONFIG — not out of the swatch, which would only prove
// the picker agrees with itself.
//
// Prerequisites (same as the other studio canvas benches, see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run studio:color-picker:bench
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · The eyedropper. `EyeDropper` needs a real screen-capture permission prompt that
//     headless Chromium does not grant; the control is feature-detected and hidden when
//     the API is absent, which `color-field.test.tsx` asserts.
//   · Running the op. Nothing is generated here — this is the CONFIG hop only, and that
//     the chosen colour reaches the pixels is `text:render:bench`'s claim.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ROOM_ID = '00000000-0000-4000-8000-00000000ca07';
const NODE_ID = 'colour-chroma';

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[studio:color-picker:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function brandProfiles(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient }).schema('brand_profiles');
}

/** The REAL creation path — the same helper the add menu and the agent writer call. */
function makeNode(id: string, position: { x: number; y: number }) {
  const created = createNodeData('action', { actionId: 'image.chromaKey' });
  const style = created.style;
  return {
    id,
    type: 'action',
    position,
    data: created.data,
    ...(style ? { style, width: style.width, height: style.height } : {}),
  };
}

async function seedRoom(supabase: SupabaseClient) {
  await brandProfiles(supabase)
    .from('canvas_rooms')
    .upsert(
      {
        id: ROOM_ID,
        brand_profile_id: BRAND_ID,
        name: 'Bench Colour Picker',
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
        nodes: [makeNode(NODE_ID, { x: 0, y: 0 })],
        edges: [],
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

async function openCanvas(page: Page) {
  await page.goto(`/ai-studio?roomId=${ROOM_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByTestId('studio-canvas-header')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(`.react-flow__node[data-id="${NODE_ID}"]`)).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('studio colour picker — a colour you point at, not one you type', () => {
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
    await seedRoom(supabase);

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

  test('a drag on the saturation square writes a new colour into the node config', async () => {
    await openCanvas(page);

    // Popover inside popover: the op's settings, and the colour picker opened from within
    // it. If the second one renders behind the first, or the first closes when the second
    // opens, everything below this line fails.
    await page.getByLabel('Operation settings').click();
    const settings = page.locator('[data-slot="popover-content"]').last();
    await expect(settings).toBeVisible({ timeout: 15_000 });
    const swatch = settings.getByLabel('Color colour');
    await expect(swatch).toBeVisible({ timeout: 15_000 });
    await expect(swatch).toContainText('#00ff00');

    // ONE implementation, TWO surfaces — the gear popover and the selection inspector both
    // mount `ActionConfigFields`, and the comment at the top of that file says they can
    // never disagree. Two pickers for one field is what that sentence looks like in a browser.
    await expect(page.getByTestId('node-inspector').getByLabel('Color colour')).toContainText(
      '#00ff00',
    );

    await swatch.click();
    const selection = page.locator('[data-slot="color-picker-selection"]');
    await expect(selection).toBeVisible({ timeout: 15_000 });

    // A real pointer drag across real geometry — the one thing happy-dom cannot do. Land
    // well inside the square so the result is neither pure white nor pure black.
    const area = await selection.boundingBox();
    expect(area, 'the saturation square rendered with no geometry').not.toBeNull();
    if (!area) return;
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.75, area.y + area.height * 0.35, { steps: 8 });
    await page.mouse.up();

    const hexBox = page.getByLabel('Hex colour');
    const picked = await hexBox.inputValue();
    expect(picked, `the picker reported "${picked}"`).toMatch(/^#[0-9a-f]{6}$/);
    expect(picked, 'the drag left the colour where it started').not.toBe('#00ff00');

    // FIRST ANCHOR — the OTHER surface. The inspector's picker was never touched; it can
    // only be showing the new colour if the drag reached the node's config. That is the
    // difference between "the control agrees with itself" and "the node changed".
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-inspector').getByLabel('Color colour')).toContainText(
      picked,
      { timeout: 15_000 },
    );

    // SECOND ANCHOR — the persisted row. Canvas autosave is debounced, so this polls; a
    // colour that never lands here is a colour the next session will not see.
    const supabase = admin();
    await expect
      .poll(
        async () => {
          const { data } = await brandProfiles(supabase)
            .from('canvas_sessions')
            .select('nodes')
            .eq('brand_profile_id', BRAND_ID)
            .eq('room_id', ROOM_ID)
            .maybeSingle();
          const nodes = (data?.nodes ?? []) as Array<{
            id: string;
            data?: { config?: Record<string, unknown> };
          }>;
          return nodes.find((node) => node.id === NODE_ID)?.data?.config?.color ?? null;
        },
        { timeout: 60_000, intervals: [1_000, 2_000, 5_000] },
      )
      .toBe(picked);
  });
});
