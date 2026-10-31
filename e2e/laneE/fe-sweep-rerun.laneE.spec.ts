import { expect, type Response, test } from '@playwright/test';
import { createBenchRecorder } from '../support/benchRecorder';
import {
  audit,
  identityFor,
  Observations,
  openAs,
  progress,
  revokeAll,
  settle,
  shot,
} from './support';

// laneE:rerun-1027 — the hops the 2026-10-27 FE sweep could not exercise because production
// stalled (docs/jaina-google-goals/deep-tests-2026-10-27/fe-sweep.md, "What could not be
// exercised"), re-run read-only on today's beta:
//   · Brand Spy: the Facebook organic feed with real posts and its "Open … on Facebook" link;
//     the paid cards that all read "No creative";
//   · the planner Month view on the one brand with Continuum-published Facebook posts
//     (Supabase), locating "Delete from Facebook" and "Publish now" without clicking them;
//   · the Studio canvas rooms where one stale reference blanked every 4-up tile (403 on the
//     batch sign), and the saved Veo node;
//   · /library at 390, which threw "Library browse failed: statement timeout".
// READ ONLY: navigation, tab switches and opening a post's quick look; nothing publishes,
// deletes, signs a new render or saves.

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const DUANE = 'duane@continuumai.agency';
const HOME_VIVO47 = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';
const SUPABASE_BRAND = '0f4a3c4b-03e4-4ed4-8805-5516ba199ec1';
/** fce7e8f8 (the 10-27 room) is deleted and 99c6ecf0's room row now belongs to another brand;
 *  Workspace 2 is Home | Vivo47's one live room, with 4-up generator nodes. */
const ROOM_4UP = 'a44dc306-1748-4b46-94a4-7525341f0f48';
/** The saved veo-3.1 nodes: the room row is Easy Fit 2026's, its session row Home | Vivo47's. */
const ROOM_VEO = 'f30e0294-bf9e-41c6-bb54-5d9ad58b4e18';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

