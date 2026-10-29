/**
 * Onboarding load-speed bench (hillclimb `onboarding-load`, docs/hillclimb/onboarding-load.md).
 *
 * Times what a person waits for in onboarding, against a production build on the LOCAL stack:
 *   - load cases: navigation start → the step's primary control is hydrated (React has attached
 *     its props), so a click or keystroke would actually do something;
 *   - move cases: the click on a step's Continue/Skip → the next step's heading is on screen.
 * Every sample gets a brand seeded at the case's step and deleted afterwards (net zero), a cold
 * browser context, 4x CPU throttling and a modelled mobile network (see throttle()). Server→Supabase latency comes
 * from `scripts/app-performance-transport.cjs` (APP_PERFORMANCE_DB_DELAY_MS) on the server.
 *
 * Run (server first, in another shell):
 *   NEXT_PUBLIC_API_URL=http://localhost:4011 NEXT_DIST_DIR=.next/onb-bench next build
 *   NEXT_DIST_DIR=.next/onb-bench APP_PERFORMANCE_DB_DELAY_MS=60 \
 *     NODE_OPTIONS=--require=<monorepo>/scripts/app-performance-transport.cjs next start -p 3012
 *   bun --env-file=.env.local e2e/onboarding-load.bench.ts <label> [origin] [outDir]
 *
 * `baseline-a` seals the per-case reference means; every other label is scored against them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '@/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';

const label = process.argv[2] ?? 'baseline-a';
const origin = process.argv[3] ?? 'http://localhost:3012';
const outDir = path.resolve(
  process.argv[4] ?? '../../Continuum-Monorepo/artifacts/hillclimb/onboarding-load',
);
const SEALED = '/tmp/onboarding-load-sealed';
const REPEATS = Number(process.env.ONBOARDING_LOAD_REPEATS ?? 5);
const SEED = 20261029;
const PASSWORD = 'localdev123';
const SOLO = 'onb-bench-solo@continuum-e2e.test';
const MULTI = 'onb-bench-multi@continuum-e2e.test';

type Case = {
  id: string;
  kind: 'load' | 'move';
  step: number;
  user: string;
  /** Text of the button a move case clicks; null for loads. */
  click: string | null;
  /** Marker of the screen the case ends on. */
  marker: string;
};

