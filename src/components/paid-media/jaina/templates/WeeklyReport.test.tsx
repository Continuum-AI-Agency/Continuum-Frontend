import { afterEach, describe, expect, it, mock } from 'bun:test';
import { formatFigure, validateTemplateBlock } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import {
  type AnswerTemplateBlockV2,
  type CheckpointReportV2,
  checkpointReportV2Schema,
} from '@/lib/jaina/schemas';
import { WEEKLY_REPORT_FIXTURE } from '../export/__fixtures__/weeklyReport';
import { ExportModeProvider } from '../export/ExportModeContext';
import TemplateBlock from './TemplateBlock';

// The J2 card shows toasts from its export buttons; nothing here presses them.
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: () => {} }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

const report: CheckpointReportV2 = checkpointReportV2Schema.parse(WEEKLY_REPORT_FIXTURE);
const block = report.blocks.find(
  (candidate): candidate is AnswerTemplateBlockV2 =>
    candidate.category === 'answer_template' && candidate.template_id === 'weekly_report',
);
if (!block?.weekly_report) throw new Error('fixture has no weekly_report block');
const body = block.weekly_report;

describe('weekly_report fixture', () => {
  it('is a block the contract accepts, so the renderer is tested on what the Backend may send', () => {
    expect(validateTemplateBlock(block)).toEqual([]);
  });
});

