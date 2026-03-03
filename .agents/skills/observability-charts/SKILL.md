---
name: observability-charts
description: Best practices for building observability charts and time-series visualizations using TradingView Lightweight Charts. Use when creating KPI trends, multi-entity comparisons (campaigns, ad sets), target overlays, and sparklines for metrics monitoring.
---

# Observability Charts with Lightweight Charts

Rules for building high-density observability dashboards and KPI visualizations using TradingView Lightweight Charts.

## Implementation Guide
- [Core Integration](rules/core-integration.md): how to "hack" Lightweight Charts into a React component
- [Chart Initialization](rules/chart-initialization.md): configuration, autoSize, and themes
- [Data Mapping](rules/data-mapping.md): transforming metrics to the required API format

## Observability Patterns
- [Interpolation Styles](rules/interpolation-styles.md): linear vs stepped charts for continuous vs discrete time-series data
- [Target Overlays](rules/target-overlays.md): dashed target series, reference lines, and actual/target delta signaling
- [Visual Semantics](rules/visual-semantics.md): color coding (green/red/amber), reference lines, and alert thresholds

## Multi-Entity Comparison
- [Multi-Entity Comparison](rules/multi-entity-comparison.md): overlaying multiple campaigns/ad sets, color scales, and entity switching
- [Sparklines](rules/sparklines.md): lightweight mini-charts for high-density tables and row-level trends

## Interaction & UI
- [Interaction & Tooltips](rules/interaction-tooltips.md): crosshair move subscriptions, custom KPI tooltips, and radar deltas
- [Chart Lifecycle](rules/chart-lifecycle.md): React integration, cleanup, resize management, and memory leaks prevention
- [Advanced Customization](rules/advanced-customization.md): custom series plugins, drawing primitives, and canvas overlays

## Data Management
- [Historical Loading](rules/data-historical-loading.md): fetching range-based metrics, pagination, and loading skeletons
- [Real-Time Updates](rules/realtime-kpi-updates.md): updating series with live metrics, handling resolution changes (daily/hourly)

## Framework Integration
- [React Best Practices](rules/react-integration.md): hooks, refs, performance optimization for high-density observability UIs
