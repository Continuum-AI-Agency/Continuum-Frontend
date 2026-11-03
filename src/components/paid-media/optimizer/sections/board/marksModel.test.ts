import { describe, expect, it } from 'bun:test';
import {
  bulletScale,
  divergingColor,
  goalDistanceLabel,
  goalSide,
  pctAgainstGoal,
  ringFraction,
  trendGeometry,
} from './marksModel';

describe('a cost against its goal', () => {
  // Easy Fit, Oct 31: Conversaciones Whatsapp at $41.20 against $45; Tours booked at $418.74
  // against $296 (the adaptive page's real reads).
  it('reads the side, the distance and the words', () => {
    expect(goalSide(41.2, 45)).toBe('below');
    expect(goalSide(418.74, 296)).toBe('above');
    expect(goalSide(45.5, 45)).toBe('at');
    expect(goalSide(null, 45)).toBe('none');
    expect(goalSide(41.2, null)).toBe('none');
    expect(pctAgainstGoal(418.74, 296)).toBe(41);
    expect(goalDistanceLabel(41.2, 45)).toBe('8% under goal');
    expect(goalDistanceLabel(418.74, 296)).toBe('41% over goal');
    expect(goalDistanceLabel(45, 45)).toBe('On goal');
    expect(goalDistanceLabel(null, 45)).toBe('');
  });

  it('paints below in the below tone, above in the above tone, and no goal in the mid tone', () => {
    expect(divergingColor(41.2, 45)).toContain('var(--board-below)');
    expect(divergingColor(418.74, 296)).toContain('var(--board-above)');
    expect(divergingColor(41.2, null)).toBe('var(--board-mid)');
    expect(divergingColor(45, 45)).toBe('var(--board-mid)');
    // Twice the goal is the full colour; a small miss never fades under 45%.
    expect(divergingColor(600, 296)).toContain('100%');
    expect(divergingColor(310, 296)).toContain('49%');
    // Inside 2% of the goal is on it.
    expect(divergingColor(300, 296)).toBe('var(--board-mid)');
  });
});

describe('the bullet scale', () => {
  it('ends the track a quarter past the larger mark', () => {
    const scale = bulletScale(41.2, 45);
    expect(scale.max).toBeCloseTo(56.25);
    expect(scale.goalPct).toBeCloseTo(80);
    expect(scale.valuePct).toBeCloseTo(73.24, 1);
    expect(scale.clipped).toBe(false);
  });

  // Vivo 47's PMax, Oct 31: $3,283 per conversion against a $400 target.
  it('caps the track at three goals and pins a runaway value at its end', () => {
    const scale = bulletScale(3283, 400);
    expect(scale.max).toBe(1200);
    expect(scale.goalPct).toBeCloseTo(33.33, 1);
    expect(scale.valuePct).toBe(100);
    expect(scale.clipped).toBe(true);
  });

  it('draws the value alone when there is no goal', () => {
    const scale = bulletScale(73.86, null);
    expect(scale.goalPct).toBeNull();
    expect(scale.valuePct).toBeCloseTo(80);
  });
});

describe('the ring', () => {
  it('fills the share and never past full', () => {
    // 199 tours of the 282 the spend buys at the $296 goal.
    expect(ringFraction(199, 282)).toBeCloseTo(0.7057, 3);
    expect(ringFraction(400, 282)).toBe(1);
    expect(ringFraction(0, 282)).toBe(0);
    expect(ringFraction(5, 0)).toBe(0);
  });
});

describe('the trend line', () => {
  const points = [
    { day: '2026-10-01', value: 40 },
    { day: '2026-10-02', value: null },
    { day: '2026-10-03', value: 50 },
    { day: '2026-10-04', value: 45 },
  ];

  it('breaks the line at a day without a figure and keeps the goal inside the range', () => {
    const geometry = trendGeometry(points, 60, 300, 100);
    expect(geometry.line.match(/M/g)?.length).toBe(2);
    expect(geometry.goalY).not.toBeNull();
    expect(geometry.goalY as number).toBeGreaterThanOrEqual(0);
    expect(geometry.high).toBeGreaterThan(60);
    expect(geometry.last).toEqual({ x: 300, y: expect.any(Number), value: 45 });
  });

  it('draws nothing but keeps a range when no day has a figure', () => {
    const geometry = trendGeometry([{ day: '2026-10-01', value: null }], null, 300, 100);
    expect(geometry.line).toBe('');
    expect(geometry.last).toBeNull();
    expect(geometry.goalY).toBeNull();
  });
});
