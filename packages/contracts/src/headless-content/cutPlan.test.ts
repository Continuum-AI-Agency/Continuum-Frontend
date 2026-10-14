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

  test('appears as 60/48/36/24/12/6/3 frames, slowest first, the same count at each rung', () => {
    expect(made.fps).toBe(60);
    const rows = new Map<number, number[]>();
    // The first cut also holds the opening until the ladder starts (the head before 63 ticks).
    const ladder = made.cuts.slice(
      0,
      made.cuts.findIndex(
        (cut, index) => index > 0 && cut.rung === 0.4 && made.cuts[index - 1].rung === 0.05,
      ),
    );
    ladder
      .slice(1)
      .forEach((cut) => rows.set(cut.rung, [...(rows.get(cut.rung) ?? []), cut.frames]));
    expect(ladder[0].rung).toBe(1);
    expect(ladder[0].frames).toBeGreaterThanOrEqual(60);
    for (const rung of CUT_RUNGS_SEC)
      for (const frames of rows.get(rung) ?? []) expect(frames).toBe(ladderFrames[rung]);
    const rungsInOrder = ladder
      .map((cut) => cut.rung)
      .filter((rung, index, all) => all.indexOf(rung) === index);
    expect(rungsInOrder).toEqual([...CUT_RUNGS_SEC]);
    const counts = CUT_RUNGS_SEC.map((rung) => ladder.filter((cut) => cut.rung === rung).length);
    expect(new Set(counts).size).toBe(1);
  });

  test('lands exactly on the drop bar line, then 0.4 on the beats', () => {
    const at = starts(made.cuts);
    const lastFast = made.cuts.map((cut) => cut.rung).lastIndexOf(0.05);
    const dropFrame = at[lastFast] + made.cuts[lastFast].frames;
    expect(dropFrame % 96).toBe(0); // a bar at 150 BPM, 60 fps
    expect(dropFrame).toBeGreaterThan(0);
    const tail = made.cuts.slice(lastFast + 1);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((cut) => cut.rung === 0.4 && cut.frames === 24)).toBe(true);
  });

  test('a longer montage climbs the ladder more than once per rung', () => {
    const long = plan({ pacing: 'build', bars: 8 });
    expect(long.cuts.filter((cut) => cut.rung === 0.6).length).toBeGreaterThan(1);
  });

  test('with an energy arc the ladder lands on the biggest rise on a downbeat', () => {
    // 6 bars of 4 beats; the energy jumps at bar 4's downbeat (beat 16).
    const energy = Array.from({ length: 24 }, (_, index) => (index >= 16 ? 1 : 0.3));
    const dropped = plan({ pacing: 'build', bars: 6, beat: beatAt(150, energy) });
    const at = starts(dropped.cuts);
    const lastFast = dropped.cuts.map((cut) => cut.rung).lastIndexOf(0.05);
    expect(at[lastFast] + dropped.cuts[lastFast].frames).toBe(4 * 96);
  });
});

describe('the other presets', () => {
  test('stutter: a base of 0.4 with a 0.05 burst on the last beat of every second bar', () => {
    const made = plan({ pacing: 'stutter', bars: 4 });
    const at = starts(made.cuts);
    const burst = made.cuts
      .map((cut, index) => ({ cut, at: at[index] }))
      .filter(({ cut }) => cut.rung === 0.05);
    // At 150 BPM 0.05 s is one tick: 8 cuts of 3 frames on the last beat of bars 2 and 4.
    expect(burst.map(({ at: frame }) => frame)).toEqual([
      ...Array.from({ length: 8 }, (_, index) => 168 + index * 3),
      ...Array.from({ length: 8 }, (_, index) => 360 + index * 3),
    ]);
    expect(
      made.cuts
        .filter((cut) => cut.rung !== 0.05)
        .every((cut) => cut.rung === 0.4 && cut.frames === 24),
    ).toBe(true);
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

describe('cut-synced transients', () => {
  const made = plan({ pacing: 'build', bars: 4 });
  const at = starts(made.cuts);
  const of = (kind: string) => made.transients.filter((transient) => transient.kind === kind);

  test('a flash on bar-downbeat cuts of 0.4 s or longer, never on the join from the hook', () => {
    const steady = plan({ bars: 4 });
    const steadyAt = starts(steady.cuts);
    const flashes = steady.transients
      .filter((transient) => transient.kind === 'flash')
      .map((transient) => transient.atFrame);
    expect(flashes).toEqual([48, 96, 144]); // bars 2–4 at 30 fps; bar 1 is the join
    expect(flashes.every((frame) => steadyAt.includes(frame))).toBe(true);
    expect(
      steady.transients
        .filter((transient) => transient.kind === 'flash')
        .every((transient) => transient.frames === 2),
    ).toBe(true);
  });

  test('a punch on every cut of 0.2 s or longer, 6 frames at most', () => {
    const punchedCuts = new Set(of('punch').map((transient) => transient.atFrame));
    made.cuts.forEach((cut, index) => {
      if (cut.frames / made.fps >= 0.2) expect(punchedCuts.has(at[index])).toBe(true);
    });
    expect(of('punch').every((transient) => transient.frames <= 6)).toBe(true);
  });

  test('an rgb shift across each burst of 0.1 s cuts and faster', () => {
    const [shift] = of('rgb-shift');
    const firstFast = made.cuts.findIndex((cut) => cut.rung <= 0.1);
    const lastFast = made.cuts.map((cut) => cut.rung <= 0.1).lastIndexOf(true);
    expect(shift.atFrame).toBe(at[firstFast]);
    expect(shift.atFrame + shift.frames).toBe(at[lastFast] + made.cuts[lastFast].frames);
  });

  test('on-beat pulses inside held cuts, and only the kinds the edit asked for', () => {
    const held = plan({ rung: 1, bars: 4, transients: ['shake'] });
    expect(held.transients.length).toBeGreaterThan(0);
    expect(held.transients.every((transient) => transient.kind === 'shake')).toBe(true);
    expect(plan({ rung: 1, transients: [] }).transients).toEqual([]);
  });

  test('every transient sits inside the montage', () => {
    for (const preset of PRESETS) {
      const each = plan({ ...preset, bars: 8 });
      for (const transient of each.transients)
        expect(transient.atFrame + transient.frames).toBeLessThanOrEqual(each.frames);
    }
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
