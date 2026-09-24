import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleBrandMd,
  brandReportResultSchema,
  extractBrandTokens,
  type ReadinessAnalysis,
} from '@continuum/contracts';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  READINESS_LEGACY,
  READINESS_PARTIAL,
  READINESS_V2,
} from '../src/components/onboarding/v2/readiness/readiness.fixtures';
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
// The READINESS HERO rides the same path: a criteria-scored row, a partial-evidence
// row, a legacy row and a null row are seeded on the persisted snapshot, and a failed
// scoring arrives as a replayed `status: error` event on a running run through the
// real `/preview/:runId/events` SSE tail. The claim under test is that the radar leads
// the reveal and that no confident number is ever drawn for what was not measured.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · A live preview RUN. The agent workflow costs a model call per section and is not
//     deterministic; the snapshot it persists is seeded directly and read back through the
//     real Backend route, so the resume path is real end to end and the generation is not.
//   · The font STORE. Onboarding never reads it (see the comment in `dna/IdentityPanel`),
//     so there is no `in the engine` badge on this surface to assert — which is precisely
//     why NO specimen may be drawn here for ANY family.

const OWNER_PASSWORD = 'onboarding-dna-bench';
const SCREENSHOT_DIR =
  process.env.ONBOARDING_DNA_SCREENSHOT_DIR ?? 'e2e/__screenshots__/onboarding-dna';

// Outside the repo tree: concurrent Playwright runs wipe `test-results/`, and these
// are review artifacts, not goldens.
const READINESS_SHOT_DIR =
  process.env.ONBOARDING_DNA_READINESS_SHOT_DIR ??
  join(tmpdir(), 'onboarding-dna-bench', 'readiness');

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

