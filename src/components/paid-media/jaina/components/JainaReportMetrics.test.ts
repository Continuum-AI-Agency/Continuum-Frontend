import { describe, expect, it } from 'bun:test';
import { getMetricChange, resolveMetricStatusColor } from './JainaReportMetrics';

describe('JainaReportMetrics helpers', () => {
  it('uses trend when change is absent', () => {
    const change = getMetricChange({
      metric: 'L7 ROAS',
      value: 0.97,
      trend: -30.7,
    } as any);

    expect(change).toBe(-30.7);
  });

  it('maps warning/success statuses to visible badge variants', () => {
    expect(resolveMetricStatusColor('warning', -2.5, true)).toBe('warning');
    expect(resolveMetricStatusColor('success', 1.2, true)).toBe('success');
  });

  it('falls back to numeric trend sign when status is missing', () => {
    expect(resolveMetricStatusColor(undefined, 3.4, true)).toBe('success');
    expect(resolveMetricStatusColor(undefined, -1.1, true)).toBe('destructive');
    expect(resolveMetricStatusColor(undefined, 0, true)).toBe('teal');
  });
});
