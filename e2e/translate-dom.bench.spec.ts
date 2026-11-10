import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Chrome's page translation crashed two screens for a Spanish-speaking user on 2026-11-09:
// saving a skill in Settings, and the organic agent finishing a reply. Both are React writing
// to a text node Translate had already swapped for <font>. This bench mounts the REAL
// SkillForm and the REAL organic session sidebar in Chromium, translates the page the way
// Chrome does, and drives both. `guard=0` is the negative control: without
// guardAgainstTranslatedDom the same flows must still hit the route error boundary, or the
// bench is not reproducing the bug it claims to cover.
//
// Not covered: Chrome's own Translate engine cannot run headless, so its DOM swap is
// simulated (e2e/support/translateDomHarness.tsx); the guard's install point in
// instrumentation-client.ts is covered by Next running that file before hydration. The
// streamed markdown itself is not a crash site: across a full reply and the streaming ->
// static flip, Streamdown only removes whitespace text nodes, which Translate leaves alone.

const ORIGIN = 'http://translate-bench.local';
let outdir: string;

test.beforeAll(() => {
  outdir = mkdtempSync(join(tmpdir(), 'translate-dom-bench-'));
  execFileSync(
    'bun',
    [
      'build',
      'e2e/support/translateDomHarness.tsx',
      '--outdir',
      outdir,
      '--target',
      'browser',
      '--minify',
      '--define',
      'process.env.NODE_ENV="production"',
    ],
    { stdio: 'pipe' },
  );
});

test.afterAll(() => rmSync(outdir, { recursive: true, force: true }));

async function open(page: Page, query: string) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      // The skill save's PATCH: answer late so the spinner is on screen while translated.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return route.fulfill({ status: 500, body: '{}' });
    }
    if (url.pathname.endsWith('.js')) {
      return route.fulfill({
        contentType: 'text/javascript',
        body: readFileSync(join(outdir, url.pathname.slice(1))),
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head>
        <script>window.process = { env: {} };</script>
        </head><body><div id="root"></div>
        <script type="module" src="/translateDomHarness.js"></script></body></html>`,
    });
  });
  await page.goto(`${ORIGIN}/?${query}`);
}

const routeError = (page: Page) => page.locator('[data-route-error]');
const benchErrors = (page: Page) =>
  page.evaluate(() => (window as unknown as { benchErrors: string[] }).benchErrors);

async function saveSkill(page: Page) {
  const save = page.getByRole('button', { name: /Save changes/ });
  await expect(save).toBeVisible();
  // Translate swaps the label on the next frame; save once it has.
  await expect(save.locator('font')).toHaveCount(2);
  await save.click();
}

test('skill save: unguarded, the translated button crashes the route (control)', async ({
  page,
}) => {
  await open(page, 'surface=skill&guard=0');
  await saveSkill(page);
  await expect(routeError(page)).toBeVisible();
  expect((await benchErrors(page)).join()).toContain('not a child of this node');
});

test('skill save: guarded, the form survives the save round-trip', async ({ page }) => {
  await open(page, 'surface=skill');
  await saveSkill(page);
  await expect(page.locator('button[aria-busy="true"] svg')).toBeVisible();
  await expect(page.getByText('Could not save the skill')).toBeVisible();
  await expect(routeError(page)).toHaveCount(0);
  await expect(page.getByLabel('Skill name')).toHaveValue(
    'Contenido orgánico de piscinas para ETAV',
  );
  expect(await benchErrors(page)).toEqual([]);
});

async function endReply(page: Page) {
  await expect(page.locator('span:has(> svg.animate-spin) > font')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { benchEndReply: () => void }).benchEndReply());
}

test('agent reply ends: unguarded, the translated Working marker crashes the route (control)', async ({
  page,
}) => {
  await open(page, 'surface=sidebar&guard=0');
  await endReply(page);
  await expect(routeError(page)).toBeVisible();
  expect((await benchErrors(page)).join()).toContain('not a child of this node');
});

test('agent reply ends: guarded, the session row settles on its role label', async ({ page }) => {
  await open(page, 'surface=sidebar');
  await endReply(page);
  await expect(page.getByText('assistant', { exact: true })).toBeVisible();
  await expect(routeError(page)).toHaveCount(0);
  expect(await benchErrors(page)).toEqual([]);
});
