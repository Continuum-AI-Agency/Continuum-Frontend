import { expect, type Page, test } from '@playwright/test';
import { identityFor, openAs, revokeAll, writeJson } from '../laneE/support';
import { resolveAxeScript } from '../support/visualInvariants';

// laneH:lows — three of lane E's low findings, read in the real app the way a person meets them.
//
//   · PP-DT-E-scale-header-phone-overlap: on a brand with no ad account assigned the Scale header's
//     picker is its recovery state. At 390 nothing in it may sit on the module switch (every tab
//     takes its own tap), and a read that answered with no account offers Connect, not Retry.
//     No brand these identities open is in that state today (Diésel, the one with no account, has
//     no paid plan and is sent to billing), so Pink Elephant is opened with the brand's assigned
//     account list (plugin_mcp.list_brand_ad_accounts, a browser read) answered empty in the
//     browser: the page, the header and the picker are the real ones; the one hop not exercised is
//     a brand whose database row has no account.
//   · PP-DT-E-optimizer-meta-reads-on-google-account: Pink Elephant and Tangassi (Funeraria en San
//     Luis Potosí) have Google accounts only. Scale on them posts nothing to the Meta reader with a
//     Google customer id, answers no 404, and never says "No active ad sets found".
//   · PP-DT-E-canvas-map-node-contrast: the campaign canvas Map's node header labels pass axe
//     color-contrast in light and in dark.
// READ ONLY through lane E's harness: pages are opened and read, nothing is pressed but the views.

const RAMI = 'ramibuisel@gmail.com';
const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const PINK = '8e5b7185-e43f-4150-b763-b86c4f5297a0';
const TANGASSI = '9f7e830f-6445-4bba-b199-a2db07fa184a';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function headerFit(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const bar = document.querySelector('[data-testid="scale-header-bar"]');
    const connect = Array.from(bar?.querySelectorAll('a') ?? []).find((a) =>
      /connect ad account/i.test(a.textContent ?? ''),
    );
    const retry = bar?.querySelector('button[aria-label="Retry loading ad accounts"]');
    const tabs = Array.from(bar?.querySelectorAll('[role="tab"]') ?? []).map((tab) => {
      const b = box(tab);
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return {
        name: (tab.textContent ?? '').trim(),
        box: b,
        ownTap: Boolean(hit && (tab === hit || tab.contains(hit))),
      };
    });
    return {
      connect: connect ? box(connect) : null,
      connectWordsShown: connect
        ? Array.from(connect.querySelectorAll('span')).some(
            (s) =>
              s.textContent === 'Connect ad account' && getComputedStyle(s).position !== 'absolute',
          ) || !connect.querySelector('span')
        : null,
      retry: retry ? box(retry) : null,
      tabs,
    };
  });
}

