Refactoring complete.

I have updated the Jaina frontend to match the new backend schema:

1.  **Schema Update**: Updated `src/lib/jaina/schemas.ts` to reflect the new `SoTReport` structure (flat metrics, charts array, insights, recommendations).
2.  **New Components**: Created modular components for the report sections:
    *   `JainaReportMetrics.tsx`: Displays key performance indicators in a grid.
    *   `JainaReportCharts.tsx`: Renders charts using Recharts with the new data format.
    *   `JainaReportInsights.tsx`: Displays strategic insights in a clean list.
    *   `JainaReportRecommendations.tsx`: Shows priority recommendations with impact/effort badges.
3.  **View Refactor**: Completely rewrote `JainaReportView.tsx` to use these new components and layout.
4.  **Navigation**: Updated `JainaReportNav.tsx` to link to the new section IDs.
5.  **Type Fixes**: Adjusted `JainaChatSurface.tsx` to handle the `report` type correctly.

The frontend is now ready to consume the new backend payload format.
Refactoring complete.

I have updated the Jaina frontend to match the new backend schema:

1.  **Schema Update**: Updated `src/lib/jaina/schemas.ts` to reflect the new `FrontendCheckpointReport` structure (flat metrics, charts array, insights, recommendations, handoff trace).
2.  **New Components**: Created modular components for the report sections:
    *   `JainaReportMetrics.tsx`: Displays key performance indicators in a grid.
    *   `JainaReportCharts.tsx`: Renders charts using Recharts with the new data format.
    *   `JainaReportInsights.tsx`: Displays strategic insights in a clean list.
    *   `JainaReportRecommendations.tsx`: Shows priority recommendations with impact/effort badges.
3.  **View Refactor**: Completely rewrote `JainaReportView.tsx` to use these new components and layout.
4.  **Navigation**: Updated `JainaReportNav.tsx` to link to the new section IDs.
5.  **Type Fixes**: Adjusted `JainaChatSurface.tsx` and `stream.ts` to handle the `FrontendCheckpointReport` type correctly.

The frontend is now ready to consume the new backend payload format via `response.checkpoint_report`.
