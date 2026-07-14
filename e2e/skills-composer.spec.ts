import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionForEmail } from './support/auth';

// Skills in the organic agent: ONE place to apply, ONE place to manage.
//
// The agent chat used to carry two skill surfaces — the composer picker (applies a
// skill) and a floating bottom-right "Manage skills" wizard (CRUD, and it could not
// apply anything). The wizard is gone; management lives in Settings, which the picker
// deep-links to. This bench proves BOTH halves of that claim against the real app:
//
//   1. the floating wizard is really gone (not just hidden), and
//   2. the surviving surface actually works — a skill picked in the composer reaches
//      the BACKEND as a structured reference. That is the assertion worth keeping:
//      deleting a UI is easy to get right, but silently breaking the one path that
//      remains is the failure mode that matters.
//
// We assert on the outbound chat request rather than on a finished turn: the reference
// on the wire is the exact thing the backend's resolveSkillContext reads to build
// `appliedSkills`, and it does not depend on a model round-trip to observe.
//
// Prereqs (the agent panel is a next/dynamic chunk — `next dev` leaves it unmounted,
// so the FE must be a PRODUCTION build):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:be
//   bun run build && bun run start
// Run with: bun run skills:e2e:bench

const OWNER_EMAIL = 'local@continuum.test';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-0000-0000-0000000000b1';

const SKILL_NAME = 'bench Punchy Hooks';
const SKILL_DIRECTIVES = 'Open every caption with a scroll-stopping one-line hook.';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

let skillId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' });

  // /organic Zod-normalizes every onboarding row for the user and THROWS on a malformed
  // one, which kills the whole render. The local stack leaves state as {}.
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

  await admin.schema('skills').from('skills').delete().eq('name', SKILL_NAME);
  const { data, error } = await admin
    .schema('skills')
    .from('skills')
    .insert({
      brand_id: BRAND_ID,
      name: SKILL_NAME,
      slug: 'bench-punchy-hooks',
      kind: 'creative_direction',
      description: 'Lead with a hook',
      directives: SKILL_DIRECTIVES,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not seed skill: ${error?.message}`);
  skillId = data.id as string;
});

test.afterAll(async () => {
  if (skillId) await admin.schema('skills').from('skills').delete().eq('id', skillId);
});

async function openAgentPanel(page: Page) {
  await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 60_000 });
  await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
    timeout: 60_000,
  });
}

test('the floating skill wizard is gone, and the composer picker puts the skill on the wire', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    storageState: await mintSessionForEmail(OWNER_EMAIL),
  });
  const page = await context.newPage();

  await openAgentPanel(page);

  // 1. The bottom-right wizard is really gone.
  await expect(page.getByRole('button', { name: 'Skill wizard' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage skills' })).toHaveCount(0);

  // 2. The composer picker lists the brand skill and offers the Settings deep-link.
  await page.getByRole('button', { name: 'Apply a brand skill' }).click();
  const manageLink = page.getByRole('link', { name: 'Manage skills' });
  await expect(manageLink).toHaveAttribute('href', '/settings?section=skills');

  await page.getByRole('option', { name: new RegExp(SKILL_NAME, 'i') }).click();

  // Picking inserts a mention chip into the composer — the same channel @-mention uses.
  const composer = page.locator('[contenteditable="true"]').first();
  await expect(composer).toContainText('bench-punchy-hooks', { timeout: 15_000 });

  // 3. THE ASSERTION: the picked skill leaves the browser as a structured reference on
  // the chat request. This is precisely what the backend reads to build `appliedSkills`.
  const chatRequest = page.waitForRequest(
    (req) => req.url().includes('/api/organic/agent/chat') && req.method() === 'POST',
    { timeout: 60_000 },
  );

  await composer.click();
  await page.keyboard.type('Draft one Instagram caption.');
  await page.keyboard.press('Enter');

  const request = await chatRequest;
  const body = JSON.parse(request.postData() ?? '{}');

  const references: Array<{ id: string; type: string }> =
    body.references ?? body.context?.references ?? [];

  expect(
    references.some((ref) => ref.type === 'skill' && ref.id === skillId),
    `expected a skill reference for ${skillId} on the chat request, got ${JSON.stringify(references)}`,
  ).toBe(true);

  console.log(
    `\n  picked "${SKILL_NAME}" in the composer; it reached the backend as reference ` +
      `{type:'skill', id:'${skillId}'} — the input resolveSkillContext turns into appliedSkills.\n`,
  );

  await context.close();
});
