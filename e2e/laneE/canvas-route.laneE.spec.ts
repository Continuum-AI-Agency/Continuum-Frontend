import { randomUUID } from 'node:crypto';
import { expect, type Page, type Route, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createBenchRecorder } from '../support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';
import {
  audit,
  cells,
  identityFor,
  Observations,
  openAs,
  revokeAll,
  settle,
  shot,
} from './support';

// laneE:canvas — the campaign canvas, design C (FE 484ebbd7..2671ff34), in the REAL app route
// (/scale/campaign-canvas), on what canvas:e2e:bench (a component harness at 640/375 on captured
// payloads) does not drive:
//   · the page with a real production scaffold at 390 / 1024 / 1440 × light / dark: the top bar
//     (Back to chat · proposal picker · Map/Read) fits and never covers Read, a phone opens Read
//     with the Map disabled and saying why;
//   · keyboard: the toggle and the bar reached with Tab, Space flips the view;
//   · empty (a brand with no proposal) and error (an unknown scaffold id; a failed read) states;
//   · a big account: the proposal's node rows answered with 1 campaign × 36 ad sets × 5 ads
//     (route-fulfilled in the browser, nothing written), Read must switch to its table and
//     the Map must not scroll the page sideways.
// READ ONLY: no Save, Propose, Deploy or Jaina send. Opening a proposal only reads it.

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const VIVO_47 = '61b80f51-709a-4408-9f11-04142a286baa';
/** "EASY FIT // TEST AUDIENCIAS // MENSAJES": 1 campaign, 4 ad sets, 4 ads, proposed 10-31. */
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';
const BIG_ADSETS = 36;
const BIG_ADS_PER_ADSET = 5;

type NodeRow = Record<string, unknown> & {
  id: string;
  level: string;
  path_key: string;
  parent_id: string | null;
};

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

function bigAccount(nodes: NodeRow[]): NodeRow[] {
  const campaign = nodes.find((n) => n.level === 'campaign');
  const adsetTemplate = nodes.find((n) => n.level === 'adset');
  const adTemplate = nodes.find((n) => n.level === 'ad');
  if (!campaign || !adsetTemplate || !adTemplate)
    throw new Error('scaffold lacks a level to clone');
  const out: NodeRow[] = [campaign];
  for (let a = 0; a < BIG_ADSETS; a += 1) {
    const adsetId = randomUUID();
    out.push({
      ...adsetTemplate,
      id: adsetId,
      parent_id: campaign.id,
      ordinal: a,
      path_key: `c0/a${a}`,
      name: `TEST // Audience ${String(a + 1).padStart(2, '0')} · ${['Familia', 'Principiantes', 'Salud', 'Jóvenes', 'Corporativo', 'Mamás'][a % 6]} (${18 + (a % 5) * 5}-${45 + (a % 4) * 5})`,
      daily_budget_minor_units: 5000 + a * 250,
    });
    for (let d = 0; d < BIG_ADS_PER_ADSET; d += 1) {
      out.push({
        ...adTemplate,
        id: randomUUID(),
        parent_id: adsetId,
        ordinal: d,
        path_key: `c0/a${a}/ad${d}`,
        name: `AD // Audience ${String(a + 1).padStart(2, '0')} // Variant ${d + 1} with a long descriptive name to stress truncation`,
      });
    }
  }
  return out.sort((x, y) => (x.path_key < y.path_key ? -1 : x.path_key > y.path_key ? 1 : 0));
}

async function topBar(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    };
    const read = document.querySelector(
      '[data-testid="canvas-page-read"] [data-testid="lectura-view"], [data-testid="canvas-page-read"]',
    );
    let readCovered: string | null = null;
    if (read) {
      // The first heading/card inside Read: is its top-left reachable, or does the bar cover it?
      const first = read.querySelector(
        'h1, h2, h3, section, [data-testid^="lectura-"]',
      ) as HTMLElement | null;
      if (first) {
        const r = first.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + 8, r.y + 6);
        if (hit && !first.contains(hit) && !read.contains(hit))
          readCovered = `${hit.tagName.toLowerCase()}[${hit.getAttribute('data-testid') ?? ''}] covers ${first.tagName.toLowerCase()} at y=${Math.round(r.y)}`;
      }
    }
    return {
      vw: window.innerWidth,
      back: rect('[data-testid="canvas-back-to-chat"]'),
      bar: rect('[data-testid="canvas-record-bar"]'),
      toggle: rect('[data-testid="canvas-view-toggle"]'),
      picker: rect('[data-testid="canvas-scaffold-picker"]'),
      mapDisabled:
        (
          document.querySelector(
            '[data-testid="canvas-view-toggle"] [data-view="mapa"]',
          ) as HTMLButtonElement | null
        )?.disabled ?? null,
      mapTitle:
        document
          .querySelector('[data-testid="canvas-view-toggle"] [data-view="mapa"]')
          ?.getAttribute('title') ?? null,
      readPressed:
        document
          .querySelector('[data-testid="canvas-view-toggle"] [data-view="lectura"]')
          ?.getAttribute('aria-pressed') ?? null,
      readShown: Boolean(document.querySelector('[data-testid="canvas-page-read"]')),
      flowNodes: document.querySelectorAll('.react-flow__node').length,
      lecturaTable: Boolean(document.querySelector('[data-testid="lectura-table"]')),
      lecturaAdsets: document.querySelectorAll(
        '[data-testid^="lectura-adset-"], [data-testid^="lectura-row-"]',
      ).length,
      recordError:
        (document.querySelector('[data-testid="canvas-record-error"]')?.textContent ?? '').trim() ||
        null,
      recordEmpty:
        (document.querySelector('[data-testid="canvas-record-empty"]')?.textContent ?? '').trim() ||
        null,
      pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      readCovered,
    };
  });
}