async function seedCompletedRun(
  fixture: Fixture,
  readiness: ReadinessAnalysis | null = null,
): Promise<void> {
  await brandProfiles(admin())
    .from('preview_runs')
    .insert({
      brand_id: fixture.brandId,
      status: 'completed',
      prompt_version: 1,
      input_hash: `dna-bench-${fixture.brandId}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      result: { ...COMPLETED_RESULT, readiness },
    })
    .throwOnError();
}

/**
 * A run still `running` whose persisted events say readiness scoring FAILED. The page
 * resumes it through the real SSE tail, which replays these rows in order.
 */
async function seedRunWithFailedReadiness(fixture: Fixture): Promise<void> {
  const now = new Date().toISOString();
  const { data: run } = await brandProfiles(admin())
    .from('preview_runs')
    .insert({
      brand_id: fixture.brandId,
      status: 'running',
      prompt_version: 1,
      input_hash: `dna-bench-${fixture.brandId}`,
      started_at: now,
      last_heartbeat_at: now,
    })
    .select('id')
    .single()
    .throwOnError();
  const events = [
    { kind: 'status', section: 'readiness', status: 'error', error: 'readiness scorer timed out' },
    { kind: 'complete', phase: 'preview', status: 'partial', result: COMPLETED_RESULT },
  ];
  await brandProfiles(admin())
    .from('preview_run_events')
    .insert(
      events.map((event, index) => ({
        run_id: run.id,
        sequence: index + 1,
        kind: event.kind,
        payload: event,
      })),
    )
    .throwOnError();
}

async function teardown(fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  const supabase = admin();
  // Best-effort: an orphaned ephemeral row is low-harm, and a throw here would mask the
  // real result of the run.
  const { data: runs } = await brandProfiles(supabase)
    .from('preview_runs')
    .select('id')
    .eq('brand_id', fixture.brandId);
  const runIds = (runs ?? []).map((run: { id: string }) => run.id);
  const attempts: Array<Promise<unknown>> = [
    brandProfiles(supabase).from('preview_run_events').delete().in('run_id', runIds),
    brandProfiles(supabase)
      .from('brand_report_composites')
      .delete()
      .eq('brand_profile_id', fixture.brandId),
    brandProfiles(supabase).from('brand_book_jobs').delete().eq('brand_id', fixture.brandId),
    brandProfiles(supabase).from('brand_book').delete().eq('brand_id', fixture.brandId),
    brandProfiles(supabase)
      .from('brand_report_readiness')
      .delete()
      .eq('brand_profile_id', fixture.brandId),
    brandProfiles(supabase).from('user_brand_preferences').delete().eq('user_id', fixture.userId),
    brandProfiles(supabase).from('preview_runs').delete().eq('brand_id', fixture.brandId),
    brandProfiles(supabase).from('user_onboarding_states').delete().eq('user_id', fixture.userId),
    brandProfiles(supabase).from('permissions').delete().eq('brand_profile_id', fixture.brandId),
    brandProfiles(supabase).from('brand_profiles').delete().eq('id', fixture.brandId),
  ];
  for (const attempt of attempts) {
    await Promise.resolve(attempt).catch(() => undefined);
  }
  await supabase.auth.admin.deleteUser(fixture.userId).catch(() => undefined);
}

/**
 * A ready Brand Book whose composite carries `readiness`, made the active brand, so
 * Settings → Brand Kit intelligence → Readiness renders it through the real Backend.
 */
async function seedBrandBook(fixture: Fixture, readiness: ReadinessAnalysis): Promise<void> {
  const composite = brandReportResultSchema.parse({
    brand_profile: { id: fixture.brandId, brand_name: 'DNA Bench Brand', website_url: SITE_URL },
    structured: {
      connected_accounts: [],
      website: { website_url: SITE_URL, palette: null, typography: null },
      documents: {},
      target_audience: { summary: 'Practice managers at physiotherapy clinics.' },
      business: null,
      strategy: null,
      guidelines: null,
    },
    understanding: {
      positioning_thesis: 'Scheduling built for physiotherapy clinics.',
      hypothesis_icp: 'Practice managers',
      brand_pillars: ['fewer no-shows'],
      tonal_signal: 'plain and practical',
      notable_evidence: [],
    },
    audits: {},
    readiness,
  });
  const db = brandProfiles(admin());
  // One composite per brand here: replace it, so a re-seed is what the book serves.
  await db
    .from('brand_report_composites')
    .delete()
    .eq('brand_profile_id', fixture.brandId)
    .throwOnError();
  await db
    .from('brand_report_composites')
    .insert({
      brand_profile_id: fixture.brandId,
      composite,
      brand_md: assembleBrandMd({ tokens: extractBrandTokens(composite), result: composite }),
      brand_tokens: extractBrandTokens(composite),
      updated_at: new Date().toISOString(),
    })
    .throwOnError();
  await db
    .from('user_brand_preferences')
    .upsert(
      { user_id: fixture.userId, active_brand_id: fixture.brandId },
      { onConflict: 'user_id' },
    )
    .throwOnError();
  // The composite write enqueues a brand-book rebuild that the Backend worker runs
  // asynchronously; Settings serves that book, so wait until it carries this score.
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from('brand_book')
          .select('status, assembled')
          .eq('brand_id', fixture.brandId)
          .maybeSingle();
        type Scored = { overall_score?: number } | null;
        const row = data as {
          status?: string;
          assembled?: {
            report?: { composite?: { readiness?: Scored } | null; readiness?: Scored };
          };
        } | null;
        // The same precedence BrandBookView reads: the composite's score, then the report's.
        const report = row?.status === 'ready' ? row.assembled?.report : undefined;
        return (report?.composite?.readiness ?? report?.readiness)?.overall_score ?? null;
      },
      { timeout: 90_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(readiness.overall_score);
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

/* -- the layout scanner ---------------------------------------------------- */

const MIN_COLUMN_PX = 160;
const LAYOUT_WIDTHS = [1024, 1500, 1920];

/**
 * Every way the identity row's columns fail to sit side by side, at each desktop width.
 *
 * The bug this keeps dead: Palette and Typography were `auto` tracks, and once they carried
 * sentences their max-content outgrew the row — the `fr` tracks collapsed to zero and the
 * brand name, the first impression and the palette were drawn on top of one another.
 * Every text assertion above still passed, because overlapping text is still in the DOM.
 */
async function identityLayoutDefects(page: Page): Promise<string[]> {
  const defects: string[] = [];
  for (const width of LAYOUT_WIDTHS) {
    await page.setViewportSize({ width, height: 1100 });
    const boxes = await page.evaluate(() =>
      Array.from(
        document.querySelector('[data-testid="identity-columns"]')?.children ?? [],
        (column) => {
          const rect = column.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        },
      ),
    );
    if (boxes.length < 3) defects.push(`${width}px: ${boxes.length} columns rendered`);
    boxes.forEach((box, index) => {
      if (box.width < MIN_COLUMN_PX) {
        defects.push(`${width}px: column ${index} is ${Math.round(box.width)}px wide`);
      }
      const next = boxes[index + 1];
      if (next && box.right > next.left + 1) {
        defects.push(`${width}px: column ${index} overlaps column ${index + 1}`);
      }
    });
  }
  await page.setViewportSize({ width: 1500, height: 1100 });
  return defects;
}

/* -- the readiness scanners ----------------------------------------------- */

/**
 * Nothing on the page states a readiness number: no overall, no dot on any axis, no
 * digit anywhere in the hero, and no `· N` score chip left on the cards below it.
 */
async function expectNoReadinessNumber(page: Page): Promise<void> {
  const hero = page.getByTestId('readiness-hero');
  await expect(hero.getByTestId('readiness-overall')).toHaveCount(0);
  await expect(page.locator('[data-radar-point]')).toHaveCount(0);
  expect(((await hero.textContent()) ?? '').match(/\d+/g) ?? []).toEqual([]);
  await expect(page.getByText(/^·\s*\d+$/)).toHaveCount(0);
}

/** `a` is laid out before `b` in document order. */
async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const handle = await b.elementHandle();
  return a.evaluate(
    (first, second) =>
      Boolean(second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING),
    handle,
  );
}

/** Every hero part that spills past the viewport's horizontal edges. */
async function heroOverflow(page: Page, viewportWidth: number): Promise<string[]> {
  return page.evaluate((width: number) => {
    const hero = document.querySelector('[data-testid="readiness-hero"]');
    if (!hero) return ['NO_HERO'];
    // The onboarding step list is wider than a 390px screen (a separate, known
    // overflow), so scrolling the hero into view can pan the page sideways. Measure
    // from the page's own left edge so this gate grades the hero alone.
    window.scrollTo(0, window.scrollY);
    const parts = [
      hero,
      ...Array.from(
        hero.querySelectorAll(
          '[data-testid="radar-axis"], [data-testid="readiness-move"], [data-testid="criteria-ledger"]',
        ),
      ),
    ];
    return parts.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.left >= -0.5 && rect.right <= width + 0.5) return [];
      const name = `${node.getAttribute('data-testid')}${node.getAttribute('data-dimension') ? `:${node.getAttribute('data-dimension')}` : ''}`;
      return [`${name} spans ${Math.round(rect.left)}..${Math.round(rect.right)}px`];
    });
  }, viewportWidth);
}

/**
 * The radar's enter animation has landed: every point sits still and off the hub.
 * A shot taken earlier shows the data mid-flight (all dots still on the centre).
 */
async function radarSettled(page: Page): Promise<void> {
  const read = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-radar-point]'),
        (point) => `${point.getAttribute('cx')},${point.getAttribute('cy')}`,
      ),
    );
  await expect
    .poll(
      async () => {
        const before = await read();
        await page.waitForTimeout(250);
        const after = await read();
        return (
          before.join('|') === after.join('|') &&
          !after.some((xy) => /^-?0(\.0+)?,-?0(\.0+)?$/.test(xy))
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  // Park the pointer so no axis is mid-preview in the shot.
  await page.mouse.move(0, 0);
}

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((next) => window.localStorage.setItem('theme', JSON.stringify(next)), theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`), {
    timeout: 60_000,
  });
  await expect(page.getByTestId('readiness-hero')).toBeVisible({ timeout: 120_000 });
}

