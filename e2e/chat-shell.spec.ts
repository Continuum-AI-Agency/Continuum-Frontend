import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// Chat shell end-to-end bench (Organic agent surface).
//
// Drives the REAL code path across its real boundaries: rows are seeded into the real local
// Postgres, read back through the real Backend history route, rendered by the real Frontend, and
// the attachment is uploaded to real Supabase Storage and re-fetched from its real signed URL.
// Nothing here is mocked.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run chat:e2e:bench
//
// The bench OWNS its Backend (see support/localBackend.ts) — do not start one yourself. A
// hand-started `bun run dev:be` points at PRODUCTION Supabase, so the panel would read history
// for a brand that only exists locally and render an empty transcript.
//
// Un-exercised hop, stated explicitly: this bench does not run a live agent turn. It asserts that
// the composer sends a populated `images` array carrying a reachable signed URL — the exact link
// that was broken (it was provably always []). The model-side consumption of that image is covered
// by the Backend unit test composerImages.spec.ts (attachMediaImagesToMessages).

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';

// The fixture brand seeded by supabase/baseline/fixtures.sql. The panel loads history for the
// user's ACTIVE brand, so the bench pins the active brand to this one and restores whatever was
// there before — otherwise a brand left active by another bench decides what this one renders.
// Must be a REAL v4-shaped uuid: fixtures moved off the old ...b1 id because z.uuid() rejects a
// version-0 nibble, which crashed the /organic planner before the Agent tab existed.
const brandId = '00000000-0000-4000-8000-0000000000b2';

let previousActiveBrandId: string | null = null;
let backend: LocalBackend | null = null;

// One Backend for the whole file; this bench is pinned to --workers=1.
// biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(180_000);
  backend = await startLocalBackend({
    port: Number(process.env.CHAT_SHELL_BENCH_BACKEND_PORT ?? 4410),
    browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3111',
    label: 'chat:e2e:bench',
  });
});

test.afterAll(async () => {
  await backend?.stop();
  backend = null;
});

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

// DEFAULT_HISTORY_WINDOW on the Backend is 40. Seeding more than that is the whole point: it is
// what distinguishes "newest page" from the old "oldest page" behaviour, and it is what makes the
// history paginate at all.
const HISTORY_WINDOW = 40;
const SEEDED_TURNS = 26; // 52 messages: one page of 40 + 12 older ones behind the cursor.

const BENCH_SESSION_PREFIX = 'bench-chat-shell-';
const SESSION_ID = `${BENCH_SESSION_PREFIX}${Date.now()}`;

// Persisted attachment URLs for the media-primitive assertion. They must serve REAL bytes:
// ChatMedia preloads video metadata, so a URL that errors degrades to the fallback tile before
// the assertion runs — the <video> under test only exists while its URL actually resolves.
// beforeAll uploads the fixtures below into local Supabase Storage and mints real signed URLs.
let BENCH_IMAGE_URL = '';
let BENCH_VIDEO_URL = '';

// A 1x1 red PNG — a real image, so the signed URL must serve real image bytes back.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A real 0.2s 16x16 H.264 MP4 (ffmpeg lavfi), so <video preload="metadata"> succeeds.
const MP4_BASE64 =
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAN1bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAEAAABAAAAAAIXbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAACgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAHcQAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAFAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAOGN0dHMAAAAAAAAABQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAUAAAABAAAAKHN0c3oAAAAAAAAAAAAAAAUAAALKAAAADAAAAAwAAAAMAAAADAAAABRzdGNvAAAAAAAAAAEAAAOlAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAAAIZnJlZQAAAwJtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAFGWIhAAz//7fMvgUzcWJzsyAXJ6XAAAACEGaJGxCv/7AAAAACEGeQniF/8GBAAAACAGeYXRCv8SAAAAACAGeY2pCv8SB';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[chat:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Interleaved user/assistant turns. The OLDEST turn is unique so we can prove it is absent on
// first paint and present only after paging back; the NEWEST likewise proves the window is recent.
// A fully-valid ProposedPlan frame. The Frontend replays persisted frames through the SAME parser
// the live stream uses, so a shape that fails the contract schema is silently dropped and no
// milestone would be derived — the bench would then be asserting on a card that never existed.
function planCardFrame() {
  const now = new Date().toISOString();
  return {
    type: 'ui.plan_card',
    data: {
      planId: crypto.randomUUID(),
      sessionId: SESSION_ID,
      brandId,
      userId: OWNER_ID,
      weekStart: '2026-07-13',
      title: 'Bench plan',
      summary: 'A seeded plan so the transcript has a real checkpoint to anchor on.',
      items: [
        {
          itemId: crypto.randomUUID(),
          kind: 'create_post',
          platform: 'instagram',
          scheduledAt: now,
          format: 'reel',
          trendId: null,
          trendTitle: null,
          angle: 'Bench angle',
          objective: 'follow',
          audienceSegment: 'Bench audience',
          rationale: 'Seeded for the chat-shell bench.',
          guidancePrompt: null,
          draftId: null,
          jobId: null,
          dependsOn: [],
          status: 'pending',
          creativeBrief: null,
        },
      ],
      evidence: [],
      estimatedDurationSeconds: 60,
      status: 'proposed',
      createdAt: now,
    },
  };
}

