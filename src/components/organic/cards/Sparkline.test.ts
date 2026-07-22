import { describe, expect, it } from 'bun:test';

import { sparklinePoints } from './Sparkline';

describe('sparklinePoints', () => {
  it('maps two or more points to a polyline string', () => {
    const geo = sparklinePoints([1, 4, 2, 8], 120, 28);
    expect(geo).not.toBeNull();
    expect(geo?.points.split(' ').length).toBe(4);
  });

  it('returns null for fewer than two points (flat baseline)', () => {
    expect(sparklinePoints([5], 120, 28)).toBeNull();
    expect(sparklinePoints([], 120, 28)).toBeNull();
  });

  it('ignores non-finite values', () => {
    const geo = sparklinePoints([1, Number.NaN, 3], 120, 28);
    expect(geo?.points.split(' ').length).toBe(2);
  });

  it('places the first point at x=0 and the last at full width', () => {
    const geo = sparklinePoints([10, 20, 30], 100, 28);
    expect(geo?.points.startsWith('0.00,')).toBe(true);
    expect(geo?.lastX).toBe(100);
  });
});
