import { describe, expect, test } from 'bun:test';
import {
  CUT_RUNGS_SEC,
  type CutPlan,
  type CutPlanInput,
  type CutRungSec,
  cutPlanInputSchema,
  cutPlanSchema,
  fastCutFps,
  planCuts,
  stutterBurstBeats,
} from './cutPlan';

const beatAt = (bpm: number, energy?: number[]) => ({
  periodSec: 60 / bpm,
  bedAtSec: 2.4,
  ...(energy ? { energy } : {}),
});
/** Six takes and the packshot: two spoken takes carry speech windows, the rest are silent. */
const SOURCES: CutPlanInput['sources'] = [
  { id: 'talk-a', durationSec: 8, still: false, speech: [{ startSec: 0.3, endSec: 6.9 }] },
  { id: 'silent-a', durationSec: 6, still: false, speech: [] },
  {
    id: 'talk-b',
    durationSec: 9,
    still: false,
    speech: [
      { startSec: 1, endSec: 4 },
      { startSec: 5, endSec: 8.5 },
    ],
  },
  { id: 'silent-b', durationSec: 7.5, still: false, speech: [] },
  { id: 'silent-c', durationSec: 5, still: false, speech: [] },
  { id: 'packshot', durationSec: 1, still: true, speech: [] },
];
const plan = (overrides: Partial<CutPlanInput> = {}): CutPlan =>
  planCuts(
    cutPlanInputSchema.parse({
      beat: beatAt(150),
      bars: 4,
      pacing: 'steady',
      sources: SOURCES,
      transients: ['flash', 'punch', 'rgb-shift'],
      ...overrides,
    }),
  );
const starts = (cuts: CutPlan['cuts']) => {
  let at = 0;
  return cuts.map((cut) => {
    const start = at;
    at += cut.frames;
    return start;
  });
};
/** Frames per grid tick (one eighth of a beat). */
const tickFrames = (bpm: number, fps: number) => (60 / bpm / 8) * fps;
const offTick = (frame: number, bpm: number, fps: number) => {
  const ticks = frame / tickFrames(bpm, fps);
  return Math.abs(Math.round(ticks) * tickFrames(bpm, fps) - frame);
};
/** The frame of a bar line, as the planner rounds it. */
const barFrame = (bar: number, bpm: number, fps: number) =>
  Math.round((bar * 4 * 60 * fps) / bpm + 1e-9);
/** Where a plan drops: the build's last bar line, drop-hit's first 0.2 s cut; none otherwise. */
const dropFrameOf = (made: CutPlan, pacing: string, bars: number, bpm: number) =>
  pacing === 'build'
    ? barFrame(bars - 1, bpm, made.fps)
    : pacing === 'drop-hit'
      ? starts(made.cuts)[made.cuts.findIndex((cut) => cut.rung === 0.2)]
      : Number.NaN;
/** A build's ramp, split at the drop: the bar line one bar before the end. */
const buildRamp = (made: CutPlan, bars: number, bpm: number) => {
  const at = starts(made.cuts);
  const drop = barFrame(bars - 1, bpm, made.fps);
  return {
    drop,
    ramp: made.cuts.filter((_, index) => at[index] < drop),
    tail: made.cuts.filter((_, index) => at[index] >= drop),
  };
};

const PRESETS = [
  { pacing: 'steady' },
  { pacing: 'steady', rung: 1 },
  { pacing: 'steady', rung: 0.6 },
  { pacing: 'steady', rung: 0.1 },
  { pacing: 'steady', rung: 0.05 },
  { pacing: 'build' },
  { pacing: 'stutter' },
  { pacing: 'stutter', rung: 0.8 },
  { pacing: 'drop-hit' },
] as const;
const TEMPI = [150, 128, 120, 100, 92, 174];

