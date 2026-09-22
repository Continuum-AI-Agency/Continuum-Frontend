import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPETITOR_POST_FORMAT_LABELS,
  type CompetitorInspirationPost,
  competitorPostFormatSchema,
  INSPIRATION_SOURCE_POST_TAG_PREFIX,
  inspirationPostsResponseSchema,
} from '@continuum/contracts';
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { readBackendEnv } from './support/prodEnv';

// inspiration:fe:e2e:bench — the Inspiration Library, end to end, on real data.
//
// WHAT IT PROVES, against the bench login's brand and its REAL tracked Instagram
// competitors (their persisted competitor_ad_spy.organic_posts windows):
//   1. GET /instagram/posts returns every scorable post with a numeric outlierScore
//      equal to its engagement ÷ the median over >= 12 of that account's posts
//      (recomputed here from the rows the Backend scored), sorted by it.
//   2. The grid renders that multiplier on every scored tile and, on "Outlier", orders
//      the tiles by it.
//   3. Every tile carries a format label from the contract enum; choosing a post-type
//      or format chip leaves only matching tiles.
//   4. Every reel tile shows views, likes and comments on its FACE (no hover), equal
//      to the API's numbers.
//   5. Opening a real competitor reel shows a non-empty transcript, hook and scene
//      beats, and the Idea tab shows ideaSeed, contrarianReality and >= 1 piece of
//      supporting evidence (Analyse runs the real describer when needed).
//   6. Develop into draft yields a real organic.organic_calendar_drafts row.
//   7. Save as template yields a real skills.skills row tagged with the source post.
//   8. Pasting a post URL saves it, and it is in the Saved view after a reload.
//
// WHAT IS REAL: hosted Postgres + GoTrue, the real Fastify Backend (bench-owned on
// :4431, hosted target, job workers off), the real Business Discovery viewer, the real
// describer (Vertex) and organic generation, real Chrome on the real Next app.
//
// WRITES, and how they are undone: the draft and the skill are deleted BY ID in afterAll.
// A media.assets row is deleted only when it is new since the run began AND belongs to a
// post this run acted on (the inspiration-api bench writes to the same brand at the same
// time), together with its storage objects, its carousel group and its Library register
// receipt (a receipt left behind hands the next save of that post a dead asset id). The
// bench login's active-brand preference is pinned to the bench brand and restored. The
// analysis the describer persists on a competitor post is kept on purpose: it is the
// product's own nightly output.
//
// Run: cd Continuum-Frontend && playwright test --config playwright.inspiration.config.ts --workers=1

const BENCH = 'inspiration:fe:e2e:bench';

const BENCH_BRAND_ID =
  process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4431);
const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3121';
const MIN_BASELINE_POSTS = 12;
const FEED_LIMIT = 50;
// Analysing a reel with no speech proves nothing about the transcript; try the next.
// Music-only reels are legitimate, so every reel on the bench brand may be tried.
const MAX_REELS_TO_ANALYSE = 6;
// Beside the Playwright output, outside the repo tree.
const SCREENSHOT_DIR = join(tmpdir(), 'inspiration-bench-results', 'screens');

/* -- the Recorder envelope ------------------------------------------------------
 * scripts/factory/bench.mjs reads the LAST stdout JSON line carrying `counts`. A bench
 * that exits 0 without one is `unreadable`. Same shape as the Backend _bench Recorder;
 * re-implemented because a Frontend file may not import Backend source.
 */
type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

function printEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- hosted guard + service-role reads ----------------------------------------- */

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (/127\.0\.0\.1|localhost/.test(url) || !key) {
    throw new Error(
      `[${BENCH}] Refusing to run against "${url}". This bench grades real tracked competitors, ` +
        'which exist only on hosted. Run it through playwright.inspiration.config.ts ' +
        '(`playwright test --config playwright.inspiration.config.ts --workers=1`).',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const db = admin();

/* -- run state ------------------------------------------------------------------- */

let backend: LocalBackend | null = null;
let accessToken = '';
let userId = '';
let previousBrand: string | null | undefined;
let assetIdsBefore = new Set<string>();
let groupIdsBefore = new Set<string>();
// Only what THIS run made. The inspiration-api bench writes to the same brand at the
// same time, so an asset is removed only when it is new AND belongs to a post this run
// saved; an id diff alone once deleted the other bench's asset mid-generation.
const residue = { draftIds: [] as string[], skillIds: [] as string[], postIds: [] as string[] };
let feed: CompetitorInspirationPost[] = [];
let relevanceFeed: CompetitorInspirationPost[] = [];
let analysedReel: CompetitorInspirationPost | null = null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status} ${text}`);
  return JSON.parse(text) as T;
}

type SavedAsset = {
  id: string;
  postId: string | null;
  groupId: string | null;
  bucket: string;
  storagePath: string;
};

async function savedInspirationAssets(): Promise<SavedAsset[]> {
  const { data, error } = await db
    .schema('media')
    .from('assets')
    .select('id, origin_ref, bucket, storage_path')
    .eq('brand_id', BENCH_BRAND_ID)
    .eq('source', 'inspiration');
  if (error) throw new Error(`[${BENCH}] media.assets snapshot failed: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      origin_ref: { postId?: string; groupId?: string } | null;
      bucket: string;
      storage_path: string;
    }>
  ).map((row) => ({
    id: row.id,
    postId: row.origin_ref?.postId ?? null,
    groupId: row.origin_ref?.groupId ?? null,
    bucket: row.bucket,
    storagePath: row.storage_path,
  }));
}

// library_internal is not PostgREST-exposed, so its receipts go through the Management
// API with the Supabase CLI's keychain token (or SUPABASE_ACCESS_TOKEN).
function managementToken(): string | null {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    return null;
  }
}

async function managementSql(query: string): Promise<string> {
  const token = managementToken();
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0];
  if (!token || !ref) return 'skipped: no Management API token';
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return response.ok
    ? 'deleted'
    : `failed ${response.status}: ${(await response.text()).slice(0, 200)}`;
}

async function pinBrand(): Promise<void> {
  const prefs = db.schema('brand_profiles').from('user_brand_preferences');
  const { data } = await prefs.select('active_brand_id').eq('user_id', userId).maybeSingle();
  previousBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
  const { error } = await prefs.upsert(
    { user_id: userId, active_brand_id: BENCH_BRAND_ID, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`[${BENCH}] brand pin failed: ${error.message}`);
}

async function openInspiration(browser: Browser): Promise<Page> {
  const bundle = await mintSessionBundleForEmail(BENCH_OWNER_EMAIL);
  const context = await browser.newContext({ storageState: bundle.state });
  const page = await context.newPage();
  await page.goto('/competitor-spy?tab=inspiration', { timeout: 180_000 });
  await expect(page.getByTestId('inspiration-tile').first()).toBeVisible({ timeout: 120_000 });
  return page;
}

async function tileIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('inspiration-grid')
    .first()
    .getByTestId('inspiration-tile')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-post-id') ?? ''));
}

function formatOutlier(score: number): string {
  return score >= 10 ? `${Math.round(score)}x` : `${score.toFixed(1)}x`;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

async function chip(page: Page, group: 'Post type' | 'Format', id: string): Promise<Locator> {
  return page.getByRole('group', { name: group }).locator(`button[data-chip="${id}"]`);
}

async function chipCount(button: Locator): Promise<number> {
  return Number((await button.locator('span').last().innerText()).trim());
}

/* -- the bench ------------------------------------------------------------------- */

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  // The Backend points at prod: no shared job queue may be drained from this process.
  process.env.MCP_JOB_WORKER_ENABLED = 'false';
  process.env.BRAND_REPORT_JOB_WORKER_ENABLED = 'false';
  process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP_ORIGIN,
    supabase: 'hosted',
    label: BENCH,
  });
  const bundle = await mintSessionBundleForEmail(BENCH_OWNER_EMAIL);
  accessToken = bundle.accessToken;
  userId = bundle.userId;
  await pinBrand();
  const before = await savedInspirationAssets();
  assetIdsBefore = new Set(before.map((asset) => asset.id));
  groupIdsBefore = new Set(before.flatMap((asset) => (asset.groupId ? [asset.groupId] : [])));
});

