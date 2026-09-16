import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { MetricGridBlockV2 } from '@/lib/jaina/schemas';
import MetricGridBlock from './MetricGridBlock';

afterEach(cleanup);

const block = (unit: string | null): MetricGridBlockV2 => ({
  block_id: 'live-metrics',
  category: 'metric_grid',
  scope: 'account',
  title: 'Live delivery',
  priority: 'primary',
  provenance: null,
  dataset_id: 'live:summary',
  evidence_refs: ['meta:insights'],
  metrics: [
    {
      label: 'Delivered spend',
      value: 1_500,
      unit,
      format: 'currency',
      change: null,
      change_direction: null,
      severity: 'neutral',
    },
  ],
});

describe('MetricGridBlock', () => {
  it('uses the source currency and never defaults an unknown currency to USD', () => {
    const { rerender } = render(<MetricGridBlock block={block('MXN')} isStreaming={false} />);
    expect(screen.getByText('MX$1,500.00')).toBeTruthy();

    rerender(<MetricGridBlock block={block(null)} isStreaming={false} />);
    expect(screen.getByText('1,500 (currency unknown)')).toBeTruthy();
    expect(screen.queryByText('$1,500.00')).toBeNull();
  });
});