describe('fastCutFps: 60 when a plan cuts at 0.1 s or faster, else 30', () => {
  test('the presets', () => {
    expect(fastCutFps('steady')).toBe(30);
    expect(fastCutFps('steady', 0.2)).toBe(30);
    expect(fastCutFps('steady', 0.1)).toBe(60);
    expect(fastCutFps('steady', 0.05)).toBe(60);
    expect(fastCutFps('build')).toBe(60);
    expect(fastCutFps('stutter')).toBe(60);
    expect(fastCutFps('stutter', 0.8)).toBe(60);
    expect(fastCutFps('drop-hit')).toBe(30);
  });

  test('a plan is 60 fps exactly when one of its cuts is a rung of 0.1 s or less', () => {
    for (const bpm of TEMPI)
      for (const preset of PRESETS) {
        const made = plan({ ...preset, beat: beatAt(bpm), bars: 8 });
        const fastest = Math.min(...made.cuts.map((cut) => cut.rung));
        expect(made.fps).toBe(fastest <= 0.1 ? 60 : 30);
      }
  });
});

describe('planCuts places every cut on the grid', () => {
  test('every boundary is within half a frame of a grid tick; stutter bursts start and end on one', () => {
    for (const bpm of TEMPI)
      for (const preset of PRESETS)
        for (const bars of [2, 4, 9, 16]) {
          const seconds = bars * 4 * (60 / bpm);
          // A whole montage of 0.05 s cuts past 36 s is more than 720 cuts: refused, never truncated.
          if ('rung' in preset && preset.rung === 0.05 && seconds > 36) {
            expect(() => plan({ ...preset, beat: beatAt(bpm), bars })).toThrow(
              /cut_plan_too_many_cuts/,
            );
            continue;
          }
          const made = plan({ ...preset, beat: beatAt(bpm), bars });
          expect(cutPlanSchema.safeParse(made).success).toBe(true);
          const at = starts(made.cuts);
          made.cuts.forEach((cut, index) => {
            const previousStutter = index > 0 && made.cuts[index - 1].grid === 'stutter';
            // Inside a burst a stutter follows the one before; a burst's first frame is on a tick.
            if (cut.grid === 'stutter' && previousStutter) return;
            expect(offTick(at[index], bpm, made.fps)).toBeLessThanOrEqual(0.5 + 1e-9);
          });
          expect(offTick(made.frames, bpm, made.fps)).toBeLessThanOrEqual(0.5 + 1e-9);
          // The montage is exactly its bars, and the cuts add up to it.
          expect(made.frames).toBe(Math.round(bars * 4 * (60 / bpm) * made.fps));
          expect(made.cuts.reduce((sum, cut) => sum + cut.frames, 0)).toBe(made.frames);
        }
  });

  test('the error never accumulates: the last boundary of 16 bars is as close as the first', () => {
    const made = plan({ beat: beatAt(127), bars: 16, rung: 0.2 });
    const at = starts(made.cuts);
    expect(Math.max(...at.map((frame) => offTick(frame, 127, made.fps)))).toBeLessThanOrEqual(0.5);
  });

  test('stutter rungs are exactly round(rung × fps) frames, inside tick-bounded bursts', () => {
    let stutters = 0;
    for (const bpm of [128, 120, 100, 92])
      for (const preset of PRESETS) {
        const made = plan({ ...preset, beat: beatAt(bpm), bars: 8 });
        const at = starts(made.cuts);
        made.cuts.forEach((cut, index) => {
          if (cut.grid !== 'stutter') return;
          stutters++;
          expect(cut.frames).toBe(Math.round(cut.rung * made.fps));
          const next = made.cuts[index + 1];
          // The frame after a burst (the next cut, or the montage end) is on a tick.
          if (!next || next.grid !== 'stutter')
            expect(offTick(at[index] + cut.frames, bpm, made.fps)).toBeLessThanOrEqual(0.5 + 1e-9);
        });
      }
    expect(stutters).toBeGreaterThan(100);
  });

  test('the 600-cut stress plan: steady 0.05 s over 16 bars at 128 BPM is 600 stutters of 3 frames', () => {
    const made = plan({ beat: beatAt(128), bars: 16, rung: 0.05 });
    expect(made.fps).toBe(60);
    expect(made.frames).toBe(1800);
    expect(made.cuts).toHaveLength(600);
    expect(made.cuts.every((cut) => cut.frames === 3 && cut.grid === 'stutter')).toBe(true);
  });
});

