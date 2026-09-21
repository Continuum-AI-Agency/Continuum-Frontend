import { type ChildProcess, execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  assembleBrandMd,
  brandReportResultSchema,
  extractBrandTokens,
  parseBrandMd,
} from '@continuum/contracts';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// brand:brain:fe:e2e:bench — editing "Never say" in Settings changes the next caption prompt.
//
// The claim under test: a user adds a word to the Brand Brain's "Never say" section, presses
// Save, and the brand block the NEXT organic caption is written under forbids that word —
// within 60s. Graded on the prompt block itself, never on the editor's own state.
//
// Real path across real boundaries: real Chrome drives the real settings page
// (/settings?section=brand-intelligence → Brand DNA), which reads the book through the real
// `get-brand-book` edge function; Save goes through the real Backend
// `POST /onboarding/brand-profiles/:id/brand-md` into the real local Postgres; the real
// brand-book compose worker (inside the bench-owned Backend) rebuilds the book; and the
// caption block is composed by the Backend's own `buildCopyVoiceGrounding` — the function a
// caption run calls — in a fresh process (`Continuum-Backend/scripts/brand-caption-prompt.ts`).
// A Frontend file may not import Backend source, so the process boundary is the seam.
//
// Prerequisites: the local stack (`bun run supabase:start && bun run supabase:hydrate &&
// bun run supabase:env:local`). The registered script sources `.env.local`, so this runs on
// the LOCAL stack; the bench serves the edge functions itself when nothing else is.
//   Run with: bun run brand:brain:fe:e2e:bench
//
// UN-EXERCISED, STATED EXPLICITLY:
//   · Hosted Supabase. The fixture brand is seeded into the local stack; the prod data hop
//     (a real client brand's composite) is not exercised here — brand:single-source:e2e:bench
//     covers the same save → getBrandDna → prompt chain against the hosted bench brand.
//   · A real model writing a caption. The prompt block is composed exactly as a run composes
//     it; no caption is generated.
//   · "Themes to avoid" reaching the caption block. It is saved into brand.md (asserted),
//     but getBrandDna only overlays front-matter tokens, so the caption block does not carry
//     avoid themes from an edit. Named here so a green run is not read as covering it.

const BENCH = 'brand:brain:fe:e2e:bench';
const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-00000000bb01';
const BRAND_NAME = 'Brand Brain Bench';
const REPO_ROOT = path.resolve(process.cwd(), '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'Continuum-Backend');
const PROMPT_DEADLINE_MS = 60_000;
const SCREENSHOT_DIR = process.env.BRAND_BRAIN_SCREENSHOT_DIR ?? 'test-results/brand-brain';

const runTag = Date.now().toString(36);
const NEW_WORD = `brainbench-${runTag}`;
const NEW_THEME = `bench theme ${runTag}`;
const GENERATED_WORD = 'leverage';

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(`[${BENCH}] Missing NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY.`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const brandProfiles = (client: SupabaseClient) => client.schema('brand_profiles');

// The bench owner, signed in through GoTrue — the identity the page's own calls carry.
async function ownerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
    '';
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: LOCAL_OWNER_EMAIL,
    password: LOCAL_OWNER_PASSWORD,
  });
  if (error) throw new Error(`[${BENCH}] owner sign-in failed: ${error.message}`);
  return client;
}

/* -- the fixture: a generated brand.md, assembled the way onboarding assembles one ------ */

