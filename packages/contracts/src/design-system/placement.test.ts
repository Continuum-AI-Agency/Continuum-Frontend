import { describe, expect, it } from 'bun:test';
import { type FractionalBox, VERNE_NAVY } from './image-analysis';
import {
  breakLines,
  CENTRED_FRAMING,
  type FramingCandidate,
  framingCandidates,
  framingCropRect,
  type HeadlineToken,
  type HeadlineWeight,
  type MeasureText,
  placementPlanSchema,
  type PlacementProbeState,
  planPlacement,
  type ProbeContrast,
  resolveTreatment,
  scoreBreaks,
  searchFraming,
  titleBox,
  type TreatmentStep,
  VERNE_FRAMING_FOCALS,
  VERNE_FRAMING_GOOD_ENOUGH,
  VERNE_ORPHAN_FRACTION,
  VERNE_ORPHAN_PENALTY,
  VERNE_TITLE_BOLD_SIZE,
  VERNE_TITLE_BOX_BOTTOM,
  VERNE_TITLE_BOX_TOP,
  VERNE_TITLE_LIGHT_SIZE,
  VERNE_TITLE_LINE_STEP,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
  VERNE_VEIL_FLOORS,
} from './placement';

/**
 * A fixed advance per character, per weight. The point of injecting the measurement is that a
 * font is not needed to check the decision: with 10 px per light character and 15 px per bold
 * one, every width below is arithmetic anyone can redo on paper.
 */
const CHAR: Record<HeadlineWeight, number> = { light: 10, bold: 15 };
const measureText: MeasureText = (text, style) => [...text].length * CHAR[style.weight];

/** Counts raw calls, so the memo can be shown to save real work rather than asserted to. */
const counting = (inner: MeasureText) => {
  let calls = 0;
  const fn: MeasureText = (text, style) => {
    calls += 1;
    return inner(text, style);
  };
  return { fn, calls: () => calls };
};

const light = (text: string): HeadlineToken => ({ text, weight: 'light' });
const bold = (text: string): HeadlineToken => ({ text, weight: 'bold' });

const SIZES = { lightSizePx: 44, boldSizePx: 67 };
const texts = (lines: readonly { readonly words: readonly HeadlineToken[] }[]) =>
  lines.map((line) => line.words.map((w) => w.text).join(' '));