describe('the build ladder at 150 BPM and 60 fps', () => {
  const made = plan({ pacing: 'build', bars: 4 });
  const ladderFrames: Record<number, number> = {
    1: 60,
    0.8: 48,
    0.6: 36,
    0.4: 24,
    0.2: 12,
    0.1: 6,
    0.05: 3,
  };

  test('appears as 60/48/36/24/12/6/3 frames, slowest first, from the montage’s first frame', () => {
    expect(made.fps).toBe(60);
    const { ramp } = buildRamp(made, 4, 150);
    for (const cut of ramp) expect(cut.frames).toBe(ladderFrames[cut.rung]);
    const rungsInOrder = ramp
      .map((cut) => cut.rung)
      .filter((rung, index, all) => all.indexOf(rung) === index);
    expect(rungsInOrder).toEqual([...CUT_RUNGS_SEC]);
    // Each rung is one contiguous run: the ramp never steps back to a slower rung.
    expect(ramp.every((cut, index) => index === 0 || cut.rung <= ramp[index - 1].rung)).toBe(true);
  });

  test('every rung holds about the same time, so the cut count climbs as the rungs shrink', () => {
    for (const bpm of TEMPI)
      for (const bars of [4, 8, 16]) {
        const built = plan({ pacing: 'build', beat: beatAt(bpm), bars });
        const { drop, ramp } = buildRamp(built, bars, bpm);
        const rows = CUT_RUNGS_SEC.map((rung) => ramp.filter((cut) => cut.rung === rung));
        const counts = rows.map((row) => row.length);
        const seconds = rows.map(
          (row) => row.reduce((sum, cut) => sum + cut.frames, 0) / built.fps,
        );
        const share = drop / built.fps / CUT_RUNGS_SEC.length;
        const label = `${bpm} BPM, ${bars} bars: ${counts.join('/')} cuts`;
        expect(
          counts.every((count) => count > 0),
          label,
        ).toBe(true);
        expect(
          counts.every((count, index) => index === 0 || count >= counts[index - 1]),
          label,
        ).toBe(true);
        // Equal time makes the 0.05 s rung eight times the 0.4 s rung's count; the grid keeps half.
        expect(counts[6], label).toBeGreaterThanOrEqual(4 * counts[3]);
        // The fast rungs share the screen: no spike of one cut each, no rung swallowing the ramp.
        for (const held of seconds.slice(4)) {
          expect(held, label).toBeGreaterThanOrEqual(0.6 * share);
          expect(held, label).toBeLessThanOrEqual(1.5 * share);
        }
      }
  });

  test('lands exactly on the drop’s bar line, then at most one bar of 0.4 on the beats', () => {
    for (const bpm of TEMPI)
      for (const bars of [2, 4, 9, 16]) {
        const built = plan({ pacing: 'build', beat: beatAt(bpm), bars });
        const { drop, ramp, tail } = buildRamp(built, bars, bpm);
        const label = `${bpm} BPM, ${bars} bars`;
        // A cut starts exactly on the drop: the ramp's last cut ends on the bar line.
        expect(
          ramp.reduce((sum, cut) => sum + cut.frames, 0),
          label,
        ).toBe(drop);
        expect(Math.min(...ramp.map((cut) => cut.rung)), label).toBe(0.05);
        expect(built.frames - drop, label).toBe(
          barFrame(bars, bpm, built.fps) - barFrame(bars - 1, bpm, built.fps),
        );
        expect(
          tail.every((cut) => cut.rung === 0.4),
          label,
        ).toBe(true);
      }
    const { tail } = buildRamp(made, 4, 150);
    expect(tail.map((cut) => cut.frames)).toEqual([24, 24, 24, 24]);
  });

  test('a longer montage climbs the ladder with more cuts per rung', () => {
    const long = plan({ pacing: 'build', bars: 8 });
    expect(long.cuts.filter((cut) => cut.rung === 0.6).length).toBeGreaterThan(1);
  });

  test('an energy arc does not move the drop: no more than one bar follows it', () => {
    // 6 bars of 4 beats; the energy jumps at bar 4's downbeat (beat 16), two bars from the end.
    const energy = Array.from({ length: 24 }, (_, index) => (index >= 16 ? 1 : 0.3));
    const dropped = plan({ pacing: 'build', bars: 6, beat: beatAt(150, energy) });
    expect(buildRamp(dropped, 6, 150).ramp.reduce((sum, cut) => sum + cut.frames, 0)).toBe(5 * 96);
  });
});

