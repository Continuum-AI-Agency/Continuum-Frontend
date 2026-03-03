# Historical Data Loading

Fetch historical time-series and KPI data from observability APIs and display it on TradingView Lightweight Charts with proper loading states.

## Basic Fetch and Display

```typescript
import type { UTCTimestamp } from 'lightweight-charts';

interface FetchMetricsParams {
  entityId: string;
  metric: string;
  resolution: 'daily' | 'hourly';
  startDate: string;
  endDate: string;
}

async function fetchMetrics(params: FetchMetricsParams): Promise<KPIDataPoint[]> {
  const url = new URL('/api/paid-metrics', window.location.origin);
  url.searchParams.set('entityId', params.entityId);
  url.searchParams.set('metric', params.metric);
  url.searchParams.set('resolution', params.resolution);
  url.searchParams.set('startDate', params.startDate);
  url.searchParams.set('endDate', params.endDate);

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Failed to fetch metrics: ${resp.status}`);
  }

  const { data } = await resp.json();
  return data; // Expected: KPIDataPoint[]
}

// Load and display
const metrics = await fetchMetrics({
  entityId: 'campaign_123',
  metric: 'spend',
  resolution: 'daily',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});

areaSeries.setData(metrics.map(d => ({
  time: d.timestamp as UTCTimestamp,
  value: d.value,
})));

chart.timeScale().fitContent();
```

## Loading States (Skeletons)

Instead of a generic overlay, use neutral skeleton loaders that match the page structure.

```typescript
function ChartSkeleton() {
  return (
    <div className="w-full h-full bg-slate-900/50 animate-pulse rounded-lg flex items-center justify-center">
      <div className="text-slate-500 text-xs">Loading metrics...</div>
    </div>
  );
}
```

## Resolution Handling

When resolution changes (e.g. Daily to Hourly), fetch the new data range and replace the series data entirely.

```typescript
useEffect(() => {
  const load = async () => {
    setLoading(true);
    const data = await fetchMetrics({ entityId, metric, resolution, ...range });
    seriesRef.current?.setData(mapData(data));
    setLoading(false);
  };
  load();
}, [resolution, entityId, metric, range]);
```

## Rules

- **Initial Load**: Always use `setData()` for the initial batch of historical data.
- **Fit Content**: Call `chart.timeScale().fitContent()` after the first `setData()` call to ensure the chart zooms to the correct range.
- **Error Handling**: Catch fetch errors and surface them via a toast or an in-chart error message rather than leaving a blank canvas.
- **Skeleton Loaders**: Prefer neutral skeleton loaders (`bg-muted/70`) that match the chart's final dimensions.
- **Deduplication**: Ensure API responses are deduplicated by timestamp before passing to the chart.