const SHOT_VIEWPORTS = [
  { label: 'desktop', width: 1500, height: 1100 },
  { label: '390', width: 390, height: 844 },
] as const;

/**
 * Light and dark at desktop and 390px, each gated on the hero fitting the screen.
 * Reduced motion makes the radar land on its final geometry at once, so the shot is
 * the data, not a frame of the enter animation.
 */
async function shootHero(page: Page, name: string): Promise<string[]> {
  mkdirSync(READINESS_SHOT_DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shots: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme);
    for (const viewport of SHOT_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const hero = page.getByTestId('readiness-hero');
      await hero.scrollIntoViewIfNeeded();
      await radarSettled(page);
      expect(await heroOverflow(page, viewport.width)).toEqual([]);
      const path = join(READINESS_SHOT_DIR, `${name}-${theme}-${viewport.label}.png`);
      await hero.screenshot({ path, animations: 'disabled' });
      shots.push(path);
    }
  }
  await page.setViewportSize({ width: 1500, height: 1100 });
  console.log(`[onboarding:dna:bench] ${name} screenshots:\n  ${shots.join('\n  ')}`);
  return shots;
}

async function shootHeroOnce(page: Page, name: string): Promise<void> {
  mkdirSync(READINESS_SHOT_DIR, { recursive: true });
  // Tall enough that no inner scroll pane (Settings has one) clips the element shot.
  await page.setViewportSize({ width: 1500, height: 1800 });
  await radarSettled(page);
  const path = join(READINESS_SHOT_DIR, `${name}-light-desktop.png`);
  await page.getByTestId('readiness-hero').screenshot({ path, animations: 'disabled' });
  await page.setViewportSize({ width: 1500, height: 1100 });
  console.log(`[onboarding:dna:bench] ${name} screenshot: ${path}`);
}

