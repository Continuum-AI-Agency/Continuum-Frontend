import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';

// Planner status + agent-chat speaker bench (WP-D: bugs #182 and #177).
//
// Drives the REAL code path across its real boundaries: draft rows are written to the real local
// Postgres, read back through the real Backend `/api/organic/calendar/drafts` route, and rendered
// by the real planner; chat turns are seeded into the real chat tables and rendered by the real
// transcript. Nothing is mocked.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:be                    # Backend on :4000 — the planner reads its drafts from it
//   Run with: bun run planner:status:e2e:bench
//
// What it proves:
//   #182  each status renders its own readable word (Draft / Scheduled / Published / Failed) —
//         scheduled and published are no longer two shades of the same emerald dot; a channel with
//         no connected account and no posts claims no row; a hovered card reveals the title/copy
//         it clamps at rest.
//   #177  a question and its answer are told apart at a glance: the assistant turn carries a mark
//         and a name and stays full-width (its cards still get the column), the reader's turn keeps
//         a tinted bubble, and the turns are not crammed together.
//
// Un-exercised hop, stated explicitly: no live agent turn is streamed. The transcript renders
// PERSISTED turns through the same components a live stream feeds — the surface both bugs are
// about — but token-level streaming is not exercised here.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
// The RFC-4122-valid fixture brand. The legacy fixture brand (…0000b1) has a zero version nibble,
// which the Backend's `z.uuid()` on /api/organic/calendar/drafts rejects outright — the planner
// would then render an empty grid and the bench would be proving nothing.
const brandId = '00000000-0000-4000-8000-0000000000b2';

const BENCH_SESSION_PREFIX = 'bench-wpd-status-';
const SESSION_ID = `${BENCH_SESSION_PREFIX}${Date.now()}`;
const BENCH_CLIENT_KEY_PREFIX = 'bench-wpd-';
const SCREENSHOT_DIR =
  process.env.PLANNER_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/organic-planner-status';

