import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ChartBlockV2 } from '@/lib/jaina/schemas';
import { ChartBlock } from './ChartBlock';

global.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
let chartWidth = 800;

beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (!this.classList.contains('recharts-responsive-container')) {
      return originalGetBoundingClientRect.call(this);
    }
    return {
      width: chartWidth,
      height: 360,
      top: 0,
      right: chartWidth,
      bottom: 360,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

beforeEach(() => {
  chartWidth = 800;
});

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
        { angle: 'Family lunch', spend: 0 },
        {
          angle: 'Product quality and transparent pricing for growing families',
          spend: 8_000,
        },
      ],
      chart_config: { spend: { label: 'Spend', color: '#3b82f6' } },
      category_key: 'angle',
      value_key: 'spend',
      x_axis_label: 'Communication angle',
      y_axis_label: 'Spend',
      value_format: 'currency',
      currency_code: 'EUR',
      annotation: null,
      description: 'Absolute spend by measured communication angle.',
      dataset_id: 'ds_angle_spend',
      data_meta: [
        { angle: 'Family lunch' },
        { angle: 'Product quality and transparent pricing for growing families' },
      ],
    };

    chartWidth = 320;
    render(<ChartBlock block={block} isStreaming={false} />);

    expect(screen.getByRole('heading', { name: 'Spend by Communication Angle' })).toBeTruthy();
    expect(screen.getByText('Absolute spend by measured communication angle.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Data provenance' })).toBeTruthy();
    expect(screen.getByText('Communication angle')).toBeTruthy();
    expect(screen.getByText('Spend')).toBeTruthy();
    expect(screen.getByText('Family lunch')).toBeTruthy();
    const longLabel = screen.getByLabelText(
      'Product quality and transparent pricing for growing families',
    );
    expect(longLabel.querySelectorAll('tspan').length).toBeGreaterThan(1);
    expect(screen.getAllByText('€0.00').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('img', {
        name: /Family lunch: Spend €0\.00.*Product quality and transparent pricing/i,
      }),
    ).toBeTruthy();
  });

  it('qualifies currency values when no currency metadata is supplied', () => {
    const block: ChartBlockV2 = {
      block_id: 'unknown-currency-spend',
      category: 'chart',
      scope: 'creative_angle',
      title: 'Spend by Angle',
      priority: 'primary',
      provenance: null,
      chart_type: 'bar',
      data: [
        { angle: 'Trust', spend: 0 },
        { angle: 'Proof', spend: 4 },
      ],
      chart_config: { spend: { label: 'Spend', color: '#3b82f6' } },
      category_key: 'angle',
      value_key: 'spend',
      x_axis_label: 'Communication angle',
      y_axis_label: 'Spend (currency unknown)',
      value_format: 'currency',
      currency_code: null,
      annotation: null,
      description: null,
      dataset_id: 'ds_unknown_currency',
      data_meta: [
        { angle: 'Trust', currency: null },
        { angle: 'Proof', currency: null },
      ],
    };

    render(<ChartBlock block={block} isStreaming={false} />);

    expect(screen.getByText('Spend (currency unknown)')).toBeTruthy();
    expect(screen.getAllByText('0 (currency unknown)').length).toBeGreaterThan(0);
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});
