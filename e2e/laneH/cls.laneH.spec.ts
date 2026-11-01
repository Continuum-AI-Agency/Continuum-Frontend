import { randomUUID } from 'node:crypto';
import { expect, type Page, type Route, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { audit, identityFor, openAs, revokeAll, shot, writeJson } from '../laneE/support';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';

// laneH:cls — how far two pages jump while they load, measured where lane E measured them
// (PP-DT-E-google-tab-load-shift, PP-DT-E-canvas-read-layout-shift), and what moved each time.
//
//   · Vivo 47's Google tab at 1024 and 1440: lane E read a CLS of 0.62–0.89 at 1440 and 3.9–15.8
//     at 1024 "while the tab streams in", and none once loaded. Read here twice: opened straight
//     on the Google tab, and the way lane E reached it (the Overview first, then a click on Google).
//   · The campaign canvas's Read on the real proposal at 1440 and 1024 (opened from the toggle) and
//     at 390 (a phone opens on Read), and on a big account (the same proposal answered with 36 ad
//     sets × 5 ads, route-fulfilled in the browser): lane E read 0.73–0.96.
//
// PART A is the product: CLS is the browser's own sum of layout-shift entries without recent
// input (a shift in the 500 ms after a click is the click's), from the navigation or the click to
// the settled page, with nothing else touching it. PART B is the harness: lane E's detector reads
// one accumulator from the page's first paint, never reset, after its own probes (audit) and its
// full-page screenshots; the shifts each of those makes on a settled page are measured on their own,
// and (PART C) the shifts of a pointer resting on the collapsed sidebar rail, which its probes do.
// Every entry is kept with the nodes it moved and by how much.
// READ ONLY: pages are opened, a platform tab and the Map/Read toggle are pressed; nothing else.

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const VIVO_47 = '61b80f51-709a-4408-9f11-04142a286baa';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
/** "EASY FIT // TEST AUDIENCIAS // MENSAJES": 1 campaign, 4 ad sets, 4 ads. */
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';
const BIG_ADSETS = 36;
const BIG_ADS_PER_ADSET = 5;
const LIMIT = 0.1;
const GOOGLE_WAIT_MS = 150_000;

type ShiftSource = { node: string; dx: number; dy: number; dw: number; dh: number; y: number };
type Shift = { t: number; value: number; input: boolean; sources: ShiftSource[] };
type NodeRow = Record<string, unknown> & { id: string; level: string; path_key: string };

declare global {
  interface Window {
    __laneHShifts?: Shift[];
  }
}

async function logShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__laneHShifts = [];
    const describe = (node: Node | null | undefined): string => {
      const el = node instanceof Element ? node : (node?.parentElement ?? null);
      if (!el) return 'unknown';
      const owner = el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
      const classes = Array.from(el.classList)
        .filter((c) => !/[[\]:/]/.test(c))
        .slice(0, 3)
        .join('.');
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''} in [${owner}] "${text}"`;
    };
    try {
      new PerformanceObserver((list) => {
        for (const raw of list.getEntries()) {
          const entry = raw as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: {
              node?: Node | null;
              previousRect: DOMRectReadOnly;
              currentRect: DOMRectReadOnly;
            }[];
          };
          window.__laneHShifts?.push({
            t: Math.round(entry.startTime),
            value: entry.value,
            input: entry.hadRecentInput,
            sources: (entry.sources ?? []).map((source) => ({
              node: describe(source.node),
              dx: Math.round(source.currentRect.x - source.previousRect.x),
              dy: Math.round(source.currentRect.y - source.previousRect.y),
              dw: Math.round(source.currentRect.width - source.previousRect.width),
              dh: Math.round(source.currentRect.height - source.previousRect.height),
              y: Math.round(source.previousRect.y),
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // No layout-shift support: the run records nothing and says so.
    }
  });
}

const shifts = (page: Page): Promise<Shift[]> => page.evaluate(() => window.__laneHShifts ?? []);
const now = (page: Page): Promise<number> => page.evaluate(() => Math.round(performance.now()));

function cls(entries: Shift[], after = -1): number {
  return Number(
    entries
      .filter((entry) => !entry.input && entry.t > after)
      .reduce((sum, entry) => sum + entry.value, 0)
      .toFixed(4),
  );
}

/** The biggest shifts, each with the nodes it moved: what a red run is read from. */
function worst(entries: Shift[], after = -1) {
  return entries
    .filter((entry) => !entry.input && entry.t > after)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((entry) => ({
      t: entry.t,
      value: Number(entry.value.toFixed(4)),
      sources: entry.sources,
    }));
}

/** What the page shows once settled, so a measured zero is a loaded page and not an empty one. */
async function onScreen(page: Page) {
  return page.evaluate(() => ({
    googleTab: document
      .querySelector('[data-testid="platform-tab-google_ads"]')
      ?.getAttribute('aria-selected'),
    findings: document.querySelectorAll('[data-testid="account-finding"]').length,
    tables: document.querySelectorAll('table').length,
    flowNodes: document.querySelectorAll('.react-flow__node').length,
    read: Boolean(document.querySelector('[data-testid="canvas-page-read"]')),
    readTable: Boolean(document.querySelector('[data-testid="lectura-table"]')),
    mainHeight: Math.round(document.querySelector('main')?.scrollHeight ?? 0),
  }));
}

async function readingSettled(page: Page): Promise<boolean> {
  const t0 = Date.now();
  let stableFor = 0;
  let lastCards = -1;
  while (Date.now() - t0 < GOOGLE_WAIT_MS) {
    const state = await page
      .evaluate(() => ({
        reading: /Reading\b[^\n]*…/.test(document.querySelector('main')?.innerText ?? ''),
        cards: document.querySelectorAll('[data-testid="account-finding"]').length,
        busy: document.querySelectorAll(
          '[aria-busy="true"], [data-slot="skeleton"], .animate-pulse',
        ).length,
      }))
      .catch(() => ({ reading: true, cards: 0, busy: 1 }));
    if (!state.reading && state.busy === 0 && state.cards === lastCards) stableFor += 1;
    else stableFor = 0;
    lastCards = state.cards;
    if (stableFor >= 3) return true;
    await page.waitForTimeout(1_000);
  }
  return false;
}

async function waitForScaffold(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('.react-flow__node').length > 0 ||
        Boolean(document.querySelector('[data-testid="lectura-view"]')) ||
        Boolean(document.querySelector('[data-testid="canvas-record-error"]')),
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(3_000);
}

/** PART C on a settled page: a pointer resting on the collapsed sidebar rail, then leaving it —
 *  what lane E's audit does when it hovers a sidebar control. */
async function sidebarHoverShifts(page: Page, viewport: { width: number; height: number }) {
  await page.mouse.move(viewport.width - 2, Math.floor(viewport.height / 2));
  await page.waitForTimeout(1_000);
  const mainBefore = await page.evaluate(
    () => document.querySelector('main')?.getBoundingClientRect().x ?? null,
  );
  const mark = await now(page);
  await page.mouse.move(24, Math.floor(viewport.height / 2));
  await page.waitForTimeout(1_200);
  const mainHovered = await page.evaluate(
    () => document.querySelector('main')?.getBoundingClientRect().x ?? null,
  );
  await page.mouse.move(viewport.width - 2, Math.floor(viewport.height / 2));
  await page.waitForTimeout(1_200);
  const entries = await shifts(page);
  return {
    cls: cls(entries, mark),
    mainX: { before: mainBefore, hovered: mainHovered },
    worst: worst(entries, mark),
  };
}

/** PART B on a settled page: the shifts lane E's own audit and a full-page screenshot make. */
async function harnessShifts(page: Page, surface: string, width: number) {
  const sidebar = await sidebarHoverShifts(page, { width, height: 900 });
  const beforeAudit = await now(page);
  await audit(page, surface, width, 'light');
  const afterAudit = await now(page);
  await shot(page, `laneH-cls-${surface.replace(/\W+/g, '-')}@${width}`, true);
  await page.waitForTimeout(1_000);
  const entries = await shifts(page);
  const during = (from: number, to: number) =>
    cls(
      entries.filter((entry) => entry.t <= to),
      from,
    );
  return {
    sidebarHover: sidebar,
    audit: during(beforeAudit, afterAudit),
    fullPageShot: cls(entries, afterAudit),
    worst: worst(entries, beforeAudit),
  };
}

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function realNodes(): Promise<NodeRow[]> {
  const { data: scaffold } = await admin
    .schema('brand_profiles')
    .from('paid_scaffolds')
    .select('current_version_id')
    .eq('id', SCAFFOLD)
    .single();
  const versionId = (scaffold as { current_version_id: string }).current_version_id;
  const { data } = await admin
    .schema('brand_profiles')
    .from('paid_scaffold_nodes')
    .select('*')
    .eq('version_id', versionId)
    .order('path_key', { ascending: true });
  return (data ?? []) as NodeRow[];
}

/** lane E's big account: the proposal's campaign with 36 ad sets of 5 ads, never written. */
function bigAccount(nodes: NodeRow[]): NodeRow[] {
  const campaign = nodes.find((n) => n.level === 'campaign');
  const adsetTemplate = nodes.find((n) => n.level === 'adset');
  const adTemplate = nodes.find((n) => n.level === 'ad');
  if (!campaign || !adsetTemplate || !adTemplate) throw new Error('scaffold lacks a level');
  const out: NodeRow[] = [campaign];
  for (let a = 0; a < BIG_ADSETS; a += 1) {
    const adsetId = randomUUID();
    out.push({
      ...adsetTemplate,
      id: adsetId,
      parent_id: campaign.id,
      ordinal: a,
      path_key: `c0/a${a}`,
      name: `TEST // Audience ${String(a + 1).padStart(2, '0')}`,
      daily_budget_minor_units: 5000 + a * 250,
    });
    for (let d = 0; d < BIG_ADS_PER_ADSET; d += 1) {
      out.push({
        ...adTemplate,
        id: randomUUID(),
        parent_id: adsetId,
        ordinal: d,
        path_key: `c0/a${a}/ad${d}`,
        name: `AD // Audience ${String(a + 1).padStart(2, '0')} // Variant ${d + 1}`,
      });
    }
  }
  return out.sort((x, y) => (x.path_key < y.path_key ? -1 : x.path_key > y.path_key ? 1 : 0));
}

