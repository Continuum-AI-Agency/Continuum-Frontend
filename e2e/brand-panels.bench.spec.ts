import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// Brand engine panels bench — do the panels show REAL values, or headings over nothing?
//
// The claim under test is that the brand settings surface reads like an instrument: a
// ratio-only layout spec, a typography inventory driven by which font FILES exist, colours
// carrying their own usage rule, an auditable list of facts with provenance, and rules
// listed by their MEASUREMENT with an honest marker for the ones nothing runs.
//
// Every assertion here is on a VALUE. A heading proves nothing — the panels would render
// their titles over five empty regions and a heading test would still be green.
//
// Real path across real boundaries: the design system is written to the real local
// Postgres, the font face is written to the real private storage bucket at the store's own
// manifest key, both are read back by the REAL Backend `/brand-knowledge/design-system`
// route, and the REAL settings page renders them. Nothing is mocked.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run brand:panels:bench
//
// The bench OWNS its Backend (support/localBackend.ts) — a hand-started `bun run dev:be`
// points at PRODUCTION Supabase, so the page would read the local fixture brand while the
// Backend read prod and every panel would come back empty.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · A real font UPLOAD. `storeBrandFont` (magic-byte sniffing, private-bucket assertion)
//     has no HTTP surface yet, so the face is seeded as the store's own manifest entry at
//     the store's own key and read back by the store's own `listBrandFonts`. The read side
//     is real end to end; the write side is the manifest, not the uploader.
//   · Rendering a specimen from stored font bytes. The panel deliberately renders none —
//     see the licensing note in BrandEnginePanels.tsx — so there is nothing to assert.
//   · The design-system INGEST. Sections are seeded directly; parsing an archive into them
//     is `ingest.ts`'s own concern.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const DESIGN_SYSTEM_ID = '00000000-0000-4000-8000-00000000d501';
const FONT_BUCKET = 'brand-docs';
const FONT_MANIFEST = `${BRAND_ID}/fonts/manifest.json`;
const SCREENSHOT_DIR =
  process.env.BRAND_PANELS_SCREENSHOT_DIR ?? 'e2e/__screenshots__/brand-panels';

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[brand:panels:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const brandProfiles = (client: SupabaseClient) => client.schema('brand_profiles');

/* -- the fixture ----------------------------------------------------------- */

const TOKENS = [
  {
    name: '--accent',
    value: '#ffaa1c',
    kind: 'color',
    resolvedValue: '#ffaa1c',
    definedIn: 'tokens.css',
    description: 'Headline, footer and section chips. The headline is ALWAYS this colour.',
  },
  {
    name: '--ink',
    value: '#101010',
    kind: 'color',
    resolvedValue: '#101010',
    definedIn: 'tokens.css',
    description: null,
  },
  // No description, no rule, and a name matching no colour role — the case whose honest
  // output is the instruction rather than a sentence somebody invented.
  {
    name: '--mist',
    value: '#e4ddce',
    kind: 'color',
    resolvedValue: '#e4ddce',
    definedIn: null,
    description: null,
  },
  {
    name: '--w-book',
    value: '400',
    kind: 'other',
    resolvedValue: '400',
    definedIn: 'tokens.css',
    description: null,
  },
  {
    name: '--w-bold',
    value: '700',
    kind: 'other',
    resolvedValue: '700',
    definedIn: 'tokens.css',
    description: null,
  },
];

const COLOUR_TOKEN_COUNT = TOKENS.filter((token) => token.kind === 'color').length;

const FONTS = [
  { family: 'Publico', tokens: ['--font-display'], source: null },
  { family: 'Founders Grotesk', tokens: ['--font-sans'], source: null },
];

const ADHERENCE = {
  // Turns the palette rule into one a checker actually runs.
  forbidRawHex: true,
  // Left off deliberately: the radii rule below is then stored-and-inert, which is the
  // distinction the panel exists to make visible.
  forbidRawPx: false,
  fontAllowlist: ['Publico', 'Founders Grotesk'],
  tokenAllowlist: [],
};

const SECTIONS = [
  {
    section: 'formats',
    title: 'Formats',
    provenance: 'declared',
    confidence: 1,
    content: {
      baseWidth: 1080,
      formats: [
        {
          id: 'postIG',
          width: 1080,
          height: 1350,
          safeZone: { x0: 0.08, y0: 0.06, x1: 0.92, y1: 0.48 },
        },
        { id: 'story', width: 1080, height: 1920, safeZone: null },
      ],
      curves: {
        photoAspect: {
          unit: 'ratio',
          points: [
            [0.8, 1.567],
            [1.778, 2.224],
          ],
        },
        headerBand: {
          unit: 'fraction',
          points: [
            [0.8, 0.18],
            [1.778, 0.245],
          ],
        },
      },
    },
    rules: [],
  },
  {
    section: 'palette',
    title: 'Palette',
    provenance: 'declared',
    confidence: 1,
    content: {},
    rules: [
      {
        statement: 'The accent is the orange, and nothing else is.',
        strength: 'hard',
        target: 'artDirection.palette.accent',
        value: '#ffaa1c',
        sourceRef: 'tokens.css section 2',
      },
    ],
  },
  {
    section: 'radii',
    title: 'Radii',
    provenance: 'inferred',
    confidence: 0.62,
    content: {},
    rules: [
      {
        statement: 'Radii are small or zero — editorial means straight.',
        strength: 'hard',
        target: 'artDirection.radii.max',
        value: '2',
        sourceRef: null,
      },
    ],
  },
  {
    section: 'voice',
    title: 'Voice',
    provenance: 'declared',
    confidence: 1,
    content: {},
    rules: [
      {
        statement: 'Never write in the first person plural.',
        strength: 'hard',
        target: null,
        value: null,
        sourceRef: null,
      },
    ],
  },
];

/** Exactly one face the engine holds — Publico 700. Every other row must badge `missing`. */
const STORED_FACE = {
  family: 'Publico',
  weight: 700,
  style: 'normal',
  format: 'woff2',
  path: `${BRAND_ID}/fonts/publico-00000000-700-normal.woff2`,
  bytes: 24_680,
  sha256: 'a'.repeat(64),
  updatedAt: new Date(0).toISOString(),
};

/* -- seeding --------------------------------------------------------------- */

let retiredSystemIds: string[] = [];

async function seedDesignSystem(supabase: SupabaseClient): Promise<void> {
  // `brand_design_systems_one_active` is a real unique index, so an incumbent has to step
  // aside before ours can be active — and be put back afterwards.
  const { data: incumbents } = await brandProfiles(supabase)
    .from('brand_design_systems')
    .select('id')
    .eq('brand_id', BRAND_ID)
    .eq('is_active', true);
  retiredSystemIds = ((incumbents ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter((id) => id !== DESIGN_SYSTEM_ID);
  if (retiredSystemIds.length > 0) {
    await brandProfiles(supabase)
      .from('brand_design_systems')
      .update({ is_active: false })
      .in('id', retiredSystemIds)
      .throwOnError();
  }

  await brandProfiles(supabase)
    .from('brand_design_systems')
    .upsert(
      {
        id: DESIGN_SYSTEM_ID,
        brand_id: BRAND_ID,
        version: 9001,
        is_active: true,
        status: 'ready',
        source_kind: 'ds_export',
        tokens: TOKENS,
        fonts: FONTS,
        adherence: ADHERENCE,
        rigor_tier: 'strict',
        rigor_tier_override: null,
        rigor_evidence: {
          tokenCount: TOKENS.length,
          imperativeRuleCount: 3,
          hasAdherenceConfig: true,
          declaredSectionCount: 3,
          exemplarCount: 0,
        },
        conflicts: [],
        progress_step: 'ready',
        progress_percent: 100,
        activated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .throwOnError();

  await brandProfiles(supabase)
    .from('brand_design_system_sections')
    .upsert(
      SECTIONS.map((section) => ({
        design_system_id: DESIGN_SYSTEM_ID,
        brand_id: BRAND_ID,
        section: section.section,
        title: section.title,
        summary: '',
        content: section.content,
        rules: section.rules,
        exemplars: [],
        provenance: section.provenance,
        confidence: section.confidence,
        enabled: true,
        edited_at: null,
      })),
      { onConflict: 'design_system_id,section' },
    )
    .throwOnError();
}

async function seedFontStore(supabase: SupabaseClient): Promise<void> {
  // The local stack is built from a schema-only prod snapshot, so bucket ROWS are absent.
  // Private, which is the one thing `fonts/store.ts` refuses to store without.
  const { error } = await supabase.storage.createBucket(FONT_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`[brand:panels:bench] Could not create ${FONT_BUCKET}: ${error.message}`);
  }
  const upload = await supabase.storage
    .from(FONT_BUCKET)
    .upload(FONT_MANIFEST, Buffer.from(JSON.stringify([STORED_FACE], null, 2), 'utf-8'), {
      contentType: 'application/json',
      upsert: true,
    });
  if (upload.error) {
    throw new Error(
      `[brand:panels:bench] Could not seed the font manifest: ${upload.error.message}`,
    );
  }
}

async function purge(supabase: SupabaseClient): Promise<void> {
  await brandProfiles(supabase)
    .from('brand_design_system_sections')
    .delete()
    .eq('design_system_id', DESIGN_SYSTEM_ID);
  await brandProfiles(supabase).from('brand_design_systems').delete().eq('id', DESIGN_SYSTEM_ID);
  if (retiredSystemIds.length > 0) {
    await brandProfiles(supabase)
      .from('brand_design_systems')
      .update({ is_active: true })
      .in('id', retiredSystemIds);
    retiredSystemIds = [];
  }
  await supabase.storage.from(FONT_BUCKET).remove([FONT_MANIFEST]);
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

/* -- the run --------------------------------------------------------------- */

let backend: LocalBackend | null = null;
let context: BrowserContext | null = null;
let page: Page;
let previousActiveBrandId: string | null = null;
// Read from the fixture row rather than hardcoded: the brand-name fact is a projection of
// `brand_profiles.brand_name`, and asserting a constant would prove the constant, not the
// projection — the local fixture has already been renamed once.
let brandName = '';

test.describe.configure({ mode: 'serial' });

test.describe('brand engine panels', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'Needs the local Supabase stack: bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    backend = await startLocalBackend({
      port: Number(process.env.BRAND_PANELS_BENCH_BACKEND_PORT ?? 4412),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3112',
      label: 'brand:panels:bench',
    });

    const supabase = admin();
    const { data: pref } = await brandProfiles(supabase)
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;
    const { data: brandRow } = await brandProfiles(supabase)
      .from('brand_profiles')
      .select('brand_name')
      .eq('id', BRAND_ID)
      .maybeSingle();
    brandName = ((brandRow as { brand_name?: string } | null)?.brand_name ?? '').trim();
    expect(brandName.length).toBeGreaterThan(0);
    await setActiveBrand(supabase, BRAND_ID);
    await seedDesignSystem(supabase);
    await seedFontStore(supabase);

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();

    await page.goto('/settings?section=brand-intelligence', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('brand-engine-panels')).toBeVisible({ timeout: 150_000 });
    // One shot per panel. The settings shell scrolls in its own container, so `fullPage`
    // captures only the viewport, and a single element shot of all five clips behind the
    // sticky header. Screenshots are for human sign-off only — every claim below is
    // asserted, never eyeballed.
    for (const panel of ['layout', 'type', 'colour', 'facts', 'rules']) {
      const target = page.getByTestId(`brand-panel-${panel}`);
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.screenshot({ path: `${SCREENSHOT_DIR}/${panel}.png` }).catch(() => undefined);
    }
  });

  // Playwright requires an object-destructuring first argument; nothing is taken from it.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    await context?.close();
    context = null;
    const supabase = admin();
    await purge(supabase);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
    await backend?.stop();
    backend = null;
  });

  test('the layout spec is ratios and fractions, never pixels', async () => {
    const values = page.getByTestId('layout-value');
    const count = await values.count();
    expect(count).toBeGreaterThanOrEqual(6);

    for (let index = 0; index < count; index += 1) {
      const text = ((await values.nth(index).textContent()) ?? '').trim();
      expect(text.length).toBeGreaterThan(0);
      // The whole point of the section: a pixel is true for exactly one canvas.
      expect(text).not.toMatch(/px/i);
      expect(text).toMatch(/^(none|measured .+|[\d.]+ : 1|x [\d.]+ % – .+)$/);
    }

    const valueFor = (label: string) =>
      page.locator(
        `[data-testid="layout-row"][data-label="${label}"] [data-testid="layout-value"]`,
      );

    await expect(valueFor('postIG')).toHaveText('0.800 : 1');
    await expect(valueFor('postIG · safe zone')).toHaveText('x 8.0 % – 92.0 % · y 6.0 % – 48.0 %');
    // `null` is a STATEMENT — this format puts no text over imagery — not a missing value.
    await expect(valueFor('story · safe zone')).toHaveText('none');
    // A measured default says it was measured.
    await expect(valueFor('Photo aspect')).toHaveText('measured 1.567 – 2.224');
    await expect(valueFor('Header band')).toHaveText('measured 18.0 % – 24.5 % of the base width');
    await expect(page.getByTestId('brand-panel-layout')).toContainText('1080 px base');
  });

  test('typography badges what the engine holds, not what the document claims', async () => {
    const row = (family: string, weight: number) =>
      page.locator(`[data-testid="type-row"][data-family="${family}"][data-weight="${weight}"]`);

    // The one face seeded into the real store.
    await expect(row('Publico', 700)).toHaveAttribute('data-present', 'true');
    await expect(row('Publico', 700)).toContainText('in the engine');
    await expect(row('Publico', 700)).toContainText('woff2 · 24.1 kB');
    await expect(row('Publico', 700)).toContainText('--font-display');

    // Same family, a weight the system declares and the store does not hold.
    await expect(row('Publico', 400)).toHaveAttribute('data-present', 'false');
    await expect(row('Publico', 400)).toContainText('missing');
    await expect(row('Publico', 400)).toContainText('no file in the store');

    // A whole family the store lacks.
    for (const weight of [400, 700]) {
      await expect(row('Founders Grotesk', weight)).toContainText('missing');
    }

    // Exactly one face is held, so exactly one row may claim it.
    expect(await page.locator('[data-testid="type-row"][data-present="true"]').count()).toBe(1);
    // And no specimen is drawn for any of them.
    await expect(page.getByTestId('brand-panel-type')).toContainText('No specimen is rendered');
  });

  test('every colour appears twice, and every row carries a usage sentence', async () => {
    const swatches = page.getByTestId('colour-swatch');
    const rows = page.getByTestId('colour-row');
    const usages = page.getByTestId('colour-usage');

    expect(await swatches.count()).toBe(COLOUR_TOKEN_COUNT);
    expect(await rows.count()).toBe(COLOUR_TOKEN_COUNT);

    for (let index = 0; index < COLOUR_TOKEN_COUNT; index += 1) {
      const sentence = ((await usages.nth(index).textContent()) ?? '').trim();
      expect(sentence.length).toBeGreaterThan(10);
    }

    await expect(page.locator('[data-testid="colour-row"][data-hex="#ffaa1c"]')).toContainText(
      'The headline is ALWAYS this colour.',
    );
    // The colour nobody wrote a rule for gets an instruction, and is marked as unrecorded
    // rather than dressed up as a rule.
    const unwritten = page.locator('[data-testid="colour-row"][data-hex="#e4ddce"]');
    await expect(unwritten).toHaveAttribute('data-recorded', 'false');
    await expect(unwritten).toContainText('No usage recorded');
  });

  test('facts carry provenance, and the gaps are shown rather than filled in', async () => {
    await expect(page.getByTestId('fact-row').first()).toContainText(
      `The brand is called ${brandName}.`,
    );

    const recorded = page.locator('[data-testid="fact-provenance"][data-provenance="recorded"]');
    const gaps = page.locator('[data-testid="fact-provenance"][data-provenance="none"]');
    expect(await recorded.count()).toBeGreaterThanOrEqual(4);
    expect(await gaps.count()).toBeGreaterThanOrEqual(1);
    await expect(gaps.first()).toHaveText('no source recorded');

    const panel = page.getByTestId('brand-panel-facts');
    await expect(panel).toContainText('--accent is #ffaa1c.');
    await expect(panel).toContainText('postIG ships at 1080 x 1350.');
    // The count of un-sourced facts is stated in the panel note, not buried.
    await expect(panel).toContainText('carry no source');
  });

  test('a stored-but-unenforced rule is visibly different from an enforced one', async () => {
    const enforced = page.locator('[data-testid="rule-row"][data-enforced="true"]');
    const inert = page.locator('[data-testid="rule-row"][data-enforced="false"]');

    expect(await enforced.count()).toBe(1);
    expect(await inert.count()).toBe(1);

    // The row leads with the MEASUREMENT, not the prohibition.
    await expect(enforced.getByTestId('rule-measurement')).toContainText(
      'artDirection.palette.accent',
    );
    await expect(enforced.getByTestId('rule-checker')).toContainText(
      'lintAgainstAdherence (raw-hex)',
    );
    await expect(enforced).toContainText('blocks');

    await expect(inert.getByTestId('rule-measurement')).toContainText('artDirection.radii.max');
    await expect(inert.getByTestId('rule-inert')).toContainText('not wired to a checker');
    // Read out of prose rather than declared — the badge says so.
    await expect(inert).toContainText('learned');

    // The complaint nothing can measure is filed with its reason, not promoted to a rule.
    const pending = page.getByTestId('pending-row');
    expect(await pending.count()).toBe(1);
    await expect(pending).toContainText('Never write in the first person plural.');
    await expect(pending.getByTestId('pending-reason')).toContainText(
      'not observable on a rendered pixel',
    );
  });
});
