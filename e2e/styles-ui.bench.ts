#!/usr/bin/env bun
/**
 * styles:ui:bench — the Styles shelf and the swipe review queue, driven through the REAL Frontend
 * in Chromium, signed in as the bench login on the bench tenant, against a bench-owned local
 * Backend on hosted Supabase. Nothing is mocked; the one `page.route` below only DELAYS the real
 * decision request so the bench can see the card leave the deck before the Backend answers.
 *
 * It proves, with real rows and real responses:
 *
 *   1. the review queue route lists drafts that carry their blocks, and the deck shows them;
 *   2. approve (→ key), skip (swipe left) and revise (tap + note; Enter + effect) each leave the
 *      deck at once, reach `POST /api/organic/agent/review-queue/:draftId/decision`, and either
 *      stick (the row carries the review state) or come back when the Backend refuses;
 *   3. the Styles tab renders 30 effect and 10 concept cards whose thumbnails load (≤ 40 KB);
 *   4. the brand's own drafts carry Approve/Retire and round-trip `POST /api/headless/styles/:id/
 *      decision` — or, while `media.headless_brand_styles` is not applied on hosted, the shelf
 *      shows the refusal instead of an empty shelf, and the hop is reported SKIP by name;
 *   5. the same shelf opens from the Studio canvas toolbar.
 *
 * Fixtures: four `organic_calendar_drafts` rows on the bench tenant (status draft, media
 * realized, content_json.creative.blocks), whose media is a 1-hour read-only signed URL to a
 * tenant-path benchmark reel in GCS (coordinator-approved; nothing is copied). Every seeded row,
 * every job a revision enqueued, and the brand draft this run composed are deleted BY ID at the
 * end; the tenant's draft count before and after is reported.
 *
 * The bench Backend runs with ORGANIC_JOB_WORKER_ENABLED=false and BACKGROUND_WORKERS_ENABLED=
 * false, and a revision's headless_media job is deleted the moment the route answers: a live
 * worker claiming it would run a real guided create on the tenant.
 *
 * Run: `bun run styles:ui:bench` (root or Frontend). It starts its own Backend and Next app on
 * STYLES_UI_BENCH_BACKEND_PORT / STYLES_UI_BENCH_APP_PORT and refuses ports that already answer.
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { HEADLESS_CONCEPTS, HEADLESS_EFFECTS } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { type Browser, chromium, type Locator, type Page, type Response } from 'playwright';
import { mintSessionWithPassword } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

const BENCH = 'styles:ui:bench';
const BRAND_ID = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const APP_PORT = Number(process.env.STYLES_UI_BENCH_APP_PORT ?? 3141);
const BACKEND_PORT = Number(process.env.STYLES_UI_BENCH_BACKEND_PORT ?? 4441);
const APP = `http://127.0.0.1:${APP_PORT}`;
// Both package scripts run it from Continuum-Frontend.
const FRONTEND_DIR = process.cwd();
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '../Continuum-Backend');
const PAGE_TIMEOUT_MS = 240_000;
const DECISION_DELAY_MS = 1_500;
const THUMBNAIL_MAX_BYTES = 40 * 1024;
const TAG_PREFIX = 'bench:styles-ui-';
const RUN_TAG = `${TAG_PREFIX}${crypto.randomUUID().slice(0, 8)}`;

/** Tenant-path benchmark reels (finish12, billed to b411bba9), one per seeded draft. */
const REEL_PREFIX =
  'gs://continuum-production-477821-creative-benchmarks/headless-autoads/finish12-recompose-endcard5-2026-09-29T08-40-45-349Z/b411bba9-d09c-4892-9b86-5ff340ce64e5/reels';
const SEEDS = [
  { concept: 'busy-day-routine', effectId: 'film-35mm', reel: 'reel-390c4c592969982c.mp4' },
  { concept: 'car-storytime', effectId: 'vhs', reel: 'reel-69a61b7821ffca13.mp4' },
  { concept: 'unpopular-opinion', effectId: 'haze', reel: 'reel-23f2e9f681ba754e.mp4' },
  // A spare, so the re-style still has a card if approve ever sticks.
  { concept: 'problem-solution', effectId: 'moody', reel: 'reel-052fb633fd1e2dcc.mp4' },
] as const;
const RESTYLE_EFFECT = { id: 'polaroid', label: 'Polaroid' };

