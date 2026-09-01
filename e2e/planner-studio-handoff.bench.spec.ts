import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// planner:studio-handoff:e2e:bench — Airtable #307 (and the third filing of the same
// seam after #195 and #256).
//
// WHAT IT PROVES: a Planner headless generation opens in AI Studio AS THE BASE, into
// the room the user lands in, WITHOUT eating the canvas they already had open.
//
// Why it has to be a browser bench and not a unit test: the defect was never in the
// seed builder. `buildStarterFlow` has been producing the right graph since #195 —
// prompt node, generator whose own output is the produced image, a generationSignature
// so Run regenerates from it. The bug was one line downstream in
// usePlannerSeedHydration (`if (nodes.length > 0 || edges.length > 0) return`), which
// only fires when a REAL room has REAL prior nodes loaded into the store by realtime
// before the seed hook runs. Nothing short of the real page reaches that line, and a
// bench that called the hook directly would have passed for the whole year the bug
// shipped. So this drives the AFFORDANCE — the same "Open in AI Studio" button in the
// #195 and #256 screenshots — and grades the PERSISTED canvas row, not the store.
//
// The bench OWNS its Backend (support/localBackend.ts) — do not start one yourself.
// The drafts the planner renders are read THROUGH the Backend, and a hand-started
// `bun run dev:be` on :4000 points at PRODUCTION Supabase: the app would read the
// local fixture brand while the Backend read prod, every draft would come back empty,
// and the bench would report a product bug that is really a wiring mistake. Observed
// on this machine — the :4000 process was on nkejqgyushulohxwtytl.supabase.co.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run planner:studio-handoff:e2e:bench
//
// What is REAL here: real local Postgres (organic_calendar_drafts,
// brand_profiles.canvas_rooms/canvas_sessions), real Supabase storage holding the base
// image, real GoTrue password auth, the real planner, the real canvas, real Chrome.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · Real image generation. The "headless generation" is a real PNG uploaded to real
//     storage and referenced by a real signed URL, but no Nano-Banana/Vertex call is
//     made. The seam under test is the handoff, not the generator.
//   · The reel/composition branch. `mediaSuggestion.reel.composition` routes to a
//     different destination entirely ("Edit composition"); only the image post and the
//     realized carousel are driven here.
//   · Realtime fan-out. The local realtime container is down on this machine, which
//     does not affect the graph load (`loadInitialState` is a plain select) but does
//     mean the multi-viewer broadcast path is unproven by this run.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
// Same RFC-4122-valid fixture brand the planner-preview bench uses; the legacy
// …0000b1 brand has a zero version nibble that the Backend's z.uuid() rejects.
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const BUCKET = 'brand-profile-assets';
const BENCH_CLIENT_KEY_PREFIX = 'bench-plstudio-';
const POST_CLIENT_KEY = `${BENCH_CLIENT_KEY_PREFIX}post`;
const CAROUSEL_CLIENT_KEY = `${BENCH_CLIENT_KEY_PREFIX}carousel`;
const POST_TITLE = 'PLSTUDIO Post — the headless generation must open as the base';
const CAROUSEL_TITLE = 'PLSTUDIO Carousel — every realized slide is its own base';
const CAROUSEL_SLIDES = 3;

const BASE_IMAGE_PATH = `${BRAND_ID}/planner-studio-handoff-bench/base.png`;
const slidePath = (index: number) => `${BRAND_ID}/planner-studio-handoff-bench/slide-${index}.png`;

// The node the user must land on, mirroring seedStarterFlow's deterministic ids.
const postGeneratorId = (draftId: string) => `organic-seed-image-${draftId}`;
const carouselGeneratorId = (draftId: string, slide: number) =>
  `organic-seed-carousel-${draftId}-${slide}`;

// The prior work whose survival is the whole point of appending rather than replacing.
const PRIOR_NODE_ID = 'plstudio-prior-note';
const PRIOR_EDGE_ID = 'plstudio-prior-edge';
const PRIOR_NODE_TEXT = 'PLSTUDIO prior work — this must still be here afterwards';

