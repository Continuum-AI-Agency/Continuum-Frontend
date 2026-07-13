import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionForEmail } from './support/auth';

// Mid-run projection — the browser hop.
//
// agent:runs:bench already proves the RUN survives you walking away: the durable log keeps
// growing after the socket dies and the turn persists whole. What it cannot prove is what
// you SEE when you come back, and that is the part that was broken:
//
//   An assistant message is only persisted when its run FINISHES. So mid-run the database
//   holds your question and nothing else. A panel that remounts and hydrates from history
//   therefore showed a question with no answer and no spinner — a live run looked like a
//   hung one.
//
// This drives the real browser against the real agent: send a turn, LEAVE THE PAGE while the
// model is still talking, come back, and assert the answer is on screen and still growing.
// The text can only be there if the app-level store kept tailing the run while the panel was
// unmounted and the panel then folded that log back into the transcript.
//
// Prerequisites (see e2e/README.md — the FE must be a PRODUCTION build, not `next dev`:
// the agent panel is a next/dynamic chunk and dev's on-demand compilation leaves it unmounted):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:be
//   bun run build && bun run start        (built with .env.local sourced)
// Run with: bun run projection:e2e:bench

const OWNER_EMAIL = 'local@continuum.test';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-0000-0000-0000000000b1';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

// Deliberately long. The proof below requires a WINDOW in which the run is still going after
// we navigate back — if the model finishes first, the assistant message is already persisted
// and the transcript could simply have been hydrated from history, which would let the bench
// pass without the projection existing at all.
const PROMPT =
  'Write a detailed 400-word guide to writing Instagram captions. Cover hooks, ' +
  'structure, calls to action, hashtag strategy, and three worked examples.';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' });

  // /organic Zod-normalizes EVERY onboarding row for the user and THROWS on a malformed one,
  // which kills the whole Server Components render regardless of which brand is active. The
  // local stack leaves state as {}, so repair them or the page is just an error boundary.
  // The table is keyed (user_id, brand_id) — there is no `id` column.
  const { data: rows } = await admin
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .select('brand_id, state')
    .eq('user_id', OWNER_ID)
    .throwOnError();

  for (const row of rows ?? []) {
    const r = row as { brand_id: string; state: Record<string, unknown> | null };
    if (r.state && typeof r.state.step === 'number') continue;
    await admin
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .update({ state: createDefaultOnboardingState() })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', r.brand_id)
      .throwOnError();
  }
});

/** Poll until `read` returns something non-null, or fail loudly saying what we were waiting for. */
async function pollFor<T>(
  read: () => Promise<T | null>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

const newestRun = async () => {
  const { data } = await admin
    .schema('organic')
    .from('organic_agent_runs')
    .select('run_id,session_id,status')
    .eq('brand_id', BRAND_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as { run_id: string; session_id: string; status: string } | undefined) ?? null;
};

const runStatus = async (runId: string): Promise<string> => {
  const { data } = await admin
    .schema('organic')
    .from('organic_agent_runs')
    .select('status')
    .eq('run_id', runId)
    .maybeSingle();
  return ((data as { status?: string } | null)?.status as string) ?? 'missing';
};

const maxSeq = async (runId: string): Promise<number> => {
  const { data } = await admin
    .schema('organic')
    .from('organic_agent_run_events')
    .select('seq')
    .eq('run_id', runId)
    .order('seq', { ascending: false })
    .limit(1);
  return (data?.[0]?.seq as number | undefined) ?? -1;
};

const persistedAssistant = async (runId: string): Promise<string> => {
  const run = await admin
    .schema('organic')
    .from('organic_agent_runs')
    .select('session_id')
    .eq('run_id', runId)
    .maybeSingle();
  const sessionId = (run.data as { session_id?: string } | null)?.session_id;
  if (!sessionId) return '';

  const { data } = await admin
    .schema('organic')
    .from('organic_chat_messages')
    .select('content')
    .eq('session_id', sessionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.content as string | undefined) ?? '';
};

/**
 * ONLY the assistant's own prose. Reading the whole viewport would let page chrome, the echoed
 * user message, or a spinner satisfy a length assertion — the bench would go green having
 * proven nothing.
 */
const assistantTextOf = async (transcript: Locator): Promise<string> => {
  const bubbles = transcript.locator('[data-slot="bubble"]');
  const count = await bubbles.count();
  if (count === 0) return '';

  const texts = await bubbles.allInnerTexts();
  const assistantOnly = texts.filter((t) => !t.includes(PROMPT));
  return assistantOnly.join('\n').trim();
};

// The panel is a next/dynamic chunk mounted only by the ACTIVE tab — the query param alone
// does not render it.
async function openAgentPanel(page: Page) {
  await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 60_000 });
  await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
    timeout: 60_000,
  });
}

