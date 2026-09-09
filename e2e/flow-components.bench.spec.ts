import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileStoryboardWorkflow } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import type { FlowComponentsBenchRun } from './support/flowComponentsBenchEntry';

test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 240_000 });

const artifactDir = resolve(process.cwd(), '../artifacts/flow-canvas-bench');

function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `flow-components-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/flowComponentsBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

const storyboard = compileStoryboardWorkflow({
  recipe: 'storyboard',
  objective: 'Introduce Flow-style creation inside Continuum Canvas.',
  script:
    'A blank Canvas becomes a storyboard. Animated type establishes the idea. Curated effects finish the sequence.',
  aspectRatio: '16:9',
  references: [
    { nodeId: 'reference-character', role: 'character' },
    { nodeId: 'reference-product', role: 'product' },
    { nodeId: 'reference-style', role: 'style' },
  ],
  shots: [
    {
      id: 'shot-01',
      title: 'The blank canvas',
      frameDirection: 'Wide shot of the creator facing an empty modular canvas.',
      visualDirection: 'The camera slowly pushes toward the first frame card.',
      spokenLine: 'Every story begins with a frame.',
      cameraMove: 'Slow push in.',
      durationSeconds: 4,
      continuity: 'cut',
      referenceNodeIds: ['reference-character', 'reference-style'],
    },
    {
      id: 'shot-02',
      title: 'Type finds motion',
      frameDirection: 'Product close-up with a bold animated title above it.',
      visualDirection: 'The title pops in as the product rotates into key light.',
      spokenLine: 'Then type gives it a voice.',
      cameraMove: 'Clockwise product orbit.',
      durationSeconds: 6,
      continuity: 'match',
      referenceNodeIds: ['reference-product', 'reference-style'],
    },
    {
      id: 'shot-03',
      title: 'The finished sequence',
      frameDirection: 'The approved shots assemble into a finished timeline.',
      visualDirection: 'Film grain and chromatic separation settle over the final frame.',
      spokenLine: 'And the Canvas carries it through production.',
      cameraMove: 'Locked hero frame.',
      durationSeconds: 4,
      continuity: 'cut',
      referenceNodeIds: ['reference-character', 'reference-product', 'reference-style'],
    },
  ],
});

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function storyboardHtml(): string {
  const seed = storyboard.nodes[0]?.data?.productionSeed;
  if (!seed) throw new Error('Compiled storyboard has no production seed');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#0b0d12;color:#f5f5f2;font-family:Inter,Arial,sans-serif}
    main{width:1280px;min-height:800px;padding:54px}.eyebrow{color:#9ca3af;letter-spacing:.18em;font-size:14px}
    h1{font-size:48px;margin:10px 0 8px}.script{color:#cbd5e1;max-width:920px;font-size:18px;line-height:1.5}
    .refs{display:flex;gap:10px;margin:24px 0 34px}.ref{border:1px solid #374151;border-radius:999px;padding:8px 14px;color:#d1d5db}
    .shots{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.shot{border:1px solid #303540;border-radius:18px;overflow:hidden;background:#141821}
    .frame{height:180px;padding:22px;background:linear-gradient(135deg,#1d4ed8,#7c3aed 55%,#f97316);display:flex;align-items:flex-end}
    .number{font-size:66px;font-weight:900;opacity:.35}.body{padding:22px}.body h2{font-size:24px;margin:0 0 12px}.body p{color:#cbd5e1;line-height:1.45;min-height:62px}
    blockquote{margin:16px 0 0;border-left:3px solid #f97316;padding-left:12px;color:#fff}.meta{margin-top:18px;color:#9ca3af;font-size:13px}
  </style></head><body><main><div class="eyebrow">CONTINUUM CANVAS / STORYBOARD BENCHMARK</div>
  <h1>${escapeHtml(String(seed.objective))}</h1><div class="script">${escapeHtml(String(seed.sourceScript))}</div>
  <div class="refs">${seed.references.map((reference) => `<div class="ref">${escapeHtml(reference.role)} · ${escapeHtml(reference.nodeId)}</div>`).join('')}</div>
  <div class="shots">${seed.shots
    .map(
      (
        shot,
        index,
      ) => `<article class="shot"><div class="frame"><div class="number">0${index + 1}</div></div><div class="body">
      <h2>${escapeHtml(shot.title)}</h2><p>${escapeHtml(shot.brief)}</p><blockquote>${escapeHtml(shot.spokenLine ?? 'No dialogue')}</blockquote>
      <div class="meta">${escapeHtml(shot.cameraMove)} · ${shot.targetDurationSec}s · ${escapeHtml(shot.continuity)}</div></div></article>`,
    )
    .join('')}</div></main></body></html>`;
}

