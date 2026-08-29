#!/usr/bin/env bun
/**
 * text:render:bench — proves `image.text` DRAWS a legible, on-brand headline, not that it
 * planned one.
 *
 * A plan is an intention. The failure this bench exists to catch is the one a plan cannot see:
 * the op measures a photo, decides "this reads", and then the draw path changes the thing it
 * measured — a leftover `globalAlpha` from the veil tinting the type, a treatment composited
 * after the glyphs instead of before, a font that resolves differently in the SVG than in the
 * canvas that measured it. Every one of those ships a green plan and an unreadable piece.
 *
 * So the assertions are all on DECODED PIXELS of the rendered PNG:
 *
 *   • `darkPercentileContrast` re-run inside the actual text box of the OUTPUT, with the glyphs
 *     excluded, must clear `minContrast` — the type is legible against what is behind it;
 *   • the modal ink colour inside that box must be BYTE-IDENTICAL to the design-system token —
 *     nothing in the draw path recoloured the brand's ink;
 *   • the drawn line count must equal the plan's — the glyph run is the run that was measured.
 *
 * Real Chrome, because OffscreenCanvas, `createImageBitmap` and SVG rasterisation are the code
 * under test. The photo is GENERATED, not checked in: a deterministic two-axis gradient plus a
 * seeded LCG dither (see `gradientPhoto`), so the input is real pixels with a real luma
 * histogram and is identical on every run.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { ImageTextBenchRun } from './support/imageTextRenderBenchEntry';

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
const check = (step: string, ok: boolean, detail?: string) => record(step, ok ? 'PASS' : 'FAIL', detail);
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
        bench: 'text:render:bench',
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
      `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — text:render:bench: ${counts.pass} pass, ` +
        `${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
    );
  }
  process.exit(exitCode);
}

/** What the stacking bug actually painted: `1 − Π(1 − floor)` over the whole frame, as a %. */
const stackedCoverage = (veils: number): string =>
  (
    100 *
    (1 - [0.15, 0.28, 0.42, 0.58, 0.75, 0.9].slice(0, veils).reduce((acc, f) => acc * (1 - f), 1))
  ).toFixed(0);

function buildBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'image-text-render-bench-'));
  const outfile = join(dir, 'entry.js');
  try {
    execFileSync(
      'bun',
      ['build', 'e2e/support/imageTextRenderBenchEntry.ts', '--target=browser', '--outfile', outfile],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    return readFileSync(outfile, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

  let run: ImageTextBenchRun;
  try {
    await page.route('**/image-text-render-bench', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
    );
    await page.goto('http://127.0.0.1:4173/image-text-render-bench', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: bundle, type: 'module' });
    await page.waitForFunction(() => Boolean(window.__imageTextRenderBench), null, { timeout: 30_000 });
    run = (await page.evaluate(() => window.__imageTextRenderBench.run())) as ImageTextBenchRun;
  } catch (error) {
    record('drive image.text in real Chrome', 'FAIL', `${error}${consoleErrors.length ? ` | ${consoleErrors.join(' | ')}` : ''}`);
    await browser.close();
    finish();
  }
  await browser.close();

  const inkHex = `#${run.ink.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const modalOf = (c: { measurement: { modalInk: readonly number[] } }) =>
    `#${c.measurement.modalInk.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  record('drive image.text in real Chrome', 'PASS', `${run.cases.length} cases, ink ${inkHex}`);
  note(`font stack resolved to ${run.fontStack}`);

  for (const c of run.cases) {
    const m = c.measurement;
    const modalHex = `#${m.modalInk.map((b) => b.toString(16).padStart(2, '0')).join('')}`;

    check(
      `${c.label}: the op emitted a PNG with real bytes`,
      c.mimeType === 'image/png' && c.bytes > 20_000,
      `${c.mimeType}, ${(c.bytes / 1024).toFixed(0)} KB`,
    );

    // THE anchor. Re-measured on the decoded output, not on the plan.
    check(
      `${c.label}: MEASURED contrast behind the type clears ${run.minContrast}`,
      m.backgroundRatio >= run.minContrast,
      `measured ${m.backgroundRatio.toFixed(2)}:1 over ${m.boxPixels - m.inkishPixels} background px ` +
        `(plan said ${c.plannedRatio.toFixed(2)}:1 at rung ${c.rung}/${c.treatment})`,
    );

    check(
      `${c.label}: the ink is BYTE-IDENTICAL to the token`,
      m.modalInk[0] === run.ink[0] && m.modalInk[1] === run.ink[1] && m.modalInk[2] === run.ink[2],
      `modal ink in the box = ${modalHex} vs token ${inkHex} (${m.modalInkPixels} px exact of ${m.inkishPixels} ink-ish)`,
    );

    check(
      `${c.label}: the type is actually on the frame`,
      m.modalInkPixels > 500,
      `${m.modalInkPixels} px of pure token ink inside the headline box`,
    );

    check(
      `${c.label}: the drawn line count is the plan's line count`,
      c.svgTextElements === c.planLines && c.planLines > 1,
      `${c.svgTextElements} <text> elements for ${c.planLines} planned lines`,
    );

    check(
      `${c.label}: the glyph run rides a data: URI, never a blob:`,
      c.svgIsDataUri && !c.svgMentionsBlob,
      'a blob-sourced SVG taints the canvas and the next frame read throws',
    );

    note(
      `${c.label}: unmasked dark-percentile over the same box is ${m.rawRatio.toFixed(2)}:1 — that ` +
        'number measures the headline against ITSELF and is reported, not asserted.',
    );
  }

  const bright = run.cases[0];
  const dark = run.cases[1];
  check(
    'a photo that already carries the ink is left untouched',
    bright.rung === 0 && bright.treatment === 'direct' && bright.planCleared,
    `rung ${bright.rung}, ${bright.treatment}, cleared=${bright.planCleared}`,
  );
  check(
    'a photo that cannot carry the ink escalates the BACKGROUND and still clears',
    dark.rung > 0 && dark.measurement.backgroundRatio >= run.minContrast,
    `rung ${dark.rung} (${dark.treatment}), measured ${dark.measurement.backgroundRatio.toFixed(2)}:1`,
  );

  // ── The scrim, on the photo that forced the escalation ──────────────────────────────────
  //
  // User report: "why does it always wash out the image?". Two porting errors compounded — the
  // ladder pushed a veil step per floor it TRIED and the renderer filled the whole frame for
  // every one of them, so a photo needing floor 0.42 shipped under ~64 % white edge to edge.
  // Every assertion above stayed green through all of it: the type was legible, the ink was the
  // token, the lines were the plan's. These three are the ones that can see it.
  // Graded on the NEAR-BLACK case, not the merely dark one: at floor 0.15 a stacked veil and a
  // single one paint nearly the same picture. Only a photo that forces the ladder to climb
  // separates them, and it is also the photo the old code washed out hardest.
  const deep = run.cases[3];
  check(
    'the photo that forces a high floor gets ONE veil at THAT floor, not one per floor tried',
    deep.veilFloors.length === 1 &&
      deep.veilFloors[0] === deep.resolvedVeilFloor &&
      deep.rung >= 4,
    `steps [${deep.steps.join(', ')}] at rung ${deep.rung} — the stacking bug drew ` +
      `${deep.rung - 1} veils here, ${stackedCoverage(deep.rung - 1)} % white over the WHOLE frame`,
  );
  check(
    'the treatment lightens ONLY behind the headline — the rest of the photo is untouched',
    deep.footprint.outsideMaxDelta <= 2 && deep.footprint.outsideMeanDelta < 0.5,
    `outside the box + its ${deep.footprint.reachPx.toFixed(0)} px feather reach: mean |Δ| ` +
      `${deep.footprint.outsideMeanDelta.toFixed(3)}, worst channel ${deep.footprint.outsideMaxDelta} ` +
      `over ${deep.footprint.outsidePixels} px — a full-frame veil at floor ` +
      `${deep.resolvedVeilFloor ?? 0} moves these by ~${Math.round(255 * (deep.resolvedVeilFloor ?? 0) * 0.9)}`,
  );
  check(
    'and it DID lighten behind it — this cannot pass by treating nothing',
    deep.footprint.insideMeanDelta >= 8 && dark.footprint.insideMeanDelta >= 8,
    `inside the box, glyphs excluded: mean |Δ| ${deep.footprint.insideMeanDelta.toFixed(2)} over ` +
      `${deep.footprint.insidePixels} px (dark case ${dark.footprint.insideMeanDelta.toFixed(2)})`,
  );
  for (const c of run.cases) {
    check(
      `${c.label}: at most one veil in the plan, whatever the ladder tried`,
      c.veilFloors.length <= 1 && c.steps.length <= 2,
      `steps [${c.steps.join(', ') || 'none'}]`,
    );
  }

  // Both halves of the same guarantee, and the guarantee is unchanged: a token that does not
  // exist NEVER silently becomes black. With the ink fallback off it fails loudly, exactly as
  // before; with it on it substitutes the brand's OWN default ink — a real brand colour, one
  // step, labelled — rather than reaching past it to a measurement.
  check(
    'an unresolvable ink token FAILS LOUDLY when the ink fallback is off',
    Boolean(run.unresolvableTokenError?.includes('headline-ink')),
    run.unresolvableTokenError ?? 'the op returned an image for a token that does not exist',
  );
  const substituted = run.unresolvableTokenFallback;
  check(
    'and with the fallback ON it takes the BRAND default, never the measured black',
    substituted.substituted &&
      substituted.inkSource === 'design-system' &&
      substituted.measurement.modalInk[0] === run.ink[0] &&
      substituted.measurement.modalInk[1] === run.ink[1] &&
      substituted.measurement.modalInk[2] === run.ink[2],
    `substituted=${substituted.substituted}, ink from ${substituted.inkSource}, ` +
      `modal ink ${modalOf(substituted)} vs token ${inkHex} — a measured fallback would have ` +
      'drawn #111111 here and this comparison would fail',
  );
  // This check used to read "no design system is a refusal" and matched the word `design
  // system` in the message. The refusal survives — the ink chain has no fallback rung — but the
  // SCOPE was wrong: a missing design system used to fail the whole node, when a design system
  // is one of four places an ink can come from. So the claim is now the one that actually
  // matters and the string match is stricter, not looser: it refuses, it names the ink, and it
  // may not blame the design system or an op name that no longer exists.
  check(
    'no brand at all is still a refusal WITH THE INK FALLBACK OFF, not a guessed colour',
    Boolean(
      run.noBrandAtAllError &&
        /ink|colour/i.test(run.noBrandAtAllError) &&
        // Not "fix the token": there is no brand to hold one. The no-brand branch outranks the
        // named-token branch, and this is what pins that order.
        /no brand could be read/i.test(run.noBrandAtAllError) &&
        !/Set Type/.test(run.noBrandAtAllError) &&
        !/needs the brand's design system/.test(run.noBrandAtAllError),
    ),
    run.noBrandAtAllError ?? 'the op ran with no brand at all',
  );
  check(
    'a brand with a FACE and no colour refuses on the INK with the fallback off, and says the type resolved',
    Boolean(
      run.typeButNoInkError &&
        /colour/i.test(run.typeButNoInkError) &&
        /type resolved/i.test(run.typeButNoInkError),
    ),
    run.typeButNoInkError ?? 'the op set type in a colour no brand shape carries',
  );
  const viaBrandMd = run.cases[2];
  check(
    'THE FIX: the legible render above came through brand.md, with no design system in reach',
    viaBrandMd?.typeSource === 'brand-md' && viaBrandMd?.inkSource === 'brand-md',
    `${viaBrandMd?.label}: face ${viaBrandMd?.family} from ${viaBrandMd?.typeSource}, ink from ` +
      `${viaBrandMd?.inkSource} — the same case the op used to throw on before drawing anything`,
  );

  record(
    'the design system arrives over HTTP from the Backend',
    'SKIP',
    'executeWorkflow → loadBrandTypeInputs → /brand-knowledge/design-system + get-brand-book + ' +
      'the brand_profiles row all need an authenticated Backend; this run injects the brand ' +
      'shapes directly into runAction, so those reads are unexercised',
  );
  record(
    'the brand webfont binary is embedded in the glyph run',
    'SKIP',
    'the cases above use a BRAND face (Georgia) and no byte source for brand faces exists yet ' +
      '(Continuum-Backend/App/brand-knowledge/fonts is in flight), so nothing is embedded on this ' +
      'path. The PRELOADED fallback faces are embedded and burnin:type:bench asserts that; a ' +
      "brand's own webfont binary is the hop still uncovered",
  );

  finish();
}

await main();
