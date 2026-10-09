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
  // Keeps `className`: the ink the answer is set in is the thing under test below.
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <p className={className}>{content}</p>
  ),
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
const downloadPdfMock = mock(async () => {});
const downloadHtmlMock = mock(async () => {});

mock.module('@/lib/api/http', () => ({
  http: { request: deliveryRequestMock },
}));

const reportExport = await import('../reportExport');

// Spread the real module: `mock.module` is process-global, so a partial mock
// deletes this module's other exports for every test file that loads later.
mock.module('../reportExport', () => ({
  ...reportExport,
  buildJainaReportV2SheetsExportRequest: buildSheetsRequestMock,
  createJainaReportV2HtmlFile: mock(async () => new File(['<html>'], 'report.html')),
  downloadFile: mock(),
  downloadJainaReportV2Html: downloadHtmlMock,
  downloadJainaReportV2Pdf: downloadPdfMock,
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

describe('JainaReportV2 executive summary', () => {
  it('sets the judged figure of the answer in its severity tone, inside the sentence', () => {
    render(
      <JainaReportV2
        report={{
          ...report,
          executive_summary:
            'Over the [window: last 30 days] **ITESO** returned [risk: 0.49 ROAS] on its spend.',
        }}
        isStreaming={false}
      />,
    );
    const risk = document.querySelector('[data-prose-mark="risk"]');
    expect(risk?.textContent).toBe('0.49 ROAS');
    expect(risk?.className).toContain('text-destructive');
    expect(document.querySelector('[data-prose-mark="window"]')?.className).toContain(
      'text-muted-foreground',
    );
    expect(document.body.textContent).not.toContain('[risk:');
  });
});

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

  it('acknowledges a hydration render and a successful PDF export against the same run identity', async () => {
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
          status: 'success',
          report_id: 'run_42:checkpoint_report',
        },
      }),
    );
  });

  // `delivery.pdf.status` is the only production signal that says whether an export
  // actually produced a document, so a failed export has to report itself as one.
  it('acknowledges a failed PDF export as a fallback', async () => {
    deliveryRequestMock.mockClear();
    downloadPdfMock.mockImplementationOnce(async () => {
      throw new Error('Export timed out: charts did not finish drawing');
    });
    render(<JainaReportV2 report={report} isStreaming={false} runId="run_42" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export report as PDF' }));
    await waitFor(() => expect(deliveryRequestMock).toHaveBeenCalledTimes(1));
    expect(deliveryRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          kind: 'pdf',
          status: 'fallback',
          report_id: 'run_42:checkpoint_report',
        },
      }),
    );
  });

  // The export receives blocks in the order the report carries them — which is the order
  // `selectBlocksForPresentation` built: framing, then the plan's modules in plan order,
  // then the closing blocks that read what is above them.
  //
  // It used to re-sort by `priority`, and so did the screen. `priority` is an EMPHASIS rank,
  // not a position: `priorityFor` gives `primary` to the plan's FIRST module and `secondary`
  // to everything else including the opening `data_scope` frame, which is hard-coded
  // `secondary`. Measured on a live strategy turn, that sort rendered
  // [metric_grid, insight_list, actions, data_scope] from a report the backend emitted as
  // [data_scope, metric_grid, insight_list, actions] — the figures hoisted above the reading
  // and the window strip pushed below the closing moves, on screen and in the PDF alike.
  it('exports the visible modules as HTML in the report’s own reading order', async () => {
    downloadHtmlMock.mockClear();
    render(<JainaReportV2 report={report} isStreaming={false} runId="run_42" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export report as HTML' }));
    await waitFor(() => expect(downloadHtmlMock).toHaveBeenCalledTimes(1));
    const blocks = downloadHtmlMock.mock.calls[0][0].blocks as Array<{ block_id: string }>;
    expect(blocks.map((block) => block.block_id)).toEqual(['risks', 'wins']);
  });
});

