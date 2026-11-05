/**
 * media:delivery:bench — what each page downloads in images and video, and whether it needed to.
 *
 * Real Chrome at DPR 2, signed in as duane@continuumai.agency on real data — StarCraft (the Forge
 * bench brand) and La Chica de la IA (a live organic brand) — against a bench-owned Backend (hosted
 * Supabase, workers off) and its own Next app. Nothing is written except the session's brand pin.
 *
 * Every case loads a page in a fresh browser cache, waits for the network to go quiet, then reads
 * the DOM: each image/video byte is matched to the element that shows it, its on-screen box and its
 * pixels. The page is then opened again in the same cache — what a person coming back pays.
 *
 * Claims per case (binary; the case score is the weighted share of the claims that apply):
 *   C1 right-size   no shown image over 30 KB carries more than 2x the pixels its box needs at DPR 2
 *   C2 when-needed  no image over 10 KB is fetched for something hidden, far offscreen, absent from
 *                   the page, or already downloaded under another URL token
 *   C3 video-on-play  at most 256 KB of video arrives before anyone presses play
 *   C4 cache-stable a revisit downloads at most 20% of the first visit's media bytes
 *   C5 not-broken   no shown image fails, no media request errors
 *   C6 sharp        no shown derived still (thumbnail, poster, resize) over 64 px is drawn from
 *                   fewer pixels than its CSS box (DPR 1)
 *
 * Speed: every visit also records how long the screen takes to fill — from navigation (or the
 * tab click) to the last on-screen image or video still finishing — and LCP. `--throttle fast4g`
 * (9 Mbps, 60 ms) or `slow4g` (1.6 Mbps, 150 ms) makes that a real network; run it against a
 * production build (`--build`, then `--serve` with MEDIA_BENCH_PROD=1), not the dev server.
 *
 * Run: `bun run media:delivery:bench -- --label baseline-a` (Frontend). `--serve` starts the
 * Backend and app and keeps them up; `MEDIA_BENCH_APP=http://127.0.0.1:3147` reuses them.
 * Flags: --repeats N (default 2) · --cases a,b · --no-warm · --headed · --throttle fast4g|slow4g.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { type CDPSession, chromium, type Page } from 'playwright';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { benchBrowserChannel, loadProdSupabaseEnv } from './support/prodEnv';

const BENCH = 'media:delivery:bench';
const BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = 'duane@continuumai.agency';
const APP_PORT = Number(process.env.MEDIA_BENCH_APP_PORT ?? 3147);
const BACKEND_PORT = Number(process.env.MEDIA_BENCH_BACKEND_PORT ?? 4447);
const FRONTEND_DIR = process.cwd();
const OUT_ROOT =
  process.env.MEDIA_BENCH_OUT ?? path.resolve(FRONTEND_DIR, '../artifacts/hillclimb/media-delivery');
const VIEWPORT = { width: 1440, height: 900 };
const DPR = 2;
// Chrome's native lazy-load distance on a fast connection: an image this far out may load early.
const LAZY_MARGIN = 1250;
const QUIET_MS = 2_500;
const SETTLE_TIMEOUT_MS = 45_000;
const SPLIT_SEED = 20261105;
const THROTTLE = {
  fast4g: { latency: 60, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 },
  slow4g: { latency: 150, downloadThroughput: (1_600_000 / 8) * 0.9, uploadThroughput: (750_000 / 8) * 0.9 },
} as const;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const { url: SUPABASE_URL, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
const APP = process.env.MEDIA_BENCH_APP ?? `http://127.0.0.1:${APP_PORT}`;
process.env.PLAYWRIGHT_BASE_URL = APP;
process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
const admin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Case = {
  id: string;
  brand: string;
  path: string;
  act?: (page: Page) => Promise<void>;
  /** What must be on the page before it is measured; a page that never gets there is infra. */
  ready?: (page: Page) => Promise<unknown>;
};

const STARCRAFT = BRAND_ID; // the Forge bench brand
const LA_CHICA = '46f0deba-013f-4bd9-a70e-2526677a831d'; // live organic brand: posts, drafts, library

