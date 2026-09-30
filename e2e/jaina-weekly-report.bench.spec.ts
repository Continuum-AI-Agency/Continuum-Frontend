import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createBenchRecorder } from './support/benchRecorder';

// `jaina:weekly-report:render:bench` — the Frontend half of `jaina:weekly-report:e2e:bench`.
//
// Renders the weekly report the Backend's live bench wrote (artifacts/jaina/weekly-report-live.json)
// through the REAL J2 card — `JainaReportV2` → TemplateBlock → the template registry — and
// asserts every part of it against the body it was given: the header's two windows, timezone
// and currency; every tile with its prior and read; one section per objective with its Signal,
// its A|B table or its 'No active campaigns' note, and what / so what / now what; every
// recommendation card. Then it builds the REAL export document and prints a vector PDF.
//
// When no live artifact exists the harness renders the fixture and this bench SAYS so in its
// output — a green run on the fixture is not a green run on live data.

/**
 * The page budget follows the content by a fixed rule, never by what one run printed: the
 * header, tiles and recommendation cards fit two A4 pages, and each further page holds two
 * objective sections (a section never splits across pages).
 */
const maxPdfPages = (objectives: number): number => 2 + Math.ceil(objectives / 2);
/** Where the run keeps what it printed and saw, beside the live artifact it read. */
const OUT_DIR = path.resolve(process.cwd(), '..', 'artifacts', 'jaina', 'weekly-report-render');

/** `text-xs`, the 12px step of the type scale, at every tier of the root ladder. */
const MIN_FONT_REM = 0.75;

type Body = {
  header: {
    timezone: string;
    currency: string | null;
    period_a: { since: string; until: string };
    period_b: { since: string; until: string };
  };
  tiles: Array<{ id: string; prior_figure_id: string | null }>;
  objectives: Array<{ objective: string; active: boolean; no_active_note: string | null }>;
  recommendations: Array<{ id: string; priority: string; impact: { level: string } }>;
};

function countPdfPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

async function openHarness(
  page: Page,
): Promise<{ body: Body; source: string; kind: 'live' | 'fixture' }> {
  await page.goto('/dev-preview/jaina-weekly-report');
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-report-source', /live|fixture/);
  const parseError = page.locator('[data-report-parse-error]');
  if ((await parseError.count()) > 0) {
    throw new Error(`The report did not parse: ${await parseError.textContent()}`);
  }
  await expect(page.getByTestId('weekly-report')).toBeVisible();
  const body = await page.evaluate(() => window.__weeklyReportBody ?? null);
  if (!body) throw new Error('The report carries no weekly_report block.');
  const source = (await page.getByTestId('report-source').textContent()) ?? '';
  const kind = (await main.getAttribute('data-report-source')) === 'live' ? 'live' : 'fixture';
  return { body: body as unknown as Body, source, kind };
}

/**
 * Nothing inside the report prints under 12px, and the page never scrolls sideways.
 *
 * Measured the way the optimizer's type-scale bench measures it: the app runs a root
 * font-size ladder (15px, 14.5px under 1536 wide or 900 tall, 13.5px and 13px below), and
 * `text-xs` — the 12px step — is the 0.75rem floor at every tier. So the floor is in rem, and
 * no micro class (`text-2xs` / `text-3xs`) may appear at all.
 */
