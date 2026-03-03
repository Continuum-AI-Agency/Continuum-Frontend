# Data Mapping for Observability

Transform generic KPI and time-series data into TradingView Lightweight Charts format.

## Generic KPI Type

```typescript
interface KPIDataPoint {
  timestamp: number; // Unix seconds
  value: number;
}
```

## Mapping to Line/Area Series

```typescript
import type { LineData, UTCTimestamp } from 'lightweight-charts';

function mapKPIData(data: KPIDataPoint[]): LineData<UTCTimestamp>[] {
  return data.map(d => ({
    time: d.timestamp as UTCTimestamp,
    value: d.value,
  }));
}
```

## Handling Gaps in Data

In observability, missing data should be handled explicitly.

```typescript
function fillGaps(data: KPIDataPoint[], interval: number): KPIDataPoint[] {
  if (data.length < 2) return data;
  
  const filled: KPIDataPoint[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    filled.push(data[i]);
    const nextTime = data[i+1].timestamp;
    let currTime = data[i].timestamp + interval;
    
    while (currTime < nextTime) {
      filled.push({ timestamp: currTime, value: 0 }); // or null if using whitespace
      currTime += interval;
    }
  }
  filled.push(data[data.length - 1]);
  return filled;
}
```

## Mapping for DCO Targets

Targets are often separate series that need to align with the baseline.

```typescript
interface TargetPoint {
  timestamp: number;
  actual: number;
  target: number;
}

function mapToTargetSeries(data: TargetPoint[]) {
  const actualSeries = data.map(d => ({ time: d.timestamp as UTCTimestamp, value: d.actual }));
  const targetSeries = data.map(d => ({ time: d.timestamp as UTCTimestamp, value: d.target }));
  
  return { actualSeries, targetSeries };
}
```

## Rules

- **Sorted Data**: Ensure data is sorted by `timestamp` ascending before passing to `setData()`.
- **Unix Seconds**: Lightweight Charts requires timestamps in seconds. Convert milliseconds if necessary.
- **Precision**: Keep KPI values as raw numbers; use `priceFormat` in series options for display rounding.
- **Whitespaces**: Use `null` or skip points to create gaps in the line if data is truly missing (and `disconnectValues` is supported).
