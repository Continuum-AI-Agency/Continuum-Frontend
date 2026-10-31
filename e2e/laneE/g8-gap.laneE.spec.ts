import { expect, test } from '@playwright/test';
import { createBenchRecorder } from '../support/benchRecorder';
import { audit, identityFor, Observations, openAs, revokeAll, settle, shot } from './support';

// laneE:g8-gap — the G8 screen sweep's coverage gap (2026-10-27, g8-google.md §2b: the harness
// killed the shell before Vivo 47's portfolio page at 1024/1440 and Vivo's Google tab, Actions
// and Activity at 1440), plus the G8 screen findings shipped as fixed since (F16 honest Google
// hero, F17 the test portfolio's reads, F2 no Approve on a Google pause), re-read on today's beta.
// READ ONLY: navigation only — no Approve, Dismiss, Review moves or Run now.

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const VIVO_47 = '61b80f51-709a-4408-9f11-04142a286baa';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const VIVO_GOOGLE_PORTFOLIO = 'e642c737-ddde-4622-af8f-4b5622da98d0';
const EASYFIT_GOOGLE_PORTFOLIO = 'b9cebbcf-2832-440a-b326-3af20c19be37';
const EASYFIT_TEST_PORTFOLIO = '5aaf5931-7407-4940-aab6-52e914bced45';

const PAGES = [
  {
    key: 'vivo-portfolio',
    brand: VIVO_47,
    path: `/scale?tab=performance&optimizerView=portfolios&portfolio=${VIVO_GOOGLE_PORTFOLIO}`,
    widths: [1024, 1440],
  },
  {
    key: 'vivo-google',
    brand: VIVO_47,
    path: '/scale?tab=performance&optimizerView=overview&platform=google_ads',
    widths: [1440],
  },
  {
    key: 'vivo-actions',
    brand: VIVO_47,
    path: '/scale?tab=performance&optimizerView=actions',
    widths: [1440],
  },
  {
    key: 'vivo-activity',
    brand: VIVO_47,
    path: '/scale?tab=performance&optimizerView=logs',
    widths: [1440],
  },
  {
    key: 'easyfit-google-portfolio',
    brand: EASYFIT_2026,
    path: `/scale?tab=performance&optimizerView=portfolios&portfolio=${EASYFIT_GOOGLE_PORTFOLIO}`,
    widths: [1440],
  },
  {
    key: 'easyfit-test-portfolio',
    brand: EASYFIT_2026,
    path: `/scale?tab=performance&optimizerView=portfolios&portfolio=${EASYFIT_TEST_PORTFOLIO}`,
    widths: [1440],
  },
  {
    key: 'easyfit-actions',
    brand: EASYFIT_2026,
    path: '/scale?tab=performance&optimizerView=actions',
    widths: [1440],
  },
] as const;

test('laneE:g8-gap — the G8 sweep gap and its fixed findings', async ({ browser }) => {
  test.setTimeout(1_800_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:g8-gap', notes);
  const obs = new Observations('g8-gap');
  try {
    const vivo = await identityFor(VIVO_OWNER);
    for (const item of PAGES) {
      for (const width of item.widths) {
        const name = `${item.key}@${width}-light`;
        const opened = await openAs(browser, vivo, item.brand, { width, height: 900 }, 'light');
        const { page } = opened;
        try {
          const t0 = Date.now();
          await page.goto(item.path, { waitUntil: 'domcontentloaded' });
          await page
            .locator('[data-testid="platform-tabs"], [data-testid="optimizer-subnav"]')
            .first()
            .waitFor({ timeout: 90_000 })
            .catch(() => undefined);
          await settle(page, 75_000);
          await page.waitForTimeout(2500);
          const ms = Date.now() - t0;
          const text = await page
            .locator('main')
            .first()
            .innerText()
            .catch(() => '');
          const approveGooglePause = await page
            .getByRole('button', { name: /^Approve pause ad set for 243/ })
            .count();
          const report = await audit(page, `G8/${item.key}`, width, 'light');
          const path = await shot(page, `g8-${name}`);
          const facts = {
            ms,
            noSpendHero: /0 leads in 14 days, no spend|Blocked: zero delivery/.test(text),
            serverDidNotAnswer: (text.match(/didn.t answer in 8 s\.?\.?/g) ?? []).slice(0, 2),
            doubledPeriod: /8 s\.\./.test(text),
            runNow: /Run now/.test(text),
            reviewMoves: /Review moves/.test(text),
            approveGooglePause,
            notAvailableHere: /Not available here: the Optimizer pauses only Meta ad sets/.test(
              text,
            ),
            couldNotLoad: (text.match(/could not load|Couldn.t load[^.]*/gi) ?? []).slice(0, 4),
            unnamedAdSet: /Unnamed ad set/.test(text),
            moneyWithoutCurrency: (
              text.match(/\b\d{1,3}(,\d{3})*\.\d{2}\b(?! ?(MXN|USD|EUR|COP))/g) ?? []
            ).slice(0, 6),
          };
          obs.add({
            name,
            facts,
            text: text.slice(0, 2500),
            violations: report.violations,
            events: opened.events,
            guard: opened.guard.blocked,
            shot: path,
          });
          recorder.record(`${name}: renders`, text.length > 200 ? 'PASS' : 'FAIL', `${ms} ms`);
          if (item.key.includes('portfolio') && item.key !== 'easyfit-test-portfolio') {
            recorder.record(
              `${name}: F16 — the Google hero is not "no spend"`,
              facts.noSpendHero ? 'FAIL' : 'PASS',
            );
          }
          if (item.key === 'easyfit-test-portfolio') {
            recorder.record(
              `${name}: F17 — the never-cycled test portfolio reads`,
              facts.serverDidNotAnswer.length === 0 ? 'PASS' : 'FAIL',
              facts.serverDidNotAnswer.join(' | '),
            );
            recorder.record(
              `${name}: F17 — no "8 s.." and no Run now / Review moves before a first cycle`,
              !facts.doubledPeriod && !facts.runNow && !facts.reviewMoves ? 'PASS' : 'WARN',
              JSON.stringify({
                doubled: facts.doubledPeriod,
                runNow: facts.runNow,
                reviewMoves: facts.reviewMoves,
              }),
            );
          }
          if (item.key.endsWith('actions')) {
            recorder.record(
              `${name}: F2 — no Approve on a pause of a Google campaign`,
              approveGooglePause === 0 ? 'PASS' : 'FAIL',
              `${approveGooglePause} buttons; "Not available here": ${facts.notAvailableHere}`,
            );
          }
          recorder.record(
            `${name}: geometric detector`,
            report.violations.length === 0 ? 'PASS' : 'FAIL',
            report.violations
              .slice(0, 5)
              .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 160))
              .join(' | '),
          );
          const l1 = [
            ...opened.events.consoleErrors,
            ...opened.events.pageErrors,
            ...opened.events.serverErrors,
          ];
          recorder.record(
            `${name}: no console error / 5xx`,
            l1.length === 0 ? 'PASS' : 'FAIL',
            l1.slice(0, 3).join(' | '),
          );
        } catch (error) {
          recorder.record(`${name}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
        } finally {
          await opened.close();
        }
      }
    }
  } finally {
    notes.push(...(await revokeAll()));
    notes.push(`observations: ${obs.flush()}`);
    recorder.print();
  }
  expect(true).toBe(true);
});
