# Real-Time KPI Updates

Handling live metric streams and resolution changes in observability dashboards.

## Live Updates with series.update()

Use `series.update()` for appending single points from a WebSocket or polling feed.

```typescript
function handleLiveMetric(msg: { timestamp: number, value: number }) {
  if (!seriesRef.current) return;
  
  seriesRef.current.update({
    time: msg.timestamp as UTCTimestamp,
    value: msg.value,
  });
}
```

## Resolution Switching (Daily vs Hourly)

When switching resolution, the entire data set usually needs to be replaced.

```typescript
useEffect(() => {
  async function fetchNewResolution() {
    const data = await api.getMetrics({ resolution }); // 'daily' | 'hourly'
    
    // Clear and set new data
    seriesRef.current?.setData(mapData(data));
    
    // Adjust timescale for resolution
    chartRef.current?.applyOptions({
      timeScale: {
        barSpacing: resolution === 'hourly' ? 20 : 10,
      }
    });
  }
  
  fetchNewResolution();
}, [resolution]);
```

## Merging Historical and Live Data

Ensure that live updates don't create duplicates or overlap incorrectly with the initial historical load.

```typescript
function onInitialLoad(historical: KPIDataPoint[]) {
  const latestHistorical = historical[historical.length - 1].timestamp;
  
  // Filter out any buffered live updates that are older than historical tail
  const validLive = liveBuffer.current.filter(p => p.timestamp > latestHistorical);
  
  seriesRef.current?.setData([...historical, ...validLive]);
}
```

## Rules

- **Deduplication**: TradingView throws an error if two data points have the exact same timestamp. Deduplicate before calling `setData` or `update`.
- **Sorting**: Live updates must be appended in chronological order.
- **Resolution Context**: In `hourly` mode, ensure `timeVisible: true` is set in the chart options.
- **DCO Managed Filtering**: Following `paid-media-observability` rules, hide non-DCO entities in `hourly` mode.
