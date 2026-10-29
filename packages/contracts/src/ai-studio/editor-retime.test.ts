import { expect, test } from 'bun:test';
import { editorClipRateAt, editorClipSourceAt, editorClipSourceSpan } from './editor-clip-edits';
import {
  editorClipTimeRemap,
  freezeRemap,
  mirrorRemap,
  punchReleaseKeyframes,
  reverseRangeIssue,
  speedRampRemap,
} from './editor-retime';

const plain = { durationSec: 6, sourceInSec: 10, playbackRate: 1 };
const asClip = (retimed: { timeRemap: unknown; durationSec: number }) => ({
  durationSec: retimed.durationSec,
  timeRemap: retimed.timeRemap as NonNullable<
    Parameters<typeof editorClipSourceAt>[0]['timeRemap']
  >,
});

test('a 100% -> 20% -> 100% ramp slows exactly the hit and lengthens the clip by the integral of 1/speed', () => {
  const ramp = speedRampRemap(
    plain,
    [
      { t: 0, rate: 1 },
      { t: 2, rate: 1 },
      { t: 2.5, rate: 0.2 },
      { t: 3.5, rate: 0.2 },
      { t: 4, rate: 1 },
    ],
    'smooth',
  );
  // 1 s at 20% = 5 s, 2 s + 2 s at normal, and two 0.5 s smoothstep ramps between 1 and 0.2
  // that each take a little over a second (the average of 1/speed is ~2.3 there).
  expect(ramp.durationSec).toBeGreaterThan(9 + 2 * 0.5);
  expect(ramp.durationSec).toBeCloseTo(11.2, 0);
  const clip = asClip(ramp);
  // Whole source span is still played, start to end, forward.
  expect(editorClipSourceSpan(clip)).toEqual({ startSec: 10, endSec: 16 });
  expect(editorClipSourceAt(clip, 0)).toBe(10);
  expect(editorClipSourceAt(clip, ramp.durationSec)).toBe(16);
  // Normal speed on both sides, 20% in the middle.
  expect(editorClipRateAt(clip, 1)).toBeCloseTo(1, 6);
  expect(editorClipRateAt(clip, 4.0)).toBeCloseTo(0.2, 1);
  expect(editorClipRateAt(clip, ramp.durationSec - 0.5)).toBeCloseTo(1, 6);
  // Monotone: the picture never runs backwards on a forward ramp.
  const times = ramp.timeRemap.map((point) => point.timeSec);
  expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
  expect(ramp.timeRemap.at(-1)?.timeSec).toBe(ramp.durationSec);
  // The old clock maps onto the new: before the hit nothing moves, after it everything shifts.
  expect(ramp.mapLocal(1.5)).toBeCloseTo(1.5, 6);
  expect(ramp.mapLocal(6)).toBe(ramp.durationSec);
  expect(ramp.mapLocal(5)).toBeCloseTo(ramp.durationSec - 1, 6);
});

test('constant keys give exact straight segments and a plain 2x ramp halves the clip', () => {
  const fast = speedRampRemap(plain, [{ t: 0, rate: 2 }], 'linear');
  expect(fast.durationSec).toBe(3);
  expect(fast.timeRemap).toHaveLength(2);
  expect(editorClipSourceAt(asClip(fast), 1.5)).toBe(13);
});

test('a ramp composes with the clip it is applied to, and refuses keys outside it', () => {
  const doubled = { durationSec: 3, sourceInSec: 10, playbackRate: 2 };
  const ramp = speedRampRemap(doubled, [{ t: 0, rate: 0.5 }]);
  // 0.5x of a 2x clip is 1x: the same 6 source seconds take 6 s.
  expect(ramp.durationSec).toBe(6);
  expect(() => speedRampRemap(plain, [{ t: 7, rate: 1 }])).toThrow('inside the clip');
  expect(() =>
    speedRampRemap(plain, [
      { t: 1, rate: 1 },
      { t: 1, rate: 2 },
    ]),
  ).toThrow('apart');
});

