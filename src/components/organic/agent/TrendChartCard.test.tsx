import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { getTrendScanSummary, TrendChartCard } from './TrendChartCard';
import type { UiTrendChart } from './types';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const chart: UiTrendChart = {
  chartType: 'bar',
  title: 'Brand Trend Signals',
  windows: [7, 30],
  series: [
    {
      label: 'Trends',
      data: [
        { window: 7, value: 2 },
        { window: 30, value: 1 },
      ],
    },
    {
      label: 'Events',
      data: [{ window: 7, value: 1 }],
    },
    {
      label: 'Questions',
      data: [{ window: 30, value: 4 }],
    },
  ],
  topSignals: [
    {
      id: 'sig_1',
      title: 'Spring launch',
      type: 'event',
      confidence: 0.82,
      platform: 'instagram',
      windowDays: 7,
    },
    {
      id: 'sig_2',
      title: 'Creator-led routines',
      type: 'trend',
      confidence: 82,
      platform: 'tik_tok',
      windowDays: 30,
    },
  ],
};

describe('TrendChartCard', () => {
  afterEach(() => cleanup());

  it('does not render when there are no top signals', () => {
    const { container } = render(<TrendChartCard chart={{ ...chart, topSignals: [] }} />);

    expect(container.textContent).toBe('');
  });

  it('summarizes windows, signal count, and series counts in the collapsed receipt', () => {
    render(<TrendChartCard chart={chart} />);

    expect(screen.getByText('Brand Trend Signals')).toBeDefined();
    expect(screen.getByText('· 7d / 30d')).toBeDefined();
    expect(screen.getByText('· 2 signals')).toBeDefined();
    expect(screen.getByText('Trends 3')).toBeDefined();
    expect(screen.getByText('Events 1')).toBeDefined();
    expect(screen.getByText('Questions 4')).toBeDefined();
    expect(screen.queryByText('Spring launch')).toBeNull();
  });

  it('reveals ranked signals with compact metadata when expanded', () => {
    render(<TrendChartCard chart={chart} />);

    fireEvent.click(screen.getByRole('button', { name: /Brand Trend Signals/ }));

    expect(screen.getByText('Spring launch')).toBeDefined();
    expect(screen.getByText('Creator-led routines')).toBeDefined();
    expect(screen.getByText('Event')).toBeDefined();
    expect(screen.getByText('instagram')).toBeDefined();
    expect(screen.getAllByText('82%')).toHaveLength(2);
    expect(screen.queryByText('8200%')).toBeNull();
  });

  it('derives summary values from series and fallback windows', () => {
    expect(
      getTrendScanSummary({
        ...chart,
        title: '',
        windows: [],
        series: [{ label: 'Trends', data: [{ window: 90, value: 5 }] }],
      }),
    ).toEqual({
      title: 'Trend scan',
      windowLabel: '7d / 30d / 90d',
      totalSignals: 2,
      counts: [{ label: 'Trends', value: 5 }],
    });
  });
});