const clickTab = (name: RegExp) => async (page: Page) => {
  await page.getByRole('tab', { name }).first().click({ timeout: 60_000 });
};

async function oldestAsset(brand: string, kind: 'image' | 'video'): Promise<string | null> {
  const { data } = await admin
    .schema('media')
    .from('assets')
    .select('id')
    .eq('brand_id', brand)
    .eq('kind', kind)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function buildCases(): Promise<Case[]> {
  const [image, video] = await Promise.all([
    oldestAsset(STARCRAFT, 'image'),
    oldestAsset(STARCRAFT, 'video'),
  ]);
  const cases: Case[] = [
    { id: 'forge-templates', brand: STARCRAFT, path: '/forge' },
    { id: 'forge-ledger', brand: STARCRAFT, path: '/forge', act: clickTab(/^Render ledger/) },
    {
      id: 'lc-organic-posts',
      brand: LA_CHICA,
      path: '/organic?tab=metrics',
      act: async (page) => {
        await page.getByText('Post performance', { exact: true }).first().click({ timeout: 60_000 });
      },
      ready: (page) =>
        page.waitForFunction(
          () => document.querySelectorAll('video, img[src*="cdninstagram"], img[src*="fbcdn"]').length > 0,
          null,
          { timeout: 90_000 },
        ),
    },
    { id: 'lc-organic-explore', brand: LA_CHICA, path: '/organic?tab=explore' },
    { id: 'lc-library-grid', brand: LA_CHICA, path: '/library' },
    { id: 'lc-library-images', brand: LA_CHICA, path: '/library?mediaType=image' },
    { id: 'lc-library-videos', brand: LA_CHICA, path: '/library?mediaType=video' },
    { id: 'lc-competitor-spy', brand: LA_CHICA, path: '/competitor-spy' },
    { id: 'lc-ai-studio', brand: LA_CHICA, path: '/ai-studio' },
  ];
  if (image)
    cases.push({ id: 'sc-library-image', brand: STARCRAFT, path: `/library?assetId=${image}` });
  if (video)
    cases.push({ id: 'sc-library-video', brand: STARCRAFT, path: `/library?assetId=${video}` });
  return cases;
}

// mulberry32: the split is a function of the case ids and the seed, never of a run.
function splitOf(ids: string[]): Record<string, 'train' | 'test'> {
  let a = SPLIT_SEED >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...ids].sort();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const trainCount = Math.round((shuffled.length * 2) / 3);
  return Object.fromEntries(shuffled.map((id, i) => [id, i < trainCount ? 'train' : 'test']));
}

// ── network ──────────────────────────────────────────────────────────────────────────────────

type Req = {
  url: string;
  type: string;
  mime?: string;
  status?: number;
  cached: boolean;
  data: number;
  encoded?: number;
  failed?: string;
  canceled?: boolean;
  start: number;
  end?: number;
  cacheControl?: string;
};

function recordNetwork(cdp: CDPSession) {
  const reqs = new Map<string, Req>();
  cdp.on('Network.requestWillBeSent', (event) => {
    const existing = reqs.get(event.requestId);
    if (existing) existing.url = event.request.url; // a redirect keeps its request id
    else
      reqs.set(event.requestId, {
        url: event.request.url,
        type: event.type ?? 'Other',
        cached: false,
        data: 0,
        start: Date.now(),
      });
  });
  cdp.on('Network.responseReceived', (event) => {
    const req = reqs.get(event.requestId);
    if (!req) return;
    req.mime = event.response.mimeType;
    req.status = event.response.status;
    req.type = event.type ?? req.type;
    if (event.response.fromDiskCache || event.response.fromServiceWorker) req.cached = true;
    const headers = event.response.headers as Record<string, string>;
    req.cacheControl = Object.entries(headers).find(([k]) => k.toLowerCase() === 'cache-control')?.[1];
  });
  cdp.on('Network.requestServedFromCache', (event) => {
    const req = reqs.get(event.requestId);
    if (req) req.cached = true;
  });
  cdp.on('Network.dataReceived', (event) => {
    const req = reqs.get(event.requestId);
    if (req) req.data += event.encodedDataLength;
  });
  cdp.on('Network.loadingFinished', (event) => {
    const req = reqs.get(event.requestId);
    if (!req) return;
    req.encoded = event.encodedDataLength;
    req.end = Date.now();
  });
  cdp.on('Network.loadingFailed', (event) => {
    const req = reqs.get(event.requestId);
    if (!req) return;
    req.failed = event.errorText;
    req.canceled = event.canceled;
    req.end = Date.now();
  });
  return reqs;
}

