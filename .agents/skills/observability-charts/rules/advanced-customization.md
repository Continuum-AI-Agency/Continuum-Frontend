# Hacking Lightweight Charts (Advanced Customization)

While TradingView Lightweight Charts is designed to be a "minimalist" library, it provides powerful escape hatches for when you need to go beyond the built-in series types.

## 1. Custom Series Plugins (The "Official" Hack)

Since v4.0, the best way to "hack" the rendering is via the **Custom Series API**. This allows you to write raw `CanvasRenderingContext2D` code while keeping the library's coordinate system and scaling.

### Example: Shaded "DCO Management" Zones
If you want to highlight specific time ranges where DCO was active with a custom background pattern:

```typescript
class DCOZonePaneView {
  _data: any;
  constructor(data: any) { this._data = data; }
  
  renderer() {
    return {
      draw: (target: CanvasRenderingTarget2D) => {
        target.useBitmapCoordinateSpace(scope => {
          const ctx = scope.context;
          // Use ctx.fillRect, ctx.beginPath, etc.
          // Coordinates are provided by the scope
        });
      }
    };
  }
}

// Add to chart
const customSeries = chart.addCustomSeries(new DCOZoneSeries(), {
  /* options */
});
```

## 2. Drawing Primitives (Annotations & Overlays)

Use **Primitives** to draw arbitrary shapes (rectangles, arrows, icons) that stay pinned to price/time coordinates.

- **Pane Primitives**: Draw directly on the chart area.
- **Axis Primitives**: Draw custom labels or markers on the price or time scales.

## 3. The "Transparent Overlay" Hack

If the Plugin API is too complex, the most common "hack" is to overlay a transparent `<canvas>` or `<div>` exactly over the chart container.

1. Set the chart background to `transparent`.
2. Sync the overlay size with the chart's `autoSize`.
3. Use `chart.timeScale().coordinateToTime()` and `series.priceToCoordinate()` to map mouse positions back to your data.

## 4. CSS Variable Injection

Lightweight Charts doesn't support CSS variables in its config directly, but you can "hack" them in by reading them via JS before initializing or updating the chart:

```typescript
const styles = getComputedStyle(document.documentElement);
const themeColor = styles.getPropertyValue('--chart-accent').trim();

chart.applyOptions({
  layout: { textColor: themeColor }
});
```

## 5. Mocking "Multi-Pane" Charts

Lightweight Charts is single-pane. To simulate multi-pane (e.g., Price on top, Volume on bottom), use the `scaleMargins` hack:

```typescript
// Price takes top 70%
priceSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.1, bottom: 0.3 }
});

// Volume takes bottom 20%
volumeSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.8, bottom: 0 }
});
```

## Rules for Hacking

- **Coordinate Integrity**: When drawing custom elements, always use the library's `coordinateToTime` and `priceToCoordinate` methods to ensure your drawings move correctly when the user scrolls or scales.
- **Pixel Perfection**: Use `target.useBitmapCoordinateSpace` in plugins to avoid blurry lines on High-DPI (Retina) screens.
- **Performance**: Heavy canvas operations in `draw()` calls can lag the chart. Keep custom rendering logic O(n) or better.
- **Cleanup**: If you add custom DOM overlays, ensure they are removed in the same `useEffect` cleanup where `chart.remove()` is called.
