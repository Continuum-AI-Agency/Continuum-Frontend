# Visual Semantics

Consistent visual language is critical for rapid triage in observability dashboards.

## Color Coding

Use standard semantic colors to signal health and performance status.

- **Green (`#22c55e`)**: Healthy, target met, positive performance.
- **Red (`#ef4444`)**: Error, target missed, critical threshold exceeded, DCO action required.
- **Amber/Yellow (`#f59e0b`)**: Warning, approaching threshold, neutral/slight deviation.
- **Blue (`#3b82f6`)**: Primary entity focus, informative metrics.
- **Slate/Grey (`#94a3b8`)**: Comparison entities, background data, secondary information.

## Alert Thresholds & Reference Lines

Visualizing thresholds directly on the chart allows for instant "actual vs limit" assessment.

```typescript
// Add a constant reference line for a KPI threshold
series.createPriceLine({
  price: 80,
  color: '#ef4444',
  lineWidth: 1,
  lineStyle: 2, // Dashed
  axisLabelVisible: true,
  title: 'CRITICAL THRESHOLD',
});
```

## Information Architecture

Organize dashboard content from high-level to low-level detail.

1. **KPI Strips**: Single stat cards at the top for immediate status.
2. **Primary Time-Series**: Large chart showing the main signal over time.
3. **Entity Explorer**: List of sub-entities (e.g., ad sets) with sparklines for density.
4. **Drill-down**: Detailed views for a single selected entity.

## Rules

- **Color Consistency**: If an entity is red in the list, its series in the chart should also be red.
- **Semantic Meaning**: Avoid using "alert" colors (Red/Amber) for decorative purposes.
- **Threshold Visibility**: Always include reference lines when a metric has a defined SLA or target.
- **Labels**: Use clear, uppercase labels for reference lines (e.g., "MAX SPEND") to ensure they are readable as operational boundaries.
