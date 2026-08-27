import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// Onboarding brand-reveal honesty bench — does the reveal show what we READ, or what we
// can draw?
//
// The bug this bench exists to keep dead: `dna/FontSample.tsx` rendered `Aa` with
// `style={{ fontFamily: family }}` and labelled it with the brand's family name. A brand
// font is never served to a browser (`Continuum-Backend/App/brand-knowledge/fonts/
// store.ts` mints no URL for one), so the browser fell back to the app's own typeface and
// the customer was shown a substitute wearing their brand's name.
//
// Every assertion here is on BEHAVIOUR, not on markup:
//   · the specimen check reads COMPUTED `font-family` off every node in the typography
//     card, so it fails for any way of asking a browser to draw the brand's face — an
//     inline style, a class, a `<style>` block — not just the one the old code used;
//   · the empty check asserts a field that came back empty is VISIBLY marked empty, and
//     that the mark is not the family name and not a placeholder glyph;
//   · the colour check asserts a hex with no recorded role carries no sentence.
//
// A NEGATIVE CONTROL re-introduces the exact bug in the live page and proves the specimen
// scanner reports it. Without that, a scanner that silently found nothing would look
// identical to a scanner that works.
//
// Real path across real boundaries: an ephemeral user and brand are created through the
// same `plugin_mcp.create_brand_stub` RPC the product uses, the onboarding state and the
// preview-run snapshot are written to the real local Postgres, the REAL Backend serves
// `/onboarding/brand-profiles/:brandId/preview/latest` and `/preview/:runId`, and the REAL
// onboarding page renders them. Nothing is mocked and nothing is stubbed in the browser.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run onboarding:dna:bench
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · A live preview RUN. The agent workflow costs a model call per section and is not
//     deterministic; the snapshot it persists is seeded directly and read back through the
//     real Backend route, so the resume path is real end to end and the generation is not.
//   · The font STORE. Onboarding never reads it (see the comment in `dna/IdentityPanel`),
//     so there is no `in the engine` badge on this surface to assert — which is precisely
//     why NO specimen may be drawn here for ANY family.