test.use({ channel: 'chrome' });

type CanvasNode = { id: string; data?: Record<string, unknown>; position?: { y?: number } };

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[planner:studio-handoff:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `[planner:studio-handoff:e2e:bench] Refusing to run against a non-local Supabase (${url}). This bench writes drafts and canvas rooms.`,
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function dayIdOffsetFromToday(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// A 1x1 PNG. The bytes only have to be a real decodable image reaching real storage —
// what is under test is whether the URL travels, not what it depicts.
function onePixelPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

async function uploadBaseImage(supabase: SupabaseClient, path: string): Promise<string> {
  await supabase.storage
    .from(BUCKET)
    .upload(path, onePixelPng(), { contentType: 'image/png', upsert: true });
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`[planner:studio-handoff:e2e:bench] could not sign ${path}: ${error?.message}`);
  }
  // Signed URLs come back relative to the Supabase URL in some CLI versions.
  return data.signedUrl.startsWith('http')
    ? data.signedUrl
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${data.signedUrl}`;
}

function realizedAsset(url: string, slideIndex?: number) {
  return {
    role: slideIndex === undefined ? 'primary' : `slide-${slideIndex + 1}`,
    kind: 'image' as const,
    ...(slideIndex === undefined ? {} : { slideIndex }),
    bucket: BUCKET,
    storagePath: slideIndex === undefined ? BASE_IMAGE_PATH : slidePath(slideIndex),
    storageUrl: url,
    mimeType: 'image/png',
  };
}

// A draft as the HEADLESS realize leaves it: media_stage realized, publishingAssets
// written, and mediaSuggestion.assetUrl mirroring only the primary — which is exactly
// the asymmetry that left carousel slides 2..N with no base of their own.
function realizedDraftRow(params: {
  clientKey: string;
  title: string;
  format: string;
  offsetDays: number;
  primaryUrl: string;
  slideUrls: string[];
}) {
  const dayId = dayIdOffsetFromToday(params.offsetDays);
  const isCarousel = params.slideUrls.length > 0;
  const publishingAssets = isCarousel
    ? params.slideUrls.map((url, index) => realizedAsset(url, index))
    : [realizedAsset(params.primaryUrl)];

  return {
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: 'instagram',
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: `${dayId}T12:00:00.000Z`,
    client_key: params.clientKey,
    media_stage: 'realized',
    slot_data: {
      placementId: params.clientKey,
      dayId,
      weekStart: dayId,
      timeLabel: '9:00 AM',
      platform: 'instagram',
      trendId: null,
      title: params.title,
      caption: 'PLSTUDIO caption. The copy rides across as the seeded prompt node.',
      draftSnapshot: {
        id: params.clientKey,
        clientKey: params.clientKey,
        title: params.title,
        summary: 'A headless generation that is fine, but not on brand.',
        timeLabel: '9:00 AM',
        dateLabel: dayId,
        status: 'draft',
        platforms: ['instagram'],
        format: params.format,
        objective: 'Engagement',
        creativeIdea: params.title,
        creativeDirectionPrompt: 'Brand-align this generation without losing the composition.',
        captionPreview: 'PLSTUDIO caption. The copy rides across as the seeded prompt node.',
        tags: [],
        mediaCount: publishingAssets.length,
        ...(isCarousel ? { slideCount: CAROUSEL_SLIDES } : {}),
        publishingAssets,
        mediaSuggestion: {
          mediaStatus: 'ready',
          bucket: BUCKET,
          assetUrl: params.primaryUrl,
          signedUrl: params.primaryUrl,
          assets: publishingAssets.map((asset, index) => ({
            role: asset.role,
            order: index + 1,
            prompt: `Slide ${index + 1} direction from the blueprint.`,
            assetUrl: asset.storageUrl,
            bucket: BUCKET,
            generated: true,
          })),
        },
      },
    },
  };
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

// The /organic page Zod-normalizes EVERY onboarding row the user has, so one malformed
// row (the local stack leaves `state = {}`) takes the whole page down.
async function repairOnboarding(supabase: SupabaseClient): Promise<void> {
  const defaultState = createDefaultOnboardingState({
    id: OWNER_ID,
    email: LOCAL_OWNER_EMAIL,
    role: 'owner',
  } as Parameters<typeof createDefaultOnboardingState>[0]);

  const { data: rows } = await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .select('brand_id, state')
    .eq('user_id', OWNER_ID);

  for (const row of rows ?? []) {
    const state = row.state as Record<string, unknown> | null;
    if (state && typeof state.step === 'number') continue;
    await supabase
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .update({ state: defaultState })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', row.brand_id)
      .throwOnError();
  }

  await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .update({ is_active: false })
    .eq('user_id', OWNER_ID)
    .throwOnError();

  await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .upsert(
      { user_id: OWNER_ID, brand_id: BRAND_ID, state: defaultState, is_active: true },
      { onConflict: 'user_id,brand_id' },
    )
    .throwOnError();
}

// Resolves the very room /ai-studio will land the user in, and fills it with prior
// work. Without this the bench proves nothing: an empty room seeded fine even with the
// bug, which is exactly how the defect survived three filings.
async function seedRoomWithPriorWork(supabase: SupabaseClient): Promise<string> {
  const { data: roomId, error } = await supabase
    .schema('brand_profiles')
    .rpc('ensure_default_canvas_room', {
      p_brand_profile_id: BRAND_ID,
      p_created_by: OWNER_ID,
    });
  if (error || !roomId) {
    throw new Error(
      `[planner:studio-handoff:e2e:bench] ensure_default_canvas_room failed: ${error?.message ?? 'no room'}`,
    );
  }

  // Point the page's own resolver at this room, the way an earlier session would have.
  await supabase
    .schema('brand_profiles')
    .from('canvas_active_view')
    .upsert(
      {
        user_id: OWNER_ID,
        brand_profile_id: BRAND_ID,
        room_id: roomId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,brand_profile_id' },
    )
    .throwOnError();

  const priorNodes = [
    {
      id: PRIOR_NODE_ID,
      type: 'string',
      position: { x: 40, y: 40 },
      style: { width: 360, height: 220 },
      data: { value: PRIOR_NODE_TEXT },
    },
    {
      id: 'plstudio-prior-note-b',
      type: 'string',
      position: { x: 40, y: 320 },
      style: { width: 360, height: 220 },
      data: { value: 'PLSTUDIO second prior node' },
    },
  ];
  const priorEdges = [
    {
      id: PRIOR_EDGE_ID,
      source: PRIOR_NODE_ID,
      target: 'plstudio-prior-note-b',
      type: 'dataType',
      data: { dataType: 'text' },
    },
  ];

  await supabase
    .schema('brand_profiles')
    .from('canvas_sessions')
    .upsert(
      {
        brand_profile_id: BRAND_ID,
        room_id: roomId,
        nodes: priorNodes,
        edges: priorEdges,
        deleted_node_ids: [],
        deleted_edge_ids: [],
        editor_session_id: crypto.randomUUID(),
        editor_user_id: OWNER_ID,
      },
      { onConflict: 'brand_profile_id,room_id' },
    )
    .throwOnError();

  return roomId as string;
}

async function readCanvas(
  supabase: SupabaseClient,
  roomId: string,
): Promise<{ nodes: CanvasNode[]; edges: { id: string }[] }> {
  const { data } = await supabase
    .schema('brand_profiles')
    .from('canvas_sessions')
    .select('nodes, edges')
    .eq('brand_profile_id', BRAND_ID)
    .eq('room_id', roomId)
    .maybeSingle()
    .throwOnError();
  const row = data as { nodes?: CanvasNode[]; edges?: { id: string }[] } | null;
  return { nodes: row?.nodes ?? [], edges: row?.edges ?? [] };
}

// The affordance itself: select the draft, then press the preview panel's own
// "Open in AI Studio" — the exact button in the #195 and #256 screenshots.
//
// Selection goes through `?tab=planner&draftId=`, the product's own deep-link
// (agent JobGrid → "View draft"), rather than the list view. The list toggle is a
// worse door for this bench on two counts: it asserts a view mode this ticket has
// nothing to do with, and /organic on this branch logs a "Maximum update depth
// exceeded" loop out of OrganicNoticeBridge → ToastProvider that can leave the
// toolbar unresponsive. That loop is committed on this branch and is NOT part of
// #307 — it is called out in the run notes rather than worked around silently.
async function openDraftInAiStudio(page: Page, clientKey: string): Promise<void> {
  await page.goto(`/organic?tab=planner&draftId=${encodeURIComponent(clientKey)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  await expect(page.getByRole('complementary', { name: 'Draft preview' })).toBeVisible({
    timeout: 180_000,
  });

  const openButton = page.getByRole('button', { name: 'Open in AI Studio', exact: true }).first();
  await expect(openButton).toBeEnabled({ timeout: 60_000 });
  await openButton.click();

  await expect(page).toHaveURL(/\/ai-studio/, { timeout: 60_000 });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 120_000 });
}