describe('breakLines', () => {
  it('splits on whitespace across weight runs and keeps the reading order', () => {
    const result = breakLines([light('con'), bold('University of London')], measureText, {
      measure: 1000,
      ...SIZES,
    });
    expect(texts(result.lines)).toEqual(['con University of London']);
    expect(result.lines[0].words.map((w) => w.weight)).toEqual(['light', 'bold', 'bold', 'bold']);
  });

  it('measures the inter-word space in the font of the word that FOLLOWS it', () => {
    // "con" is 3 light chars = 30. "University" is 10 bold chars = 150. The space between them
    // is bold (15), not light (10) — the reference measures it in the following word's font, and
    // on a mixed line that is what decides whether the last word fits.
    const result = breakLines([light('con'), bold('University')], measureText, {
      measure: 1000,
      ...SIZES,
    });
    expect(result.lines[0].width).toBe(195);
    expect(result.lines[0].width).not.toBe(190);
  });

  it('splits a word wider than the measure character by character', () => {
    // 12 light chars = 120 > 100, so it breaks into 10 + 2.
    const result = breakLines([light('AAAAAAAAAAAA')], measureText, { measure: 100, ...SIZES });
    expect(texts(result.lines)).toEqual(['AAAAAAAAAA', 'AA']);
  });

  it('returns no lines for an empty headline', () => {
    const result = breakLines([light('   ')], measureText, { measure: 100, ...SIZES });
    expect(result.lines).toEqual([]);
    expect(result.minimumLines).toBe(0);
  });

  it('beats greedy first-fit on the ragged edge greedy leaves', () => {
    // AAAA(40) BBBB(40) CC(20) at a measure of 100.
    // Greedy packs [AAAA BBBB](90) and dumps [CC](20) on the last line — 20 % of the measure,
    // alone, on the line the eye lands on. The balanced pass spends its slack up top instead.
    const result = breakLines([light('AAAA BBBB CC')], measureText, { measure: 100, ...SIZES });
    expect(texts(result.lines)).toEqual(['AAAA', 'BBBB CC']);
    expect(result.lines.map((l) => l.width)).toEqual([40, 70]);
    expect(result.minimumLines).toBe(2);
    expect(result.greedyFallback).toBe(false);
    expect(result.cost).toBe(3600);

    const greedy = scoreBreaks([90, 20], { measure: 100, minimumLines: 2 });
    expect(greedy).toBe(7676);
    expect(result.cost).toBeLessThan(greedy);
  });

  it('is the orphan term that drives that choice, not the slack term', () => {
    // Control: suppress the orphan rule (fraction 0 means no last line is ever an orphan) and
    // the same words break exactly the way greedy breaks them.
    const control = breakLines([light('AAAA BBBB CC')], measureText, {
      measure: 100,
      ...SIZES,
      orphanFraction: 0,
    });
    expect(texts(control.lines)).toEqual(['AAAA BBBB', 'CC']);
    expect(control.lines.map((l) => l.width)).toEqual([90, 20]);
  });

  it('does not fire the orphan penalty when the piece is a single line', () => {
    const result = breakLines([light('AB')], measureText, { measure: 100, ...SIZES });
    expect(result.lines).toHaveLength(1);
    expect(result.minimumLines).toBe(1);
    // 20 px on a 100 px measure is far under the 34 % floor; it costs nothing anyway, because a
    // piece that fits on one line has no last-line problem to solve.
    expect(result.cost).toBe(0);
    expect(scoreBreaks([20], { measure: 100, minimumLines: 2 })).toBe(7576);
  });

  it('charges nothing for ordinary slack on the final line', () => {
    const loose = scoreBreaks([90, 80], { measure: 100, minimumLines: 2 });
    const looser = scoreBreaks([90, 40], { measure: 100, minimumLines: 2 });
    expect(loose).toBe(looser);
    expect(loose).toBe(100);
  });

  it('never spends more lines than greedy would', () => {
    const result = breakLines([light('AAAA BBBB CC')], measureText, { measure: 100, ...SIZES });
    expect(result.lines.length).toBeLessThanOrEqual(result.minimumLines);
  });
});

