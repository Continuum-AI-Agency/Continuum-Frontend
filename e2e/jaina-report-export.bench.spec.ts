import { expect, test } from '@playwright/test';

// `jaina:report:export:e2e:bench` — the anchor for the node-by-node report export.
//
// It drives the REAL `renderExportDocument` (via the dev-preview harness) over a
// report covering every block category, then asserts the two things that separate
// this from the raster exporter it replaced: the document is composed node by node,
// and the PDF the browser writes from it is VECTOR — selectable text, not a picture.
//
// No Supabase, no Backend, no auth: the harness is an unauthenticated page and the
// fixture is parsed by the real report schema.

const EXPECTED_BLOCKS = [
  { id: 'kpis', category: 'metric_grid' },
  { id: 'spend-trend', category: 'chart' },
  { id: 'actions', category: 'insight_list' },
  { id: 'placement-mix', category: 'chart' },
  { id: 'top-ads', category: 'data_table' },
  { id: 'wow', category: 'comparison' },
  { id: 'risks', category: 'narrative' },
];

/** Page count straight out of the PDF bytes — no parser dependency. */
function countPdfPages(pdf: Buffer): number {
  const matches = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches?.length ?? 0;
}

test('composes the report node by node and prints a vector PDF', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/dev-preview/jaina-report-export');
  await page.getByRole('button', { name: 'Build export document' }).click();

  // Report WHY an export failed. Asserting 'ready' directly just times out and says
  // "expected ready, got failed", which hides the one sentence that explains it.
  const shell = page.locator('main');
  await expect(shell).not.toHaveAttribute('data-export-state', 'building', { timeout: 120_000 });
  const state = await shell.getAttribute('data-export-state');
  if (state !== 'ready') {
    const reason = await page
      .locator('[data-export-error]')
      .textContent()
      .catch(() => null);
    throw new Error(`Export did not complete (state=${state}): ${reason ?? 'no reason reported'}`);
  }

  const frame = page.frameLocator('[data-jaina-export-frame]');

  // --- Node by node -------------------------------------------------------
  const sections = frame.locator('[data-block-id]');
  await expect(sections).toHaveCount(EXPECTED_BLOCKS.length);
  for (const block of EXPECTED_BLOCKS) {
    await expect(frame.locator(`[data-block-id="${block.id}"]`)).toHaveAttribute(
      'data-category',
      block.category,
    );
  }

  // --- The lazy gate actually resolved ------------------------------------
  // `BlockRenderer` is React.lazy; a document printed early is a page of skeletons.
  await expect(frame.locator('[data-block-skeleton]')).toHaveCount(0);

  // --- Charts are real, drawn, vector SVG ---------------------------------
  // `.recharts-surface`, not the first <svg> — that one is the provenance icon the
  // export hides, and it measures zero whether or not the chart drew.
  for (const block of EXPECTED_BLOCKS.filter((b) => b.category === 'chart')) {
    const surface = frame.locator(`[data-block-id="${block.id}"] svg.recharts-surface`);
    await expect(surface).toBeVisible();
    const box = await surface.boundingBox();
    // Near the full page width: catches a collapsed chart AND one that overflows it.
    expect(box?.width ?? 0).toBeGreaterThan(400);
    expect(box?.width ?? 0).toBeLessThanOrEqual(720);
    expect(box?.height ?? 0).toBeGreaterThan(100);
  }

  // THE SERIES, not just "some geometry". Counting any <path> passes on a chart that
  // rendered only its gridlines and axes — which is exactly what a report with no
  // line and an invisible pie looked like, while every other assertion here was green.
  const lineCurve = frame.locator('[data-block-id="spend-trend"] .recharts-line-curve').first();
  await expect(lineCurve).toBeVisible();
  const curve = (await lineCurve.getAttribute('d')) ?? '';
  // 14 points plotted as a monotone curve: a drawn line is a long path, an
  // un-advanced animation is empty or a single moveto.
  expect(curve.length).toBeGreaterThan(200);

  // One sector per slice, each with real geometry.
  const sectors = frame.locator('[data-block-id="placement-mix"] .recharts-pie-sector');
  await expect(sectors).toHaveCount(4);
  for (const d of await frame
    .locator('[data-block-id="placement-mix"] .recharts-pie-sector path')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('d') ?? ''))) {
    expect(d.length).toBeGreaterThan(20);
  }

  // Slices must be DISTINGUISHABLE. Recharts' default fill paints every sector the
  // same colour, which renders a pie chart as one solid disc that is technically
  // present and completely unreadable.
  const fills = await frame
    .locator('[data-block-id="placement-mix"] .recharts-pie-sector path')
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).fill));
  expect(new Set(fills).size).toBe(4);
  // And resolved to real colours, not an unresolved var() falling back to black.
  for (const fill of fills) expect(fill).toMatch(/^rgb/);

  // A pie with no labels cannot be read off paper, where there is no tooltip.
  await expect(frame.locator('[data-block-id="placement-mix"]')).toContainText('Reels');

  // Axis ticks must be readable, not a smear: 14 daily ticks do not fit 703px.
  const tickCount = await frame
    .locator('[data-block-id="spend-trend"] .recharts-xAxis .recharts-cartesian-axis-tick')
    .count();
  expect(tickCount).toBeGreaterThan(1);
  expect(tickCount).toBeLessThanOrEqual(8);

  // --- The table rendered its rows, un-scrolled ---------------------------
  await expect(frame.locator('[data-block-id="top-ads"] tbody tr')).toHaveCount(5);

  // --- Content that lives inside an interactive affordance survives -------
  // MediaPreview wraps the creative's NAME in a button. Hiding interaction must not
  // delete report text with it.
  await expect(frame.locator('[data-block-id="risks"]')).toContainText('Spring Hero — 9x16');

  // --- Currency columns resolve, rather than admitting they cannot --------
  await expect(frame.locator('[data-block-id="top-ads"]')).not.toContainText('currency unknown');

  // --- Every image is inlined, so the file is self-contained --------------
  const imageSrcs = await frame
    .locator('img')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute('src') ?? ''),
    );
  // Non-vacuous: the fixture carries a media-mapped creative, so if this is empty the
  // inlining step was never exercised and the assertion below proves nothing.
  expect(imageSrcs.length).toBeGreaterThan(0);
  for (const src of imageSrcs) expect(src.startsWith('data:')).toBe(true);

  // --- The printed artifact ----------------------------------------------
  // Print the serialized bytes, which is exactly what a user saves.
  const html = await page.evaluate(() => window.__jainaExportHtml ?? '');
  expect(html.length).toBeGreaterThan(0);

  const printPage = await page.context().newPage();
  await printPage.setContent(html, { waitUntil: 'load' });
  const pdf = await printPage.pdf({ format: 'A4', printBackground: true });
  await printPage.close();

  expect(pdf.byteLength).toBeGreaterThan(1_000);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  const body = pdf.toString('latin1');

  // Vector, not raster — the assertion the previous exporter could never have passed.
  // It embedded ONE full-page PNG per page and drew no text at all, so a reader could
  // not select, search or copy a single number out of the report.
  expect(body).toContain('/FontDescriptor');
  // Exactly the images the report actually contains (the one media thumbnail). A
  // screenshot-based export would carry one image XObject per page and nothing else.
  const imageXObjects = (body.match(/\/Subtype\s*\/Image/g) ?? []).length;
  expect(imageXObjects).toBe(1);

  // Designed as a one-pager: a seven-module report is allowed to spill, not sprawl.
  const pages = countPdfPages(pdf);
  expect(pages).toBeGreaterThan(0);
  expect(pages).toBeLessThanOrEqual(3);

  expect(consoleErrors).toEqual([]);
});
