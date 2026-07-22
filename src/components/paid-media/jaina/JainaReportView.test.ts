import { describe, expect, it } from 'bun:test';

import { clampReportHeight } from './JainaReportView';

describe('clampReportHeight', () => {
  it('respects min and max bounds', () => {
    expect(clampReportHeight(120, 900)).toBe(320);
    expect(clampReportHeight(640, 900)).toBe(640);
    expect(clampReportHeight(1500, 900)).toBe(900);
  });

  it('guards invalid values', () => {
    expect(clampReportHeight(Number.NaN, 800)).toBe(320);
    expect(clampReportHeight(Number.POSITIVE_INFINITY, 800)).toBe(320);
  });
});
