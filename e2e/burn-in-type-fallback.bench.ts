#!/usr/bin/env bun
/**
 * burnin:type:bench — proves Burn In Text RESOLVES a typeface instead of refusing, that every
 * rung of the chain burns real pixels, and that the rung it used is NAMED.
 *
 * The bug this exists to catch shipped for weeks: `setImageText` threw the moment
 * `args.designSystem` was null, so a brand whose typefaces live in its brand book — which is
 * most of them — got a wall reading "pick a brand with one before running Set Type". Two
 * failures in one line: the refusal was scoped to the whole node when only the INK needed to be
 * strict, and the message named an op that had already been renamed.
 *
 * A state test cannot see any of this. Asserting that `resolveBrandType` returns
 * `source: 'brand-md'` proves a pure function returns a string; it says nothing about whether
 * the op still throws first, whether the dispatcher carries the brand shapes, or whether a
 * fallback face draws anything at all. So every assertion here is taken from INK PIXELS in a
 * decoded PNG produced by the real dispatcher in real Chrome:
 *
 *   • each of the five rungs — design system, brand.md, brand kit, scrape, and NONE — burns
 *     readable type and reports the source it actually read;
 *   • the fallback rung is a FACE, not a label: the SVG carries the inlined woff2 and its ink
 *     box differs from the same headline drawn through the bare fallback stack;
 *   • its NEGATIVE CONTROL — the same five cases re-graded against a resolver that always
 *     claims `design-system` — fails, so the source assertions are load-bearing rather than
 *     tautologies that pass whatever the runner does;
 *   • the old refusal is gone: a brand with type and no design system produces an image;
 *   • ink is still strict, and its refusal names the ink rather than the design system.
 *
 * Real Chrome, because `OffscreenCanvas`, `FontFace`, SVG rasterisation and woff2 parsing are
 * the code under test. `/fonts/*.woff2` is served off disk exactly as `public/` serves it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type {
  BurnInTypeBenchRun,
  DerivedInkCase,
  InkBox,
  RungCase,
} from './support/burnInTypeFallbackBenchEntry';

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
        bench: 'burnin:type:bench',
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
      `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — burnin:type:bench: ${counts.pass} pass, ` +
        `${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
    );
  }
  process.exit(exitCode);
}

function buildBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'burn-in-type-bench-'));
  const outfile = join(dir, 'entry.js');
  try {
    execFileSync(
      'bun',
      [
        'build',
        'e2e/support/burnInTypeFallbackBenchEntry.ts',
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

/** Enough ink to be a headline someone could read, not one stray anti-aliased pixel. */
const MIN_INK_PIXELS = 2000;

const sourcesMatch = (rungs: RungCase[], claimed: readonly string[]): number =>
  rungs.filter((rung, index) => rung.expectedSource === claimed[index]).length;

