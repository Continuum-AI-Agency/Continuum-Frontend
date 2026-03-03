# Multi-Entity Comparison

Overlay multiple entities (campaigns, ad sets, services) on a single chart for comparative observability.

## Baseline vs Comparison

Standard pattern: one "Expanded" or "Focused" entity (solid line + area fill) vs multiple comparison entities (thinner, dashed, or muted lines).

```typescript
// Primary Entity
const primarySeries = chart.addAreaSeries({
  lineColor: '#3b82f6',
  topColor: 'rgba(59, 130, 246, 0.2)',
  bottomColor: 'rgba(59, 130, 246, 0)',
  lineWidth: 2,
  title: 'Campaign A (Primary)',
});

// Comparison Entities
const comparisonSeries = chart.addLineSeries({
  color: 'rgba(148, 163, 184, 0.5)', // Muted slate
  lineWidth: 1,
  lineStyle: 2,
  title: 'Ad Set B',
});
```

## Entity Switching

When switching focus between entities, update the series options rather than destroying/recreating series if possible.

```typescript
function focusEntity(entityId: string, seriesMap: Map<string, ISeriesApi<any>>) {
  seriesMap.forEach((series, id) => {
    const isFocused = id === entityId;
    series.applyOptions({
      lineWidth: isFocused ? 2 : 1,
      lineStyle: isFocused ? 0 : 2,
      // ... update colors
    });
  });
}
```

## Normalizing Metrics

For comparing entities with vastly different scales (e.g., a high-spend campaign vs a new ad set), use percentage change from the start of the range.

```typescript
function normalizeToPercentage(data: KPIDataPoint[]): KPIDataPoint[] {
  if (data.length === 0) return [];
  const startValue = data[0].value;
  if (startValue === 0) return data;
  
  return data.map(d => ({
    timestamp: d.timestamp,
    value: ((d.value - startValue) / startValue) * 100,
  }));
}
```

## Rules

- **Maximum Entities**: Limit to 1 primary + 4-5 comparison entities to avoid visual clutter (the "spaghetti" chart effect).
- **Z-Index**: Ensure the primary entity series is added last or managed so it appears "on top" of comparison lines.
- **Color Consistency**: If an entity has a color assigned in the UI/Dashboard, ensure the chart series uses the exact same color.
- **Legends**: Build custom HTML legends outside the chart canvas to list active entities and their colors.