test.afterAll(async () => {
  const cleanup: string[] = [];
  for (const id of residue.draftIds) {
    const { error } = await db
      .schema('organic')
      .from('organic_calendar_drafts')
      .delete()
      .eq('id', id);
    cleanup.push(`draft ${id}: ${error ? error.message : 'deleted'}`);
  }
  for (const id of residue.skillIds) {
    const { error } = await db.schema('skills').from('skills').delete().eq('id', id);
    cleanup.push(`skill ${id}: ${error ? error.message : 'deleted'}`);
  }
  const created = (await savedInspirationAssets())
    .filter((asset) => !assetIdsBefore.has(asset.id))
    .filter((asset) => asset.postId !== null && residue.postIds.includes(asset.postId));
  if (created.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const asset of created) {
      byBucket.set(asset.bucket, [...(byBucket.get(asset.bucket) ?? []), asset.storagePath]);
    }
    for (const [bucket, paths] of byBucket) {
      const { error } = await db.storage.from(bucket).remove(paths);
      cleanup.push(`storage ${bucket} ×${paths.length}: ${error ? error.message : 'removed'}`);
    }
    const ids = created.map((asset) => asset.id);
    const { error } = await db.schema('media').from('assets').delete().in('id', ids);
    cleanup.push(`assets ${ids.join(',')}: ${error ? error.message : 'deleted'}`);
    // Registration is idempotent on bucket+path through a receipt that outlives the row;
    // a receipt left behind hands the next save of this post a dead asset id.
    if (ids.every((id) => /^[0-9a-f-]{36}$/.test(id))) {
      const receipts = await managementSql(
        `delete from library_internal.operation_receipts where brand_id = '${BENCH_BRAND_ID}' ` +
          `and action = 'register_generated_asset' and response->>'assetId' in (${ids.map((id) => `'${id}'`).join(',')})`,
      );
      cleanup.push(`register receipts: ${receipts}`);
    }
    const groups = [
      ...new Set(created.flatMap((asset) => (asset.groupId ? [asset.groupId] : []))),
    ].filter((id) => !groupIdsBefore.has(id));
    if (groups.length > 0) {
      const { error: groupError } = await db
        .schema('media')
        .from('asset_groups')
        .delete()
        .in('id', groups);
      cleanup.push(
        `asset_groups ${groups.join(',')}: ${groupError ? groupError.message : 'deleted'}`,
      );
    }
  }
  if (previousBrand) {
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: userId, active_brand_id: previousBrand, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
  }
  notes.push(...cleanup);
  await backend?.stop();
  printEnvelope();
});

test('1 · API: every scorable post carries engagement ÷ its account median over >= 12 posts', async () => {
  const body = await api<unknown>(
    `/api/competitor-ad-spy/instagram/posts?brandId=${BENCH_BRAND_ID}&limit=${FEED_LIMIT}&sort=outlier`,
  );
  feed = inspirationPostsResponseSchema.parse(body).items;
  grade('posts route parses as inspirationPostsResponseSchema', true, `${feed.length} posts`);
  expect(feed.length).toBeGreaterThan(0);

  const byCompetitor = new Map<string, CompetitorInspirationPost[]>();
  for (const item of feed) {
    const key = item.competitorId ?? item.instagramUsername;
    byCompetitor.set(key, [...(byCompetitor.get(key) ?? []), item]);
  }

  // "Median over at least 12 of that account's posts": an account with fewer scorable
  // posts has no baseline, and the contract says its posts carry null, not a number.
  let scored = 0;
  let belowBaseline = 0;
  const mismatches: string[] = [];
  for (const [competitorId] of byCompetitor) {
    const { data, error } = await db
      .schema('competitor_ad_spy')
      .from('organic_posts')
      .select('external_id, like_count, comments_count')
      .eq('competitor_id', competitorId);
    if (error) throw new Error(`organic_posts read failed: ${error.message}`);
    const rows = (data ?? []) as Array<{
      external_id: string;
      like_count: number | null;
      comments_count: number | null;
    }>;
    const scorable = rows.filter((row) => row.like_count !== null && row.comments_count !== null);
    const baseline =
      scorable.length >= MIN_BASELINE_POSTS
        ? median(scorable.map((row) => row.like_count! + row.comments_count!))
        : null;
    for (const item of byCompetitor.get(competitorId) ?? []) {
      const { likeCount, commentsCount, outlierScore } = item.post;
      if (baseline === null) {
        belowBaseline += 1;
        if (outlierScore !== null && outlierScore !== undefined) {
          mismatches.push(
            `${item.post.id}: scored ${outlierScore} with ${scorable.length} baseline posts`,
          );
        }
        continue;
      }
      if (typeof likeCount !== 'number' || typeof commentsCount !== 'number') continue;
      scored += 1;
      const expected = (likeCount + commentsCount) / baseline;
      if (typeof outlierScore !== 'number' || Math.abs(outlierScore - expected) > 1e-6) {
        mismatches.push(`${item.post.id}: ${outlierScore} != ${expected}`);
      }
    }
  }
  grade(
    'every scorable post of a >= 12-post account has outlierScore = engagement ÷ its median',
    scored > 0 && mismatches.length === 0,
    `${scored} scored across ${byCompetitor.size} account(s); ${belowBaseline} posts from accounts under 12 scorable posts carry null${mismatches.length ? `; ${mismatches.slice(0, 3).join('; ')}` : ''}`,
  );
  const scores = feed.map((item) => item.post.outlierScore ?? -1);
  const sorted = scores.every((score, index) => index === 0 || scores[index - 1]! >= score);
  grade('sort=outlier returns posts in descending multiplier order', sorted);

  const recent = inspirationPostsResponseSchema.parse(
    await api<unknown>(
      `/api/competitor-ad-spy/instagram/posts?brandId=${BENCH_BRAND_ID}&limit=${FEED_LIMIT}`,
    ),
  ).items;
  relevanceFeed = inspirationPostsResponseSchema.parse(
    await api<unknown>(
      `/api/competitor-ad-spy/instagram/posts?brandId=${BENCH_BRAND_ID}&limit=${FEED_LIMIT}&sort=relevance`,
    ),
  ).items;
  const unscored = relevanceFeed.filter((item) => item.relevance === null).length;
  const differs =
    relevanceFeed.map((item) => item.post.id).join(',') !==
    recent.map((item) => item.post.id).join(',');
  grade(
    'sort=relevance scores every post for the brand and differs from Recent',
    relevanceFeed.length > 0 && unscored === 0 && differs,
    `${relevanceFeed.length} posts, ${unscored} unscored, differs=${differs}`,
  );
  expect(mismatches).toEqual([]);
  expect(sorted).toBe(true);
});

