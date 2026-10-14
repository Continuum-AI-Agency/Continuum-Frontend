import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, mintSessionForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// planner:caption-autosave:e2e:bench
//
// WHAT IT PROVES: a caption typed into a brand-new manual post — before the browser
// autosave has created its row — lands where the approve gate and the publisher read it.
//
// Pink Elephant, 2026-10-14: a pasted carousel caption showed in the planner, and approve
// refused both fan-out members (Instagram + Facebook) as `caption_missing`. The field
// editor skips its PATCH while a draft has no row, trusting the autosave insert to carry
// the edit; the insert wrote `slot_data.caption` only, and the gate reads
// `content_json.copy.caption`. The planner falls back to slot_data, so nothing looked wrong.
//
// THE RACE, MADE DETERMINISTIC: the autosave insert is held for INSERT_LATENCY_MS on its
// way to PostgREST — real request, real response, just late, like the client's network.
// The caption PATCH then fires (700 ms after the last keystroke) while there is still no
// row, which is the exact production gap. Without the hold the bench would pass on the
// unfixed code whenever the insert happened to win.
//
// Graded on the PERSISTED row and on the real Backend gate (`publish-intent`, read-only),
// never on the store or the rendered caption — the rendered caption was right all along.
//
// What is REAL: hosted Postgres, GoTrue auth, the bench-owned Fastify Backend (hosted
// target), the real planner in real Chrome, the real autosave and field-edit route.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY:
//   · Approve + schedule. The bench draft has no media, so the gate's first blocker is
//     media_missing and approve would refuse it for that reason; scheduling a real post on
//     a brand with a connected account is not something a bench should do. The verdict is
//     read from publish-intent instead — the same `evaluatePublishability` approve calls.
//   · Fan-out. The fix sits upstream of it (the source row's copy is what fan-out clones),
//     and the summary toast naming the reason is covered by useFanOutDraft.test.ts.

const BENCH = 'planner:caption-autosave:e2e:bench';

// StarCraft: Remastered. Owned by the bench login, not by a client.
const STARCRAFT_BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const BRAND_ID = process.env.PLANNER_CAPTION_BENCH_BRAND_ID ?? STARCRAFT_BRAND_ID;
const OWNER_EMAIL = process.env.CANVAS_BENCH_OWNER_EMAIL ?? 'duane@continuumai.agency';
const WRITABLE_BRANDS = new Set([STARCRAFT_BRAND_ID]);

const INSERT_LATENCY_MS = 2_500;
const CAPTION = `CAPTION-AUTOSAVE bench ${Date.now()} — la resiliencia operativa se forja ejecutando bajo presión.`;

const notes = [
  'un-exercised: approve/schedule HTTP hop (no media on the bench draft; verdict read from publish-intent)',
  'un-exercised: fan-out (fix is upstream of it; toast reason covered by useFanOutDraft.test.ts)',
];
const recorder = createBenchRecorder(BENCH, notes);

