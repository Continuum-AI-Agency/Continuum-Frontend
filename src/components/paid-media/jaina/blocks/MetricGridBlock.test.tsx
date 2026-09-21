import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { MetricGridBlockV2 } from '@/lib/jaina/schemas';
import MetricGridBlock from './MetricGridBlock';

afterEach(cleanup);

type Metric = MetricGridBlockV2['metrics'][number];

const metric = (overrides: Partial<Metric>): Metric => ({
  label: 'Cost per result',
  value: 34,
  unit: 'MXN',
  format: 'currency',
  percent_basis: null,
  change: 19,
  change_direction: 'down',
  severity: 'neutral',
  ...overrides,
});

const gridOf = (metrics: Metric[]): MetricGridBlockV2 => ({
  block_id: 'live-metrics',
  category: 'metric_grid',
  scope: 'account',
  title: 'Live delivery',
  priority: 'primary',
  provenance: null,
  dataset_id: 'live:summary',
  evidence_refs: [],
  metrics,
});

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

describe('MetricGridBlock — figures a reader can scan down a column', () => {
  it('gives every figure its own cell with lined-up digits', () => {
    // It used to render through the shared inline `MetricStrip`, which wraps into a
    // paragraph of `LABEL value · LABEL value · …`. Real reports carry four to seven
    // metrics with sentence-length labels, and wrapped they are exactly the
    // undifferentiated run of text this block exists to avoid.
    render(
      <MetricGridBlock
        block={gridOf([
          metric({ label: 'Cost per result' }),
          metric({ label: 'Spend', value: 87_552, change: null, change_direction: null }),
        ])}
        isStreaming={false}
      />,
    );
    const figures = document.querySelectorAll('dd > span:first-child');
    expect(figures.length).toBe(2);
    for (const figure of figures) {
      expect(figure.className).toContain('tabular-nums');
    }
  });

  it("reads a cost that FELL as good news, through the metric's polarity", () => {
    render(
      <MetricGridBlock
        block={gridOf([metric({ label: 'Cost per result', change: 19, change_direction: 'down' })])}
        isStreaming={false}
      />,
    );
    expect(screen.getByRole('img', { name: 'Down 19%, good' })).toBeTruthy();
  });

  it('leaves a figure with no judgement in the ink colour, never a decorative one', () => {
    render(
      <MetricGridBlock
        block={gridOf([metric({ change: null, change_direction: null })])}
        isStreaming={false}
      />,
    );
    const figure = document.querySelector('dd > span:first-child');
    expect(figure?.className).toContain('text-foreground');
    expect(figure?.className).not.toContain('text-success');
  });
});