const LONG_LIVED = new Set(['EventSource', 'WebSocket', 'Ping', 'Manifest']);

async function settle(reqs: Map<string, Req>) {
  const started = Date.now();
  let quietSince = Date.now();
  while (Date.now() - started < SETTLE_TIMEOUT_MS) {
    const now = Date.now();
    // A URL asked for a third time is a poll, and a poll never goes quiet.
    const asked = new Map<string, number>();
    for (const r of reqs.values()) asked.set(r.url, (asked.get(r.url) ?? 0) + 1);
    const busy = [...reqs.values()].some(
      (r) =>
        r.end === undefined &&
        !LONG_LIVED.has(r.type) &&
        now - r.start < 20_000 &&
        (asked.get(r.url) ?? 0) < 3,
    );
    if (busy) quietSince = now;
    else if (now - quietSince >= QUIET_MS) return now - started;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const recent = [...reqs.values()].filter((r) => Date.now() - r.start < QUIET_MS * 2);
  console.log(`  · settle timed out; recent: ${recent.map((r) => shortUrl(r.url)).slice(0, 5).join(' ')}`);
  return SETTLE_TIMEOUT_MS;
}

const bytesOf = (r: Req) => (r.cached ? 0 : Math.max(r.encoded ?? 0, r.data));
const isMediaUrl = (url: string) => !url.startsWith('data:') && !url.startsWith('blob:');
const isImage = (r: Req) =>
  isMediaUrl(r.url) && (r.type === 'Image' || (r.mime ?? '').startsWith('image/'));
const isVideo = (r: Req) =>
  isMediaUrl(r.url) && (r.type === 'Media' || (r.mime ?? '').startsWith('video/'));
const keyOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
};
// Storage URLs carry a token; the evidence keeps the path, never the token.
const shortUrl = (url: string) => keyOf(url).replace(/^https?:\/\/[^/]+/, '').slice(-110);

// ── DOM ──────────────────────────────────────────────────────────────────────────────────────

type Box = {
  src: string;
  w: number;
  h: number;
  y: number;
  hidden: boolean;
  near: boolean;
  fit: string;
};
type ImgBox = Box & { nw: number; nh: number; complete: boolean; loading: string };
type VideoBox = Box & { poster: string; preload: string; autoplay: boolean };
type Snapshot = { images: ImgBox[]; videos: VideoBox[]; backgrounds: Box[] };

async function snapshotDom(page: Page): Promise<Snapshot> {
  return page.evaluate((margin) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const geom = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hidden =
        r.width < 1 ||
        r.height < 1 ||
        cs.visibility === 'hidden' ||
        !(el as HTMLElement).checkVisibility?.({ visibilityProperty: true });
      const near =
        !hidden &&
        r.bottom > -margin &&
        r.top < vh + margin &&
        r.right > -margin &&
        r.left < vw + margin;
      return { w: r.width, h: r.height, y: r.top, hidden, near, fit: cs.objectFit };
    };
    const abs = (src: string) => (src ? new URL(src, location.href).href : '');
    const images = [...document.images].map((img) => ({
      src: abs(img.currentSrc || img.src),
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      complete: img.complete,
      loading: img.loading,
      ...geom(img),
    }));
    const videos = [...document.querySelectorAll('video')].map((v) => ({
      src: abs(v.currentSrc || v.src),
      poster: abs(v.poster),
      preload: v.preload,
      autoplay: v.autoplay,
      ...geom(v),
      fit: getComputedStyle(v).objectFit || 'contain',
    }));
    // The tab icon is shown, at 32 CSS px, without being in the layout.
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
      images.push({
        src: abs(link.href),
        nw: 0,
        nh: 0,
        complete: true,
        loading: 'icon',
        w: 32,
        h: 32,
        y: 0,
        hidden: false,
        near: true,
        fit: 'contain',
      });
    }
    const backgrounds: ReturnType<typeof geom>[] & { src: string }[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundImage;
      if (!bg || !bg.includes('url(')) continue;
      for (const match of bg.matchAll(/url\("?(.*?)"?\)/g)) {
        const size = cs.backgroundSize;
        backgrounds.push({
          src: abs(match[1] ?? ''),
          ...geom(el),
          fit: size.includes('cover') ? 'cover' : size.includes('contain') ? 'contain' : 'fill',
        });
      }
    }
    return { images, videos, backgrounds };
  }, LAZY_MARGIN);
}