async function main(): Promise<void> {
  let bundle: string;
  try {
    bundle = buildBundle();
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    record('bundle the real op for the browser', 'FAIL', stderr.slice(-800));
    finish();
  }
  record('bundle the real op for the browser', 'PASS', `${(bundle.length / 1024).toFixed(0)} KB`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  let run: BurnInTypeBenchRun;
  try {
    await page.route('**/burn-in-type-bench', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    // The preloaded faces, served off disk exactly as `public/` serves them in the app. Without
    // this the fallback rung would silently draw Helvetica and the whole last rung would be a
    // claim rather than a render.
    await page.route('**/fonts/*.woff2', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      try {
        return route.fulfill({
          contentType: 'font/woff2',
          body: readFileSync(join(process.cwd(), 'public', 'fonts', name)),
        });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    await page.goto('http://127.0.0.1:4173/burn-in-type-bench', {
      waitUntil: 'domcontentloaded',
    });
    await page.addScriptTag({ content: bundle, type: 'module' });
    await page.waitForFunction(() => Boolean(window.__burnInTypeBench), null, { timeout: 30_000 });
    run = (await page.evaluate(() => window.__burnInTypeBench.run())) as BurnInTypeBenchRun;
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

  record(
    'drive image.text in real Chrome',
    'PASS',
    `ink #${run.ink.map((b) => b.toString(16).padStart(2, '0')).join('')}, ` +
      `preloaded ${run.preloaded.display}/${run.preloaded.body}`,
  );

  // ── Every rung renders ──────────────────────────────────────────────────────────────────
  const empty = run.rungs.filter((rung) => rung.ink.pixels < MIN_INK_PIXELS);
  check(
    'every rung of the chain burned readable type into its frame',
    empty.length === 0,
    run.rungs.map((rung) => `${rung.expectedSource}=${rung.ink.pixels}px`).join(', '),
  );

  // ── Every rung is labelled, with the source it actually read ────────────────────────────
  for (const rung of run.rungs) {
    check(
      `"${rung.label}" resolves through ${rung.expectedSource} and says so`,
      rung.source === rung.expectedSource && rung.family === rung.expectedFamily,
      `reported "${rung.note}" (source ${rung.source}, family ${rung.family}); ` +
        `ink ${box(rung.ink)} from ${rung.inkSource ?? 'nowhere'}`,
    );
  }

  // The control. A source check that a constant satisfies proves nothing; this shows the five
  // assertions above fail when the resolver stops reading the brand and just names a rung.
  const stubbedAgreements = sourcesMatch(run.rungs, run.stubbedSources);
  check(
    'NEGATIVE CONTROL: a resolver that always claims `design-system` fails those assertions',
    stubbedAgreements < run.rungs.length,
    `a build that hard-codes the source satisfies ${stubbedAgreements} of ${run.rungs.length} ` +
      `cases (${run.rungs.map((r) => r.expectedSource).join(', ')}) — so the checks above are ` +
      'reading the brand, not restating a constant',
  );

  // ── The fallback rung is a FACE ─────────────────────────────────────────────────────────
  const face = run.fallbackFace;
  check(
    'the fallback rung inlines the preloaded woff2 rather than only naming it',
    face.embedsFontFace && face.embeddedBytes > 10_000,
    `${face.embeddedFamily}: ${(face.embeddedBytes / 1024).toFixed(0)} KB of base64 font data ` +
      `inside the rendered SVG`,
  );
  const movedX = Math.abs(face.withPreloadedFace.x0 - face.withoutPreloadedFace.x0);
  const movedY = Math.abs(face.withPreloadedFace.y1 - face.withoutPreloadedFace.y1);
  check(
    'and the whole render moves with it — the same headline through the bare stack differs',
    movedX > 0.002 || movedY > 0.002 || face.lineCountWithFace !== face.lineCountWithoutFace,
    `${face.embeddedFamily} ${box(face.withPreloadedFace)} (${face.lineCountWithFace} lines) vs ` +
      `Helvetica ${box(face.withoutPreloadedFace)} (${face.lineCountWithoutFace} lines) — ` +
      `Δx0 ${f(movedX)}, Δy1 ${f(movedY)}. Identical boxes would mean neither half took effect.`,
  );
  const drawDelta = Math.abs(face.withPreloadedFace.x0 - face.measuredNotDrawn.x0);
  note(
    'isolating the two halves: with the SAME stack but the bytes withheld the plan is identical ' +
      `and only the glyphs can move — measured Δx0 ${f(drawDelta)} against ` +
      `${box(face.measuredNotDrawn)}. Reported, not asserted: on a machine with ${face.embeddedFamily} ` +
      'installed system-wide the SVG resolves the real face without the embed and the two ' +
      'legitimately match, so the assertion above is the machine-independent one and the inlined ' +
      'bytes are what proves the DRAW reaches the rasteriser.',
  );

  // ── The bug itself ──────────────────────────────────────────────────────────────────────
  check(
    'THE FIX: a brand with type but NO design system no longer refuses',
    run.brandMdWithoutDesignSystemRan,
    'the brand.md-only case produced an image with ink in it, where the old op threw ' +
      '"Setting type needs the brand\'s design system" before reaching the renderer',
  );

  // ── The ink's own last rung: MEASURED, and it draws ─────────────────────────────────────
  const { onLight, onDark } = run.derivedInk;
  const inkHex = (c: DerivedInkCase) =>
    `#${c.rgb.map((b) => b.toString(16).padStart(2, '0')).join('')}`;

  for (const c of [onLight, onDark]) {
    check(
      `${c.label}: a brand with NO colour anywhere still burns readable type`,
      c.ink.pixels >= MIN_INK_PIXELS,
      `${c.ink.pixels}px of ${c.name} (${inkHex(c)}) at ${box(c.ink)} — the ink the ` +
        `measurement chose; had the op drawn the other candidate this box would be empty`,
    );
    check(
      `${c.label}: and says so — "${c.note}"`,
      /no brand colour found/i.test(c.note) && c.note.includes(c.name),
      `photo luma ${c.photo.floor}–${c.photo.ceiling}, chose ${c.name} at ` +
        `${c.ratio.toFixed(2)}:1 against its own worst case`,
    );
  }

  // THE assertion that separates a measurement from a constant. One brand, one config, two
  // photos: a hard-coded black passes the bright case and renders an invisible headline on the
  // night scene. Nothing that returns the same value twice can satisfy this.
  check(
    'THE INK IS MEASURED, NOT HARD-CODED: it flips with the photo',
    onLight.name === 'black' && onDark.name === 'white',
    `luma ${onLight.photo.floor}–${onLight.photo.ceiling} → ${onLight.name} ` +
      `(${onLight.ratio.toFixed(2)}:1); luma ${onDark.photo.floor}–${onDark.photo.ceiling} → ` +
      `${onDark.name} (${onDark.ratio.toFixed(2)}:1). Same brand, same config, opposite inks.`,
  );
  check(
    'the two candidates are the declared pair, so neither is an invented hex',
    inkHex(onLight) === `#${run.candidates.dark.map((b) => b.toString(16).padStart(2, '0')).join('')}` &&
      inkHex(onDark) === `#${run.candidates.light.map((b) => b.toString(16).padStart(2, '0')).join('')}`,
    `dark candidate ${inkHex(onLight)}, light candidate ${inkHex(onDark)}`,
  );

  // ── Both fallbacks are opt-out, and OFF is the old strict refusal ───────────────────────
  const inkOff = run.inkFallbackOff;
  check(
    'the ink fallback is OPT-OUT: switched off, the same brand refuses instead of drawing',
    inkOff.threw && /colour/i.test(inkOff.message),
    inkOff.threw
      ? inkOff.message.slice(0, 200)
      : 'the op drew anyway with the ink fallback switched off',
  );
  check(
    'and that refusal says the TYPE resolved and names the switch that would fix it',
    inkOff.threw &&
      /type resolved/i.test(inkOff.message) &&
      /fallback ink/i.test(inkOff.message) &&
      !/Set Type/.test(inkOff.message),
    inkOff.message.slice(0, 260),
  );
  const typeOff = run.typeFallbackOff;
  check(
    'the type fallback is OPT-OUT too: switched off, a brand with no face refuses',
    typeOff.threw && /typeface/i.test(typeOff.message) && /switched off/i.test(typeOff.message),
    typeOff.threw
      ? typeOff.message.slice(0, 220)
      : 'the op drew anyway with the type fallback switched off',
  );

  note(
    'every rung above uses one family (Georgia) on purpose: the four brand rungs then differ ' +
      'only in WHICH SHAPE named it, which is the thing under test. The fifth resolves to ' +
      `${run.preloaded.display} because nothing named a face at all.`,
  );
  record(
    'the panel and node badge rendering of the source',
    'SKIP',
    'both call `describeHeadlineFaces` on the same resolver this bench reads back, and the ' +
      'string is asserted here; the jsdom component tests cover that it reaches the DOM',
  );
  record(
    'a BRAND face whose bytes we do not hold',
    'SKIP',
    'a family like "Söhne" resolves and is labelled, but an SVG rasterised as an image cannot ' +
      'fetch a webfont, so it still draws in the fallback stack. Unchanged pre-existing ceiling ' +
      '— it needs a byte source for brand faces, which no rung of this chain provides',
  );

  finish();
}

await main();
