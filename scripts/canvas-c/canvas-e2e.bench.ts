#!/usr/bin/env bun
/**
 * canvas:e2e:bench — the campaign canvas (design C) end to end on REAL Backend payloads, read-only.
 *
 *   1. CAPTURE (live). Runs `capture-be-payloads.ts` inside the Backend checkout: the production
 *      live-change emitter + resolver over a real Easy Fit campaign (every Graph call a GET), and
 *      the production `paid_scaffold_propose_duplicate` tool copying a real Easy Fit campaign with
 *      two test ad sets, its rows saved on a throwaway LOCAL Postgres (never the hosted project).
 *      Every frame goes through the production UI chunk adapter, so what this bench reads is the
 *      part the Frontend receives. Without a Backend checkout (or with `--fixtures`) it reads the
 *      checked-in capture under ./fixtures and SAYS SO.
 *   2. PROJECT. Contract parse → `toJainaChatMessage` → the one campaign model
 *      (`campaignViewFromLiveChange`, `campaignViewFromStructure`, the canvas store hydrated by
 *      `buildHydratedCanvasGraph` and marked by the Backend's diff through `latestStructureDiffFor`
 *      → `diffForCanvas` → `scaffoldMarksOf`), checked against oracles computed from the raw
 *      payload, not from the model.
 *   3. RENDER. The real components (companion Read and Map, chat cards, scaffold card) in
 *      Chromium at 640 and 375 px, styled by the app's own Tailwind, asserting the DOM: every
 *      changed node is a change row with its mark, budgets before → after are the payload's
 *      numbers, the Map has no sideways scroll and focuses a change at zoom ≥ 0.8, a copy marks
 *      exactly the Backend's added nodes, and every level is named in its platform's words.
 *
 * Google labels run on hand-built previews: no Google live-change frame exists on the Backend yet.
 *
 * Run: bun run canvas:e2e:bench [--fixtures] [--save] [--shots <dir>]
 *   --fixtures  skip the live capture       --save  refresh ./fixtures from a live capture
 *   --shots     write a screenshot per scene and size into <dir>
 * Env: CANVAS_E2E_BACKEND_DIR (default ../Continuum-Backend, which must hold its .env).
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  campaignStructurePayloadSchema,
  formatMoney,
  type LiveChangeNode,
  type LiveChangePreviewPayload,
  liveChangePreviewPayloadSchema,
  type StructureDiff,
} from '@continuum/contracts';
import { chromium, type Page } from 'playwright';
import {
  campaignViewFromLiveChange,
  campaignViewFromStructure,
  scaffoldMarksOf,
} from '@/lib/campaign-canvas/lectura';
import { portfolioOfMessage } from '@/lib/campaign-canvas/portfolio';
import { diffForCanvas, latestStructureDiffFor } from '@/lib/campaign-canvas/scaffoldDiff';
import {
  compareVersions,
  liveChangeVersionsOf,
  scaffoldVersionsOf,
} from '@/lib/campaign-canvas/versions';
import {
  composedLiveVersionThread,
  composedPortfolioTurn,
  type DuplicateCapture,
  derivedCopyVersionThread,
  hydratedCopyOf,
  type LiveChangeCapture,
  projectTurn,
  type Row,
} from './canvasBenchPath';

const BENCH = 'canvas:e2e:bench';
const HERE = import.meta.dir;
const FE = path.resolve(HERE, '../..');
const FIXTURES = path.join(HERE, 'fixtures');
const BACKEND_DIR = path.resolve(
  process.env.CANVAS_E2E_BACKEND_DIR ?? path.join(FE, '../Continuum-Backend'),
);
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const argVal = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};
const SHOTS = argVal('--shots');
const LIVE_KEYS = ['pause-adset', 'raise-budget', 'new-placements'] as const;

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

const sameSet = (a: Iterable<string>, b: Iterable<string>) => {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};
const listed = (values: Iterable<string>) => [...values].sort().join(', ') || '(none)';

// ---------------------------------------------------------------------------
// 1. Capture
// ---------------------------------------------------------------------------

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

const capture = (): { dir: string; live: boolean } => {
  if (flag('--fixtures')) {
    note('SAVED FIXTURE for every Backend hop: --fixtures asked for no live capture.');
    return { dir: FIXTURES, live: false };
  }
  if (!existsSync(path.join(BACKEND_DIR, '.env'))) {
    note(
      `SAVED FIXTURE for every Backend hop: no Backend checkout with a .env at ${BACKEND_DIR} (set CANVAS_E2E_BACKEND_DIR). The capture in ./fixtures is from ${readJson<LiveChangeCapture>(path.join(FIXTURES, 'live-change-raise-budget.json')).capturedAt}.`,
    );
    return { dir: FIXTURES, live: false };
  }
  const out = mkdtempSync(path.join(tmpdir(), 'canvas-e2e-capture-'));
  const run = spawnSync(
    'bun',
    ['--no-env-file', '--env-file=.env', path.join(HERE, 'capture-be-payloads.ts'), out],
    { cwd: BACKEND_DIR, encoding: 'utf8', timeout: 300_000 },
  );
  const lines = `${run.stdout}`
    .split('\n')
    .filter((line) => /^\(a\)|^\(b\)|^network|^live-change|^account/.test(line));
  const network = lines.find((line) => line.startsWith('network')) ?? '';
  const ok = run.status === 0 && /0 writes refused/.test(network);
  check(
    'capture: real payloads from the Backend, read-only (GETs only, rows on a local Postgres)',
    ok,
    lines.join(' | ') || `${run.stderr}`.slice(-600),
  );
  if (!ok) {
    note(`SAVED FIXTURE for every Backend hop: the live capture failed (exit ${run.status}).`);
    return { dir: FIXTURES, live: false };
  }
  if (flag('--save')) {
    for (const file of [
      ...LIVE_KEYS.map((key) => `live-change-${key}.json`),
      'duplicate-test-adsets.json',
    ]) {
      copyFileSync(path.join(out, file), path.join(FIXTURES, file));
    }
    note('fixtures refreshed from this capture (--save).');
  }
  return { dir: out, live: true };
};

// ---------------------------------------------------------------------------
// Oracles, from the raw payload alone
// ---------------------------------------------------------------------------

/** Every node the change marks, except the ads of a NEW ad set (that one change covers them). */
const liveChangedOracle = (
  preview: LiveChangePreviewPayload,
): Map<string, LiveChangeNode['mark']> => {
  const byId = new Map(preview.nodes.map((node) => [node.id, node]));
  return new Map(
    preview.nodes
      .filter((node) => node.mark !== 'unchanged')
      .filter((node) => !(node.level === 'ad' && byId.get(node.parentId ?? '')?.mark === 'added'))
      .map((node) => [node.id, node.mark]),
  );
};

