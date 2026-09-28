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
        record_count: 3,
      },
      chart_type: 'bar',
      data: [
        { angle: 'Family lunch', spend: 0 },
        {
          angle: 'Product quality and transparent pricing for growing families',
          spend: 8_000,
        },
        { angle: 'Weekend deals', spend: 1_200 },
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
        { angle: 'Weekend deals' },
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

    // Two entities is a pair, and a pair is two tiles — the qualified figure is on them.
    expect(screen.getByTestId('chart-as-tiles')).toBeTruthy();
    expect(screen.getAllByText('0 (currency unknown)').length).toBeGreaterThan(0);
    expect(screen.getByText('4 (currency unknown)')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});

const lineBlock = (points: number, seriesKeys: string[] = ['spend']): ChartBlockV2 =>
  ({
    block_id: `trend-${points}`,
    category: 'chart',
    scope: 'account',
    title: 'Performance Trend — act_521903353286118',
    priority: 'primary',
    provenance: null,
    grounding: null,
    chart_type: 'line',
    data: Array.from({ length: points }, (_, index) => ({
      day: `2026-09-${String(index + 1).padStart(2, '0')}`,
      ...Object.fromEntries(
        seriesKeys.map((key, series) => [key, (index + 1) * (series + 1) * 10]),
      ),
    })),
    chart_config: Object.fromEntries(
      seriesKeys.map((key) => [key, { label: key.toUpperCase(), color: '#3b82f6' }]),
    ),
    category_key: 'day',
    value_key: null,
    x_axis_label: null,
    y_axis_label: null,
    value_format: 'currency',
    value_basis: null,
    currency_code: 'MXN',
    annotation: null,
    description: null,
    dataset_id: 'ds_trend',
    data_meta: null,
  }) as unknown as ChartBlockV2;

describe('ChartBlock — a chart only when there is a trend or a comparison', () => {
  it('degrades a three-point series to the figures as tiles, keeping the heading', () => {
    render(<ChartBlock block={lineBlock(3)} isStreaming={false} />);
    const tiles = screen.getByTestId('chart-as-tiles');
    expect(tiles.getAttribute('data-chart-points')).toBe('3');
    expect(tiles.getAttribute('data-chart-entities')).toBe('1');
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('[data-slot="chart"]')).toBeNull();
    expect(screen.getByRole('heading', { name: /Performance Trend/ })).toBeTruthy();
    expect(screen.getAllByRole('term').map((node) => node.textContent)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(screen.getByText('MX$10.00')).toBeTruthy();
  });

  it('draws a seven-point series as a chart', () => {
    render(<ChartBlock block={lineBlock(7)} isStreaming={false} />);
    expect(screen.queryByTestId('chart-as-tiles')).toBeNull();
    expect(screen.getByRole('img', { name: /Performance Trend/ })).toBeTruthy();
  });

  it('draws three entities compared over three days as a chart, and labels a pair’s tiles by series', () => {
    render(<ChartBlock block={lineBlock(3, ['a', 'b', 'c'])} isStreaming={false} />);
    expect(screen.getByRole('img', { name: /Performance Trend/ })).toBeTruthy();
    cleanup();
    render(<ChartBlock block={lineBlock(2, ['a', 'b'])} isStreaming={false} />);
    const tiles = screen.getByTestId('chart-as-tiles');
    expect(tiles.getAttribute('data-chart-entities')).toBe('2');
    expect(screen.getAllByRole('term').map((node) => node.textContent)).toEqual([
      '2026-09-01 · A',
      '2026-09-01 · B',
      '2026-09-02 · A',
      '2026-09-02 · B',
    ]);
  });

  it('is as tall as its ticks need, not a fixed 380px', () => {
    render(<ChartBlock block={lineBlock(7)} isStreaming={false} />);
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.className).not.toContain('h-[380px]');
    expect(chart.className).toContain('aspect-auto');
    expect(chart.style.height).toBe('271px');
  });
});