// Natural pixel size of the stills a background or a poster draws (the browser has them cached).
async function naturalSizes(page: Page, urls: string[]): Promise<Map<string, [number, number]>> {
  const pairs = await page.evaluate(
    (list) =>
      Promise.all(
        list.map(
          (src) =>
            new Promise<[string, number, number]>((resolve) => {
              const probe = new Image();
              probe.onload = () => resolve([src, probe.naturalWidth, probe.naturalHeight]);
              probe.onerror = () => resolve([src, 0, 0]);
              probe.src = src;
            }),
        ),
      ),
    urls,
  );
  return new Map(pairs.map(([src, w, h]) => [src, [w, h]]));
}

// CSS px of box per natural px of source, for the way the element fits it.
function scaleOf(box: { w: number; h: number; fit: string }, nw: number, nh: number) {
  if (box.fit === 'cover') return Math.max(box.w / nw, box.h / nh);
  if (box.fit === 'contain') return Math.min(box.w / nw, box.h / nh);
  if (box.fit === 'scale-down') return Math.min(1, box.w / nw, box.h / nh);
  if (box.fit === 'none') return 1;
  return Math.sqrt((box.w * box.h) / (nw * nh));
}

// ── speed ────────────────────────────────────────────────────────────────────────────────────

// Installed before any page script: keep every resource timing (dev pages load hundreds of
// chunks; the default buffer of 250 would drop the images) and the latest LCP candidate.
const SPEED_INIT = () => {
  performance.setResourceTimingBufferSize(10_000);
  const w = window as unknown as { __lcp?: number };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) w.__lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
};

// The screen is ready when the last image or still drawn on it has arrived: the latest
// responseEnd among resources whose URL an on-screen <img>, poster or background shows.
async function readSpeed(page: Page, from: number) {
  return page.evaluate((since) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const onScreen = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    };
    const abs = (src: string) => (src ? new URL(src, location.href).href : '');
    const shown = new Set<string>();
    for (const img of document.images)
      if (img.complete && img.naturalWidth > 0 && onScreen(img)) shown.add(abs(img.currentSrc || img.src));
    for (const video of document.querySelectorAll('video'))
      if (video.poster && onScreen(video)) shown.add(abs(video.poster));
    for (const el of document.querySelectorAll('body *')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg.includes('url(') && onScreen(el))
        for (const m of bg.matchAll(/url\("?(.*?)"?\)/g)) shown.add(abs(m[1] ?? ''));
    }
    let ready = 0;
    let last = '';
    let lastStart = 0;
    for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      if (shown.has(entry.name) && entry.responseEnd > ready) {
        ready = entry.responseEnd;
        last = new URL(entry.name).pathname.slice(-80);
        lastStart = entry.startTime;
      }
    const lcp = (window as unknown as { __lcp?: number }).__lcp;
    return {
      screenReadyMs: ready > 0 ? Math.round(Math.max(0, ready - since)) : null,
      // Which still finished last, and when it was asked for: what to make faster.
      lastStill: last ? `${last} (asked at ${Math.round(lastStart - since)} ms)` : null,
      lcpMs: typeof lcp === 'number' ? Math.round(Math.max(0, lcp - since)) : null,
    };
  }, from);
}

