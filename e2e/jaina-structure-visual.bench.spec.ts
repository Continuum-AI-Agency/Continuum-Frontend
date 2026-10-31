import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { CampaignStructurePayload } from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import {
  type CompiledStructureLayout,
  compileCampaignStructureHtml,
} from '../../Continuum-Backend/App/agents-ts/Jaina/src/scaffold/campaignStructureHtml';
import {
  FIXTURE_BRAND_ID,
  fixtureStructure,
} from '../src/components/paid-media/jaina/blocks/campaignStructure.fixtures';
import { createBenchRecorder } from './support/benchRecorder';

// ---------------------------------------------------------------------------
// jaina:structure:visual:bench — the five campaign-structure designs (P5, chosen 2026-10-21)
// drawn in a real Chrome at 375 and 1280, from the mock-up payloads.
//
//   01 tree · 04 matrix · 05 funnel  the REAL Backend compiler's documents
//                                    (`compileCampaignStructureHtml`), signed through the real
//                                    `signHyperframeAsset`, in the real sandboxed frame
//   08 diff · 09 outline             the canvas's Read card (React), styled by the app's own
//                                    Tailwind build (globals.css compiled for these files)
//
// Asserted at each width: no horizontal overflow on the page or in any figure; every node
// drawn and visible (the outline fully unfolded; inside a frame, inside the frame's box —
// the frame is sized from `html.height` alone, so a node below it would be clipped); no
// script in any frame document and an empty sandbox on every frame. Screenshots land in
// artifacts/jaina-structure-visual/<width>/<layout>.png.
//
// NOT exercised: the Backend upload and the sign route itself (the sign POST is answered by
// the page route with a local URL); a live model choosing the layout. $0, no writes.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 180_000 });

const BENCH = 'jaina:structure:visual:bench';
const ROOT = resolve(__dirname, '..');
const ARTIFACTS = resolve(ROOT, '../artifacts/jaina-structure-visual');
const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [375, 1280] as const;
const COMPILED: CompiledStructureLayout[] = ['tree', 'matrix', 'funnel'];
const LAYOUTS = ['tree', 'matrix', 'funnel', 'diff', 'outline'] as const;

const notes: string[] = [];
const rec = createBenchRecorder(BENCH, notes);

/** The real compiler's document and height for each compiled design, from the same nodes. */
function compiledDesigns() {
  return Object.fromEntries(
    COMPILED.map((layout) => {
      const structure = fixtureStructure(layout);
      const compiled = compileCampaignStructureHtml(layout, {
        title: structure.title,
        nodes: structure.nodes,
        counts: structure.counts,
      });
      return [layout, compiled];
    }),
  ) as Record<CompiledStructureLayout, ReturnType<typeof compileCampaignStructureHtml>>;
}

function payloads(designs: ReturnType<typeof compiledDesigns>): CampaignStructurePayload[] {
  return LAYOUTS.map((layout) => {
    const structure = fixtureStructure(layout);
    if (!structure.html) return structure;
    const compiled = designs[layout as CompiledStructureLayout];
    return {
      ...structure,
      html: { ...structure.html, width: compiled.width, height: compiled.height },
    };
  });
}

function buildBundle(): string {
  const outfile = join(tmpdir(), `structure-visual-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    [
      'build',
      'e2e/support/campaignStructureVisualEntry.tsx',
      '--target=browser',
      '--outfile',
      outfile,
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

/** The app's own stylesheet, built for exactly the files this bench renders. */
async function buildCss(): Promise<string> {
  const css = resolve(ROOT, 'src/app/globals.css');
  const compiler = await compile(readFileSync(css, 'utf8'), {
    base: dirname(css),
    onDependency: () => undefined,
  });
  const files = [
    'src/components/paid-media/jaina/blocks/JainaCampaignStructure.tsx',
    'src/components/ui/button.tsx',
    'e2e/support/campaignStructureVisualEntry.tsx',
  ];
  const candidates = new Scanner({}).scanFiles(
    files.map((file) => ({ content: readFileSync(resolve(ROOT, file), 'utf8'), extension: 'tsx' })),
  );
  return compiler.build(candidates);
}

async function mount(
  page: Page,
  args: {
    bundle: string;
    css: string;
    structures: CampaignStructurePayload[];
    documents: Record<string, string>;
  },
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/structure-visual-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.process={env:{NEXT_PUBLIC_API_URL:"${ORIGIN}",NEXT_PUBLIC_SUPABASE_URL:"${ORIGIN}",NEXT_PUBLIC_SUPABASE_ANON_KEY:"browser-bench-anon-key"}}</script><style>${args.css}</style></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`,
    }),
  );
  // The one routed hop: the sign POST answers with a local URL, which serves the document the
  // Backend compiler produced for that path.
  await page.route('**/api/organic/agent/hyperframes/sign', async (route) => {
    const body = route.request().postDataJSON() as { path: string };
    const layout = COMPILED.find((name) => body.path.endsWith(`-${name}.html`)) ?? 'missing';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        signedUrl: `${ORIGIN}/signed/${layout}.html`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
  });
  await page.route('**/signed/*.html', (route) => {
    const layout = route.request().url().split('/').pop()?.replace('.html', '') ?? '';
    const html = args.documents[layout];
    return html
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
      : route.fulfill({ status: 404, body: 'not compiled' });
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );
  await page.addInitScript(
    (value) => {
      (window as unknown as { __structureVisual: unknown }).__structureVisual = value;
    },
    { brandId: FIXTURE_BRAND_ID, structures: args.structures },
  );
  await page.goto(`${ORIGIN}/structure-visual-bench`);
  await page.addScriptTag({ content: args.bundle, type: 'module' });
  await expect(page.getByTestId('campaign-structure')).toHaveCount(LAYOUTS.length);
  await expect(page.locator('iframe')).toHaveCount(COMPILED.length, { timeout: 15_000 });
  if (errors.length > 0)
    throw new Error(`structure visual bench runtime error: ${errors.join(' | ')}`);
}

