import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';

const showMock = mock();
const buildSheetsRequestMock = mock(() => ({
  title: 'Legacy report',
  sheets: [{ title: 'Summary', rows: [['Report']] }],
}));
const exportToSheetsMock = mock(async () => ({
  spreadsheet_id: 'sheet-1',
  url: 'https://docs.google.com/spreadsheets/d/sheet-1',
}));
const createHtmlFileMock = mock(() => new File(['report'], 'jaina-report.html'));
const shareFileMock = mock(async () => 'shared' as const);
const downloadFileMock = mock();
const openMailDraftMock = mock();
const fallbackTables = [{ headers: ['Campaign'], rows: [['Alpha']] }];

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <p>{content}</p>,
}));

mock.module('@/components/kibo-ui/pill', () => ({
  Pill: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

mock.module('@/components/ai-elements/suggestion', () => ({
  Suggestions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Suggestion: ({ suggestion }: { suggestion: string }) => (
    <button type="button">{suggestion}</button>
  ),
}));

mock.module('../reportTableUtils', () => ({
  buildJitSnapshotFallbackTables: () => fallbackTables,
}));

mock.module('../reportExport', () => ({
  buildLegacyJainaSheetsExportRequest: buildSheetsRequestMock,
  createJainaReportHtmlFile: createHtmlFileMock,
  downloadFile: downloadFileMock,
  downloadJainaReportHtml: mock(),
  downloadJainaReportPdf: mock(async () => {}),
  exportJainaReportToSheets: exportToSheetsMock,
  openJainaReportMailDraft: openMailDraftMock,
  shareJainaReportFile: shareFileMock,
}));

mock.module('./JainaReportCharts', () => ({
  isJainaChartInput: () => false,
  JainaReportCharts: () => null,
}));
mock.module('./JainaReportMetrics', () => ({ JainaReportMetrics: () => null }));
mock.module('./JainaReportRecommendations', () => ({ JainaReportRecommendations: () => null }));
mock.module('./JainaReportSections', () => ({ JainaReportSections: () => null }));
mock.module('./JainaReportTables', () => ({ JainaReportTables: () => null }));

const { JainaInlineReport } = await import('./JainaInlineReport');

const report = {
  language: 'en',
  report_title: 'Legacy report',
  executive_summary: 'Account performance summary',
  budget: null,
  performance_snapshot: [],
  blocks: [],
  sections: [],
  strategic_recommendations: [],
  follow_up_questions: [],
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  graphs: [],
} as FrontendCheckpointReport;

beforeEach(() => {
  showMock.mockClear();
  buildSheetsRequestMock.mockClear();
  exportToSheetsMock.mockClear();
  exportToSheetsMock.mockResolvedValue({
    spreadsheet_id: 'sheet-1',
    url: 'https://docs.google.com/spreadsheets/d/sheet-1',
  });
  createHtmlFileMock.mockClear();
  shareFileMock.mockReset();
  shareFileMock.mockResolvedValue('shared');
  downloadFileMock.mockClear();
  openMailDraftMock.mockClear();
  window.open = mock(() => null);
});

afterEach(cleanup);

describe('JainaInlineReport export actions', () => {
  it('projects the legacy report and its existing fallback tables to Sheets', async () => {
    render(<JainaInlineReport report={report} isStreaming={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export report to Google Sheets' }));

    await waitFor(() => expect(exportToSheetsMock).toHaveBeenCalledTimes(1));
    expect(buildSheetsRequestMock).toHaveBeenCalledWith({ report, fallbackTables });
  });

  it('does not download or open email before the native confirmation resolves', async () => {
    let resolveShare: ((result: 'cancelled') => void) | undefined;
    shareFileMock.mockImplementation(
      () => new Promise((resolve) => (resolveShare = resolve as (result: 'cancelled') => void)),
    );
    render(<JainaInlineReport report={report} isStreaming={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Share report by email' }));

    await waitFor(() => expect(shareFileMock).toHaveBeenCalledTimes(1));
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(openMailDraftMock).not.toHaveBeenCalled();

    resolveShare?.('cancelled');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Share report by email' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });
});
