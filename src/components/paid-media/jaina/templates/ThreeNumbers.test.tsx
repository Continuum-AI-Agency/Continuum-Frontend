import { afterEach, describe, expect, it } from 'bun:test';
import { formatFigure, type TemplateFigure } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { type AnswerTemplateBlockV2, checkpointBlockV2Schema } from '@/lib/jaina/schemas';
import monthFixture from './__fixtures__/three_numbers.block.json';
import weekFixture from './__fixtures__/three_numbers.last_7d.block.json';
import { TemplateExecutive, TemplateJustification } from './TemplateBlock';

afterEach(cleanup);

/**
 * Both fixtures are the Backend's own output — `buildAnswerTemplateBlock` over the real Easy
 * Fit reads with default narration: the month (no same-length prior exists, so no deltas) and
 * the last 7 days against last_14d − last_7d.
 */
const parseBlock = (raw: unknown): AnswerTemplateBlockV2 => {
  const parsed = checkpointBlockV2Schema.parse(raw);
  if (parsed.category !== 'answer_template') throw new Error('expected an answer_template block');
  return parsed;
};
const month = parseBlock(monthFixture);
const week = parseBlock(weekFixture);

const figureIn = (block: AnswerTemplateBlockV2, id: string): TemplateFigure => {
  const figure = block.figures.find((candidate) => candidate.id === id);
  if (!figure) throw new Error(`no figure ${id}`);
  return figure;
};

/** Every figure element prints exactly what the contracts' formatter makes of its raw value. */
const expectFigureParity = (block: AnswerTemplateBlockV2, container: HTMLElement) => {
  const elements = container.querySelectorAll('[data-testid="figure"]');
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) {
    const figure = figureIn(block, element.getAttribute('data-figure-id') ?? '');
    expect(element.getAttribute('data-figure-raw')).toBe(String(figure.value));
    expect(element.getAttribute('data-figure-currency')).toBe(figure.currency ?? 'none');
    expect(element.getAttribute('data-figure-unit')).toBe(figure.unit);
    expect(element.getAttribute('data-figure-window')).toBe(
      `${figure.window.since}..${figure.window.until}`,
    );
    expect(element.getAttribute('data-figure-source')).toBe(
      `get_key_metrics:${figure.source.datasetId}`,
    );
    expect(element.textContent).toBe(formatFigure(figure));
  }
};

const figureIdsIn = (element: Element | null): string[] =>
  [...(element?.querySelectorAll('[data-testid="figure"]') ?? [])].map(
    (node) => node.getAttribute('data-figure-id') ?? '',
  );

describe('three_numbers — the answer (month, no comparable prior)', () => {
  it('says the three numbers in one sentence', () => {
    const { container } = render(<TemplateExecutive block={month} />);
    expect(container.querySelector('p')?.textContent).toBe(
      'Este mes llevamos 64,351 MXN de gasto, 1,463 conversaciones y un costo por conversación de 36.62 MXN.',
    );
    expectFigureParity(month, container);
  });

  it('shows three large numbers with the window instead of a delta', () => {
    const { container } = render(<TemplateExecutive block={month} />);
    const panels = [...container.querySelectorAll('[data-three-number]')];
    expect(panels.map((panel) => panel.getAttribute('data-three-number'))).toEqual([
      'spend',
      'results',
      'cpr',
    ]);
    expect(panels.map((panel) => panel.textContent)).toEqual([
      'Gasto64,351 MXNeste mes',
      'Conversaciones1,463este mes',
      'Costo por conversación36.62 MXNeste mes',
    ]);
    expect(container.querySelector('[data-direction]')).toBeNull();
  });

  it('draws the daily spend as a line whose labelled values are figures', () => {
    const { container } = render(<TemplateExecutive block={month} />);
    const chart = container.querySelector('[data-template-chart="line"]');
    expect(chart?.querySelectorAll('circle')).toHaveLength(25);
    const labelled = figureIdsIn(chart?.querySelector('svg') ?? null);
    expect(labelled).toContain('day_25');
    expect(labelled.every((id) => id.startsWith('day_'))).toBe(true);
    expect(chart?.textContent).toContain(
      'Gasto por día en este mes, sumando las 16 campañas: 64,351 MXN en total.',
    );
  });
});

describe('three_numbers — the justification', () => {
  it('derives each number in a calculation, over the campaigns behind them', () => {
    const { container } = render(<TemplateJustification block={month} />);
    const derivations = [...container.querySelectorAll('[data-derivation]')];
    expect(derivations.map((node) => node.getAttribute('data-derivation'))).toEqual([
      'spend',
      'results',
      'cpr',
    ]);
    expect(derivations[2]?.querySelector('p')?.textContent).toBe(
      '53,577 MXN gastados en esas campañas ÷ 1,463 conversaciones = 36.62 MXN.',
    );
    const rows = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('td')?.textContent,
    );
    expect(rows).toEqual([
      'SEDE C // MENSAJES // AGOSTO 2026',
      'SEDE B // MENSAJES // AGOSTO 2026',
      'SEDE A // MENSAJES // AGOSTO 2026',
      'SEDE D // MENSAJES // AGOSTO 2026',
      'Otras campañas (otro resultado)',
    ]);
    expect(container.textContent).toContain(
      'Sin comparación: Meta no permite leer un periodo anterior de la misma duración desde esta lectura.',
    );
    expectFigureParity(month, container);
  });
});

describe('three_numbers — last 7 days against the 7 before', () => {
  it('puts each number`s change under it, toned by which way is better', () => {
    const { container } = render(<TemplateExecutive block={week} />);
    const direction = (id: string) =>
      container.querySelector(`[data-three-number="${id}"] [data-direction]`);
    expect(direction('spend')?.getAttribute('data-direction')).toBe('up');
    expect(direction('spend')?.className).toContain('text-foreground');
    expect(direction('results')?.className).toContain('text-success');
    expect(direction('cpr')?.className).toContain('text-destructive');
    expect(figureIdsIn(direction('cpr'))).toEqual(['cpr_change', 'cpr_prior']);
    expect(direction('spend')?.textContent).toBe('↑ 23.3% · los 7 días anteriores 20,062 MXN');
    expect(container.querySelector('p')?.textContent).toBe(
      'En los últimos 7 días llevamos 24,746 MXN de gasto, 503 conversaciones y un costo por conversación de 40.45 MXN: el gasto subió 23.3% y el costo por conversación subió 0.7% frente a los 7 días anteriores.',
    );
    expectFigureParity(week, container);
  });

  it('adds the prior columns to the campaign table', () => {
    const { container } = render(<TemplateJustification block={week} />);
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('Gasto antes');
    expect(headers).toContain('Conversaciones antes');
    expectFigureParity(week, container);
  });
});