const canvasNode = (page: Page, nodeId: string) =>
  page.locator(`.react-flow__node[data-id="${nodeId}"]`);

// The persisted row is the anchor, and it is written by a debounced autosave — poll it
// rather than racing it.
async function waitForSeededCanvas(
  supabase: SupabaseClient,
  roomId: string,
  expectNodeId: string,
): Promise<{ nodes: CanvasNode[]; edges: { id: string }[] }> {
  let latest: { nodes: CanvasNode[]; edges: { id: string }[] } = { nodes: [], edges: [] };
  await expect
    .poll(
      async () => {
        latest = await readCanvas(supabase, roomId);
        return latest.nodes.some((node) => node.id === expectNodeId);
      },
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(true);
  return latest;
}

test.describe.configure({ mode: 'serial' });

test.describe('planner → AI Studio handoff (#307)', () => {
  let roomId = '';
  let previousActiveBrandId: string | null = null;
  let primaryUrl = '';
  let slideUrls: string[] = [];
  let backend: LocalBackend | null = null;

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(300_000);
    backend = await startLocalBackend({
      port: Number(process.env.PLANNER_STUDIO_HANDOFF_BENCH_BACKEND_PORT ?? 4418),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3112',
      label: 'planner:studio-handoff:e2e:bench',
    });

    const supabase = admin();

    const { data: previous } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId =
      (previous as { active_brand_id?: string } | null)?.active_brand_id ?? null;

    await repairOnboarding(supabase);
    await setActiveBrand(supabase, BRAND_ID);

    primaryUrl = await uploadBaseImage(supabase, BASE_IMAGE_PATH);
    slideUrls = [];
    for (let index = 0; index < CAROUSEL_SLIDES; index += 1) {
      slideUrls.push(await uploadBaseImage(supabase, slidePath(index)));
    }

    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .delete()
      .eq('brand_id', BRAND_ID)
      .like('client_key', `${BENCH_CLIENT_KEY_PREFIX}%`);

    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .insert([
        realizedDraftRow({
          clientKey: POST_CLIENT_KEY,
          title: POST_TITLE,
          format: 'Single image post',
          offsetDays: 0,
          primaryUrl,
          slideUrls: [],
        }),
        realizedDraftRow({
          clientKey: CAROUSEL_CLIENT_KEY,
          title: CAROUSEL_TITLE,
          format: 'Carousel',
          offsetDays: -1,
          primaryUrl,
          slideUrls,
        }),
      ])
      .throwOnError();

    roomId = await seedRoomWithPriorWork(supabase);
  });

  test.afterAll(async () => {
    const supabase = admin();
    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .delete()
      .eq('brand_id', BRAND_ID)
      .like('client_key', `${BENCH_CLIENT_KEY_PREFIX}%`);
    await supabase.storage
      .from(BUCKET)
      .remove([
        BASE_IMAGE_PATH,
        ...Array.from({ length: CAROUSEL_SLIDES }, (_, i) => slidePath(i)),
      ]);
    if (roomId) {
      await supabase
        .schema('brand_profiles')
        .from('canvas_sessions')
        .delete()
        .eq('brand_profile_id', BRAND_ID)
        .eq('room_id', roomId);
    }
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
    await backend?.stop();
    backend = null;
  });

  test.beforeEach(async ({ context }) => {
    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    await context.addCookies(state.cookies);
  });

  test('#307 the headless generation lands as an editable base, and the prior canvas survives', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const supabase = admin();

    // The canvas the user "had done previously" — the condition the old guard turned
    // into a silent no-op.
    const before = await readCanvas(supabase, roomId);
    expect(
      before.nodes.map((node) => node.id),
      'the room must start with prior work or this bench proves nothing',
    ).toContain(PRIOR_NODE_ID);

    await openDraftInAiStudio(page, POST_CLIENT_KEY);

    const generatorId = postGeneratorId(POST_CLIENT_KEY);
    const after = await waitForSeededCanvas(supabase, roomId, generatorId);

    // 1 · the blocker is gone — the seed landed into a NON-EMPTY room.
    const afterIds = after.nodes.map((node) => node.id);
    expect(afterIds, 'the seeded generator never reached the persisted canvas').toContain(
      generatorId,
    );
    expect(afterIds).toContain(`organic-seed-text-${POST_CLIENT_KEY}`);

    // 2 · it is a BASE, not a picture: the generator's own output is the headless
    //     image, and it carries a signature so editing the prompt regenerates.
    //
    // Graded in two places on purpose. The canvas autosave runs every node through
    // serializeWorkflowSnapshot, whose `expiringOutputKeys` drop generatedImage /
    // generatedImageUrl — a signed URL is worthless once it expires — and keep the
    // DURABLE bucket+path the node re-signs from on load. So the persisted row is
    // graded on the durable pointer, and the picture itself is graded in the browser
    // below. Asserting generatedImage on the row would be asserting the app does the
    // wrong thing.
    const generator = after.nodes.find((node) => node.id === generatorId);
    const data = (generator?.data ?? {}) as Record<string, unknown>;
    expect(
      data.generatedImageBucket,
      'the generator carries no durable bucket — the base cannot survive a reload',
    ).toBe(BUCKET);
    expect(data.generatedImageStoragePath).toBe(BASE_IMAGE_PATH);
    expect(
      data.generationSignature,
      'no generationSignature — Run would hand back the seeded image instead of regenerating',
    ).toBeTruthy();

    // The produced creative is actually ON the generator, on screen.
    await expect(canvasNode(page, generatorId).locator('img').first()).toHaveAttribute(
      'src',
      /base\.png/,
      { timeout: 60_000 },
    );

    // 3 · prior work survives, in the persisted row and on screen.
    expect(afterIds, 'the append ate the user’s existing canvas').toContain(PRIOR_NODE_ID);
    expect(after.edges.map((edge) => edge.id)).toContain(PRIOR_EDGE_ID);
    await expect(canvasNode(page, PRIOR_NODE_ID)).toBeVisible({ timeout: 30_000 });

    // 4 · it landed BESIDE the prior work, not on top of it.
    const priorBottom = 40 + 220;
    const seededTop = Math.min(
      ...after.nodes
        .filter((node) => node.id.startsWith(`organic-seed-`))
        .map((node) => node.position?.y ?? 0),
    );
    expect(seededTop, 'the seed was stamped over the existing graph').toBeGreaterThan(priorBottom);

    // 5 · visible: selected and inside the viewport. Seeded-but-off-screen is
    //     indistinguishable from not seeded at all.
    const seeded = canvasNode(page, generatorId);
    await expect(seeded).toBeVisible({ timeout: 60_000 });
    await expect(seeded).toHaveClass(/selected/, { timeout: 60_000 });
    const nodeBox = await seeded.boundingBox();
    const paneBox = await page.locator('.react-flow').first().boundingBox();
    expect(nodeBox, 'the seeded generator has no box').not.toBeNull();
    expect(paneBox).not.toBeNull();
    if (nodeBox && paneBox) {
      expect(nodeBox.x + nodeBox.width).toBeGreaterThan(paneBox.x);
      expect(nodeBox.x).toBeLessThan(paneBox.x + paneBox.width);
      expect(nodeBox.y + nodeBox.height).toBeGreaterThan(paneBox.y);
      expect(nodeBox.y).toBeLessThan(paneBox.y + paneBox.height);
    }
  });

  // The one risk that can damage real work. Once is a test of the first write; twice
  // is a test of idempotency.
  test('#307 opening the same draft a second time adds nothing', async ({ page }) => {
    test.setTimeout(300_000);
    const supabase = admin();
    const generatorId = postGeneratorId(POST_CLIENT_KEY);

    const first = await waitForSeededCanvas(supabase, roomId, generatorId);
    const firstNodeIds = [...first.nodes.map((node) => node.id)].sort();
    const firstEdgeIds = [...first.edges.map((edge) => edge.id)].sort();

    // A full second trip through the real affordance, not a re-render.
    await openDraftInAiStudio(page, POST_CLIENT_KEY);
    await expect(canvasNode(page, generatorId)).toBeVisible({ timeout: 120_000 });
    // Give the debounced autosave every chance to write a duplicate if it is going to.
    await page.waitForTimeout(8_000);

    const second = await readCanvas(supabase, roomId);
    expect(
      [...second.nodes.map((node) => node.id)].sort(),
      'the second open duplicated nodes onto the canvas',
    ).toEqual(firstNodeIds);
    expect([...second.edges.map((edge) => edge.id)].sort()).toEqual(firstEdgeIds);
    expect(
      second.nodes.filter((node) => node.id === generatorId),
      'more than one copy of the seeded generator',
    ).toHaveLength(1);
  });

  // The plural in the report: "use the headless generationS as a base".
  test('#307 a realized carousel gives every slide its own base', async ({ page }) => {
    test.setTimeout(300_000);
    const supabase = admin();

    await openDraftInAiStudio(page, CAROUSEL_CLIENT_KEY);

    const firstSlideId = carouselGeneratorId(CAROUSEL_CLIENT_KEY, 1);
    const canvas = await waitForSeededCanvas(supabase, roomId, firstSlideId);

    for (let slide = 1; slide <= CAROUSEL_SLIDES; slide += 1) {
      const nodeId = carouselGeneratorId(CAROUSEL_CLIENT_KEY, slide);
      const node = canvas.nodes.find((candidate) => candidate.id === nodeId);
      expect(node, `slide ${slide} never reached the canvas`).toBeTruthy();
      const data = (node?.data ?? {}) as Record<string, unknown>;
      // Durable pointer, not the expiring signed URL — see the note in the first test.
      expect(
        data.generatedImageStoragePath,
        `slide ${slide} opened as an empty generator — its realized image was dropped`,
      ).toBe(slidePath(slide - 1));
      expect(data.generatedImageBucket).toBe(BUCKET);
      expect(
        data.generationSignature,
        `slide ${slide} carries no generationSignature`,
      ).toBeTruthy();
    }

    // And the prior work is still there after a second, larger append.
    expect(canvas.nodes.map((node) => node.id)).toContain(PRIOR_NODE_ID);
  });
});
