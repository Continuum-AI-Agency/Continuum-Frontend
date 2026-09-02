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

async function mount(page: import('@playwright/test').Page, bundle: string, viewportWidth = 1200) {
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
    throw new Error(
      `Editor UI bench mounted no editor. Body: ${await page.locator('body').innerText()}`,
    );
  }
  await expect(heading).toBeVisible();
}

test('canonical V2 UI commits, previews, restores, and reopens serialized edits', async ({
  page,
}) => {
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

  // Exact: the media bin now also renders a draggable tile and an "Add … to the
  // timeline" button for the same source, and only THIS button pins an overlay.
  await page.getByRole('button', { name: 'Pinned logo', exact: true }).click();
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

// ---------------------------------------------------------------------------
// The clip inspector: the per-clip effect controls, and background removal.
//
// Mounted over a real in-memory timeline host, so a slider nudge writes a real
// `ClipEffectSpec` field and the Remove Background button runs the real matte op
// through its real SSE reader and contract schema. Only the HTTP hop is routed —
// the matte itself is a GPU pass in Cloud Run with no browser equivalent.
// ---------------------------------------------------------------------------

const CUTOUT_ASSET_ID = '22222222-2222-4222-8222-222222222222';
const HERO_ASSET_ID = '11111111-1111-4111-8111-111111111111';

function buildInspectorBundle(): string {
  const outfile = join(tmpdir(), `clip-inspector-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/clipInspectorBenchEntry.tsx', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

function matteStream(): string {
  const requestId = '44444444-4444-4444-8444-444444444444';
  const events = [
    { type: 'background_removal.started', data: { requestId } },
    { type: 'background_removal.progress', data: { requestId, stage: 'matting', progress: 60 } },
    {
      type: 'background_removal.completed',
      data: {
        requestId,
        assetId: CUTOUT_ASSET_ID,
        versionId: '33333333-3333-4333-8333-333333333333',
        sourceVersionId: HERO_ASSET_ID,
        kind: 'video',
        mode: 'remove',
        signedUrl: 'https://storage.example/cutout.webm?sig=1',
        bucket: 'media',
        storagePath: 'brand/cutout.webm',
        fileName: 'cutout.webm',
        mimeType: 'video/webm',
        width: 1080,
        height: 1920,
        durationMs: 4000,
        hasAlpha: true,
      },
    },
  ];
  return `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`;
}

async function mountInspector(page: import('@playwright/test').Page, bundle: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/clip-inspector-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><script>window.process={env:{NEXT_PUBLIC_API_URL:"http://127.0.0.1:4173",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:4173",NEXT_PUBLIC_SUPABASE_ANON_KEY:"browser-bench-anon-key"}}</script><style>body{width:420px;margin:0}[role="switch"]{display:inline-block;width:34px;height:20px}input[type="color"]{display:inline-block;width:40px;height:24px}</style></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4173/clip-inspector-bench');
  await page.addScriptTag({ content: bundle, type: 'module' });
  await expect(page.getByRole('heading', { name: 'Clip inspector' })).toBeVisible();
  if (errors.length > 0) {
    throw new Error(`Clip inspector bench runtime error: ${errors.join(' | ')}`);
  }
}

const effectsOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__clipInspectorBench.document.items[0].effects ?? {});

test('clip inspector writes every ClipEffectSpec field the export already draws', async ({
  page,
}) => {
  await mountInspector(page, buildInspectorBundle());

  // Each of these is a slider whose step is known, so N ArrowRights from the stored
  // value is a deterministic assertion rather than a pixel-drag guess.
  // Base UI puts the field's label on the slider GROUP; the thumb inside it is the
  // element with the `slider` role and the keyboard behaviour.
  const nudge = async (name: string, times = 1) => {
    const slider = page.getByRole('group', { name, exact: true }).getByRole('slider');
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    for (let i = 0; i < times; i += 1) await slider.press('ArrowRight');
  };

  await nudge('Warmth', 2);
  await nudge('Hue', 2);
  await nudge('Sepia');
  await nudge('Grayscale');
  await nudge('Invert');
  await nudge('Blur');
  await nudge('Vignette');
  await nudge('Film grain');
  await nudge('Chromatic aberration');
  await nudge('VHS');
  await nudge('Pixelate');
  await nudge('Tint');

  const effects = await effectsOf(page);
  expect(effects.warmth).toBeCloseTo(0.1, 5);
  expect(effects.adjustments).toMatchObject({
    hueRotate: 10,
    sepia: 0.05,
    grayscale: 0.05,
    invert: 0.05,
    blur: 0.5,
  });
  expect(effects.vignette).toEqual({ amount: 0.05 });
  expect(effects.filmGrain).toEqual({ amount: 0.05 });
  expect(effects.chromaticAberration).toEqual({ amount: 0.05 });
  expect(effects.vhs).toEqual({ amount: 0.05 });
  expect(effects.pixelate).toEqual({ blockPx: 2 });
  expect(effects.tint).toEqual({ color: '#ff8a3d', amount: 0.05 });

  // The keyer is a toggle, not an amount: at tolerance 0 it still keys exact matches.
  await page.getByRole('switch', { name: 'Chroma key' }).click();
  expect((await effectsOf(page)).chromaKey).toEqual({
    color: '#00ff00',
    tolerance: 0.35,
    softness: 0.1,
  });

  // The panel says out loud which of these the CSS preview cannot show.
  await expect(page.getByText(/effects render but can/)).toBeVisible();
});

test('clip inspector mattes a clip and repoints it at the cutout', async ({ page }) => {
  const bundle = buildInspectorBundle();
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/ai-studio/remove-background', async (route) => {
    requests.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: matteStream() });
  });
  await mountInspector(page, bundle);

  // A clip with no Library asset behind it has nothing to derive a cutout from, and
  // the control says so instead of failing on click.
  await page.getByRole('button', { name: 'Select Orphan' }).click();
  await expect(page.getByRole('button', { name: /Remove background/ })).toBeDisabled();
  await expect(page.getByText(/Save this clip to the Library first/)).toBeVisible();

  await page.getByRole('button', { name: 'Select Hero' }).click();
  const button = page.getByRole('button', { name: /Remove background/ });
  await expect(button).toBeEnabled();
  await button.click();

  await expect.poll(() => page.evaluate(() => window.__clipInspectorBench.pool.length)).toBe(3);
  const state = await page.evaluate(() => window.__clipInspectorBench);
  expect(state.document.items[0].sourceNodeId).toBe(CUTOUT_ASSET_ID);
  expect(state.pool.at(-1)).toMatchObject({
    nodeId: CUTOUT_ASSET_ID,
    kind: 'video',
    label: 'Hero (cutout)',
    sourceAssetId: CUTOUT_ASSET_ID,
    previewUrl: 'https://storage.example/cutout.webm?sig=1',
  });
  expect(requests[0]).toMatchObject({
    sourceAssetId: HERO_ASSET_ID,
    kind: 'video',
    mode: 'remove',
    featherPx: 0,
  });
});
