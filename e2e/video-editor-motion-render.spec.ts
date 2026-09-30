// videoeditor:motion:render:bench — the motion vocabulary through the REAL browser
// compositor (buildTimelineEditorRenderPlan → composeTimeline, the code Render bundles as
// timeline-editor.js), judged per decoded frame by pixels and bounding boxes, never OCR:
//
//   slide-up     the text's box rises over its entrance window, its alpha grows, then holds
//   typewriter   characters appear progressively from a fixed left edge
//   exit         slide-down runs BEFORE the clip ends: the box drops and fades, at rest before
//   keyframes    a text clip with position keyframes moves across the frame as keyed
//   crossfade    mid-transition pixels blend both clips
//   VHS          the look changes pixels versus the same frame without it
//   box + shadow a text box renders; its drop shadow darkens the box around the glyphs
//
// Two renders — control and styled (VHS + shadow) — so each look is judged against the
// same frame without it, and the shared text measurements double as a determinism check.
// The masters go to GCS (never the Library): gs://…/video-editor-motion/render-<run>/.
//
// NOT EXERCISED: server export of these animations. Render's /v1/timeline serves the
// compositor bundled into the Render image (timeline-editor.js), which the owner rebuilds.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type {
  EntranceSample,
  MotionRenderRun,
  TextBox,
} from './support/videoEditorMotionRenderEntry';

test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 300_000 });

const GCS_PREFIX = 'gs://continuum-production-477821-creative-benchmarks/video-editor-motion';
const FONT_PX = 44;
const WIDTH = 360;