let previousActiveBrandId: string | null = null;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[planner:status:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
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

// One draft per status the planner can show, all on Instagram. The copy is deliberately long: the
// compact card clamps it at rest, which is what the hover reveal is for.
const SEEDED_DRAFTS = [
  {
    status: 'draft',
    timeLabel: '9:00 AM',
    title: 'WPD Draft — the pour-over ritual, filmed in one unbroken take',
    caption:
      'WPD CAPTION DRAFT. A slow pour, a rising bloom, and the smell of a Tuesday morning that finally went right. Three minutes, no cuts, no voiceover — just the sound of water finding coffee.',
  },
  {
    status: 'scheduled',
    timeLabel: '11:30 AM',
    title: 'WPD Scheduled — why our beans travel further than most',
    caption:
      'WPD CAPTION SCHEDULED. From a farm at 1,900m to a roaster in the back of the shop, every bag carries a passport. Here is the route, stop by stop, and what it costs to keep it honest.',
  },
  {
    status: 'published',
    timeLabel: '1:00 PM',
    title: 'WPD Published — the espresso tonic that sold out by noon',
    caption:
      'WPD CAPTION PUBLISHED. You asked, we listened, and then we ran out. The recipe is below, and the beans are back in stock on Friday.',
  },
  {
    status: 'failed',
    timeLabel: '5:00 PM',
    title: 'WPD Failed — the reel that never rendered',
    caption:
      'WPD CAPTION FAILED. This one broke during generation, and the card should say so in a word, not in a shade of red only a designer can name.',
  },
] as const;

function draftRows() {
  return SEEDED_DRAFTS.map((seed, index) => {
    const dayId = dayIdOffsetFromToday(index);
    const clientKey = `${BENCH_CLIENT_KEY_PREFIX}${seed.status}`;
    const contentJson =
      seed.status === 'draft'
        ? {
            content: { type: 'post', format: 'FeedPost' },
            copy: {
              caption: seed.caption,
              hashtags: { high: [], medium: [], low: [] },
              claims: [],
            },
            creative: {
              mediaSuggestion: {
                kind: 'image',
                assetUrl: 'https://staging.example/planner-approval-bench.jpg',
              },
            },
            quality: { passed: true },
          }
        : undefined;

    return {
      brand_id: brandId,
      user_id: OWNER_ID,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: seed.status,
      scheduled_date: `${dayId}T12:00:00.000Z`,
      client_key: clientKey,
      media_stage: 'text_only',
      slot_data: {
        placementId: clientKey,
        dayId,
        weekStart: dayId,
        timeLabel: seed.timeLabel,
        platform: 'instagram',
        trendId: null,
        title: seed.title,
        caption: seed.caption,
        draftSnapshot: {
          id: clientKey,
          clientKey,
          title: seed.title,
          summary: '',
          timeLabel: seed.timeLabel,
          dateLabel: dayId,
          status: seed.status,
          platforms: ['instagram'],
          format: 'Post',
          objective: 'Engagement',
          creativeIdea: seed.title,
          captionPreview: seed.caption,
          tags: [],
          mediaCount: 0,
        },
      },
      ...(contentJson ? { content_json: contentJson } : {}),
    };
  });
}

function chatRows() {
  const base = Date.now() - 10 * 60_000;
  const at = (offset: number) => new Date(base + offset * 60_000).toISOString();
  const turn = (role: 'user' | 'assistant', content: string, offset: number) => ({
    session_id: SESSION_ID,
    brand_id: brandId,
    user_id: OWNER_ID,
    user_email: LOCAL_OWNER_EMAIL,
    role,
    content,
    metadata: null,
    ui_cards: [],
    created_at: at(offset),
  });

  return [
    turn('user', 'WPD-QUESTION: what should we post on Thursday?', 0),
    turn(
      'assistant',
      'WPD-ANSWER: Thursday is your strongest engagement day, so I would put the pour-over reel there and hold the tonic recipe for the weekend, when saves peak.',
      1,
    ),
    turn('user', 'WPD-FOLLOWUP: and who is the audience for that one?', 2),
    turn(
      'assistant',
      'WPD-ANSWER-2: Weekday-morning regulars — the same cohort that drove your last three saves. Keep the caption short and let the sound carry it.',
      3,
    ),
  ];
}

async function purgeBenchRows(supabase: SupabaseClient): Promise<void> {
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
  await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', brandId)
    .like('client_key', `${BENCH_CLIENT_KEY_PREFIX}%`);
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

// The /organic page Zod-normalizes EVERY onboarding row the user has, so one malformed row (the
// local stack leaves `state = {}`) takes the whole page down whichever brand is active.
async function repairOnboarding(supabase: SupabaseClient): Promise<void> {
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
}

// The view mode is persisted per user, so the planner can open on Month. The URL param is the
// authoritative way in (`initialView`); the toolbar click is a belt-and-braces follow-up. Readiness
// is the week grid's own platform rail, not a toolbar attribute.
async function openWeekPlanner(page: Page) {
  await page.goto('/organic?tab=planner&view=week', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  const plannerTab = page.getByRole('button', { name: 'Planner', exact: true });
  await expect(plannerTab).toBeVisible({ timeout: 90_000 });
  await plannerTab.click();

  const grid = page.locator('[data-tour-id="organic-calendar"]');
  const weekToggle = page.getByRole('button', { name: 'Week', exact: true }).first();
  await expect
    .poll(
      async () => {
        if ((await grid.getByText('Platform', { exact: true }).count()) > 0) return 'week';
        await weekToggle.click({ timeout: 5_000 }).catch(() => {});
        return 'not-week';
      },
      { timeout: 90_000, intervals: [1000, 2000, 3000] },
    )
    .toBe('week');
}

test.describe('organic planner status + agent chat speakers', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let context: BrowserContext | null = null;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();

    const supabase = admin();
    const { data: pref } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;

    await setActiveBrand(supabase, brandId);
    await repairOnboarding(supabase);
    await purgeBenchRows(supabase);

    await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .insert(draftRows())
      .throwOnError();

    await supabase
      .schema('organic')
      .from('organic_chat_sessions')
      .upsert(
        {
          session_id: SESSION_ID,
          brand_id: brandId,
          user_id: OWNER_ID,
          user_email: LOCAL_OWNER_EMAIL,
          title: 'WP-D bench',
          last_message_role: 'assistant',
          last_message_preview: 'WPD-ANSWER-2',
          // The session list orders on last_message_at; a null here sinks the session below every
          // other row and the panel opens on someone else's conversation.
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' },
      )
      .throwOnError();

    await supabase
      .schema('organic')
      .from('organic_chat_messages')
      .insert(chatRows())
      .throwOnError();
  });

  // Playwright requires an object-destructuring first argument; nothing is taken from it here.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    await context?.close();
    const supabase = admin();
    await purgeBenchRows(supabase);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('#182 every status says its own word, and a channel with nothing to post claims no row', async () => {
    await openWeekPlanner(page);

    // The seeded drafts arrive through the real Backend read.
    await expect(page.getByText('WPD Draft —', { exact: false })).toBeVisible({ timeout: 90_000 });

    // Each status renders its own readable pill — the fix for "scheduled and published are the
    // same emerald dot".
    // Case-insensitive: the card renders the pill through `uppercase`, and text matching reads the
    // transformed text.
    for (const label of ['Draft', 'Scheduled', 'Published', 'Failed']) {
      await expect(
        page
          .locator('[data-slot="badge"]')
          .filter({ hasText: new RegExp(`^${label}$`, 'i') })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    // LinkedIn has no connected account for the fixture brand and no posts, so it claims no row;
    // Instagram — which has posts — keeps its own.
    const grid = page.locator('[data-tour-id="organic-calendar"]');
    await expect(grid.getByText('Instagram', { exact: true }).first()).toBeVisible();
    await expect(grid.getByText('LinkedIn', { exact: true })).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/planner-week-statuses.png` });

    // The compact card clamps its copy; hovering reveals the whole idea.
    const scheduledCard = page
      .locator('button[aria-pressed]')
      .filter({ hasText: 'WPD Scheduled' })
      .first();
    await scheduledCard.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/planner-card-hover-reveal.png` });

    // Selecting a card opens the preview, whose status word comes from the same map as the pill.
    await scheduledCard.click();
    await expect(page.getByRole('complementary', { name: 'Draft preview' })).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/planner-selected-preview.png` });
  });

  test('#177 a question and its answer are told apart at a glance', async () => {
    await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 60_000 });

    await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
      timeout: 90_000,
    });
    // Scoped to the assistant's own bubble: the answer has to be IN the turn, not merely somewhere
    // on the page (the session list also carries a preview of it).
    const assistantBubbles = page.locator('[data-slot="bubble"][data-variant="ghost"]');
    await expect(assistantBubbles.filter({ hasText: 'WPD-ANSWER-2' })).toBeVisible({
      timeout: 60_000,
    });

    // The assistant turn is named and marked; the reader's turn keeps the (tinted) bubble, and the
    // assistant's bubble stays ghost/full-width so its inline cards still get the whole column.
    await expect(page.getByText('Continuum', { exact: true }).first()).toBeVisible();
    expect(
      await page.locator('[data-slot="bubble"][data-variant="ghost"]').count(),
    ).toBeGreaterThan(0);
    expect(
      await page.locator('[data-slot="bubble"][data-variant="tinted"]').count(),
    ).toBeGreaterThan(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/chat-speaker-identity.png` });
  });

  test('approve and schedule sends a bodyless POST and persists the scheduled draft', async () => {
    await openWeekPlanner(page);

    const card = page.locator('button[aria-pressed]').filter({ hasText: 'WPD Draft' }).first();
    await expect(card).toBeVisible({ timeout: 90_000 });
    await card.click();

    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    const approveButton = preview.getByRole('button', { name: 'Approve & Schedule' });
    await expect(approveButton).toBeEnabled({ timeout: 30_000 });

    const approvalResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/organic/calendar/drafts/') &&
        response.url().endsWith('/approve') &&
        response.request().method() === 'POST',
    );
    await approveButton.click();

    const response = await approvalResponse;
    expect(response.status()).toBe(200);
    expect(response.request().postData()).toBeNull();
    expect(response.request().headers()['content-type']).toBeUndefined();

    const supabase = admin();
    await expect
      .poll(
        async () => {
          const { data, error } = await supabase
            .schema('organic')
            .from('organic_calendar_drafts')
            .select('status')
            .eq('brand_id', brandId)
            .eq('client_key', `${BENCH_CLIENT_KEY_PREFIX}draft`)
            .single();
          if (error) throw error;
          return data?.status;
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe('scheduled');
  });
});
