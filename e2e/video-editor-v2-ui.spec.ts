import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EditorProjectV2 } from '@continuum/contracts';
import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `editor-v2-ui-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/editorV2UiBenchEntry.tsx', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

async function mount(
  page: import('@playwright/test').Page,
  bundle: string,
  viewportWidth = 1200,
) {
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // This browser-only harness stubs the comment snapshot endpoint but does
    // not start a Realtime server. Keep every other browser error fatal.
    if (text.includes('ws://127.0.0.1:4173/realtime/v1/websocket')) return;
    consoleErrors.push(text);
  });
  await page.route('**/api/library/comments?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ comments: [], headVersionId: null }),
    }),
  );
  await page.route('**/editor-v2-ui-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.process={env:{NEXT_PUBLIC_API_URL:"http://127.0.0.1:4173",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:4173",NEXT_PUBLIC_SUPABASE_ANON_KEY:"browser-bench-anon-key"}}</script><style>body{width:${viewportWidth}px;margin:0}.relative{position:relative}.absolute{position:absolute}[style*="container-type"]{width:min(640px,100vw);height:min(360px,56.25vw)}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto('http://127.0.0.1:4173/editor-v2-ui-bench');
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page
    .waitForFunction(() => Boolean(window.__editorV2UiBench), undefined, { timeout: 30_000 })
    .catch(() => undefined);
  if (runtimeErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      `Editor UI bench runtime error: ${[...runtimeErrors, ...consoleErrors].join(' | ')}`,
    );
  }
  const heading = page.getByRole('heading', { name: 'Canonical assembly' });
  if ((await heading.count()) === 0) {
    throw new Error(`Editor UI bench mounted no editor. Body: ${await page.locator('body').innerText()}`);
  }
  await expect(heading).toBeVisible();
}

test('canonical V2 UI commits, previews, restores, and reopens serialized edits', async ({ page }) => {
  const bundle = buildBrowserBundle();
  await mount(page, bundle);

  await page.getByPlaceholder('Add text at the playhead').fill('Browser title');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Browser title').first()).toBeVisible();

  const transition = page.getByLabel('Transition from First to Second');
  await transition.selectOption('crossfade');
  await transition
    .locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]')
    .getByRole('button', { name: 'Apply' })
    .click();

  await page.getByRole('button', { name: /Pinned logo/ }).click();
  await expect(page.getByText('Pinned logo').last()).toBeVisible();

  let project = await page.evaluate(() => window.__editorV2UiBench.project);
  expect(project.transitions).toHaveLength(1);
  expect(project.durationSec).toBeCloseTo(3.4, 5);
  const overlay = project.tracks.find((track) => track.kind === 'overlay')?.clips[0];
  expect(overlay?.source).toMatchObject({
    sourceType: 'library_asset',
    assetId: 'asset-logo',
    renditionId: 'version-logo-7',
  });

  await page.getByRole('button', { name: 'Undo assembly edit' }).click();
  project = await page.evaluate(() => window.__editorV2UiBench.project);
  expect(project.tracks.find((track) => track.kind === 'overlay')).toBeUndefined();

  await page.getByRole('button', { name: 'Redo assembly edit' }).click();
  project = await page.evaluate(() => window.__editorV2UiBench.project);
  expect(project.tracks.find((track) => track.kind === 'overlay')?.clips).toHaveLength(1);

  await page.reload();
  await page.addScriptTag({ content: bundle, type: 'module' });
  await expect(page.getByText('Browser title').first()).toBeVisible();
  const reopened = (await page.evaluate(() => window.__editorV2UiBench.project)) as EditorProjectV2;
  expect(reopened.fingerprint).toBe(project.fingerprint);
  expect(reopened.tracks.find((track) => track.kind === 'overlay')?.clips[0]?.source).toMatchObject(
    {
      renditionId: 'version-logo-7',
    },
  );
});

test('canonical V2 controls remain reachable in a touch-sized mobile viewport', async ({
  browser,
}) => {
  const bundle = buildBrowserBundle();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await mount(page, bundle, 390);

  const input = page.getByPlaceholder('Add text at the playhead');
  await input.fill('Touch title');
  const addButton = page.getByRole('button', { name: 'Add', exact: true });
  await addButton.scrollIntoViewIfNeeded();
  const touchTarget = await addButton.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return {
      button: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
      hit: hit ? `${hit.tagName}.${hit.className}` : 'none',
    };
  });
  expect(touchTarget.hit, JSON.stringify(touchTarget)).toMatch(/^BUTTON\./);
  await expect(input).toHaveValue('Touch title');
  await expect(page.getByRole('button', { name: 'Render final 1080p' })).toBeVisible();

  await context.close();
});