const report = brandReportResultSchema.parse({
  brand_profile: {
    id: BRAND_ID,
    brand_name: BRAND_NAME,
    website_url: 'https://brain-bench.example',
    brand_voice: { tone: 'plainspoken and exact', banned_words: [GENERATED_WORD] },
    target_audience: null,
  },
  structured: {
    connected_accounts: [],
    website: {
      website_url: 'https://brain-bench.example',
      palette: { primary: '#1f3a5f', secondary: '#f2f4f8', accent: '#0daea2' },
      typography: { primary: 'Inter', secondary: 'Georgia' },
    },
    documents: {},
    target_audience: { summary: 'Ops leaders who own the weekly report.', segments: [] },
    business: null,
    strategy: {
      positioning: {
        target_customer: 'RevOps leads',
        market_category: 'reporting software',
        key_differentiator: 'a board brief in ten minutes',
        reason_to_believe: 'deterministic pipeline math',
      },
      personality: { traits: ['plainspoken', 'exact', 'calm'], descriptors: [] },
      promise: { headline: 'Ship the report, not the meeting.' },
      message_pillars: [
        { pillar: 'forecast accuracy', description: 'CRM truth, board story.', proof_points: [] },
        { pillar: 'operator trust', description: 'Built by ops people.', proof_points: [] },
      ],
      taglines: { primary: 'Monday, handled.', alternates: [] },
    },
    guidelines: {
      voice_rules: { dos: ['Name the segment'], donts: ['Promise magic'] },
      tonal_rules: [],
      messaging_guardrails: {
        required_themes: [],
        avoid_themes: ['AI hype'],
        banned_words: [GENERATED_WORD],
        preferred_terms: [],
      },
      content_pillars: [],
    },
  },
  understanding: {
    positioning_thesis: `For ops leaders, ${BRAND_NAME} drafts the board brief in ten minutes.`,
    hypothesis_icp: 'Head of RevOps',
    brand_pillars: ['forecast accuracy'],
    tonal_signal: 'crisp operator confidence',
    notable_evidence: [],
  },
  audits: {},
  readiness: null,
  first_impression: null,
  prompt_version: 1,
  citations: {},
});
const generatedTokens = extractBrandTokens(report);
const generatedBrandMd = assembleBrandMd({ tokens: generatedTokens, result: report });

/* -- the Recorder envelope ------------------------------------------------------------
 * `scripts/factory/bench.mjs` reads the LAST stdout JSON line carrying `counts`; the shape
 * mirrors the Backend `_bench` Recorder (a Frontend file may not import it). */

const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const notes: string[] = [
  'Local stack: the fixture brand lives in local Postgres; the hosted hop is covered by brand:single-source:e2e:bench, not here.',
  'No caption is generated: the graded artifact is the brand block buildCopyVoiceGrounding composes for the next caption run.',
  '"Themes to avoid" is saved into brand.md but does not reach the caption block — getBrandDna overlays front-matter tokens only.',
];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

// Grade a Playwright assertion: the step passes only if the assertion does, and a failed
// one is recorded before it fails the test.
async function step(name: string, run: () => Promise<string | undefined>): Promise<void> {
  try {
    grade(name, true, await run());
  } catch (error) {
    grade(name, false, error instanceof Error ? error.message.split('\n')[0] : String(error));
    throw error;
  }
}

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 || counts.pass === 0 ? 1 : 0,
    }),
  );
}

/* -- the caption prompt, composed by the Backend ------------------------------------- */

const execFileAsync = promisify(execFile);

