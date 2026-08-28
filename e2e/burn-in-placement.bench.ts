#!/usr/bin/env bun
/**
 * burnin:placement:bench — proves that DRAGGING the burn-in's type block moves the BURNED
 * PIXELS, and that a release near an anchor lands exactly on it.
 *
 * The failure this exists to catch is the one a state test cannot see. `image.text`'s config
 * grew an anchor and a fractional offset; a test that asserts the panel wrote `offsetY: 0.45`
 * proves a number reached a Zustand store. It says nothing about whether the schema carries
 * it, whether `readSettings` reads it, whether `placementOptionsFor` translates it, or whether
 * `planPlacement` honours it. Any one of those breaking ships a config with a knob that does
 * nothing — which is exactly the shape of the junk this whole change replaced.
 *
 * So every assertion is taken from INK PIXELS in a decoded PNG:
 *
 *   • a drag moves the ink's bounding box by the fraction the offset asked for;
 *   • its NEGATIVE CONTROL — the same comparison against a render where the offset is not
 *     applied — produces two identical boxes, so the drag assertion is load-bearing rather
 *     than a tautology that passes whatever the runner does;
 *   • a release inside the snap radius stores the anchor with a ZERO offset, and the ink lands
 *     on that anchor's own box;
 *   • one config on a 1080x1350 and a 1080x1920 frame puts the ink in the same PROPORTIONAL
 *     place, which is the whole reason the offset is a fraction;
 *   • a block hand-placed over a dark patch still escalates the BACKGROUND and clears the
 *     contrast bar — measured on the render, with the glyphs excluded — while the SAME photo
 *     with the block placed elsewhere does not escalate at all.
 *
 * Real Chrome, because `OffscreenCanvas`, `createImageBitmap` and SVG rasterisation are the
 * code under test. The photos are generated deterministically; see the entry.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type {
  BurnInPlacementBenchRun,
  InkBox,
  PlacedCase,
} from './support/burnInPlacementBenchEntry';

type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const GLYPH: Record<Grade, string> = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' };
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

const record = (step: string, grade: Grade, detail?: string) => {
  results.push({ step, grade, detail });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
};
const check = (step: string, ok: boolean, detail?: string) =>
  record(step, ok ? 'PASS' : 'FAIL', detail);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

function finish(): never {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.grade.toLowerCase() as keyof typeof counts] += 1;
  const exitCode = counts.fail > 0 ? 1 : 0;
  const durationMs = Date.now() - startedMs;
  if (process.env.BENCH_JSON === '1') {
    console.log(
      JSON.stringify({
        bench: 'burnin:placement:bench',
        startedAt,
        durationMs,
        results,
        notes,
        counts,
        exitCode,
      }),
    );
  } else {
    const skipped = results.filter((r) => r.grade === 'SKIP');
    if (skipped.length > 0) {
      console.log(`\nNOT COVERED by this run (${skipped.length}):`);
      for (const r of skipped) console.log(`  – ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log(
      `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — burnin:placement:bench: ${counts.pass} pass, ` +
        `${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
    );
  }
  process.exit(exitCode);
}

function buildBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'burn-in-placement-bench-'));
  const outfile = join(dir, 'entry.js');
  try {
    execFileSync(
      'bun',
      [
        'build',
        'e2e/support/burnInPlacementBenchEntry.ts',
        '--target=browser',
        '--outfile',
        outfile,
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    return readFileSync(outfile, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const f = (value: number) => value.toFixed(4);
const box = (ink: InkBox) => `[${f(ink.x0)}…${f(ink.x1)}] x [${f(ink.y0)}…${f(ink.y1)}]`;
const identical = (a: InkBox, b: InkBox, tolerance: number) =>
  Math.abs(a.x0 - b.x0) <= tolerance &&
  Math.abs(a.x1 - b.x1) <= tolerance &&
  Math.abs(a.y0 - b.y0) <= tolerance &&
  Math.abs(a.y1 - b.y1) <= tolerance;

/** Every case has to have actually drawn something; an empty ink box makes any comparison of
 *  two empty boxes pass. Asserted before anything is compared. */
