import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, mintSessionForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// planner:creative-reapply:e2e:bench
//
// WHAT IT PROVES: you can change up the creative on an ALREADY-PLANNED post and re-apply
// it, and the post that comes back out is the post you edited.
//
// The reported symptom was a "Creative — Slide 1 of 5" dialog whose only action was
// Replace. The row behind it explained why:
//
//     content.format                 = "Reel"
//     creative.mediaSuggestion.kind  = "carousel"
//     publishingAssets               = 5 x { kind: image, slideIndex: 0..4 }
//
// a carousel wearing a Reel label. Three separate defects met on that row and each one
// is graded here against the PERSISTED row, never against a store or a rendered guess:
//
//   1. The preview read carousel-ness off the format STRING, so Remove was hidden and
//      Replace pointed at the whole media — clicking it on slide 1 of 5 destroyed the
//      other four. Graded by driving the real lightbox and counting the row after.
//   2. `shapeUserSuppliedMedia` took a caller-declared REEL at its word. Five images
//      declared as a reel fell past both media branches into SINGLE IMAGE: four slides
//      dropped, the post relabelled POST, silently. Graded by applying five and counting.
//   3. The apply route wrote the draft with a raw UPDATE and no compare-and-set, so a
//      generation merge landing in between reverted a creative the user had just
//      applied. Graded by handing the funnel a token that is deliberately stale.
//
// WHY STARCRAFT, AND WHY HOSTED: the AI Studio side of this round trip is benched
// against the StarCraft brand already (`FIXTURES.starcraftOwnerEmail` exists for exactly
// that), and it is a brand this account owns rather than a client's. A local stack has
// no creative library to open in Studio, so it can prove the wiring and nothing about
// the data. The brand guard below is what keeps that from becoming a licence to write
// into somebody's real account.
//
// Prerequisites: hosted `.env` (NOT `.env.local` — that retargets the whole run at the
// local stack while the Backend stays on prod, and the resulting 403s read as code bugs).
//   Run with: bun run planner:creative-reapply:e2e:bench
//
// What is REAL here: real hosted Postgres, real Supabase storage, real GoTrue auth, the
// real Fastify Backend (bench-owned, hosted target), the real Next apply route, the real
// `plugin_mcp.planner_apply_draft_patches` funnel, real Chrome.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · The canvas producing the apply candidates. Driving the real Layer Editor means a
//     real image generation and real credits, so the apply payload is posted to the real
//     route directly. That `layerEditor` output is collected AT ALL — the defect that
//     left Apply Back to Planner disabled forever — is covered by
//     src/StudioCanvas/utils/applyAssetCandidates.test.ts.
//   · Real image generation. The five slides are real PNGs in real storage; no model is
//     called.
//   · `plugin_mcp.tool_operations` receipts. Every apply writes one and service_role has
//     no DML grant on that table even on prod, so they are counted and left to expire.

const BENCH = 'planner:creative-reapply:e2e:bench';

// StarCraft: Remastered. Owned by the bench login, not by a client.
const STARCRAFT_BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const BRAND_ID = process.env.PLANNER_REAPPLY_BENCH_BRAND_ID ?? STARCRAFT_BRAND_ID;
const OWNER_EMAIL = process.env.CANVAS_BENCH_OWNER_EMAIL ?? 'duane@continuumai.agency';

// The inverse of the local-only guard the brand-tenancy bench carries. This bench MUST
// run against hosted to be worth anything, so the thing to refuse is not the environment
// but the target: an allowlist of brands this account owns. A typo in
// PLANNER_REAPPLY_BENCH_BRAND_ID must not become a write into a paying customer's planner.
const WRITABLE_BRANDS = new Set([STARCRAFT_BRAND_ID]);

const BUCKET = 'brand-profile-assets';
const SLIDE_COUNT = 5;
const BENCH_DIR = `${BRAND_ID}/planner-creative-reapply-bench`;
const seededSlidePath = (index: number) => `${BENCH_DIR}/seed-slide-${index}.png`;

