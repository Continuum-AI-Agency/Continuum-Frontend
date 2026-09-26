import { afterEach, describe, expect, it } from 'bun:test';
import { formatFigure, type TemplateFigure } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { type AnswerTemplateBlockV2, checkpointBlockV2Schema } from '@/lib/jaina/schemas';
import fixture from './__fixtures__/spend_results_balance.block.json';
import TemplateBlock, { TemplateExecutive, TemplateJustification } from './TemplateBlock';

afterEach(cleanup);

/**
 * The fixture is the Backend's own output: `buildAnswerTemplateBlock` with the
 * spend_results_balance template over the real Easy Fit month read (default narration). Four
 * MENSAJES campaigns compared on conversations; SEDE C brings the most for its share, SEDE D
 * the least.
 */
const parseBlock = (raw: unknown): AnswerTemplateBlockV2 => {
  const parsed = checkpointBlockV2Schema.parse(raw);
  if (parsed.category !== 'answer_template') throw new Error('expected an answer_template block');
  return parsed;
};
const block = parseBlock(fixture);

const figureById = (id: string): TemplateFigure => {
  const figure = block.figures.find((candidate) => candidate.id === id);
  if (!figure) throw new Error(`no figure ${id}`);
  return figure;
};

/** Every figure element prints exactly what the contracts' formatter makes of its raw value. */
const expectFigureParity = (container: HTMLElement) => {
  const elements = container.querySelectorAll('[data-testid="figure"]');
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) {
    const figure = figureById(element.getAttribute('data-figure-id') ?? '');
    expect(element.getAttribute('data-figure-raw')).toBe(String(figure.value));
    expect(element.getAttribute('data-figure-currency')).toBe(figure.currency ?? 'none');
    expect(element.getAttribute('data-figure-unit')).toBe(figure.unit);
    expect(element.getAttribute('data-figure-window')).toBe('2026-09-01..2026-09-25');
    expect(element.getAttribute('data-figure-source')).toBe(
      `get_key_metrics:${figure.source.datasetId}`,
    );
    expect(element.textContent).toBe(formatFigure(figure));
  }
};

const figureIdsIn = (element: Element | null | undefined): Array<string | null> =>
  [...(element?.querySelectorAll('[data-testid="figure"]') ?? [])].map((node) =>
    node.getAttribute('data-figure-id'),
  );

describe('spend_results_balance on the Frontend', () => {
  it('parses through the Frontend block union', () => {
    expect(block.template_id).toBe('spend_results_balance');
    expect(block.layout).toBe('steps');
  });
});

describe('SpendResultsBalance hero', () => {
  it('says the answer in one sentence whose shares are figure elements', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const sentence = container.querySelector('p');
    expect(sentence?.textContent).toBe(
      'En este mes, entre las campañas que buscan conversaciones, SEDE C // MENSAJES // AGOSTO 2026 recibe 27% del gasto y trae 30.7% de las conversaciones, mientras SEDE D // MENSAJES // AGOSTO 2026 se lleva 23.3% del gasto y solo aporta 18.2%.',
    );
    expect(figureIdsIn(sentence)).toEqual([
      'over_spend_share',
      'over_results_share',
      'under_spend_share',
      'under_results_share',
    ]);
    expectFigureParity(container);
  });

  it('draws the spend bar over the conversations bar, joined by one band per campaign', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const chart = container.querySelector('[data-template-chart="spend_results_balance"]');
    expect(chart).not.toBeNull();
    expect(figureIdsIn(chart?.querySelector('svg'))).toEqual([
      'spend_share_1',
      'spend_share_2',
      'spend_share_3',
      'spend_share_4',
      'results_share_1',
      'results_share_2',
      'results_share_3',
      'results_share_4',
    ]);
    expect(chart?.querySelectorAll('polygon[data-band]')).toHaveLength(4);
    const svgText = chart?.querySelector('svg')?.textContent ?? '';
    expect(svgText).toContain('% gasto');
    expect(svgText).toContain('% conversaciones');
    expect(chart?.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'SEDE D // MENSAJES // AGOSTO 2026 23.3% → 18.2%',
    );
    expect(
      [...(chart?.querySelectorAll('[data-balance-legend] li') ?? [])].map((li) => li.textContent),
    ).toEqual([
      'SEDE C // MENSAJES // AGOSTO 2026',
      'SEDE B // MENSAJES // AGOSTO 2026',
      'SEDE A // MENSAJES // AGOSTO 2026',
      'SEDE D // MENSAJES // AGOSTO 2026',
    ]);
  });

  it('inks the two campaigns the sentence names by their reading, the rest quietly', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const bands = [...container.querySelectorAll('polygon[data-band]')];
    expect(bands.map((band) => band.getAttribute('class'))).toEqual([
      'text-success',
      'text-muted-foreground',
      'text-muted-foreground',
      'text-warning',
    ]);
  });

  it('falls back to the generic bars when the chart is not the paired shape', () => {
    const hero = block.executive.hero_chart;
    if (!hero) throw new Error('expected a hero chart');
    const unpaired = {
      ...block,
      executive: { ...block.executive, hero_chart: { ...hero, points: hero.points.slice(0, 3) } },
    };
    const { container } = render(<TemplateExecutive block={unpaired} />);
    expect(container.querySelector('[data-template-chart="spend_results_balance"]')).toBeNull();
    expect(container.querySelector('[data-template-chart="bar_horizontal"]')).not.toBeNull();
  });
});

