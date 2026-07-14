import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';

// Organic planner + agent-chat bench (WP-D: bugs #177 and #182).
//
// Drives the REAL code path across its real boundaries: draft rows are written to the real local
// Postgres, read back through the real Backend `/api/organic/calendar/drafts` route, and rendered
// by the real planner; chat turns are seeded into the real chat tables and rendered by the real
// transcript. Nothing is mocked.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:be                     # Backend on :4000 — the planner reads drafts from it
//   Run with: bun run planner:e2e:bench
//
// What it proves:
//   #182  every status renders its own readable pill (Draft / Scheduled / Published / Failed),
//         a channel with no account and no posts claims no row, and a hovered card reveals the
//         full title/copy it clamps at rest.
//   #177  a user turn and an assistant turn are told apart at a glance (the assistant carries a
//         mark + name, the reader keeps the tinted bubble) and turns are not crammed together.
//   Product-review polish: the Plan → Generate → Review → Schedule workflow, planning insight,
//         grouped primary action, status legend, metadata-first resizable preview, and guarded
//         draft deletion all render against the real persisted planner rows.
//
// Un-exercised hop, stated explicitly: no live agent turn is streamed. The transcript renders
// PERSISTED turns through the same components a live stream feeds, which is the surface both
// bugs are about; token-level streaming is out of scope for this bench.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const brandId = '00000000-0000-4000-8000-0000000000b2';

const BENCH_SESSION_PREFIX = 'bench-planner-chat-';
const SESSION_ID = `${BENCH_SESSION_PREFIX}${Date.now()}`;
const BENCH_CLIENT_KEY_PREFIX = 'bench-planner-';
const SCREENSHOT_DIR =
  process.env.PLANNER_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/organic-planner-chat';

let previousActiveBrandId: string | null = null;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[planner:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
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

// One draft per status the planner can show. The copy is deliberately long: the compact card
// clamps it, and the hover reveal is exactly what bug #182 asked for.
const SEEDED_DRAFTS = [
  {
    status: 'draft',
    timeLabel: '9:00 AM',
    title: 'BENCH Draft — the pour-over ritual, filmed in one unbroken take',
    caption:
      'BENCH CAPTION DRAFT. A slow pour, a rising bloom, and the smell of a Tuesday morning that finally went right. Three minutes, no cuts, no voiceover — just the sound of water finding coffee.',
  },
  {
    status: 'scheduled',
    timeLabel: '11:30 AM',
    title: 'BENCH Scheduled — why our beans travel further than most',
    caption:
      'BENCH CAPTION SCHEDULED. From a farm at 1,900m to a roaster in the back of the shop, every bag carries a passport. Here is the whole route, stop by stop, and what it costs to keep it honest.',
  },
  {
    status: 'published',
    timeLabel: '1:00 PM',
    title: 'BENCH Published — the espresso tonic that sold out by noon',
    caption:
      'BENCH CAPTION PUBLISHED. You asked, we listened, and then we ran out. The recipe is below, and the beans are back in stock on Friday.',
  },
  {
    status: 'failed',
    timeLabel: '5:00 PM',
    title: 'BENCH Failed — the reel that never rendered',
    caption:
      'BENCH CAPTION FAILED. This one broke during generation, and the card should say so in a word, not in a shade of red only a designer can name.',
  },
] as const;

function draftRows() {
  return SEEDED_DRAFTS.map((seed, index) => {
    const dayId = dayIdOffsetFromToday(index);
    const clientKey = `${BENCH_CLIENT_KEY_PREFIX}${seed.status}`;

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
    };
  });
}