async function captureOnce(): Promise<string> {
  // A bare environment: the capture resolves the LOCAL Supabase target itself, and nothing
  // from this runner (NEXT_PUBLIC_*, a stray SUPABASE_*) may leak into it.
  const { stdout } = await execFileAsync(
    'bun',
    ['--no-env-file', 'scripts/brand-caption-prompt.ts', `--brand=${BRAND_ID}`, '--supabase=local'],
    {
      cwd: BACKEND_DIR,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const line = stdout.trim().split('\n').at(-1) ?? '';
  const parsed = JSON.parse(line) as { source: string; block: string | null };
  if (parsed.source !== 'local') throw new Error(`capture resolved ${parsed.source}, not local`);
  return parsed.block ?? '';
}

// run-backend's local-stack probe gives up after 750ms, and a busy local stack (a page
// compile, the compose worker) misses it now and then. A missed probe is not an answer
// about the prompt, so it is retried; three misses in a row are.
async function captionBlock(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await captureOnce();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

// The banned-word list on the block's `Never use:` clause — the last clause of the voice line.
function neverUse(block: string): string[] {
  const line = block.split('\n').find((candidate) => candidate.includes('Never use: '));
  if (!line) return [];
  return line
    .slice(line.indexOf('Never use: ') + 'Never use: '.length)
    .replace(/\.\s*$/, '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

/* -- the edge functions: served for the run unless something already serves them ------ */

let functionsServer: ChildProcess | null = null;
// The runtime container has ONE name per project, so another session serving functions uses the
// same container. Only the container this bench brought up is ever stopped.
let ownedRuntimeId: string | null = null;
const RUNTIME_CONTAINER = 'supabase_edge_runtime_continuum';

async function runtimeContainerId(): Promise<string | null> {
  const { stdout } = await execFileAsync('docker', [
    'ps',
    '-q',
    '--filter',
    `name=^${RUNTIME_CONTAINER}$`,
  ]).catch(() => ({ stdout: '' }));
  return stdout.trim() || null;
}

async function edgeRuntimeUp(): Promise<boolean> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-brand-book`,
      { method: 'POST', body: '{}', signal: AbortSignal.timeout(5_000) },
    );
    const body = await response.text();
    return !/name resolution failed/i.test(body) && response.status < 500;
  } catch {
    return false;
  }
}

async function ensureEdgeFunctions(): Promise<void> {
  if (await edgeRuntimeUp()) return;
  functionsServer = spawn('supabase', ['functions', 'serve'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await edgeRuntimeUp()) {
      ownedRuntimeId = await runtimeContainerId();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`[${BENCH}] \`supabase functions serve\` never answered get-brand-book.`);
}

async function stopEdgeFunctions(): Promise<void> {
  if (!functionsServer?.pid) return;
  try {
    process.kill(-functionsServer.pid, 'SIGINT');
  } catch {
    // already gone
  }
  // Killing the CLI leaves the runtime container up; only stopping it tears the runtime down —
  // and only if it is still the one this bench started, not a later session's.
  if (ownedRuntimeId && (await runtimeContainerId()) === ownedRuntimeId) {
    await execFileAsync('docker', ['stop', ownedRuntimeId]).catch(() => null);
  }
}

/* -- seeding and cleanup, by this brand's id only ------------------------------------ */

async function seedBrand(supabase: SupabaseClient): Promise<void> {
  const db = brandProfiles(supabase);
  await db
    .from('brand_profiles')
    .upsert({ id: BRAND_ID, brand_name: BRAND_NAME, created_by: OWNER_ID }, { onConflict: 'id' })
    .throwOnError();
  // A trigger grants the creator an owner row; upsert so a re-run does not collide.
  await db
    .from('permissions')
    .upsert(
      { brand_profile_id: BRAND_ID, user_id: OWNER_ID, role: 'owner' },
      { onConflict: 'brand_profile_id,user_id' },
    )
    .throwOnError();
  await db
    .from('brand_report_composites')
    .insert({
      brand_profile_id: BRAND_ID,
      composite: report,
      brand_md: generatedBrandMd,
      brand_tokens: generatedTokens,
      updated_at: new Date().toISOString(),
    })
    .throwOnError();
}

async function cleanupBrand(supabase: SupabaseClient): Promise<void> {
  const db = brandProfiles(supabase);
  for (const [table, column] of [
    ['brand_book_jobs', 'brand_id'],
    ['brand_book', 'brand_id'],
    ['brand_report_readiness', 'brand_profile_id'],
    ['brand_report_composites', 'brand_profile_id'],
    // Permissions before the brand: the cascade's trigger cannot find a brand being deleted.
    ['permissions', 'brand_profile_id'],
  ] as const) {
    await db.from(table).delete().eq(column, BRAND_ID);
  }
  await db.from('brand_profiles').delete().eq('id', BRAND_ID).throwOnError();
}

async function setActiveBrand(supabase: SupabaseClient, brandId: string | null): Promise<void> {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: brandId }, { onConflict: 'user_id' })
    .throwOnError();
}

type CompositeRow = { brand_md_edited: string | null; updated_at: string };

async function composite(supabase: SupabaseClient): Promise<CompositeRow> {
  const { data } = await brandProfiles(supabase)
    .from('brand_report_composites')
    .select('brand_md_edited, updated_at')
    .eq('brand_profile_id', BRAND_ID)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();
  return data as CompositeRow;
}

async function bookBrandMd(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await brandProfiles(supabase)
    .from('brand_book')
    .select('status, assembled')
    .eq('brand_id', BRAND_ID)
    .maybeSingle();
  const row = data as { status?: string; assembled?: { report?: { brand_md?: string } } } | null;
  return row?.status === 'ready' ? (row.assembled?.report?.brand_md ?? null) : null;
}

/* -- the run -------------------------------------------------------------------------- */

let backend: LocalBackend | null = null;
let context: BrowserContext | null = null;
let page: Page;
let previousActiveBrandId: string | null = null;

async function openBrandBrain(): Promise<void> {
  await page.goto('/settings?section=brand-intelligence', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Brand DNA' }).click({ timeout: 150_000 });
  await expect(page.getByTestId('brand-brain')).toBeVisible({ timeout: 60_000 });
}

const neverSay = () => page.getByRole('region', { name: 'Never say' });

test.describe.configure({ mode: 'serial' });

test.describe('Brand Brain', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'Needs the local Supabase stack: bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(420_000);
    const supabase = admin();
    await ensureEdgeFunctions();
    // No queue workers in a bench-owned Backend. The brand-book composer this bench relies
    // on is mounted unconditionally, so it still runs.
    for (const flag of [
      'MCP_JOB_WORKER_ENABLED',
      'BRAND_REPORT_JOB_WORKER_ENABLED',
      'ORGANIC_JOB_WORKER_ENABLED',
    ]) {
      process.env[flag] = 'false';
    }
    backend = await startLocalBackend({
      port: Number(process.env.BENCH_BACKEND_PORT ?? 4422),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3122',
      label: BENCH,
    });

    const { data: pref } = await brandProfiles(supabase)
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;

    await cleanupBrand(supabase); // a crashed earlier run's residue, by this id only
    await seedBrand(supabase);
    await setActiveBrand(supabase, BRAND_ID);

    // The composite insert enqueued a compose job; the Backend's real worker builds the book,
    // and the page reads it through get-brand-book exactly once per render. A freshly served
    // edge runtime flaps (502, then 401) while it boots, so gate on the call the page makes.
    const owner = await ownerClient();
    await expect
      .poll(
        async () => {
          const { data } = await owner.functions.invoke('get-brand-book', {
            body: { brandId: BRAND_ID },
          });
          const book = data as { present?: boolean; brand_md?: string | null } | null;
          return book?.present ? (book.brand_md ?? null) : null;
        },
        { timeout: 120_000, intervals: [1_000] },
      )
      .toBe(generatedBrandMd);

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Backend first: a save schedules a readiness recompute 10s later, and it must not fire
    // against a brand that is being deleted.
    await backend?.stop();
    await context?.close();
    const supabase = admin();
    await cleanupBrand(supabase).catch((error) => notes.push(`cleanup failed: ${String(error)}`));
    await setActiveBrand(supabase, previousActiveBrandId).catch(() => null);
    await stopEdgeFunctions();
    printBenchEnvelope();
  });

  test('the caption block starts on the generated list', async () => {
    await step('baseline: caption block forbids the generated word, not the new one', async () => {
      const words = neverUse(await captionBlock());
      expect(words).toContain(GENERATED_WORD);
      expect(words).not.toContain(NEW_WORD);
      return `Never use: ${words.join(', ')}`;
    });
  });

  test('Settings renders the Brand Brain sections from the generated brand.md', async () => {
    await step('Brand DNA tab renders the seven sections', async () => {
      await openBrandBrain();
      for (const title of [
        'Positioning',
        'Pillars',
        'Voice',
        'Audience',
        'Promise',
        'Visual identity',
        'Never say',
      ]) {
        await expect(page.getByRole('region', { name: title })).toBeVisible();
      }
      await page
        .getByRole('region', { name: 'Voice' })
        .screenshot({ path: path.join(SCREENSHOT_DIR, 'voice.png') });
      return 'Positioning … Never say';
    });
    await step('Never say shows the generated banned word as a chip', async () => {
      await expect(
        neverSay().getByRole('listitem').filter({ hasText: GENERATED_WORD }),
      ).toBeVisible();
      return GENERATED_WORD;
    });
  });

  let savedAt = 0;

  test('editing Never say and saving writes brand_md_edited', async () => {
    const supabase = admin();
    await step('add a banned word and an avoid theme, then Save', async () => {
      const wordInput = neverSay().getByRole('textbox', { name: 'Banned words' });
      await wordInput.fill(NEW_WORD);
      await wordInput.press('Enter');
      await expect(neverSay().getByRole('listitem').filter({ hasText: NEW_WORD })).toBeVisible();
      const themes = neverSay().getByRole('textbox', { name: 'Themes to avoid' });
      await themes.fill(`AI hype\n${NEW_THEME}`);
      await neverSay().screenshot({ path: path.join(SCREENSHOT_DIR, 'never-say-edited.png') });

      savedAt = Date.now();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Brand document saved')).toBeVisible({ timeout: 30_000 });
      return `+${NEW_WORD}, +"${NEW_THEME}"`;
    });

    await step('brand_md_edited carries the word in its front matter', async () => {
      const row = await composite(supabase);
      const parsed = parseBrandMd(row.brand_md_edited ?? '');
      expect(parsed.tokens?.voice?.banned_words).toEqual([GENERATED_WORD, NEW_WORD]);
      return `voice.banned_words = ${parsed.tokens?.voice?.banned_words?.join(', ')}`;
    });

    await step('brand_md_edited carries the avoid theme in the Voice section', async () => {
      const row = await composite(supabase);
      expect(row.brand_md_edited).toContain(`Avoid themes: AI hype; ${NEW_THEME}`);
      return NEW_THEME;
    });
  });

  test('the next caption prompt forbids the new word within 60s', async () => {
    let words: string[] = [];
    await step('caption block Never use: carries the new word', async () => {
      await expect
        .poll(
          async () => {
            words = neverUse(await captionBlock());
            return words.includes(NEW_WORD);
          },
          { timeout: PROMPT_DEADLINE_MS, intervals: [500, 1_000, 2_000] },
        )
        .toBe(true);
      return `Never use: ${words.join(', ')}`;
    });
    await step('within 60s of pressing Save', async () => {
      const elapsed = Date.now() - savedAt;
      expect(elapsed).toBeLessThan(PROMPT_DEADLINE_MS);
      return `${elapsed}ms`;
    });
    await step('the edit added to the list rather than replacing it', async () => {
      expect(words).toContain(GENERATED_WORD);
      return GENERATED_WORD;
    });
  });

  test('a reload shows the saved word back from the rebuilt book', async () => {
    await step('reloaded Never say shows the saved chip', async () => {
      await expect
        .poll(async () => (await bookBrandMd(admin()))?.includes(NEW_WORD) ?? false, {
          timeout: 60_000,
          intervals: [1_000],
        })
        .toBe(true);
      await openBrandBrain();
      await expect(neverSay().getByRole('listitem').filter({ hasText: NEW_WORD })).toBeVisible();
      await expect(page.getByText('Edited', { exact: true })).toBeVisible();
      return 'book rebuilt from brand_md_edited';
    });
  });

  test('Revert to generated restores the brand.md and the caption block', async () => {
    await step('Revert clears brand_md_edited', async () => {
      await page.getByRole('button', { name: 'Revert to generated' }).click();
      await expect(page.getByText('Reverted to generated document')).toBeVisible({
        timeout: 30_000,
      });
      const row = await composite(admin());
      expect(row.brand_md_edited).toBeNull();
      return 'brand_md_edited = null';
    });
    await step('caption block no longer carries the word', async () => {
      const words = neverUse(await captionBlock());
      expect(words).not.toContain(NEW_WORD);
      expect(words).toContain(GENERATED_WORD);
      return `Never use: ${words.join(', ')}`;
    });
  });
});