test('2-4 · grid: multiplier, outlier sort, format labels, chips, reel metrics on the face', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const page = await openInspiration(browser);

  await page
    .getByRole('group', { name: 'Sort posts' })
    .getByRole('button', { name: 'Outlier' })
    .click();
  await expect
    .poll(async () => (await tileIds(page)).join(','), { timeout: 60_000 })
    .toBe(feed.map((item) => item.post.id).join(','));
  grade('Outlier sort renders the API order tile for tile', true, `${feed.length} tiles`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/grid-outlier.png` });

  const rendered = await page
    .getByTestId('inspiration-grid')
    .first()
    .getByTestId('inspiration-tile')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-post-id') ?? '',
        outlier: node.getAttribute('data-outlier') ?? '',
        format: node.getAttribute('data-format') ?? '',
        type: node.getAttribute('data-post-type') ?? '',
        badge: node.querySelector('[data-testid="outlier-badge"]')?.textContent?.trim() ?? null,
        label: node.querySelector('[data-testid="format-label"]')?.textContent?.trim() ?? '',
      })),
    );
  const byId = new Map(feed.map((item) => [item.post.id, item]));

  const badgeMisses = rendered.filter((tile) => {
    const score = byId.get(tile.id)?.post.outlierScore;
    return typeof score === 'number' ? tile.badge !== formatOutlier(score) : tile.badge !== null;
  });
  grade(
    'every scored tile shows its multiplier badge',
    badgeMisses.length === 0,
    badgeMisses.length
      ? badgeMisses
          .slice(0, 3)
          .map((t) => `${t.id}:${t.badge}`)
          .join(', ')
      : undefined,
  );
  const renderedScores = rendered.map((tile) => (tile.outlier === '' ? -1 : Number(tile.outlier)));
  grade(
    'tiles are ordered by multiplier',
    renderedScores.every((score, index) => index === 0 || renderedScores[index - 1]! >= score),
  );

  const formatMisses = rendered.filter((tile) => {
    const parsed = competitorPostFormatSchema.safeParse(tile.format);
    return !parsed.success || tile.label !== COMPETITOR_POST_FORMAT_LABELS[parsed.data];
  });
  grade(
    'every tile carries a format label from the enum',
    formatMisses.length === 0,
    `${rendered.length} tiles, formats: ${[...new Set(rendered.map((t) => t.format))].join(', ')}`,
  );

  await page
    .getByRole('group', { name: 'Sort posts' })
    .getByRole('button', { name: 'For your brand' })
    .click();
  await expect
    .poll(async () => (await tileIds(page)).join(','), { timeout: 60_000 })
    .toBe(relevanceFeed.map((item) => item.post.id).join(','));
  grade("'For your brand' renders the relevance order tile for tile", true);
  await page
    .getByRole('group', { name: 'Sort posts' })
    .getByRole('button', { name: 'Outlier' })
    .click();
  await expect
    .poll(async () => (await tileIds(page)).join(','), { timeout: 60_000 })
    .toBe(feed.map((item) => item.post.id).join(','));

  // Post-type chips: every type present, each must leave only its own tiles.
  const types = [...new Set(rendered.map((tile) => tile.type))];
  for (const type of types) {
    const button = await chip(page, 'Post type', type);
    const expected = await chipCount(button);
    await button.click();
    const shown = await page
      .getByTestId('inspiration-grid')
      .first()
      .getByTestId('inspiration-tile')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-post-type')));
    grade(
      `post-type chip "${type}" leaves only ${type} tiles`,
      shown.length === expected && shown.every((value) => value === type),
      `${shown.length} shown, chip says ${expected}`,
    );
    await (await chip(page, 'Post type', 'all')).click();
  }

  const formats = [...new Set(rendered.map((tile) => tile.format))];
  for (const format of formats) {
    const button = await chip(page, 'Format', format);
    const expected = await chipCount(button);
    await button.click();
    const shown = await page
      .getByTestId('inspiration-grid')
      .first()
      .getByTestId('inspiration-tile')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-format')));
    grade(
      `format chip "${format}" leaves only ${format} tiles`,
      shown.length === expected && shown.every((value) => value === format),
      `${shown.length} shown, chip says ${expected}`,
    );
    await (await chip(page, 'Format', 'all')).click();
  }

  // Reel metrics, read off the face with the pointer parked away from every tile.
  await page.mouse.move(0, 0);
  const reels = feed.filter((item) => item.post.kind === 'reel');
  const metricMisses: string[] = [];
  const hidden: string[] = [];
  let fullyCounted = 0;
  for (const reel of reels) {
    const tile = page
      .locator(`[data-testid="inspiration-tile"][data-post-id="${reel.post.id}"]`)
      .first();
    let allNumbers = true;
    for (const [unit, value] of [
      ['views', reel.post.viewCount],
      ['likes', reel.post.likeCount],
      ['comments', reel.post.commentsCount],
    ] as const) {
      const metric = tile.locator(`[data-metric="${unit}"]`);
      const visible = await metric.isVisible();
      const shown = await metric.getAttribute('data-value');
      // Instagram lets owners hide counts per post and returns no view_count for some
      // videos; the face must then say so ('–'), never invent a number.
      const expected = typeof value === 'number' ? String(value) : '';
      if (!visible || shown !== expected) {
        metricMisses.push(
          `${reel.post.id} ${unit}: visible=${visible} shown=${shown} api=${value}`,
        );
      }
      if (typeof value !== 'number') {
        allNumbers = false;
        hidden.push(`@${reel.instagramUsername} ${reel.post.id} ${unit}`);
      }
    }
    if (allNumbers) fullyCounted += 1;
  }
  grade(
    'every reel tile shows its views, likes and comments on the face, equal to the API',
    reels.length > 0 && metricMisses.length === 0,
    reels.length === 0
      ? 'no reels in the feed'
      : `${reels.length} reels${metricMisses.length ? `; ${metricMisses.slice(0, 3).join('; ')}` : ''}`,
  );
  grade(
    'real reels show views, likes and comments as numbers without hover',
    fullyCounted > 0,
    `${fullyCounted}/${reels.length} reels fully counted`,
  );
  if (hidden.length > 0) {
    notes.push(`metrics the source does not expose (tile shows '–'): ${hidden.join(', ')}`);
  }

  await page.context().close();
  expect(graded.filter((g) => g.grade === 'FAIL')).toEqual([]);
});

test('5 · Analyse panel: transcript, hook, scene beats and the Idea tab from a real reel', async ({
  browser,
}) => {
  test.setTimeout(1_500_000);
  const page = await openInspiration(browser);
  const reels = feed.filter((item) => item.post.kind === 'reel');
  expect(reels.length, 'the bench brand needs a tracked competitor with reels').toBeGreaterThan(0);

  // Prefer a reel the describer already read with speech; else analyse up to N reels.
  const ordered = [
    ...reels.filter((reel) => (reel.analysis?.video?.transcript ?? '').trim().length > 0),
    ...reels.filter((reel) => (reel.analysis?.video?.transcript ?? '').trim().length === 0),
  ].slice(0, MAX_REELS_TO_ANALYSE);

  for (const reel of ordered) {
    const tile = page
      .locator(`[data-testid="inspiration-tile"][data-post-id="${reel.post.id}"]`)
      .first();
    await tile.scrollIntoViewIfNeeded();
    await tile.getByRole('button', { name: /^Analyse / }).click();
    const panel = page.getByTestId('inspiration-analyse-panel');
    await expect(panel).toBeVisible();

    const analyseButton = panel.getByRole('button', { name: /^(Analyse|Try again)$/ });
    if (await analyseButton.isVisible()) {
      await analyseButton.click();
      await expect(panel.getByRole('tab', { name: 'Transcript' })).toBeVisible({
        timeout: 300_000,
      });
    }

    await panel.getByRole('tab', { name: 'Transcript' }).click();
    const transcript = panel.getByTestId('analysis-transcript');
    const hasSpeech =
      (await transcript.count()) > 0 && (await transcript.innerText()).trim().length > 0;
    if (!hasSpeech) {
      notes.push(`reel ${reel.post.id} has no speech; tried the next reel`);
      await page.keyboard.press('Escape');
      continue;
    }
    grade(
      'transcript is non-empty in the rendered panel',
      true,
      `${(await transcript.innerText()).trim().slice(0, 60)}…`,
    );

    await panel.getByRole('tab', { name: 'Hook' }).click();
    const hook = (await panel.getByTestId('analysis-hook').first().innerText()).trim();
    grade('hook is non-empty', hook.length > 0, hook.slice(0, 60));

    await panel.getByRole('tab', { name: 'Visuals' }).click();
    const beats = await panel.getByTestId('analysis-beats').locator('li').count();
    grade('scene beats render', beats > 0, `${beats} beats`);

    await panel.getByRole('tab', { name: 'Idea' }).click();
    const seed = (await panel.getByTestId('idea-seed').innerText()).trim();
    const contrarian = (await panel.getByTestId('idea-contrarian-reality').innerText()).trim();
    const evidence = await panel.getByTestId('idea-supporting-evidence').locator('li').count();
    grade('Idea tab: ideaSeed', seed.length > 0, seed.slice(0, 60));
    grade('Idea tab: contrarianReality', contrarian.length > 0, contrarian.slice(0, 60));
    grade('Idea tab: supportingEvidence', evidence > 0, `${evidence} item(s)`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/analyse-idea.png` });

    analysedReel = reel;
    break;
  }
  grade(
    'a real competitor reel was analysed with speech',
    analysedReel !== null,
    analysedReel
      ? `@${analysedReel.instagramUsername} ${analysedReel.post.permalink}`
      : `tried ${ordered.length}`,
  );
  expect(analysedReel).not.toBeNull();

  /* 6 · Develop into draft — the panel is still open on the analysed reel. */
  const panel = page.getByTestId('inspiration-analyse-panel');
  residue.postIds.push(analysedReel!.post.id);
  await panel.getByRole('button', { name: 'Develop into draft' }).click();
  await panel
    .getByLabel(/What should your version say/)
    .fill('Same hook, about our rooftop and river views');
  await panel.getByRole('button', { name: 'Create draft' }).click();
  const draftLink = panel.getByTestId('develop-draft-link');
  const developError = panel.locator('form p.text-destructive');
  await expect(draftLink.or(developError)).toBeVisible({ timeout: 180_000 });
  if (await developError.isVisible()) {
    grade(
      'Develop into draft yields a real organic_calendar_drafts row',
      false,
      (await developError.innerText()).trim(),
    );
  } else {
    const draftId = (await draftLink.getAttribute('data-draft-id')) ?? '';
    residue.draftIds.push(draftId);
    const { data: draft } = await db
      .schema('organic')
      .from('organic_calendar_drafts')
      .select('id, brand_id, status, content_json, slot_data')
      .eq('id', draftId)
      .maybeSingle();
    const row = draft as {
      brand_id: string;
      status: string;
      content_json: unknown;
      slot_data: unknown;
    } | null;
    grade(
      'Develop into draft yields a real organic_calendar_drafts row',
      row?.brand_id === BENCH_BRAND_ID && row.status === 'draft',
      `draft ${draftId} status=${row?.status}`,
    );
    const persisted = JSON.stringify([row?.content_json, row?.slot_data]);
    grade(
      'the draft row names the source post',
      persisted.includes(analysedReel!.post.permalink) ||
        persisted.includes(analysedReel!.post.shortcode),
    );
  }

  /* 7 · Save as template */
  await panel.getByRole('button', { name: 'Save as template' }).click();
  const saved = panel.getByTestId('template-saved');
  await expect(saved).toBeVisible({ timeout: 120_000 });
  const skillId = (await saved.getAttribute('data-skill-id')) ?? '';
  residue.skillIds.push(skillId);
  const { data: skill } = await db
    .schema('skills')
    .from('skills')
    .select('id, brand_id, tags, directives')
    .eq('id', skillId)
    .maybeSingle();
  const skillRow = skill as { brand_id: string; tags: string[] | null; directives: string } | null;
  grade(
    'Save as template yields a skills row tagged with the source post',
    skillRow?.brand_id === BENCH_BRAND_ID &&
      (skillRow.tags ?? []).includes(
        `${INSPIRATION_SOURCE_POST_TAG_PREFIX}${analysedReel!.post.id}`,
      ) &&
      skillRow.directives.trim().length > 0,
    `skill ${skillId} tags=${(skillRow?.tags ?? []).join('|')}`,
  );

  await page.context().close();
  expect(graded.filter((g) => g.grade === 'FAIL')).toEqual([]);
});

