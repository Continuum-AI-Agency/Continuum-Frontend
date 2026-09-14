import { describe, expect, test } from 'bun:test';
import { motionPathPoints } from './motionPath';

describe('motionPathPoints', () => {
  test('returns an empty path without two position keys', () => {
    expect(
      motionPathPoints({
        durationSec: 1,
        transform: { position: { x: 0.5, y: 0.5 } },
        keyframes: [],
      }),
    ).toEqual([]);
  });

  test('samples a linear move from left to centre', () => {
    const points = motionPathPoints(
      {
        durationSec: 1,
        transform: { position: { x: 0.5, y: 0.5 } },
        keyframes: [
          {
            id: 'a',
            property: 'transform.position',
            timeSec: 0,
            value: { x: 0.2, y: 0.5 },
            interpolation: 'linear',
          },
          {
            id: 'b',
            property: 'transform.position',
            timeSec: 1,
            value: { x: 0.8, y: 0.5 },
            interpolation: 'linear',
          },
        ],
      },
      2,
    );
    expect(points[0]).toEqual({ x: 0.2, y: 0.5 });
    expect(points[1]?.x).toBeCloseTo(0.5);
    expect(points[2]).toEqual({ x: 0.8, y: 0.5 });
  });
});