test('the five structure designs read at 375 and at 1280', async ({ browser }) => {
  const designs = compiledDesigns();
  const structures = payloads(designs);
  const documents = Object.fromEntries(COMPILED.map((layout) => [layout, designs[layout].html]));
  const [bundle, css] = await rec.step('build bundle and stylesheet', async () => [
    buildBundle(),
    await buildCss(),
  ]);
  notes.push(
    `compiled heights: ${COMPILED.map((layout) => `${layout} ${designs[layout].height}px`).join(', ')}`,
  );

  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await rec.step(`${width}: mount`, () => mount(page, { bundle, css, structures, documents }));
      mkdirSync(join(ARTIFACTS, String(width)), { recursive: true });

      await rec.step(`${width}: no horizontal overflow`, async () => {
        const overflow = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth - window.innerWidth,
          figures: [...document.querySelectorAll('[data-testid="campaign-structure"]')].map(
            (figure) => ({
              layout: figure.getAttribute('data-layout'),
              over: figure.scrollWidth - figure.clientWidth,
            }),
          ),
        }));
        expect(overflow.page, 'page scrolls sideways').toBeLessThanOrEqual(0);
        for (const figure of overflow.figures) {
          expect(figure.over, `${figure.layout} overflows its figure`).toBeLessThanOrEqual(0);
        }
      });

      for (const layout of COMPILED) {
        await rec.step(
          `${width}: ${layout} draws every node inside its frame, with no script`,
          async () => {
            const figure = page.locator(
              `[data-testid="campaign-structure"][data-layout="${layout}"]`,
            );
            const iframe = figure.locator('iframe');
            await expect(iframe).toHaveAttribute('sandbox', '');
            const frame = figure.frameLocator('iframe');
            await expect(frame.locator('main')).toBeVisible();
            expect(await frame.locator('script').count()).toBe(0);
            const expected =
              layout === 'tree'
                ? structures[0]?.nodes.length
                : structures[0]?.nodes.filter(
                    (node) =>
                      node.level !== 'campaign' && (layout === 'matrix' || node.level === 'adset'),
                  ).length;
            const nodes = frame.locator('[data-node]');
            await expect(nodes).toHaveCount(expected ?? -1);
            const fit = await iframe.evaluate((element: HTMLIFrameElement) => element.clientHeight);
            const boxes = await nodes.evaluateAll((elements) =>
              elements.map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  node: element.getAttribute('data-node'),
                  w: rect.width,
                  h: rect.height,
                  bottom: rect.bottom,
                  right: rect.right,
                };
              }),
            );
            const docSize = await frame.locator('html').evaluate((html) => ({
              scrollWidth: html.scrollWidth,
              clientWidth: html.clientWidth,
              scrollHeight: document.body.scrollHeight,
            }));
            for (const box of boxes) {
              expect(box.w * box.h, `${box.node} has no box`).toBeGreaterThan(0);
              expect(box.bottom, `${box.node} is below the frame`).toBeLessThanOrEqual(fit + 0.5);
              expect(box.right, `${box.node} is past the frame`).toBeLessThanOrEqual(
                docSize.clientWidth + 0.5,
              );
            }
            expect(
              docSize.scrollWidth,
              `${layout} scrolls sideways inside its frame`,
            ).toBeLessThanOrEqual(docSize.clientWidth);
            await figure.screenshot({ path: join(ARTIFACTS, String(width), `${layout}.png`) });
          },
        );
      }

      await rec.step(
        `${width}: outline reads as the canvas's Read card, every ad set named`,
        async () => {
          const figure = page.locator('[data-testid="campaign-structure"][data-layout="outline"]');
          const lines = figure.locator('[data-testid="lectura-chat-adsets"] li');
          const adSets = (structures[0]?.nodes ?? []).filter((node) => node.level === 'adset');
          await expect(lines).toHaveCount(Math.min(adSets.length, 4));
          for (const line of await lines.all()) await expect(line).toBeVisible();
          await figure.screenshot({ path: join(ARTIFACTS, String(width), 'outline.png') });
        },
      );

      await rec.step(`${width}: diff reads as the copy's changes first, each marked`, async () => {
        const figure = page.locator('[data-testid="campaign-structure"][data-layout="diff"]');
        const changes = figure.locator('[data-testid^="lectura-change-"][data-mark]');
        await expect(changes.first()).toBeVisible();
        for (const change of await changes.all()) await expect(change).toBeVisible();
        await expect(figure).toContainText('Promo Oct');
        await figure.screenshot({ path: join(ARTIFACTS, String(width), 'diff.png') });
      });

      await page.screenshot({ path: join(ARTIFACTS, String(width), 'all.png'), fullPage: true });
      await context.close();
    }
  } finally {
    notes.push(`screenshots: ${ARTIFACTS}`);
    notes.push('not exercised: the Backend upload, the real sign route, a live model turn');
    rec.print();
  }
});