test('8 · Saved view: a pasted post URL is saved and survives a reload', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await openInspiration(browser);
  // Paste a carousel: the inspiration-api bench owns the top single-image post and an
  // untracked photo, and this bench owns the reels, so the two never share a post id.
  const target = feed.find((item) => item.post.kind === 'carousel');
  expect(target, 'the bench brand needs a tracked carousel to paste').toBeDefined();
  residue.postIds.push(target!.post.id);

  await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'Saved' }).click();
  await page.getByLabel('Instagram post URL').fill(target!.post.permalink);
  const started = Date.now();
  await page.getByRole('button', { name: 'Save post' }).click();
  const outcome = page.getByTestId('save-url-result').or(page.getByTestId('save-url-error'));
  await expect(outcome).toBeVisible({ timeout: 180_000 });
  const saveError = page.getByTestId('save-url-error');
  if (await saveError.isVisible()) {
    grade('paste-a-URL save succeeds', false, (await saveError.innerText()).trim());
    throw new Error(`save-url failed: ${await saveError.innerText()}`);
  }
  grade(
    'paste-a-URL save succeeds',
    true,
    `${(await page.getByTestId('save-url-result').innerText()).trim()} in ${Date.now() - started}ms`,
  );

  await page.reload();
  await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'Saved' }).click();
  const savedTile = page.locator(
    `[data-testid="inspiration-tile"][data-post-id="${target!.post.id}"]`,
  );
  await expect(savedTile.first()).toBeVisible({ timeout: 60_000 });
  grade('pasted URL appears in the Saved view after a reload', true, target!.post.permalink);

  const { data } = await db
    .schema('media')
    .from('assets')
    .select('id, origin_ref')
    .eq('brand_id', BENCH_BRAND_ID)
    .eq('source', 'inspiration')
    .eq('origin_ref->>postId', target!.post.id);
  const snapshot = (
    data?.[0] as { origin_ref?: { snapshot?: { capturedAt?: string } } } | undefined
  )?.origin_ref?.snapshot;
  grade(
    'saved asset carries a metrics snapshot',
    typeof snapshot?.capturedAt === 'string',
    snapshot ? JSON.stringify(snapshot) : 'no snapshot on origin_ref',
  );
  notes.push(
    `pasted URL belongs to a TRACKED competitor (@${target!.instagramUsername}); an untracked account's URL is not exercised here`,
  );

  await page.context().close();
  expect(graded.filter((g) => g.grade === 'FAIL')).toEqual([]);
});
