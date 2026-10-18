/** Real browser/WASM → HTTP routes → native engine → local PostgreSQL/files fixture. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  presentationArtifactSchema,
  presentationChartDataSchema,
  presentationEnvelopeSchema,
  presentationImageDataSchema,
  presentationShapeDataSchema,
  presentationTableDataSchema,
} from '@continuum/contracts';
import { chromium, expect } from '@playwright/test';
import tailwindcss from '@tailwindcss/postcss';
import { createServer } from 'vite';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};
const fixtureFile = argument('--fixture') ?? process.env.PRESENTATION_BROWSER_FIXTURE;
assert(
  fixtureFile,
  'Start forge:presentation:e2e:bench --serve, then pass --fixture <config.json>.',
);
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
assert(
  ['127.0.0.1', 'localhost'].includes(new URL(fixture.apiUrl).hostname),
  'Browser bench may only mutate the local fixture API.',
);
const rec = new Recorder('forge:presentation:browser:bench');
const artifactDir =
  argument('--artifacts') ?? path.join(root, 'artifacts/forge-presentations-browser');
const port = Number(argument('--port') ?? '4316');
const fixtureMiddleware = (
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse,
  next: () => void,
) => {
  if (request.url === '/__presentation_fixture') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(fixture));
    return;
  }
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forge presentations browser bench</title></head><body><div id="root"></div><script type="module" src="/e2e/support/presentationUiBenchEntry.tsx"></script></body></html>',
    );
    return;
  }
  next();
};
const vite = await createServer({
  configFile: false,
  plugins: [
    {
      name: 'local-presentation-fixture',
      configureServer(server) {
        server.middlewares.use(fixtureMiddleware);
      },
    },
  ],
  root,
  publicDir: path.join(root, 'public'),
  cacheDir: path.join(artifactDir, 'vite-cache'),
  esbuild: { jsx: 'automatic' },
  optimizeDeps: {
    entries: ['e2e/support/presentationUiBenchEntry.tsx'],
    include: [
      'react',
      'react-dom/client',
      'react-hook-form',
      '@hookform/resolvers/zod',
      '@base-ui/react/alert-dialog',
      '@base-ui/react/dialog',
    ],
  },
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(fixture.apiUrl),
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@/lib/auth/getBrowserAccessToken',
        replacement: path.join(root, 'e2e/support/presentationBenchAuth.ts'),
      },
      {
        find: '@continuum/contracts',
        replacement: path.join(root, 'packages/contracts/src/index.ts'),
      },
      { find: '@', replacement: path.join(root, 'src') },
    ],
  },
  server: { host: '127.0.0.1', port, strictPort: true },
});

await vite.listen();
console.log(`PRESENTATION_BROWSER_URL=http://127.0.0.1:${port}`);
if (process.argv.includes('--serve')) {
  await new Promise<void>((resolve) => {
    process.on('SIGTERM', resolve);
    process.on('SIGINT', resolve);
  });
  await vite.close();
} else {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await mkdir(artifactDir, { recursive: true });
    await page.goto(`http://127.0.0.1:${port}`);
    await expect(page.getByRole('region', { name: 'Presentation workspace' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: /^Select / }).first()).toBeEnabled({
      timeout: 60_000,
    });
    rec.check(
      'browser loads matching pinned WASM and renders actual slide PNG',
      (await page.locator('img[src^="data:image/png"]').count()) > 0,
    );
    const getDocument = async () => {
      const response = await fetch(
        `${fixture.apiUrl}/api/ai-studio/templates/${fixture.assetId}/presentation?brandId=${fixture.brandId}&baseVersionId=${fixture.baseVersionId}`,
        { headers: { Authorization: `Bearer ${fixture.token}` } },
      );
      assert(response.ok);
      return presentationEnvelopeSchema.parse(await response.json());
    };
    const before = await getDocument();
    const text = before.document.slides[0].objects.find(
      (object) => object.kind === 'text' && object.name === 'Title' && Boolean(object.text),
    );
    assert(text);
    const headline =
      text.text === 'Browser verified presentation headline'
        ? 'Browser verified presentation headline, revised'
        : 'Browser verified presentation headline';
    await page
      .getByRole('region', { name: 'Slide objects' })
      .locator(`button[data-object-id="${text.id}"]`)
      .click();
    await expect(page.getByLabel('Text', { exact: true })).toHaveValue(text.text ?? '');
    await page.getByLabel('Text', { exact: true }).fill(headline);
    await expect(page.getByLabel('Text', { exact: true })).toHaveValue(headline);
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const after = await getDocument();
    rec.check(
      'UI text edit reaches native object and authoritative SQL revision',
      after.draftRevision === before.draftRevision + 1 &&
        after.document.slides[0].objects.find((object: { id: string }) => object.id === text.id)
          ?.text === headline,
    );
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Open slide / })).toHaveCount(
      before.document.slides.length + 1,
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Open slide / })).toHaveCount(
      before.document.slides.length,
    );
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Open slide / })).toHaveCount(
      before.document.slides.length + 1,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    rec.record(
      'native WASM duplicate/undo/redo preserves slide identities through UI and save',
      'PASS',
    );
    const duplicated = await getDocument();
    const duplicatedSlide = duplicated.document.slides.find(
      (slide) => !before.document.slides.some((original) => original.id === slide.id),
    );
    assert(duplicatedSlide);
    await page.getByRole('button', { name: 'Move slide earlier', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const reordered = await getDocument();
    rec.check(
      'reordering slides preserves identities and persists canonical order',
      reordered.document.slides[0].id === duplicatedSlide.id &&
        new Set(reordered.document.slides.map((slide) => slide.id)).size ===
          duplicated.document.slides.length,
    );
    await page.getByRole('button', { name: /^Open slide 1:/ }).click();
    const current = await getDocument();
    const firstSlide = current.document.slides[0];
    const table = firstSlide.objects.find((object) => object.kind === 'table');
    const chart = firstSlide.objects.find((object) => object.kind === 'chart');
    assert(table && chart);
    await page
      .getByRole('button', { name: `Select ${table.name || table.kind}`, exact: true })
      .click();
    await page.getByLabel('Row 2, column 2').fill('24');
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await page
      .getByRole('button', { name: `Select ${chart.name || chart.kind}`, exact: true })
      .click();
    await page.getByLabel('Values, separated by commas').fill('36');
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await page.getByRole('button', { name: 'Add shape', exact: true }).click();
    await page.getByLabel('Left', { exact: true }).fill('76');
    await page.getByLabel('Top', { exact: true }).fill('300');
    await page.getByLabel('Width', { exact: true }).fill('150');
    await page.getByLabel('Height', { exact: true }).fill('80');
    await page.getByLabel('Fill', { exact: true }).fill('#ff6600');
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const dataEdited = await getDocument();
    const editedSlide = dataEdited.document.slides[0];
    rec.check(
      'table and chart UI controls preserve native editable data',
      presentationTableDataSchema.parse(
        editedSlide.objects.find((object) => object.id === table.id)?.data,
      ).cells[1][1] === '24' &&
        presentationChartDataSchema.parse(
          editedSlide.objects.find((object) => object.id === chart.id)?.data,
        ).series[0].values[0] === 36,
    );
    rec.check(
      'shape styling and transform execute through shared engine',
      editedSlide.objects.some(
        (object) =>
          object.kind === 'shape' &&
          presentationShapeDataSchema.parse(object.data).shapeType === 'rect' &&
          object.bounds.x === 76 &&
          object.style?.fill === '#ff6600',
      ),
    );
    const pngResponse = await fetch(
      `${fixture.apiUrl}/api/ai-studio/templates/${fixture.assetId}/presentation/preview`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: fixture.brandId,
          baseVersionId: fixture.baseVersionId,
          slideId: firstSlide.id,
        }),
      },
    );
    assert(pngResponse.ok);
    const png = presentationArtifactSchema.parse((await pngResponse.json()).artifact);
    await page.getByLabel('Add slide image').setInputFiles({
      name: 'actual-native-slide.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png.bytesBase64, 'base64'),
    });
    await page.getByLabel('Crop left (%)').fill('10');
    await page.getByLabel('Left', { exact: true }).fill('300');
    await page.getByLabel('Top', { exact: true }).fill('300');
    await page.getByLabel('Width', { exact: true }).fill('200');
    await page.getByLabel('Height', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const imageEdited = await getDocument();
    rec.check(
      'uploaded real PNG crop survives browser/native save',
      imageEdited.document.slides[0].objects.some(
        (object) =>
          object.kind === 'image' &&
          presentationImageDataSchema.parse(object.data).crop?.left === 0.1,
      ),
    );
    const imageObject = imageEdited.document.slides[0].objects.find(
      (object) => object.kind === 'image',
    );
    const shapeObject = imageEdited.document.slides[0].objects.find(
      (object) => object.kind === 'shape' && object.bounds.x === 76,
    );
    assert(imageObject && shapeObject);
    const outline = page.getByRole('region', { name: 'Slide objects' });
    await outline.locator(`button[data-object-id="${imageObject.id}"]`).click();
    await outline
      .locator(`button[data-object-id="${shapeObject.id}"]`)
      .click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Group', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const grouped = await getDocument();
    rec.check(
      'grouped image and shape retain stable native child identities',
      grouped.document.slides[0].objects.some(
        (object) =>
          object.kind === 'group' &&
          object.children?.some((child) => child.id === imageObject.id) &&
          object.children?.some((child) => child.id === shapeObject.id),
      ),
    );
    await page
      .getByLabel('Speaker notes', { exact: true })
      .fill('Presenter: explain the supplied figures without changing the source facts.');
    await page.getByRole('button', { name: 'Apply notes', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const noted = await getDocument();
    rec.check(
      'speaker notes remain editable and persist through native save',
      noted.document.slides[0].notes ===
        'Presenter: explain the supplied figures without changing the source facts.',
    );
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Presentation preview' });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('img')).toHaveCount(1);
    await expect(viewer.getByRole('status', { name: 'Slide position' })).toHaveText(
      `Slide 1 of ${grouped.document.slides.length}`,
    );
    await expect(viewer.locator('[aria-busy="false"]')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(artifactDir, 'present.png'), fullPage: true });
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('status', { name: 'Slide position' })).toHaveText(
      `Slide 2 of ${grouped.document.slides.length}`,
    );
    await expect(viewer.locator('[aria-busy="false"]')).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByRole('status', { name: 'Slide position' })).toHaveText(
      `Slide 1 of ${grouped.document.slides.length}`,
    );
    await expect(viewer.locator('[aria-busy="false"]')).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    rec.record(
      'presentation mode uses real WASM slide previews with keyboard order and Escape',
      'PASS',
    );
    await page.getByRole('checkbox', { name: 'Select slide 1 for variants' }).check();
    await page.getByRole('tab', { name: 'Agent', exact: true }).click();
    const allowedLayout = (await getDocument()).document.layouts?.find(
      (layout) => layout.agentAllowed,
    );
    assert(allowedLayout);
    await page.getByText('Allowed layouts', { exact: true }).click();
    const layoutToggle = page.getByRole('checkbox', { name: allowedLayout.name, exact: true });
    await layoutToggle.click();
    await expect(layoutToggle).not.toBeChecked({ timeout: 60_000 });
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const policySaved = await getDocument();
    rec.check(
      'human layout permission persists before drafting agent variants',
      policySaved.document.layouts?.find((layout) => layout.id === allowedLayout.id)
        ?.agentAllowed === false,
    );
    await page.getByRole('combobox', { name: 'Change', exact: true }).click();
    await page.getByRole('option', { name: 'Selected slides', exact: true }).click();
    await page
      .getByLabel('Brief', { exact: true })
      .fill('Create a shorter investor pitch while preserving supplied facts.');
    await page.getByRole('button', { name: 'Draft variants', exact: true }).click();
    const proposals = page.getByRole('region', { name: 'Proposed variants' });
    await expect(proposals).toBeVisible({ timeout: 60_000 });
    await proposals.getByRole('button').first().click();
    const comparison = page.getByRole('region', { name: 'Variant comparison' });
    await comparison.scrollIntoViewIfNeeded();
    await expect(comparison.locator('img')).toHaveCount(2, { timeout: 60_000 });
    await page
      .getByLabel('Variant name', { exact: true })
      .fill('Browser reviewed investor variant');
    await page.getByRole('button', { name: 'Save independent variant', exact: true }).click();
    await expect(
      page.getByText('Saved “Browser reviewed investor variant”.', { exact: false }),
    ).toBeVisible({ timeout: 60_000 });
    rec.record(
      'fixture proposal traverses native validation, WASM comparison and independent Files variant',
      'PASS',
    );
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Review export', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Confirm export to Files', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Confirm export to Files', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Exported files' })).toBeVisible({
      timeout: 60_000,
    });
    const links = page.getByRole('region', { name: 'Exported files' }).getByRole('link');
    await expect(links).toHaveCount(2);
    rec.record(
      'browser review and approval export actual PPTX/PDF through Files registrar',
      'PASS',
    );
    const deliveryUrls = await links.evaluateAll((anchors) =>
      anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
    );
    const deliveries = await Promise.all(
      deliveryUrls.map(async (url) => {
        assert(
          ['localhost', '127.0.0.1'].includes(new URL(url).hostname),
          'Fixture delivery must stay on the local storage host.',
        );
        const response = await fetch(url);
        assert(response.ok);
        return Buffer.from(await response.arrayBuffer());
      }),
    );
    rec.check(
      'reviewed Files links download real PPTX package and PDF bytes',
      deliveries.some((bytes) => bytes.subarray(0, 2).toString() === 'PK') &&
        deliveries.some((bytes) => bytes.subarray(0, 5).toString() === '%PDF-'),
    );
    await Promise.all(
      deliveries.map((bytes) => {
        const name =
          bytes.subarray(0, 2).toString() === 'PK'
            ? 'delivered.pptx'
            : bytes.subarray(0, 5).toString() === '%PDF-'
              ? 'delivered.pdf'
              : null;
        assert(name, 'Unknown document delivery bytes.');
        return writeFile(path.join(artifactDir, name), bytes);
      }),
    );
    const sharedBefore = await getDocument();
    const sharedSlide = sharedBefore.document.slides[0];
    const sharedText = sharedSlide.objects.find(
      (object) => object.kind === 'text' && object.name === 'Title',
    );
    assert(sharedText);
    const sharedGroup = sharedSlide.objects.find((object) => object.kind === 'group');
    assert(sharedGroup);
    const sharedCommands = [
      {
        type: 'object.text',
        slideId: sharedSlide.id,
        objectId: sharedText.id,
        text: 'Shared native and browser engine proof',
      },
      {
        type: 'object.style',
        slideId: sharedSlide.id,
        objectId: sharedText.id,
        style: { fontSize: 30, color: '#222222' },
      },
      {
        type: 'object.transform',
        slideId: sharedSlide.id,
        objectId: sharedGroup.id,
        bounds: { ...sharedGroup.bounds, x: sharedGroup.bounds.x + 10 },
      },
    ];
    const browserApplied = await page.evaluate(
      async ({ document, commands }) => {
        const modulePath = '/src/components/forge/presentations/presentationEngine.ts';
        const { PresentationEngine } = await import(modulePath);
        const engine = new PresentationEngine();
        try {
          return await engine.process({
            operation: 'apply',
            document,
            expectedRevision: document.revision,
            retryId: crypto.randomUUID(),
            commands,
          });
        } finally {
          engine.dispose();
        }
      },
      { document: sharedBefore.document, commands: sharedCommands },
    );
    const serverResponse = await fetch(
      `${fixture.apiUrl}/api/ai-studio/templates/${fixture.assetId}/presentation`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: fixture.brandId,
          baseVersionId: fixture.baseVersionId,
          expectedRevision: sharedBefore.draftRevision,
          retryId: crypto.randomUUID(),
          commands: sharedCommands,
        }),
      },
    );
    assert(serverResponse.ok);
    const nativeApplied = presentationEnvelopeSchema.parse(await serverResponse.json());
    assert(browserApplied.ok && browserApplied.document);
    rec.check(
      'same text, style and group transform batch yields identical native/browser stable slide-object projection',
      JSON.stringify(browserApplied.document.slides) ===
        JSON.stringify(nativeApplied.document.slides),
    );
    const browserPng = await page.evaluate(
      async ({ document, slideId }) => {
        const modulePath = '/src/components/forge/presentations/presentationEngine.ts';
        const { PresentationEngine } = await import(modulePath);
        const engine = new PresentationEngine();
        try {
          return await engine.process({ operation: 'render', document, slideId });
        } finally {
          engine.dispose();
        }
      },
      { document: browserApplied.document, slideId: sharedSlide.id },
    );
    const nativePngResponse = await fetch(
      `${fixture.apiUrl}/api/ai-studio/templates/${fixture.assetId}/presentation/preview`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: fixture.brandId,
          baseVersionId: fixture.baseVersionId,
          slideId: sharedSlide.id,
        }),
      },
    );
    assert(nativePngResponse.ok && browserPng.ok && browserPng.artifact);
    const nativePng = presentationArtifactSchema.parse((await nativePngResponse.json()).artifact);
    rec.check(
      'shared font/native/browser rendering produces byte-identical PNG',
      browserPng.artifact.bytesBase64 === nativePng.bytesBase64,
    );
    const mismatch = await page.evaluate(
      async ({ document, slideId }) => {
        const modulePath = '/src/components/forge/presentations/presentationEngine.ts';
        const { PresentationEngine } = await import(modulePath);
        const engine = new PresentationEngine();
        try {
          await engine.process({
            operation: 'render',
            document: { ...document, engineVersion: 'unmatched-font-build' },
            slideId,
          });
          return '';
        } catch (reason) {
          return reason instanceof Error ? reason.message : String(reason);
        } finally {
          engine.dispose();
        }
      },
      { document: nativeApplied.document, slideId: sharedSlide.id },
    );
    rec.check(
      'real WASM rejects a document from a different engine/font build',
      mismatch.includes('do not match'),
    );
    await page.screenshot({ path: path.join(artifactDir, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('region', { name: 'Presentation workspace' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    rec.check('mobile layout fits viewport', !overflow);
    await page.screenshot({ path: path.join(artifactDir, 'mobile.png'), fullPage: true });
    await page.evaluate(
      (envelope) =>
        window.dispatchEvent(
          new CustomEvent('forge-presentation-bench:envelope', {
            detail: {
              ...envelope,
              document: { ...envelope.document, engineVersion: 'unmatched-font-build' },
            },
          }),
        ),
      nativeApplied,
    );
    await expect(
      page
        .getByText(
          'The browser and server presentation engines do not match. Refresh before editing this deck.',
          { exact: false },
        )
        .first(),
    ).toBeVisible();
    rec.record('mismatched engine/font build visibly blocks real workspace previews', 'PASS');
    await page.evaluate(
      (envelope) =>
        window.dispatchEvent(
          new CustomEvent('forge-presentation-bench:envelope', { detail: envelope }),
        ),
      nativeApplied,
    );
    rec.check('browser has no uncaught runtime errors', errors.length === 0);
    rec.note(
      'Real local fixture HTTP/native/PostgreSQL/files boundaries; fixture bearer auth. Hosted full app, source upload/rebind browser routes, Supabase JWT/RLS/Storage and live AI provider, PowerPoint and Google Slides are unexecuted.',
    );
  } catch (reason) {
    rec.note(`Browser body: ${(await page.locator('body').innerText()).slice(0, 2500)}`);
    rec.note(`Browser runtime errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true });
    rec.record(
      'browser presentation journey',
      'FAIL',
      reason instanceof Error ? reason.stack : String(reason),
    );
  } finally {
    await browser.close();
    await vite.close();
  }
  rec.finish({ json: process.env.BENCH_JSON === '1' });
}
