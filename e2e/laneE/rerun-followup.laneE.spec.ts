import { expect, test } from '@playwright/test';
import { createBenchRecorder } from '../support/benchRecorder';
import { audit, identityFor, Observations, openAs, revokeAll, settle, shot } from './support';

// laneE:rerun-followup — two 10-27 hops the first re-run could only half reach:
//   · fe-sweep §6: "Delete from Facebook" and "Publish now" were never located on screen. The
//     planner now reads Supabase's October posts; open the published Facebook post and a draft
//     and LOOK for the two buttons — never click them.
//   · p7 §8: "Screenshots / FE review page were not produced; this run measured the API answers,
//     not the beta UI render." Render a stored Jaina analysis in the beta UI at 1440 and 390.
// READ ONLY: opening a post's quick look and a stored conversation are reads.

const DUANE = 'duane@continuumai.agency';
const SUPABASE_BRAND = '0f4a3c4b-03e4-4ed4-8805-5516ba199ec1';
const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const EASYFIT_AGENCY = '148583e0-5538-462b-8d3a-acd25b80344e';
const JAINA_SESSION = 'jaina_history_53f6b6db35a24f469032a925d9f206ef';

test('laneE:rerun-followup — Delete from Facebook / Publish now located, a Jaina answer rendered', async ({
  browser,
}) => {
  test.setTimeout(1_500_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:rerun-followup', notes);
  const obs = new Observations('rerun-followup');
  try {
    const duane = await identityFor(DUANE);
    {
      const opened = await openAs(
        browser,
        duane,
        SUPABASE_BRAND,
        { width: 1440, height: 900 },
        'light',
      );
      const { page } = opened;
      try {
        await page.goto('/organic?view=month&weekStart=2026-10-19', {
          waitUntil: 'domcontentloaded',
        });
        await page.getByText('New Facebook', { exact: false }).first().waitFor({ timeout: 90_000 });
        await settle(page, 30_000);
        await page.getByText('New Facebook', { exact: false }).first().click();
        await page.waitForTimeout(3000);
        const deleteButtons = await page
          .getByRole('button', { name: 'Delete from Facebook' })
          .count();
        const quickLookText = (
          await page
            .locator('[role="dialog"], [data-state="open"]')
            .first()
            .innerText()
            .catch(() => '')
        ).slice(0, 600);
        await shot(page, 'followup-planner-published-quicklook', false);
        recorder.record(
          'planner: "Delete from Facebook" is on the published Facebook post',
          deleteButtons > 0 ? 'PASS' : 'FAIL',
          `${deleteButtons} button(s) · ${quickLookText.slice(0, 160)}`,
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        await page
          .getByText('testing', { exact: true })
          .first()
          .click()
          .catch(() => undefined);
        await page.waitForTimeout(3000);
        const publishNow = await page.getByRole('button', { name: /Publish now/ }).count();
        const publishNowDisabled =
          publishNow > 0
            ? await page
                .getByRole('button', { name: /Publish now/ })
                .first()
                .isDisabled()
            : null;
        const draftText = (
          await page
            .locator('[role="dialog"], [data-state="open"]')
            .first()
            .innerText()
            .catch(() => '')
        ).slice(0, 600);
        await shot(page, 'followup-planner-draft', false);
        obs.add({
          deleteButtons,
          quickLookText,
          publishNow,
          publishNowDisabled,
          draftText,
          guard: opened.guard.blocked,
          events: opened.events,
        });
        recorder.record(
          'planner: "Publish now" sits on the draft (located, not clicked)',
          publishNow > 0 ? 'PASS' : 'WARN',
          `${publishNow} button(s), disabled=${publishNowDisabled} · ${draftText.slice(0, 160)}`,
        );
      } catch (error) {
        recorder.record('planner: page', 'FAIL', (error as Error).message.split('\n')[0]);
        await shot(page, 'followup-planner-error', false);
      } finally {
        await opened.close();
      }
    }

    const vivo = await identityFor(VIVO_OWNER);
    for (const cell of [
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
      { viewport: { width: 390, height: 844 }, theme: 'dark' as const },
    ]) {
      const name = `jaina-answer@${cell.viewport.width}-${cell.theme}`;
      const opened = await openAs(browser, vivo, EASYFIT_AGENCY, cell.viewport, cell.theme);
      const { page } = opened;
      try {
        await page.goto(
          `/scale?tab=jaina&sessionId=${JAINA_SESSION}&adAccountId=act_521903353286118`,
          { waitUntil: 'domcontentloaded' },
        );
        await page
          .locator('[data-role="assistant"], [data-message-role="assistant"], article')
          .first()
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        await settle(page, 45_000);
        await page.waitForTimeout(3000);
        const text = (
          await page
            .locator('main')
            .first()
            .innerText()
            .catch(() => '')
        ).slice(0, 3000);
        const report = await audit(page, 'Jaina/answer', cell.viewport.width, cell.theme);
        await shot(page, `followup-${name}`, false);
        obs.add({
          name,
          text: text.slice(0, 1500),
          violations: report.violations,
          events: opened.events,
          guard: opened.guard.blocked,
        });
        recorder.record(
          `${name}: the stored analysis renders`,
          /Portfolio|campaign|MXN/i.test(text) ? 'PASS' : 'FAIL',
          text.slice(0, 160),
        );
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
  } finally {
    notes.push(...(await revokeAll()));
    notes.push(`observations: ${obs.flush()}`);
    recorder.print();
  }
  expect(true).toBe(true);
});
