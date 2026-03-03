# Core Integration & API Reference

Quick reference for "hacking" TradingView Lightweight Charts into the Continuum frontend.

## 1. Installation & Import

```bash
npm install lightweight-charts
```

```typescript
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
```

## 2. The Implementation Flow

To "hack" a chart into a component, follow this exact sequence:

1.  **Container**: Create a `div` with a `ref` and explicit height.
2.  **Initialization**: Use `createChart` inside a `useEffect` (once).
3.  **Series Addition**: Add area/line/histogram series and store them in `useRef`.
4.  **Data Loading**: Transform your data to `{ time: UTCTimestamp, value: number }` and call `series.setData()`.
5.  **Resize**: The library handles resize automatically if `autoSize: true` is set.
6.  **Cleanup**: Return `chart.remove()` from the effect.

## 3. Essential API Cheat Sheet

### Chart Instance (`IChartApi`)
- `chart.applyOptions(options)`: Update global settings (colors, grid, etc).
- `chart.timeScale()`: Access the time axis (zoom, scroll, fit).
- `chart.priceScale(id)`: Access price axes.
- `chart.remove()`: Destroy instance (MANDATORY).

### Series Instance (`ISeriesApi`)
- `series.setData(data[])`: Set/Replace the entire data set.
- `series.update(point)`: Append or update the latest data point.
- `series.applyOptions(options)`: Change colors, line style, or title.
- `series.createPriceLine(options)`: Add a horizontal reference line.

### Time Scale (`ITimeScaleApi`)
- `timeScale.fitContent()`: Zoom to show all data.
- `timeScale.scrollToPosition(pos, animated)`: Move view to a specific point.
- `timeScale.setVisibleRange({ from, to })`: Focus on a specific time window.

## 4. Common Data "Hacks"

### Timestamp Conversion
Lightweight Charts **strictly** requires Unix seconds (number).
```typescript
// From ISO string
const time = Math.floor(new Date(isoString).getTime() / 1000) as UTCTimestamp;

// From Date object
const time = Math.floor(date.getTime() / 1000) as UTCTimestamp;
```

### Price Formatting
Customizing how values appear on the axis and tooltips:
```typescript
series.applyOptions({
  priceFormat: {
    type: 'custom',
    formatter: (price: number) => `$${price.toLocaleString()}`,
  },
});
```

## Rules

- **Ref over State**: Never store `chart` or `series` instances in React state. Always use `useRef`.
- **Single Instance**: Only call `createChart` once per component lifecycle.
- **Deduplicate**: Always ensure timestamps are unique and ascending before calling `setData`.
- **Cleanup**: If you don't call `chart.remove()`, you will leak memory and listeners every time the component re-renders or unmounts.