describe('the other presets', () => {
  test('stutter: a base of 0.4 with 0.05 bursts that end every second bar and grow', () => {
    const made = plan({ pacing: 'stutter', bars: 4 });
    const at = starts(made.cuts);
    const burst = made.cuts
      .map((cut, index) => ({ cut, at: at[index] }))
      .filter(({ cut }) => cut.rung === 0.05);
    // At 150 BPM 0.05 s is one tick: one beat of 8 cuts ends bar 2, two beats of 16 end bar 4.
    expect(burst.map(({ at: frame }) => frame)).toEqual([
      ...Array.from({ length: 8 }, (_, index) => 168 + index * 3),
      ...Array.from({ length: 16 }, (_, index) => 336 + index * 3),
    ]);
    expect(
      made.cuts
        .filter((cut) => cut.rung !== 0.05)
        .every((cut) => cut.rung === 0.4 && cut.frames === 24),
    ).toBe(true);
  });

  test('stutter bursts escalate: each at least as long as the last, the final one longest', () => {
    expect(stutterBurstBeats(1)).toEqual([1]);
    expect(stutterBurstBeats(2)).toEqual([1, 2]);
    expect(stutterBurstBeats(4)).toEqual([1, 2, 3, 4]);
    expect(stutterBurstBeats(8)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    for (const bpm of TEMPI)
      for (const bars of [4, 8, 16]) {
        const made = plan({ pacing: 'stutter', beat: beatAt(bpm), bars });
        const shifts = made.transients.filter((transient) => transient.kind === 'rgb-shift');
        const lengths = shifts.map((shift) => shift.frames);
        expect(lengths).toHaveLength(bars / 2);
        expect(
          lengths.every((frames, index) => index === 0 || frames >= lengths[index - 1] - 1),
        ).toBe(true);
        expect(lengths.at(-1)).toBeGreaterThan(lengths[0] + 1);
      }
  });

  test('drop-hit: 1 and 0.8 until the drop, a flash and a punch, one bar of 0.2, then 0.4', () => {
    const energy = Array.from({ length: 16 }, (_, index) => (index >= 8 ? 1 : 0.2));
    const made = plan({ pacing: 'drop-hit', bars: 4, beat: beatAt(150, energy) });
    expect(made.fps).toBe(30);
    const at = starts(made.cuts);
    const drop = made.cuts.findIndex((cut) => cut.rung === 0.2);
    expect(at[drop]).toBe(2 * 48); // bar 2's downbeat at 30 fps
    expect(made.cuts.slice(0, drop).every((cut) => cut.rung === 1 || cut.rung === 0.8)).toBe(true);
    expect(
      made.cuts.slice(drop, drop + 8).every((cut) => cut.rung === 0.2 && cut.frames === 6),
    ).toBe(true);
    expect(made.cuts.slice(drop + 8).every((cut) => cut.rung === 0.4)).toBe(true);
    const hits = made.transients
      .filter((transient) => transient.atFrame === at[drop])
      .map((transient) => transient.kind);
    expect(hits).toContain('flash');
    expect(hits).toContain('punch');
  });
});

describe('footage', () => {
  test('never the same source twice running, and a reuse jumps its in-point by at least 0.5 s', () => {
    for (const preset of PRESETS) {
      const made = plan({ ...preset, bars: 8 });
      const lastIn = new Map<string, number>();
      made.cuts.forEach((cut, index) => {
        if (index > 0) expect(cut.sourceId).not.toBe(made.cuts[index - 1].sourceId);
        const source = SOURCES.find((candidate) => candidate.id === cut.sourceId);
        if (!source || source.still) return;
        const previous = lastIn.get(cut.sourceId);
        if (previous !== undefined)
          expect(Math.abs(cut.inSec - previous)).toBeGreaterThanOrEqual(0.5 - 1e-9);
        lastIn.set(cut.sourceId, cut.inSec);
        expect(cut.inSec + cut.frames / made.fps).toBeLessThanOrEqual(source.durationSec + 1e-6);
      });
    }
  });

  test('no cut of 0.4 s or longer comes from inside a speech window', () => {
    let long = 0;
    for (const bpm of TEMPI)
      for (const preset of PRESETS) {
        const made = plan({ ...preset, beat: beatAt(bpm), bars: 8 });
        for (const cut of made.cuts) {
          const seconds = cut.frames / made.fps;
          if (seconds < 0.4) continue;
          long++;
          const source = SOURCES.find((candidate) => candidate.id === cut.sourceId);
          for (const speech of source?.speech ?? [])
            expect(
              cut.inSec >= speech.endSec - 1e-9 || cut.inSec + seconds <= speech.startSec + 1e-9,
            ).toBe(true);
        }
      }
    expect(long).toBeGreaterThan(200);
  });

  test('short cuts may flash a spoken take; a long one refuses rather than show silent lips', () => {
    const spoken: CutPlanInput['sources'] = [
      { id: 'a', durationSec: 4, still: false, speech: [{ startSec: 0, endSec: 4 }] },
      { id: 'b', durationSec: 4, still: false, speech: [{ startSec: 0, endSec: 4 }] },
    ];
    expect(plan({ sources: spoken, rung: 0.2 }).cuts.length).toBe(32);
    expect(() => plan({ sources: spoken, rung: 0.4 })).toThrow(/cut_plan_no_footage_fits/);
  });
});

describe('stills', () => {
  test('a still lands only on a rung of 0.4 s or longer, or on the drop — never a 0.05–0.2 s cut', () => {
    let stills = 0;
    for (const bpm of TEMPI)
      for (const preset of PRESETS)
        for (const bars of [4, 8]) {
          if ('rung' in preset && preset.rung < 0.4) continue;
          const made = plan({ ...preset, beat: beatAt(bpm), bars });
          const at = starts(made.cuts);
          const drop = dropFrameOf(made, preset.pacing, bars, bpm);
          made.cuts.forEach((cut, index) => {
            if (cut.sourceId !== 'packshot') return;
            stills++;
            // The drop downbeat may hold the packshot even as drop-hit's 0.2 s hit.
            if (at[index] === drop) return;
            expect(cut.rung).toBeGreaterThanOrEqual(0.4);
            expect(cut.frames / made.fps).toBeGreaterThanOrEqual(0.3);
          });
        }
    expect(stills).toBeGreaterThan(50);
  });

  test('a montage of fast cuts and one still never draws the still', () => {
    expect(plan({ rung: 0.1, bars: 2 }).cuts.some((cut) => cut.sourceId === 'packshot')).toBe(
      false,
    );
  });
});

describe('cut-synced transients', () => {
  const made = plan({ pacing: 'build', bars: 4 });
  const at = starts(made.cuts);
  const of = (kind: string, from: CutPlan = made) =>
    from.transients.filter((transient) => transient.kind === kind);

  test('a one-frame flash on bar-downbeat cuts of 0.4 s or longer, never on the join from the hook', () => {
    const steady = plan({ bars: 4 });
    const steadyAt = starts(steady.cuts);
    const flashes = of('flash', steady).map((transient) => transient.atFrame);
    expect(flashes).toEqual([48, 96, 144]); // bars 2–4 at 30 fps; bar 1 is the join
    expect(flashes.every((frame) => steadyAt.includes(frame))).toBe(true);
    expect(of('flash', steady).every((transient) => transient.frames === 1)).toBe(true);
  });

  test('a flash only on the drop or a bar downbeat held 0.4 s — never on a shorter cut', () => {
    for (const bpm of TEMPI)
      for (const preset of PRESETS) {
        const each = plan({ ...preset, beat: beatAt(bpm), bars: 8 });
        const eachAt = starts(each.cuts);
        const drop = dropFrameOf(each, preset.pacing, 8, bpm);
        for (const flash of of('flash', each)) {
          expect(flash.frames).toBe(1);
          const index = eachAt.indexOf(flash.atFrame);
          expect(index).toBeGreaterThan(0);
          const seconds = each.cuts[index].frames / each.fps;
          expect(flash.atFrame === drop || seconds >= 0.4 - 1e-9).toBe(true);
          if (flash.atFrame !== drop)
            expect(offTick(flash.atFrame, bpm, each.fps)).toBeLessThanOrEqual(0.5 + 1e-9);
        }
      }
    // The build's drop flashes.
    expect(of('flash').map((transient) => transient.atFrame)).toContain(288);
  });

  test('a punch on every cut of 0.2 s or longer, 6 frames at most', () => {
    const punchedCuts = new Set(of('punch').map((transient) => transient.atFrame));
    made.cuts.forEach((cut, index) => {
      if (cut.frames / made.fps >= 0.2) expect(punchedCuts.has(at[index])).toBe(true);
    });
    expect(of('punch').every((transient) => transient.frames <= 6)).toBe(true);
  });

  test('ladder rungs under 0.4 s carry nothing but a punch; the build never shifts RGB', () => {
    for (const bpm of TEMPI)
      for (const bars of [4, 8, 16]) {
        const built = plan({ pacing: 'build', beat: beatAt(bpm), bars });
        const builtAt = starts(built.cuts);
        const drop = dropFrameOf(built, 'build', bars, bpm);
        expect(of('rgb-shift', built)).toEqual([]);
        for (const transient of built.transients) {
          // The drop is the hit after the ladder: it flashes even where the grid makes it 0.375 s.
          if (transient.atFrame === drop) continue;
          const index = builtAt.findLastIndex((frame) => frame <= transient.atFrame);
          if (built.cuts[index].frames / built.fps < 0.4 - 1e-9 && transient.kind !== 'punch')
            expect(`${transient.kind} at ${transient.atFrame}`).toBe('a punch');
        }
      }
  });

  test('an RGB shift spans exactly each stutter burst, and nothing else', () => {
    for (const bpm of TEMPI) {
      const stutter = plan({ pacing: 'stutter', beat: beatAt(bpm), bars: 8 });
      const stutterAt = starts(stutter.cuts);
      for (const shift of of('rgb-shift', stutter)) {
        const first = stutterAt.indexOf(shift.atFrame);
        const last = stutterAt.indexOf(shift.atFrame + shift.frames) - 1;
        const inside = stutter.cuts.slice(first, last < 0 ? undefined : last + 1);
        expect(first).toBeGreaterThan(0);
        expect(inside.every((cut) => cut.rung === 0.05)).toBe(true);
        expect(stutter.cuts[first - 1].rung).toBe(0.4);
      }
      expect(of('rgb-shift', plan({ rung: 0.05, beat: beatAt(bpm), bars: 2 }))).toEqual([]);
    }
  });

  test('on-beat pulses inside held cuts, and only the kinds the edit asked for', () => {
    const held = plan({ rung: 1, bars: 4, transients: ['shake'] });
    expect(held.transients.length).toBeGreaterThan(0);
    expect(held.transients.every((transient) => transient.kind === 'shake')).toBe(true);
    expect(plan({ rung: 1, transients: [] }).transients).toEqual([]);
    // An RGB shift never pulses on a beat: it belongs to the bursts.
    expect(plan({ rung: 1, bars: 4, transients: ['rgb-shift'] }).transients).toEqual([]);
  });

  test('every transient sits inside the montage', () => {
    for (const preset of PRESETS) {
      const each = plan({ ...preset, bars: 8 });
      for (const transient of each.transients)
        expect(transient.atFrame + transient.frames).toBeLessThanOrEqual(each.frames);
    }
  });
});

/** The same footage with the spoken takes as the presenter and the packshot as the product. */
const ROLED: CutPlanInput['sources'] = SOURCES.map((source) =>
  source.id.startsWith('talk')
    ? { ...source, role: 'presenter' as const }
    : source.still
      ? { ...source, role: 'product' as const }
      : source,
);
const TOKENS = ['$12', 'EASY FIT'];

describe('burst type', () => {
  /** Beat frames at the planner's rounding: beat b spans [beatFrame(b), beatFrame(b + 1)). */
  const beatFrame = (beat: number, bpm: number, fps: number) =>
    Math.round((beat * 60 * fps) / bpm + 1e-9);

  test('no tokens, no type: the plan is the one it always was', () => {
    for (const preset of PRESETS) {
      const made = plan(preset);
      expect('type' in made).toBe(false);
      const { type: _type, ...withType } = plan({ ...preset, tokens: TOKENS });
      expect(withType).toEqual(made);
    }
  });

  test('a token lands on a beat and holds whole beats, only where every cut is 0.2 s or faster', () => {
    let beats = 0;
    for (const bpm of TEMPI)
      for (const preset of PRESETS)
        for (const bars of [4, 8]) {
          const made = plan({ ...preset, beat: beatAt(bpm), bars, tokens: TOKENS });
          const at = starts(made.cuts);
          const grid = Array.from({ length: bars * 4 + 1 }, (_, beat) =>
            beatFrame(beat, bpm, made.fps),
          );
          for (const word of made.type ?? []) {
            const first = grid.indexOf(word.atFrame);
            const last = grid.indexOf(word.atFrame + word.frames);
            expect(first).toBeGreaterThanOrEqual(0);
            expect(last).toBeGreaterThan(first);
            beats += last - first;
            // Every cut under the word is a fast rung: never over a held shot.
            made.cuts.forEach((cut, index) => {
              if (at[index] < word.atFrame + word.frames && at[index] + cut.frames > word.atFrame)
                expect(cut.rung).toBeLessThanOrEqual(0.2);
            });
          }
          if (!made.cuts.some((cut) => cut.rung <= 0.2)) expect(made.type).toEqual([]);
        }
    expect(beats).toBeGreaterThan(300);
  });

  test('stutter: the type covers exactly each burst beat, one token per beat in turn', () => {
    const made = plan({ pacing: 'stutter', bars: 8, tokens: TOKENS });
    const shifts = made.transients.filter((transient) => transient.kind === 'rgb-shift');
    const burstFrames = shifts.reduce((sum, shift) => sum + shift.frames, 0);
    expect((made.type ?? []).reduce((sum, word) => sum + word.frames, 0)).toBe(burstFrames);
    for (const shift of shifts)
      expect(made.type?.some((word) => word.atFrame === shift.atFrame)).toBe(true);
    // One token per beat: a 24-frame beat at 150 BPM and 60 fps, alternating.
    expect(made.type?.every((word) => word.frames === 24)).toBe(true);
    made.type?.forEach((word, index) => {
      expect(word.text).toBe(TOKENS[index % TOKENS.length]);
    });
  });

  test('build: the beats from the 0.2 s rung to the drop; drop-hit: the drop bar', () => {
    const build = plan({ pacing: 'build', bars: 4, tokens: TOKENS });
    const ramp = buildRamp(build, 4, 150);
    const last = build.type?.at(-1);
    expect(last && last.atFrame + last.frames).toBe(ramp.drop);
    expect(build.type?.length).toBeGreaterThanOrEqual(3);
    const dropHit = plan({ pacing: 'drop-hit', bars: 4, tokens: TOKENS });
    const hit = dropFrameOf(dropHit, 'drop-hit', 4, 150);
    // The drop's first beat may hold the packshot, so the type may start a beat later.
    expect(dropHit.type?.[0]?.atFrame).toBeGreaterThanOrEqual(hit);
    expect(
      (dropHit.type ?? []).every((word) => word.atFrame + word.frames <= hit + dropHit.fps * 1.6),
    ).toBe(true);
  });

  test('one token holds the burst whole; the type never covers a still', () => {
    const made = plan({ pacing: 'stutter', bars: 8, tokens: ['$12'] });
    expect(made.type?.every((word) => word.text === '$12' && word.frames >= 24)).toBe(true);
    for (const bpm of TEMPI)
      for (const preset of PRESETS) {
        const placed = plan({ ...preset, beat: beatAt(bpm), sources: ROLED, tokens: TOKENS });
        const at = starts(placed.cuts);
        placed.cuts.forEach((cut, index) => {
          if (cut.sourceId !== 'packshot') return;
          for (const word of placed.type ?? [])
            expect(
              at[index] >= word.atFrame + word.frames || at[index] + cut.frames <= word.atFrame,
            ).toBe(true);
        });
      }
  });

  test('a token longer than the type allows is refused by the schema', () => {
    expect(
      cutPlanInputSchema.safeParse({
        beat: beatAt(150),
        bars: 4,
        pacing: 'build',
        sources: SOURCES,
        transients: [],
        tokens: ['THIS IS NOT A WORD'],
      }).success,
    ).toBe(false);
  });
});

describe('product and presenter on the fast rungs', () => {
  test('with roles, every 0.05–0.2 s cut draws the product or the presenter; b-roll keeps the long rungs', () => {
    for (const preset of [
      { pacing: 'build' },
      { pacing: 'stutter' },
      { pacing: 'drop-hit' },
    ] as const) {
      const made = plan({ ...preset, sources: ROLED });
      const role = (id: string) => ROLED.find((source) => source.id === id)?.role;
      const fast = made.cuts.filter((cut) => cut.rung <= 0.2);
      expect(fast.length).toBeGreaterThan(0);
      expect(fast.every((cut) => role(cut.sourceId) !== undefined)).toBe(true);
      expect(made.cuts.some((cut) => cut.rung >= 0.4 && role(cut.sourceId) === undefined)).toBe(
        true,
      );
    }
  });

  test('every cut rule holds with roles: no repeat, the in-point jump, no long cut from speech', () => {
    for (const bpm of TEMPI)
      for (const preset of PRESETS) {
        const made = plan({ ...preset, beat: beatAt(bpm), bars: 8, sources: ROLED });
        const lastIn = new Map<string, number>();
        made.cuts.forEach((cut, index) => {
          if (index > 0) expect(cut.sourceId).not.toBe(made.cuts[index - 1].sourceId);
          const source = ROLED.find((candidate) => candidate.id === cut.sourceId);
          if (!source || source.still) {
            expect(cut.rung).toBeGreaterThanOrEqual(0.2);
            return;
          }
          const previous = lastIn.get(cut.sourceId);
          if (previous !== undefined)
            expect(Math.abs(cut.inSec - previous)).toBeGreaterThanOrEqual(0.5 - 1e-9);
          lastIn.set(cut.sourceId, cut.inSec);
          const seconds = cut.frames / made.fps;
          if (seconds >= 0.4)
            for (const speech of source.speech)
              expect(
                cut.inSec >= speech.endSec - 1e-9 || cut.inSec + seconds <= speech.startSec + 1e-9,
              ).toBe(true);
        });
      }
  });

  test('one featured source alternates with b-roll rather than repeat itself', () => {
    const one = SOURCES.map((source) =>
      source.id === 'talk-a' ? { ...source, role: 'presenter' as const } : source,
    );
    const fast = plan({ pacing: 'build', sources: one }).cuts.filter((cut) => cut.rung <= 0.2);
    const featured = fast.filter((cut) => cut.sourceId === 'talk-a').length;
    expect(featured).toBeGreaterThanOrEqual(Math.floor(fast.length / 2));
  });
});

test('a rung outside the ladder is refused by the schema', () => {
  expect(
    cutPlanInputSchema.safeParse({
      beat: beatAt(150),
      bars: 4,
      pacing: 'steady',
      rung: 0.3 as CutRungSec,
      sources: SOURCES,
      transients: [],
    }).success,
  ).toBe(false);
});
