import { describe, expect, it } from 'bun:test';

import { cpaHeatFill, pct } from './chartScale';

describe('pct', () => {
  it('returns 0 when max is non-positive', () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -1)).toBe(0);
  });

  it('scales value/max to a percentage', () => {
    expect(pct(5, 10)).toBe(50);
    expect(pct(2, 8)).toBe(25);
  });

  it('clamps to the 0–100 range', () => {
    expect(pct(20, 10)).toBe(100);
    expect(pct(-5, 10)).toBe(0);
  });
});

describe('cpaHeatFill', () => {
  it('returns transparent for no-data cells', () => {
    expect(cpaHeatFill(null)).toBe('transparent');
    expect(cpaHeatFill(undefined)).toBe('transparent');
    expect(cpaHeatFill(Number.NaN)).toBe('transparent');
  });

  it('mixes toward --success at the good (0) end', () => {
    const fill = cpaHeatFill(0);
    expect(fill).toContain('var(--success)');
    expect(fill).toContain('var(--destructive) 0%');
  });

  it('mixes toward --destructive at the bad (1) end', () => {
    expect(cpaHeatFill(1)).toContain('var(--destructive) 100%');
  });

  it('keeps a low-alpha tint so cell text stays readable', () => {
    const fill = cpaHeatFill(0.5);
    expect(fill).toContain('var(--destructive) 50%');
    expect(fill).toContain('18%, transparent');
  });

  it('clamps ratios outside 0–1', () => {
    expect(cpaHeatFill(2)).toContain('var(--destructive) 100%');
    expect(cpaHeatFill(-1)).toContain('var(--destructive) 0%');
  });

  it('never emits a hardcoded hsl/hex color', () => {
    const fill = cpaHeatFill(0.4);
    expect(fill).not.toMatch(/hsl\(/);
    expect(fill).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
