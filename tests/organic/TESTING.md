# Organic Workspace Tests

This directory contains tests for the Organic Content Workspace.

## Files

- **`calendar-primitives.test.tsx`**: Integration test for `OrganicCalendarWorkspaceClient`. Verifies that the component renders the main sections (Week planning header, etc.) using `renderToStaticMarkup`.
- **`TimeGridCanvas.test.tsx`**: Unit test for `TimeGridCanvas`. Verifies the scrolling architecture (`overflow-x-auto`) and the minimum column widths (`min-w-[250px]`).
- **`mock-data.ts`**: Shared mock data for the tests.

## Notes

- The test environment (`happy-dom`) has limitations with `zustand` persist middleware and `@dnd-kit`. Complex interaction tests involving store persistence or drag-and-drop simulation are currently omitted to ensure stability.
- We focus on **structural verification** (classes, layout presence) to ensure the UI redesign requirements are met.
