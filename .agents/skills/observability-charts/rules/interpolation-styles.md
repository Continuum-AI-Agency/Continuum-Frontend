# Interpolation Styles

Choosing between linear and stepped charts depends on the nature of the data and the desired visual style.

## Stepped Charts (StepAfter)

Stepped charts are useful for observability metrics that represent totals or averages over discrete time buckets (daily, hourly). They emphasize the "bucketed" nature of the data.

```typescript
import { createChart } from 'lightweight-charts';

const areaSeries = chart.addAreaSeries({
  lineType: 2, // 2 = PriceLineType.StepAfter
  lineColor: '#3b82f6',
  topColor: 'rgba(59, 130, 246, 0.3)',
  bottomColor: 'rgba(59, 130, 246, 0.05)',
  lineWidth: 2,
});
```

## Linear Charts (Default)

Linear charts are often used for continuous metrics where change is expected between samples (e.g., performance trends over time).

```typescript
const lineSeries = chart.addLineSeries({
  lineType: 0, // 0 = PriceLineType.Simple
  color: '#22c55e',
  lineWidth: 2,
});
```

## Choosing the Style

- **Discrete/Bucketed Data**: Consider `stepAfter` for daily spend, conversions, or fixed budget blocks.
- **Continuous Metrics**: Use linear interpolation for signals that represent a value at a point in time (e.g., current ROAS).
- **Aesthetic Choice**: Stepped charts provide a more "operational" look, while linear charts feel more "trend-oriented".

## Rules

- **Visual Hierarchy**: Use solid lines and fills for the primary entity; use dashed lines and no fills for comparison entities.
- **Clarity**: Use stepped charts when you want to explicitly avoid the illusion of a trend between independent bucketed totals.
- **Time Alignment**: Ensure all series on the same pane share the same time resolution for consistent visual comparison.

Stepped charts are preferred for observability metrics that represent totals or averages over discrete time buckets (daily, hourly).

## Implementation

Use `PriceLineType.StepAfter` for the series line type.

```typescript
import { createChart } from 'lightweight-charts';

const areaSeries = chart.addAreaSeries({
  lineType: 2, // 2 = PriceLineType.StepAfter
  lineColor: '#3b82f6',
  topColor: 'rgba(59, 130, 246, 0.3)',
  bottomColor: 'rgba(59, 130, 246, 0.05)',
  lineWidth: 2,
  priceFormat: {
    type: 'price',
    precision: 2,
    minMove: 0.01,
  },
});
```

## When to use Stepped Charts

- **Daily Aggregates**: Metrics like `daily_spend` or `daily_conversions`.
- **Hourly Snapshots**: Metrics captured at the start or end of an hour.
- **Budget Changes**: Visualizing discrete shifts in target or limit values.

## Styling for Observability

```typescript
const baselineOptions = {
  lineType: 2,
  lineColor: '#22c55e', // Success/Green for baseline
  topColor: 'rgba(34, 197, 94, 0.2)',
  bottomColor: 'rgba(34, 197, 94, 0)',
  lineWidth: 2,
};

const comparisonOptions = {
  lineType: 2,
  lineColor: '#94a3b8', // Muted/Grey for background entities
  topColor: 'transparent',
  bottomColor: 'transparent',
  lineWidth: 1,
  lineStyle: 2, // Dashed
};
```

## Rules

- **Interpolation**: Always use `stepAfter` (2) for discrete time-series data to avoid the illusion of continuous change between points.
- **Visual Hierarchy**: Use solid lines and fills for the primary entity; use dashed lines and no fills for comparison entities.
- **Time Alignment**: Ensure all stepped series share the same time buckets for consistent "steps" across the chart.