describe('memoised measurement', () => {
  /**
   * An unmemoised transcription of `_lineas_titular` — the width is recomputed inside every DP
   * transition, exactly as the reference does it. If the memo changed any answer this would
   * disagree.
   */
  const naive = (words: readonly HeadlineToken[], limit: number, measure: MeasureText): string[] => {
    const styleFor = (weight: HeadlineWeight) => ({
      weight,
      sizePx: weight === 'bold' ? SIZES.boldSizePx : SIZES.lightSizePx,
    });
    const width = (i: number, j: number): number => {
      let total = 0;
      for (let k = i; k < j; k += 1) {
        const style = styleFor(words[k].weight);
        if (k > i) total += measure(' ', style);
        total += measure(words[k].text, style);
      }
      return total;
    };
    const n = words.length;
    const minimum: number[] = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i -= 1) {
      const options: number[] = [];
      for (let j = i + 1; j <= n; j += 1) if (width(i, j) <= limit) options.push(minimum[j]);
      minimum[i] = 1 + (options.length > 0 ? Math.min(...options) : minimum[i + 1]);
    }
    const target = minimum[0];
    const cost: number[] = new Array(n + 1).fill(Number.POSITIVE_INFINITY);
    const cut: number[] = new Array(n + 1).fill(n);
    cost[n] = 0;
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = i + 1; j <= n; j += 1) {
        if (width(i, j) > limit && j > i + 1) break;
        if (!Number.isFinite(cost[j])) continue;
        const slack = Math.max(0, limit - width(i, j));
        let c = slack * slack;
        if (j === n) {
          const used = width(i, j);
          if (used < limit * 0.34 && target > 1) c += 6 * (limit * 0.34 - used) ** 2;
          else c = 0;
        }
        if (c + cost[j] < cost[i]) {
          cost[i] = c + cost[j];
          cut[i] = j;
        }
      }
    }
    let spans: [number, number][] = [];
    for (let i = 0; i < n; ) {
      const j = cut[i] <= i ? i + 1 : cut[i];
      spans.push([i, j]);
      i = j;
    }
    if (spans.length > target) {
      spans = [];
      let start = 0;
      for (let k = 0; k < n; k += 1) {
        if (k > start && width(start, k + 1) > limit) {
          spans.push([start, k]);
          start = k;
        }
      }
      spans.push([start, n]);
    }
    return spans.map(([i, j]) =>
      words
        .slice(i, j)
        .map((w) => w.text)
        .join(' '),
    );
  };

  const fixtures: readonly (readonly [string, readonly HeadlineToken[], number])[] = [
    ['orphan', [light('AAAA BBBB CC')], 100],
    ['mixed weight', [light('con'), bold('University of London')], 300],
    ['four light words', [light('AAA BBB CCC DD')], 100],
    ['single word', [light('AAAA')], 100],
    ['already fits', [light('AA BB')], 500],
  ];

  for (const [name, tokens, limit] of fixtures) {
    it(`agrees with the unmemoised reference: ${name}`, () => {
      const flat = tokens.flatMap((token) =>
        token.text
          .split(/\s+/)
          .filter(Boolean)
          .map((text) => ({ text, weight: token.weight })),
      );
      const memoised = counting(measureText);
      const plain = counting(measureText);
      const result = breakLines(tokens, memoised.fn, { measure: limit, ...SIZES });
      expect(texts(result.lines)).toEqual(naive(flat, limit, plain.fn));
      expect(memoised.calls()).toBeLessThan(plain.calls());
    });
  }

  it('reports the distinct segment widths it computed', () => {
    const result = breakLines([light('AAAA BBBB CC')], measureText, { measure: 100, ...SIZES });
    // Three words give six (i, j) segments; the breaker asks for all of them and no more.
    expect(result.measurements).toBe(6);
  });
});

describe('framing search', () => {
  const box = titleBox();
  const probeFor = (score: (candidate: FramingCandidate) => number) => {
    const seen: { box: FractionalBox; state: PlacementProbeState }[] = [];
    const probe: ProbeContrast = (b, state) => {
      seen.push({ box: b, state });
      return score(state.framing);
    };
    return { probe, seen };
  };

  it('moves on whichever axis has crop slack', () => {
    expect(framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 }).axis).toBe(
      'horizontal',
    );
    expect(framingCandidates({ width: 1000, height: 2000 }, { width: 1080, height: 900 }).axis).toBe(
      'vertical',
    );
  });

  it('offers the reference focals and keeps the centre as the incumbent, not a candidate', () => {
    const set = framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 });
    expect(set.candidates.map((c) => c.focal)).toEqual([...VERNE_FRAMING_FOCALS]);
    expect(set.incumbent).toEqual({ axis: 'horizontal', focal: 0.5 });
    expect(set.candidates.some((c) => c.focal === 0.5)).toBe(false);
  });

  it('maps a candidate onto the same crop geometry the analysis module already owns', () => {
    const rect = framingCropRect(
      { width: 2000, height: 1000 },
      { width: 1000, height: 1000 },
      { axis: 'horizontal', focal: 0 },
    );
    expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it('leaves the incumbent in place on a tie', () => {
    const set = framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 });
    const { probe, seen } = probeFor(() => 5);
    const choice = searchFraming(set.candidates, probe, { box, incumbent: set.incumbent });
    expect(choice.chosen).toEqual(set.incumbent);
    expect(choice.ratio).toBe(5);
    expect(choice.earlyExit).toBe(false);
    expect(seen).toHaveLength(7);
  });

  it('gives the earliest candidate the win among equals', () => {
    const set = framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 });
    const { probe } = probeFor((c) => (c.focal === 0.5 ? 5 : 6));
    const choice = searchFraming(set.candidates, probe, { box, incumbent: set.incumbent });
    expect(choice.chosen.focal).toBe(0);
    expect(choice.ratio).toBe(6);
    expect(choice.earlyExit).toBe(false);
  });

  it('stops as soon as a candidate clears the good-enough bar', () => {
    const set = framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 });
    const { probe, seen } = probeFor((c) => (c.focal === 0 ? 9 : 1));
    const choice = searchFraming(set.candidates, probe, { box, incumbent: set.incumbent });
    expect(choice.chosen.focal).toBe(0);
    expect(choice.ratio).toBe(9);
    expect(choice.earlyExit).toBe(true);
    // Incumbent plus one candidate. The other five focals are never measured.
    expect(seen).toHaveLength(2);
    expect(choice.probes).toBe(2);
  });

  it('scores every candidate in the SAME box — the reference bug is not reproduced', () => {
    const set = framingCandidates({ width: 2000, height: 1000 }, { width: 1080, height: 900 });
    const { probe, seen } = probeFor(() => 1);
    searchFraming(set.candidates, probe, { box, incumbent: set.incumbent });
    for (const call of seen) expect(call.box).toEqual(box);
    for (const call of seen) expect(call.state.treatments).toEqual([]);
  });
});

