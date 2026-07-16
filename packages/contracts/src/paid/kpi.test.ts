import { describe, expect, it } from 'bun:test';
import { kpiFieldForOptimizationGoal } from './kpi';

describe('kpiFieldForOptimizationGoal', () => {
  it('maps declared Meta goals to optimizer metrics', () => {
    expect(kpiFieldForOptimizationGoal('LEAD_GENERATION')).toBe('leads');
    expect(kpiFieldForOptimizationGoal('LANDING_PAGE_VIEWS')).toBe('landingPageViews');
    expect(kpiFieldForOptimizationGoal('OFFSITE_CONVERSIONS', 'onsite_conversion.lead')).toBe(
      'leads',
    );
  });

  it('does not invent a metric for unsupported or attention-only goals', () => {
    expect(kpiFieldForOptimizationGoal('REACH')).toBeUndefined();
    expect(kpiFieldForOptimizationGoal(undefined)).toBeUndefined();
  });
});
