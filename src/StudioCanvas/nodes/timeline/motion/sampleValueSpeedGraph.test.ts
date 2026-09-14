import { describe, expect, test } from 'bun:test';
import type { EditorKeyframe } from '@continuum/contracts';
import { sampleValueSpeedGraph } from './sampleValueSpeedGraph';

const keys: EditorKeyframe[] = [
  {
    id: 'a',
    property: 'transform.opacity',
    timeSec: 0,
    value: 0,
    interpolation: 'linear',
  },
  {
    id: 'b',
    property: 'transform.opacity',
    timeSec: 1,
    value: 1,
    interpolation: 'linear',
  },
];

describe('sampleValueSpeedGraph', () => {
  test('plots value and a constant speed on a linear ramp', () => {
    const points = sampleValueSpeedGraph(keys, 1, 0, 5);
    expect(points).toHaveLength(5);
    expect(points[0]?.value).toBeCloseTo(0);
    expect(points[4]?.value).toBeCloseTo(1);
    expect(points[2]?.speed).toBeCloseTo(1, 5);
  });

  test('reads position x when the track is a vector', () => {
    const points = sampleValueSpeedGraph(
      [
        {
          id: 'p0',
          property: 'transform.position',
          timeSec: 0,
          value: { x: 0.2, y: 0.5 },
          interpolation: 'linear',
        },
        {
          id: 'p1',
          property: 'transform.position',
          timeSec: 2,
          value: { x: 0.8, y: 0.5 },
          interpolation: 'linear',
        },
      ],
      2,
      0.5,
      3,
    );
    expect(points[0]?.value).toBeCloseTo(0.2);
    expect(points[2]?.value).toBeCloseTo(0.8);
  });
});