/** Tree order: the campaign, then each ad set followed by its own ads. */
const firstChangeOf = (preview: LiveChangePreviewPayload): string | null => {
  const marked = liveChangedOracle(preview);
  for (const campaign of preview.nodes.filter((node) => node.level === 'campaign')) {
    if (marked.has(campaign.id)) return campaign.id;
    for (const adSet of preview.nodes.filter((node) => node.parentId === campaign.id)) {
      if (marked.has(adSet.id)) return adSet.id;
      const ad = preview.nodes.find((node) => node.parentId === adSet.id && marked.has(node.id));
      if (ad && adSet.mark !== 'added') return ad.id;
    }
  }
  return null;
};

const moneyRows = (preview: LiveChangePreviewPayload) =>
  preview.nodes.flatMap((node) =>
    node.changes
      .filter(
        (row) =>
          row.field === 'daily_budget' &&
          typeof row.before === 'number' &&
          typeof row.after === 'number',
      )
      .map((row) => ({
        id: node.id,
        before: formatMoney((row.before as number) / 100, preview.currency),
        after: formatMoney((row.after as number) / 100, preview.currency),
      })),
  );

/** The daily total that delivers today and after the change: what Meta spends, by status. */
const totalsOracle = (
  preview: LiveChangePreviewPayload,
): { before: number; after: number } | null => {
  const delivering = (status: string | null) => status === 'ACTIVE' || status === 'ENABLED';
  const afterOf = (node: LiveChangeNode) => {
    if (node.mark === 'paused') return 0;
    const row = node.changes.find((change) => change.field === 'daily_budget');
    return typeof row?.after === 'number' ? row.after : (node.dailyBudgetMinor ?? 0);
  };
  const campaign = preview.nodes.find((node) => node.level === 'campaign');
  if (!campaign) return null;
  if (campaign.dailyBudgetMinor !== null) {
    const live = delivering(campaign.status);
    return { before: live ? campaign.dailyBudgetMinor : 0, after: live ? afterOf(campaign) : 0 };
  }
  const adSets = preview.nodes.filter(
    (node) => node.level === 'adset' && node.mark !== 'added' && node.dailyBudgetMinor !== null,
  );
  if (adSets.length === 0) return null;
  let before = 0;
  let after = 0;
  for (const adSet of adSets) {
    if (!delivering(adSet.status) || !delivering(campaign.status)) continue;
    before += adSet.dailyBudgetMinor ?? 0;
    after += campaign.mark === 'paused' ? 0 : afterOf(adSet);
  }
  return { before, after };
};

/** A copy: the Backend's added path keys, and the nodes it really changes (beyond "paused"). */
const copyOracle = (diff: StructureDiff) => ({
  added: new Set(
    diff.entries.filter((entry) => entry.change === 'added').map((entry) => entry.path_key),
  ),
  changed: new Set(
    diff.entries
      .filter(
        (entry) =>
          entry.change === 'changed' && entry.fields.some((field) => field.key !== 'status'),
      )
      .map((entry) => entry.path_key),
  ),
});

/**
 * Two versions of one live campaign, from the raw payloads: a node only the later one has is
 * added, only the earlier one removed; in both, it differs when its own mark or the after value
 * of any proposed field differs — paused when it starts to stop, else changed. Status rows are
 * the mark itself. Ads under an added or removed ad set go with it (not a change of their own).
 */
const liveVersionOracle = (
  before: LiveChangePreviewPayload,
  after: LiveChangePreviewPayload,
): { changes: Map<string, string>; marked: Map<string, string> } => {
  const was = new Map(before.nodes.map((node) => [node.id, node]));
  const now = new Map(after.nodes.map((node) => [node.id, node]));
  const proposed = (node: LiveChangeNode) =>
    JSON.stringify(
      node.changes
        .filter((row) => row.field !== 'status')
        .map((row) => [row.field, row.after])
        .sort(),
    );
  const marked = new Map<string, string>();
  for (const node of after.nodes) {
    const old = was.get(node.id);
    if (!old) marked.set(node.id, 'added');
    else if (node.mark === 'paused' && old.mark !== 'paused') marked.set(node.id, 'paused');
    else if (
      (node.mark === 'paused') !== (old.mark === 'paused') ||
      proposed(node) !== proposed(old)
    )
      marked.set(node.id, 'changed');
  }
  for (const node of before.nodes) if (!now.has(node.id)) marked.set(node.id, 'removed');
  const parentOf = (id: string) => (now.get(id) ?? was.get(id))?.parentId ?? '';
  const changes = new Map(
    [...marked].filter(([id]) => {
      const level = (now.get(id) ?? was.get(id))?.level;
      const parentMark = marked.get(parentOf(id));
      if (level === 'ad') return parentMark !== 'added' && parentMark !== 'removed';
      if (level === 'adset') {
        const campaignMark = marked.get(parentOf(id));
        return campaignMark !== 'added' && campaignMark !== 'removed';
      }
      return true;
    }),
  );
  return { changes, marked };
};

// ---------------------------------------------------------------------------
// Synthetic Google previews (labels only)
// ---------------------------------------------------------------------------

const googlePreview = (channel: 'SEARCH' | 'PERFORMANCE_MAX'): LiveChangePreviewPayload => {
  const pmax = channel === 'PERFORMANCE_MAX';
  const group = (id: string, name: string, extra: Partial<LiveChangeNode>): LiveChangeNode => ({
    id,
    parentId: 'g-c1',
    level: 'adset',
    name,
    status: 'ENABLED',
    dailyBudgetMinor: null,
    mark: 'unchanged',
    changes: [],
    basedOnId: null,
    ...extra,
  });
  const nodes: LiveChangeNode[] = [
    {
      id: 'g-c1',
      parentId: null,
      level: 'campaign',
      name: pmax ? 'Easy Fit · PMax · Membresías' : 'Easy Fit · Search · Marca',
      status: 'ENABLED',
      dailyBudgetMinor: 60000,
      mark: 'changed',
      changes: [{ field: 'daily_budget', before: 60000, after: 75000 }],
      basedOnId: null,
    },
    group('g-a1', pmax ? 'Asset group · Mujeres 25-44' : 'Ad group · Gimnasio cerca', {
      mark: 'paused',
      changes: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
      ...(pmax ? { assetSummary: '5 headlines · 4 descriptions · 6 images · 1 video' } : {}),
    } as Partial<LiveChangeNode>),
    group(
      'g-a2',
      pmax ? 'Asset group · Day pass' : 'Ad group · Day pass',
      pmax
        ? ({ assetSummary: '3 headlines · 2 descriptions · 4 images' } as Partial<LiveChangeNode>)
        : {},
    ),
    group(
      'g-a3',
      pmax ? 'Asset group · Estudiantes' : 'Ad group · Estudiantes',
      pmax ? ({ assetSummary: '4 headlines · 3 images' } as Partial<LiveChangeNode>) : {},
    ),
    ...(pmax
      ? []
      : ['g-a1', 'g-a2', 'g-a3'].flatMap((parent, index) => [
          {
            id: `${parent}-ad1`,
            parentId: parent,
            level: 'ad' as const,
            name: `RSA ${index + 1} · Membresía $399`,
            status: 'ENABLED',
            dailyBudgetMinor: null,
            mark: 'unchanged' as const,
            changes: [],
            basedOnId: null,
          },
        ])),
  ];
  return {
    approvalId: `synthetic_${channel}`,
    toolCallId: `synthetic_${channel}`,
    toolName: pmax ? 'google_ads_change_pmax_budget' : 'google_ads_change_budget',
    partId: `live-change:synthetic_${channel}`,
    subject: pmax
      ? 'Raise the PMax budget, pause one asset group'
      : 'Raise the Search budget, pause one ad group',
    currency: 'MXN',
    nodes,
    truncated: false,
    counts: { changed: 1, added: 0, paused: 1 },
    readAt: new Date().toISOString(),
    platform: 'google',
    channel,
  } as LiveChangePreviewPayload;
};

