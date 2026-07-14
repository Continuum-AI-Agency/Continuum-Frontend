import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { PlaybackRun } from './support/playbackBenchEntry';

// End-to-end bench for bug #188 — "Sometimes it stays in a loop in a video and out
// of nowhere it goes out" (AI Studio Video Editor preview).
//
// This drives the REAL usePlayheadPlayback hook and the REAL timeline geometry
// against a REAL <video> element decoding REAL H.264 in a REAL Chrome — the
// element boundary that the unit tests can only fake. The two sources are encoded
// in-page by Mediabunny (the editor's own encoder), each painting a flat color per
// second, so the pixel on screen reports which source-second is playing.
//
// The timeline is the reporter's: an 8s source trimmed 0.00 → 8.00 (it runs to the
// media's natural end, so the element fires `ended`) at 3.50x, then a second source
// trimmed in at 1.00s at 1.50x.
//
// What it proves:
//   1. Playback terminates — the transport is not stuck replaying a clip forever.
//   2. The playhead never rewinds — the reported "loop" is a jump back to the clip
//      start after play() restarts an ended element.
//   3. The playhead never stalls at the clip boundary — the reported freeze.
//   4. The element is seeked to the trim-in: clip B's trimmed-away first second
//      (magenta) never once reaches the frame.
//   5. Both clips actually play, and the timeline ends on its true total.
//
// Run: bun run videoeditor:e2e:bench   (from Continuum-Frontend)

// Playwright's bundled Chromium ships no proprietary codecs, so an H.264 MP4 would
// never decode and no <video> clock would ever advance. Real Chrome is the point.
test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 180_000 });

// The trimmed-away first second of source B. If this color ever lands on the frame,
// the element played B's untrimmed head — the stall the report describes.
const B_TRIMMED_HEAD_RGB: [number, number, number] = [255, 0, 255];
const CHANNEL_TOLERANCE = 40;

const isColor = (rgb: [number, number, number], target: [number, number, number]): boolean =>
  rgb.every((channel, index) => Math.abs(channel - target[index]) <= CHANNEL_TOLERANCE);

function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `playback-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/playbackBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

test('preview: a trimmed, sped-up multi-clip timeline plays through without looping or stalling', async ({
  browser,
}) => {
  const bundle = buildBrowserBundle();
  const context = await browser.newContext();
  const page = await context.newPage();

  // The bench needs a real origin (module scripts, OffscreenCanvas, WebCodecs) but
  // no app route: the hook is mounted directly, so nothing else can colour the run.
  await page.route('**/video-editor-playback-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/video-editor-playback-bench', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__playbackBench));

  const run = (await page.evaluate(() => window.__playbackBench.runPlayback())) as PlaybackRun;

  // 8s @ 3.50x = 2.286s, then 3s @ 1.50x = 2.0s.
  expect(run.totalSec).toBeCloseTo(8 / 3.5 + 2, 3);
  expect(run.clipStarts[1]).toBeCloseTo(8 / 3.5, 3);
  expect(run.samples.length).toBeGreaterThan(30);

  const boundarySec = run.clipStarts[1];
  const playheads = run.samples.map((sample) => sample.playheadSec);

  // 1) The transport stopped itself at the end of the timeline, in about the time
  //    the timeline actually lasts. A looping clip would hit the bench ceiling.
  expect(run.stoppedByHook).toBe(true);
  expect(run.finalPlayheadSec).toBeCloseTo(run.totalSec, 3);
  expect(run.durationMs).toBeLessThan(run.totalSec * 1000 + 2500);

  // 2) The playhead never goes backwards. play() on an ended element seeks it to 0,
  //    which drags the playhead back to the clip start — the reported loop.
  const worstRewind = playheads.reduce(
    (worst, sec, index) => (index === 0 ? worst : Math.max(worst, playheads[index - 1] - sec)),
    0,
  );
  expect(worstRewind).toBeLessThan(0.05);

  // 3) The playhead never freezes — least of all at the clip boundary, where the
  //    element is re-pointed at another source and seeked.
  let longestStallMs = 0;
  let stallStartMs = run.samples[0].atMs;
  for (let index = 1; index < run.samples.length; index += 1) {
    const moved = run.samples[index].playheadSec - run.samples[index - 1].playheadSec > 0.001;
    if (moved) stallStartMs = run.samples[index].atMs;
    else longestStallMs = Math.max(longestStallMs, run.samples[index].atMs - stallStartMs);
  }
  expect(longestStallMs).toBeLessThan(400);

  // 4) Clip B was seeked to its trim-in: its first second never reached the frame,
  //    and the element's clock is never below the trim-in while B is on screen.
  const onClipB = run.samples.filter(
    (sample) => sample.srcTag === 'B' && sample.playheadSec > boundarySec + 0.15,
  );
  expect(onClipB.length).toBeGreaterThan(10);
  expect(onClipB.filter((sample) => isColor(sample.rgb, B_TRIMMED_HEAD_RGB))).toHaveLength(0);
  const belowTrimIn = onClipB.filter(
    (sample) => sample.currentTimeSec > 0 && sample.currentTimeSec < 0.95,
  );
  expect(belowTrimIn).toHaveLength(0);

  // 5) Both clips really played: the element consumed source A across its 8 seconds
  //    at 3.5x, and source B ran from its trim-in towards its trim-out.
  const onClipA = run.samples.filter((sample) => sample.srcTag === 'A');
  expect(Math.max(...onClipA.map((sample) => sample.currentTimeSec))).toBeGreaterThan(7);
  expect(Math.max(...onClipB.map((sample) => sample.currentTimeSec))).toBeGreaterThan(3);

  await context.close();
});