test('laneH:lows — the Scale header on a phone, Meta reads on Google accounts, the Map labels', async ({
  browser,
}) => {
  test.setTimeout(1_800_000);
  const rami = await identityFor(RAMI);
  const vivo = await identityFor(VIVO_OWNER);
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const parts = (process.env.LANE_H_PARTS ?? 'header,reads,map').split(',');
  const check = (name: string, ok: boolean, detail: unknown) => {
    results.push({ name, ok, detail });
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail).slice(0, 400)}`);
  };
  try {
    // 1. The Scale header with no ad account, phone and desktop.
    for (const { width, theme } of parts.includes('header')
      ? [
          { width: 390, theme: 'light' as const },
          { width: 390, theme: 'dark' as const },
          { width: 1440, theme: 'light' as const },
        ]
      : []) {
      const cell = `no-account-header@${width}-${theme}`;
      const opened = await openAs(browser, rami, PINK, { width, height: 844 }, theme);
      try {
        await opened.page.route('**/rest/v1/rpc/list_brand_ad_accounts**', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
        );
        await opened.page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
        await opened.page
          .locator('[data-testid="scale-header-bar"] a', { hasText: /connect ad account/i })
          .first()
          .waitFor({ state: 'attached', timeout: 90_000 });
        await opened.page.waitForTimeout(2_000);
        const fit = await headerFit(opened.page);
        const covered = fit.tabs.filter(
          (tab) =>
            (fit.connect && overlaps(fit.connect, tab.box)) ||
            (fit.retry && overlaps(fit.retry, tab.box)),
        );
        check(`${cell}: no recovery control sits on a module tab`, covered.length === 0, {
          covered: covered.map((tab) => tab.name),
          fit,
        });
        check(
          `${cell}: every module tab takes its own tap`,
          fit.tabs.length > 0 && fit.tabs.every((tab) => tab.ownTap),
          fit.tabs.map((tab) => `${tab.name}:${tab.ownTap}`),
        );
        check(`${cell}: an answered read offers Connect, not Retry`, fit.retry === null, fit.retry);
        if (width === 1440) {
          check(`${cell}: the words show with room`, fit.connectWordsShown === true, fit);
        }
      } finally {
        await opened.close();
      }
    }

    // 2. Google-only brands: nothing posted to the Meta reader with a Google customer id.
    for (const [key, brand] of parts.includes('reads')
      ? ([
          ['pink', PINK],
          ['tangassi', TANGASSI],
        ] as const)
      : []) {
      const cell = `${key}-meta-reads@1440`;
      const opened = await openAs(browser, rami, brand, { width: 1440, height: 900 }, 'light');
      const metaPosts: string[] = [];
      opened.page.on('request', (request) => {
        if (!request.url().includes('/functions/v1/paid-media-metrics')) return;
        try {
          const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
          if (body.platform === 'meta') metaPosts.push(`${body.scope}:${body.accountId}`);
        } catch {
          // A body that is not JSON is not a Meta read.
        }
      });
      try {
        await opened.page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
        await opened.page.waitForTimeout(25_000);
        const text = await opened.page
          .locator('main')
          .first()
          .innerText()
          .catch(() => '');
        const googlePosts = metaPosts.filter((post) => /:\d{10}$/.test(post));
        check(`${cell}: no Google customer posted to the Meta reader`, googlePosts.length === 0, {
          googlePosts,
          metaPosts,
        });
        check(
          `${cell}: no 404`,
          opened.events.notFound.length === 0,
          opened.events.notFound.slice(0, 5),
        );
        check(
          `${cell}: never "No active ad sets found" on a Google account`,
          !/No active ad sets found/.test(text),
          text.match(/No active [^.]*\./)?.[0] ?? null,
        );
      } finally {
        await opened.close();
      }
    }

    // 3. The Map's node header labels, axe color-contrast, light and dark.
    const axe = resolveAxeScript();
    for (const theme of parts.includes('map') ? (['light', 'dark'] as const) : []) {
      const cell = `canvas-map-headers@1440-${theme}`;
      const opened = await openAs(browser, vivo, EASYFIT_2026, { width: 1440, height: 900 }, theme);
      try {
        await opened.page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
          waitUntil: 'domcontentloaded',
        });
        await opened.page
          .locator('.react-flow__node [data-slot="card-header"]')
          .first()
          .waitFor({ timeout: 90_000 });
        await opened.page.waitForTimeout(2_000);
        if (axe) await opened.page.addScriptTag({ path: axe });
        // axe scoped by selector: the labels the finding names, then the whole header for what
        // else sits on it (recorded, not asserted — the badges are not this finding's).
        const axeOn = (selector: string) =>
          opened.page.evaluate(async (scope) => {
            type AxeNode = {
              target: unknown[];
              html: string;
              any: { data?: Record<string, unknown> }[];
            };
            type AxeResult = { violations: { nodes: AxeNode[] }[]; passes: { nodes: unknown[] }[] };
            const axeRun = (
              window as unknown as {
                axe?: { run: (context: unknown, options: unknown) => Promise<AxeResult> };
              }
            ).axe?.run;
            const count = document.querySelectorAll(scope).length;
            if (!axeRun) return { count, axe: false, violations: [], passes: 0 };
            const result = await axeRun(
              { include: [[scope]] },
              { runOnly: { type: 'rule', values: ['color-contrast'] } },
            );
            return {
              count,
              axe: true,
              violations: result.violations.flatMap((v) =>
                v.nodes.map((n) => ({
                  ...(n.any[0]?.data ?? {}),
                  target: String(n.target[0] ?? ''),
                  html: n.html.slice(0, 160),
                })),
              ),
              passes: result.passes.reduce((sum, p) => sum + p.nodes.length, 0),
            };
          }, selector);
        const labels = await axeOn(
          '.react-flow__node [data-slot="card-header"] [data-slot="card-title"]',
        );
        const headers = await axeOn('.react-flow__node [data-slot="card-header"]');
        check(
          `${cell}: every node header label passes axe color-contrast`,
          labels.axe && labels.count > 0 && labels.violations.length === 0,
          labels,
        );
        results.push({ name: `${cell}: the rest of the headers (not asserted)`, headers });
      } finally {
        await opened.close();
      }
    }
  } finally {
    const cleanup = await revokeAll();
    writeJson(`lows-verify-${process.env.LANE_H_LABEL ?? 'run'}`, { results, failures, cleanup });
  }
  expect(failures).toEqual([]);
});