const DRAFT_TITLE = 'REAPPLY — a carousel the generator labelled Reel';

/**
 * Every id this run creates, captured as it is created.
 *
 * Deliberately NOT a `like('client_key', 'bench-%')` sweep or a time window: this runs
 * against hosted, where a window delete once reached a real user's row 38s into a run.
 * Only what this run made, deleted by its own id.
 */
type Residue = {
  draftIds: string[];
  storagePaths: string[];
  assetIds: string[];
};
const residue: Residue = { draftIds: [], storagePaths: [], assetIds: [] };

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`[${BENCH}] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.`);
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `[${BENCH}] Refusing to run: NEXT_PUBLIC_SUPABASE_URL is "${url}". This bench grades a ` +
        "real brand's creative round trip and is meaningless against the local stack. Run it " +
        'with the hosted .env, not .env.local.',
    );
  }
  if (!WRITABLE_BRANDS.has(BRAND_ID)) {
    throw new Error(
      `[${BENCH}] Refusing to seed brand ${BRAND_ID}: it is not one this bench may write to. ` +
        'Add it to WRITABLE_BRANDS only if the bench login owns it.',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A 1x1 PNG. Real bytes in real storage; the pixels are not what is under test. */
function onePixelPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5M4V8AAAAASUVORK5CYII=',
    'base64',
  );
}

async function uploadSlide(supabase: SupabaseClient, path: string): Promise<string> {
  await supabase.storage
    .from(BUCKET)
    .upload(path, onePixelPng(), { contentType: 'image/png', upsert: true });
  residue.storagePaths.push(path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`[${BENCH}] could not sign ${path}: ${error?.message}`);
  }
  return data.signedUrl.startsWith('http')
    ? data.signedUrl
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${data.signedUrl}`;
}

function dayIdOffsetFromToday(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

type DraftRow = {
  id: string;
  updated_at: string;
  media_stage: string | null;
  content_json: {
    content?: { format?: string };
    creative?: { mediaSuggestion?: { kind?: string; mediaStatus?: string } };
    publishingAssets?: Array<{ kind: string; storagePath: string; slideIndex?: number }>;
  } | null;
};

async function readDraft(supabase: SupabaseClient, draftId: string): Promise<DraftRow> {
  const { data, error } = await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, updated_at, media_stage, content_json')
    .eq('id', draftId)
    .single();
  if (error || !data)
    throw new Error(`[${BENCH}] could not re-read draft ${draftId}: ${error?.message}`);
  return data as unknown as DraftRow;
}

/**
 * The row from the report, rebuilt: five image slides, a carousel mediaSuggestion, and a
 * `content.format` that still says Reel. Everything downstream reads one of those two and
 * they disagree, which is the whole bug.
 */
async function seedDriftedCarousel(
  supabase: SupabaseClient,
  ownerId: string,
  slideUrls: string[],
): Promise<string> {
  const dayId = dayIdOffsetFromToday(21);
  const publishingAssets = slideUrls.map((url, index) => ({
    role: 'primary',
    kind: 'image' as const,
    slideIndex: index,
    bucket: BUCKET,
    storagePath: seededSlidePath(index),
    storageUrl: url,
    mimeType: 'image/png',
  }));

  const { data, error } = await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .insert({
      brand_id: BRAND_ID,
      user_id: ownerId,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${dayId}T14:00:00.000Z`,
      media_stage: 'storyboard_ready',
      slot_data: {
        dayId,
        weekStart: dayId,
        timeLabel: '2:00 PM',
        platform: 'instagram',
        title: DRAFT_TITLE,
        draftSnapshot: {
          title: DRAFT_TITLE,
          status: 'draft',
          platforms: ['instagram'],
          // The stale label, in the key `resolveDraftPublishFormat` reads FIRST.
          format: 'Reel',
          timeLabel: '2:00 PM',
          dateLabel: dayId,
          mediaCount: SLIDE_COUNT,
          publishingAssets,
        },
      },
      content_json: {
        copy: { caption: 'REAPPLY caption — the copy is not what is under test.' },
        content: { format: 'Reel', type: 'reel', titleTopic: DRAFT_TITLE },
        creative: {
          creativeIdea: DRAFT_TITLE,
          mediaSuggestion: {
            kind: 'carousel',
            mediaStatus: 'user_supplied',
            assets: publishingAssets.map((asset, index) => ({
              role: `slide_${index + 1}`,
              order: index + 1,
              url: asset.storagePath,
              bucket: BUCKET,
              assetUrl: asset.storageUrl,
              generated: true,
            })),
          },
        },
        publishingAssets,
      },
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`[${BENCH}] could not seed draft: ${error?.message}`);
  const draftId = (data as { id: string }).id;
  residue.draftIds.push(draftId);
  return draftId;
}