describe('JainaReportV2 — the answer reads as the answer', () => {
  it('sets the executive summary in reading ink, not the unjudged muted ink', () => {
    // It used to render `text-sm leading-relaxed text-muted-foreground`. Streamdown sets no
    // colour of its own on headings, bold runs or table cells, so that single class muted the
    // whole answer — and by `reading.ts`'s law muted ink means "nobody judged this", applied
    // to the one paragraph somebody did.
    render(<JainaReportV2 report={report} isStreaming={false} />);
    const summary = screen.getByText('Account performance summary');
    expect(summary.className).toContain('text-foreground');
    expect(summary.className).toContain('text-xl');
    // The lead sentence: the answer step at semibold, so it outweighs every module under it.
    expect(summary.className).toContain('font-semibold');
    expect(summary.className).not.toContain('font-medium');
    expect(summary.className).not.toContain('text-muted-foreground');
  });

  it('puts the answer above the module controls that operate on its evidence', () => {
    render(<JainaReportV2 report={report} isStreaming={false} />);
    const summary = screen.getByText('Account performance summary');
    const controls = screen.getByRole('group', { name: 'Report modules' });
    expect(
      summary.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });
});

describe('JainaReportV2 — the justification under the answer', () => {
  const moduleBlock = (block_id: string, category: string, title: string) =>
    ({
      block_id,
      category,
      scope: 'current_account',
      title,
      priority: 1,
      provenance: null,
    }) as unknown as CheckpointReportV2['blocks'][number];

  // The backend's reading order, which each section keeps: the scope frame opens the
  // report, the figures sit between the reading and the closing moves.
  const strategyReport = {
    ...report,
    blocks: [
      moduleBlock('scope', 'data_scope', 'Data scope'),
      moduleBlock('reading', 'insight_list', 'What stands out'),
      moduleBlock('kpis', 'metric_grid', 'Headline KPIs'),
      moduleBlock('trend', 'chart', 'Spend trend'),
      moduleBlock('rows', 'data_table', 'Campaign table'),
      moduleBlock('moves', 'actions', 'Next moves'),
    ],
  } as CheckpointReportV2;

  const moduleIdsIn = (section: 'answer' | 'justification') =>
    Array.from(
      document.querySelectorAll(`[data-report-section="${section}"] [data-testid^="module-"]`),
    ).map((node) => node.getAttribute('data-testid')?.replace('module-', ''));

  it('keeps the window, the reading, the tiles and the moves with the answer, in the backend’s order', () => {
    // The J2 card: the window line and the metric tiles are part of the answer, not evidence
    // under it (`sectionOfBlockCategory` in the contract puts data_scope and metric_grid in
    // the answer section). The order is the Backend's, untouched.
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    expect(moduleIdsIn('answer')).toEqual(['scope', 'reading', 'kpis', 'moves']);
  });

  it('groups the figures under an always-open Evidence section, each block folded, in the backend’s order', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    const justification = screen.getByRole('region', { name: 'Evidence' });
    expect(justification.tagName).not.toBe('DETAILS');
    expect(justification.textContent).toContain('The data behind the answer');
    expect(moduleIdsIn('justification')).toEqual(['trend', 'rows']);
    const folds = Array.from(justification.querySelectorAll('details'));
    expect(folds.map((fold) => fold.getAttribute('data-evidence-fold'))).toEqual(['trend', 'rows']);
  });

  it('opens the first evidence fold by default and leaves the rest closed', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    const folds = Array.from(document.querySelectorAll('[data-evidence-fold]'));
    expect(folds.map((fold) => fold.hasAttribute('open'))).toEqual([true, false]);
    // The disclosure line is the block's title, so a closed fold still says what it holds.
    expect(folds[1].querySelector('summary')?.textContent).toContain('Campaign table');
  });

  it('puts the follow-up questions last, after the evidence and the export chrome', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    const followUps = document.querySelector('[data-report-section="follow-ups"]');
    expect(followUps?.textContent).toContain('Where can we scale next?');
    const evidence = screen.getByRole('region', { name: 'Evidence' });
    const exportButton = screen.getByRole('button', { name: 'Export report as PDF' });
    for (const before of [evidence, exportButton]) {
      expect(
        before.compareDocumentPosition(followUps as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeGreaterThan(0);
    }
  });

  it('sets two consecutive WHY blocks side by side on a wide answer, in the backend’s order', () => {
    render(
      <JainaReportV2
        report={{
          ...strategyReport,
          blocks: [
            moduleBlock('scope', 'data_scope', 'Data scope'),
            moduleBlock('reading', 'insight_list', 'What stands out'),
            moduleBlock('more', 'insight_list', 'What else'),
            moduleBlock('moves', 'actions', 'Next moves'),
          ],
        }}
        isStreaming={false}
      />,
    );
    const run = document.querySelector('[data-report-run="why"]');
    expect(run?.className).toContain('@3xl:grid-cols-2');
    expect(
      Array.from(run?.querySelectorAll('[data-testid^="module-"]') ?? []).map((node) =>
        node.getAttribute('data-testid'),
      ),
    ).toEqual(['module-reading', 'module-more']);
    expect(moduleIdsIn('answer')).toEqual(['scope', 'reading', 'more', 'moves']);
  });

  it('sets the justification below the answer', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    const moves = screen.getByTestId('module-moves');
    const justification = screen.getByRole('region', { name: 'Evidence' });
    expect(
      moves.compareDocumentPosition(justification) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });

  it('shows no Evidence heading when the answer carries no figures', () => {
    render(
      <JainaReportV2
        report={{ ...strategyReport, blocks: [moduleBlock('reading', 'insight_list', 'Reading')] }}
        isStreaming={false}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Evidence' })).toBeNull();
    expect(screen.queryByText('Evidence')).toBeNull();
    expect(moduleIdsIn('answer')).toEqual(['reading']);
  });

  it('keeps hidden modules hidden, and drops the heading once every figure is hidden', () => {
    render(
      <JainaReportV2
        report={{
          ...strategyReport,
          blocks: [
            moduleBlock('reading', 'insight_list', 'What stands out'),
            moduleBlock('trend', 'chart', 'Spend trend'),
          ],
        }}
        isStreaming={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide Spend trend module' }));
    expect(screen.queryByTestId('module-trend')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Evidence' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show Spend trend module' }));
    expect(moduleIdsIn('justification')).toEqual(['trend']);
  });

  const labelsOnScreen = () =>
    Array.from(document.querySelectorAll('[data-report-label]')).map((node) => ({
      stratum: node.getAttribute('data-report-label'),
      text: node.textContent,
    }));

  it('labels the three strata in the answer’s language — Spanish read from the sentence', () => {
    render(
      <JainaReportV2
        report={{
          ...strategyReport,
          executive_summary:
            'Pausar el anuncio ALEIRA · Copy 3: cada conversación cuesta 54.84 MXN, 38% más que el promedio de la cuenta.',
        }}
        isStreaming={false}
      />,
    );
    expect(labelsOnScreen()).toEqual([
      { stratum: 'why', text: 'Por qué' },
      { stratum: 'action', text: 'Acción' },
      { stratum: 'evidence', text: 'Evidencia' },
    ]);
    expect(screen.getByRole('region', { name: 'Evidencia' }).textContent).toContain(
      'Los datos detrás de la respuesta',
    );
    expect(screen.queryByText('Justification')).toBeNull();
    // The labels name the strata; they never reorder the blocks.
    expect(moduleIdsIn('answer')).toEqual(['scope', 'reading', 'kpis', 'moves']);
    expect(moduleIdsIn('justification')).toEqual(['trend', 'rows']);
  });

  it('labels the strata in Spanish when the report states its language, whatever the sentence', () => {
    render(
      <JainaReportV2
        report={{
          ...strategyReport,
          language: 'es',
          executive_summary: 'Account performance summary',
        }}
        isStreaming={false}
      />,
    );
    expect(labelsOnScreen().map((label) => label.text)).toEqual(['Por qué', 'Acción', 'Evidencia']);
  });

  it('labels the strata in English otherwise, each where its stratum begins', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    expect(labelsOnScreen()).toEqual([
      { stratum: 'why', text: 'Why' },
      { stratum: 'action', text: 'Action' },
      { stratum: 'evidence', text: 'Evidence' },
    ]);
    const why = screen.getByText('Why');
    const scope = screen.getByTestId('module-scope');
    const reading = screen.getByTestId('module-reading');
    const action = screen.getByText('Action');
    const moves = screen.getByTestId('module-moves');
    // The window line opens the card and takes no label; Why sits over the reading.
    expect(scope.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(
      0,
    );
    expect(why.compareDocumentPosition(reading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(
      0,
    );
    expect(
      reading.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
    expect(
      action.compareDocumentPosition(moves) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });

  it('sets every label at the 12px caps step and nothing smaller', () => {
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    const labels = document.querySelectorAll('[data-report-label]');
    expect(labels.length).toBe(3);
    for (const node of labels) {
      expect(node.className).toContain('text-xs');
      expect(node.className).toContain('uppercase');
      expect(node.className).not.toMatch(/text-[23]xs/);
    }
  });

  it('still exports the visible modules in the report’s own order', async () => {
    downloadHtmlMock.mockClear();
    render(<JainaReportV2 report={strategyReport} isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export report as HTML' }));
    await waitFor(() => expect(downloadHtmlMock).toHaveBeenCalledTimes(1));
    const blocks = downloadHtmlMock.mock.calls[0][0].blocks as Array<{ block_id: string }>;
    expect(blocks.map((block) => block.block_id)).toEqual([
      'scope',
      'reading',
      'kpis',
      'trend',
      'rows',
      'moves',
    ]);
  });
});

describe('JainaReportV2 — the J2 card takes no label over its own parts', () => {
  const j2Block = (block: Record<string, unknown>) =>
    ({
      scope: 'current_account',
      priority: 1,
      provenance: null,
      ...block,
    }) as unknown as CheckpointReportV2['blocks'][number];

  // The Backend's J2 order: the window, the tiles, the three-box reading, the moves, then
  // the evidence. Nothing here re-sorts it.
  const j2Report = {
    ...report,
    language: 'es',
    executive_summary:
      'Este mes llevamos 68,109 MXN de gasto, 1,552 conversaciones y un costo por conversación de 36.55 MXN, 4% arriba del objetivo de 35.',
    blocks: [
      j2Block({ block_id: 'scope', category: 'data_scope', title: 'Alcance de los datos' }),
      j2Block({ block_id: 'tiles', category: 'metric_grid', title: 'Este mes' }),
      j2Block({
        block_id: 'reading',
        category: 'narrative',
        title: 'Lectura',
        body: 'x',
        what: 'SEDE Cañadas trae el 31% de las conversaciones con el 27% del gasto.',
        so_what: 'El costo promedio está 1.55 MXN arriba del objetivo.',
        now_what: 'Mover 300 MXN al día de ITESO a Cañadas.',
        highlights: [],
        citations: [],
      }),
      j2Block({ block_id: 'moves', category: 'actions', title: 'Acciones' }),
      j2Block({ block_id: 'rows', category: 'data_table', title: 'Las 4 campañas' }),
      j2Block({ block_id: 'trend', category: 'chart', title: 'Gasto por día' }),
    ],
  } as CheckpointReportV2;

  it('labels only Acción and Evidencia: the window, the tiles and the three boxes label themselves', () => {
    render(<JainaReportV2 report={j2Report} isStreaming={false} />);
    expect(
      Array.from(document.querySelectorAll('[data-report-label]')).map((node) => node.textContent),
    ).toEqual(['Acción', 'Evidencia']);
  });

  it('keeps the Backend’s J2 order across both sections', () => {
    render(<JainaReportV2 report={j2Report} isStreaming={false} />);
    const ids = Array.from(document.querySelectorAll('[data-testid^="module-"]')).map((node) =>
      node.getAttribute('data-testid')?.replace('module-', ''),
    );
    expect(ids).toEqual(['scope', 'tiles', 'reading', 'moves', 'rows', 'trend']);
  });

  it('still says Por qué over a narrative that carries only a body', () => {
    render(
      <JainaReportV2
        report={{
          ...j2Report,
          blocks: [
            j2Report.blocks[0],
            j2Block({
              block_id: 'reading',
              category: 'narrative',
              title: 'Lectura',
              body: 'x',
              what: null,
              so_what: null,
              now_what: null,
              highlights: [],
              citations: [],
            }),
          ],
        }}
        isStreaming={false}
      />,
    );
    expect(
      Array.from(document.querySelectorAll('[data-report-label]')).map((node) => node.textContent),
    ).toEqual(['Por qué']);
  });
});