test('freezing holds one source frame for the hold, and every other frame is where it was', () => {
  const freeze = freezeRemap(plain, 2, 1.5);
  expect(freeze.durationSec).toBe(7.5);
  const clip = asClip(freeze);
  expect(editorClipSourceAt(clip, 1.99)).toBeCloseTo(11.99, 6);
  for (const t of [2, 2.7, 3.49]) expect(editorClipSourceAt(clip, t)).toBeCloseTo(12, 6);
  expect(editorClipRateAt(clip, 3)).toBe(0);
  expect(editorClipSourceAt(clip, 3.5)).toBeCloseTo(12, 6);
  expect(editorClipSourceAt(clip, 4.5)).toBeCloseTo(13, 6);
  expect(freeze.heldSourceSec).toBe(12);
  expect(freeze.mapLocal(1)).toBe(1);
  expect(freeze.mapLocal(4)).toBe(5.5);
  // At the head and at the tail too.
  expect(
    freezeRemap(plain, 0, 1)
      .timeRemap.slice(0, 2)
      .map((p) => p.sourceSec),
  ).toEqual([10, 10]);
  expect(freezeRemap(plain, 6, 1).timeRemap.at(-1)).toMatchObject({ sourceSec: 16, timeSec: 7 });
  expect(() => freezeRemap(plain, 7, 1)).toThrow('inside the clip');
  expect(() => speedRampRemap(clip, [{ t: 0, rate: 1 }])).not.toThrow(); // a hold is a flat linear segment
});

test('a freeze inside a ramp keeps the ramp on both sides', () => {
  const ramp = speedRampRemap(plain, [
    { t: 0, rate: 1 },
    { t: 3, rate: 0.5 },
    { t: 6, rate: 1 },
  ]);
  const freeze = freezeRemap(
    { ...plain, durationSec: ramp.durationSec, timeRemap: ramp.timeRemap },
    3,
    1,
  );
  const frozen = asClip(freeze);
  const original = asClip(ramp);
  for (const t of [0.5, 2, 2.9])
    expect(editorClipSourceAt(frozen, t)).toBeCloseTo(editorClipSourceAt(original, t), 6);
  for (const t of [3.2, 4, 5])
    expect(editorClipSourceAt(frozen, t + 1)).toBeCloseTo(editorClipSourceAt(original, t), 6);
});

test('mirroring a curve plays the same frames backwards', () => {
  const ramp = speedRampRemap(plain, [
    { t: 0, rate: 1 },
    { t: 3, rate: 0.4 },
    { t: 6, rate: 1 },
  ]);
  const mirrored = {
    durationSec: ramp.durationSec,
    timeRemap: mirrorRemap(ramp.timeRemap, ramp.durationSec),
  };
  const forward = asClip(ramp);
  for (const t of [0, 1, 3.3, 5, ramp.durationSec])
    expect(editorClipSourceAt(mirrored, t)).toBeCloseTo(
      editorClipSourceAt(forward, ramp.durationSec - t),
      5,
    );
  expect(mirrored.timeRemap[0].timeSec).toBe(0);
  expect(mirrored.timeRemap.at(-1)?.timeSec).toBe(ramp.durationSec);
  expect(() =>
    mirrorRemap(
      freezeRemap(plain, 1, 1).timeRemap.map((p, i) =>
        i === 1 ? { ...p, interpolation: 'hold' as const } : p,
      ),
      7,
    ),
  ).toThrow('frozen hold');
  expect(editorClipTimeRemap(plain)).toEqual([
    { timeSec: 0, sourceSec: 10, interpolation: 'linear' },
    { timeSec: 6, sourceSec: 16, interpolation: 'linear' },
  ]);
});

test('reversing takes both ends of a range or none', () => {
  expect(reverseRangeIssue({})).toBeUndefined();
  expect(reverseRangeIssue({ fromSec: 1, toSec: 2 })).toBeUndefined();
  expect(reverseRangeIssue({ fromSec: 1 })).toContain('both');
  expect(reverseRangeIssue({ toSec: 1 })).toContain('both');
  expect(reverseRangeIssue({ fromSec: 2, toSec: 1 })).toContain('after');
});

test('a punch that releases rises, holds, and rests exactly where the clip rests', () => {
  const keys = punchReleaseKeyframes({
    base: { scaleX: 1.2, scaleY: 1.2 },
    startSec: 2,
    idPrefix: 'p',
    amount: 1.3,
    holdSec: 0.2,
    releaseSec: 0.4,
  });
  const x = keys.filter((key) => key.property === 'transform.scaleX');
  expect(x.map((key) => key.timeSec)).toEqual([2, 2.12, 2.32, 2.72]);
  expect(x.map((key) => key.value)).toEqual([1.2, 1.56, 1.56, 1.2]);
  expect(keys).toHaveLength(8);
  expect(new Set(keys.map((key) => key.id)).size).toBe(8);
  const defaults = punchReleaseKeyframes({
    base: { scaleX: 1, scaleY: 1 },
    startSec: 0,
    idPrefix: 'd',
  });
  expect(
    defaults.filter((key) => key.property === 'transform.scaleY').map((key) => key.value),
  ).toEqual([1, 1.15, 1.15, 1]);
});