const offscreen = (box: { x: number; right: number } | null, vw: number) =>
  box ? box.x < 0 || box.right > vw : false;

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
  await settle(page, 30_000);
}

test('laneE:canvas — real route: 390·1024·1440 × light·dark, keyboard, empty, error, big account', async ({
  browser,
}) => {
  test.setTimeout(3_000_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:canvas', notes);
  const obs = new Observations('canvas');
  const identity = await identityFor(VIVO_OWNER);
  const nodes = await realNodes();
  obs.add({ scaffold: SCAFFOLD, realNodes: nodes.length });
  try {
    // 1. The real proposal, every cell.
    for (const { viewport, theme } of cells()) {
      const cell = `scaffold@${viewport.width}-${theme}`;
      const opened = await openAs(browser, identity, EASYFIT_2026, viewport, theme);
      const { page } = opened;
      try {
        const t0 = Date.now();
        await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForScaffold(page);
        const loadMs = Date.now() - t0;
        const bar = await topBar(page);
        const report = await audit(page, 'CampaignCanvas/scaffold', viewport.width, theme);
        const path = await shot(page, `canvas-${cell}`, false);
        obs.add({
          cell,
          loadMs,
          bar,
          violations: report.violations,
          events: opened.events,
          guard: opened.guard.blocked,
          shot: path,
        });
        recorder.record(
          `${cell}: the proposal loads (Map nodes or Read)`,
          bar.flowNodes > 0 || bar.readShown ? 'PASS' : 'FAIL',
          `${bar.flowNodes} nodes, read=${bar.readShown}, error=${bar.recordError} in ${loadMs} ms`,
        );
        const clipped = ['back', 'bar', 'toggle'].filter((k) =>
          offscreen(bar[k as 'back'] as never, bar.vw),
        );
        recorder.record(
          `${cell}: the top bar fits the screen`,
          clipped.length === 0 ? 'PASS' : 'FAIL',
          clipped.length
            ? `${clipped.join(', ')} outside 0..${bar.vw}: ${JSON.stringify({ back: bar.back, bar: bar.bar, toggle: bar.toggle })}`
            : undefined,
        );
        if (viewport.width <= 640) {
          recorder.record(
            `${cell}: a phone opens Read, the Map disabled with its reason`,
            bar.readShown && bar.mapDisabled === true && bar.mapTitle ? 'PASS' : 'FAIL',
            JSON.stringify({
              readShown: bar.readShown,
              mapDisabled: bar.mapDisabled,
              mapTitle: bar.mapTitle,
            }),
          );
        }
        recorder.record(
          `${cell}: Read is never under the bar`,
          bar.readCovered ? 'FAIL' : 'PASS',
          bar.readCovered ?? undefined,
        );
        recorder.record(
          `${cell}: no sideways page scroll`,
          bar.pageScrollX <= 1 ? 'PASS' : 'FAIL',
          `${bar.pageScrollX}px`,
        );
        recorder.record(
          `${cell}: geometric detector`,
          report.violations.length === 0 ? 'PASS' : 'FAIL',
          report.violations
            .slice(0, 6)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
            .join(' | '),
        );
        const l1 = [
          ...opened.events.consoleErrors,
          ...opened.events.pageErrors,
          ...opened.events.serverErrors,
        ];
        recorder.record(
          `${cell}: no console error / 5xx`,
          l1.length === 0 ? 'PASS' : 'FAIL',
          l1.slice(0, 3).join(' | '),
        );

        // Read at the wider widths too (the toggle), then keyboard once.
        if (viewport.width > 640 && !bar.readShown) {
          await page.locator('[data-testid="canvas-view-toggle"] [data-view="lectura"]').click();
          await page.waitForTimeout(800);
          const read = await topBar(page);
          const readAudit = await audit(
            page,
            'CampaignCanvas/scaffold-read',
            viewport.width,
            theme,
          );
          await shot(page, `canvas-${cell}-read`, false);
          obs.add({ cell: `${cell}-read`, bar: read, violations: readAudit.violations });
          recorder.record(`${cell}: Read via the toggle`, read.readShown ? 'PASS' : 'FAIL');
          recorder.record(
            `${cell}: Read is never under the bar (toggle)`,
            read.readCovered ? 'FAIL' : 'PASS',
            read.readCovered ?? undefined,
          );
          recorder.record(
            `${cell}: Read geometric detector`,
            readAudit.violations.length === 0 ? 'PASS' : 'FAIL',
            readAudit.violations
              .slice(0, 6)
              .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
              .join(' | '),
          );
        }
        if (viewport.width === 1440 && theme === 'light') {
          await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          await waitForScaffold(page);
          await page
            .locator('body')
            .click({ position: { x: 5, y: 5 } })
            .catch(() => undefined);
          const order: string[] = [];
          for (let i = 0; i < 45; i += 1) {
            await page.keyboard.press('Tab');
            order.push(
              await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return 'none';
                return `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}${el.getAttribute('data-view') ? `{${el.getAttribute('data-view')}}` : ''}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}`;
              }),
            );
          }
          const readButton = page.locator(
            '[data-testid="canvas-view-toggle"] [data-view="lectura"]',
          );
          await readButton.focus();
          await page.keyboard.press('Space');
          await page.waitForTimeout(600);
          const afterSpace = await topBar(page);
          const focusVisible = await readButton.evaluate((el) => {
            const s = getComputedStyle(el);
            return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
          });
          obs.add({
            cell: 'keyboard@1440-light',
            tabOrder: order,
            afterSpace: { readShown: afterSpace.readShown, readPressed: afterSpace.readPressed },
            focusVisible,
          });
          const reachedAt = order.findIndex((o) => o.includes('{lectura}'));
          recorder.record(
            'keyboard: the bar and toggle are reached with Tab',
            reachedAt >= 0 && order.some((o) => o.includes('canvas-back-to-chat'))
              ? 'PASS'
              : 'FAIL',
            `Read reached at Tab #${reachedAt + 1}: ${order.slice(0, 30).join(' → ')}`,
          );
          recorder.record(
            'keyboard: Space on Read shows Read',
            afterSpace.readShown && afterSpace.readPressed === 'true' ? 'PASS' : 'FAIL',
            JSON.stringify({
              readShown: afterSpace.readShown,
              pressed: afterSpace.readPressed,
              focusVisible,
            }),
          );
        }
      } catch (error) {
        recorder.record(`${cell}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
        await shot(page, `canvas-${cell}-error`, false);
      } finally {
        await opened.close();
      }
    }

    // 2. Empty: Vivo 47 has no proposal.
    for (const { viewport, theme } of [
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
      { viewport: { width: 390, height: 844 }, theme: 'dark' as const },
    ]) {
      const cell = `empty@${viewport.width}-${theme}`;
      const opened = await openAs(browser, identity, VIVO_47, viewport, theme);
      const { page } = opened;
      try {
        await page.goto('/scale/campaign-canvas', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page
          .locator('[data-testid="canvas-record-bar"]')
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        await settle(page, 30_000);
        const bar = await topBar(page);
        const text = (await page.locator('body').innerText()).slice(0, 1500);
        const report = await audit(page, 'CampaignCanvas/empty', viewport.width, theme, 'empty');
        await shot(page, `canvas-${cell}`, false);
        obs.add({ cell, bar, text, violations: report.violations, events: opened.events });
        recorder.record(
          `${cell}: the empty state says there is no proposal`,
          bar.recordEmpty || /No campaign on the canvas yet|no proposal/i.test(text)
            ? 'PASS'
            : 'FAIL',
          bar.recordEmpty ?? text.slice(0, 200),
        );
        recorder.record(
          `${cell}: geometric detector`,
          report.violations.length === 0 ? 'PASS' : 'FAIL',
          report.violations
            .slice(0, 6)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
            .join(' | '),
        );
      } finally {
        await opened.close();
      }
    }

    // 3. Errors: an unknown scaffold id, and the proposal read failing in the browser.
    {
      const cell = 'error-unknown@1440-light';
      const opened = await openAs(
        browser,
        identity,
        EASYFIT_2026,
        { width: 1440, height: 900 },
        'light',
      );
      const { page } = opened;
      try {
        await page.goto('/scale/campaign-canvas?scaffold=00000000-0000-4000-8000-000000000000', {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page
          .locator('[data-testid="canvas-record-bar"]')
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        await settle(page, 30_000);
        const bar = await topBar(page);
        const text = (await page.locator('body').innerText()).slice(0, 1500);
        await shot(page, `canvas-${cell}`, false);
        obs.add({ cell, bar, text });
        recorder.record(
          `${cell}: an unknown proposal says so, with a way out`,
          bar.recordError || /unavailable|not found|couldn.t|could not/i.test(text)
            ? 'PASS'
            : 'FAIL',
          bar.recordError ?? text.slice(0, 240),
        );
      } finally {
        await opened.close();
      }
    }
    {
      const cell = 'error-read-fails@1440-dark';
      const opened = await openAs(
        browser,
        identity,
        EASYFIT_2026,
        { width: 1440, height: 900 },
        'dark',
      );
      const { page } = opened;
      try {
        await page.route('**/rest/v1/paid_scaffold_nodes**', (route: Route) =>
          route.abort('failed'),
        );
        await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page
          .locator('[data-testid="canvas-record-error"]')
          .waitFor({ timeout: 60_000 })
          .catch(() => undefined);
        await settle(page, 20_000);
        const bar = await topBar(page);
        const retry = await page.locator('[data-testid="canvas-record-retry"]').count();
        await shot(page, `canvas-${cell}`, false);
        const report = await audit(page, 'CampaignCanvas/error', 1440, 'dark', 'error');
        obs.add({ cell, bar, retry, violations: report.violations });
        recorder.record(
          `${cell}: a failed read shows the error and Retry`,
          bar.recordError && retry > 0 ? 'PASS' : 'FAIL',
          `${bar.recordError} · retry=${retry}`,
        );
        recorder.record(
          `${cell}: geometric detector`,
          report.violations.length === 0 ? 'PASS' : 'FAIL',
          report.violations
            .slice(0, 6)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
            .join(' | '),
        );
      } finally {
        await opened.close();
      }
    }

    // 4. A big account: the same proposal answered with 36 ad sets × 5 ads.
    const big = bigAccount(nodes);
    for (const { viewport, theme } of [
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
      { viewport: { width: 1024, height: 768 }, theme: 'dark' as const },
      { viewport: { width: 390, height: 844 }, theme: 'light' as const },
    ]) {
      const cell = `big@${viewport.width}-${theme}`;
      const opened = await openAs(browser, identity, EASYFIT_2026, viewport, theme);
      const { page } = opened;
      try {
        await page.route('**/rest/v1/paid_scaffold_nodes**', async (route: Route) => {
          if (route.request().method() !== 'GET') return route.continue();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(big),
          });
        });
        const t0 = Date.now();
        await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await waitForScaffold(page);
        const mapMs = Date.now() - t0;
        const mapBar = await topBar(page);
        const mapAudit = await audit(page, 'CampaignCanvas/big-map', viewport.width, theme);
        await shot(page, `canvas-${cell}-map`, false);
        if (!mapBar.readShown) {
          await page.locator('[data-testid="canvas-view-toggle"] [data-view="lectura"]').click();
          await page.waitForTimeout(1200);
        }
        const readBar = await topBar(page);
        const readAudit = await audit(page, 'CampaignCanvas/big-read', viewport.width, theme);
        await shot(page, `canvas-${cell}-read`, true);
        obs.add({
          cell,
          mapMs,
          mapBar,
          readBar,
          mapViolations: mapAudit.violations,
          readViolations: readAudit.violations,
          events: opened.events,
        });
        recorder.record(
          `${cell}: the big proposal loads`,
          mapBar.flowNodes > 0 || mapBar.readShown ? 'PASS' : 'FAIL',
          `${mapBar.flowNodes} map nodes in ${mapMs} ms`,
        );
        recorder.record(
          `${cell}: Read switches to its table past 12 ad sets`,
          readBar.lecturaTable ? 'PASS' : 'FAIL',
          `table=${readBar.lecturaTable} rows=${readBar.lecturaAdsets}`,
        );
        recorder.record(
          `${cell}: no sideways page scroll`,
          readBar.pageScrollX <= 1 && mapBar.pageScrollX <= 1 ? 'PASS' : 'FAIL',
          `map ${mapBar.pageScrollX}px read ${readBar.pageScrollX}px`,
        );
        recorder.record(
          `${cell}: Map geometric detector`,
          mapAudit.violations.length === 0 ? 'PASS' : 'FAIL',
          mapAudit.violations
            .slice(0, 5)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 160))
            .join(' | '),
        );
        recorder.record(
          `${cell}: Read geometric detector`,
          readAudit.violations.length === 0 ? 'PASS' : 'FAIL',
          readAudit.violations
            .slice(0, 5)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 160))
            .join(' | '),
        );
      } catch (error) {
        recorder.record(`${cell}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
      } finally {
        await opened.close();
      }
    }
  } finally {
    notes.push(...(await revokeAll()));
    notes.push(`observations: ${obs.flush()}`);
    recorder.print();
  }
  expect(true).toBe(true);
});