async function purgeBenchSessions(supabase: SupabaseClient): Promise<void> {
  await supabase
    .schema('organic')
    .from('organic_chat_messages')
    .delete()
    .like('session_id', `${BENCH_SESSION_PREFIX}%`);
  await supabase
    .schema('organic')
    .from('organic_chat_sessions')
    .delete()
    .like('session_id', `${BENCH_SESSION_PREFIX}%`);
}

function seedRows() {
  const base = Date.now() - SEEDED_TURNS * 2 * 60_000;
  const rows: Record<string, unknown>[] = [];

  for (let turn = 0; turn < SEEDED_TURNS; turn += 1) {
    const at = (offset: number) => new Date(base + (turn * 2 + offset) * 60_000).toISOString();

    // The newest user turn carries a real image AND a real video attachment. The video is the
    // point: every media renderer in chat used to be an <img>, so an MP4 rendered as a broken
    // image tag.
    const carriesAttachments = turn === SEEDED_TURNS - 1;
    rows.push({
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'user',
      content: `BENCH-USER-${turn}`,
      metadata: carriesAttachments
        ? {
            references: [],
            attachments: [
              { url: BENCH_IMAGE_URL, name: 'bench-shot.png', mediaType: 'image/png' },
              { url: BENCH_VIDEO_URL, name: 'bench-clip.mp4', mediaType: 'video/mp4' },
            ],
          }
        : null,
      ui_cards: [],
      created_at: at(0),
    });

    // The final assistant turn carries a plan card, which the shell derives into a "Plan ready"
    // milestone anchor + Marker row. It is a real persisted frame, not a UI-only flag.
    const isLast = turn === SEEDED_TURNS - 1;
    rows.push({
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'assistant',
      content: `BENCH-ASSISTANT-${turn}`,
      metadata: null,
      ui_cards: isLast ? [planCardFrame()] : [],
      created_at: at(1),
    });
  }

  return rows;
}

