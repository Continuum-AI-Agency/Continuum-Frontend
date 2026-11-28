import { describe, expect, it } from 'bun:test';
import { getMetricChange, resolveMetricStatusColor, toStat } from './JainaReportMetrics';

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

describe('toStat', () => {
  it('keeps full currency precision and the signed delta', () => {
    const stat = toStat({ metric: 'Spend', value: 48219.44, format: 'currency', change: 18.2 }, 0);

    expect(stat.value).toBe('$48,219.44');
    expect(stat.delta).toBe(18.2);
    expect(stat.higherIsBetter).toBe(true);
    expect(stat.tone).toBeUndefined();
  });

  it('treats a falling CPA as an improvement when the report gives no status', () => {
    const stat = toStat({ metric: 'CPA', value: 27.86, format: 'currency', change: -1.4 }, 0);

    expect(stat.value).toBe('$27.86');
    expect(stat.delta).toBe(-1.4);
    expect(stat.higherIsBetter).toBe(false);
  });

  it('lets the report status set the tone over the sign of the change', () => {
    expect(toStat({ metric: 'ROAS', value: 3.4, change: 2, status: 'risk' }, 0).tone).toBe(
      'negative',
    );
    expect(toStat({ metric: 'CTR', value: 2.1, change: -3, status: 'watch' }, 0).tone).toBe(
      'warning',
    );
  });

  it('shows the status label when there is no change, as before', () => {
    const stat = toStat({ metric: 'Total Spend', value: 162916.33, status: 'neutral' }, 0);

    expect(stat.delta).toBeUndefined();
    expect(stat.status).toBe('neutral');
    expect(stat.tone).toBe('neutral');
  });

  it('formats suffixes and percentages, parses string changes, and carries context', () => {
    expect(toStat({ metric: 'ROAS', value: 3.42, suffix: 'x' }, 0).value).toBe('3.42x');
    expect(toStat({ metric: 'CTR', value: 2.13, format: 'percentage' }, 0).value).toBe('2.13%');
    expect(toStat({ metric: 'Top ROAS', value: '1.92', change: '+12.5%', context: 'Campaign A' }, 0))
      .toMatchObject({ value: '1.92', delta: 12.5, hint: 'Campaign A' });
  });

  it('never invents a sparkline', () => {
    expect(toStat({ metric: 'Spend', value: 1, trend: 4 }, 0).trend).toBeUndefined();
  });
});
