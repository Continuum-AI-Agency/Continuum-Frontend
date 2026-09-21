import { describe, expect, it } from 'bun:test';
import { paidDeltaIsGood, paidMetricFallsAreGood } from './metricDelta';

describe('paidMetricFallsAreGood', () => {
  it('claims the cost family and nothing else', () => {
    for (const metric of ['cpa', 'cpc', 'cpm', 'CPA', 'CPC', 'Cost per result']) {
      expect(paidMetricFallsAreGood(metric)).toBe(true);
    }
    for (const metric of ['spend', 'roas', 'ctr', 'impressions', 'clicks', 'ROAS']) {
      expect(paidMetricFallsAreGood(metric)).toBe(false);
    }
  });
});

describe('paidDeltaIsGood', () => {
  it('reads a rising ROAS as good and a falling one as a problem', () => {
    expect(paidDeltaIsGood('roas', 12)).toBe(true);
    expect(paidDeltaIsGood('roas', -12)).toBe(false);
  });

  it('reads a FALLING cost as good — the defect this exists to fix', () => {
    expect(paidDeltaIsGood('cpa', -12)).toBe(true);
    expect(paidDeltaIsGood('cpa', 12)).toBe(false);
    expect(paidDeltaIsGood('cpc', -3)).toBe(true);
    expect(paidDeltaIsGood('cpc', 3)).toBe(false);
  });

  it('keeps a zero change on the good side, exactly as `delta >= 0` did', () => {
    // The only thing that changes at these call sites is the polarity of the cost family;
    // a flat window must not start rendering red because the test moved to `> 0`.
    expect(paidDeltaIsGood('roas', 0)).toBe(true);
    expect(paidDeltaIsGood('cpa', 0)).toBe(true);
  });
});