/* -- the Recorder envelope (mirrored from the Backend _bench Recorder; AGENTS.md §5) ------- */
type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const GLYPH: Record<Grade, string> = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' };
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

const record = (step: string, grade: Grade, detail?: string) => {
  results.push({ step, grade, ...(detail ? { detail } : {}) });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
};
const check = (step: string, ok: boolean, detail?: string) =>
  record(step, ok ? 'PASS' : 'FAIL', detail);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function finish(): never {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of results) counts[result.grade.toLowerCase() as keyof typeof counts] += 1;
  const exitCode = counts.fail > 0 || results.length === 0 ? 1 : 0;
  const durationMs = Date.now() - startedMs;
  console.log(
    `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — ${BENCH}: ${counts.pass} pass, ${counts.warn} warn, ` +
      `${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
  );
  console.log(
    JSON.stringify({ bench: BENCH, startedAt, durationMs, results, notes, counts, exitCode }),
  );
  process.exit(exitCode);
}

/* -- environment: hosted Supabase for the app, the Backend and this process ---------------- */
const { url: SUPABASE_URL, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = APP;
// The bench Backend must never run a job a revision enqueues (see the header).
process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL');
const OWNER_PASSWORD = readBackendEnv('CONTINUUM_BENCH_OWNER_PASSWORD');

const admin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const organic = () => admin.schema('organic');

/* -- processes ---------------------------------------------------------------------------- */
async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function killGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), name);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const quit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!quit) signal('SIGKILL');
}

/** Its own Next dev server on hosted Supabase: `.env.local` points a shared one at the local stack. */
async function startApp(backendUrl: string): Promise<{ stop: () => Promise<void> }> {
  if (await answers(APP)) throw new Error(`${APP} already answers; set STYLES_UI_BENCH_APP_PORT`);
  const child = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/styles-ui-bench',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 30) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const stop = () => killGroup(child);
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await answers(`${APP}/login`)) return { stop };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await stop();
  throw new Error(`the Next app never came up on ${APP}\n${tail.join('')}`);
}

/* -- fixtures ----------------------------------------------------------------------------- */
function signReel(file: string): string {
  return execFileSync(
    'gcloud',
    [
      'storage',
      'sign-url',
      `${REEL_PREFIX}/${file}`,
      '--private-key-file=GOOGLE_CREDS.json',
      '--duration=1h',
      '--format=value(signed_url)',
    ],
    { cwd: BACKEND_DIR, encoding: 'utf8' },
  ).trim();
}

async function countTenantDrafts(): Promise<number> {
  const { count, error } = await organic()
    .from('organic_calendar_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', BRAND_ID);
  if (error) throw new Error(`count drafts: ${error.message}`, { cause: error });
  return count ?? 0;
}

async function seedQueue(userId: string): Promise<string[]> {
  // Approve schedules onto the tenant's one connected account (bound on read). Ten years out, so
  // a run that dies before its cleanup never leaves anything within reach of the publish poller.
  const scheduled = new Date();
  scheduled.setFullYear(scheduled.getFullYear() + 10);
  const rows = SEEDS.map((seed, index) => ({
    id: crypto.randomUUID(),
    brand_id: BRAND_ID,
    user_id: userId,
    client_key: `${RUN_TAG}-${index}`,
    platform: 'instagram',
    // No account, as on the bench tenant: 'unassigned' passes the approve gate today (reported
    // to review-loop) and would schedule a post with nowhere to go.
    platform_account_id: null,
    status: 'draft',
    media_stage: 'realized',
    scheduled_date: new Date(scheduled.getTime() + index * 60_000).toISOString(),
    // A reel: publishability reads the format from here, and a POST wants an image instead.
    slot_data: { platform: 'instagram', format: 'reel', source: RUN_TAG },
    content_json: {
      content: { format: 'reel' },
      copy: { caption: `Bench ${seed.concept} (${RUN_TAG})` },
      creative: {
        blocks: { concept: seed.concept, effectId: seed.effectId },
        mediaSuggestion: { mediaStatus: 'ready', reel: { url: signReel(seed.reel) } },
      },
    },
  }));
  const { error } = await organic().from('organic_calendar_drafts').insert(rows);
  if (error) throw new Error(`seed drafts: ${error.message}`, { cause: error });
  return rows.map((row) => row.id);
}

async function readDraft(id: string) {
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .select('status, content_json')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`read draft ${id}: ${error.message}`, { cause: error });
  const creative = (data?.content_json as { creative?: { review?: { state?: string } } } | null)
    ?.creative;
  return { status: data?.status as string | undefined, review: creative?.review?.state };
}

/** Jobs a revision enqueued for these drafts: the draft column, or the headless_media payload. */
async function jobsFor(draftIds: readonly string[]): Promise<string[]> {
  if (draftIds.length === 0) return [];
  const ids = [...draftIds];
  const [byColumn, byPayload] = await Promise.all([
    organic()
      .from('post_generation_jobs')
      .select('job_id')
      .eq('brand_id', BRAND_ID)
      .in('draft_id', ids),
    organic()
      .from('post_generation_jobs')
      .select('job_id')
      .eq('brand_id', BRAND_ID)
      .in('payload->>draftId', ids),
  ]);
  const error = byColumn.error ?? byPayload.error;
  if (error) throw new Error(`read jobs: ${error.message}`, { cause: error });
  const rows = [...(byColumn.data ?? []), ...(byPayload.data ?? [])] as Array<{ job_id: string }>;
  return [...new Set(rows.map((row) => row.job_id))];
}

async function deleteJobs(jobIds: readonly string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const { error } = await organic().from('post_generation_jobs').delete().in('job_id', jobIds);
  if (error) throw new Error(`delete jobs: ${error.message}`, { cause: error });
}

/* -- the deck ------------------------------------------------------------------------------ */
const DECISION_URL = /\/api\/organic\/agent\/review-queue\/[^/?]+\/decision/;

type Decided = { response: Response; left: boolean; body: unknown };

/** Runs `act`, and reports whether the card left the deck BEFORE the (delayed) answer landed. */
async function decide(page: Page, card: Locator, act: () => Promise<void>): Promise<Decided> {
  const answered = page.waitForResponse((response) => DECISION_URL.test(response.url()), {
    timeout: 60_000,
  });
  await act();
  const left = await card
    .waitFor({ state: 'detached', timeout: DECISION_DELAY_MS - 300 })
    .then(() => true)
    .catch(() => false);
  const response = await answered;
  const body = await response.json().catch(() => null);
  return { response, left, body };
}

const describe = (decided: Decided) =>
  `${decided.response.status()} ${JSON.stringify(decided.body)}; left the deck before the answer: ${decided.left}`;

async function cardIsBack(card: Locator): Promise<boolean> {
  return card
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

async function reviewPhase(page: Page, seeds: string[]): Promise<void> {
  // Delay (never answer) the real decision request, so an optimistic removal is observable.
  await page.route(DECISION_URL, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DECISION_DELAY_MS));
    await route.continue();
  });

  const listed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/organic/agent/review-queue?') &&
      response.request().method() === 'GET',
    { timeout: PAGE_TIMEOUT_MS },
  );
  await page.goto(`${APP}/organic?tab=review`, {
    waitUntil: 'domcontentloaded',
    timeout: PAGE_TIMEOUT_MS,
  });
  const listResponse = await listed;
  const listBody = (await listResponse.json().catch(() => null)) as {
    items?: Array<{ draftId: string; creative?: { concept?: string } }>;
  } | null;
  const listedIds = (listBody?.items ?? []).map((item) => item.draftId);
  const present = seeds.filter((id) => listedIds.includes(id));
  check(
    'the review route lists the seeded drafts with their blocks',
    listResponse.status() === 200 && present.length === seeds.length,
    `${listResponse.status()}; ${listedIds.length} item(s), ${present.length}/${seeds.length} seeded present`,
  );
  if (present.length !== seeds.length) return;

  const deck = page.getByRole('region', { name: 'Review queue' });
  const cardFor = (id: string) => deck.locator(`[data-review-card="${id}"]`);
  const topId = async () =>
    (await deck.locator('[data-review-card]').first().getAttribute('data-review-card')) ?? '';

  await deck.locator('[data-review-card]').first().waitFor({ timeout: 30_000 });
  const a11y =
    (await deck.getByRole('button', { name: /Skip/ }).count()) === 1 &&
    (await deck.getByRole('button', { name: /Approve/ }).count()) === 1 &&
    (await deck.getByRole('button', { name: 'Change' }).count()) === 1 &&
    (await deck.getByRole('group').first().getAttribute('aria-keyshortcuts')) ===
      'ArrowRight ArrowLeft Enter';
  check(
    'the deck has screen-reader equivalents (Skip, Change, Approve buttons; key shortcuts)',
    a11y,
  );

  // 1) approve with the → key. The tenant has no connected account, so the Backend's answer is
  //    422 not_publishable/account_missing and the card must come back.
  const first = await topId();
  if (!seeds.includes(first)) {
    record('the seeded drafts are on top of the deck', 'FAIL', `top card ${first} is not ours`);
    return;
  }
  const approveCard = cardFor(first);
  await approveCard.focus();
  const approved = await decide(page, approveCard, () => page.keyboard.press('ArrowRight'));
  const approveBody = approved.body as { error?: string; reason?: string; status?: string } | null;
  if (approved.response.status() === 200) {
    const row = await readDraft(first);
    check(
      'approve (→) leaves the deck and schedules the draft',
      approved.left && approveBody?.status === 'scheduled',
      `${describe(approved)}; row status ${row.status}`,
    );
  } else {
    const back = await cardIsBack(approveCard);
    const told = await deck
      .getByRole('status')
      .filter({ hasText: /connect a social account/ })
      .count();
    check(
      'approve (→) leaves the deck, reaches the route, and rolls back on its refusal',
      approved.left &&
        approved.response.status() === 422 &&
        approveBody?.reason === 'account_missing' &&
        back &&
        told === 1,
      `${describe(approved)}; card back: ${back}; reason shown: ${told === 1}`,
    );
    note(
      'approve → scheduled is un-exercised: the bench tenant has no connected account, so the ' +
        "route's publishability gate answers account_missing (the expected refusal).",
    );
  }

  // 2) skip with a left swipe.
  const skipId = await topId();
  const skipCard = cardFor(skipId);
  const box = await skipCard.boundingBox();
  if (!box) {
    record('skip (swipe left)', 'FAIL', 'the top card has no box');
    return;
  }
  const skipped = await decide(page, skipCard, async () => {
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 3];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 320, y, { steps: 16 });
    await page.mouse.up();
  });
  const skippedRow = await readDraft(skipId);
  check(
    'skip (swipe left) leaves the deck and the row records the skip',
    skipped.left && skipped.response.status() === 200 && skippedRow.review === 'skipped',
    `${describe(skipped)}; row review ${skippedRow.review}`,
  );

  // 3) revise with a note: tap the card, describe the change.
  const noteId = await topId();
  const noteCard = cardFor(noteId);
  await noteCard.click();
  const form = deck.getByRole('form', { name: 'Describe a change' });
  await form.getByLabel('Describe a change').fill('Open on her walking in, not the car door.');
  const noted = await decide(page, noteCard, () =>
    form.getByRole('button', { name: 'Send change' }).click(),
  );
  const notedJobs = await jobsFor([noteId]);
  await deleteJobs(notedJobs);
  const notedRow = await readDraft(noteId);
  check(
    'revise with a note (tap) leaves the deck and re-enqueues it with its blocks',
    noted.left &&
      noted.response.status() === 200 &&
      notedRow.review === 'revising' &&
      notedJobs.length === 1,
    `${describe(noted)}; row review ${notedRow.review}; ${notedJobs.length} job(s), deleted at once`,
  );

  // 4) revise with an effect only ($0 re-style): Enter opens the form.
  const styleId = await topId();
  const styleCard = cardFor(styleId);
  await styleCard.focus();
  await page.keyboard.press('Enter');
  await form.getByLabel('Re-style with an effect').selectOption(RESTYLE_EFFECT.id);
  const restyled = await decide(page, styleCard, () =>
    form.getByRole('button', { name: 'Send change' }).click(),
  );
  const restyleBody = restyled.body as { code?: string; status?: string } | null;
  if (restyled.response.status() === 200) {
    const jobs = await jobsFor([styleId]);
    await deleteJobs(jobs);
    const row = await readDraft(styleId);
    check(
      `revise to ${RESTYLE_EFFECT.label} (Enter) leaves the deck and queues the $0 re-style`,
      restyled.left && row.review === 'revising',
      `${describe(restyled)}; row review ${row.review}; ${jobs.length} job(s), deleted at once`,
    );
  } else {
    const back = await cardIsBack(styleCard);
    check(
      `revise to ${RESTYLE_EFFECT.label} (Enter) leaves the deck, reaches the route, and rolls back on its refusal`,
      restyled.left &&
        restyled.response.status() === 409 &&
        restyleBody?.code === 'restyle_source_missing' &&
        back,
      `${describe(restyled)}; card back: ${back}`,
    );
    note(
      'the $0 re-render itself is un-exercised: the bench tenant has no durable headless run ' +
        '(media.headless_runs has none for it), so the route answers restyle_source_missing.',
    );
  }
}

async function stylesPhase(page: Page, bearer: string): Promise<void> {
  const stylesListed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/headless/styles?') && response.request().method() === 'GET',
    { timeout: PAGE_TIMEOUT_MS },
  );
  await page
    .getByRole('navigation', { name: 'Organic workspace' })
    .getByRole('button', { name: 'Styles' })
    .click();
  const effects = page.getByRole('list', { name: 'Effects' });
  const concepts = page.getByRole('list', { name: 'Concepts' });
  await effects.waitFor({ timeout: PAGE_TIMEOUT_MS });
  const effectCount = await effects.getByRole('listitem').count();
  const conceptCount = await concepts.getByRole('listitem').count();
  check(
    `the Styles tab renders ${HEADLESS_EFFECTS.length} effect and ${HEADLESS_CONCEPTS.length} concept cards`,
    effectCount === HEADLESS_EFFECTS.length && conceptCount === HEADLESS_CONCEPTS.length,
    `${effectCount} effects, ${conceptCount} concepts`,
  );

  // Every card shows a decoded thumbnail (a failed one falls back to a muted frame, so the card
  // is counted, not the <img>), and every catalog thumbnail is a webp under budget on the wire.
  const shown = await page.evaluate(async () => {
    const cards = [
      ...document.querySelectorAll('ul[aria-label="Effects"] > li, ul[aria-label="Concepts"] > li'),
    ];
    const images = cards.flatMap((card) => [...card.querySelectorAll('img')]);
    for (const image of images) image.loading = 'eager';
    await Promise.all(
      images.map((image) =>
        image.complete
          ? null
          : new Promise((resolve) => {
              image.addEventListener('load', resolve);
              image.addEventListener('error', resolve);
            }),
      ),
    );
    return cards.filter((card) => {
      const image = card.querySelector('img');
      return image !== null && image.naturalWidth > 0;
    }).length;
  });
  const expected = [
    ...HEADLESS_EFFECTS.map((effect) => `/styles/effects/${effect.id}.webp`),
    ...HEADLESS_CONCEPTS.map((concept) => `/styles/concepts/${concept.id}.webp`),
  ];
  const bad: string[] = [];
  for (const src of expected) {
    const response = await fetch(`${APP}${src}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('image/webp') || bytes > THUMBNAIL_MAX_BYTES)
      bad.push(`${src} ${response.status} ${bytes}B`);
  }
  check(
    'every effect and concept card shows its thumbnail, each a webp ≤ 40 KB',
    shown === expected.length && bad.length === 0,
    `${shown}/${expected.length} cards show one` +
      (bad.length
        ? `; ${bad.length} bad: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? '…' : ''}`
        : ''),
  );

  const firstEffect = effects.getByRole('listitem').first().getByRole('button').first();
  await firstEffect.click();
  check(
    'a card is tappable: it opens its summary',
    (await firstEffect.getAttribute('aria-expanded')) === 'true',
  );

  // The brand's own drafts.
  const listResponse = await stylesListed;
  const listText = await listResponse.text();
  if (listResponse.status() === 500 && /PGRST205|42P01/.test(listText)) {
    // React Query retries a failed read before it gives up, so the alert can take a few seconds.
    const refused = await page
      .getByRole('alert')
      .filter({ hasText: "Couldn't load your styles" })
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    check('the shelf shows the brand-styles refusal instead of an empty shelf', refused);
    record(
      'brand drafts: Approve and Retire round-trip',
      'SKIP',
      'media.headless_brand_styles is not applied on hosted (owner-gated migration); the route ' +
        `answers ${listText.slice(0, 160)}`,
    );
    return;
  }
  check(
    'the brand-styles route lists the brand’s styles',
    listResponse.status() === 200,
    `${listResponse.status()} ${listText.slice(0, 200)}`,
  );
  if (listResponse.status() !== 200) return;

  const slug = `bench-ui-${crypto.randomUUID().slice(0, 8)}`;
  const label = `Bench grain ${slug.slice(-4)}`;
  const drafted = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/headless/styles?brandId=${BRAND_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({
        kind: 'effect',
        spec: {
          id: slug,
          label,
          summary: 'A light animated grain, composed by the styles UI bench.',
          whenToUse: 'Never: a bench fixture, retired by the run that drafted it.',
          category: 'grade',
          ops: [{ op: 'grain', amount: 0.2, animated: true }],
          suits: [],
          avoid: [],
          status: 'draft',
          exemplar: null,
          origin: 'brand',
        },
      }),
    },
  );
  const draftBody = (await drafted.json().catch(() => null)) as { id?: string } | null;
  draftedStyleId = draftBody?.id ?? null;
  check(
    'a brand draft is composed through the route',
    drafted.status === 200 && Boolean(draftedStyleId),
    `${drafted.status}`,
  );
  if (!draftedStyleId) return;

  await page.reload({ waitUntil: 'domcontentloaded' });
  const yours = page.getByRole('list', { name: 'Your styles' });
  const card = yours.getByRole('listitem').filter({ hasText: label });
  await card.waitFor({ timeout: 60_000 });
  const tagged =
    (await card.getByText('Draft', { exact: true }).count()) === 1 &&
    (await card.getByRole('button', { name: `Approve ${label}` }).count()) === 1 &&
    (await card.getByRole('button', { name: `Retire ${label}` }).count()) === 1;
  check('the draft is tagged Draft with Approve and Retire', tagged);

  const approveAnswer = page.waitForResponse((r) =>
    r.url().includes(`/api/headless/styles/${draftedStyleId}/decision`),
  );
  await card.getByRole('button', { name: `Approve ${label}` }).click();
  const approveResponse = await approveAnswer;
  await card
    .getByText('Approved', { exact: true })
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  check(
    'Approve round-trips and the card reads Approved',
    approveResponse.status() === 200 &&
      (await card.getByText('Approved', { exact: true }).count()) === 1,
    `${approveResponse.status()}`,
  );

  const retireAnswer = page.waitForResponse((r) =>
    r.url().includes(`/api/headless/styles/${draftedStyleId}/decision`),
  );
  await card.getByRole('button', { name: `Retire ${label}` }).click();
  const retireResponse = await retireAnswer;
  const gone = await card
    .waitFor({ state: 'detached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(
    'Retire round-trips and the card leaves the shelf',
    retireResponse.status() === 200 && gone,
    `${retireResponse.status()}`,
  );
}

