# Interaction and KPI Tooltips

Customizing crosshairs and building informative tooltips for observability metrics.

## Crosshair Subscription

Subscribe to crosshair movement to update external UI elements (like KPI sidebars or radar tooltips).

```typescript
chart.subscribeCrosshairMove((param) => {
  if (
    param.point === undefined ||
    !param.time ||
    param.point.x < 0 ||
    param.point.y < 0
  ) {
    // Hide tooltip/values
    return;
  }

  // Get data for each series at the crosshair position
  param.seriesData.forEach((data, series) => {
    const value = (data as any).value;
    // Update external state or DOM
  });
});
```

## Custom KPI Tooltips

Since Lightweight Charts doesn't provide a built-in tooltip, create an HTML overlay that responds to the crosshair.

```typescript
function updateTooltip(container: HTMLElement, data: any) {
  tooltip.style.display = 'block';
  tooltip.innerHTML = `
    <div class="flex flex-col gap-1 p-2 bg-slate-900 border border-slate-800 rounded shadow-xl">
      <div class="text-[10px] text-slate-400 uppercase font-bold">${data.timeLabel}</div>
      <div class="flex justify-between gap-4">
        <span class="text-xs text-slate-200">${data.metricName}</span>
        <span class="text-xs font-mono text-white">${data.formattedValue}</span>
      </div>
      ${data.target ? `
        <div class="flex justify-between gap-4 border-t border-slate-800 pt-1 mt-1">
          <span class="text-[10px] text-red-400">Target</span>
          <span class="text-[10px] font-mono text-red-400">${data.formattedTarget}</span>
        </div>
      ` : ''}
    </div>
  `;
}
```

## Radar Delta Tooltips

For campaign exploration, use the crosshair position to drive a radar-style delta indicator.

```typescript
// map delta to radar position: center = no delta, outward = positive, inward = negative
function updateRadar(delta: number) {
  const normalizedPos = Math.min(Math.max(delta, -100), 100);
  // drive SVG or Canvas radar UI
}
```

## Rules

- **Hide on Leave**: Ensure the tooltip hides when the mouse leaves the chart container or the crosshair is no longer over a valid data point.
- **Throttling**: Tooltip updates should be high-frequency but lightweight (direct DOM manipulation or optimized React state).
- **Z-Index**: Tooltip HTML overlays must have a higher z-index than the chart canvas.
- **Formatting**: Use the same numeric formatters for tooltips as used in the table/dashboard.