const CASES: Case[] = [
  {
    id: 'load-first-brand',
    kind: 'load',
    step: 0,
    user: SOLO,
    click: null,
    marker: 'Start with your brand',
  },
  {
    id: 'load-second-brand',
    kind: 'load',
    step: 0,
    user: MULTI,
    click: null,
    marker: 'Start with your brand',
  },
  {
    id: 'load-documents',
    kind: 'load',
    step: 1,
    user: SOLO,
    click: null,
    marker: 'Brand documents',
  },
  { id: 'load-products', kind: 'load', step: 2, user: SOLO, click: null, marker: 'Your products' },
  { id: 'load-brand-dna', kind: 'load', step: 5, user: SOLO, click: null, marker: 'Brand DNA' },
  {
    id: 'move-documents-to-products',
    kind: 'move',
    step: 1,
    user: SOLO,
    click: 'Skip for now',
    marker: 'Your products',
  },
  {
    id: 'move-products-to-channels',
    kind: 'move',
    step: 2,
    user: SOLO,
    click: 'Skip for now',
    marker: 'Tag accounts to this brand',
  },
  {
    id: 'move-team-to-dna',
    kind: 'move',
    step: 4,
    user: SOLO,
    click: 'Continue',
    marker: 'Brand DNA',
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
  throw new Error(`local Supabase only, got ${url}`);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(origin)) throw new Error('local app only');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

async function ensureUser(email: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error(`createUser ${email}`);
  return created.data.user.id;
}

async function seedBrand(owner: string, name: string, step: number, completed = false) {
  const id = crypto.randomUUID();
  const state = createDefaultOnboardingState();
  state.brand.name = name;
  state.step = step as typeof state.step;
  if (completed) state.completedAt = new Date().toISOString();
  const b = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .insert({ id, brand_name: name, created_by: owner, completed_at: state.completedAt });
  if (b.error) throw b.error;
  await admin
    .schema('brand_profiles')
    .from('permissions')
    .upsert(
      { brand_profile_id: id, user_id: owner, role: 'owner' },
      { onConflict: 'brand_profile_id,user_id', ignoreDuplicates: true },
    );
  const s = await admin.schema('brand_profiles').from('user_onboarding_states').upsert(
    {
      user_id: owner,
      brand_id: id,
      state,
      is_active: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,brand_id' },
  );
  if (s.error) throw s.error;
  return id;
}

/** Deletes every brand the user created except `keep` — the app can mint brands too. */
async function sweepBrands(owner: string, keep: string[] = []) {
  const { data } = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id')
    .eq('created_by', owner);
  for (const { id } of data ?? []) {
    if (keep.includes(id)) continue;
    await admin.schema('brand_profiles').from('user_onboarding_states').delete().eq('brand_id', id);
    await admin.schema('brand_profiles').from('permissions').delete().eq('brand_profile_id', id);
    await admin.schema('brand_profiles').from('brand_profiles').delete().eq('id', id);
  }
}

// The step's primary control carries React props once hydrated; before that a click is lost.
function READY({ marker, control }: { marker: string; control: string }): boolean {
  const onScreen =
    marker === 'Brand DNA'
      ? [...document.querySelectorAll('h2')].some(
          (h) => h.previousElementSibling?.textContent?.trim() === 'Brand DNA',
        )
      : [...document.querySelectorAll('h1,h2')].some((h) => h.textContent?.includes(marker));
  if (!onScreen) return false;
  const el =
    control === 'textarea'
      ? document.querySelector('textarea')
      : [...document.querySelectorAll('button')].find((b) =>
          (b.textContent ?? '').trim().startsWith(control),
        );
  return Boolean(
    el &&
      !(el as HTMLButtonElement).disabled &&
      Object.keys(el).some((k) => k.startsWith('__reactProps')),
  );
}

// CDP network emulation is a no-op in this headless Chromium (149), so the network is modelled
// with routing: every request pays one round trip, and static chunks also pay their size at the
// link's throughput. Documents, RSC and server actions are delayed but never buffered, so
// streaming still streams. Concurrent downloads do not share bandwidth here — optimistic, but the
// same for every arm.
const RTT_MS = 150;
const BYTES_PER_MS = (12 * 1024 * 1024) / 8 / 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route(`${origin}/**`, async (route) => {
    if (!route.request().url().includes('/_next/static/')) {
      await sleep(RTT_MS);
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    await sleep(RTT_MS + body.length / BYTES_PER_MS);
    await route.fulfill({ response, body });
  });
}

type Sample = { ms: number; ttfbMs: number; jsKb: number; parity: boolean; note: string };

async function runSample(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  c: Case,
  cookies: Awaited<ReturnType<typeof mintSessionWithPassword>>['cookies'],
  brandId: string,
): Promise<Sample> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin })));
  await context.addInitScript(() => localStorage.setItem('continuum:welcome-seen', '1'));
  const page = await context.newPage();
  const serverErrors: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 500 && r.url().startsWith(origin))
      serverErrors.push(`${r.status()} ${r.url()}`);
  });
  await throttle(page);
  try {
    await page.goto(`${origin}/onboarding?brand=${brandId}`, {
      waitUntil: 'commit',
      timeout: 90_000,
    });
    const marker = c.kind === 'load' ? c.marker : stepMarker(c.step);
    // Loads wait for the step's primary control; moves for the very button they will click.
    const control = c.click ?? (c.step === 0 ? 'textarea' : PRIMARY[c.step]);
    await page.waitForFunction(READY, { marker, control }, { timeout: 90_000, polling: 'raf' });
    let ms = await page.evaluate(() => performance.now());
    if (c.kind === 'move') {
      ms = await page.evaluate(
        ({ click, marker }) =>
          new Promise<number>((resolve, reject) => {
            const button = [...document.querySelectorAll('button')].find((b) =>
              (b.textContent ?? '').trim().startsWith(click),
            );
            if (!button) return reject(new Error(`no button ${click}`));
            const started = performance.now();
            button.click();
            const deadline = started + 60_000;
            const tick = () => {
              const done =
                marker === 'Brand DNA'
                  ? [...document.querySelectorAll('h2')].some(
                      (h) => h.previousElementSibling?.textContent?.trim() === 'Brand DNA',
                    )
                  : [...document.querySelectorAll('h1,h2')].some((h) =>
                      h.textContent?.includes(marker),
                    );
              if (done) resolve(performance.now() - started);
              else if (performance.now() > deadline) reject(new Error(`no ${marker}`));
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        { click: c.click ?? '', marker: c.marker },
      );
    }
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const js = performance
        .getEntriesByType('resource')
        .filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script')
        .reduce((sum, r) => sum + (r as PerformanceResourceTiming).transferSize, 0);
      const errorToast = [...document.querySelectorAll('[role=alert],[data-sonner-toast],li')].some(
        (el) => /Couldn.t continue|Minified React error|Launch failed/.test(el.textContent ?? ''),
      );
      return { ttfbMs: nav?.responseStart ?? 0, jsKb: js / 1024, errorToast };
    });
    const parity = !metrics.errorToast && serverErrors.length === 0;
    return {
      ms,
      ttfbMs: metrics.ttfbMs,
      jsKb: metrics.jsKb,
      parity,
      note: parity ? '' : `toast=${metrics.errorToast} 5xx=${serverErrors.join(',')}`,
    };
  } finally {
    await context.close();
  }
}