async function studioPhase(page: Page): Promise<void> {
  await page.goto(`${APP}/ai-studio`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  const open = page.getByRole('button', { name: 'Browse styles' });
  await open.waitFor({ timeout: PAGE_TIMEOUT_MS });
  await open.click();
  const effects = page.getByRole('list', { name: 'Effects' });
  await effects.waitFor({ timeout: 60_000 });
  const count = await effects.getByRole('listitem').count();
  check(
    'the Studio canvas toolbar opens the same shelf',
    count === HEADLESS_EFFECTS.length,
    `${count} effects`,
  );
}

/* -- run ---------------------------------------------------------------------------------- */
let draftedStyleId: string | null = null;

/** Drafts an earlier run left behind when it died before its cleanup, found by their tag. */
async function sweepEarlierRuns(): Promise<number> {
  const { data, error } = await organic()
    .from('organic_calendar_drafts')
    .select('id')
    .eq('brand_id', BRAND_ID)
    .like('client_key', `${TAG_PREFIX}%`);
  if (error) throw new Error(`find earlier bench drafts: ${error.message}`, { cause: error });
  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return 0;
  await deleteJobs(await jobsFor(ids));
  const removed = await organic().from('organic_calendar_drafts').delete().in('id', ids);
  if (removed.error)
    throw new Error(`sweep earlier bench drafts: ${removed.error.message}`, {
      cause: removed.error,
    });
  return ids.length;
}

/** Deletes by id everything this run wrote, then proves nothing it wrote is left. */
async function cleanup(seeds: readonly string[], draftsBefore: number): Promise<void> {
  await deleteJobs(await jobsFor(seeds));
  if (seeds.length > 0) {
    const { error } = await organic().from('organic_calendar_drafts').delete().in('id', seeds);
    if (error) throw new Error(`delete drafts: ${error.message}`, { cause: error });
  }
  if (draftedStyleId) {
    const { error } = await admin
      .schema('media')
      .from('headless_brand_styles')
      .delete()
      .eq('id', draftedStyleId);
    if (error) throw new Error(`delete brand style: ${error.message}`, { cause: error });
  }
  const remaining = seeds.length
    ? ((await organic().from('organic_calendar_drafts').select('id').in('id', seeds)).data ?? [])
        .length
    : 0;
  const remainingJobs = (await jobsFor(seeds)).length;
  const draftsAfter = await countTenantDrafts();
  const { count: scheduledLeft, error: scheduledError } = await organic()
    .from('organic_calendar_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', BRAND_ID)
    .eq('status', 'scheduled')
    .like('client_key', `${TAG_PREFIX}%`);
  if (scheduledError)
    throw new Error(`count scheduled bench drafts: ${scheduledError.message}`, {
      cause: scheduledError,
    });
  check(
    'no bench-tagged draft is left scheduled on the tenant',
    scheduledLeft === 0,
    `${scheduledLeft}`,
  );
  check(
    'cleanup deleted every seeded draft and enqueued job by id',
    remaining === 0 && remainingJobs === 0,
    `${remaining} seeded draft(s) and ${remainingJobs} job(s) left; tenant drafts ${draftsBefore} → ${draftsAfter}`,
  );
}

async function main(): Promise<void> {
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    record(
      'the bench login is configured',
      'FAIL',
      'CONTINUUM_BENCH_OWNER_EMAIL/PASSWORD missing in Continuum-Backend/.env',
    );
    return;
  }
  const anon = createClient(SUPABASE_URL, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await anon.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  const session = signedIn.data.session;
  if (signedIn.error || !signedIn.data.user || !session) {
    record('signs in as the bench login', 'FAIL', signedIn.error?.message ?? 'no session');
    return;
  }
  const userId = signedIn.data.user.id;
  record('signs in as the bench login', 'PASS', OWNER_EMAIL);

  const preferences = admin.schema('brand_profiles').from('user_brand_preferences');
  const previous = await preferences.select('active_brand_id').eq('user_id', userId).maybeSingle();
  const previousBrand =
    (previous.data as { active_brand_id?: string } | null)?.active_brand_id ?? null;

  let backend: LocalBackend | null = null;
  let app: { stop: () => Promise<void> } | null = null;
  let browser: Browser | null = null;
  let seeds: string[] = [];
  const draftsBefore = await countTenantDrafts();

  try {
    const pinned = await preferences.upsert(
      { user_id: userId, active_brand_id: BRAND_ID },
      { onConflict: 'user_id' },
    );
    if (pinned.error)
      throw new Error(`pin brand: ${pinned.error.message}`, { cause: pinned.error });

    backend = await startLocalBackend({
      port: BACKEND_PORT,
      browserOrigin: APP,
      supabase: 'hosted',
      label: BENCH,
    });
    process.env.NEXT_PUBLIC_API_URL = backend.url;
    app = await startApp(backend.url);
    record('a bench-owned Backend and Next app are up', 'PASS', `${backend.url}, ${APP}`);

    const swept = await sweepEarlierRuns();
    if (swept > 0) note(`swept ${swept} draft(s) an earlier run left behind`);
    seeds = await seedQueue(userId);
    note(
      `seeded ${seeds.length} realized drafts (${RUN_TAG}); tenant drafts before: ${draftsBefore}`,
    );

    const storageState = await mintSessionWithPassword(OWNER_EMAIL, OWNER_PASSWORD);
    browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => note(`page error: ${error.message.slice(0, 200)}`));

    await reviewPhase(page, seeds).catch((error) =>
      record('the review queue phase ran to its end', 'FAIL', errorText(error)),
    );
    await stylesPhase(page, session.access_token).catch((error) =>
      record('the Styles shelf phase ran to its end', 'FAIL', errorText(error)),
    );
    await studioPhase(page).catch((error) =>
      record('the Studio mount phase ran to its end', 'FAIL', errorText(error)),
    );
  } catch (error) {
    record('the bench ran to its end', 'FAIL', errorText(error));
  } finally {
    await browser?.close().catch(() => undefined);
    await cleanup(seeds, draftsBefore).catch((error) =>
      record('cleanup deleted every seeded draft and enqueued job by id', 'FAIL', errorText(error)),
    );
    if (previousBrand && previousBrand !== BRAND_ID) {
      await preferences.upsert(
        { user_id: userId, active_brand_id: previousBrand },
        { onConflict: 'user_id' },
      );
    }
    await app?.stop();
    await backend?.stop();
  }
}

await main().catch((error) => record('the bench ran', 'FAIL', errorText(error)));
finish();