describe('WeeklyReport through TemplateBlock', () => {
  it('states both windows, the timezone and the currency in the header', () => {
    const { getByTestId } = render(<TemplateBlock block={block} isStreaming={false} />);
    const header = getByTestId('weekly-report-header');
    expect(header.querySelector('[data-period="a"]')?.getAttribute('data-period-range')).toBe(
      '2026-09-21..2026-09-27',
    );
    expect(header.querySelector('[data-period="b"]')?.getAttribute('data-period-range')).toBe(
      '2026-09-01..2026-09-27',
    );
    expect(header.textContent).toContain('Period A');
    expect(header.textContent).toContain('Period B');
    expect(getByTestId('weekly-report-timezone').textContent).toContain('America/Mexico_City');
    expect(getByTestId('weekly-report-currency').textContent).toContain('MXN');
  });

  it('prints the thesis with its figures', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const executive = container.querySelector('[data-template-part="executive"]');
    expect(executive?.querySelector('[data-figure-id="spend_a"]')).not.toBeNull();
  });

  it('gives every tile its value, its prior and its read in English', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const tiles = container.querySelectorAll('[data-tile]');
    expect(tiles.length).toBe(body.tiles.length);
    for (const tile of body.tiles) {
      const node = container.querySelector(`[data-tile="${tile.id}"]`);
      expect(node?.querySelector(`[data-figure-id="${tile.figure_id}"]`)).not.toBeNull();
      expect(node?.querySelector(`[data-figure-id="${tile.prior_figure_id}"]`)).not.toBeNull();
      expect(node?.textContent).toContain('Prior week');
    }
    const cpr = container.querySelector('[data-tile="cpr"] [data-tile-read-label]');
    expect(cpr?.textContent).toBe('Better');
  });

  it('renders one section per objective, each with its Signal and what / so what / now what', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const sections = container.querySelectorAll('[data-objective]');
    expect([...sections].map((node) => node.getAttribute('data-objective'))).toEqual(
      body.objectives.map((section) => section.objective),
    );
    for (const section of sections) {
      expect(section.querySelector('[data-testid="weekly-report-signal"]')?.textContent).toContain(
        'Signal',
      );
      for (const part of ['what', 'so_what', 'now_what']) {
        expect(section.querySelector(`[data-part="${part}"]`)).not.toBeNull();
      }
    }
  });

  it('draws the A|B table for an active objective with every row figure', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const leads = container.querySelector('[data-objective="leads"]');
    const table = leads?.querySelector('[data-testid="weekly-report-period-table"]');
    expect(table?.querySelectorAll('tbody tr').length).toBe(5);
    for (const id of ['leads_spend_a', 'leads_cpr_b', 'leads_delta_a', 'leads_target']) {
      expect(table?.querySelector(`[data-figure-id="${id}"]`)).not.toBeNull();
    }
    const printed = table?.querySelector('[data-figure-id="leads_delta_a"]')?.textContent;
    const figure = block.figures.find((candidate) => candidate.id === 'leads_delta_a');
    expect(figure).toBeDefined();
    if (figure) expect(printed).toBe(formatFigure(figure));
  });

  it("says 'No active campaigns' instead of a table for an objective that did not spend", () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const purchases = container.querySelector('[data-objective="purchases"]');
    expect(purchases?.getAttribute('data-objective-active')).toBe('false');
    expect(purchases?.querySelector('[data-testid="weekly-report-period-table"]')).toBeNull();
    expect(purchases?.querySelector('[data-testid="weekly-report-no-active"]')?.textContent).toBe(
      'No active campaigns in either period.',
    );
  });

  it('renders every recommendation as What · Where · Why · Expected impact (Estimate) · Priority', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    const cards = container.querySelectorAll('[data-recommendation]');
    expect(cards.length).toBe(body.recommendations.length);
    for (const card of body.recommendations) {
      const node = container.querySelector(`[data-recommendation="${card.id}"]`);
      expect(node?.querySelector('[data-part="what"]')?.textContent).toBe(card.what);
      const where = node?.querySelector('[data-part="where"]')?.textContent ?? '';
      expect(where).toContain(card.where.entity_name);
      expect(where).toContain(card.where.entity_id);
      const why = node?.querySelector('[data-part="why"]');
      expect(why?.querySelector(`[data-figure-id="${card.why.figure_ids[0]}"]`)).not.toBeNull();
      expect(why?.querySelector('[data-part="source"]')?.textContent).toContain(
        card.why.source.tool,
      );
      const impact = node?.querySelector('[data-part="impact"]');
      expect(impact?.getAttribute('data-impact-level')).toBe(card.impact.level);
      expect(impact?.querySelector('[data-impact-basis="estimate"]')?.textContent).toBe('Estimate');
      expect(node?.getAttribute('data-priority')).toBe(card.priority);
    }
    expect(
      container.querySelector(
        '[data-recommendation="card_creative_refresh"] [data-part="priority"]',
      )?.textContent,
    ).toBe('Next 2 weeks');
  });

  it('says so when there is no pending recommendation', () => {
    const empty: AnswerTemplateBlockV2 = {
      ...block,
      weekly_report: { ...body, recommendations: [] },
    };
    const { getByTestId } = render(<TemplateBlock block={empty} isStreaming={false} />);
    expect(getByTestId('weekly-report-recommendations').textContent).toContain(
      'No pending recommendations',
    );
  });

  it('prints every figure element as the contracts format it', () => {
    const { container } = render(
      <ExportModeProvider>
        <TemplateBlock block={block} isStreaming={false} />
      </ExportModeProvider>,
    );
    const elements = container.querySelectorAll('[data-testid="figure"]');
    expect(elements.length).toBeGreaterThan(30);
    for (const element of elements) {
      const figure = block.figures.find(
        (candidate) => candidate.id === element.getAttribute('data-figure-id'),
      );
      expect(figure).toBeDefined();
      if (figure) expect(element.textContent).toBe(formatFigure(figure));
    }
    expect(container.querySelector('[data-figure-unresolved]')).toBeNull();
  });
});

describe('WeeklyReport in the J2 card', () => {
  it('renders the report through JainaReportV2 with the body in the answer', async () => {
    const { JainaReportV2 } = await import('../components/JainaReportV2');
    const { container } = render(<JainaReportV2 report={report} isStreaming={false} />);
    const answer = container.querySelector('[data-report-section="answer"]');
    expect(answer?.querySelector('[data-testid="weekly-report"]')).not.toBeNull();
    expect(container.querySelector('[data-template-part="justification"]')).not.toBeNull();
  });
});