describe('SpendResultsBalance justification', () => {
  it('tables every campaign`s shares and index, colouring the index by its reading', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const rows = [...container.querySelectorAll('[data-balance-table] tbody tr')];
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
      'SEDE C // MENSAJES // AGOSTO 2026',
      'SEDE B // MENSAJES // AGOSTO 2026',
      'SEDE A // MENSAJES // AGOSTO 2026',
      'SEDE D // MENSAJES // AGOSTO 2026',
      'Total',
    ]);
    expect(rows.map((row) => row.getAttribute('data-tone'))).toEqual([
      'good',
      'good',
      'neutral',
      'warn',
      null,
    ]);
    expect(figureIdsIn(rows[3])).toEqual([
      'spend_4',
      'spend_share_4',
      'results_4',
      'results_share_4',
      'index_4',
    ]);
    const index = rows[3]?.querySelector('[data-figure-id="index_4"]');
    expect(index?.textContent).toBe('0.78');
    expect(index?.className).toContain('text-warning');
    expect(figureIdsIn(rows[4])).toEqual([
      'spend_total',
      'share_total',
      'results_total',
      'share_total',
      'index_total',
    ]);
    expect(container.querySelector('[data-balance-readings]')?.textContent).toContain(
      'Rinde algo menos de lo que cuesta: recibe 23.3% del gasto y trae 18.2% de las conversaciones.',
    );
    expectFigureParity(container);
  });

  it('shows the rule-out and the gap as two panels under "why"', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const panels = [...container.querySelectorAll('[data-balance-panels] [data-panel]')];
    expect(panels.map((panel) => panel.getAttribute('data-panel'))).toEqual([
      'rule_out_type',
      'gap',
    ]);
    expect(panels.map((panel) => panel.getAttribute('data-tone'))).toEqual(['good', 'warn']);
    expect(panels[0]?.className).toContain('border-l-success');
    expect(panels[1]?.textContent).toBe(
      'Qué cambiaría el repartoSi SEDE D // MENSAJES // AGOSTO 2026 rindiera en equilibrio (índice 1.00), con el mismo gasto traería 341 conversaciones en vez de 266. Esa es la brecha: 75 conversaciones en este mes.',
    );
    expect(figureIdsIn(panels[1])).toEqual([
      'index_even',
      'under_results_at_avg',
      'under_results',
      'results_gap',
    ]);
  });

  it('renders the whole block with every value a figure element', () => {
    const { container } = render(<TemplateBlock block={block} isStreaming={false} />);
    expect(container.querySelector('[data-template-part="executive"]')).not.toBeNull();
    expect(container.querySelector('[data-template-part="justification"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/\{[a-z_0-9]+\}/);
    expectFigureParity(container);
  });
});
