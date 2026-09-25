import { afterEach, describe, expect, it } from 'bun:test';
import { formatFigure, type TemplateFigure } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { type AnswerTemplateBlockV2, checkpointBlockV2Schema } from '@/lib/jaina/schemas';
import { ExportModeProvider } from '../export/ExportModeContext';
import fixture from './__fixtures__/explained_ranking.block.json';
import { orderedSteps } from './layouts/Steps';
import TemplateBlock, { TemplateExecutive, TemplateJustification } from './TemplateBlock';

afterEach(cleanup);

/**
 * The fixture is the Backend's own output: `buildAnswerTemplateBlock` over the real Easy Fit
 * month read (default narration). Parsing it through the Frontend union is the first test.
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

describe('the answer_template block on the Frontend', () => {
  it('parses through the Frontend block union with the steps layout', () => {
    expect(block.template_id).toBe('explained_ranking');
    expect(block.layout).toBe('steps');
  });
});

describe('TemplateExecutive (explained_ranking)', () => {
  it('says the answer in one sentence whose figures are figure elements', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const sentence = container.querySelector('p');
    expect(sentence?.textContent).toBe(
      'SEDE C // MENSAJES // AGOSTO 2026 es la que mejor rinde entre las campañas que buscan conversaciones este mes: consigue conversaciones a 32.19 MXN, 12.1% más barato que el promedio de las campañas que buscan conversaciones (36.62 MXN).',
    );
    const inSentence = [...(sentence?.querySelectorAll('[data-testid="figure"]') ?? [])].map(
      (element) => element.getAttribute('data-figure-id'),
    );
    expect(inSentence).toEqual(['cpr_1', 'gap_avg_1', 'cpr_avg']);
    expectFigureParity(container);
  });

  it('charts every ranked campaign against the average of its result', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const chart = container.querySelector('[data-template-chart="bar_horizontal"]');
    const plotted = [...(chart?.querySelectorAll('[data-testid="figure"]') ?? [])].map((element) =>
      element.getAttribute('data-figure-id'),
    );
    expect(plotted).toEqual(['cpr_1', 'cpr_2', 'cpr_3', 'cpr_4', 'cpr_avg']);
    expect(chart?.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'SEDE D // MENSAJES // AGOSTO 2026 46.90 MXN',
    );
    expect(screen.getByText(/Menos es mejor/)).toBeDefined();
  });
});

describe('TemplateJustification (steps)', () => {
  it('numbers the three steps in the layout`s order', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const steps = [...container.querySelectorAll('[data-step]')].map((step) =>
      step.getAttribute('data-step'),
    );
    expect(steps).toEqual(['measured', 'found', 'why']);
    expect(container.querySelector('[data-template-layout="steps"]')).not.toBeNull();
    expect(container.textContent).toContain('Qué medimos.');
    expect(container.textContent).toContain(
      'Leímos gasto y conversaciones de las 4 campañas que buscan conversaciones y gastaron en este mes, a nivel campaña: 53,577 MXN y 1,463 conversaciones en total. Otras 12 campañas buscan otro resultado y no entran en la comparación: su costo por resultado no se compara con un costo por conversación.',
    );
    expectFigureParity(container);
  });

  it('opens each ranked row to its own reason, the first one open', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const rows = [...container.querySelectorAll('details[data-rank]')] as HTMLDetailsElement[];
    expect(rows.map((row) => row.getAttribute('data-rank'))).toEqual(['1', '2', '3', '4']);
    expect(rows.map((row) => row.open)).toEqual([true, false, false, false]);
    const badge = rows[3]?.querySelector('summary [data-figure-id="cpr_4"]');
    expect(badge?.textContent).toBe('46.90 MXN');
    expect(badge?.className).toContain('text-destructive');
    expect(rows[0]?.textContent).toContain(
      'Consigue conversaciones a 32.19 MXN, 12.1% más barato que el promedio de las campañas que buscan conversaciones (36.62 MXN): 449 conversaciones con 14,455 MXN.',
    );
  });

  it('prints every row open on paper', () => {
    const { container } = render(
      <ExportModeProvider>
        <TemplateJustification block={block} />
      </ExportModeProvider>,
    );
    const rows = [...container.querySelectorAll('details[data-rank]')] as HTMLDetailsElement[];
    expect(rows.every((row) => row.open)).toBe(true);
  });

  it('keeps unknown section kinds after the three steps, in block order', () => {
    const sections = [
      { ...block.justification.sections[2], kind: 'appendix' },
      ...block.justification.sections,
    ];
    expect(orderedSteps(sections).map((section) => section.kind)).toEqual([
      'measured',
      'found',
      'why',
      'appendix',
    ]);
  });
});

describe('a stub template renders through the generic renderer', () => {
  const stub = parseBlock({ ...fixture, template_id: 'three_numbers' });

  it('shows the found section as a table and item list, every value a figure element', () => {
    const { container } = render(<TemplateBlock block={stub} isStreaming={false} />);
    expect(container.querySelector('details[data-rank]')).toBeNull();
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(4);
    expect(container.querySelector('[data-template-part="executive"]')).not.toBeNull();
    expect(container.querySelector('[data-template-part="justification"]')).not.toBeNull();
    expectFigureParity(container);
  });
});

describe('an unresolved ref', () => {
  it('prints a dash, never the raw ref', () => {
    const broken = parseBlock({
      ...fixture,
      executive: { ...fixture.executive, sentence: 'Cuesta {ghost} por conversación.' },
    });
    const { container } = render(<TemplateExecutive block={broken} />);
    expect(container.querySelector('p')?.textContent).toBe('Cuesta — por conversación.');
    expect(container.querySelector('[data-figure-unresolved="ghost"]')).not.toBeNull();
  });
});