function assertInkPresent(cases: PlacedCase[]): boolean {
  let ok = true;
  for (const c of cases) {
    if (c.ink.pixels < 2000) ok = false;
  }
  check(
    'every case actually burned type into its frame',
    ok,
    cases.map((c) => `${c.label}=${c.ink.pixels}px`).join(', '),
  );
  return ok;
}

async function main(): Promise<void> {
  let bundle: string;
  try {
    bundle = buildBundle();
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    record('bundle the real op for the browser', 'FAIL', stderr.slice(-600));
    finish();
  }
  record('bundle the real op for the browser', 'PASS', `${(bundle.length / 1024).toFixed(0)} KB`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  let run: BurnInPlacementBenchRun;
  try {
    await page.route('**/burn-in-placement-bench', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await page.goto('http://127.0.0.1:4173/burn-in-placement-bench', {
      waitUntil: 'domcontentloaded',
    });
    await page.addScriptTag({ content: bundle, type: 'module' });
    await page.waitForFunction(() => Boolean(window.__burnInPlacementBench), null, {
      timeout: 30_000,
    });
    run = (await page.evaluate(() =>
      window.__burnInPlacementBench.run(),
    )) as BurnInPlacementBenchRun;
  } catch (error) {
    record(
      'drive image.text in real Chrome',
      'FAIL',
      `${error}${consoleErrors.length ? ` | ${consoleErrors.join(' | ')}` : ''}`,
    );
    await browser.close();
    finish();
  }
  await browser.close();

  const { before, after, brokenOffset } = run.drag;
  record(
    'drive image.text in real Chrome',
    'PASS',
    `ink #${run.ink.map((b) => b.toString(16).padStart(2, '0')).join('')}, ` +
      `snap radius ${run.snapRadius}`,
  );
  assertInkPresent([
    before,
    after,
    brokenOffset,
    run.snap.rendered,
    run.proportional.short,
    run.proportional.tall,
    run.shadow.onIt,
    run.shadow.awayFromIt,
  ]);

  // ── The drag ────────────────────────────────────────────────────────────────────────────
  const dx = after.ink.x1 - before.ink.x1;
  const dy = after.ink.y0 - before.ink.y0;
  check(
    'dragging the block moves the BURNED INK, by the fraction the offset asked for',
    dx <= -0.25 && dy >= 0.4,
    `offset (${after.config.offsetX}, ${after.config.offsetY}) moved the ink ` +
      `(${f(dx)}, ${f(dy)}) of the frame — ${box(before.ink)} → ${box(after.ink)}`,
  );

  // The control. If this ever FAILS — if the un-offset render lands somewhere else — then the
  // assertion above is passing for a reason other than the offset, and it is not evidence.
  check(
    'NEGATIVE CONTROL: with the offset not applied, the drag assertion has nothing to see',
    identical(brokenOffset.ink, before.ink, 0.002),
    `a build that ignores offsetX/offsetY renders ${box(brokenOffset.ink)}, which is the ` +
      `ANCHORED frame ${box(before.ink)} — so the check above would compare two identical ` +
      'boxes and fail, which is what makes it load-bearing',
  );

  // ── The snap ────────────────────────────────────────────────────────────────────────────
  const { stored, anchorBox, rendered, released } = run.snap;
  check(
    'a release inside the snap radius stores the anchor with a CLEARED offset',
    stored.snapped &&
      stored.anchor === 'bottom-left' &&
      stored.offsetX === 0 &&
      stored.offsetY === 0,
    `released at (${f(released.x)}, ${f(released.y)}) → ${stored.anchor} ` +
      `+(${stored.offsetX}, ${stored.offsetY})`,
  );
  check(
    'and the ink lands ON that anchor, not near it',
    Math.abs(rendered.ink.x1 - anchorBox.x1) <= 0.01 &&
      rendered.ink.y0 >= anchorBox.y0 - 0.01 &&
      rendered.ink.y1 <= anchorBox.y1 + 0.02,
    `ink ${box(rendered.ink)} against the bottom-left anchor box ` +
      `[${f(anchorBox.x0)}…${f(anchorBox.x1)}] x [${f(anchorBox.y0)}…${f(anchorBox.y1)}]`,
  );

  // ── Two frame sizes, one config ─────────────────────────────────────────────────────────
  const { short, tall } = run.proportional;
  check(
    'the same config puts the type in the same PROPORTIONAL place on two frame sizes',
    Math.abs(short.ink.x1 - tall.ink.x1) <= 0.005 &&
      Math.abs(short.ink.y0 - tall.ink.y0) <= 0.015 &&
      short.planLines === tall.planLines,
    `right edge ${f(short.ink.x1)} vs ${f(tall.ink.x1)}, top ${f(short.ink.y0)} vs ` +
      `${f(tall.ink.y0)}, ${short.planLines} lines both — ` +
      `${short.frame.width}x${short.frame.height} and ${tall.frame.width}x${tall.frame.height}`,
  );
  note(
    'the top fractions are close rather than equal by construction: the block is anchored at a ' +
      "fraction of the HEIGHT, and the first line's glyph height is a fraction of the WIDTH, so " +
      'the same pixels are a smaller fraction of the taller frame. The right edge, which is pure ' +
      'width arithmetic, matches to four decimals.',
  );

  // ── Contrast outranks placement ─────────────────────────────────────────────────────────
  const { onIt, awayFromIt } = run.shadow;
  check(
    'a hand-placed block over a dark patch ESCALATES rather than shipping unreadable',
    onIt.rung > 0 && onIt.measured.ratio >= run.minContrast,
    `rung ${onIt.rung} (${onIt.treatment}), measured ${onIt.measured.ratio.toFixed(2)}:1 behind ` +
      `the type over ${onIt.measured.sampled} background px against a ${run.minContrast} bar`,
  );
  check(
    'and the ladder read the box the PLACEMENT moved — the same photo, block elsewhere, no escalation',
    awayFromIt.rung === 0 && awayFromIt.treatment === 'direct',
    `same shadowed photo at top-right: rung ${awayFromIt.rung} (${awayFromIt.treatment}), ` +
      `${awayFromIt.measured.ratio.toFixed(2)}:1 — versus rung ${onIt.rung} at bottom-left`,
  );
  check(
    'escalating never moved the type: the plan ships the box the placement asked for',
    Math.abs(onIt.planBox.x0 - onIt.askedBox.x0) <= 1e-9 &&
      Math.abs(onIt.planBox.y0 - onIt.askedBox.y0) <= 1e-9 &&
      Math.abs(onIt.planBox.x1 - onIt.askedBox.x1) <= 1e-9 &&
      Math.abs(onIt.planBox.y1 - onIt.askedBox.y1) <= 1e-9,
    `asked [${f(onIt.askedBox.x0)}…${f(onIt.askedBox.x1)}] x ` +
      `[${f(onIt.askedBox.y0)}…${f(onIt.askedBox.y1)}], planned the same`,
  );

  note(
    `with the glyphs' anti-aliased halo left IN the background sample the same box reads ` +
      `${onIt.measured.ratioWithoutHalo.toFixed(2)}:1 — that number measures the type's own ` +
      'edges and is reported, not asserted. The planner probes the treated photo before any ' +
      'glyph exists, so the halo-excluded reading is the same question it answered.',
  );

  record(
    'the panel drag itself is exercised in Chrome',
    'SKIP',
    'the pointer maths lives in BurnInConfig.test.tsx (jsdom, 12 tests) — this bench drives the ' +
      'CONFIG the panel writes through the real op, so the one hop from a real pointer event to ' +
      'that config is covered by the component test rather than by this run',
  );

  finish();
}

await main();
