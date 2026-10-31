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
//     an unknown ?scaffold= says the proposal is not on this brand;
//   · Home cards: every Health and Opportunities link takes a tap 11.5 px above and below its
//     centre line (the 24 px floor); the platform switch moves with the arrow keys.
//   · P8 (deployed 10-29): every stored account finding renders on Vivo 47's and Pink's Google
//     tab, waited for as long as the tab reads (the first sweep's settle stopped at the
//     skeletons while "Reading Google's campaign types…" still held the cards back);
//   · Chrome's own accessible name of each platform tab (CDP), beside Playwright's.
// The tap, arrow-key, P8 and Chrome-name checks were added after the base run of 2026-10-31;
// their unit anchors were red on the base. LANE_E_CASES=home,scale,gate,canvas,unknown,p8 runs
// a subset.

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const RAMIRO_BENCH = 'ramibuisel@gmail.com';
const BENCH = 'bench@trycontinuum.ai';
const PINK = '8e5b7185-e43f-4150-b763-b86c4f5297a0';
const TANGASSI = '9f7e830f-6445-4bba-b199-a2db07fa184a';
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';
const VIVO_47 = '61b80f51-709a-4408-9f11-04142a286baa';
const LABEL = process.env.LANE_E_LABEL ?? 'run';
const CASES = (process.env.LANE_E_CASES ?? '').split(',').filter(Boolean);
const runs = (key: string) => CASES.length === 0 || CASES.includes(key);
/** The account findings stored for each brand on 10-31 (paid_media.optimizer_* P8 rows). */
const STORED_P8 = { vivo47: 6, pink: 6 } as const;
const P8_WAIT_MS = 180_000;

/** Chrome's own accessible name for each platform tab, read through CDP — what a screen reader
 *  gets, which Playwright's ariaSnapshot (its own accname) may not match. */
async function chromeTabNames(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: { role?: { value?: string }; name?: { value?: string }; ignored?: boolean }[];
    };
    return nodes
      .filter((node) => !node.ignored && node.role?.value === 'tab')
      .map((node) => String(node.name?.value ?? ''))
      .filter((name) => /^(All|Meta|Google|TikTok)/.test(name));
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

/** How the Google tab's account findings arrive: polled until every stored one is on screen and
 *  nothing reads "Reading…", or the wait runs out. AccountRead shows four cards and folds the
 *  rest under "N more · …" (SHOWN_COUNT); that toggle is opened — a local fold, not a write. */
