import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { MetricGridBlockV2 } from '@/lib/jaina/schemas';
import type { AnswerLanguage } from '../answerLanguage';
import { AnswerLanguageProvider } from '../answerLanguageContext';
import MetricGridBlock from './MetricGridBlock';

afterEach(cleanup);

type Metric = MetricGridBlockV2['metrics'][number];

const metric = (overrides: Partial<Metric>): Metric => ({
  label: 'Cost per result',
  value: 34,
  unit: 'MXN',
  format: 'currency',
  percent_basis: null,
  change: 19,
  change_direction: 'down',
  severity: 'neutral',
  ...overrides,
});

const gridOf = (metrics: Metric[]): MetricGridBlockV2 => ({
  block_id: 'live-metrics',
  category: 'metric_grid',
  scope: 'account',
  title: 'Live delivery',
  priority: 'primary',
  provenance: null,
  dataset_id: 'live:summary',
  evidence_refs: [],
  metrics,
});

const block = (unit: string | null): MetricGridBlockV2 => ({
  block_id: 'live-metrics',
  category: 'metric_grid',
  scope: 'account',
  title: 'Live delivery',
  priority: 'primary',
  provenance: null,
  dataset_id: 'live:summary',
  evidence_refs: ['meta:insights'],
  metrics: [
    {
      label: 'Delivered spend',
      value: 1_500,
      unit,
      format: 'currency',
      change: null,
      change_direction: null,
      severity: 'neutral',
    },
  ],
});

describe('MetricGridBlock', () => {
  it('uses the source currency and never defaults an unknown currency to USD', () => {
    const { rerender } = render(<MetricGridBlock block={block('MXN')} isStreaming={false} />);
    expect(screen.getByText('MX$1,500.00')).toBeTruthy();

    rerender(<MetricGridBlock block={block(null)} isStreaming={false} />);
    expect(screen.getByText('1,500 (currency unknown)')).toBeTruthy();
    expect(screen.queryByText('$1,500.00')).toBeNull();
  });
});

describe('MetricGridBlock — figures a reader can scan down a column', () => {
  it('gives every figure its own cell with lined-up digits', () => {
    // It used to render through the shared inline `MetricStrip`, which wraps into a
    // paragraph of `LABEL value · LABEL value · …`. Real reports carry four to seven
    // metrics with sentence-length labels, and wrapped they are exactly the
    // undifferentiated run of text this block exists to avoid.
    render(
      <MetricGridBlock
        block={gridOf([
          metric({ label: 'Cost per result' }),
          metric({ label: 'Spend', value: 87_552, change: null, change_direction: null }),
        ])}
        isStreaming={false}
      />,
    );
    const figures = document.querySelectorAll('dd > span:first-child');
    expect(figures.length).toBe(2);
    for (const figure of figures) {
      expect(figure.className).toContain('tabular-nums');
    }
  });

  it("reads a cost that FELL as good news, through the metric's polarity", () => {
    render(
      <MetricGridBlock
        block={gridOf([metric({ label: 'Cost per result', change: 19, change_direction: 'down' })])}
        isStreaming={false}
      />,
    );
    expect(screen.getByRole('img', { name: 'Down 19%, good' })).toBeTruthy();
  });

  it('leaves a MODEL-JUDGED unremarkable figure in the ink colour, never a decorative one', () => {
    // `dataset_id: null` is a grid the model wrote itself, which is every turn whose
    // registry holds no scalar_group. Its `neutral` is a reading — "we looked and it is
    // normal" — and `reading.ts` sets that in the ink, deliberately louder than muted.
    render(
      <MetricGridBlock
        block={{
          ...gridOf([metric({ change: null, change_direction: null })]),
          dataset_id: null,
        }}
        isStreaming={false}
      />,
    );
    const figure = document.querySelector('dd > span:first-child');
    expect(figure?.className).toContain('text-foreground');
    expect(figure?.className).not.toContain('text-success');
  });

  it('does not claim a COMPOSED figure was judged, because no model saw it', () => {
    // A grid carrying a `dataset_id` was built by `materializeMetricGridBlock`, which
    // writes `severity: 'neutral' as const` on every metric — and the Phase B instruction
    // forbids the model from emitting this category at all when the registry composes it.
    // Rendering that in ink asserts "we looked and it is normal" about a figure nobody
    // looked at. Measured on a live strategy turn: seven composed figures, seven neutrals,
    // one of them a ROAS the same report's insight block called a `risk`.
    render(
      <MetricGridBlock
        block={gridOf([metric({ change: null, change_direction: null })])}
        isStreaming={false}
      />,
    );
    const figure = document.querySelector('dd > span:first-child');
    expect(figure?.className).toContain('text-muted-foreground');
    expect(figure?.className).not.toContain('text-foreground');
  });

  it('keeps an explicit judgement on a composed grid, if one ever arrives', () => {
    // The read is "`neutral` on a composed grid is silence", not "a composed grid is never
    // judged". The day `materializeMetricGridBlock` derives a severity from the objective's
    // target, that judgement must survive this component untouched.
    render(
      <MetricGridBlock
        block={gridOf([metric({ change: null, change_direction: null, severity: 'risk' })])}
        isStreaming={false}
      />,
    );
    const figure = document.querySelector('dd > span:first-child');
    expect(figure?.className).toContain('text-destructive');
  });
});

