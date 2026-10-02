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
import { createBenchRecorder } from './support/benchRecorder';
import type {
  EntranceSample,
  MotionRenderRun,
  ServerCompareInput,
  ServerCompareRun,
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
  const rec = createBenchRecorder('videoeditor:motion:render:bench', []);
  const bundle = buildBrowserBundle();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/fonts/*', (route) =>
    route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(
        join(
          process.cwd(),
          'public',
          'fonts',
          new URL(route.request().url()).pathname.split('/').pop() ?? '',
        ),
      ),
    }),
  );
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
  const highlights = await page.evaluate(() => window.__motionRenderBench.highlights());
  const looks = await page.evaluate(() => window.__motionRenderBench.looks());
  await context.close();

  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    rec.record(name, ok ? 'PASS' : 'FAIL', detail);
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
    expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };
  check(
    'all seven filters and nine effects change the composed image pixels',
    looks.length === 16 && looks.every((look) => look.difference > 0.1),
    JSON.stringify(looks),
  );
  check(
    'all seven named filters are neutral at zero intensity',
    looks.filter((look) => look.zeroDifference !== null).length === 7 &&
      looks.every((look) => look.zeroDifference === null || look.zeroDifference === 0),
    JSON.stringify(looks.map(({ id, zeroDifference }) => ({ id, zeroDifference }))),
  );
  const key = looks.find((look) => look.id === 'chroma_key');
  check(
    'chroma key removes green while keeping the red subject',
    Boolean(
      key && key.corner[1] < 70 && key.corner[2] > 90 && key.centre[0] > 100 && key.centre[1] < 70,
    ),
    JSON.stringify(key),
  );
  rec.notes.push(
    `speed samples: ${JSON.stringify({ looks_render: looks.filter((look) => ['vhs', 'pixelate', 'chroma_key'].includes(look.id)).map((look) => look.durationMs), motion_snapshot: [...control.snapshots, ...styled.snapshots].map((frame) => frame.durationMs) })}`,
  );

  check(
    'persisted caption highlight colour renders for word and karaoke, and none disables it',
    highlights.every(
      (sample) =>
        sample.yellow === 0 &&
        (sample.highlightMode === 'none' ? sample.branded === 0 : sample.branded > 100),
    ),
    JSON.stringify(highlights),
  );

  check(
    'composed snapshots match exported frames through text, transition and VHS',
    [...control.snapshots, ...styled.snapshots].every(
      (frame) => frame.meanRgbError <= 6 && frame.durationMs <= 10_000,
    ),
    JSON.stringify({ control: control.snapshots, styled: styled.snapshots }),
  );

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
  rec.record(
    'server export parity',
    'SKIP',
    'Run the server-export comparison separately; this run renders in the browser.',
  );
  rec.print();
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  const failed = lines.filter((line) => line.startsWith('FAIL')).length;
  console.log(
    [
      ...lines,
      `videoeditor:motion:render:bench — ${passed} passed, ${failed} failed, 1 not exercised`,
    ].join('\n'),
  );
});

// ── Server export vs the client render ─────────────────────────────────────────────────
//
// Driven by `video-editor:motion:e2e:bench -- --server-export=<render url>`: the Backend
// bench builds a motion timeline with the real ops, has Render export it, and hands this
// test a manifest (the project, its source files, the server master). The same project is
// rendered here from the same files, and both masters are judged per frame.
//
// The motion judges compare each frame's box against its own settled box, alpha as green
// mass over the settled mass, the share of a typed line revealed, and the keyed centre. The
// font judge holds each settled line to the width the loaded face gives it — pixel coverage
// cannot match across operating systems (edge antialiasing, encoder chroma), widths can.

type CompareManifest = {
  project: unknown;
  files: Record<string, string>;
  sources: Record<string, { file: string; assetId: string; versionId: string }>;
  serverFile: string;
  samples: ServerCompareInput['samples'];
  resultPath: string;
  clientMp4Path: string;
};

const COMPARE = process.env.MOTION_SERVER_COMPARE;

test('server export matches the client render, frame for frame', async ({ browser }) => {
  test.skip(!COMPARE, 'run by video-editor:motion:e2e:bench -- --server-export=<render url>');
  const manifest = JSON.parse(readFileSync(COMPARE ?? '', 'utf8')) as CompareManifest;
  const bundle = buildBrowserBundle();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/video-editor-motion-compare', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  // The export loads the faces its text names from /fonts, as Render serves them.
  await page.route('**/fonts/*', (route) =>
    route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(
        join(
          process.cwd(),
          'public',
          'fonts',
          new URL(route.request().url()).pathname.split('/').pop() ?? '',
        ),
      ),
    }),
  );
  await page.route('**/motion-compare-files/*', (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const path = manifest.files[name];
    return path
      ? route.fulfill({ contentType: 'video/mp4', body: readFileSync(path) })
      : route.fulfill({ status: 404, body: name });
  });
  await page.goto('http://127.0.0.1:4173/video-editor-motion-compare', {
    waitUntil: 'domcontentloaded',
  });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__motionRenderBench));
  const fileUrl = (name: string) =>
    `http://127.0.0.1:4173/motion-compare-files/${encodeURIComponent(name)}`;
  const input: ServerCompareInput = {
    project: manifest.project,
    sources: Object.fromEntries(
      Object.entries(manifest.sources).map(([clipId, source]) => [
        clipId,
        { url: fileUrl(source.file), assetId: source.assetId, versionId: source.versionId },
      ]),
    ),
    serverUrl: fileUrl(manifest.serverFile),
    samples: manifest.samples,
  };
  const run = (await page.evaluate(
    (payload) => window.__motionRenderBench.compare(payload),
    input,
  )) as ServerCompareRun;
  await context.close();
  writeFileSync(manifest.clientMp4Path, Buffer.from(run.clientMp4Base64, 'base64'));

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };
  const seenBox = (box: TextBox) => box.count >= 40;
  const ratio = (value: number, of: number) => (of > 0 ? value / of : 0);

  check(
    'server master: the project size and length',
    run.serverSize.width === 360 &&
      run.serverSize.height === 640 &&
      Math.abs(run.serverSize.durationSec - 7) <= 0.1,
    `${run.serverSize.width}×${run.serverSize.height} ${run.serverSize.durationSec.toFixed(3)}s`,
  );

  for (const [index, client] of run.client.texts.entries()) {
    const server = run.server.texts[index];
    if (!server) continue;
    const pairs = client.frames
      .map((frame, at) => [frame, server.frames[at]] as const)
      .filter(
        (pair): pair is readonly [TextBox, TextBox] =>
          pair[1] !== undefined && seenBox(pair[0]) && seenBox(pair[1]),
      );
    const visibility = client.frames.filter(seenBox).length - server.frames.filter(seenBox).length;
    if (client.name === 'typewriter') {
      const revealed = (frame: TextBox, settled: TextBox) =>
        ratio(frame.right - settled.left, settled.right - settled.left);
      const worst = Math.max(
        0,
        ...pairs.map(([c, s]) =>
          Math.abs(revealed(c, client.settled) - revealed(s, server.settled)),
        ),
      );
      const leftDrift = Math.max(
        0,
        ...pairs.map(([c, s]) =>
          Math.abs(c.left - client.settled.left - (s.left - server.settled.left)),
        ),
      );
      check(
        "typewriter: the server reveals the line at the client's pace",
        pairs.length >= 4 && Math.abs(visibility) <= 1 && worst <= 0.12 && leftDrift <= 2,
        `${pairs.length} frames · worst reveal gap ${worst.toFixed(3)} of the line · left drift ${leftDrift}px · client ${describe([client.settled])} vs server ${describe([server.settled])}`,
      );
      continue;
    }
    const motionGap = Math.max(
      0,
      ...pairs.flatMap(([c, s]) =>
        (['top', 'bottom'] as const).map((edge) =>
          Math.abs(c[edge] - client.settled[edge] - (s[edge] - server.settled[edge])),
        ),
      ),
    );
    const scaleGap = Math.max(
      0,
      ...pairs.map(([c, s]) =>
        Math.abs(
          ratio(c.right - c.left, client.settled.right - client.settled.left) -
            ratio(s.right - s.left, server.settled.right - server.settled.left),
        ),
      ),
    );
    const alphaGap = Math.max(
      0,
      ...pairs.map(([c, s]) =>
        Math.abs(ratio(c.mass, client.settled.mass) - ratio(s.mass, server.settled.mass)),
      ),
    );
    check(
      `${client.name}: the server's entrance follows the client's — box motion, scale and alpha per frame`,
      pairs.length >= 4 &&
        Math.abs(visibility) <= 1 &&
        motionGap <= 3 &&
        scaleGap <= 0.06 &&
        alphaGap <= 0.12,
      `${pairs.length} frames · worst Δbox ${motionGap}px · worst scale gap ${scaleGap.toFixed(3)} · worst alpha gap ${alphaGap.toFixed(3)} · settled client ${describe([client.settled])} vs server ${describe([server.settled])}`,
    );
  }

  // Which face drew the text: a settled line's width is the face's advance widths, which no
  // rasteriser or encoder moves (their edge pixels differ across OSes; widths do not). Each
  // line is held to the width the real draw path gives in the loaded face, and the judge
  // only counts where the fallback stack would draw it measurably wider or narrower.
  const width = (box: TextBox) => box.right - box.left;
  const faces = run.faces.map((probe) => {
    const index = run.client.texts.findIndex((text) => text.name === probe.name);
    const server = run.server.texts[index]?.settled;
    const client = run.client.texts[index]?.settled;
    const tolerance = Math.max(2, 0.01 * width(probe.face));
    return {
      name: probe.name,
      face: width(probe.face),
      fallback: width(probe.fallback),
      server: server ? width(server) : -1,
      client: client ? width(client) : -1,
      tolerance,
      discriminates: Math.abs(width(probe.fallback) - width(probe.face)) > 2 * tolerance,
    };
  });
  const judged = faces.filter((entry) => entry.discriminates);
  check(
    'fonts: the server draws each text in the face the export loaded — line widths within 1% of that face, not the fallback',
    judged.length >= 1 &&
      faces.every(
        (entry) =>
          Math.abs(entry.server - entry.face) <= entry.tolerance &&
          Math.abs(entry.client - entry.face) <= entry.tolerance,
      ),
    faces
      .map(
        (entry) =>
          `${entry.name}: face ${entry.face}px · fallback ${entry.fallback}px${entry.discriminates ? '' : ' (indistinct)'} · client ${entry.client}px · server ${entry.server}px`,
      )
      .join(' · '),
  );

  const keyedGap = run.client.keyed.map((box, index) => {
    const server = run.server.keyed[index];
    return server ? Math.abs(center(box) - center(server)) : Number.POSITIVE_INFINITY;
  });
  check(
    'keyframes: the server moves the keyed text to the same centre as the client',
    keyedGap.every((gap) => gap <= 4),
    `centres client ${run.client.keyed.map(center).join(', ')} · server ${run.server.keyed.map(center).join(', ')}`,
  );
  const blendGap = Math.max(
    ...run.client.crossfade.map((channel, index) =>
      Math.abs(channel - (run.server.crossfade[index] ?? 0)),
    ),
  );
  check(
    'crossfade: the server blends the two clips as the client does, mid-transition',
    blendGap <= 12,
    `client ${run.client.crossfade.join(',')} · server ${run.server.crossfade.join(',')}`,
  );
  const lookGap = Math.max(
    ...run.client.look.mean.map((channel, index) =>
      Math.abs(channel - (run.server.look.mean[index] ?? 0)),
    ),
  );
  check(
    "look: the server master carries clip 2's look as the client does (band colour and spread)",
    lookGap <= 8 &&
      Math.abs(run.client.look.spread - run.server.look.spread) <=
        Math.max(2, run.client.look.spread),
    `band mean client ${run.client.look.mean.join(',')} · server ${run.server.look.mean.join(',')} · spread ${run.client.look.spread.toFixed(2)} vs ${run.server.look.spread.toFixed(2)}`,
  );
  writeFileSync(manifest.resultPath, JSON.stringify({ checks }, null, 2));
  console.log(
    checks
      .map((entry) => `${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name} — ${entry.detail}`)
      .join('\n'),
  );
});