// Navigates to the agent panel and fails loudly if the minted session was not accepted — a silent
// bounce to /login would otherwise surface as an unrelated "element not found".
async function openAgentPanel(page: Page) {
  await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  // Click through rather than trusting the query param: the panel is lazily mounted and only the
  // active tab renders it.
  const agentTab = page.getByRole('button', { name: 'Agent', exact: true });
  await agentTab.click({ timeout: 60_000 });

  await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('chat shell — Organic agent', () => {
  // Serial: the specs share one seeded session, and minting a GoTrue session per parallel worker
  // trips Supabase auth rate limiting. A dev-server compile plus a full history load also exceeds
  // Playwright's 30s default.
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // One session, one context, reused: minting per test trips Supabase auth rate limiting, and
    // replaying a single session across fresh contexts breaks as soon as its refresh token rotates.
    const state = await mintSessionForEmail(LOCAL_OWNER_EMAIL);
    context = await browser.newContext();
    await context.addCookies(state.cookies);
    page = await context.newPage();

    const supabase = admin();

    // Real bytes behind the persisted attachment URLs (see BENCH_IMAGE_URL note).
    for (const [name, base64, contentType] of [
      ['bench.png', PNG_BASE64, 'image/png'],
      ['bench.mp4', MP4_BASE64, 'video/mp4'],
    ] as const) {
      const { error } = await supabase.storage
        .from('media-library')
        .upload(name, Buffer.from(base64, 'base64'), { contentType, upsert: true });
      if (error) throw new Error(`[chat:e2e:bench] upload ${name} failed: ${error.message}`);
    }
    const signFixture = async (name: string) => {
      const { data, error } = await supabase.storage
        .from('media-library')
        .createSignedUrl(name, 60 * 60);
      if (error || !data?.signedUrl) {
        throw new Error(`[chat:e2e:bench] sign ${name} failed: ${error?.message}`);
      }
      return data.signedUrl;
    };
    BENCH_IMAGE_URL = await signFixture('bench.png');
    BENCH_VIDEO_URL = await signFixture('bench.mp4');

    const { data: pref } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;
    await setActiveBrand(supabase, brandId);

    // The /organic page builds its onboarding metadata by Zod-normalizing EVERY onboarding row the
    // user has — so one malformed row (the local stack leaves `state = {}`) throws and takes the
    // whole page down, whichever brand is active. Repair them all, then claim the fixture brand.
    const defaultState = createDefaultOnboardingState({
      id: OWNER_ID,
      email: LOCAL_OWNER_EMAIL,
      role: 'owner',
    } as Parameters<typeof createDefaultOnboardingState>[0]);

    const { data: onboardingRows } = await supabase
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .select('brand_id, state')
      .eq('user_id', OWNER_ID);

    for (const row of onboardingRows ?? []) {
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

    // Only one state per user may be active (idx_user_onboarding_states_active).
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
        { user_id: OWNER_ID, brand_id: brandId, state: defaultState, is_active: true },
        { onConflict: 'user_id,brand_id' },
      )
      .throwOnError();

    // Purge sessions left behind by an interrupted run: the panel auto-selects the most recent
    // session, so a stale one silently becomes the subject of the bench.
    await purgeBenchSessions(supabase);

    await supabase
      .schema('organic')
      .from('organic_chat_sessions')
      .upsert(
        {
          session_id: SESSION_ID,
          brand_id: brandId,
          user_id: OWNER_ID,
          user_email: LOCAL_OWNER_EMAIL,
          title: 'Chat shell bench',
          last_message_role: 'assistant',
          last_message_preview: `BENCH-ASSISTANT-${SEEDED_TURNS - 1}`,
        },
        { onConflict: 'session_id' },
      )
      .throwOnError();

    await supabase
      .schema('organic')
      .from('organic_chat_messages')
      .insert(seedRows())
      .throwOnError();
  });

  test.afterAll(async () => {
    await context.close();
    const supabase = admin();
    await purgeBenchSessions(supabase);
    if (previousActiveBrandId) {
      await setActiveBrand(supabase, previousActiveBrandId);
    }
    await supabase
      .schema('organic')
      .from('organic_chat_messages')
      .delete()
      .eq('session_id', SESSION_ID);
    await supabase
      .schema('organic')
      .from('organic_chat_sessions')
      .delete()
      .eq('session_id', SESSION_ID);
  });

  test('resumes at the NEWEST page of history, not the oldest', async () => {
    await openAgentPanel(page);

    const newest = page.getByText(`BENCH-ASSISTANT-${SEEDED_TURNS - 1}`, { exact: true });
    await expect(newest).toBeVisible({ timeout: 60_000 });

    // The regression this guards: the Backend read was `.order(created_at, asc).limit(40)`, which
    // returned the OLDEST 40 — so the newest turns were absent and the oldest were present.
    const oldest = page.getByText('BENCH-USER-0', { exact: true });
    await expect(oldest).toHaveCount(0);
  });

  test('renders the checkpoint minimap and a milestone Marker row', async () => {
    await openAgentPanel(page);
    await expect(
      page.getByText(`BENCH-ASSISTANT-${SEEDED_TURNS - 1}`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    const rail = page.getByRole('navigation', { name: 'Conversation checkpoints' });
    await expect(rail).toBeVisible();

    // One tick per anchor. A page of 40 messages yields 40 turn anchors plus the plan milestone.
    const ticks = rail.getByRole('button');
    expect(await ticks.count()).toBeGreaterThan(1);

    // The milestone derived from the persisted ui.plan_card frame — reachable from the rail...
    await expect(rail.getByRole('button', { name: 'Plan ready' })).toBeVisible();
    // ...and rendered inline as a Marker separator row.
    await expect(page.getByText('Plan ready', { exact: true }).first()).toBeVisible();
  });

  test('"Next response" jumps the viewport to the next agent output', async () => {
    await openAgentPanel(page);
    await expect(
      page.getByText(`BENCH-ASSISTANT-${SEEDED_TURNS - 1}`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    const viewport = page.locator('[data-slot="message-scroller-viewport"]');
    await viewport.evaluate((el) => {
      el.scrollTop = 0;
    });
    const before = await viewport.evaluate((el) => el.scrollTop);

    const nextResponse = page.getByRole('button', { name: 'Next response' });
    await expect(nextResponse).toBeVisible();
    await nextResponse.click();

    await expect
      .poll(async () => viewport.evaluate((el) => el.scrollTop), { timeout: 10_000 })
      .toBeGreaterThan(before);
  });

  test('paging back loads older messages without the viewport jumping', async () => {
    await openAgentPanel(page);
    await expect(
      page.getByText(`BENCH-ASSISTANT-${SEEDED_TURNS - 1}`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    const viewport = page.locator('[data-slot="message-scroller-viewport"]');
    const oldest = page.getByText('BENCH-USER-0', { exact: true });

    // The first page is the newest window, so the oldest turn is behind the cursor.
    await expect(oldest).toHaveCount(0);

    const loadEarlier = page.getByRole('button', { name: /load earlier messages/i });
    await expect(loadEarlier).toBeVisible();

    const before = await viewport.evaluate((el) => ({
      height: el.scrollHeight,
      top: el.scrollTop,
    }));

    await loadEarlier.click();
    await expect(oldest).toBeVisible({ timeout: 30_000 });

    const after = await viewport.evaluate((el) => ({ height: el.scrollHeight, top: el.scrollTop }));

    // The older page is spliced in ABOVE the reader: the document grows...
    expect(after.height).toBeGreaterThan(before.height);
    // ...and preserveScrollOnPrepend pushes the reader down by roughly that much, instead of
    // leaving them pinned at the same offset now occupied by different messages.
    expect(after.top).toBeGreaterThan(before.top);
  });

  test('a persisted video attachment renders as a video, not an <img> of an MP4', async () => {
    await openAgentPanel(page);
    await expect(page.getByText(`BENCH-USER-${SEEDED_TURNS - 1}`, { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    // The regression: every media renderer in both chat transcripts was an <img>, so a video
    // attachment (and a video ad, and a reel) rendered its MP4 URL into an image tag.
    const video = page.locator(`video[src*="bench.mp4"]`);
    await expect(video).toHaveCount(1);
    await expect(page.locator(`img[src*="bench.mp4"]`)).toHaveCount(0);

    // The image alongside it still renders as an image — the primitive branches, it does not
    // simply turn everything into a video.
    await expect(page.locator(`img[src*="bench.png"]`)).toHaveCount(1);
  });

  test('an attached image really uploads and is sent to the agent as a reachable signed URL', async () => {
    await openAgentPanel(page);
    await expect(
      page.getByText(`BENCH-ASSISTANT-${SEEDED_TURNS - 1}`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    // Capture the outbound turn instead of running a live agent; hold the request open so the
    // stream never starts. The assertion is on what the Backend WOULD receive.
    const chatRequest = page.waitForRequest(
      (request) => request.url().includes('/api/organic/agent/chat') && request.method() === 'POST',
      { timeout: 60_000 },
    );
    await page.route('**/api/organic/agent/chat', async (route) => {
      await route.abort();
    });

    await page.setInputFiles('input[type="file"]', {
      name: 'bench-shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });

    // The chip must settle to ready — i.e. the upload actually completed and a URL was minted.
    // Submit is deliberately blocked while an upload is in flight.
    await expect(page.getByText('Uploading…')).toHaveCount(0, { timeout: 30_000 });
    // exact: the chip also renders an sr-only "Remove bench-shot.png" button.
    await expect(page.getByText('bench-shot.png', { exact: true })).toBeVisible();

    const editor = page.getByRole('textbox', { name: 'Message the organic agent' });
    await editor.click();
    await editor.pressSequentially('what is in this image?');
    // Submit is deliberately blocked while ANY upload is in flight — including the
    // async poster pass that continues after the "Uploading…" label clears. The
    // enabled Send button is the real submit gate; Enter before it is swallowed.
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled({
      timeout: 30_000,
    });
    await page.keyboard.press('Enter');

    const request = await chatRequest;
    const body = request.postDataJSON() as { images?: Array<{ url: string; mediaType?: string }> };

    // The exact bug: this array was provably always empty, because the composer discarded the File.
    expect(body.images ?? []).toHaveLength(1);
    const image = (body.images ?? [])[0];
    expect(image.url).toBeTruthy();
    expect(image.mediaType).toBe('image/png');

    // The URL is not just present, it RESOLVES: the object exists in the bucket and serves the
    // image bytes back. A signed URL that 403s would pass a shape-only check and fail in the field.
    // Local-stack artifact: `supabase functions serve` mints URLs on the Docker-internal gateway
    // host (kong:8000); the same gateway is exposed to this machine at 127.0.0.1:54321.
    const fetched = await page.request.get(
      image.url.replace('http://kong:8000', 'http://127.0.0.1:54321'),
    );
    expect(fetched.status()).toBe(200);
    expect(fetched.headers()['content-type'] ?? '').toContain('image');
    expect((await fetched.body()).length).toBeGreaterThan(0);
  });
});
