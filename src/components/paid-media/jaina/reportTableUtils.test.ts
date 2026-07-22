import { describe, expect, it } from 'bun:test';
import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';
import { buildJitSnapshotFallbackTables, hasTimelineCharts } from './reportTableUtils';

function createBaseReport(
  overrides: Partial<FrontendCheckpointReport> = {},
): FrontendCheckpointReport {
  return {
    language: 'en',
    executive_summary: 'Summary',
    performance_snapshot: [],
    sections: [],
    strategic_recommendations: [],
    follow_up_questions: [],
    handoff_trace: [],
    cached_sources: [],
    graphs: [],
    ...overrides,
  };
}

describe('reportTableUtils', () => {
  it('builds fallback tables for snapshot/jit payloads without timeline charts', () => {
    const report = createBaseReport({
      performance_snapshot: [{ metric: 'Top ROAS', value: '1.92', context: 'Campaign A' }],
      graphs: [
        {
          type: 'bar',
          title: 'ROAS Snapshot',
          data: [
            { label: 'Campaign A', value: 1.92 },
            { label: 'Campaign B', value: 1.71 },
          ],
        },
      ],
    });

    expect(hasTimelineCharts(report)).toBe(false);

    const tables = buildJitSnapshotFallbackTables(report);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0].headers).toContain('Metric');
    expect(tables[0].rows[0]).toContain('Top ROAS');
    expect(tables.some((table) => table.headers.includes('Chart'))).toBe(true);
  });

  it('builds fallback tables from canonical labels + series values graphs', () => {
    const report = createBaseReport({
      performance_snapshot: [{ metric: 'CTR', value: 2.41, change: 0.3 }],
      graphs: [
        {
          title: 'Channel Mix',
          graph_type: 'bar',
          labels: ['Prospecting', 'Retargeting'],
          series: [
            {
              name: 'Spend',
              values: [1200, 840],
            },
            {
              name: 'Revenue',
              values: [2800, 2100],
            },
          ],
          cached_sources: [],
        },
      ],
    });

    const tables = buildJitSnapshotFallbackTables(report);
    const graphTable = tables.find((table) => table.headers.includes('Spend'));
    expect(graphTable).toBeDefined();
    expect(graphTable?.rows[0]).toEqual(['Channel Mix', 'Prospecting', '1200', '2800']);
  });

  it('skips fallback tables when timeline charts are present', () => {
    const report = createBaseReport({
      graphs: [
        {
          type: 'line',
          title: 'Daily ROAS',
          data: [
            { label: '2026-02-10', value: 1.2 },
            { label: '2026-02-11', value: 1.4 },
          ],
        },
      ],
      performance_snapshot: [{ metric: 'Top ROAS', value: '1.92', context: 'Campaign A' }],
    });

    expect(hasTimelineCharts(report)).toBe(true);
    expect(buildJitSnapshotFallbackTables(report)).toEqual([]);
  });

  it('detects timeline charts for canonical graph_type + labels payloads', () => {
    const report = createBaseReport({
      graphs: [
        {
          title: 'Daily Trend',
          graph_type: 'line',
          labels: ['2026-02-10', '2026-02-11', '2026-02-12'],
          series: [
            {
              name: 'ROAS',
              values: [1.2, 1.4, 1.35],
            },
          ],
          cached_sources: [],
        },
      ],
      performance_snapshot: [{ metric: 'ROAS', value: 1.35 }],
    });

    expect(hasTimelineCharts(report)).toBe(true);
    expect(buildJitSnapshotFallbackTables(report)).toEqual([]);
  });
});