const PRIMARY: Record<number, string> = { 1: 'Continue', 2: 'Continue', 5: 'Continue' };

function stepMarker(step: number): string {
  return [
    'Start with your brand',
    'Brand documents',
    'Your products',
    'Tag accounts to this brand',
    'Invite your team',
    'Brand DNA',
  ][step];
}

// Stratified by kind: a split that put every move case in train could never keep a transition
// win (test cannot move), so each kind keeps about two thirds in train.
function split(): { train: Case[]; test: Case[] } {
  let seed = SEED;
  const shuffle = (cases: Case[]) =>
    cases
      .map((c) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return { c, order: seed };
      })
      .sort((a, b) => a.order - b.order)
      .map(({ c }) => c);
  const loads = shuffle(CASES.filter((c) => c.kind === 'load'));
  const moves = shuffle(CASES.filter((c) => c.kind === 'move'));
  return {
    train: [...loads.slice(0, 3), ...moves.slice(0, 2)],
    test: [...loads.slice(3), ...moves.slice(2)],
  };
}

async function main() {
  if (!Number.isInteger(REPEATS) || REPEATS < 3) throw new Error('at least three repeats');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(SEALED, { recursive: true });
  const refPath = path.join(SEALED, 'reference.json');
  const reference: Record<string, number> =
    label === 'baseline-a' ? {} : JSON.parse(fs.readFileSync(refPath, 'utf8'));

  const solo = await ensureUser(SOLO);
  const multi = await ensureUser(MULTI);
  await sweepBrands(solo);
  await sweepBrands(multi);
  const multiHome = await seedBrand(multi, 'Bench Home Brand', 7, true);
  const sessions = {
    [SOLO]: (await mintSessionWithPassword(SOLO, PASSWORD)).cookies,
    [MULTI]: (await mintSessionWithPassword(MULTI, PASSWORD)).cookies,
  };
  const owners = { [SOLO]: solo, [MULTI]: multi };

  const browser = await chromium.launch();
  const { train, test } = split();
  const latency = {
    rubric: 'onboarding-load-v2',
    train: {} as Record<string, number[]>,
    test: {} as Record<string, number[]>,
  };
  const parity = {
    rubric: 'onboarding-load-parity-v2',
    train: {} as Record<string, number[]>,
    test: {} as Record<string, number[]>,
  };
  const raw: Record<string, Sample[]> = {};
  try {
    for (const [splitName, cases] of [
      ['train', train],
      ['test', test],
    ] as const) {
      for (const c of cases) {
        // One unscored warm-up so every arm compares initialized server processes.
        const warmBrand = await seedBrand(owners[c.user], `Bench ${c.id} warm`, c.step);
        await runSample(browser, c, sessions[c.user], warmBrand).catch(() => null);
        await sweepBrands(owners[c.user], c.user === MULTI ? [multiHome] : []);
        const samples: Sample[] = [];
        for (let r = 0; r < REPEATS; r += 1) {
          const brandId = await seedBrand(owners[c.user], `Bench ${c.id} ${r + 1}`, c.step);
          try {
            samples.push(await runSample(browser, c, sessions[c.user], brandId));
          } finally {
            await sweepBrands(owners[c.user], c.user === MULTI ? [multiHome] : []);
          }
        }
        raw[c.id] = samples;
        const mean = samples.reduce((s, x) => s + x.ms, 0) / samples.length;
        if (label === 'baseline-a') reference[c.id] = mean;
        latency[splitName][c.id] = samples.map((s) => s.ms / reference[c.id]);
        parity[splitName][c.id] = samples.map((s) => (s.parity ? 1 : 0));
        // Test cases report only into files: the proposer reads train.
        if (splitName === 'train') {
          console.log(
            `${c.id}: ${mean.toFixed(0)} ms (ttfb ${(samples.reduce((s, x) => s + x.ttfbMs, 0) / samples.length).toFixed(0)} ms, js ${samples[0].jsKb.toFixed(0)} KB) parity ${samples.filter((s) => s.parity).length}/${samples.length} ${samples
              .map((s) => s.note)
              .filter(Boolean)
              .join(' ')}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
    await sweepBrands(solo);
    await sweepBrands(multi);
  }
  if (label === 'baseline-a') fs.writeFileSync(refPath, JSON.stringify(reference));
  for (const [suffix, value] of [
    ['latency', latency],
    ['parity', parity],
    ['raw', raw],
  ] as const) {
    fs.writeFileSync(
      path.join(outDir, `${label}-${suffix}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }
  const testMeans = Object.values(latency.test).map(
    (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
  );
  console.log(
    `test (normalized to baseline-a, lower is better): ${(testMeans.reduce((a, b) => a + b, 0) / testMeans.length).toFixed(3)}`,
  );
}

await main();
