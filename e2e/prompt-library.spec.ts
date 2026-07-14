import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionForEmail } from './support/auth';

// The prompt library: a saved prompt is TEXT you insert, not a reference you attach.
//
// There were two half-built prompt libraries in the tree and neither was reachable: a
// localStorage one hanging off the unmounted OrganicExperience, and a DB-backed one whose
// picker was only ever rendered by an unmounted ChatSurface. This bench proves the one
// that now exists actually works, across the whole chain:
//
//   1. a prompt authored in Settings PERSISTS (survives a reload) — this is the assertion
//      that separates the new library from the localStorage one it replaces, which would
//      also have "worked" in a single page session, and
//   2. picking it in the composer TYPES ITS TEXT into the box — a prompt is an input the
//      user can still edit, which is precisely how it differs from a skill (a skill goes
//      on the wire as a structured reference; a prompt does not, and must not).
//
// Prereqs (the agent panel is a next/dynamic chunk — `next dev` leaves it unmounted, so
// the FE must be a PRODUCTION build):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run dev:be
//   bun run build && bun run start
// Run with: bun run prompts:e2e:bench

const OWNER_EMAIL = 'local@continuum.test';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const PROMPT_NAME = 'bench Launch Teaser';
const PROMPT_BODY = 'Write a three-line teaser for an upcoming product drop, no emojis.';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

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

  await admin.schema('brand_profiles').from('prompt_templates').delete().eq('name', PROMPT_NAME);
});

test.afterAll(async () => {
  await admin.schema('brand_profiles').from('prompt_templates').delete().eq('name', PROMPT_NAME);
});

async function openAgentPanel(page: Page) {
  await page.goto('/organic?tab=agent', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Agent', exact: true }).click({ timeout: 60_000 });
  await expect(page.locator('[data-slot="message-scroller-viewport"]')).toBeVisible({
    timeout: 60_000,
  });
}

test('a prompt authored in Settings persists, and picking it types its text into the composer', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    storageState: await mintSessionForEmail(OWNER_EMAIL),
  });
  const page = await context.newPage();

  // ── 1. author it in Settings ────────────────────────────────────────────────
  await page.goto('/settings?section=prompts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'New prompt' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'New prompt' }).click();

  await page.getByLabel('Prompt name').fill(PROMPT_NAME);
  await page.getByLabel('Prompt text').fill(PROMPT_BODY);
  await page.getByRole('button', { name: 'Create prompt' }).click();

  await expect(page.getByText(PROMPT_NAME)).toBeVisible({ timeout: 30_000 });

  // ── 2. it PERSISTS — the whole point of replacing the localStorage library ───
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(PROMPT_NAME)).toBeVisible({ timeout: 30_000 });

  const { data: row } = await admin
    .schema('brand_profiles')
    .from('prompt_templates')
    .select('id, prompt, brand_profile_id, status')
    .eq('name', PROMPT_NAME)
    .single();

  expect(row, 'the prompt should exist as a row, not in localStorage').toBeTruthy();
  expect(row?.prompt).toBe(PROMPT_BODY);
  expect(row?.brand_profile_id).toBe(BRAND_ID);
  expect(row?.status).toBe('active');

  // ── 3. picking it in the composer types the text in ─────────────────────────
  await openAgentPanel(page);

  await page.getByRole('button', { name: 'Insert a saved prompt' }).click();

  const manageLink = page.getByRole('link', { name: 'Manage prompts' });
  await expect(manageLink).toHaveAttribute('href', '/settings?section=prompts');

  await page.getByRole('option', { name: new RegExp(PROMPT_NAME, 'i') }).click();

  const composer = page.locator('[contenteditable="true"]').first();
  await expect(composer).toContainText('three-line teaser', { timeout: 15_000 });

  // It is an INPUT, not an annotation: the user can keep typing on the end of it.
  await composer.click();
  await page.keyboard.type(' Make it punchier.');
  await expect(composer).toContainText('Make it punchier.');

  console.log(
    `\n  "${PROMPT_NAME}" persisted as a brand_profiles.prompt_templates row and typed itself\n` +
      `  into the composer, still editable. It is an input, not a reference.\n`,
  );

  await context.close();
});