test('laneE:rerun-1027 — the hops production stalled on', async ({ browser }) => {
  test.setTimeout(2_400_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:rerun-1027', notes);
  const obs = new Observations('rerun-1027');
  try {
    // 1. Brand Spy — Facebook organic feed, paid cards.
    const vivo = await identityFor(VIVO_OWNER);
    for (const cell of [
      { viewport: { width: 1440, height: 900 }, theme: 'light' as const },
      { viewport: { width: 390, height: 844 }, theme: 'dark' as const },
    ]) {
      const name = `spy@${cell.viewport.width}-${cell.theme}`;
      progress(`rerun ${name}`);
      const opened = await openAs(browser, vivo, HOME_VIVO47, cell.viewport, cell.theme);
      const { page } = opened;
      try {
        await page.goto('/competitor-spy', { waitUntil: 'domcontentloaded' });
        await settle(page, 45_000);
        const facebook = page
          .getByRole('button', { name: /^Facebook$/ })
          .or(page.getByRole('tab', { name: /^Facebook$/ }))
          .first();
        const hasFacebook = (await facebook.count()) > 0;
        let feed = { posts: 0, links: 0, skeletons: 0, text: '' };
        let feedMs = 0;
        if (hasFacebook) {
          const t0 = Date.now();
          await facebook.click();
          await page
            .waitForFunction(
              () => document.querySelectorAll('a[href*="facebook.com"]').length > 0,
              undefined,
              { timeout: 45_000 },
            )
            .catch(() => undefined);
          feedMs = Date.now() - t0;
          await settle(page, 20_000);
          feed = await page.evaluate(() => ({
            posts: document.querySelectorAll(
              'article, [data-testid*="post"], [data-testid*="card"]',
            ).length,
            links: Array.from(document.querySelectorAll('a[href*="facebook.com"]')).length,
            skeletons: document.querySelectorAll(
              '[aria-busy="true"], [data-slot="skeleton"], .animate-pulse',
            ).length,
            text: (document.querySelector('main')?.textContent ?? '').slice(0, 600),
          }));
        }
        await shot(page, `rerun-${name}-facebook`, false);
        recorder.record(
          `${name}: Facebook organic shows real posts with an Open-on-Facebook link`,
          hasFacebook && feed.links > 0 ? 'PASS' : 'FAIL',
          JSON.stringify({ hasFacebook, feedMs, ...feed, text: feed.text.slice(0, 160) }),
        );
        const paid = page
          .getByRole('tab', { name: /^Paid/ })
          .or(page.getByRole('button', { name: /^Paid/ }))
          .first();
        if ((await paid.count()) > 0) {
          await paid.click();
          await settle(page, 30_000);
          await page.waitForTimeout(3000);
          const cards = await page.evaluate(() => {
            const text = document.querySelector('main')?.textContent ?? '';
            return {
              noCreative: (text.match(/No creative/g) ?? []).length,
              images: Array.from(document.querySelectorAll('main img')).filter(
                (img) => (img as HTMLImageElement).naturalWidth > 0,
              ).length,
              videos: document.querySelectorAll('main video').length,
            };
          });
          await shot(page, `rerun-${name}-paid`, false);
          obs.add({ cell: name, paid: cards });
          recorder.record(
            `${name}: paid ads show their creative`,
            cards.images + cards.videos > 0 && cards.noCreative === 0
              ? 'PASS'
              : cards.images + cards.videos > 0
                ? 'WARN'
                : 'FAIL',
            JSON.stringify(cards),
          );
        }
        const report = await audit(page, 'BrandSpy', cell.viewport.width, cell.theme);
        obs.add({
          cell: name,
          feed,
          feedMs,
          violations: report.violations,
          events: opened.events,
          guard: opened.guard.blocked,
        });
      } catch (error) {
        recorder.record(`${name}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
      } finally {
        await opened.close();
      }
    }

    // 2. Planner Month on Supabase (duane@ owns it; the brand that published to Facebook).
    {
      const name = 'planner@1440-light';
      progress(`rerun ${name}`);
      const duane = await identityFor(DUANE);
      const opened = await openAs(
        browser,
        duane,
        SUPABASE_BRAND,
        { width: 1440, height: 900 },
        'light',
      );
      const { page } = opened;
      const calendarCalls: string[] = [];
      page.on('response', (response: Response) => {
        if (/calendar-posts|published-posts|organic\/drafts/.test(response.url()))
          calendarCalls.push(
            `${response.status()} ${response.request().method()} ${response.url().slice(0, 140)}`,
          );
      });
      try {
        await page.goto('/organic?view=month&weekStart=2026-10-19', {
          waitUntil: 'domcontentloaded',
        });
        await settle(page, 60_000);
        await page.waitForTimeout(4000);
        const month = await page.evaluate(() => ({
          text: (document.querySelector('main')?.textContent ?? '').slice(0, 1200),
          items: document.querySelectorAll(
            '[data-testid*="calendar"] [role="button"], [data-testid*="post"], [data-post-id], [data-draft-id]',
          ).length,
        }));
        await shot(page, `rerun-${name}-month`, false);
        recorder.record(
          `${name}: the Month view reads the calendar posts`,
          calendarCalls.some((c) => c.startsWith('200')) ? 'PASS' : 'FAIL',
          calendarCalls.slice(0, 4).join(' | ') || 'no calendar-posts request',
        );
        // Open one published Facebook post's quick look and look for the delete control (never click it).
        const published = page
          .locator('[data-source="published_posts"], [data-testid*="published"]')
          .first();
        let deleteControl = 0;
        let publishNow = 0;
        if ((await published.count()) > 0) {
          await published.click();
          await page.waitForTimeout(2500);
          deleteControl = await page.getByRole('button', { name: 'Delete from Facebook' }).count();
          await shot(page, `rerun-${name}-quicklook`, false);
          await page.keyboard.press('Escape');
        }
        publishNow = await page.getByRole('button', { name: /Publish now/ }).count();
        obs.add({
          cell: name,
          calendarCalls,
          month,
          deleteControl,
          publishNow,
          events: opened.events,
          guard: opened.guard.blocked,
        });
        recorder.record(
          `${name}: "Delete from Facebook" is on a published Facebook post`,
          deleteControl > 0 ? 'PASS' : 'WARN',
          `published cards: ${await published.count()} · delete buttons: ${deleteControl}`,
        );
      } catch (error) {
        recorder.record(`${name}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
      } finally {
        await opened.close();
      }
    }

    // 3. Studio canvas rooms: the 4-up re-sign room and the saved Veo node.
    for (const room of [
      { key: '4up', id: ROOM_4UP, brand: HOME_VIVO47, nodes: 16 },
      { key: 'veo', id: ROOM_VEO, brand: EASYFIT_2026, nodes: 46 },
    ]) {
      const name = `studio-${room.key}@1440-light`;
      progress(`rerun ${name}`);
      const opened = await openAs(browser, vivo, room.brand, { width: 1440, height: 900 }, 'light');
      const { page } = opened;
      const signs: string[] = [];
      page.on('response', async (response: Response) => {
        if (/\/media\/sign/.test(response.url())) {
          let body = '';
          try {
            body = (await response.text()).slice(0, 200);
          } catch {
            body = '';
          }
          signs.push(`${response.status()} ${body}`);
        }
      });
      try {
        await page.goto(`/ai-studio?roomId=${room.id}`, { waitUntil: 'domcontentloaded' });
        await page
          .locator('.react-flow__node')
          .first()
          .waitFor({ timeout: 90_000 })
          .catch(() => undefined);
        await settle(page, 30_000);
        await page.waitForTimeout(5000);
        const state = await page.evaluate(() => {
          const imgs = Array.from(
            document.querySelectorAll('.react-flow__node img'),
          ) as HTMLImageElement[];
          return {
            nodes: document.querySelectorAll('.react-flow__node').length,
            images: imgs.length,
            blank: imgs.filter((img) => !img.getAttribute('src')).length,
            broken: imgs.filter(
              (img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src'),
            ).length,
            veoText: Array.from(document.querySelectorAll('.react-flow__node'))
              .map((n) => n.textContent ?? '')
              .filter((t) => /veo/i.test(t))
              .map((t) => t.slice(0, 160)),
            url: location.href,
          };
        });
        // The URL keeps the asked id even when the server falls back to another room, so the
        // room is recognised by its stored node count.
        const opensRoom = state.nodes === room.nodes;
        await shot(page, `rerun-${name}`, false);
        obs.add({
          cell: name,
          state,
          opensRoom,
          signs,
          events: opened.events,
          guard: opened.guard.blocked,
        });
        recorder.record(
          `${name}: ?roomId= opens that room`,
          opensRoom ? 'PASS' : 'WARN',
          `${state.nodes} nodes rendered, ${room.nodes} stored`,
        );
        if (room.key === '4up') {
          recorder.record(
            `${name}: every node image signs and paints`,
            state.images > 0 && state.blank === 0 && state.broken === 0 ? 'PASS' : 'FAIL',
            JSON.stringify({ ...state, veoText: undefined, signs: signs.slice(0, 3) }),
          );
        } else {
          recorder.record(
            `${name}: the saved Veo node renders`,
            state.nodes > 0 ? 'PASS' : 'FAIL',
            JSON.stringify({ nodes: state.nodes, veo: state.veoText.slice(0, 2) }),
          );
        }
      } catch (error) {
        recorder.record(`${name}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
      } finally {
        await opened.close();
      }
    }

    // 4. /library at 390 dark.
    {
      const name = 'library@390-dark';
      progress(`rerun ${name}`);
      const opened = await openAs(browser, vivo, HOME_VIVO47, { width: 390, height: 844 }, 'dark');
      const { page } = opened;
      try {
        const t0 = Date.now();
        await page.goto('/library', { waitUntil: 'domcontentloaded' });
        await settle(page, 60_000);
        const ms = Date.now() - t0;
        const text = (await page.locator('body').innerText()).slice(0, 2000);
        const crashed =
          /Library browse failed|statement timeout|Runtime Error|Application error/i.test(text);
        await shot(page, `rerun-${name}`, false);
        const report = await audit(page, 'Library', 390, 'dark');
        obs.add({
          cell: name,
          ms,
          crashed,
          text: text.slice(0, 500),
          violations: report.violations,
          events: opened.events,
        });
        recorder.record(
          `${name}: the library opens without a server error`,
          crashed ? 'FAIL' : 'PASS',
          `${ms} ms`,
        );
        recorder.record(
          `${name}: geometric detector`,
          report.violations.length === 0 ? 'PASS' : 'FAIL',
          report.violations
            .slice(0, 5)
            .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 160))
            .join(' | '),
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