describe('escalation ladder', () => {
  const box = titleBox();
  const INK = [10, 20, 30] as const;

  /** Clears at exactly `clearsAt`, never before. Records every stack the probe was handed. */
  const ladderProbe = (clearsAt: number) => {
    const stacks: TreatmentStep[][] = [];
    let rung = -1;
    const probe: ProbeContrast = (_b, state) => {
      stacks.push([...state.treatments]);
      rung += 1;
      return rung >= clearsAt ? 9 : 1;
    };
    return { probe, stacks };
  };

  it('puts the type straight on the photo when the photo already carries it', () => {
    const treatment = resolveTreatment(() => 5, { box, ink: INK });
    expect(treatment.kind).toBe('direct');
    expect(treatment.rung).toBe(0);
    expect(treatment.steps).toEqual([]);
    expect(treatment.ratio).toBe(5);
    expect(treatment.cleared).toBe(true);
  });

  it('harmonises before it veils', () => {
    const { probe } = ladderProbe(1);
    const treatment = resolveTreatment(probe, { box, ink: INK });
    expect(treatment.kind).toBe('harmonised');
    expect(treatment.rung).toBe(1);
    expect(treatment.steps).toEqual([{ kind: 'harmonise' }]);
  });

  it('raises the veil floor only until the box reads, and stops there', () => {
    const { probe } = ladderProbe(3);
    const treatment = resolveTreatment(probe, { box, ink: INK });
    expect(treatment.kind).toBe('veiled');
    expect(treatment.rung).toBe(3);
    expect(treatment).toMatchObject({ veilFloor: 0.28, cleared: true, ratio: 9 });
    expect(treatment.steps).toEqual([
      { kind: 'harmonise' },
      { kind: 'veil', floor: 0.15 },
      { kind: 'veil', floor: 0.28 },
    ]);
  });

  it('stacks the veils CUMULATIVELY — each rung sees everything applied before it', () => {
    const { probe, stacks } = ladderProbe(Number.POSITIVE_INFINITY);
    resolveTreatment(probe, { box, ink: INK });
    expect(stacks[0]).toEqual([]);
    expect(stacks[stacks.length - 1]).toEqual([
      { kind: 'harmonise' },
      ...VERNE_VEIL_FLOORS.map((floor) => ({ kind: 'veil' as const, floor })),
    ]);
    // Each stack is a strict prefix of the next: nothing is ever re-derived from the original.
    for (let i = 1; i < stacks.length; i += 1) {
      expect(stacks[i].slice(0, stacks[i - 1].length)).toEqual(stacks[i - 1]);
      expect(stacks[i].length).toBe(stacks[i - 1].length + 1);
    }
  });

  it('never rejects the piece: the last rung still returns a plan, with its real ratio', () => {
    const treatment = resolveTreatment(() => 1.4, { box, ink: INK });
    expect(treatment.kind).toBe('veiled');
    expect(treatment.rung).toBe(1 + VERNE_VEIL_FLOORS.length);
    expect(treatment).toMatchObject({ veilFloor: 0.9, cleared: false });
    expect(treatment.ratio).toBe(1.4);
  });

  it('never changes the type colour and never moves the headline, at any rung', () => {
    for (let clearsAt = 0; clearsAt <= 1 + VERNE_VEIL_FLOORS.length; clearsAt += 1) {
      const { probe } = ladderProbe(clearsAt);
      const treatment = resolveTreatment(probe, { box, ink: INK });
      expect(treatment.ink).toEqual([10, 20, 30]);
      expect(treatment.box).toEqual({ ...box });
    }
  });

  it('defaults the ink to the brand navy and the bar to the calibrated 3.2', () => {
    expect(resolveTreatment(() => 3.2, { box }).ink).toEqual([...VERNE_NAVY]);
    expect(resolveTreatment(() => 3.19, { box }).kind).not.toBe('direct');
    expect(resolveTreatment(() => 3.2, { box }).kind).toBe('direct');
  });
});

