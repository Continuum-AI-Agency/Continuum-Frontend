import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ChartBlockV2 } from '@/lib/jaina/schemas';
import { ChartBlock } from './ChartBlock';

global.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

describe('ChartBlock', () => {
  it('renders the dataset-backed spend-by-angle bar chart contract', () => {
    const block: ChartBlockV2 = {
      block_id: 'creative-angle-spend',
      category: 'chart',
      scope: 'creative_angle',
      title: 'Spend by Communication Angle',
      priority: 'primary',
      provenance: {
        source: 'computed',
        tool: 'get_paid_creative_intel',
        period: { since: '2026-08-13', until: '2026-09-11', requested_label: 'd30' },
        entity_label: 'Meta account',
        record_count: 2,
      },
      chart_type: 'bar',
      data: [
        { angle: 'Family lunch', spend: 12_500 },
        { angle: 'Product and price', spend: 8_000 },
      ],
      chart_config: { spend: { label: 'Spend', color: '#3b82f6' } },
      category_key: 'angle',
      value_key: 'spend',
      x_axis_label: 'Communication angle',
      y_axis_label: 'Spend',
      value_format: 'currency',
      annotation: null,
      description: 'Absolute spend by measured communication angle.',
      dataset_id: 'ds_angle_spend',
      data_meta: [{ angle: 'Family lunch' }, { angle: 'Product and price' }],
    };

    render(<ChartBlock block={block} isStreaming={false} />);

    expect(screen.getByRole('heading', { name: 'Spend by Communication Angle' })).toBeTruthy();
    expect(screen.getByText('Absolute spend by measured communication angle.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Data provenance' })).toBeTruthy();
  });
});