async function setActiveBrand(
  supabase: SupabaseClient,
  ownerId: string,
  activeBrandId: string,
): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: ownerId, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

test.describe.configure({ mode: 'serial' });

test.describe('planner creative edit → re-apply', () => {
  let backend: LocalBackend | null = null;
  let ownerId = '';
  let accessToken = '';
  let previousActiveBrandId: string | null = null;
  let seededSlideUrls: string[] = [];
  let draftId = '';

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(300_000);
    const supabase = admin();

    backend = await startLocalBackend({
      port: Number(process.env.PLANNER_REAPPLY_BENCH_BACKEND_PORT ?? 4419),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3114',
      label: BENCH,
      // The whole point: the Backend must read the same hosted project the app does.
      supabase: 'hosted',
    });

    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    ownerId = session.userId;
    accessToken = session.accessToken;

    const { data: previous } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', ownerId)
      .maybeSingle();
    previousActiveBrandId =
      (previous as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    await setActiveBrand(supabase, ownerId, BRAND_ID);

    seededSlideUrls = [];
    for (let index = 0; index < SLIDE_COUNT; index += 1) {
      seededSlideUrls.push(await uploadSlide(supabase, seededSlidePath(index)));
    }
    draftId = await seedDriftedCarousel(supabase, ownerId, seededSlideUrls);
  });

  test.afterAll(async () => {
    const supabase = admin();
    for (const id of residue.draftIds) {
      await supabase.schema('organic').from('organic_calendar_drafts').delete().eq('id', id);
    }
    for (const id of residue.assetIds) {
      await supabase.schema('media').from('assets').delete().eq('id', id);
    }
    if (residue.storagePaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(residue.storagePaths);
    }
    if (previousActiveBrandId) await setActiveBrand(supabase, ownerId, previousActiveBrandId);
    await backend?.stop();
    backend = null;
  });

  test.beforeEach(async ({ context }) => {
    const state = await mintSessionForEmail(OWNER_EMAIL);
    await context.addCookies(state.cookies);
  });

  // Defect 1, through the affordance in the report: open the creative full screen on a
  // draft whose format label lies, and act on ONE slide. Before the fix the dialog had no
  // Remove at all and Replace was aimed at the whole media.
  test('the lightbox treats a Reel-labelled carousel as the carousel it is', async ({ page }) => {
    await page.goto(`/organic?tab=planner&draftId=${draftId}`);

    const preview = page.getByText(DRAFT_TITLE).first();
    await expect(preview).toBeVisible({ timeout: 60_000 });
    await preview.click();

    // The creative itself is what opens the lightbox.
    await page
      .getByRole('button', { name: /slide 1|creative/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Creative' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/slide 1 of 5/i)).toBeVisible();

    // The assertion the video is about: a five-slide post offers per-slide actions.
    const remove = dialog.getByRole('button', { name: /^remove$/i });
    await expect(remove).toBeVisible();
    await remove.click();

    // Graded on the row, not on the rendering.
    await expect
      .poll(
        async () => (await readDraft(admin(), draftId)).content_json?.publishingAssets?.length,
        {
          timeout: 30_000,
        },
      )
      .toBe(SLIDE_COUNT - 1);
  });

  // Defects 2 and 3 together, through the real apply route: five edited images land on a
  // draft the canvas still calls a reel. Before the fix this wrote ONE asset and relabelled
  // the post POST, with no error anywhere.
  test('re-applying five edited slides keeps five slides and fixes the label', async ({ page }) => {
    const supabase = admin();
    const before = await readDraft(supabase, draftId);

    const response = await page.request.post('/api/organic/ai-studio/apply', {
      data: {
        schemaVersion: 'planner_ai_apply_v1',
        draftId,
        brandProfileId: BRAND_ID,
        postType: 'reel',
        platform: 'instagram',
        overwrite: true,
        contentPatch: { title: DRAFT_TITLE },
        assets: Array.from({ length: SLIDE_COUNT }, (_, index) => ({
          role: `slide_${index + 1}`,
          kind: 'image' as const,
          slideIndex: index,
          sourceDataUrl: `data:image/png;base64,${onePixelPng().toString('base64')}`,
        })),
      },
    });

    expect(response.status(), `apply refused: ${await response.text()}`).toBe(200);

    const applied = (await response.json()) as {
      assets: Array<{ storagePath: string }>;
    };
    for (const asset of applied.assets) residue.storagePaths.push(asset.storagePath);

    const after = await readDraft(supabase, draftId);
    expect(after.content_json?.publishingAssets).toHaveLength(SLIDE_COUNT);
    expect(after.content_json?.content?.format).toBe('CAROUSEL');
    expect(after.content_json?.creative?.mediaSuggestion?.kind).toBe('carousel');
    expect(after.content_json?.creative?.mediaSuggestion?.mediaStatus).toBe('user_supplied');
    // The stage the calendar reads has to move with the creative, or the post keeps
    // offering "Generate final media" for media it already has.
    expect(after.media_stage).toBe('realized');
    expect(after.updated_at).not.toBe(before.updated_at);

    // The applied creative is the NEW one, not the seed re-signed.
    const paths = (after.content_json?.publishingAssets ?? []).map((asset) => asset.storagePath);
    expect(paths.some((path) => path.includes('seed-slide'))).toBe(false);

    // Track the library rows this apply minted so cleanup can take them by id.
    const { data: assets } = await supabase
      .schema('media')
      .from('assets')
      .select('id, storage_path')
      .eq('brand_id', BRAND_ID)
      .in('storage_path', paths);
    for (const row of (assets ?? []) as Array<{ id: string }>) residue.assetIds.push(row.id);
  });

  // Defect 3 on its own terms. The apply route reads its own CAS token, so staleness is
  // injected where it can be: at the funnel the route delegates to.
  test('the funnel refuses a write whose token is stale instead of overwriting', async ({
    request,
  }) => {
    const supabase = admin();
    const current = await readDraft(supabase, draftId);

    const stale = new Date(new Date(current.updated_at).getTime() - 60_000).toISOString();
    const backendUrl = backend?.url ?? '';
    const response = await request.post(
      `${backendUrl}/api/ai-studio/publishing/organic/drafts/${draftId}/creative`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          brandId: BRAND_ID,
          expectedUpdatedAt: stale,
          format: 'carousel',
          assets: (current.content_json?.publishingAssets ?? []).map((_, index) => ({
            assetId: residue.assetIds[index] ?? residue.assetIds[0],
            kind: 'image' as const,
            order: index,
          })),
        },
      },
    );

    expect(response.status()).toBe(409);

    // And nothing moved.
    const after = await readDraft(supabase, draftId);
    expect(after.updated_at).toBe(current.updated_at);
    expect(after.content_json?.publishingAssets).toHaveLength(
      current.content_json?.publishingAssets?.length ?? 0,
    );
  });
});
