import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { EditorV2RenderBenchRun } from './support/editorV2RenderBenchEntry';

test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 180_000 });

function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `editor-v2-render-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/editorV2RenderBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

test('durable V2 renders layers, captions, text, audio, and a transition in real Chrome', async ({
  browser,
}) => {
  const bundle = buildBrowserBundle();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/editor-v2-render-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4173/editor-v2-render-bench', {
    waitUntil: 'domcontentloaded',
  });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__editorV2RenderBench));

  const run = (await page.evaluate(() =>
    window.__editorV2RenderBench.run(),
  )) as EditorV2RenderBenchRun;
  expect(run.plan).toEqual({ items: 2, overlays: 1, audioTracks: 1, captionCues: 2 });
  expect(run.bytes).toBeGreaterThan(10_000);
  expect(run.width).toBe(320);
  expect(run.height).toBe(180);
  // Container duration may include one encoded frame beyond the last audio sample.
  expect(Math.abs(run.durationSec - 3.75)).toBeLessThanOrEqual(0.1);
  expect(run.hasAudio).toBe(true);
  // 3.75s cannot contain a whole number of 30fps packets; the final partial
  // frame makes the aggregate rate slightly lower than the nominal cadence.
  expect(Math.abs(run.averagePacketRate - 30)).toBeLessThan(0.5);
  expect(run.colorSpace.primaries).toBe('bt709');
  expect(run.colorSpace.matrix).toBe('bt709');
  expect(run.colorSpace.fullRange).toBe(false);
  expect(run.overlayPixel[0]).toBeGreaterThan(180);
  expect(run.overlayPixel[1]).toBeGreaterThan(150);
  expect(run.overlayPixel[2]).toBeLessThan(80);
  const distance = (pixel: [number, number, number], color: [number, number, number]) =>
    Math.hypot(...pixel.map((channel, index) => channel - color[index]));
  expect(distance(run.transitionPixel, [18, 54, 107])).toBeGreaterThan(25);
  expect(distance(run.transitionPixel, [122, 24, 48])).toBeGreaterThan(25);
  expect(distance(run.effectPixel, [18, 54, 107])).toBeGreaterThan(10);
  expect(
    run.keyframeEdgePixel[0] + run.keyframeEdgePixel[1] + run.keyframeEdgePixel[2],
  ).toBeLessThan(60);
  expect(run.captionWhitePixels).toBeGreaterThan(20);
  expect(run.captionBackgroundPixels).toBeGreaterThan(20);
  expect(run.textGreenPixels).toBeGreaterThan(20);
  expect(run.audioRms).toBeGreaterThan(0.02);
  expect(run.fadeInRms).toBeLessThan(run.audioRms);
  expect(run.audioFrequencyHz).toBeGreaterThan(190);
  expect(run.audioFrequencyHz).toBeLessThan(250);

  await context.close();
});
