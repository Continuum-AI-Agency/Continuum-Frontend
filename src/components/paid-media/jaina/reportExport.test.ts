import { describe, expect, it, mock } from 'bun:test';
import type { CheckpointReportV2 } from '@/lib/jaina/schemas';

import {
  buildJainaReportHtml,
  buildJainaReportV2SheetsExportRequest,
  createJainaReportFilename,
  createJainaReportHtmlFilename,
  formatMetricValueForPdf,
  shareJainaReportFile,
} from './reportExport';

describe('createJainaReportFilename', () => {
  it('uses the current date segment for the export file name', () => {
    const fixedDate = new Date('2026-03-09T12:34:56.000Z');
    expect(createJainaReportFilename(fixedDate)).toBe('jaina-report-2026-03-09.pdf');
  });

  it('creates html file names', () => {
    const fixedDate = new Date('2026-03-09T12:34:56.000Z');
    expect(createJainaReportHtmlFilename(fixedDate)).toBe('jaina-report-2026-03-09.html');
  });
});

describe('formatMetricValueForPdf', () => {
  it('formats currency metrics', () => {
    expect(
      formatMetricValueForPdf({
        metric: 'Spend',
        value: 1234.5,
        format: 'currency',
      }),
    ).toBe('$1,234.50');
  });

  it('formats percentage metrics', () => {
    expect(
      formatMetricValueForPdf({
        metric: 'CTR',
        value: 4.2,
        format: 'percentage',
      }),
    ).toBe('4.2%');
  });

  it('applies custom prefix and suffix for numeric values', () => {
    expect(
      formatMetricValueForPdf({
        metric: 'Impressions',
        value: 12345,
        prefix: '~',
        suffix: ' units',
      }),
    ).toBe('~12,345 units');
  });
});

describe('buildJainaReportHtml', () => {
  it('renders core legacy report sections and escapes unsafe content', () => {
    const html = buildJainaReportHtml({
      report: {
        language: 'en',
        report_title: '<Paid Report>',
        executive_summary: 'Summary <script>',
        budget: null,
        performance_snapshot: [{ metric: 'Spend', value: 123, format: 'currency' }],
        blocks: [],
        sections: [
          {
            heading: 'Campaigns',
            scope: 'account',
            summary: 'Campaign summary',
            highlights: [],
            tables: [],
            actions: [],
            confidence: null,
            cached_sources: [],
            graphs: [],
          },
        ],
        strategic_recommendations: [
          {
            title: 'Shift budget',
            rationale: 'Move spend to winners',
            expected_impact: 'Higher ROAS',
            priority: 'now',
          },
        ],
        follow_up_questions: ['What changed?'],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        graphs: [
          {
            title: 'Spend trend',
            graph_type: 'line',
            labels: ['Mon'],
            datasets: [{ label: 'Spend', data: [123] }],
          },
        ],
      },
      fallbackTables: [{ headers: ['Campaign', 'Spend'], rows: [['A', '$123']] }],
    });

    expect(html).toContain('&lt;Paid Report&gt;');
    expect(html).toContain('Performance Snapshot');
    expect(html).toContain('Spend trend');
    expect(html).toContain('data-jaina-chart');
    expect(html).toContain('chart-payload');
    expect(html).toContain('Chart type');
    expect(html).toContain('Data Table 1');
    expect(html).toContain('Shift budget');
    expect(html).toContain('Summary &lt;script&gt;');
    expect(html).not.toContain('Summary <script>');
  });
});

describe('buildJainaReportV2SheetsExportRequest', () => {
  it('projects visible tables and summary within the shared contract limits', () => {
    const columns = Array.from({ length: 55 }, (_, index) => ({
      key: `column-${index}`,
      label: `Column ${index}`,
      format: 'text' as const,
      align: 'left' as const,
    }));
    const blocks = Array.from({ length: 12 }, (_, blockIndex) => ({
      block_id: `block-${blockIndex}`,
      category: 'data_table' as const,
      scope: 'current_account',
      title: `Table ${blockIndex}`,
      priority: blockIndex,
      provenance: null,
      columns,
      rows: Array.from({ length: 510 }, (_, rowIndex) =>
        Object.fromEntries(columns.map((column) => [column.key, `${rowIndex}-${column.key}`])),
      ),
      notes: null,
      dataset_id: null,
      row_meta: null,
      render_mode: 'table' as const,
      card_fields: null,
    }));
    const report = {
      executive_summary: 'x'.repeat(6_000),
      blocks,
    } as unknown as CheckpointReportV2;

    const request = buildJainaReportV2SheetsExportRequest({
      report,
      visibleBlocks: report.blocks,
    });

    expect(request.sheets).toHaveLength(10);
    expect(request.sheets.every((sheet) => sheet.title.length <= 80)).toBe(true);
    expect(request.sheets.every((sheet) => sheet.rows.length <= 500)).toBe(true);
    expect(request.sheets.every((sheet) => sheet.rows.every((row) => row.length <= 50))).toBe(true);
    expect(String(request.sheets[0].rows[1][1])).toHaveLength(5_000);
  });
});

describe('shareJainaReportFile', () => {
  it('hands the exported file to the native confirmation surface', async () => {
    const share = mock(async () => {});
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    Object.defineProperties(navigator, {
      share: { configurable: true, value: share },
      canShare: { configurable: true, value: () => true },
    });

    try {
      const file = new File(['report'], 'jaina-report.html', { type: 'text/html' });
      await expect(shareJainaReportFile(file, 'Jaina report')).resolves.toBe('shared');
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Jaina report', files: [file] }),
      );
    } finally {
      Object.defineProperties(navigator, {
        share: { configurable: true, value: originalShare },
        canShare: { configurable: true, value: originalCanShare },
      });
    }
  });
});