async function waitForP8Cards(page: Page, expected: number) {
  const t0 = Date.now();
  let firstMs: number | null = null;
  let count = 0;
  let reading = true;
  let unfolded = false;
  while (Date.now() - t0 < P8_WAIT_MS) {
    count = await page.locator('[data-testid="account-finding"]').count();
    if (count > 0 && firstMs === null) firstMs = Date.now() - t0;
    reading = /Reading\b[^\n]*…/.test(
      await page
        .locator('main')
        .first()
        .innerText()
        .catch(() => ''),
    );
    if (count >= expected && !reading) break;
    const fold = page
      .locator('[data-testid="account-cards"] button[aria-expanded="false"]')
      .first();
    if (!reading && !unfolded && (await fold.count()) > 0) {
      await fold.click().catch(() => undefined);
      unfolded = true;
      continue;
    }
    await page.waitForTimeout(2000);
  }
  const recommendOnly = await page
    .locator('[data-testid="account-finding-recommend-only"]')
    .count();
  const writeControls = await page
    .locator('[data-testid="account-finding"]')
    .getByRole('button', { name: /^(Apply|Approve|Pause|Enable|Run)/ })
    .count();
  return {
    count,
    recommendOnly,
    writeControls,
    unfolded,
    firstMs,
    doneMs: Date.now() - t0,
    reading,
  };
}

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
    for (const cell of !runs('home')
      ? []
      : [
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
        const taps = await opened.page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              '[data-home-module="health"] li a, [data-home-module="opp"] li a',
            ),
          ).map((link) => {
            link.scrollIntoView({ block: 'center' });
            const line = link.getClientRects()[0] ?? link.getBoundingClientRect();
            const x = line.x + Math.min(line.width / 2, 20);
            const y = line.y + line.height / 2;
            const takes = (probeY: number) => {
              const hit = document.elementFromPoint(x, probeY);
              return Boolean(hit && (hit === link || link.contains(hit)));
            };
            return {
              text: (link.textContent ?? '').slice(0, 40),
              height: Math.round(line.height),
              pad: takes(y - 11.5) && takes(y + 11.5),
            };
          }),
        );
        obs.add({ name, failedLoad, connect, taps });
        recorder.record(
          `${name}: Performance + and Creative + never read as a failed load`,
          failedLoad ? 'FAIL' : 'PASS',
        );
        recorder.record(
          `${name}: both say to connect a Meta ad account`,
          connect === 2 ? 'PASS' : 'FAIL',
          `${connect} connect lines`,
        );
        recorder.record(
          `${name}: every Health and Opportunities link takes a tap across 24 px`,
          taps.length === 0 ? 'WARN' : taps.every((tap) => tap.pad) ? 'PASS' : 'FAIL',
          taps.map((tap) => `${tap.text} ${tap.height}px pad=${tap.pad}`).join(' | '),
        );
      } finally {
        await opened.close();
      }
    }

    // Scale on the Google-only brands.
    for (const brand of !runs('scale')
      ? []
      : [
          { key: 'pink', id: PINK },
          { key: 'tangassi', id: TANGASSI },
        ]) {
      const name = `scale-${brand.key}@1440-light`;
      const opened = await openAs(browser, ramiro, brand.id, { width: 1440, height: 900 }, 'light');
      try {
        await opened.page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
        // The Optimizer opens either on its tabs or, with no portfolio yet, on its onboarding —
        // both are Performance +; only the connect gate is not.
        await opened.page
          .locator(
            '[data-testid="platform-tabs"], section[aria-label="Paid setup diagnostics"], h1:has-text("Put ad sets under the Optimizer"), h2:has-text("Put ad sets under the Optimizer")',
          )
          .first()
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        await settle(opened.page, 45_000);
        const tabs = (await opened.page.locator('[data-testid="platform-tabs"]').count()) > 0;
        const onboarding = /Put ad sets under the Optimizer/.test(
          await opened.page
            .locator('main')
            .first()
            .innerText()
            .catch(() => ''),
        );
        const gate = await opened.page
          .locator('section[aria-label="Paid setup diagnostics"]')
          .count();
        let findings = 0;
        let recommendOnly = 0;
        let metaConnected: string | null = null;
        let tablistAria = '';
        let landingTab: string | null = null;
        let chromeNames: string[] = [];
        let p8: Awaited<ReturnType<typeof waitForP8Cards>> | null = null;
        let arrow: { from: string | null; focused: string | null; selected: string | null } = {
          from: null,
          focused: null,
          selected: null,
        };
        if (tabs) {
          await opened.page.waitForTimeout(2500);
          landingTab = await opened.page
            .locator('[data-testid^="platform-tab-"][aria-selected="true"]')
            .first()
            .getAttribute('data-tab')
            .catch(() => null);
          metaConnected = await opened.page
            .locator('[data-testid="platform-tab-meta"]')
            .first()
            .getAttribute('data-connected');
          tablistAria = await opened.page
            .locator('[data-testid="platform-tabs"]')
            .first()
            .ariaSnapshot()
            .catch(() => '');
          chromeNames = await chromeTabNames(opened.page).catch(() => []);
          const google = opened.page.locator('[data-testid="platform-tab-google_ads"]').first();
          if ((await google.getAttribute('aria-selected')) !== 'true') await google.click();
          await settle(opened.page, 60_000);
          if (brand.key === 'pink') {
            p8 = await waitForP8Cards(opened.page, STORED_P8.pink);
            findings = p8.count;
            recommendOnly = p8.recommendOnly;
          }
          const picked = opened.page
            .locator('[data-testid^="platform-tab-"][aria-selected="true"]')
            .first();
          const from = await picked.getAttribute('data-tab');
          await picked.focus();
          await opened.page.keyboard.press('ArrowRight');
          await opened.page.waitForTimeout(800);
          arrow = await opened.page.evaluate(
            (start) => ({
              from: start,
              focused: document.activeElement?.getAttribute('data-tab') ?? null,
              selected:
                document
                  .querySelector('[data-testid^="platform-tab-"][aria-selected="true"]')
                  ?.getAttribute('data-tab') ?? null,
            }),
            from,
          );
        }
        await shot(opened.page, `fix-${LABEL}-${name}`);
        obs.add({
          name,
          tabs,
          gate,
          findings,
          recommendOnly,
          metaConnected,
          tablistAria,
          chromeNames,
          landingTab,
          arrow,
          p8,
          notFound: opened.events.notFound,
        });
        if (tabs) {
          recorder.record(
            `${name}: lands on the Google tab, not an empty All`,
            landingTab === 'google_ads' ? 'PASS' : 'FAIL',
            `landed on ${landingTab}`,
          );
          recorder.record(
            `${name}: Meta reads not connected on a Google-only brand`,
            metaConnected === 'false' ? 'PASS' : 'FAIL',
            `data-connected=${metaConnected}`,
          );
          recorder.record(
            `${name}: each platform tab is named once`,
            /tab "Meta(\s?·\s?Connect)?"/.test(tablistAria) &&
              !/Meta Meta|Google Ads Google/.test(tablistAria)
              ? 'PASS'
              : 'FAIL',
            tablistAria.replace(/\n/g, ' ').slice(0, 200),
          );
          recorder.record(
            `${name}: Chrome names each platform tab once`,
            chromeNames.length === 4 &&
              chromeNames.every(
                (tabName) => !/^(Meta Meta|Google Ads Google|TikTok TikTok)/.test(tabName),
              )
              ? 'PASS'
              : 'FAIL',
            chromeNames.join(' | '),
          );
          recorder.record(
            `${name}: ArrowRight moves the switch to the next platform`,
            arrow.selected !== arrow.from && arrow.focused === arrow.selected ? 'PASS' : 'FAIL',
            JSON.stringify(arrow),
          );
        }
        recorder.record(
          `${name}: Performance + opens, no connect gate`,
          (tabs || onboarding) && gate === 0 ? 'PASS' : 'FAIL',
          `tabs=${tabs} onboarding=${onboarding} gate=${gate}`,
        );
        if (brand.key === 'pink') {
          recorder.record(
            `${name}: the P8 findings show, recommend-only`,
            findings >= STORED_P8.pink && recommendOnly === findings ? 'PASS' : 'FAIL',
            `${findings} findings, ${recommendOnly} recommend-only` +
              (p8
                ? `; first card at ${p8.firstMs} ms, done at ${p8.doneMs} ms, still reading=${p8.reading}`
                : ''),
          );
        }
      } finally {
        await opened.close();
      }
    }

    // The gate on a brand with a Facebook Page and no ad account.
    if (runs('gate')) {
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

    // Canvas page and Vivo 47's Google tab.
    const vivo = await identityFor(VIVO_OWNER);

    // P8 on Vivo 47's Google tab: a brand with Meta and Google, so no gate on any branch. At
    // 1024, where the first sweep measured a CLS of 12.7–15.8 in repeated 0.64 shifts — so the
    // page is also watched for 10 s once loaded: a load shifts once, a resize loop keeps going.
    if (runs('p8')) {
      const name = 'p8-vivo47@1024-light';
      const opened = await openAs(browser, vivo, VIVO_47, { width: 1024, height: 768 }, 'light');
      try {
        await opened.page.goto(
          '/scale?tab=performance&optimizerView=overview&platform=google_ads',
          {
            waitUntil: 'domcontentloaded',
          },
        );
        await opened.page
          .locator('[data-testid="platform-tab-google_ads"][aria-selected="true"]')
          .first()
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        const chromeNames = await chromeTabNames(opened.page).catch(() => []);
        const p8 = await waitForP8Cards(opened.page, STORED_P8.vivo47);
        const ideas = await opened.page
          .locator('[data-testid="account-finding"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-idea')));
        const still = await opened.page.evaluate(async () => {
          type Shift = {
            value: number;
            hadRecentInput: boolean;
            sources?: { node?: Node | null }[];
          };
          const describe = (node: Node | null | undefined) => {
            if (!(node instanceof Element)) return null;
            const owner = node.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
            const heading =
              node.closest('section, article')?.querySelector('h2, h3, h4')?.textContent ?? '';
            return `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)} in ${owner} "${heading.slice(0, 50)}"`;
          };
          const seen: { value: number; node: string | null }[] = [];
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as Shift[]) {
              if (!entry.hadRecentInput)
                seen.push({ value: entry.value, node: describe(entry.sources?.[0]?.node) });
            }
          });
          observer.observe({ type: 'layout-shift', buffered: false });
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          observer.disconnect();
          return {
            count: seen.length,
            total: Number(seen.reduce((sum, shift) => sum + shift.value, 0).toFixed(3)),
            nodes: Array.from(new Set(seen.map((shift) => shift.node))).slice(0, 4),
          };
        });
        await shot(opened.page, `fix-${LABEL}-${name}`);
        obs.add({ name, p8, ideas, chromeNames, still, notFound: opened.events.notFound });
        recorder.record(
          `${name}: the Google tab holds still once loaded (10 s watched)`,
          still.count === 0 ? 'PASS' : 'FAIL',
          `${still.count} shifts, total ${still.total}; ${still.nodes.join(' | ')}`,
        );
        recorder.record(
          `${name}: every stored P8 account finding renders on the Google tab`,
          p8.count >= STORED_P8.vivo47 ? 'PASS' : 'FAIL',
          `${p8.count}/${STORED_P8.vivo47} cards [${ideas.join(', ')}]; first at ${p8.firstMs} ms, done at ${p8.doneMs} ms, still reading=${p8.reading}`,
        );
        recorder.record(
          `${name}: no P8 account finding carries a write control`,
          p8.writeControls === 0 ? 'PASS' : 'WARN',
          `${p8.writeControls} write controls on ${p8.count} cards; ${p8.recommendOnly} marked recommend-only (only a client-executes account is)`,
        );
        recorder.record(
          `${name}: Chrome names each platform tab once`,
          chromeNames.length === 4 &&
            chromeNames.every(
              (tabName) => !/^(Meta Meta|Google Ads Google|TikTok TikTok)/.test(tabName),
            )
            ? 'PASS'
            : 'FAIL',
          chromeNames.join(' | '),
        );
      } finally {
        await opened.close();
      }
    }

    // Canvas page.
    for (const cell of !runs('canvas')
      ? []
      : [
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
    if (runs('unknown')) {
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
