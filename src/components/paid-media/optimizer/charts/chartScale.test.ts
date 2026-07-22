import { describe, expect, it } from 'bun:test';

import { ciUpperBound, cpaHeatFill, maxCiUpperBound, pct } from './chartScale';

const item = (ci: { cpa?: number | null; hi?: number | null } | null) => ({
  diagnostics: ci === null ? null : { ci },
});

describe('ciUpperBound', () => {
  it('prefers the interval upper bound over the point estimate', () => {
    expect(ciUpperBound(item({ cpa: 40, hi: 120 }))).toBe(120);
  });

  it('falls back to the point estimate when no upper bound was computed', () => {
    expect(ciUpperBound(item({ cpa: 40 }))).toBe(40);
  });

  it('returns null when the item carries no interval at all', () => {
    expect(ciUpperBound(item(null))).toBeNull();
    expect(ciUpperBound({})).toBeNull();
  });
});

describe('maxCiUpperBound', () => {
  // The regression this exists to prevent: scaling a row of CI bars by the
  // largest POINT ESTIMATE clips every whisker that runs past it, because pct()
  // clamps at 100. The widest interval — the ad set you must not fund — would
  // then render as the narrowest-looking one on screen.
  it('scales by the widest upper bound, not the largest point estimate', () => {
    const items = [item({ cpa: 40, hi: 60 }), item({ cpa: 50, hi: 300 })];
    expect(maxCiUpperBound(items)).toBe(300);

    const noisiest = items[1];
    const hi = ciUpperBound(noisiest) as number;
    expect(pct(hi, maxCiUpperBound(items))).toBe(100);
    // Under the old point-estimate denominator (50) this whisker clamped to 100
    // as well, making a 300 interval and a 60 interval indistinguishable.
    expect(pct(60, maxCiUpperBound(items))).toBeLessThan(100);
  });

  it('applies the objective denominator multiplier', () => {
    expect(maxCiUpperBound([item({ cpa: 2, hi: 5 })], 1000)).toBe(5000);
  });

  it('never returns 0, so callers can divide by it', () => {
    expect(maxCiUpperBound([])).toBe(1);
    expect(maxCiUpperBound([item({ cpa: 0, hi: 0 })])).toBe(1);
  });
});

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