test('produces animated-type, curated-effect, and storyboard benchmark examples', async ({
  browser,
}) => {
  mkdirSync(artifactDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route('**/flow-components-bench', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  await page.goto('http://127.0.0.1:4173/flow-components-bench', {
    waitUntil: 'domcontentloaded',
  });
  await page.addScriptTag({ content: buildBrowserBundle(), type: 'module' });
  await page.waitForFunction(() => Boolean(window.__flowComponentsBench));
  const run = (await page.evaluate(() =>
    window.__flowComponentsBench.run(),
  )) as FlowComponentsBenchRun;

  const mp4Bytes = Buffer.from(run.mp4Base64, 'base64');
  if (mp4Bytes.byteLength !== run.bytes) {
    throw new Error(
      `MP4 transfer mismatch: ${mp4Bytes.byteLength}/${run.bytes} bytes; base64 ${typeof run.mp4Base64} ${run.mp4Base64.length} chars, head ${JSON.stringify(run.mp4Base64.slice(0, 32))}`,
    );
  }
  expect(mp4Bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  writeFileSync(join(artifactDir, 'animated-type-and-effects.mp4'), mp4Bytes);
  for (const frame of run.frames) {
    writeFileSync(join(artifactDir, `${frame.id}.png`), Buffer.from(frame.pngBase64, 'base64'));
  }
  const html = storyboardHtml();
  writeFileSync(join(artifactDir, 'storyboard-example.html'), html);
  writeFileSync(join(artifactDir, 'storyboard-example.json'), JSON.stringify(storyboard, null, 2));
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: join(artifactDir, 'storyboard-example.png'), fullPage: true });
  writeFileSync(
    join(artifactDir, 'benchmark-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        video: {
          bytes: run.bytes,
          durationSec: run.durationSec,
          width: run.width,
          height: run.height,
          animations: run.animations,
          frames: run.frames.map(({ id, lowerFrameDifference }) => ({
            id,
            lowerFrameDifference,
          })),
          plan: run.plan,
        },
        storyboard: {
          nodeCount: storyboard.nodes.length,
          connectionCount: storyboard.connections.length,
          shotCount: storyboard.shots.length,
          timelineRef: storyboard.timelineRef,
        },
      },
      null,
      2,
    ),
  );

  expect(run.bytes).toBeGreaterThan(50_000);
  expect(run.width).toBe(480);
  expect(run.height).toBe(270);
  expect(Math.abs(run.durationSec - 12)).toBeLessThanOrEqual(0.1);
  expect(run.plan).toHaveLength(6);
  for (const animation of run.animations) {
    expect(animation.midInk).toBeGreaterThan(animation.earlyInk);
    expect(animation.midInk).toBeGreaterThan(animation.exitInk);
  }
  for (const frame of run.frames.slice(1)) {
    expect(frame.lowerFrameDifference).toBeGreaterThan(1);
  }
  expect(run.plan[1]?.effects).toMatchObject({ vignette: { amount: 0.85 } });
  expect(run.plan[2]?.effects).toMatchObject({ filmGrain: { amount: 0.8 } });
  expect(run.plan[3]?.effects).toMatchObject({ pixelate: { blockPx: 18 } });
  expect(run.plan[4]?.effects).toMatchObject({ chromaticAberration: { amount: 1 } });
  expect(run.plan[5]?.effects).toMatchObject({ vhs: { amount: 0.9 } });
  expect(storyboard.nodes).toHaveLength(1);
  expect(storyboard.nodes[0]?.type).toBe('timelineEditor');
  expect(storyboard.shots).toHaveLength(3);
  expect(storyboard.connections).toHaveLength(3);
  await context.close();
});