async function expectReadable(page: Page) {
  const found = await page.getByTestId('weekly-report').evaluate((root, floorRem) => {
    const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const all = [...root.querySelectorAll('*')].filter((el) => el.closest('svg') === null);
    const ownText = (el: Element) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    const describe = (el: Element) => `"${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const small = all
      .filter((el) => ownText(el))
      .map((el) => ({ el, rem: Number.parseFloat(getComputedStyle(el).fontSize) / rootPx }))
      .filter(({ rem }) => rem < floorRem - 0.005)
      .map(({ el, rem }) => `${rem.toFixed(3)}rem ${describe(el)}`);
    const micro = all
      .filter((el) => /\btext-[23]xs\b/.test(el.getAttribute('class') ?? ''))
      .map(describe);
    return { small, micro };
  }, MIN_FONT_REM);
  expect(found.small).toEqual([]);
  expect(found.micro).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('renders every section and card of the weekly report and prints a vector PDF', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  const recorder = createBenchRecorder('jaina:weekly-report:render:bench', []);
  const { step, notes } = recorder;
  const { body, source, kind } = await step('open the harness and parse the report', () =>
    openHarness(page),
  ).catch((error) => {
    recorder.print();
    throw error;
  });
  console.log(`[weekly-report render] ${source}`);
  if (kind === 'live') {
    recorder.record('render the live artifact', 'PASS', source);
  } else {
    recorder.record('render the live artifact', 'SKIP', source);
    notes.push(
      'unexercised hop: artifacts/jaina/weekly-report-live.json was absent, so the FIXTURE was rendered — run jaina:weekly-report:live:bench (Backend) first for a live render',
    );
  }

  try {
    const report = page.getByTestId('weekly-report');

    await step('The header: both windows, the timezone, the currency', async () => {
      const header = page.getByTestId('weekly-report-header');
      await expect(header.locator('[data-period="a"]')).toHaveAttribute(
        'data-period-range',
        `${body.header.period_a.since}..${body.header.period_a.until}`,
      );
      await expect(header.locator('[data-period="b"]')).toHaveAttribute(
        'data-period-range',
        `${body.header.period_b.since}..${body.header.period_b.until}`,
      );
      await expect(page.getByTestId('weekly-report-timezone')).toContainText(body.header.timezone);
      if (body.header.currency) {
        await expect(page.getByTestId('weekly-report-currency')).toContainText(
          body.header.currency,
        );
      }
    });

    await step('The thesis carries a figure', async () => {
      await expect(
        page.locator('[data-template-part="executive"] > p [data-testid="figure"]').first(),
      ).toBeVisible();
    });

    await step('Tiles: value, prior, read', async () => {
      await expect(report.locator('[data-tile]')).toHaveCount(body.tiles.length);
      for (const tile of body.tiles) {
        const node = report.locator(`[data-tile="${tile.id}"]`);
        await expect(node).toContainText('Prior week');
        await expect(node.locator('[data-tile-read-label]')).not.toBeEmpty();
        if (tile.prior_figure_id) {
          await expect(node.locator(`[data-figure-id="${tile.prior_figure_id}"]`)).toBeVisible();
        }
      }
    });

    await step('One section per objective', async () => {
      const sections = report.locator('[data-objective]');
      await expect(sections).toHaveCount(body.objectives.length);
      for (const objective of body.objectives) {
        const section = report.locator(`[data-objective="${objective.objective}"]`);
        await expect(section.getByTestId('weekly-report-signal')).toContainText('Signal');
        for (const part of ['what', 'so_what', 'now_what']) {
          await expect(section.locator(`[data-part="${part}"]`)).not.toBeEmpty();
        }
        if (objective.active) {
          const table = section.getByTestId('weekly-report-period-table');
          await expect(table.locator('thead')).toContainText('Period A');
          await expect(table.locator('thead')).toContainText('Period B');
          await expect(table.locator('tbody tr')).toHaveCount(5);
        } else {
          await expect(section.getByTestId('weekly-report-no-active')).toHaveText(
            objective.no_active_note ?? 'No active campaigns.',
          );
        }
      }
    });

    await step('Recommendation cards', async () => {
      const recommendations = page.getByTestId('weekly-report-recommendations');
      await expect(recommendations.locator('[data-recommendation]')).toHaveCount(
        body.recommendations.length,
      );
      for (const card of body.recommendations) {
        const node = recommendations.locator(`[data-recommendation="${card.id}"]`);
        for (const part of ['what', 'where', 'why', 'source', 'impact', 'priority']) {
          await expect(node.locator(`[data-part="${part}"]`)).not.toBeEmpty();
        }
        await expect(
          node.locator('[data-part="why"] [data-testid="figure"]').first(),
        ).toBeVisible();
        await expect(node.locator('[data-impact-basis="estimate"]')).toHaveText('Estimate');
        await expect(node).toHaveAttribute('data-priority', card.priority);
      }
      if (body.recommendations.length === 0) {
        await expect(recommendations).toContainText('No pending recommendations');
      }
    });

    await step('Every figure resolved', async () => {
      await expect(report.locator('[data-figure-unresolved]')).toHaveCount(0);
    });

    await step("The card's own Save and export affordances, unchanged", async () => {
      await expect(page.locator('main')).toHaveAttribute('data-save-plan', 'ok');
      await expect(
        page.getByRole('button', { name: 'Save the visible modules as a dashboard' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export report as PDF' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export report as HTML' })).toBeVisible();
    });

    await step('Readable at desktop and phone width', async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      await expectReadable(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'report-1280.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expectReadable(page);
      await page.screenshot({ path: path.join(OUT_DIR, 'report-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await step('The export document, through the real renderExportDocument', async () => {
      await page.getByRole('button', { name: 'Build export document' }).click();
      const shell = page.locator('main');
      await expect(shell).not.toHaveAttribute('data-export-state', 'building', {
        timeout: 120_000,
      });
      const state = await shell.getAttribute('data-export-state');
      if (state !== 'ready') {
        const reason = await page
          .locator('[data-export-error]')
          .textContent()
          .catch(() => null);
        throw new Error(
          `Export did not complete (state=${state}): ${reason ?? 'no reason reported'}`,
        );
      }
      const frame = page.frameLocator('[data-jaina-export-frame]');
      await expect(frame.locator('[data-objective]')).toHaveCount(body.objectives.length);
      await expect(frame.locator('[data-recommendation]')).toHaveCount(body.recommendations.length);
      await expect(frame.locator('[data-tile]')).toHaveCount(body.tiles.length);
      await expect(frame.locator('[data-block-skeleton]')).toHaveCount(0);

      const html = await page.evaluate(() => window.__jainaExportHtml ?? '');
      expect(html).toContain('data-testid="weekly-report"');

      const printPage = await page.context().newPage();
      await printPage.setContent(html, { waitUntil: 'load' });
      const pdf = await printPage.pdf({ format: 'A4', printBackground: true });
      await printPage.close();

      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const bytes = pdf.toString('latin1');
      // Vector: real fonts, selectable text — and no page-sized raster standing in for it.
      expect(bytes).toContain('/FontDescriptor');
      expect((bytes.match(/\/Subtype\s*\/Image/g) ?? []).length).toBe(0);
      writeFileSync(path.join(OUT_DIR, 'report.pdf'), pdf);
      const pages = countPdfPages(pdf);
      console.log(`[weekly-report render] PDF ${pages} page(s), ${pdf.byteLength} bytes`);
      expect(pages).toBeGreaterThan(0);
      expect(pages).toBeLessThanOrEqual(maxPdfPages(body.objectives.length));
    });

    await step('no console errors', async () => {
      expect(consoleErrors).toEqual([]);
    });
  } finally {
    recorder.print();
  }
});