function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `video-editor-motion-render-${Date.now()}.js`);
  execFileSync(
    'bun',
    [
      'build',
      'e2e/support/videoEditorMotionRenderEntry.ts',
      '--target=browser',
      '--outfile',
      outfile,
    ],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

const seen = (boxes: readonly TextBox[]) => boxes.filter((box) => box.count >= 40);
const center = (box: TextBox) => (box.left + box.right) / 2;
const nonIncreasing = (values: readonly number[], slack = 0) =>
  values.every((value, index) => index === 0 || value <= (values[index - 1] ?? value) + slack);
const nonDecreasing = (values: readonly number[], slack = 0) =>
  values.every((value, index) => index === 0 || value >= (values[index - 1] ?? value) - slack);
const describe = (boxes: readonly TextBox[]) =>
  boxes
    .map(
      (box) =>
        `${box.timeSec.toFixed(3)}s n=${box.count} mass=${box.mass} x=${box.left}–${box.right} y=${box.top}–${box.bottom}`,
    )
    .join(' | ');

test('the motion vocabulary renders in the real compositor, judged per frame', async ({
  browser,
}) => {
  const bundle = buildBrowserBundle();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/video-editor-motion-render-bench', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  await page.goto('http://127.0.0.1:4173/video-editor-motion-render-bench', {
    waitUntil: 'domcontentloaded',
  });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__motionRenderBench));
  const control = (await page.evaluate(() =>
    window.__motionRenderBench.run('control'),
  )) as MotionRenderRun;
  const styled = (await page.evaluate(() =>
    window.__motionRenderBench.run('styled'),
  )) as MotionRenderRun;
  const entrances = (await page.evaluate(() =>
    window.__motionRenderBench.entrances(),
  )) as EntranceSample[];
  await context.close();

  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
    expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };

  check(
    'plan: 2 main clips, 5 text cues, a 7 s master',
    control.plan.items === 2 &&
      control.plan.captionCues === 5 &&
      Math.abs(control.durationSec - 7) <= 0.1,
    `items=${control.plan.items} cues=${control.plan.captionCues} duration=${control.durationSec.toFixed(3)}s`,
  );

  // slide-up: over the entrance the box rises by at least a quarter of the font, alpha grows.
  const entering = seen(styled.slideUp);
  const tops = entering.map((box) => box.top);
  const hold = styled.slideUpHold;
  check(
    'slide-up: the text box rises over its entrance window, then holds',
    entering.length >= 5 &&
      nonIncreasing(tops) &&
      (tops[0] ?? 0) - (tops.at(-1) ?? 0) >= FONT_PX / 4 &&
      hold.every((box) => Math.abs(box.top - (hold[0]?.top ?? -1)) <= 1) &&
      Math.abs((hold[0]?.top ?? 0) - (tops.at(-1) ?? 0)) <= 2,
    `entering ${describe(entering)} ‖ hold ${describe(hold)}`,
  );
  check(
    'slide-up: alpha grows through the entrance (green mass rises to the held level)',
    (entering[0]?.mass ?? 0) < 0.8 * (hold[0]?.mass ?? 0) &&
      nonDecreasing(
        entering.map((box) => box.mass),
        0.03 * (hold[0]?.mass ?? 0),
      ),
    `masses ${entering.map((box) => box.mass).join(', ')} → held ${hold[0]?.mass}`,
  );

  // typewriter: glyphs appear left to right from a fixed left edge.
  const typed = seen(styled.typewriter);
  const final = styled.typewriter.at(-1);
  check(
    'typewriter: characters are revealed progressively from a fixed left edge',
    typed.length >= 5 &&
      nonDecreasing(typed.map((box) => box.right)) &&
      nonDecreasing(typed.map((box) => box.count)) &&
      typed.every((box) => Math.abs(box.left - (final?.left ?? -1)) <= 2) &&
      (typed[0]?.count ?? 0) < 0.35 * (final?.count ?? 0) &&
      new Set(typed.map((box) => box.right)).size >= 4,
    describe(styled.typewriter),
  );

  // exit: at rest 0.6 s before the end, then dropping and fading before the clip ends.
  const [rest, ...leaving] = styled.exit;
  const leavingSeen = seen(leaving);
  check(
    'exit (slide-down): runs before the clip end — the box drops and fades',
    Boolean(rest) &&
      leavingSeen.length >= 3 &&
      nonDecreasing(leavingSeen.map((box) => box.top)) &&
      (leavingSeen.at(-1)?.top ?? 0) - (rest?.top ?? 0) >= FONT_PX / 5 &&
      Math.min(...leaving.map((box) => box.mass)) < 0.75 * (rest?.mass ?? 0),
    `rest ${describe(rest ? [rest] : [])} ‖ leaving ${describe(leaving)}`,
  );

  // keyframes: the centre follows x = 0.25 → 0.75 of the width over the clip.
  const expected = [4.8, 5.45, 6.1].map((t) => WIDTH * (0.25 + (0.5 * (t - 4.7)) / 1.5));
  const centers = styled.keyframed.map(center);
  check(
    'keyframes: a text clip with position keyframes moves as keyed',
    centers.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= 8),
    `centres ${centers.map((value) => value.toFixed(1)).join(', ')} vs keyed ${expected.map((value) => value.toFixed(1)).join(', ')}`,
  );

  // crossfade: halfway, the pixel is neither clip but between them on red and blue.
  const { blue, mid, red } = control.crossfade;
  const between = (channel: 0 | 2) =>
    Math.min(blue[channel], red[channel]) + 15 < mid[channel] &&
    mid[channel] < Math.max(blue[channel], red[channel]) - 15;
  check(
    'crossfade: mid-transition pixels blend both clips',
    between(0) && between(2),
    `blue ${blue.join(',')} · mid ${mid.join(',')} · red ${red.join(',')}`,
  );

  // VHS: the same clear band of the red clip, with and without the look.
  let diff = 0;
  for (let index = 0; index < control.clearBand.length; index += 1) {
    diff += Math.abs((control.clearBand[index] ?? 0) - (styled.clearBand[index] ?? 0));
  }
  const meanDiff = diff / Math.max(1, control.clearBand.length);
  check(
    'VHS: the look changes pixels versus the same frame without it',
    meanDiff > 4,
    `mean |ΔRGB| ${meanDiff.toFixed(2)} over the clear band at 5.0 s`,
  );

  check(
    'box: a text with backgroundColor renders its box',
    control.boxYellowPixels > 1_500,
    `${control.boxYellowPixels} box-yellow pixels in the card band`,
  );
  check(
    'shadow: the drop shadow darkens the box around the glyphs',
    styled.boxYellowPixels < control.boxYellowPixels - 150 &&
      styled.boxBandLuma < control.boxBandLuma - 0.5,
    `yellow ${control.boxYellowPixels} → ${styled.boxYellowPixels}; band luma ${control.boxBandLuma.toFixed(2)} → ${styled.boxBandLuma.toFixed(2)}`,
  );
  // The encoder is not bit-exact between runs, so geometry is compared to a pixel.
  const sameBoxes = (left: readonly TextBox[], right: readonly TextBox[]) =>
    left.length === right.length &&
    left.every((box, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        (box.count === 0) === (other.count === 0) &&
        (box.count === 0 ||
          (['left', 'right', 'top', 'bottom'] as const).every(
            (edge) => Math.abs(box[edge] - other[edge]) <= 1,
          ))
      );
    });
  check(
    'determinism: both renders place the text identically, frame for frame',
    sameBoxes(control.slideUp, styled.slideUp) && sameBoxes(control.typewriter, styled.typewriter),
    `slide-up ${describe(control.slideUp.slice(0, 3))} vs ${describe(styled.slideUp.slice(0, 3))}`,
  );

  // Every entrance id: 0.1 s in, the text is visibly mid-motion (moved, sized, partly
  // revealed or faded) against the same text once settled.
  for (const { id, early, settled } of entrances) {
    const moved = (['left', 'right', 'top', 'bottom'] as const).some(
      (edge) => Math.abs(early[edge] - settled[edge]) >= 3,
    );
    check(
      `entrance ${id}: animates in the compositor, then settles`,
      settled.count > 500 && (early.count === 0 || moved || early.mass < 0.85 * settled.mass),
      `0.1 s ${describe([early])} ‖ settled ${describe([settled])}`,
    );
  }

  // Masters to GCS, never the Library.
  const run = `render-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const scratch = mkdtempSync(join(tmpdir(), 'video-editor-motion-render-'));
  try {
    for (const rendered of [control, styled]) {
      writeFileSync(
        join(scratch, `${rendered.variant}.mp4`),
        Buffer.from(rendered.mp4Base64, 'base64'),
      );
    }
    writeFileSync(
      join(scratch, 'summary.json'),
      JSON.stringify(
        {
          lines,
          notExercised: [
            'server export via Render /v1/timeline — the Render image bundles timeline-editor.js and needs an owner rebuild',
          ],
        },
        null,
        2,
      ),
    );
    let stored = true;
    try {
      execFileSync(
        'gcloud',
        ['storage', 'cp', '--quiet', join(scratch, '*'), `${GCS_PREFIX}/${run}/`],
        {
          stdio: 'pipe',
        },
      );
    } catch (error) {
      stored = false;
      lines.push(`FAIL  outputs stored in GCS — ${String(error).slice(0, 300)}`);
    }
    check('outputs: masters and summary stored in GCS', stored, `${GCS_PREFIX}/${run}/`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  lines.push(
    'NOT EXERCISED  server export of the new animations — Render /v1/timeline serves the compositor bundled into the Render image, which the owner must rebuild',
  );
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  const failed = lines.filter((line) => line.startsWith('FAIL')).length;
  console.log(
    [
      ...lines,
      `videoeditor:motion:render:bench — ${passed} passed, ${failed} failed, 1 not exercised`,
    ].join('\n'),
  );
});