test('a turn left mid-run is still streaming when you come back to it', async ({ browser }) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({
    storageState: await mintSessionForEmail(OWNER_EMAIL),
  });
  const page = await context.newPage();

  await openAgentPanel(page);

  const transcript = page.locator('[data-slot="message-scroller-viewport"]');
  const composer = page.locator('[contenteditable="true"]').first();
  await expect(composer).toBeVisible({ timeout: 60_000 });

  await composer.click();
  await page.keyboard.type(PROMPT);
  await page.keyboard.press('Enter');

  // The run must genuinely exist and be RUNNING, or "leaving mid-run" interrupts nothing and
  // every assertion below passes for free.
  const runId = await pollFor(
    async () => (await newestRun())?.run_id ?? null,
    120_000,
    'a run row to be created',
  );
  expect(await runStatus(runId)).toBe('running');

  // Wait for REAL streamed prose — the assistant's own words on screen, not chrome. Anything
  // less and we would be leaving before the model said anything.
  const assistantTextBeforeLeaving = await pollFor(
    async () => {
      const text = await assistantTextOf(transcript);
      return text.length >= 60 ? text : null;
    },
    120_000,
    'the model to be mid-answer on screen',
  );

  // And the run must STILL be going when we walk out.
  expect(await runStatus(runId)).toBe('running');
  const seqAtLeaving = await maxSeq(runId);

  // LEAVE. This unmounts the panel and kills its NDJSON reader. Before this work it also
  // killed the run on the Backend.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-slot="message-scroller-viewport"]')).toHaveCount(0);

  // Come back to the same conversation.
  await openAgentPanel(page);

  // THE ASSERTION, and it is a narrow one on purpose.
  //
  // We wait for a moment where the assistant text on screen has GROWN past what we saw before
  // leaving, WHILE the assistant message is STILL ABSENT FROM THE DATABASE (it is only written
  // when the run ends). At that instant the text cannot have come from history — this mount
  // never streamed it, and there is nothing to hydrate. The only possible source is the frame
  // log the app-level store kept tailing while the panel was unmounted.
  //
  // Without the `persisted === ''` half, a run that finished before we navigated back would let
  // this pass on plain history hydration, proving nothing.
  const grownText = await pollFor(
    async () => {
      const [text, persisted] = await Promise.all([
        assistantTextOf(transcript),
        persistedAssistant(runId),
      ]);
      if (persisted.length > 0) return null;
      return text.length > assistantTextBeforeLeaving.length ? text : null;
    },
    120_000,
    'projected text to outgrow what we saw, while the DB still holds no assistant message',
  );

  expect(grownText.startsWith(assistantTextBeforeLeaving.slice(0, 40))).toBe(true);
  expect(await maxSeq(runId)).toBeGreaterThan(seqAtLeaving);

  // It ends properly: the run settles and the whole turn lands in the transcript.
  await pollFor(
    async () => ((await runStatus(runId)) === 'completed' ? true : null),
    120_000,
    'the abandoned run to complete',
  );

  const persisted = await persistedAssistant(runId);
  expect(persisted.length).toBeGreaterThan(assistantTextBeforeLeaving.length);

  const finalOnScreen = await assistantTextOf(transcript);
  expect(finalOnScreen.length).toBeGreaterThanOrEqual(assistantTextBeforeLeaving.length);

  console.log(
    `\n  saw ${assistantTextBeforeLeaving.length} chars before leaving (seq ${seqAtLeaving});` +
      ` came back to ${grownText.length} on screen; DB holds ${persisted.length}.\n`,
  );

  await context.close();
});
