# Target Overlays and Deltas

Visualizing targets (DCO targets, budgets, limits) against actual performance metrics.

## Target Series (Dashed Line)

Use a dashed line series to represent the target value over time.

```typescript
const targetSeries = chart.addLineSeries({
  color: '#ef4444', // Red for targets/alerts
  lineWidth: 1,
  lineStyle: 2, // Dashed
  title: 'Target',
  lastValueVisible: true,
  priceLineVisible: false,
});
```

## Reference Lines (Static Targets)

For static targets that don't change over the visible range:

```typescript
const priceLine = series.createPriceLine({
  price: 500, // The target value
  color: '#ef4444',
  lineWidth: 1,
  lineStyle: 2,
  axisLabelVisible: true,
  title: 'DAILY TARGET',
});
```

## Delta Signaling

Incorporate deltas (actual vs target %) into the chart context.

### Denominator Badge (Actual / Target)
While not directly in the chart, the chart state should drive the denominator display.

```typescript
// Example: Calculating delta for display alongside chart
function getTargetDelta(actual: number, target: number) {
  if (target === 0) return 0;
  return ((actual - target) / target) * 100;
}
```

## DCO Target Behavior

Following the `paid-media-observability` module rules:
- **Red Overlays**: Use red (`#ef4444`) for DCO target series and reference lines.
- **Target Interpolation**: Targets typically use `stepAfter` if they represent bucketed goals (e.g., daily budget), but can use linear interpolation for continuous targets.

```typescript
const dcoTargetSeries = chart.addLineSeries({
  lineType: 2, // stepAfter
  color: '#ef4444',
  lineWidth: 1,
  lineStyle: 2,
});
```

## Rules

- **Target Visibility**: Always use a distinct style (Dashed/Dotted) for target lines to separate them from actual performance lines.
- **Color Coding**: Standardize on Red (`#ef4444`) for targets that represent critical thresholds or DCO boundaries.
- **Reference Lines**: Use `createPriceLine` for static, range-wide thresholds.
- **Alignment**: Ensure target data points share exact timestamps with performance data points.