// ---------------------------------------------------------------------------
// 3. The browser bundle
// ---------------------------------------------------------------------------

const buildBundle = async (dist: string, data: unknown): Promise<void> => {
  mkdirSync(dist, { recursive: true });
  // Next resolves `server-only` to nothing in a client graph; the bundle does the same.
  const serverOnly: import('bun').BunPlugin = {
    name: 'server-only',
    setup(build) {
      build.onResolve({ filter: /^server-only$/ }, () => ({
        path: 'server-only',
        namespace: 'stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export {};',
        loader: 'js',
      }));
    },
  };
  const built = await Bun.build({
    entrypoints: [path.join(HERE, 'canvas-e2e.entry.tsx')],
    outdir: dist,
    target: 'browser',
    naming: 'entry.[ext]',
    plugins: [serverOnly],
    throw: false,
    define: {
      'process.env.NODE_ENV': '"production"',
      // The scaffold card can construct a Supabase client; it never reaches it (rows are seeded).
      'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://bench.invalid"',
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"bench"',
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY': '"bench"',
      'process.env.NEXT_PUBLIC_API_URL': '"https://bench.invalid"',
      'process.env': '{}',
    },
  });
  if (!built.success)
    throw new Error(
      built.logs
        .map((log) => String(log))
        .join('\n')
        .slice(0, 2000),
    );
  const postcss = (await import('postcss')).default;
  const tailwind = (await import('@tailwindcss/postcss')).default;
  const globals = path.join(FE, 'src/app/globals.css');
  const css = await postcss([tailwind()]).process(readFileSync(globals, 'utf8'), { from: globals });
  writeFileSync(path.join(dist, 'app.css'), css.css);
  writeFileSync(path.join(dist, 'data.js'), `window.__CANVAS_BENCH__=${JSON.stringify(data)};`);
  // The app's own faces (next/font serves them in production): card heights are estimated from
  // Geist's glyph widths, so a fallback font would measure the wrong thing.
  const fonts = path.join(FE, 'node_modules/geist/dist/fonts');
  const faces = [
    ['geist-sans/Geist-Regular.woff2', 'Geist', 400],
    ['geist-sans/Geist-Medium.woff2', 'Geist', 500],
    ['geist-sans/Geist-SemiBold.woff2', 'Geist', 600],
    ['geist-sans/Geist-Bold.woff2', 'Geist', 700],
    ['geist-mono/GeistMono-Regular.woff2', 'Geist Mono', 400],
    ['geist-mono/GeistMono-Medium.woff2', 'Geist Mono', 500],
  ] as const;
  for (const [file] of faces)
    copyFileSync(path.join(fonts, file), path.join(dist, path.basename(file)));
  const fontCss = faces
    .map(
      ([file, family, weight]) =>
        `@font-face{font-family:'${family}';src:url(${path.basename(file)}) format('woff2');font-weight:${weight};font-display:block}`,
    )
    .join('');
  for (const theme of ['light', 'dark']) {
    writeFileSync(
      path.join(dist, `${theme}.html`),
      `<!doctype html><html class="${theme}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="entry.css"><style>${fontCss}:root{--font-geist-sans:'Geist';--font-geist-mono:'Geist Mono'}html,body{margin:0}#root{width:100vw;height:100vh}</style></head><body class="bg-background text-foreground"><div id="root"></div><script src="data.js"></script><script type="module" src="entry.js"></script></body></html>`,
    );
  }
};

type SceneInfo = {
  overflowX: number;
  zoom: number | null;
  errors: string[];
};

/** The bundle over http: a module script will not load from file://. */
const serve = (dist: string) =>
  Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => {
      const name = path.basename(new URL(request.url).pathname) || 'light.html';
      return new Response(Bun.file(path.join(dist, name)));
    },
  });

const openScene = async (
  browser: import('playwright').Browser,
  base: string,
  scene: string,
  width: number,
  wait: string,
  theme: 'light' | 'dark' = 'light',
): Promise<{ page: Page; info: () => Promise<SceneInfo>; close: () => Promise<void> }> => {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}/${theme}.html#${scene}`);
  await page.waitForSelector(wait, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return {
    page,
    info: async () => ({
      ...(await page.evaluate(() => {
        const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
        const matrix = viewport ? new DOMMatrix(getComputedStyle(viewport).transform) : null;
        return {
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          zoom: matrix ? Number(matrix.a.toFixed(3)) : null,
        };
      })),
      errors,
    }),
    close: () => context.close(),
  };
};

const shoot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

/** Each Map card's unused height below its last line: a blank title line is ≥ 16 px. */
const cardSlack = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-map-card > div')].map((card) => {
      const box = card.getBoundingClientRect();
      const last = [...card.children]
        .filter((child) => !child.classList.contains('react-flow__handle'))
        .at(-1);
      const bottom = last ? last.getBoundingClientRect().bottom : box.top;
      const zoom = box.height / card.offsetHeight || 1;
      return {
        id: card.getAttribute('data-testid') ?? '',
        slack: Math.round((box.bottom - bottom) / zoom - 9.5),
      };
    }),
  );

/** A blank title line leaves ≥ 16 px under the text; a short estimate clips it (negative). */
const fitOf = (cards: { id: string; slack: number }[]) => {
  const most = cards.reduce((max, card) => (card.slack > max.slack ? card : max), {
    id: '',
    slack: -99,
  });
  const least = cards.reduce((min, card) => (card.slack < min.slack ? card : min), {
    id: '',
    slack: 99,
  });
  return {
    ok: cards.length > 0 && most.slack < 12 && least.slack > -3,
    detail: `${cards.length} cards, spare ${least.slack}..${most.slack}px (most on ${most.id})`,
  };
};

const marksIn = (page: Page, prefix: string) =>
  page.evaluate(
    (testPrefix) =>
      [...document.querySelectorAll(`[data-testid^="${testPrefix}"]`)]
        .filter((node) => !node.getAttribute('data-testid')?.endsWith('-expanded'))
        .map((node) => ({
          id: (node.getAttribute('data-testid') ?? '').slice(testPrefix.length),
          mark: node.getAttribute('data-mark') ?? '',
          text: node.textContent ?? '',
        })),
    prefix,
  );