test('laneH:cls — the Google tab and the canvas Read hold still while they load', async ({
  browser,
}) => {
  test.setTimeout(1_800_000);
  const identity = await identityFor(VIVO_OWNER);
  const big = bigAccount(await realNodes());
  const product: { name: string; cls: number; [key: string]: unknown }[] = [];
  const harness: Record<string, unknown>[] = [];
  try {
    for (const width of [1024, 1440]) {
      for (const via of ['direct', 'click'] as const) {
        const name = `google-tab-vivo47@${width}-${via}`;
        const opened = await openAs(browser, identity, VIVO_47, { width, height: 900 }, 'light');
        try {
          const { page } = opened;
          await logShifts(page);
          let mark = -1;
          if (via === 'direct') {
            await page.goto('/scale?tab=performance&optimizerView=overview&platform=google_ads', {
              waitUntil: 'domcontentloaded',
            });
          } else {
            await page.goto('/scale?tab=performance&optimizerView=overview', {
              waitUntil: 'domcontentloaded',
            });
            const google = page.locator('[data-testid="platform-tab-google_ads"]').first();
            await google.waitFor({ timeout: 90_000 });
            await page.waitForTimeout(4_000);
            mark = await now(page);
            if ((await google.getAttribute('aria-selected')) !== 'true') await google.click();
          }
          await page
            .locator('[data-testid="platform-tab-google_ads"][aria-selected="true"]')
            .first()
            .waitFor({ timeout: 90_000 })
            .catch(() => undefined);
          const settled = await readingSettled(page);
          await page.waitForTimeout(3_000);
          const entries = await shifts(page);
          product.push({
            name,
            settled,
            cls: cls(entries, mark),
            entries: entries.filter((entry) => entry.t > mark).length,
            screen: await onScreen(page),
            worst: worst(entries, mark),
          });
          if (via === 'click') {
            harness.push({
              name,
              ...(await harnessShifts(page, 'Optimizer/Google/vivo47', width)),
            });
          }
        } finally {
          await opened.close();
        }
      }
    }

    for (const variant of ['real', 'big'] as const) {
      for (const width of variant === 'real' ? [1440, 1024, 390] : [1440, 1024]) {
        const name = `canvas-read-${variant}@${width}`;
        const opened = await openAs(
          browser,
          identity,
          EASYFIT_2026,
          { width, height: 900 },
          'light',
        );
        try {
          const { page } = opened;
          await logShifts(page);
          if (variant === 'big') {
            await page.route('**/rest/v1/paid_scaffold_nodes**', async (route: Route) => {
              if (route.request().method() !== 'GET') return route.continue();
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(big),
              });
            });
          }
          await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
            waitUntil: 'domcontentloaded',
          });
          await waitForScaffold(page);
          const loaded = await shifts(page);
          const opensOnRead = (await page.locator('[data-testid="canvas-page-read"]').count()) > 0;
          let mark = -1;
          if (!opensOnRead) {
            mark = await now(page);
            await page.locator('[data-testid="canvas-view-toggle"] [data-view="lectura"]').click();
            await page
              .locator('[data-testid="canvas-page-read"]')
              .first()
              .waitFor({ timeout: 30_000 })
              .catch(() => undefined);
          }
          await page.waitForTimeout(5_000);
          const entries = await shifts(page);
          product.push({
            name,
            opensOnRead,
            mapLoadCls: cls(loaded),
            cls: cls(entries, mark),
            entries: entries.filter((entry) => entry.t > mark).length,
            screen: await onScreen(page),
            worst: worst(entries, mark),
          });
          if (variant === 'real' && width !== 390) {
            harness.push({ name, ...(await harnessShifts(page, 'CampaignCanvas/read', width)) });
          }
        } finally {
          await opened.close();
        }
      }
    }
  } finally {
    const cleanup = await revokeAll();
    writeJson(`cls-${process.env.LANE_H_LABEL ?? 'run'}`, { product, harness, cleanup });
  }

  for (const result of product) {
    expect.soft(result.cls, `${result.name}: CLS while it loads`).toBeLessThanOrEqual(LIMIT);
  }
});
