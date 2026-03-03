# Sparklines for High-Density Tables

Miniature charts used within table rows or cards to show trends at a glance without axes or grids.

## Initialization for Sparklines

Sparklines should disable all interactive elements and non-data visuals.

```typescript
const sparkChart = createChart(container, {
  width: 120,
  height: 32,
  handleScroll: false,
  handleScale: false,
  grid: {
    vertLines: { visible: false },
    horzLines: { visible: false },
  },
  leftPriceScale: { visible: false },
  rightPriceScale: { visible: false },
  timeScale: { visible: false },
  crosshair: { visible: false },
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
  },
});
```

## Styling Sparklines

Use stepped area series for consistency with main observability charts.

```typescript
const sparkSeries = sparkChart.addAreaSeries({
  lineType: 2, // stepAfter
  lineColor: '#3b82f6',
  topColor: 'rgba(59, 130, 246, 0.2)',
  bottomColor: 'rgba(59, 130, 246, 0)',
  lineWidth: 1.5,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
});
```

## Performance Considerations

When rendering many sparklines (e.g., in a 50-row table):
- **Single Canvas per Row**: Each sparkline is its own canvas. 
- **Virtualization**: Use `react-window` or `content-visibility: auto` to prevent rendering off-screen canvases.
- **Static Svg Fallback**: For extremely high density (100+ rows), consider rendering simple SVGs instead of full Lightweight Charts instances if interactivity is not needed.

## Rules

- **Disable Everything**: Hide axes, grids, crosshairs, and price lines for sparklines.
- **Fixed Dimensions**: Set explicit width/height in `createChart` for sparklines.
- **Consistency**: Use the same `lineType` (Stepped) as the primary charts.
- **Cleanup**: Ensure every row-level sparkline instance is correctly removed when the row is unmounted.
