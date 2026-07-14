import { describe, expect, it } from 'bun:test';
import { resolveMetricPresentation } from './metricPresentation';

describe('resolveMetricPresentation', () => {
  it('does not present a disconnected integration as numeric zero', () => {
    expect(resolveMetricPresentation({ connected: false })).toEqual({
      state: 'not_connected',
      value: 'Not connected',
    });
  });

  it('distinguishes connected accounts without data from a valid zero', () => {
    expect(resolveMetricPresentation({ connected: true })).toEqual({
      state: 'no_data',
      value: 'No data yet',
    });
    expect(resolveMetricPresentation({ connected: true, total: 0, deltaPct: 0 })).toEqual({
      state: 'ready',
      value: '0',
      deltaPct: 0,
    });
  });

  it('keeps failures and loading explicit', () => {
    expect(resolveMetricPresentation({ connected: true, loading: true })).toEqual({
      state: 'loading',
      value: 'Loading',
    });
    expect(resolveMetricPresentation({ connected: true, failed: true })).toEqual({
      state: 'error',
      value: 'Unavailable',
    });
  });

  it('formats ready values compactly', () => {
    const result = resolveMetricPresentation({ connected: true, total: 12_450, deltaPct: 8.4 });
    expect(result.state).toBe('ready');
    expect(result.value).toBe('12.5K');
    expect(result.deltaPct).toBe(8.4);
  });
});
