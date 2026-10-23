import { describe, expect, it } from 'bun:test';
import { framesAtSourceTimes, isRetimed, retimedClock, sourceSecAt } from './sourceClock';

const ramp = [
  { timeSec: 0, sourceSec: 10, interpolation: 'linear' as const },
  { timeSec: 1, sourceSec: 11, interpolation: 'linear' as const },
  { timeSec: 3, sourceSec: 11.4, interpolation: 'linear' as const },
  { timeSec: 4, sourceSec: 12.4, interpolation: 'linear' as const },
];

describe('retimedClock', () => {
  it('is absent for a plain forward clip, so it keeps the original range-and-speed path', () => {
    expect(isRetimed(undefined)).toBe(false);
    expect(isRetimed({ reverse: false, timeRemap: [] })).toBe(false);
    expect(retimedClock({ reverse: false, timeRemap: [] }, { startSec: 1 }, 4, 2)).toBeUndefined();
  });

  it('reverses the source span at the clip rate', () => {
    const clock = retimedClock({ reverse: true }, { startSec: 10 }, 4, 2);
    if (!clock) throw new Error('expected a clock');
    const range = { startSec: 10, endSec: 18 };
    expect(sourceSecAt(clock, 1, range)).toBe(16);
    // The first instant of a reverse is the stream's very end: keep it decodable.
    expect(sourceSecAt(clock, 0, range)).toBeCloseTo(17.999, 9);
    expect(sourceSecAt(clock, 4, range)).toBe(10);
  });

  it('follows a remap curve, ignoring rate and reverse beside it', () => {
    const clock = retimedClock({ reverse: true, timeRemap: ramp }, { startSec: 10 }, 4, 3);
    if (!clock) throw new Error('expected a clock');
    const range = { startSec: 10, endSec: 12.4 };
    expect(sourceSecAt(clock, 2, range)).toBeCloseTo(11.2, 9);
    // Slow in the middle: the 2 s between 1 s and 3 s cover only 0.4 s of source.
    expect(sourceSecAt(clock, 3, range) - sourceSecAt(clock, 1, range)).toBeCloseTo(0.4, 9);
  });
});

const fakeSink = () => {
  const asked: number[][] = [];
  return {
    asked,
    sink: {
      async *canvasesAtTimestamps(times: number[]) {
        asked.push(times);
        for (const time of times) yield `frame@${time}`;
      },
    },
  };
};
const collect = async (generator: AsyncGenerator<string | null>) => {
  const out: (string | null)[] = [];
  for await (const frame of generator) out.push(frame);
  return out;
};

describe('framesAtSourceTimes', () => {
  it('streams a forward run once and repeats a frame for a freeze', async () => {
    const { asked, sink } = fakeSink();
    const frames = await collect(framesAtSourceTimes(sink, [1, 1, 1, 1.5, 2, 2]));
    expect(frames).toEqual(['frame@1', 'frame@1', 'frame@1', 'frame@1.5', 'frame@2', 'frame@2']);
    expect(asked).toEqual([[1, 1.5, 2]]);
  });

  it('serves a reversed run in request order from ascending decodes of bounded chunks', async () => {
    const { asked, sink } = fakeSink();
    const times = Array.from({ length: 30 }, (_, index) => 3 - index * 0.1);
    const frames = await collect(framesAtSourceTimes(sink, times));
    expect(frames).toEqual(times.map((time) => `frame@${time}`));
    expect(asked).toHaveLength(3);
    for (const batch of asked) {
      expect(batch.length).toBeLessThanOrEqual(12);
      expect(batch).toEqual([...batch].sort((a, b) => a - b));
    }
  });
});
