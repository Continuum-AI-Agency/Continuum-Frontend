# React Integration for Observability Charts

Best practices for integrating Lightweight Charts into a Next.js / React 19 application.

## useChart Hook

Encapsulate chart creation and lifecycle.

```typescript
import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, DeepPartial, ChartOptions } from 'lightweight-charts';

export function useChart(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: DeepPartial<ChartOptions>
) {
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      ...options,
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []); // Initialize once

  return chartRef;
}
```

## Series Management with Refs

Store series in `useRef` to avoid unnecessary re-renders when data updates.

```typescript
function KPILineChart({ data, metricName }: { data: KPIDataPoint[], metricName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useChart(containerRef);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!seriesRef.current) {
      seriesRef.current = chart.addAreaSeries({
        lineType: 2,
        title: metricName,
      });
    }

    seriesRef.current.setData(data.map(d => ({
      time: d.timestamp as UTCTimestamp,
      value: d.value,
    })));
    
    chart.timeScale().fitContent();
  }, [data, metricName]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

## Next.js Client Boundary

Always mark chart components with `"use client"` and consider `dynamic` import for large bundles.

```typescript
'use client';

import dynamic from 'next/dynamic';

const ChartImplementation = dynamic(() => import('./ChartImplementation'), {
  ssr: false,
  loading: () => <div className="w-full h-[400px] bg-slate-900/50 animate-pulse rounded-lg" />,
});
```

## Performance Patterns

- **Batch Updates**: If updating multiple series at once, do it in a single `useEffect` or callback.
- **Memoization**: Memoize data transformation functions passed into effects.
- **Container Sizing**: Ensure the parent of the chart container has a defined height (flex-1, h-[300px], etc.).

## Rules

- **Client Only**: Charting depends on DOM/Canvas APIs. Ensure it only runs on the client.
- **Cleanup**: Always return `chart.remove()` in `useEffect`.
- **Ref for API**: Access `IChartApi` and `ISeriesApi` via refs, not state.
- **Minimal State**: Only use React state for chart-adjacent UI (loading, entity selection, metric toggles).
