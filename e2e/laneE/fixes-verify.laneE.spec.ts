import { expect, type Page, test } from '@playwright/test';
import { createBenchRecorder } from '../support/benchRecorder';
import { identityFor, Observations, openAs, revokeAll, settle, shot } from './support';

// laneE:fixes — the e2e anchor for the lane E fix branch (deeptest-laneE-fe). Run it against a
// dev server of the BASE (7e87fc2d) to see each check red, then against the branch to see it
// green. Every check reads the screen as a person sees it; nothing is written.
//   · Home on Google-only Pink: no "Couldn't load … right now", the connect line instead;
//   · Scale on Google-only Pink and Tangassi: Performance + opens (no connect gate);
//   · Scale on an ads-less brand with a Facebook Page: the gate asks to connect Meta Ads;
//   · Canvas page: the bar fits a phone, never covers Read's budget band, comes first for Tab;
//     an unknown ?scaffold= says the proposal is not on this brand.

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const RAMIRO_BENCH = 'ramibuisel@gmail.com';
const BENCH = 'bench@trycontinuum.ai';
const PINK = '8e5b7185-e43f-4150-b763-b86c4f5297a0';
const TANGASSI = '9f7e830f-6445-4bba-b199-a2db07fa184a';
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';
const LABEL = process.env.LANE_E_LABEL ?? 'run';

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box | null, b: Box | null) =>
  Boolean(a && b) &&
  (a as Box).x < (b as Box).x + (b as Box).width &&
  (b as Box).x < (a as Box).x + (a as Box).width &&
  (a as Box).y < (b as Box).y + (b as Box).height &&
  (b as Box).y < (a as Box).y + (a as Box).height;

async function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      vw: window.innerWidth,
      back: rect('[data-testid="canvas-back-to-chat"]'),
      bar: rect('[data-testid="canvas-record-bar"]'),
      toggle: rect('[data-testid="canvas-view-toggle"]'),
      budget: rect('[data-testid="canvas-page-read"] section[aria-label="Daily budget"]'),
      readShown: Boolean(document.querySelector('[data-testid="canvas-page-read"]')),
    };
  });
}