const nextChange = async (page: Page) => {
  await page.click('[aria-label="Next change"]', { timeout: 5_000 });
  await page.waitForTimeout(650);
  return page.evaluate(
    () => document.querySelector('[data-focused="true"]')?.getAttribute('data-testid') ?? null,
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const source = capture();
  const live: Record<string, LiveChangeCapture> = {};
  for (const key of LIVE_KEYS)
    live[key] = readJson(path.join(source.dir, `live-change-${key}.json`));
  const copy = readJson<DuplicateCapture>(path.join(source.dir, 'duplicate-test-adsets.json'));
  note(
    source.live
      ? `every Backend hop LIVE this run: Easy Fit read at ${live['raise-budget']?.capturedAt}, copy proposed at ${copy.capturedAt}.`
      : 'every Backend hop from the SAVED capture in ./fixtures (see above for why).',
  );

  // -- 2. contract parse → projection → model -------------------------------------------------
  const previews: Record<string, LiveChangePreviewPayload> = {};
  for (const key of LIVE_KEYS) {
    const capture = live[key] as LiveChangeCapture;
    const part = capture.parts.find((entry) => entry.type === 'data-jaina-live-change');
    const parsed = liveChangePreviewPayloadSchema.safeParse(part?.data);
    check(
      `${key}: the part parses as the contract`,
      parsed.success,
      parsed.success
        ? `${parsed.data.nodes.length} nodes, ${JSON.stringify(parsed.data.counts)}`
        : parsed.error.issues[0]?.message,
    );
    const projected = projectTurn(`msg_${key}`, capture.parts).liveChangePreviews?.at(-1);
    check(
      `${key}: the chat projection carries it whole`,
      Boolean(projected) && JSON.stringify(projected) === JSON.stringify(parsed.data),
    );
    if (!projected) continue;
    previews[key] = projected;
    const model = campaignViewFromLiveChange(projected);
    const oracle = liveChangedOracle(projected);
    check(
      `${key}: the model lists exactly the payload's changes, each with its mark`,
      sameSet(
        model.changes.map((change) => `${change.id}:${change.mark}`),
        [...oracle].map(([id, mark]) => `${id}:${mark}`),
      ),
      listed([...oracle].map(([id, mark]) => `${id}:${mark}`)),
    );
    check(`${key}: Meta, by its tool (${projected.toolName})`, model.platform === 'meta');
  }

  const message = projectTurn('msg_copy', copy.parts);
  const structure = message.campaignStructures?.find((entry) => entry.layout === 'diff') ?? null;
  const structureParse = campaignStructurePayloadSchema.safeParse(
    copy.parts.find((entry) => entry.type === 'data-jaina-campaign-structure')?.data,
  );
  check(
    'copy: the structure part parses as the contract, layout diff',
    structureParse.success && structureParse.data.layout === 'diff',
    structureParse.success
      ? `${structureParse.data.diff?.entries.length} diff entries`
      : structureParse.error.issues[0]?.message,
  );
  check(
    'copy: the projection carries the proposal and its diff',
    Boolean(message.scaffold?.scaffoldId && structure?.diff),
    `version ${message.scaffold?.scaffoldId}`,
  );
  if (!structure?.diff || !message.scaffold) finish();
  const oracle = copyOracle(structure.diff);
  const graph = hydratedCopyOf(copy);
  const plumbed = latestStructureDiffFor([message], graph.hydration.scaffoldId);
  const diff = diffForCanvas(plumbed, graph.hydration);
  check(
    'copy: the chat hands the canvas the diff of the scaffold it holds',
    diff === structure.diff,
    `parent ${graph.hydration.scaffoldId}`,
  );
  const pathOf = new Map(
    graph.nodes.map((node) => [
      node.id,
      (node.data as { provenance?: { pathKey?: string } }).provenance?.pathKey ?? '',
    ]),
  );
  const idOfPath = new Map([...pathOf].map(([id, pathKey]) => [pathKey, id]));
  const marks = scaffoldMarksOf(graph.nodes, graph.edges, diff);
  const addedIds = [...oracle.added].map(
    (pathKey) => idOfPath.get(pathKey) ?? `missing:${pathKey}`,
  );
  check(
    'copy: the canvas marks exactly the Backend’s added nodes',
    sameSet(
      [...marks].filter(([, mark]) => mark.mark === 'added').map(([id]) => pathOf.get(id) ?? id),
      oracle.added,
    ),
    listed(oracle.added),
  );
  check(
    'copy: and changed only where the copy really changes (not "created paused")',
    sameSet(
      [...marks].filter(([, mark]) => mark.mark === 'changed').map(([id]) => pathOf.get(id) ?? id),
      oracle.changed,
    ),
    listed(oracle.changed),
  );
  const chatModel = campaignViewFromStructure(structure);
  check(
    'copy: the chat drawing’s model lists the same changes by path key',
    sameSet(
      chatModel.changes.map((change) => change.id),
      [...oracle.changed, ...[...oracle.added].filter((key) => key.split('/').length === 2)],
    ),
  );

  // -- 2b. portfolio and versions, on threads COMPOSED / DERIVED from the real captures ---------
  note(
    'COMPOSED: the multi-campaign turn is the real pause + raise approvals on ITESO and the real AV CAMACHO copy proposal, put in one message (no real multi-campaign capture exists).',
  );
  const portfolioTurn = composedPortfolioTurn(live, copy);
  const portfolio = portfolioOfMessage(portfolioTurn);
  const pausePreview = previews['pause-adset'];
  const raisePreview = previews['raise-budget'];
  // ITESO with both approvals, from the raw payloads: the raise's nodes with the pause's marks
  // laid over (a pause outranks a change on the same node — both captures touch one ad set).
  const mergedRaw: LiveChangePreviewPayload | null =
    pausePreview && raisePreview
      ? {
          ...raisePreview,
          nodes: raisePreview.nodes.map((node) => {
            const paused = pausePreview.nodes.find((entry) => entry.id === node.id);
            return paused && paused.mark === 'paused' ? { ...node, mark: 'paused' } : node;
          }),
        }
      : null;
  const itesoMarks = mergedRaw ? liveChangedOracle(mergedRaw) : new Map<string, string>();
  const itesoChanges = new Set(itesoMarks.keys());
  const itesoCount = (mark: string) => [...itesoMarks.values()].filter((m) => m === mark).length;
  const copyChanges =
    oracle.changed.size + [...oracle.added].filter((k) => k.split('/').length === 2).length;
  const expectedHeadline = `2 campaigns · ${itesoChanges.size + copyChanges} changes`;
  check(
    'portfolio: the composed turn groups into one row per campaign — ITESO (live, 2 approvals) and the copy',
    Boolean(portfolio) &&
      portfolio?.rows.length === 2 &&
      portfolio.rows[0]?.source.kind === 'live' &&
      portfolio.rows[0].source.partIds.length === 2 &&
      portfolio.rows[1]?.source.kind === 'scaffold',
    portfolio?.rows.map((row) => `${row.id}:${row.changeCount}`).join(', ') ?? 'no portfolio',
  );
  const itesoTotals = mergedRaw ? totalsOracle(mergedRaw) : null;
  const itesoRow = portfolio?.rows[0];
  check(
    `portfolio: ${expectedHeadline}, ITESO's counts and daily total from the raw payloads`,
    portfolio !== null &&
      portfolio.changeCount === itesoChanges.size + copyChanges &&
      itesoRow?.counts.paused === itesoCount('paused') &&
      itesoRow?.counts.changed === itesoCount('changed') &&
      (itesoTotals === null ||
        (itesoRow?.before === itesoTotals.before && itesoRow?.after === itesoTotals.after)),
    itesoTotals
      ? `ITESO ${itesoTotals.before} → ${itesoTotals.after} minor; row ${itesoRow?.before} → ${itesoRow?.after}`
      : 'no ITESO total',
  );

  note(
    'COMPOSED: the ITESO version thread is the three real live captures as v1 pause → v2 raise → v3 placements; the approval and ok result on v2 are SYNTHETIC (nothing was written), so the line shows an applied step.',
  );
  const liveThread = composedLiveVersionThread(live);
  const itesoId = pausePreview?.nodes.find((node) => node.level === 'campaign')?.id ?? '';
  const liveLine = liveChangeVersionsOf(liveThread, itesoId);
  check(
    'versions (live): each preview of ITESO is its next version; v2 applied',
    liveLine.versions.map((version) => `${version.label}:${version.status}`).join(',') ===
      'v1:proposed,v2:applied,v3:proposed' && liveLine.appliedId === raisePreview?.partId,
    liveLine.versions.map((version) => `${version.label}:${version.status}`).join(', '),
  );
  const liveOracle =
    pausePreview && raisePreview ? liveVersionOracle(pausePreview, raisePreview) : null;
  const liveCompare =
    liveLine.versions[0] && liveLine.versions[1]
      ? compareVersions(liveLine.versions[0].model, liveLine.versions[1].model)
      : null;
  check(
    'versions (live): v2 against v1 marks exactly what the raw payloads differ in',
    Boolean(liveOracle && liveCompare) &&
      sameSet(
        liveCompare?.model.changes.map((change) => `${change.id}:${change.mark}`) ?? [],
        [...(liveOracle?.changes ?? [])].map(([id, mark]) => `${id}:${mark}`),
      ),
    listed([...(liveOracle?.changes ?? [])].map(([id, mark]) => `${id}:${mark}`)),
  );

  const derived = derivedCopyVersionThread(copy);
  note(
    `DERIVED: copy v2 = the real v1 with test ad set ${derived.dropped} dropped and ${derived.raised}'s budget ${derived.raisedFrom} → ${derived.raisedTo}.`,
  );
  const copyLine = scaffoldVersionsOf(derived.thread, derived.parentScaffoldId);
  const copyCompare =
    copyLine.versions[0] && copyLine.versions[1]
      ? compareVersions(copyLine.versions[0].model, copyLine.versions[1].model)
      : null;
  const copyRaised = copyCompare?.model.changes.find((change) => change.id === derived.raised);
  check(
    'versions (copy): v1 → v2 by version number; v2 against v1 is the dropped ad set removed and the raised budget changed, nothing else',
    copyLine.versions.map((version) => version.label).join(',') === 'v1,v2' &&
      sameSet(copyCompare?.model.changes.map((change) => `${change.id}:${change.mark}`) ?? [], [
        `${derived.dropped}:removed`,
        `${derived.raised}:changed`,
      ]) &&
      Boolean(
        copyRaised?.rows.some(
          (row) => row.before === derived.raisedFrom && row.after === derived.raisedTo,
        ),
      ),
    copyCompare?.model.changes.map((change) => `${change.id}:${change.mark}`).join(', '),
  );

  // -- 3. the browser ---------------------------------------------------------------------------
  const dist = mkdtempSync(path.join(tmpdir(), 'canvas-e2e-dist-'));
  const synthetic = { pmax: googlePreview('PERFORMANCE_MAX'), search: googlePreview('SEARCH') };
  await buildBundle(dist, { live, copy, synthetic });
  record('bundle: the real components, the app’s Tailwind', 'PASS', dist);
  const server = serve(dist);
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch();
  try {
    for (const key of LIVE_KEYS) {
      const preview = previews[key];
      if (!preview) continue;
      const changed = liveChangedOracle(preview);
      for (const width of [640, 375]) {
        const scene = await openScene(
          browser,
          base,
          `live:${key}:read`,
          width,
          '[data-testid="lectura-view"]',
        );
        const rows = await marksIn(scene.page, 'lectura-change-');
        const info = await scene.info();
        check(
          `${key} Read @${width}: every changed node is a change row with its mark`,
          sameSet(
            rows.map((row) => `${row.id}:${row.mark}`),
            [...changed].map(([id, mark]) => `${id}:${mark}`),
          ),
          `${rows.length} rows`,
        );
        for (const money of moneyRows(preview)) {
          const row = rows.find((entry) => entry.id === money.id)?.text ?? '';
          check(
            `${key} Read @${width}: budget ${money.before} → ${money.after} as the payload says`,
            row.includes(money.before) && row.includes(money.after),
          );
        }
        const totals = totalsOracle(preview);
        if (totals) {
          const band = (await scene.page.textContent('section[aria-label="Daily budget"]')) ?? '';
          const before = formatMoney(totals.before / 100, preview.currency);
          const after = formatMoney(totals.after / 100, preview.currency);
          check(
            `${key} Read @${width}: the daily total ${totals.before === totals.after ? after : `${before} → ${after}`} is what delivers, from the payload`,
            band.includes(`${after}/day`) &&
              (totals.before === totals.after || band.includes(before)),
            band.replace(/\s+/g, ' ').trim(),
          );
        }
        const chip = await scene.page.textContent('[data-testid="platform-chip"]');
        check(
          `${key} Read @${width}: chipped Meta, no sideways scroll, no errors`,
          chip === 'Meta' && info.overflowX <= 0 && info.errors.length === 0,
          `overflowX ${info.overflowX}${info.errors.length ? ` errors ${info.errors.join(' | ')}` : ''}`,
        );
        await shoot(scene.page, `live-${key}-read-${width}`);
        await scene.close();
      }
      // The companion's Map at 640 (by its own toggle); the standalone Map at 375.
      for (const [width, view] of [
        [640, 'read'],
        [375, 'map-only'],
      ] as const) {
        const scene = await openScene(
          browser,
          base,
          `live:${key}:${view}`,
          width,
          view === 'read' ? '[data-testid="canvas-view-toggle"]' : '.react-flow__node',
        );
        if (view === 'read') {
          await scene.page.click('[data-testid="canvas-view-toggle"] [data-view="mapa"]');
          await scene.page.waitForSelector('.react-flow__node', { timeout: 10_000 });
          await scene.page.waitForTimeout(400);
        }
        const cards = await marksIn(scene.page, 'live-change-node-');
        const marked = cards.filter((card) => card.mark !== 'unchanged');
        const expectMarked = [...preview.nodes]
          .filter((node) => node.mark !== 'unchanged')
          .map((node) => `${node.id}:${node.mark}`);
        check(
          `${key} Map @${width}: every marked node is drawn with its mark`,
          sameSet(
            marked.map((card) => `${card.id}:${card.mark}`),
            expectMarked,
          ),
          `${marked.length} marked of ${cards.length} drawn`,
        );
        const labels = await scene.page.evaluate(() => [
          ...new Set(
            [...document.querySelectorAll('.react-flow__node-map-card .uppercase')].map(
              (node) => node.textContent,
            ),
          ),
        ]);
        check(
          `${key} Map @${width}: Meta's words on the cards`,
          labels.every((label) => ['Campaign', 'Ad set', 'Ad'].includes(label ?? '')),
          labels.join(', '),
        );
        const focused = await nextChange(scene.page);
        const info = await scene.info();
        const first = firstChangeOf(preview);
        check(
          `${key} Map @${width}: "Next change" focuses ${first} at zoom ≥ 0.8, no sideways scroll`,
          focused === `live-change-node-${first}` &&
            (info.zoom ?? 0) >= 0.8 &&
            info.overflowX <= 0 &&
            info.errors.length === 0,
          `focused ${focused} zoom ${info.zoom} overflowX ${info.overflowX}${info.errors.length ? ` errors ${info.errors.join(' | ')}` : ''}`,
        );
        const fit = fitOf(await cardSlack(scene.page));
        check(
          `${key} Map @${width}: every card fits its text — no blank line, nothing clipped`,
          fit.ok,
          fit.detail,
        );
        await shoot(scene.page, `live-${key}-map-${width}`);
        await scene.close();
      }
      for (const width of [640, 375]) {
        const scene = await openScene(
          browser,
          base,
          `live:${key}:chat`,
          width,
          '[data-testid="lectura-chat-card"]',
        );
        const rows = await marksIn(scene.page, 'lectura-change-');
        const ordered = [...changed].slice(0, 3);
        const info = await scene.info();
        check(
          `${key} chat @${width}: the first changes with their marks, and Open in canvas`,
          rows.every((row) => changed.get(row.id) === row.mark) &&
            rows.length === Math.min(3, changed.size) &&
            (await scene.page.$('[data-testid="lectura-open-in-canvas"]')) !== null &&
            info.overflowX <= 0,
          `${rows.map((row) => `${row.id}:${row.mark}`).join(', ')} (of ${ordered.length})`,
        );
        await shoot(scene.page, `live-${key}-chat-${width}`);
        await scene.close();
      }
    }

    // A real copy with two test ad sets: the companion's Read and Map, the chat drawing, the card.
    const addedAdSets = [...oracle.added].filter((key) => key.split('/').length === 2);
    const expectedReadIds = [...oracle.changed, ...addedAdSets].map(
      (pathKey) => idOfPath.get(pathKey) ?? pathKey,
    );
    for (const width of [640, 375]) {
      const scene = await openScene(
        browser,
        base,
        'copy:x:read',
        width,
        '[data-testid="lectura-view"]',
      );
      const rows = await marksIn(scene.page, 'lectura-change-');
      const cards = await marksIn(scene.page, 'lectura-adset-');
      const info = await scene.info();
      check(
        `copy Read @${width}: the changes are exactly the renamed campaign and the test ad sets`,
        sameSet(
          rows.map((row) => row.id),
          expectedReadIds,
        ),
        rows.map((row) => `${pathOf.get(row.id)}:${row.mark}`).join(', '),
      );
      check(
        `copy Read @${width}: test ad sets new, copied ones unchanged`,
        cards.every(
          (card) =>
            card.mark === (oracle.added.has(pathOf.get(card.id) ?? '') ? 'added' : 'unchanged'),
        ) &&
          cards.length === copy.rows.filter((row) => row.level === 'adset').length &&
          info.overflowX <= 0 &&
          info.errors.length === 0,
        `${cards.length} ad set cards; overflowX ${info.overflowX}`,
      );
      await shoot(scene.page, `copy-read-${width}`);
      await scene.close();
    }
    {
      const scene = await openScene(browser, base, 'copy:x:map', 640, '.react-flow__node');
      const cards = await marksIn(scene.page, 'map-card-');
      const added = cards.filter((card) => card.mark === 'added').map((card) => card.id);
      check(
        'copy Map @640: exactly the Backend’s added nodes are marked new',
        sameSet(added, addedIds),
        `${added.length} new of ${cards.length} drawn`,
      );
      const collapsed = await scene.page.textContent('[data-testid^="map-collapsed-"]');
      check(
        'copy Map @640: the copied ad sets fold into one node',
        collapsed === '+ 3 unchanged ad sets',
        collapsed ?? 'none',
      );
      const focused = await nextChange(scene.page);
      const info = await scene.info();
      check(
        'copy Map @640: "Next change" focuses at zoom ≥ 0.8, no sideways scroll',
        focused !== null &&
          (info.zoom ?? 0) >= 0.8 &&
          info.overflowX <= 0 &&
          info.errors.length === 0,
        `focused ${focused} zoom ${info.zoom} overflowX ${info.overflowX}`,
      );
      const fit = fitOf(await cardSlack(scene.page));
      check(
        'copy Map @640: every card fits its text — no blank line, nothing clipped',
        fit.ok,
        fit.detail,
      );
      await shoot(scene.page, 'copy-map-640');
      await scene.close();
    }
    const chatExpected = [...oracle.changed, ...addedAdSets];
    for (const [view, wait] of [
      ['structure', '[data-testid="campaign-structure"]'],
      ['card', '[data-testid="paid-scaffold-card"] [data-testid="lectura-chat-card"]'],
    ] as const) {
      for (const width of [640, 375]) {
        const scene = await openScene(browser, base, `copy:x:${view}`, width, wait);
        const rows = await marksIn(scene.page, 'lectura-change-');
        const info = await scene.info();
        // The Read card itself must fit; the page may not when the scaffold card's own sections
        // (field list, evidence) are wider — reported apart, below.
        const readFits = await scene.page.evaluate((viewport) => {
          const card = document.querySelector(
            '[data-testid="lectura-chat-card"]',
          ) as HTMLElement | null;
          if (!card) return false;
          return (
            card.scrollWidth <= card.clientWidth + 1 &&
            card.getBoundingClientRect().width <= viewport
          );
        }, width);
        check(
          `copy ${view === 'card' ? 'scaffold card' : 'chat drawing'} @${width}: Read at chat size, the copy's changes by path key`,
          sameSet(
            rows.map((row) => `${row.id}:${row.mark}`),
            chatExpected
              .slice(0, 3)
              .map((key) => `${key}:${oracle.added.has(key) ? 'added' : 'changed'}`),
          ) &&
            readFits &&
            info.errors.length === 0,
          `${rows.map((row) => `${row.id}:${row.mark}`).join(', ')}; Read fits ${readFits}${info.errors.length ? ` errors ${info.errors.join(' | ')}` : ''}`,
        );
        if (info.overflowX > 0) {
          record(
            `copy ${view} @${width}: the page scrolls sideways ${info.overflowX}px`,
            view === 'card' ? 'WARN' : 'FAIL',
            view === 'card'
              ? "the scaffold card's own field list and plan sections (untouched this phase) are wider than the phone; the Read card inside fits"
              : 'the chat drawing must fit',
          );
        }
        if (view === 'card') {
          const deploy = await scene.page.textContent('[data-testid="scaffold-deploy"]');
          check(
            `copy scaffold card @${width}: Deploy paused stays where it was`,
            deploy === 'Deploy paused',
            deploy ?? 'none',
          );
        }
        await shoot(scene.page, `copy-chat-${view}-${width}`);
        await scene.close();
      }
    }

    // Google, in Google's words (hand-built previews: no Google frame exists yet).
    for (const [key, words] of [
      [
        'pmax',
        { group: 'Asset group', third: 'Assets', chip: 'Google PMax', count: 'asset groups' },
      ],
      ['search', { group: 'Ad group', third: 'Ad', chip: 'Google Search', count: 'ad groups' }],
    ] as const) {
      const read = await openScene(
        browser,
        base,
        `synthetic:${key}:read`,
        640,
        '[data-testid="lectura-view"]',
      );
      const text = (await read.page.textContent('[data-testid="lectura-view"]')) ?? '';
      const chip = await read.page.textContent('[data-testid="platform-chip"]');
      check(
        `google ${key} Read: chipped ${words.chip}, counted in ${words.count}`,
        chip === words.chip && text.includes(words.count) && !text.includes('ad set'),
        `${chip}`,
      );
      if (key === 'pmax') {
        const assets = await read.page.$$('[data-testid^="lectura-assets-"]');
        check(
          'google pmax Read: each asset group shows its assets, no ad list',
          assets.length === 3 && !text.includes('No ads read'),
        );
      }
      await shoot(read.page, `google-${key}-read-640`);
      await read.page.click('[data-testid="canvas-view-toggle"] [data-view="mapa"]');
      await read.page.waitForSelector('.react-flow__node', { timeout: 10_000 });
      await read.page.waitForTimeout(400);
      const labels = await read.page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll('.react-flow__node-map-card .uppercase')].map(
            (node) => node.textContent,
          ),
        ),
      ]);
      check(
        `google ${key} Map: levels named ${['Campaign', words.group, words.third].join(' / ')}`,
        sameSet(labels.map(String), ['Campaign', words.group, words.third]),
        labels.join(', '),
      );
      await shoot(read.page, `google-${key}-map-640`);
      await read.close();
    }

    // -- Portfolio band (COMPOSED turn) --------------------------------------------------------
    if (portfolio) {
      for (const [width, theme] of [
        [640, 'light'],
        [640, 'dark'],
        [375, 'light'],
      ] as const) {
        const scene = await openScene(
          browser,
          base,
          'portfolio:x:band',
          width,
          '[data-testid="portfolio-band"]',
          theme,
        );
        const headline = await scene.page.textContent('[data-testid="portfolio-headline"]');
        const rows = await scene.page.$$eval('[data-testid^="portfolio-row-"]', (nodes) =>
          nodes.map((node) => ({
            id: node.getAttribute('data-testid'),
            text: node.textContent ?? '',
          })),
        );
        const info = await scene.info();
        const itesoText = rows[0]?.text ?? '';
        const totalsOk =
          !itesoTotals ||
          (itesoText.includes(
            `${formatMoney(itesoTotals.after / 100, raisePreview?.currency ?? null)}/day`,
          ) &&
            (itesoTotals.before === itesoTotals.after ||
              itesoText.includes(
                formatMoney(itesoTotals.before / 100, raisePreview?.currency ?? null),
              )));
        check(
          `portfolio band @${width} ${theme}: "${expectedHeadline}", one row per campaign with its total and counts, no sideways scroll`,
          headline === expectedHeadline &&
            rows.length === 2 &&
            totalsOk &&
            itesoText.includes('1 pause') &&
            (rows[1]?.text ?? '').includes(
              `${oracle.added.size > 0 ? [...oracle.added].filter((k) => k.split('/').length === 2).length : 0} new`,
            ) &&
            info.overflowX <= 0 &&
            info.errors.length === 0,
          `${headline}; ${rows.map((row) => row.text.replace(/\s+/g, ' ').slice(0, 90)).join(' | ')}; overflowX ${info.overflowX}`,
        );
        await shoot(scene.page, `portfolio-band-${width}-${theme}`);
        if (width === 640 && theme === 'light') {
          // Tap ITESO: its Read, its changes; back to the band; tap the copy: its Read.
          await scene.page.click(`[data-testid="portfolio-row-live:${itesoId}"]`);
          await scene.page.waitForSelector('[data-testid="lectura-view"]', { timeout: 10_000 });
          const itesoRows = await marksIn(scene.page, 'lectura-change-');
          const crumb = await scene.page.textContent('[data-testid="portfolio-breadcrumb"]');
          check(
            'portfolio @640: a tap opens ITESO in Read with both approvals’ changes, breadcrumb back',
            sameSet(
              itesoRows.map((row) => row.id),
              itesoChanges,
            ) && (crumb ?? '').includes('2 campaigns'),
            `${itesoRows.map((row) => `${row.id}:${row.mark}`).join(', ')}; crumb ${crumb}`,
          );
          await shoot(scene.page, 'portfolio-iteso-read-640');
          await scene.page.click('[data-testid="portfolio-back"]');
          await scene.page.waitForSelector('[data-testid="portfolio-band"]', { timeout: 5_000 });
          await scene.page.click(
            `[data-testid="portfolio-row-scaffold:${derived.parentScaffoldId}"]`,
          );
          await scene.page.click('[data-testid="canvas-view-toggle"] [data-view="mapa"]');
          await scene.page.waitForSelector('.react-flow__node', { timeout: 10_000 });
          await scene.page.waitForTimeout(400);
          const mapCards = await marksIn(scene.page, 'portfolio-node-');
          const addedPaths = [...oracle.added];
          check(
            'portfolio @640: the copy row opens its Map, the Backend’s added nodes marked new',
            sameSet(
              mapCards.filter((card) => card.mark === 'added').map((card) => card.id),
              addedPaths,
            ),
            `${mapCards.filter((card) => card.mark === 'added').length} new of ${mapCards.length}`,
          );
          await shoot(scene.page, 'portfolio-copy-map-640');
        }
        await scene.close();
      }
      for (const width of [640, 375]) {
        const scene = await openScene(
          browser,
          base,
          'portfolio:x:chat',
          width,
          '[data-testid="portfolio-chat-card"]',
        );
        const headline = await scene.page.textContent('[data-testid="portfolio-headline"]');
        const fits = await scene.page.evaluate(() => {
          const card = document.querySelector('[data-testid="portfolio-chat-card"]') as HTMLElement;
          return card.scrollWidth <= card.clientWidth + 1;
        });
        const info = await scene.info();
        check(
          `portfolio chat card @${width}: "${expectedHeadline}", the rows, Open in canvas, fits`,
          headline === expectedHeadline &&
            (await scene.page.$$('[data-testid^="portfolio-row-"]')).length === 2 &&
            (await scene.page.$('[data-testid="portfolio-open-in-canvas"]')) !== null &&
            fits &&
            info.overflowX <= 0,
          `overflowX ${info.overflowX}`,
        );
        await shoot(scene.page, `portfolio-chat-${width}`);
        await scene.close();
      }
    }

    // -- Version line: live (COMPOSED thread) ------------------------------------------------------
    {
      const scene = await openScene(
        browser,
        base,
        'versions:live:read',
        640,
        '[data-testid="version-line"]',
      );
      const pills = await scene.page.$$eval('[data-testid^="version-v"]', (nodes) =>
        nodes.map((node) => `${node.textContent}|${node.getAttribute('aria-pressed')}`),
      );
      const applied = await scene.page.getAttribute(
        '[data-testid="version-applied"]',
        'data-applied',
      );
      check(
        'version line (live) @640: v1 → v2 · applied → v3, v3 on screen, "Applied in Meta" on',
        pills.length === 3 &&
          (pills[2] ?? '').endsWith('|true') &&
          (pills[1] ?? '').includes('applied') &&
          applied === 'true',
        pills.join(', '),
      );
      await scene.page.click('[data-testid="version-v2"]');
      await scene.page.click('[data-testid="version-compare"]');
      await scene.page.waitForSelector('[data-testid="version-compare-summary"]', {
        timeout: 5_000,
      });
      const rows = await marksIn(scene.page, 'lectura-change-');
      check(
        'version line (live) Read @640: v2 compared with v1 lists exactly the raw differences',
        sameSet(
          rows.map((row) => `${row.id}:${row.mark}`),
          [...(liveOracle?.changes ?? [])].map(([id, mark]) => `${id}:${mark}`),
        ),
        `${rows.map((row) => `${row.id}:${row.mark}`).join(', ')}; ${await scene.page.textContent('[data-testid="version-compare-summary"]')}`,
      );
      await shoot(scene.page, 'versions-live-read-compare-640');
      await scene.page.click('[data-testid="canvas-view-toggle"] [data-view="mapa"]');
      await scene.page.waitForSelector('.react-flow__node', { timeout: 10_000 });
      await scene.page.waitForTimeout(400);
      const cards = await marksIn(scene.page, 'live-change-node-');
      const info = await scene.info();
      check(
        'version line (live) Map @640: the compared cards carry the same marks, no sideways scroll',
        sameSet(
          cards
            .filter((card) => card.mark !== 'unchanged')
            .map((card) => `${card.id}:${card.mark}`),
          [...(liveOracle?.marked ?? [])].map(([id, mark]) => `${id}:${mark}`),
        ) &&
          info.overflowX <= 0 &&
          info.errors.length === 0,
        `${cards.filter((card) => card.mark !== 'unchanged').length} marked of ${cards.length}`,
      );
      await shoot(scene.page, 'versions-live-map-compare-640');
      await scene.close();
    }

    // -- Version line: the real copy and its DERIVED v2 --------------------------------------------
    for (const width of [640, 375]) {
      const scene = await openScene(
        browser,
        base,
        'versions:copy:read',
        width,
        '[data-testid="version-line"]',
      );
      await scene.page.click('[data-testid="version-compare"]');
      await scene.page.waitForSelector('[data-testid="version-compare-summary"]', {
        timeout: 5_000,
      });
      const rows = await marksIn(scene.page, 'lectura-change-');
      const cards = await marksIn(scene.page, 'lectura-adset-');
      const struck = await scene.page.evaluate(
        (id) =>
          getComputedStyle(
            document.querySelector(`[data-testid="lectura-adset-${id}"] h4`) as HTMLElement,
          ).textDecorationLine,
        derived.dropped,
      );
      const info = await scene.info();
      check(
        `version line (copy) Read @${width}: v2 against v1 — ${derived.dropped} removed and struck, ${derived.raised} changed ${derived.raisedFrom} → ${derived.raisedTo}`,
        sameSet(
          rows.map((row) => `${row.id}:${row.mark}`),
          [`${derived.dropped}:removed`, `${derived.raised}:changed`],
        ) &&
          (rows.find((row) => row.id === derived.raised)?.text ?? '').includes(derived.raisedTo) &&
          cards.find((card) => card.id === derived.dropped)?.mark === 'removed' &&
          struck.includes('line-through') &&
          info.overflowX <= 0 &&
          info.errors.length === 0,
        `${rows.map((row) => `${row.id}:${row.mark}`).join(', ')}; struck ${struck}; overflowX ${info.overflowX}`,
      );
      await shoot(scene.page, `versions-copy-read-compare-${width}`);
      if (width === 640) {
        await scene.page.click('[data-testid="canvas-view-toggle"] [data-view="mapa"]');
        await scene.page.waitForSelector('.react-flow__node', { timeout: 10_000 });
        await scene.page.waitForTimeout(400);
        const mapCards = await marksIn(scene.page, 'map-card-');
        check(
          'version line (copy) Map @640: the dropped ad set and its ads drawn removed, the raised one changed',
          sameSet(
            mapCards
              .filter((card) => card.mark !== 'unchanged')
              .map((card) => `${card.id}:${card.mark}`),
            [
              `${derived.dropped}:removed`,
              ...derived.droppedAds.map((id) => `${id}:removed`),
              `${derived.raised}:changed`,
            ],
          ),
          mapCards
            .filter((card) => card.mark !== 'unchanged')
            .map((card) => `${card.id}:${card.mark}`)
            .join(', '),
        );
        await shoot(scene.page, 'versions-copy-map-compare-640');
      }
      await scene.close();
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
  note(
    'NOT EXERCISED: the Scale page shell itself (record bar, chat stream, Supabase reads) — the components it mounts are driven directly with the captured parts.',
  );
  note(
    'NOT EXERCISED: the hosted Supabase read of the copy’s rows (fetchCanvasScaffoldRead) — the rows come from the tool’s local Postgres save, through the production row reader.',
  );
  note(
    'SYNTHETIC: the Google Search / PMax previews (labels only); every Meta hop above is a real capture.',
  );
  note(
    'NOT EXERCISED: the Scale page wiring of the portfolio and version line (JainaChatSurface → PaidMediaClient) and the scaffold companion’s own shell (its record bar reads Supabase) — the version line is drawn by the same pieces in a harness.',
  );
  if (SHOTS) note(`screenshots: ${SHOTS}`);
};

main()
  .catch((error: unknown) => record('bench', 'FAIL', errorText(error)))
  .finally(() => finish());
