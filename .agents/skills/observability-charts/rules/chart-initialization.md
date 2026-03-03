# Chart Initialization

Configure and create a TradingView Lightweight Charts instance optimized for observability and KPI monitoring.

## Installation

```bash
npm install lightweight-charts
```

## Basic Setup

```typescript
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, DeepPartial, ChartOptions } from 'lightweight-charts';

function createObservabilityChart(
  container: HTMLElement,
  theme: 'dark' | 'light' = 'dark'
): IChartApi {
  const isDark = theme === 'dark';

  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: {
        type: ColorType.Solid,
        color: 'transparent', // Usually transparent for dashboard integration
      },
      textColor: isDark ? '#94a3b8' : '#64748b',
      fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(226, 232, 240, 0.5)' },
    },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
      rightOffset: 0,
      barSpacing: 10,
    },
    rightPriceScale: {
      borderColor: isDark ? '#1e293b' : '#e2e8f0',
      scaleMargins: {
        top: 0.2,
        bottom: 0.1,
      },
      alignLabels: true,
    },
    crosshair: {
      mode: 0,
      vertLine: {
        color: isDark ? '#475569' : '#94a3b8',
        width: 1,
        style: 2, // Dashed
      },
      horzLine: {
        color: isDark ? '#475569' : '#94a3b8',
        width: 1,
        style: 2,
      },
    },
    handleScroll: true,
    handleScale: true,
  });

  return chart;
}
```

## Observability Specific Config

### Interpolation Choice
Depending on the metric, choose between `Simple` (linear) and `StepAfter` interpolation. StepAfter is common for discrete daily/hourly totals.

```typescript
const series = chart.addAreaSeries({
  lineType: 2, // 2 = StepAfter, 0 = Simple (Default)
  lineWidth: 2,
  lineColor: '#3b82f6',
});
```

### Stepped Charts (Daily/Hourly Metrics)
For observability metrics that change at discrete intervals (e.g., daily spend, hourly clicks), use `stepAfter` interpolation.

```typescript
const series = chart.addAreaSeries({
  lineType: 2, // PriceLineType.StepAfter (from lightweight-charts constants if available, or literal 2)
  lineWidth: 2,
  lineColor: '#3b82f6',
  topColor: 'rgba(59, 130, 246, 0.2)',
  bottomColor: 'rgba(59, 130, 246, 0.0)',
});
```

## Rules

- **Transparency**: Prefer `transparent` backgrounds for charts embedded in dashboard cards.
- **Grid Lines**: Hide vertical grid lines for cleaner time-series views; keep horizontal lines for price/value reference.
- **Font Integration**: Use CSS variables (e.g., `var(--font-geist-sans)`) to match the application's typography.
- **Responsive**: Always set `autoSize: true`.
- **Cleanup**: Always call `chart.remove()` in component unmount/cleanup.