const OWNER_PASSWORD = 'onboarding-dna-bench';
const SCREENSHOT_DIR = process.env.ONBOARDING_DNA_SCREENSHOT_DIR ?? 'e2e/__screenshots__/onboarding-dna';

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[onboarding:dna:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const brandProfiles = (client: SupabaseClient) => client.schema('brand_profiles');

/* -- the fixture ----------------------------------------------------------- */

const SITE_URL = 'https://onboarding-dna-bench.test';

/** A family no browser has and the engine does not hold — the whole point of the bench. */
const READ_FAMILY = 'Publico';
/** The saved-profile scenario's family. Also unavailable to any browser. */
const SAVED_FAMILY = 'Founders Grotesk';

const ROLED_PALETTE = { primary: '#101010', accent: '#ffaa1c' };
const BARE_HEXES = ['#101010', '#ffaa1c', '#e4ddce'];

const HERO = 'The bench brand states exactly one thing about itself.';

/**
 * The persisted snapshot of a finished run.
 *
 * `voice`, `target_audience`, `strategy` and `guidelines` are deliberately absent: an
 * empty section is a CORRECT outcome, and the reveal has to say so rather than breathe a
 * skeleton at it for ever.
 */
const COMPLETED_RESULT = {
  structured: {
    website: {
      website_url: SITE_URL,
      hero_statement: HERO,
      palette: ROLED_PALETTE,
      typography: { primary: READ_FAMILY, secondary: null },
    },
    documents: {},
  },
  readiness: null,
  first_impression: null,
};

function onboardingState(overrides: {
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
}) {
  return {
    // The Brand DNA screen is reached by DATA FLOOR, not by a literal index: a sibling
    // step landing in `OnboardingExperience` shifts every number, and `resumeScreenFor`
    // keeps its floors next to the screen map. One recorded invite is the floor that
    // reaches the reveal without touching anything the reveal renders.
    step: 5,
    brand: {
      name: 'DNA Bench Brand',
      industry: '',
      brandVoice: null,
      brandVoiceTags: [],
      targetAudience: null,
      timezone: 'UTC',
      website: SITE_URL,
      logoPath: null,
      colors: overrides.colors,
      typography: overrides.typography,
      values: [],
      tagline: null,
      overview: null,
      readiness: null,
      understanding: null,
      audits: null,
    },
    documents: [],
    connections: {},
    members: [],
    invites: [
      {
        id: 'dna-bench-invite',
        email: 'teammate@continuum-e2e.test',
        role: 'operator',
        token: 'dna-bench-token',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      },
    ],
    completedAt: null,
    emailReportOptIn: true,
    selectedInspiration: null,
    preview: null,
  };
}

/* -- provisioning ---------------------------------------------------------- */

interface Fixture {
  email: string;
  userId: string;
  brandId: string;
}

async function provision(label: string): Promise<Fixture> {
  const supabase = admin();
  const email = `onboarding-dna-${label}-${crypto.randomUUID()}@continuum-e2e.test`;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (error || !created.user) {
    throw new Error(`[onboarding:dna:bench] createUser failed: ${error?.message}`);
  }
  const { data: brandId, error: stubError } = await supabase
    .schema('plugin_mcp')
    .rpc('create_brand_stub', { p_user_id: created.user.id, p_brand_name: 'DNA Bench Brand' });
  if (stubError || typeof brandId !== 'string') {
    throw new Error(`[onboarding:dna:bench] create_brand_stub failed: ${stubError?.message}`);
  }
  return { email, userId: created.user.id, brandId };
}

async function seedOnboardingState(
  fixture: Fixture,
  overrides: Parameters<typeof onboardingState>[0],
): Promise<void> {
  await brandProfiles(admin())
    .from('user_onboarding_states')
    .upsert(
      {
        user_id: fixture.userId,
        brand_id: fixture.brandId,
        is_active: true,
        state: onboardingState(overrides),
      },
      { onConflict: 'user_id,brand_id' },
    )
    .throwOnError();
}

async function seedCompletedRun(fixture: Fixture): Promise<void> {
  await brandProfiles(admin())
    .from('preview_runs')
    .insert({
      brand_id: fixture.brandId,
      status: 'completed',
      prompt_version: 1,
      input_hash: `dna-bench-${fixture.brandId}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      result: COMPLETED_RESULT,
    })
    .throwOnError();
}

async function teardown(fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  const supabase = admin();
  // Best-effort: an orphaned ephemeral row is low-harm, and a throw here would mask the
  // real result of the run.
  const attempts: Array<Promise<unknown>> = [
    brandProfiles(supabase).from('preview_runs').delete().eq('brand_id', fixture.brandId),
    brandProfiles(supabase)
      .from('user_onboarding_states')
      .delete()
      .eq('user_id', fixture.userId),
    brandProfiles(supabase)
      .from('permissions')
      .delete()
      .eq('brand_profile_id', fixture.brandId),
    brandProfiles(supabase).from('brand_profiles').delete().eq('id', fixture.brandId),
  ];
  for (const attempt of attempts) {
    await Promise.resolve(attempt).catch(() => undefined);
  }
  await supabase.auth.admin.deleteUser(fixture.userId).catch(() => undefined);
}

/* -- the specimen scanner -------------------------------------------------- */

/**
 * Every node in the typography card whose COMPUTED font-family names a brand family.
 *
 * Computed style, not the `style` attribute: the claim under test is "the browser is
 * never asked to draw the brand's face", and a class or a stylesheet rule would make that
 * claim false just as loudly as the inline style the original bug used.
 */
async function specimenViolations(page: Page, families: string[]): Promise<string[]> {
  return page.evaluate((wanted: string[]) => {
    const root = document.querySelector('[data-testid="reveal-typography"]');
    if (!root) return ['NO_TYPOGRAPHY_CARD'];
    const found: string[] = [];
    for (const node of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const family = window.getComputedStyle(node).fontFamily ?? '';
      for (const candidate of wanted) {
        if (family.toLowerCase().includes(candidate.toLowerCase())) {
          found.push(`${node.tagName}[${family}]`);
        }
      }
    }
    return found;
  }, families);
}

/* -- the run --------------------------------------------------------------- */

let backend: LocalBackend | null = null;

async function openReveal(
  browser: import('@playwright/test').Browser,
  fixture: Fixture,
): Promise<{ context: BrowserContext; page: Page }> {
  const storageState = await mintSessionForEmail(fixture.email);
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await context.addCookies(storageState.cookies);
  const page = await context.newPage();
  await page.goto(`/onboarding?brand=${fixture.brandId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('brand-dna-identity')).toBeVisible({ timeout: 120_000 });
  return { context, page };
}

test.describe.configure({ mode: 'serial' });

test.describe('onboarding brand reveal — honesty', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'Needs the local Supabase stack: bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );

  // Playwright requires an object-destructuring first argument; nothing is taken from it.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    backend = await startLocalBackend({
      port: Number(process.env.ONBOARDING_DNA_BENCH_BACKEND_PORT ?? 4413),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3113',
      label: 'onboarding:dna:bench',
    });
  });

  // Playwright requires an object-destructuring first argument; nothing is taken from it.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    await backend?.stop();
    backend = null;
  });

  test('a family read off the site shows its NAME and no specimen anywhere', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    let fixture: Fixture | null = null;
    let context: BrowserContext | null = null;
    try {
      fixture = await provision('site');
      await seedOnboardingState(fixture, {
        colors: [],
        typography: { primary: null, secondary: null },
      });
      await seedCompletedRun(fixture);
      const opened = await openReveal(browser, fixture);
      context = opened.context;
      const { page } = opened;

      const card = page.getByTestId('reveal-typography');
      await card
        .screenshot({ path: `${SCREENSHOT_DIR}/typography.png` })
        .catch(() => undefined);

      // The name IS shown — this is not "hide the typography section".
      const primary = page.locator('[data-testid="reveal-typeface"][data-slot="Primary"]');
      await expect(primary).toHaveAttribute('data-family', READ_FAMILY);
      await expect(primary).toHaveAttribute('data-provenance', 'read');
      await expect(primary).toContainText(READ_FAMILY);
      await expect(primary.getByTestId('field-provenance')).toContainText('read · site analysis');

      // …and the browser is never asked to draw it.
      expect(await specimenViolations(page, [READ_FAMILY])).toEqual([]);
      await expect(card).toContainText('No specimen is rendered here');

      // The empty slot says it is empty, in words, and never borrows the other family.
      const secondary = page.locator('[data-testid="reveal-typeface"][data-slot="Secondary"]');
      await expect(secondary).toHaveAttribute('data-provenance', 'empty');
      await expect(secondary).toHaveAttribute('data-family', '');
      await expect(secondary).toContainText('No typeface found');
      await expect(secondary.getByTestId('field-provenance')).toHaveText('nothing found');
      expect(((await secondary.textContent()) ?? '').includes(READ_FAMILY)).toBe(false);

      // A recorded role becomes the rule, verbatim from the role the run recorded.
      const rows = page.getByTestId('reveal-colour');
      expect(await rows.count()).toBe(Object.keys(ROLED_PALETTE).length);
      await expect(
        page.locator('[data-testid="reveal-colour"][data-hex="#ffaa1c"]'),
      ).toContainText('Read from the site as the accent colour.');
      expect(
        await page.locator('[data-testid="reveal-colour"][data-recorded="false"]').count(),
      ).toBe(0);

      // A section the run never produced is marked EMPTY rather than left drafting.
      for (const field of ['brand-voice', 'strategy', 'guidelines']) {
        await expect(
          page.locator(`[data-testid="field-provenance"][data-field="${field}"]`),
        ).toHaveAttribute('data-provenance', 'empty');
      }
      expect(await page.locator('[role="status"][aria-label="Drafting"]').count()).toBe(0);

      /* NEGATIVE CONTROL — put the original bug back and prove the scanner catches it. */
      await page.evaluate((family: string) => {
        const root = document.querySelector('[data-testid="reveal-typography"]');
        const substitute = document.createElement('div');
        substitute.id = 'negative-control-specimen';
        substitute.style.fontFamily = family;
        substitute.textContent = 'Aa';
        root?.appendChild(substitute);
      }, READ_FAMILY);
      expect((await specimenViolations(page, [READ_FAMILY])).length).toBeGreaterThan(0);
      await page.evaluate(() =>
        document.getElementById('negative-control-specimen')?.remove(),
      );
      expect(await specimenViolations(page, [READ_FAMILY])).toEqual([]);
    } finally {
      await context?.close();
      await teardown(fixture);
    }
  });

  test('a bare hex carries no invented role, and a saved family draws no specimen', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    let fixture: Fixture | null = null;
    let context: BrowserContext | null = null;
    try {
      fixture = await provision('saved');
      // No preview run: everything on screen comes from the saved profile, where colours
      // arrive as a flat hex list that threw its roles away.
      await seedOnboardingState(fixture, {
        colors: BARE_HEXES,
        typography: { primary: SAVED_FAMILY, secondary: null },
      });
      const opened = await openReveal(browser, fixture);
      context = opened.context;
      const { page } = opened;

      await page
        .getByTestId('reveal-palette-section')
        .screenshot({ path: `${SCREENSHOT_DIR}/palette.png` })
        .catch(() => undefined);

      const rows = page.getByTestId('reveal-colour');
      expect(await rows.count()).toBe(BARE_HEXES.length);
      expect(
        await page.locator('[data-testid="reveal-colour"][data-recorded="true"]').count(),
      ).toBe(0);

      const rules = page.getByTestId('reveal-colour-rule');
      for (let index = 0; index < BARE_HEXES.length; index += 1) {
        const text = ((await rules.nth(index).textContent()) ?? '').trim();
        expect(text).toContain('No role recorded');
        // The invented sentence is the failure mode; it must appear nowhere.
        expect(text).not.toContain('Read from the site as');
      }
      // Recognition survives — the strip is still there, one chip per colour.
      expect(await page.getByTestId('reveal-palette-strip').locator('> div').count()).toBe(
        BARE_HEXES.length,
      );

      // The saved family gets the same treatment as the read one: name, no specimen.
      const primary = page.locator('[data-testid="reveal-typeface"][data-slot="Primary"]');
      await expect(primary).toContainText(SAVED_FAMILY);
      await expect(primary.getByTestId('field-provenance')).toContainText('read · saved profile');
      expect(await specimenViolations(page, [SAVED_FAMILY])).toEqual([]);
    } finally {
      await context?.close();
      await teardown(fixture);
    }
  });
});