// ── one visit ────────────────────────────────────────────────────────────────────────────────

type Shown = {
  url: string;
  bytes: number;
  box: string;
  natural: string;
  over: number;
  perCssPx: number;
};
type Visit = {
  settleMs: number;
  /** Navigation (or the tab click) to the last on-screen image or still finishing, in ms. */
  screenReadyMs: number | null;
  /** Largest Contentful Paint, from navigation (or the tab click), in ms. */
  lcpMs: number | null;
  lastStill: string | null;
  imageBytes: number;
  videoBytes: number;
  imageRequests: number;
  shown: Shown[];
  unneeded: { url: string; bytes: number; why: string }[];
  broken: { url: string; why: string }[];
  videos: { url: string; bytes: number }[];
  videoElements: { preload: string; poster: boolean; autoplay: boolean }[];
  cacheControl: string[];
};

async function measure(page: Page, cdp: CDPSession, kase: Case, withDom: boolean): Promise<Visit> {
  await cdp.send('Network.enable');
  const throttle = option('throttle') as keyof typeof THROTTLE | undefined;
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...THROTTLE[throttle] });
  }
  const reqs = recordNetwork(cdp);
  await page.goto(`${APP}${kase.path}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await settle(reqs);
  let from = 0;
  if (kase.act) {
    from = await page.evaluate(() => performance.now());
    await kase.act(page);
  }
  await kase.ready?.(page);
  const settleMs = await settle(reqs);
  await page.waitForTimeout(500);
  const speed = await readSpeed(page, from);
  // Freeze the record before probing natural sizes: the probes are the bench's, not the page's.
  const frozen = [...reqs.values()].map((r) => ({ ...r }));
  await cdp.send('Network.disable');

  const images = frozen.filter(isImage);
  const videos = frozen.filter((r) => isVideo(r) && !isImage(r));
  const visit: Visit = {
    settleMs,
    ...speed,
    imageBytes: images.reduce((sum, r) => sum + bytesOf(r), 0),
    videoBytes: videos.reduce((sum, r) => sum + bytesOf(r), 0),
    imageRequests: images.filter((r) => bytesOf(r) > 0).length,
    shown: [],
    unneeded: [],
    broken: [],
    videos: videos
      .filter((r) => bytesOf(r) > 0)
      .map((r) => ({ url: shortUrl(r.url), bytes: bytesOf(r) })),
    videoElements: [],
    cacheControl: [...new Set(images.map((r) => r.cacheControl ?? '∅'))],
  };
  for (const r of [...images, ...videos]) {
    if ((r.status ?? 0) >= 400 || (r.failed && !r.canceled))
      visit.broken.push({ url: shortUrl(r.url), why: r.failed ?? `HTTP ${r.status}` });
  }
  if (!withDom) return visit;

  const dom = await snapshotDom(page);
  visit.videoElements = dom.videos.map((v) => ({
    preload: v.preload,
    poster: Boolean(v.poster),
    autoplay: v.autoplay,
  }));
  const probeUrls = [
    ...new Set([
      ...dom.backgrounds.filter((b) => !b.hidden).map((b) => b.src),
      ...dom.videos.filter((v) => v.poster && !v.hidden).map((v) => v.poster),
      ...dom.images.filter((i) => i.loading === 'icon').map((i) => i.src),
    ]),
  ];
  const natural = await naturalSizes(page, probeUrls);

  type User = { box: Box; nw: number; nh: number };
  const usersOf = (url: string): User[] => [
    ...dom.images
      .filter((i) => i.src === url)
      .map((i) => ({
        box: i,
        nw: i.nw || (natural.get(url)?.[0] ?? 0),
        nh: i.nh || (natural.get(url)?.[1] ?? 0),
      })),
    ...dom.backgrounds
      .filter((b) => b.src === url)
      .map((b) => ({ box: b, nw: natural.get(url)?.[0] ?? 0, nh: natural.get(url)?.[1] ?? 0 })),
    ...dom.videos
      .filter((v) => v.poster === url)
      .map((v) => ({ box: v, nw: natural.get(url)?.[0] ?? 0, nh: natural.get(url)?.[1] ?? 0 })),
  ];

  const seenKeys = new Set<string>();
  for (const r of images) {
    const bytes = bytesOf(r);
    if (bytes === 0) continue;
    const key = keyOf(r.url);
    const duplicate = seenKeys.has(key);
    seenKeys.add(key);
    const users = usersOf(r.url);
    const visible = users.filter((u) => !u.box.hidden && u.box.near);
    if (duplicate) {
      visit.unneeded.push({ url: shortUrl(r.url), bytes, why: 'same object downloaded again' });
      continue;
    }
    if (users.length === 0) {
      visit.unneeded.push({ url: shortUrl(r.url), bytes, why: 'not on the page' });
      continue;
    }
    if (visible.length === 0) {
      const hidden = users.every((u) => u.box.hidden);
      visit.unneeded.push({
        url: shortUrl(r.url),
        bytes,
        why: hidden ? 'hidden' : `offscreen (y=${Math.round(users[0]!.box.y)})`,
      });
      continue;
    }
    // The largest box decides how many pixels the image needs.
    const user = visible.reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a));
    if (user.nw === 0 || user.nh === 0) continue;
    const scale = scaleOf(user.box, user.nw, user.nh);
    visit.shown.push({
      url: shortUrl(r.url),
      bytes,
      box: `${Math.round(user.box.w)}x${Math.round(user.box.h)} ${user.box.fit}`,
      natural: `${user.nw}x${user.nh}`,
      over: 1 / (scale * DPR),
      perCssPx: 1 / scale,
    });
  }
  for (const img of dom.images) {
    if (img.src && img.complete && img.nw === 0 && img.loading !== 'icon' && !img.hidden && img.near)
      visit.broken.push({ url: shortUrl(img.src), why: 'shown image failed to decode' });
  }
  return visit;
}

// ── claims ───────────────────────────────────────────────────────────────────────────────────

type Claim = { id: string; weight: number; applies: boolean; pass: boolean; evidence: string };

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

function grade(first: Visit, revisit: Visit): Claim[] {
  const oversized = first.shown.filter((s) => s.bytes > 30_000 && s.over > 2);
  const unneeded = first.unneeded.filter((u) => u.bytes > 10_000);
  // Only a rung the app chose can be too small: a resized or derived still, never an original.
  const blurry = first.shown.filter(
    (s) =>
      s.perCssPx < 1 &&
      Number(s.box.split('x')[0]) > 64 &&
      /\/render\/image\/|thumb|poster|preview|proxy/i.test(s.url),
  );
  const firstMedia = first.imageBytes + first.videoBytes;
  const revisitMedia = revisit.imageBytes + revisit.videoBytes;
  const list = <T>(xs: T[], fmt: (x: T) => string) =>
    xs
      .slice(0, 6)
      .map(fmt)
      .join(' · ') + (xs.length > 6 ? ` · +${xs.length - 6} more` : '');
  return [
    {
      id: 'C1',
      weight: 2,
      applies: first.shown.length > 0,
      pass: oversized.length === 0,
      evidence: list(
        oversized,
        (s) => `${s.url} ${kb(s.bytes)} ${s.natural} in ${s.box} = ${s.over.toFixed(1)}x`,
      ),
    },
    {
      id: 'C2',
      weight: 2,
      applies: first.imageRequests > 0,
      pass: unneeded.length === 0,
      evidence: list(unneeded, (u) => `${u.url} ${kb(u.bytes)} ${u.why}`),
    },
    {
      id: 'C3',
      weight: 2,
      applies: first.videoElements.length > 0 || first.videoBytes > 0,
      pass: first.videoBytes <= 256 * 1024,
      evidence: `${kb(first.videoBytes)} video before play; elements ${JSON.stringify(first.videoElements.slice(0, 4))}`,
    },
    {
      id: 'C4',
      weight: 2,
      applies: firstMedia > 200 * 1024,
      pass: revisitMedia <= 0.2 * firstMedia,
      evidence: `revisit ${kb(revisitMedia)} of first ${kb(firstMedia)}`,
    },
    {
      id: 'C5',
      weight: 3,
      applies: true,
      pass: first.broken.length === 0,
      evidence: list(first.broken, (b) => `${b.url} ${b.why}`),
    },
    {
      id: 'C6',
      weight: 2,
      applies: first.shown.length > 0,
      pass: blurry.length === 0,
      evidence: list(
        blurry,
        (s) => `${s.url} ${s.natural} in ${s.box} = ${s.perCssPx.toFixed(2)} px/css`,
      ),
    },
  ];
}

const scoreOf = (claims: Claim[]) => {
  const applicable = claims.filter((c) => c.applies);
  const total = applicable.reduce((sum, c) => sum + c.weight, 0);
  return total === 0 ? 1 : applicable.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0) / total;
};

// ── environment ──────────────────────────────────────────────────────────────────────────────

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function killGroup(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

async function startApp(backendUrl: string): Promise<() => void> {
  if (await answers(APP)) throw new Error(`${APP} already answers; set MEDIA_BENCH_APP to reuse it`);
  const prod = Boolean(process.env.MEDIA_BENCH_PROD);
  const child = spawn('bun', prod ? ['x', 'next', 'start', '-p', String(APP_PORT)] : ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: prod ? '.next/media-delivery-prod' : '.next/media-delivery-bench',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const logFile = process.env.MEDIA_BENCH_APP_LOG;
  const keep = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 40) tail.shift();
    if (logFile) appendFileSync(logFile, chunk);
  };
  child.on('exit', (code, signal) => console.log(`· app exited code=${code} signal=${signal}`));
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  for (const deadline = Date.now() + 240_000; Date.now() < deadline; ) {
    if (await answers(`${APP}/login`)) return () => killGroup(child);
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  killGroup(child);
  throw new Error(`app did not start:\n${tail.join('').slice(-3000)}`);
}

async function pinSession(accessToken: string, brand: string) {
  const claims = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { sub: string; session_id: string };
  const member = createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // A gateway blip (Cloudflare 520 in front of PostgREST) is retried, not a dead run.
  let error: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
      {
        user_id: claims.sub,
        session_id: claims.session_id,
        active_brand_id: brand,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_id' },
    ));
    if (!error) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
  throw new Error(`brand pin failed: ${error?.message.slice(0, 200)}`);
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

async function main() {
  if (flag('build')) {
    // A production build for speed runs, with the bench Backend's address baked in.
    const backendUrl = `http://127.0.0.1:${BACKEND_PORT}`;
    const build = spawn('bun', ['x', 'next', 'build'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_DIST_DIR: '.next/media-delivery-prod',
        NEXT_PUBLIC_API_URL: backendUrl,
        API_URL: backendUrl,
      },
    });
    const code = await new Promise<number | null>((resolve) => build.on('exit', resolve));
    process.exit(code ?? 1);
  }
  let backend: LocalBackend | null = null;
  let stopApp: (() => void) | null = null;
  const stop = async () => {
    stopApp?.();
    await backend?.stop();
  };
  process.on('SIGINT', () => void stop().then(() => process.exit(130)));
  process.on('SIGTERM', () => void stop().then(() => process.exit(143)));

  if (!process.env.MEDIA_BENCH_APP) {
    backend = await startLocalBackend({
      port: BACKEND_PORT,
      browserOrigin: APP,
      supabase: 'hosted',
      label: BENCH,
    });
    stopApp = await startApp(backend.url);
    console.log(`· bench Backend ${backend.url} (workers off) · app ${APP}`);
  }
  if (flag('serve')) {
    console.log(`· serving; reuse with MEDIA_BENCH_APP=${APP}`);
    await new Promise(() => {});
  }

  const label = option('label') ?? `run-${Date.now()}`;
  const repeats = Number(option('repeats') ?? 2);
  const only = option('cases')?.split(',');
  const all = await buildCases();
  const split = splitOf(all.map((c) => c.id));
  const cases = only ? all.filter((c) => only.includes(c.id)) : all;
  const outDir = path.join(OUT_ROOT, label);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(OUT_ROOT, 'split.json'), `${JSON.stringify(split, null, 2)}\n`);

  const session = await mintSessionBundleForEmail(OWNER_EMAIL);
  const browser = await chromium.launch({ headless: !flag('headed'), ...benchBrowserChannel() });
  const newContext = async () => {
    const context = await browser.newContext({
      storageState: session.state,
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
    });
    await context.addInitScript(SPEED_INIT);
    return context;
  };

  try {
    if (!flag('no-warm')) {
      // Compiles each route in the dev server once, so no measured visit waits on Turbopack.
      const context = await newContext();
      const page = await context.newPage();
      for (const kase of cases) {
        await pinSession(session.accessToken, kase.brand);
        await page
          .goto(`${APP}${kase.path}`, { waitUntil: 'domcontentloaded', timeout: 240_000 })
          .catch((error: Error) => console.log(`· warm ${kase.id}: ${error.message.slice(0, 120)}`));
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      }
      await context.close();
    }

    const scores: Record<'train' | 'test', Record<string, number[]>> = { train: {}, test: {} };
    const firstBytes: Record<'train' | 'test', Record<string, number[]>> = { train: {}, test: {} };
    const screenReady: Record<'train' | 'test', Record<string, number[]>> = { train: {}, test: {} };
    const report: Record<string, unknown[]> = {};
    for (const kase of cases) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        await pinSession(session.accessToken, kase.brand);
        const context = await newContext();
        const page = await context.newPage();
        page.on('pageerror', (error) =>
          console.log(`  page error ${kase.id}: ${error.message.slice(0, 160)}`),
        );
        const cdp = await context.newCDPSession(page);
        let claims: Claim[];
        let first: Visit;
        let revisit: Visit;
        try {
          first = await measure(page, cdp, kase, true);
          if (flag('shots'))
            await page.screenshot({ path: path.join(outDir, `${kase.id}-${repeat + 1}.png`) });
          await page.goto('about:blank');
          revisit = await measure(page, cdp, kase, false);
          claims = grade(first, revisit);
        } catch (error) {
          // Infra, not a score: a case that cannot load is excluded and said so.
          console.log(`✗ INFRA ${kase.id} #${repeat + 1}: ${(error as Error).message.slice(0, 200)}`);
          await context.close();
          continue;
        }
        await context.close();
        const score = scoreOf(claims);
        const side = split[kase.id] ?? 'train';
        (scores[side][kase.id] ??= []).push(Number(score.toFixed(4)));
        (firstBytes[side][kase.id] ??= []).push(first.imageBytes + first.videoBytes);
        if (first.screenReadyMs !== null)
          (screenReady[side][kase.id] ??= []).push(first.screenReadyMs);
        (report[kase.id] ??= []).push({ repeat, score, claims, first, revisit });
        const failedClaims = claims.filter((c) => c.applies && !c.pass);
        console.log(
          `${kase.id} #${repeat + 1} score ${score.toFixed(2)} · first ${kb(first.imageBytes)} img + ${kb(first.videoBytes)} video · revisit ${kb(revisit.imageBytes + revisit.videoBytes)} · screen ready ${first.screenReadyMs ?? '–'} ms · LCP ${first.lcpMs ?? '–'} ms`,
        );
        for (const c of failedClaims) console.log(`   ✗ ${c.id} ${c.evidence.slice(0, 400)}`);
      }
    }

    writeFileSync(
      path.join(outDir, 'scores.json'),
      `${JSON.stringify({ rubric: 'v1', ...scores }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(outDir, 'bytes.json'),
      `${JSON.stringify({ rubric: 'bytes-v1', ...firstBytes }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(outDir, 'screen-ready.json'),
      `${JSON.stringify({ rubric: `screen-ready-${option('throttle') ?? 'unthrottled'}`, ...screenReady }, null, 2)}\n`,
    );
    writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`· wrote ${outDir}`);
  } finally {
    await browser.close();
    await stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