describe('MetricGridBlock — the J2 tile: this period, the prior, and the read', () => {
  const j2 = (overrides: Partial<Metric>): Metric =>
    metric({
      label: 'Cost per conversation',
      value: 36.55,
      unit: 'MXN',
      format: 'currency',
      change: 4,
      change_direction: 'up',
      prior_value: 35.1,
      prior_label: '1 al 27 de agosto',
      read: 'peor',
      ...overrides,
    });

  const renderIn = (language: AnswerLanguage, metrics: Metric[]) =>
    render(
      <AnswerLanguageProvider language={language}>
        <MetricGridBlock block={{ ...gridOf(metrics), dataset_id: null }} isStreaming={false} />
      </AnswerLanguageProvider>,
    );

  it('prints the prior period under the figure, in the metric’s own format and window', () => {
    renderIn('es', [j2({})]);
    expect(screen.getByTestId('metric-prior').textContent).toBe('vs MX$35.10 · 1 al 27 de agosto');
  });

  it('prints no prior line when no prior period was read', () => {
    renderIn('es', [j2({ prior_value: null, prior_label: null, read: 'sin_comparacion' })]);
    expect(screen.queryByTestId('metric-prior')).toBeNull();
    expect(screen.getByTestId('metric-read').textContent).toBe('sin comparación');
  });

  it('colours the read by what it means: mejor good, peor a problem, igual ink, sin comparación muted', () => {
    renderIn('es', [
      j2({ label: 'Conversaciones', read: 'mejor' }),
      j2({ label: 'Costo por conversación', read: 'peor' }),
      j2({ label: 'Gasto', read: 'igual' }),
      j2({ label: 'Leads', read: 'sin_comparacion', prior_value: null, prior_label: null }),
    ]);
    const reads = screen.getAllByTestId('metric-read');
    expect(reads.map((node) => node.textContent)).toEqual([
      'mejor',
      'peor',
      'igual',
      'sin comparación',
    ]);
    expect(reads[0].className).toContain('text-success');
    expect(reads[1].className).toContain('text-destructive');
    expect(reads[2].className).toContain('text-foreground');
    expect(reads[2].className).not.toContain('text-muted-foreground');
    expect(reads[3].className).toContain('text-muted-foreground');
    // The colour is the judgement, and a screen reader cannot see it.
    expect(reads[0].getAttribute('title')).toBe('Conversaciones: good');
    expect(reads[1].getAttribute('title')).toBe('Costo por conversación: a problem');
  });

  it('says the read in English when the answer is English', () => {
    renderIn('en', [
      j2({ label: 'Conversations', read: 'mejor' }),
      j2({ label: 'Cost per conversation', read: 'peor' }),
      j2({ label: 'Spend', read: 'igual' }),
      j2({ label: 'Leads', read: 'sin_comparacion', prior_value: null, prior_label: null }),
    ]);
    expect(screen.getAllByTestId('metric-read').map((node) => node.textContent)).toEqual([
      'better',
      'worse',
      'same',
      'no comparison',
    ]);
  });

  it('draws the tiles in the Backend’s order — the result the account buys leads, never re-sorted', () => {
    renderIn('es', [
      j2({ label: 'Conversaciones', read: 'mejor' }),
      j2({ label: 'Costo por conversación', read: 'peor' }),
      j2({ label: 'Gasto', read: 'igual' }),
    ]);
    expect(Array.from(document.querySelectorAll('dt')).map((node) => node.textContent)).toEqual([
      'Conversaciones',
      'Costo por conversación',
      'Gasto',
    ]);
  });

  it('draws a pre-J2 metric with no read exactly as before: figure and delta, no read line', () => {
    renderIn('es', [j2({ prior_value: null, prior_label: null, read: null })]);
    expect(screen.queryByTestId('metric-read')).toBeNull();
    expect(screen.queryByTestId('metric-prior')).toBeNull();
    expect(screen.getByRole('img', { name: 'Up 4%, a problem' })).toBeTruthy();
  });
});