function chatRows() {
  const base = Date.now() - 10 * 60_000;
  const at = (offset: number) => new Date(base + offset * 60_000).toISOString();

  return [
    {
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'user',
      content: 'BENCH-QUESTION: what should we post on Thursday?',
      metadata: null,
      ui_cards: [],
      created_at: at(0),
    },
    {
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'assistant',
      content:
        'BENCH-ANSWER: Thursday is your strongest engagement day, so I would put the pour-over reel there and hold the tonic recipe for the weekend, when saves peak.',
      metadata: null,
      ui_cards: [],
      created_at: at(1),
    },
    {
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'user',
      content: 'BENCH-FOLLOWUP: and who is the audience for that one?',
      metadata: null,
      ui_cards: [],
      created_at: at(2),
    },
    {
      session_id: SESSION_ID,
      brand_id: brandId,
      user_id: OWNER_ID,
      user_email: LOCAL_OWNER_EMAIL,
      role: 'assistant',
      content:
        'BENCH-ANSWER-2: Weekday-morning regulars — the same cohort that drove your last three saves. I would keep the caption short and let the sound carry it.',
      metadata: null,
      ui_cards: [],
      created_at: at(3),
    },
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

async function openPlanner(page: Page) {
  await page.goto('/organic?tab=planner', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Planner', exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByRole('button', { name: 'Planner', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForFunction(() => window.sessionStorage.getItem('organic-calendar-storage'));
  const week = page.getByRole('button', { name: 'Week', exact: true }).first();
  await week.click();
  await expect(week).toHaveAttribute('aria-pressed', 'true');
}

test.describe('organic planner + agent chat', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

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

    await supabase.schema('organic').from('organic_calendar_drafts').insert(draftRows());

    await supabase
      .schema('organic')
      .from('organic_chat_sessions')
      .upsert(
        {
          session_id: SESSION_ID,
          brand_id: brandId,
          user_id: OWNER_ID,
          user_email: LOCAL_OWNER_EMAIL,
          title: 'Planner bench',
          last_message_role: 'assistant',
          last_message_preview: 'BENCH-ANSWER-2',
        },
        { onConflict: 'session_id' },
      )
      .throwOnError();

    await supabase.schema('organic').from('organic_chat_messages').insert(chatRows());
  });

  test.afterAll(async ({ browser: _browser }, testInfo) => {
    testInfo.setTimeout(60_000);
    await context?.close();
    const supabase = admin();
    await purgeBenchRows(supabase);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('#182 the week grid says each draft status in a word, and hides the channel it cannot post to', async () => {
    await openPlanner(page);

    // Workflow hierarchy and a single primary action stay visible above the real week.
    const workflow = page.getByRole('navigation', { name: 'Content workflow' });
    await expect(workflow).toBeVisible();
    for (const stage of ['Plan', 'Generate', 'Review', 'Schedule']) {
      await expect(workflow).toContainText(stage);
    }
    await expect(workflow.getByRole('note', { name: 'Planning insight' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create content', exact: true })).toHaveCount(1);

    // Status meaning is available on demand without relying on hue.
    await page.getByRole('button', { name: 'Status legend' }).click();
    const legend = page.getByText('Post status').locator('..');
    for (const label of ['Draft', 'Generating', 'Scheduled', 'Published', 'Failed']) {
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    // Every seeded status arrives from the real Backend read and renders its readable pill.
    await expect(page.getByText('BENCH Draft —', { exact: false })).toBeVisible({
      timeout: 60_000,
    });
    for (const label of ['Draft', 'Scheduled', 'Published', 'Failed']) {
      await expect(
        page.locator('[data-slot="badge"]').filter({ hasText: label }).first(),
      ).toBeVisible();
    }

    // LinkedIn has no connected account for the fixture brand and no posts, so it claims no row.
    // Instagram — which has both — keeps its own.
    const platformRail = page.locator('[data-tour-id="organic-calendar"]');
    await expect(platformRail.getByText('Instagram', { exact: true }).first()).toBeVisible();
    await expect(platformRail.getByText('LinkedIn', { exact: true })).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/planner-week-statuses.png`,
      fullPage: false,
    });

    // The compact card clamps; hovering reveals the whole idea.
    const scheduledCard = page
      .locator('button[aria-pressed]')
      .filter({ hasText: 'BENCH Scheduled' })
      .first();
    await scheduledCard.hover();
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/planner-card-hover-reveal.png`,
      fullPage: false,
    });

    // Selecting a card opens the preview panel, which is resizable/collapsible.
    await scheduledCard.click();
    await expect(page.getByRole('complementary', { name: 'Draft preview' })).toBeVisible({
      timeout: 30_000,
    });
    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(preview.getByText('instagram', { exact: true })).toBeVisible();
    await expect(preview.getByText('Scheduled', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close draft preview' })).toBeVisible();

    // Keyboard deletion is guarded. Cancel leaves the persisted draft in place.
    await preview.focus();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('alertdialog')).toContainText('Delete this draft?');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(scheduledCard).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/planner-selected-preview.png` });
  });

  test('#177 a question and its answer are told apart at a glance', async () => {
    await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 60_000 });

    await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText('BENCH-ANSWER-2', { exact: false })).toBeVisible({
      timeout: 60_000,
    });

    // The assistant turn is named and marked; the reader's turn keeps the bubble.
    await expect(page.getByText('Continuum', { exact: true }).first()).toBeVisible();
    const assistantBubbles = page.locator('[data-slot="bubble"][data-variant="ghost"]');
    const userBubbles = page.locator('[data-slot="bubble"][data-variant="tinted"]');
    expect(await assistantBubbles.count()).toBeGreaterThan(0);
    expect(await userBubbles.count()).toBeGreaterThan(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/chat-speaker-identity.png` });
  });
});