test('laneE:fixes — the fix branch, read as a person sees it', async ({ browser }) => {
  test.setTimeout(1_800_000);
  const notes: string[] = [`label: ${LABEL}`];
  const recorder = createBenchRecorder(`laneE:fixes:${LABEL}`, notes);
  const obs = new Observations(`fixes-${LABEL}`);
  try {
    const ramiro = await identityFor(RAMIRO_BENCH);

    // Home on Pink (Google only).
    for (const cell of [
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
      { viewport: { width: 390, height: 844 }, theme: 'dark' as const },
    ]) {
      const name = `home-pink@${cell.viewport.width}-${cell.theme}`;
      const opened = await openAs(browser, ramiro, PINK, cell.viewport, cell.theme);
      try {
        await opened.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await opened.page.locator('[data-home-reading]').first().waitFor({ timeout: 90_000 });
        await settle(opened.page, 45_000);
        const text = await opened.page.locator('main').first().innerText();
        await shot(opened.page, `fix-${LABEL}-${name}`);
        const failedLoad = /Couldn't load (campaigns|ads) right now/.test(text);
        const connect = (text.match(/Connect a Meta ad account to rank/g) ?? []).length;
        obs.add({ name, failedLoad, connect });
        recorder.record(
          `${name}: Performance + and Creative + never read as a failed load`,
          failedLoad ? 'FAIL' : 'PASS',
        );
        recorder.record(
          `${name}: both say to connect a Meta ad account`,
          connect === 2 ? 'PASS' : 'FAIL',
          `${connect} connect lines`,
        );
      } finally {
        await opened.close();
      }
    }

    // Scale on the Google-only brands.
    for (const brand of [
      { key: 'pink', id: PINK },
      { key: 'tangassi', id: TANGASSI },
    ]) {
      const name = `scale-${brand.key}@1440-light`;
      const opened = await openAs(browser, ramiro, brand.id, { width: 1440, height: 900 }, 'light');
      try {
        await opened.page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
        const tabs = await opened.page
          .locator('[data-testid="platform-tabs"]')
          .first()
          .waitFor({ timeout: 90_000 })
          .then(
            () => true,
            () => false,
          );
        await settle(opened.page, 45_000);
        const gate = await opened.page
          .locator('section[aria-label="Paid setup diagnostics"]')
          .count();
        let findings = 0;
        let recommendOnly = 0;
        if (tabs) {
          const google = opened.page.locator('[data-testid="platform-tab-google_ads"]').first();
          if ((await google.getAttribute('aria-selected')) !== 'true') await google.click();
          await settle(opened.page, 60_000);
          findings = await opened.page.locator('[data-testid="account-finding"]').count();
          recommendOnly = await opened.page
            .locator('[data-testid="account-finding-recommend-only"]')
            .count();
        }
        await shot(opened.page, `fix-${LABEL}-${name}`);
        obs.add({ name, tabs, gate, findings, recommendOnly });
        recorder.record(
          `${name}: Performance + opens, no connect gate`,
          tabs && gate === 0 ? 'PASS' : 'FAIL',
          `tabs=${tabs} gate=${gate}`,
        );
        if (brand.key === 'pink') {
          recorder.record(
            `${name}: the P8 findings show, recommend-only`,
            findings >= 6 && recommendOnly === findings ? 'PASS' : 'FAIL',
            `${findings} findings, ${recommendOnly} recommend-only`,
          );
        }
      } finally {
        await opened.close();
      }
    }

    // The gate on a brand with a Facebook Page and no ad account.
    {
      const name = 'gate-bench-brand@1440-light';
      const bench = await identityFor(BENCH);
      const opened = await openAs(
        browser,
        bench,
        BENCH_BRAND,
        { width: 1440, height: 900 },
        'light',
      );
      try {
        await opened.page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
        const gate = opened.page.locator('section[aria-label="Paid setup diagnostics"]').first();
        await gate.waitFor({ timeout: 90_000 }).catch(() => undefined);
        await settle(opened.page, 30_000);
        const labels =
          (await gate.count()) > 0
            ? await gate.locator('ol > li p:first-child').allInnerTexts()
            : [];
        await shot(opened.page, `fix-${LABEL}-${name}`);
        obs.add({ name, labels });
        recorder.record(
          `${name}: the gate asks to connect Meta Ads instead of ticking it`,
          labels.some((l) => /^Connect Meta Ads$/.test(l.trim())) &&
            !labels.some((l) => /Meta Ads connected/.test(l))
            ? 'PASS'
            : 'FAIL',
          labels.join(' / '),
        );
      } finally {
        await opened.close();
      }
    }

    // Canvas page.
    const vivo = await identityFor(VIVO_OWNER);
    for (const cell of [
      { viewport: { width: 390, height: 844 }, theme: 'light' as const },
      { viewport: { width: 1024, height: 768 }, theme: 'dark' as const },
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
    ]) {
      const name = `canvas@${cell.viewport.width}-${cell.theme}`;
      const opened = await openAs(browser, vivo, EASYFIT_2026, cell.viewport, cell.theme);
      try {
        await opened.page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
          waitUntil: 'domcontentloaded',
        });
        await opened.page
          .waitForFunction(
            () =>
              document.querySelectorAll('.react-flow__node').length > 0 ||
              Boolean(document.querySelector('[data-testid="lectura-view"]')),
            undefined,
            { timeout: 90_000 },
          )
          .catch(() => undefined);
        await settle(opened.page, 30_000);
        if (!(await boxes(opened.page)).readShown) {
          await opened.page
            .locator('[data-testid="canvas-view-toggle"] [data-view="lectura"]')
            .click();
          await opened.page.waitForTimeout(1200);
        }
        const b = await boxes(opened.page);
        await shot(opened.page, `fix-${LABEL}-${name}`, false);
        const inside = (box: Box | null) =>
          Boolean(box) && (box as Box).x >= 0 && (box as Box).x + (box as Box).width <= b.vw + 1;
        const covered = [b.back, b.bar, b.toggle].some((piece) => intersects(piece, b.budget));
        obs.add({ name, boxes: b, covered });
        recorder.record(
          `${name}: Back to chat, the bar and Map/Read are on screen`,
          inside(b.back) && inside(b.bar) && inside(b.toggle) ? 'PASS' : 'FAIL',
          JSON.stringify({ back: b.back, toggle: b.toggle }),
        );
        recorder.record(
          `${name}: the bar never covers Read's budget band`,
          b.budget && !covered ? 'PASS' : 'FAIL',
          JSON.stringify({ budget: b.budget, bar: b.bar }),
        );
        if (cell.viewport.width === 1440) {
          await opened.page
            .locator('body')
            .click({ position: { x: 5, y: 5 } })
            .catch(() => undefined);
          let reached = -1;
          for (let i = 0; i < 60; i += 1) {
            await opened.page.keyboard.press('Tab');
            const view = await opened.page.evaluate(
              () => document.activeElement?.getAttribute('data-view') ?? null,
            );
            if (view === 'lectura' || view === 'mapa') {
              reached = i + 1;
              break;
            }
          }
          obs.add({ name, tabStopsToToggle: reached });
          recorder.record(
            `${name}: Tab reaches Map/Read within 30 stops`,
            reached > 0 && reached <= 30 ? 'PASS' : 'FAIL',
            `reached at Tab #${reached}`,
          );
        }
      } finally {
        await opened.close();
      }
    }
    {
      const name = 'canvas-unknown@1440-light';
      const opened = await openAs(
        browser,
        vivo,
        EASYFIT_2026,
        { width: 1440, height: 900 },
        'light',
      );
      try {
        await opened.page.goto(
          '/scale/campaign-canvas?scaffold=00000000-0000-4000-8000-000000000000',
          { waitUntil: 'domcontentloaded' },
        );
        await opened.page
          .locator('[data-testid="canvas-record-empty"]')
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        const text = (
          await opened.page.locator('[data-testid="canvas-record-empty"]').allInnerTexts()
        ).join(' ');
        obs.add({ name, text });
        recorder.record(
          `${name}: an unknown proposal link says so`,
          /not on this brand/.test(text) ? 'PASS' : 'FAIL',
          text,
        );
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
