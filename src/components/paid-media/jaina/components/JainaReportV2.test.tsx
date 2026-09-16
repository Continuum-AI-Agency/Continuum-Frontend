import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import type { CheckpointReportV2 } from '@/lib/jaina/schemas';

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
  buttonVariants: () => '',
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
}));

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <p>{content}</p>,
}));

mock.module('@/components/ai-elements/suggestion', () => ({
  Suggestions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Suggestion: ({
    suggestion,
    onClick,
  }: {
    suggestion: string;
    onClick?: (suggestion: string) => void;
  }) => (
    <button type="button" onClick={() => onClick?.(suggestion)}>
      {suggestion}
    </button>
  ),
}));

mock.module('../blocks/BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { block_id: string; title: string } }) => (
    <article data-testid={`module-${block.block_id}`}>{block.title}</article>
  ),
}));

const buildSheetsRequestMock = mock(() => ({
  title: 'Jaina Performance Analysis',
  sheets: [{ title: 'Summary', rows: [['Report']] }],
}));
const exportToSheetsMock = mock(async () => ({
  spreadsheet_id: 'sheet-1',
  url: 'https://docs.google.com/spreadsheets/d/sheet-1',
}));
const deliveryRequestMock = mock(async () => ({ ok: true }));

mock.module('@/lib/api/http', () => ({
  http: { request: deliveryRequestMock },
}));

mock.module('../reportExport', () => ({
  buildJainaReportV2SheetsExportRequest: buildSheetsRequestMock,
  createJainaReportV2PdfFile: mock(async () => new File(['report'], 'report.pdf')),
  downloadFile: mock(),
  downloadJainaReportV2Pdf: mock(async () => 'text_fallback'),
  exportJainaReportToSheets: exportToSheetsMock,
  openJainaReportMailDraft: mock(),
  shareJainaReportFile: mock(async () => 'shared'),
}));

const { JainaReportV2 } = await import('./JainaReportV2');

afterEach(cleanup);

const report = {
  language: 'en',
  executive_summary: 'Account performance summary',
  reasoning_trace: '',
  blocks: [
    {
      block_id: 'risks',
      category: 'narrative',
      scope: 'current_account',
      title: 'Performance risks',
      priority: 1,
      provenance: null,
      body: 'Watch rising CPA.',
      highlights: [],
      citations: [],
    },
    {
      block_id: 'wins',
      category: 'narrative',
      scope: 'current_account',
      title: 'Recent wins',
      priority: 0,
      provenance: null,
      body: 'ROAS improved.',
      highlights: [],
      citations: [],
    },
  ],
  follow_up_questions: ['Where can we scale next?'],
  media_map: {},
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  _meta: {
    schema_version: '2',
    block_count: 2,
    has_charts: false,
    has_media: false,
    primary_scope: 'current_account',
  },
} as CheckpointReportV2;

describe('JainaReportV2 module controls', () => {
  it('shows every selected module by default and lets each one be hidden and shown', () => {
    render(<JainaReportV2 report={report} isStreaming={false} />);

    expect(screen.getByTestId('module-wins')).toBeTruthy();
    expect(screen.getByTestId('module-risks')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent wins module' }));
    expect(screen.queryByTestId('module-wins')).toBeNull();
    expect(screen.getByTestId('module-risks')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show Recent wins module' }));
    expect(screen.getByTestId('module-wins')).toBeTruthy();
  });

  it('keeps follow-up suggestions clickable', () => {
    const onSuggestionClick = mock();
    render(
      <JainaReportV2 report={report} isStreaming={false} onSuggestionClick={onSuggestionClick} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Where can we scale next?' }));
    expect(onSuggestionClick).toHaveBeenCalledWith('Where can we scale next?');
  });

  it('does not add module controls while the report is streaming', () => {
    render(<JainaReportV2 report={report} isStreaming />);

    expect(screen.queryByRole('group', { name: 'Report modules' })).toBeNull();
    expect(screen.getByTestId('module-wins')).toBeTruthy();
  });

  it('exports only modules that are visible', async () => {
    buildSheetsRequestMock.mockClear();
    exportToSheetsMock.mockClear();
    render(<JainaReportV2 report={report} isStreaming={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent wins module' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Export visible modules to Google Sheets' }),
    );

    await waitFor(() => expect(exportToSheetsMock).toHaveBeenCalledTimes(1));
    const [{ visibleBlocks }] = buildSheetsRequestMock.mock.calls[0] as [
      { visibleBlocks: CheckpointReportV2['blocks'] },
    ];
    expect(visibleBlocks.map((block) => block.block_id)).toEqual(['risks']);
  });

  it('acknowledges hydration render and PDF fallback against the same run identity', async () => {
    deliveryRequestMock.mockClear();
    render(
      <JainaReportV2
        report={report}
        isStreaming={false}
        runId="run_42"
        deliverySource="hydration_replay"
      />,
    );

    await waitFor(() => expect(deliveryRequestMock).toHaveBeenCalledTimes(1));
    expect(deliveryRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/api/agents/jaina/chat/runs/run_42/delivery',
        body: {
          kind: 'hydration_replay',
          status: 'success',
          report_id: 'run_42:checkpoint_report',
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export report as PDF' }));
    await waitFor(() => expect(deliveryRequestMock).toHaveBeenCalledTimes(2));
    expect(deliveryRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          kind: 'pdf',
          status: 'fallback',
          report_id: 'run_42:checkpoint_report',
        },
      }),
    );
  });
});