/** Only what this run made, deleted by its own id — never a time-window sweep on hosted. */
const createdDraftIds: string[] = [];
// Read off the held insert itself, so a run that dies before typing still cleans up the
// row its autosave created.
const insertedClientKeys: string[] = [];
// A test that dies before its first step (no browser, a hook throwing) grades nothing, and
// an envelope with no results reads as green. Completion is graded on its own.
let reachedLastStep = false;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`[${BENCH}] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.`);
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `[${BENCH}] Refusing to run against "${url}": run it with the hosted .env, not .env.local.`,
    );
  }
  if (!WRITABLE_BRANDS.has(BRAND_ID)) {
    throw new Error(`[${BENCH}] Refusing to write to brand ${BRAND_ID}: not a bench-owned brand.`);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type DraftRow = {
  id: string;
  platform: string;
  slot_data: { caption?: string } | null;
  content_json: { copy?: { caption?: string } } | null;
};

async function findBenchRow(supabase: SupabaseClient): Promise<DraftRow | null> {
  const { data, error } = await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, platform, slot_data, content_json')
    .eq('brand_id', BRAND_ID)
    .eq('slot_data->>caption', CAPTION)
    .maybeSingle();
  if (error) throw new Error(`[${BENCH}] could not read the bench row: ${error.message}`);
  return (data as DraftRow | null) ?? null;
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

test.describe('planner caption typed before the row exists', () => {
  let backend: LocalBackend | null = null;
  let ownerId = '';
  let accessToken = '';
  let previousActiveBrandId: string | null = null;

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(300_000);
    const supabase = admin();
    backend = await startLocalBackend({
      port: Number(process.env.PLANNER_CAPTION_BENCH_BACKEND_PORT ?? 4425),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3125',
      label: BENCH,
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
  });

  test.afterAll(async () => {
    const supabase = admin();
    // A row the run made but never captured (the test died between insert and read) is
    // still found by its unique caption — the caption is this run's id, not a window.
    const stray = await findBenchRow(supabase).catch(() => null);
    if (stray && !createdDraftIds.includes(stray.id)) createdDraftIds.push(stray.id);
    for (const id of createdDraftIds) {
      await supabase.schema('organic').from('organic_calendar_drafts').delete().eq('id', id);
    }
    if (insertedClientKeys.length > 0) {
      await supabase
        .schema('organic')
        .from('organic_calendar_drafts')
        .delete()
        .eq('brand_id', BRAND_ID)
        .in('client_key', insertedClientKeys);
    }
    if (previousActiveBrandId) await setActiveBrand(supabase, ownerId, previousActiveBrandId);
    await backend?.stop();
    backend = null;
    if (!reachedLastStep) {
      recorder.record('bench completed', 'FAIL', 'the test did not reach its last step');
    }
    recorder.print();
  });

  test('the caption reaches content_json and the approve gate sees it', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const state = await mintSessionForEmail(OWNER_EMAIL);
    await context.addCookies(state.cookies);

    let heldInserts = 0;
    await page.route('**/rest/v1/organic_calendar_drafts**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      heldInserts += 1;
      const body = route.request().postDataJSON() as { client_key?: string } | null;
      if (body?.client_key) insertedClientKeys.push(body.client_key);
      await new Promise((resolve) => setTimeout(resolve, INSERT_LATENCY_MS));
      return route.continue();
    });

    await recorder.step('open the planner and create a manual carousel', async () => {
      await page.goto('/organic?tab=planner');
      const create = page.getByRole('button', { name: 'Create content' }).first();
      await expect(create).toBeEnabled({ timeout: 120_000 });
      await create.click();
      await page.getByRole('menuitem', { name: /new carousel/i }).click();
    });

    await recorder.step('type the caption before the autosave insert lands', async () => {
      // The preview opens on the new draft; its caption is click-to-edit only in edit mode.
      const editToggle = page.getByRole('button', { name: /^(edit post|done editing post)$/i });
      await expect(editToggle.first()).toBeVisible({ timeout: 30_000 });
      if ((await editToggle.first().getAttribute('aria-pressed')) !== 'true') {
        await editToggle.first().click();
      }
      try {
        // Each platform frame names the field its own way ("Instagram caption", "post copy").
        await page
          .getByRole('button', { name: /^add a .*(caption|copy)$/i })
          .first()
          .click({ timeout: 15_000 });
        await page
          .getByRole('textbox', { name: /caption|copy/i })
          .first()
          .fill(CAPTION);
      } catch (error) {
        await page.screenshot({ path: 'test-results/planner-caption-autosave-panel.png' });
        throw error;
      }
    });

    const row = await recorder.step(
      'the autosave inserted the row (held, not mocked)',
      async () => {
        let found: DraftRow | null = null;
        await expect
          .poll(
            async () => {
              found = await findBenchRow(admin());
              return found?.id ?? null;
            },
            { timeout: 30_000 },
          )
          .not.toBeNull();
        const persisted = found as unknown as DraftRow;
        createdDraftIds.push(persisted.id);
        expect(heldInserts).toBeGreaterThan(0);
        return persisted;
      },
    );

    await recorder.step('content_json.copy.caption carries the typed caption', async () => {
      await expect
        .poll(
          async () => (await findBenchRow(admin()))?.content_json?.copy?.caption ?? '(absent)',
          { timeout: 20_000 },
        )
        .toBe(CAPTION);
    });

    await recorder.step('the Backend gate reports a caption, not caption_missing', async () => {
      const response = await page.request.post(
        `${backend?.url}/api/organic/calendar/drafts/${row.id}/publish-intent`,
        { headers: { Authorization: `Bearer ${accessToken}` }, data: {} },
      );
      expect(response.status(), await response.text()).toBe(200);
      const verdict = (await response.json()) as {
        blockers: Array<{ reason: string }>;
        caption: { present: boolean };
      };
      expect(verdict.caption.present).toBe(true);
      expect(verdict.blockers.map((blocker) => blocker.reason)).not.toContain('caption_missing');
    });
    reachedLastStep = true;
  });
});