async function openSeededReveal(
  browser: import('@playwright/test').Browser,
  label: string,
  seed: (fixture: Fixture) => Promise<void>,
): Promise<{ fixture: Fixture; context: BrowserContext; page: Page }> {
  const fixture = await provision(label);
  try {
    await seedOnboardingState(fixture, {
      colors: [],
      typography: { primary: null, secondary: null },
    });
    await seed(fixture);
    const { context, page } = await openReveal(browser, fixture);
    return { fixture, context, page };
  } catch (error) {
    await teardown(fixture);
    throw error;
  }
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
      await card.screenshot({ path: `${SCREENSHOT_DIR}/typography.png` }).catch(() => undefined);

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
      await expect(page.locator('[data-testid="reveal-colour"][data-hex="#ffaa1c"]')).toContainText(
        'Read from the site as the accent colour.',
      );
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

      // Readiness came back null: the hero still leads, and states no number at all.
      await expect(page.getByTestId('readiness-hero')).toHaveAttribute('data-state', 'empty');
      await expectNoReadinessNumber(page);
      await shootHeroOnce(page, 'null');

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
      await page.evaluate(() => document.getElementById('negative-control-specimen')?.remove());
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

      // Three bare-hex sentences plus the specimen note is the heaviest the row gets.
      expect(await identityLayoutDefects(page)).toEqual([]);
    } finally {
      await context?.close();
      await teardown(fixture);
    }
  });

  test('readiness leads the reveal: radar, reachable ghost, ranked moves, linked ledger', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    let opened: Awaited<ReturnType<typeof openSeededReveal>> | null = null;
    try {
      opened = await openSeededReveal(browser, 'ready', (f) => seedCompletedRun(f, READINESS_V2));
      const { page } = opened;
      const hero = page.getByTestId('readiness-hero');
      await expect(hero).toHaveAttribute('data-state', 'scored', { timeout: 60_000 });

      // First block of the reveal, and inside it the radar comes before the moves.
      expect(await precedes(hero, page.getByTestId('brand-dna-identity'))).toBe(true);
      expect(
        await precedes(hero.getByTestId('readiness-radar'), hero.getByTestId('readiness-moves')),
      ).toBe(true);

      await expect(hero.getByTestId('readiness-overall')).toHaveText(
        String(READINESS_V2.overall_score),
      );
      await expect(page.locator('[data-radar-point]')).toHaveCount(7);
      await expect(hero.locator('path[stroke-dasharray="5 4"]')).toHaveCount(1);
      await expect(hero.getByTestId('legend-reachable')).toContainText(
        String(READINESS_V2.reachable_score),
      );
      await expect(hero.getByTestId('move-points')).toHaveText(['+6 pts', '+5 pts', '+4 pts']);

      // Axis ↔ move ↔ ledger: the top move is open, hover previews, keyboard pins.
      const ledger = hero.getByTestId('criteria-ledger');
      await expect(ledger).toHaveAttribute('data-dimension', 'success_metrics');
      await hero.locator('[data-testid="radar-axis"][data-dimension="customer_pains"]').hover();
      await expect(ledger).toHaveAttribute('data-dimension', 'customer_pains');
      const review = ledger.getByTestId('criterion-source').filter({ hasText: 'web: g2.com' });
      await expect(review).toHaveAttribute('href', /g2\.com/);
      await expect(ledger).toContainText('Our front desk used to spend mornings');

      const positioningAxis = hero.locator(
        '[data-testid="radar-axis"][data-dimension="positioning"]',
      );
      await positioningAxis.focus();
      await page.keyboard.press('Enter');
      await expect(positioningAxis).toHaveAttribute('aria-pressed', 'true');
      await expect(
        hero.locator('[data-testid="readiness-move"][data-dimension="positioning"]'),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(ledger).toHaveAttribute('data-dimension', 'positioning');

      await shootHero(page, 'scored');
    } finally {
      await opened?.context.close();
      await teardown(opened?.fixture ?? null);
    }
  });

  test('partial evidence: a banner names what failed, and an unmeasured axis draws no number', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    let opened: Awaited<ReturnType<typeof openSeededReveal>> | null = null;
    try {
      opened = await openSeededReveal(browser, 'partial', (f) =>
        seedCompletedRun(f, READINESS_PARTIAL),
      );
      const { page } = opened;
      const hero = page.getByTestId('readiness-hero');
      await expect(hero).toHaveAttribute('data-state', 'scored', { timeout: 60_000 });

      const banner = hero.getByTestId('readiness-partial');
      await expect(banner).toContainText('Scored on partial evidence');
      await expect(banner).toContainText('Instagram');
      await expect(banner).toContainText('web search');

      // Five measured axes carry a dot; the thin and the unknown one carry none.
      await expect(page.locator('[data-radar-point]')).toHaveCount(5);
      for (const dimension of ['success_metrics', 'customer_pains']) {
        await expect(page.locator(`[data-radar-point="${dimension}"]`)).toHaveCount(0);
        await expect(page.locator(`[data-spoke="${dimension}"]`)).toHaveAttribute(
          'data-hatched',
          'true',
        );
      }
      const unknown = hero.locator('[data-testid="radar-axis"][data-dimension="success_metrics"]');
      await expect(unknown).toHaveAttribute('data-confidence', 'unknown');
      await expect(unknown).toContainText('No evidence');
      expect(((await unknown.textContent()) ?? '').match(/\d/g) ?? []).toEqual([]);
      await expect(
        hero.locator('[data-testid="radar-axis"][data-dimension="customer_pains"]'),
      ).toHaveAttribute('data-confidence', 'thin');

      await shootHero(page, 'partial');
    } finally {
      await opened?.context.close();
      await teardown(opened?.fixture ?? null);
    }
  });

  test('a legacy row with no criteria still renders the radar and its dimension scores', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    let opened: Awaited<ReturnType<typeof openSeededReveal>> | null = null;
    try {
      opened = await openSeededReveal(browser, 'legacy', (f) =>
        seedCompletedRun(f, READINESS_LEGACY),
      );
      const { page } = opened;
      const hero = page.getByTestId('readiness-hero');
      await expect(hero).toHaveAttribute('data-state', 'legacy', { timeout: 60_000 });
      await expect(hero.getByTestId('readiness-overall')).toHaveText('72');
      await expect(page.locator('[data-radar-point]')).toHaveCount(7);
      await expect(hero.locator('[data-testid="readiness-legacy"] li')).toHaveCount(7);
      await expect(hero.getByTestId('readiness-moves')).toHaveCount(0);
      await shootHeroOnce(page, 'legacy');
    } finally {
      await opened?.context.close();
      await teardown(opened?.fixture ?? null);
    }
  });

  test('a failed scoring, replayed over the real SSE tail, renders no number', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    let opened: Awaited<ReturnType<typeof openSeededReveal>> | null = null;
    try {
      opened = await openSeededReveal(browser, 'error', seedRunWithFailedReadiness);
      const { page } = opened;
      const hero = page.getByTestId('readiness-hero');
      await expect(hero).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
      await expect(hero).toContainText("Readiness couldn't be scored this time");
      await expectNoReadinessNumber(page);
      await shootHeroOnce(page, 'error');
    } finally {
      await opened?.context.close();
      await teardown(opened?.fixture ?? null);
    }
  });

  test('Settings → Readiness is the same hero: Recalculate kept, legacy rows prompted', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    let fixture: Fixture | null = null;
    let context: BrowserContext | null = null;
    try {
      fixture = await provision('settings');
      await seedBrandBook(fixture, READINESS_LEGACY);
      const storageState = await mintSessionForEmail(fixture.email);
      context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
      await context.addCookies(storageState.cookies);
      const page = await context.newPage();
      const openReadinessTab = async () => {
        await page.goto('/settings?section=brand-intelligence', { waitUntil: 'domcontentloaded' });
        // A click on the server-rendered tab before hydration is silently dropped.
        const tab = page.getByRole('tab', { name: 'Readiness' });
        await expect(async () => {
          await tab.click({ timeout: 5_000 });
          await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
        }).toPass({ timeout: 150_000 });
      };

      await openReadinessTab();
      const hero = page.getByTestId('readiness-hero');
      await expect(hero).toHaveAttribute('data-state', 'legacy', { timeout: 60_000 });
      await expect(hero.getByRole('button', { name: 'Recalculate' })).toBeVisible();
      await expect(hero.getByTestId('readiness-legacy')).toContainText(
        'Recalculate to see what earned each score.',
      );
      await expect(page.locator('[data-radar-point]')).toHaveCount(7);
      await shootHeroOnce(page, 'settings-legacy');

      // Recalculated under the criteria scorer: same surface, now with moves and ledger.
      await seedBrandBook(fixture, READINESS_V2);
      await openReadinessTab();
      await expect(hero).toHaveAttribute('data-state', 'scored', { timeout: 60_000 });
      await expect(hero.getByRole('button', { name: 'Recalculate' })).toBeVisible();
      await expect(hero.getByTestId('readiness-overall')).toHaveText(
        String(READINESS_V2.overall_score),
      );
      await expect(hero.getByTestId('readiness-moves')).toBeVisible();
      await expect(hero.getByTestId('criteria-ledger')).toHaveAttribute(
        'data-dimension',
        'success_metrics',
      );
      await expect(hero.getByTestId('readiness-legacy')).toHaveCount(0);
      await shootHeroOnce(page, 'settings-scored');
    } finally {
      await context?.close();
      await teardown(fixture);
    }
  });
});