describe('planPlacement', () => {
  const frame = { width: 1080, height: 900 };
  const source = { width: 2400, height: 1000 };
  const tokens = [light('Doble Grado Internacional con'), bold('University of London')];

  /**
   * Wider characters than the breaker fixtures use, so the real calibrated measure
   * (0.61 x 1080 = 658.8 px) wraps this headline the way a real Publico Roman/Bold pair does.
   */
  const PLAN_CHAR: Record<HeadlineWeight, number> = { light: 24, bold: 36 };
  const planMeasureText: MeasureText = (text, style) => [...text].length * PLAN_CHAR[style.weight];

  const build = (probeContrast: ProbeContrast) =>
    planPlacement({ tokens, frame, source, measureText: planMeasureText, probeContrast });

  it('parses against its own schema', () => {
    const plan = build(() => 9);
    const parsed = placementPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(placementPlanSchema.parse(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });

  it('is byte-identical for the same inputs and the same callbacks', () => {
    expect(JSON.stringify(build(() => 4))).toBe(JSON.stringify(build(() => 4)));
  });

  it('anchors the headline to the right margin and carries the line step', () => {
    const plan = build(() => 9);
    expect(plan.anchor.edge).toBe('right');
    expect(plan.anchor.xPx).toBeCloseTo(1080 * (1 - VERNE_TITLE_RIGHT_MARGIN), 9);
    expect(plan.anchor.yPx).toBeCloseTo(900 * VERNE_TITLE_BOX_TOP, 9);
    expect(plan.anchor.stepPx).toBeCloseTo(1080 * VERNE_TITLE_LINE_STEP, 9);
    expect(plan.measurePx).toBeCloseTo(1080 * VERNE_TITLE_MEASURE, 9);
    expect(plan.lines.map((line) => line.baselineOffsetPx)).toEqual(
      plan.lines.map((_line, index) => index * plan.anchor.stepPx),
    );
  });

  it('breaks the reference headline off the orphan greedy would have left', () => {
    // The failure the balanced pass exists for, at the real calibrated measure: greedy fills
    // "con University of" (576) and strands "London" (216) — 33 % of the measure, under the
    // 34 % floor. Moving "of" down costs slack up top and buys a 49 % last line.
    const plan = build(() => 9);
    expect(plan.lines.map((line) => line.text)).toEqual([
      'Doble Grado Internacional',
      'con University',
      'of London',
    ]);
    expect(plan.lines.map((line) => line.widthPx)).toEqual([600, 468, 324]);
    expect(plan.minimumLines).toBe(3);
    expect(plan.greedyFallback).toBe(false);
    expect(plan.breakCost).toBeLessThan(
      scoreBreaks([600, 576, 216], { measure: plan.measurePx, minimumLines: 3 }),
    );
  });

  it('gives each line the largest body size on it, and each word its own', () => {
    const plan = build(() => 9);
    const mixed = plan.lines.find((line) => line.words.some((w) => w.weight === 'bold'));
    expect(mixed?.sizePx).toBeCloseTo(1080 * VERNE_TITLE_BOLD_SIZE, 9);
    expect(mixed?.words.map((w) => w.sizePx)).toEqual([
      1080 * VERNE_TITLE_LIGHT_SIZE,
      1080 * VERNE_TITLE_BOLD_SIZE,
    ]);
    const lightOnly = plan.lines.find((line) => line.words.every((w) => w.weight === 'light'));
    expect(lightOnly?.sizePx).toBeCloseTo(1080 * VERNE_TITLE_LIGHT_SIZE, 9);
    expect(plan.lines.every((line) => line.trackingPx === 0)).toBe(true);
  });

  it('hands the framing search and the ladder the same box', () => {
    const boxes: FractionalBox[] = [];
    const plan = planPlacement({
      tokens,
      frame,
      source,
      measureText: planMeasureText,
      probeContrast: (b) => {
        boxes.push(b);
        return 1;
      },
    });
    for (const b of boxes) expect(b).toEqual(titleBox());
    expect(plan.box).toEqual(titleBox());
    expect(boxes.length).toBeGreaterThan(VERNE_FRAMING_FOCALS.length);
  });

  it('reports the ratio the treatment actually reached, cleared or not', () => {
    const failing = build(() => 1.1);
    expect(failing.contrastRatio).toBe(1.1);
    expect(failing.treatment.cleared).toBe(false);
    const passing = build(() => 9);
    expect(passing.contrastRatio).toBe(9);
    expect(passing.treatment.kind).toBe('direct');
  });

  it('takes the centred crop when no source is given, without probing for a better one', () => {
    let probes = 0;
    const plan = planPlacement({
      tokens,
      frame,
      measureText: planMeasureText,
      probeContrast: () => {
        probes += 1;
        return 9;
      },
    });
    expect(plan.framing).toEqual(CENTRED_FRAMING);
    // One framing probe, one ladder probe. No search.
    expect(probes).toBe(2);
  });

  it('scales the faces and the step but not the measure', () => {
    const plain = build(() => 9);
    const scaled = planPlacement({
      tokens,
      frame,
      source,
      measureText: planMeasureText,
      probeContrast: () => 9,
      options: { scale: 0.5 },
    });
    expect(scaled.anchor.stepPx).toBeCloseTo(plain.anchor.stepPx / 2, 9);
    expect(scaled.measurePx).toBe(plain.measurePx);
  });
});

describe('calibrated constants', () => {
  // Measured against one client's real artwork. If a change to this module moves one of these,
  // that is a recalibration and it needs to be argued for, not merged.
  it('match the Python reference exactly', () => {
    expect(VERNE_TITLE_LIGHT_SIZE).toBe(0.0443);
    expect(VERNE_TITLE_BOLD_SIZE).toBe(0.067);
    expect(VERNE_TITLE_LINE_STEP).toBe(0.066);
    expect(VERNE_TITLE_RIGHT_MARGIN).toBe(0.075);
    expect(VERNE_TITLE_MEASURE).toBe(0.61);
    expect(VERNE_TITLE_BOX_TOP).toBe(0.18);
    expect(VERNE_TITLE_BOX_BOTTOM).toBe(0.68);
    expect(VERNE_ORPHAN_FRACTION).toBe(0.34);
    expect(VERNE_ORPHAN_PENALTY).toBe(6);
    expect(VERNE_TITLE_MIN_CONTRAST).toBe(3.2);
    expect(VERNE_VEIL_FLOORS).toEqual([0.15, 0.28, 0.42, 0.58, 0.75, 0.9]);
    expect(VERNE_FRAMING_FOCALS).toEqual([0.0, 0.15, 0.3, 0.65, 0.85, 1.0]);
    expect(VERNE_FRAMING_GOOD_ENOUGH).toBe(7.0);
  });

  it('derives the headline box from the margin and the measure', () => {
    const box = titleBox();
    expect(box.x1).toBeCloseTo(1 - VERNE_TITLE_RIGHT_MARGIN, 9);
    expect(box.x0).toBeCloseTo(1 - VERNE_TITLE_RIGHT_MARGIN - VERNE_TITLE_MEASURE, 9);
    expect(box.y0).toBe(VERNE_TITLE_BOX_TOP);
    expect(box.y1).toBe(VERNE_TITLE_BOX_BOTTOM);
    // Retune the measure and all four edges follow — the box is not a second hard-coded zone.
    expect(titleBox({ measureFraction: 0.5 }).x0).toBeCloseTo(0.425, 9);
  });
});
