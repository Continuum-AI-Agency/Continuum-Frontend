import { afterEach, describe, expect, it } from 'bun:test';
import { formatFigure, type TemplateFigure } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { type AnswerTemplateBlockV2, checkpointBlockV2Schema } from '@/lib/jaina/schemas';
import { ExportModeProvider } from '../export/ExportModeContext';
import fixture from './__fixtures__/weekly_bridge.block.json';
import TemplateBlock, { TemplateExecutive, TemplateJustification } from './TemplateBlock';

afterEach(cleanup);

/**
 * The fixture is the Backend's own output: `buildAnswerTemplateBlock` over the real Easy Fit
 * last_7d and last_14d campaign reads (default narration). The week before (2026-09-11 → 17)
 * had 401 conversations, this week (2026-09-18 → 24) 503; the four MENSAJES steps are
 * +44, +28, +25, +5.
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
    expect(element.getAttribute('data-figure-window')).toBe(
      `${figure.window.since}..${figure.window.until}`,
    );
    expect(element.getAttribute('data-figure-source')).toBe(
      `get_key_metrics:${figure.source.datasetId}`,
    );
    expect(element.textContent).toBe(formatFigure(figure));
  }
};

const figureIdsIn = (root: Element | null | undefined): string[] =>
  [...(root?.querySelectorAll('[data-testid="figure"]') ?? [])].map(
    (element) => element.getAttribute('data-figure-id') ?? '',
  );

describe('the weekly_bridge block on the Frontend', () => {
  it('parses through the Frontend block union', () => {
    expect(block.template_id).toBe('weekly_bridge');
    expect(block.executive.hero_chart?.kind).toBe('bridge');
  });
});

describe('WeeklyBridge hero', () => {
  it('draws the waterfall from the week before to this week, every value a figure', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const chart = container.querySelector('[data-template-chart="bridge"]');
    expect(chart).not.toBeNull();
    expect(figureIdsIn(chart?.querySelector('svg'))).toEqual([
      'results_prior',
      'step_1',
      'step_2',
      'step_3',
      'step_4',
      'results_current',
    ]);
    expect(chart?.querySelectorAll('[data-bridge-bar]')).toHaveLength(6);
    expect(
      [...(chart?.querySelectorAll('[data-bridge-bar]') ?? [])].map((bar) =>
        bar.getAttribute('data-bridge-bar'),
      ),
    ).toEqual(['start', 'up', 'up', 'up', 'up', 'end']);
    expect(chart?.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Conversaciones: semana anterior → esta semana, por campaña: Semana anterior 401, SEDE C // MENSAJES // AGOSTO 2026 +44, SEDE B // MENSAJES // AGOSTO 2026 +28, SEDE D // MENSAJES // AGOSTO 2026 +25, SEDE A // MENSAJES // AGOSTO 2026 +5, Esta semana 503',
    );
    expectFigureParity(container);
  });

  it('stacks each step on the level the previous one left, from the stated axis floor', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    const bars = [...container.querySelectorAll('[data-bridge-bar]')];
    const span = (bar: Element) => [
      Number(bar.getAttribute('data-level-from')),
      Number(bar.getAttribute('data-level-to')),
    ];
    expect(bars.map(span)).toEqual([
      [300, 401],
      [401, 445],
      [445, 473],
      [473, 498],
      [498, 503],
      [300, 503],
    ]);
    // The truncated axis is said in the caption, as a figure.
    const caption = container.querySelector('figcaption');
    expect(caption?.textContent).toBe(
      'Conversaciones de los 7 días anteriores a los últimos 7 días; cada escalón es el cambio de una campaña. El eje empieza en 300 para que se vean los escalones.',
    );
    expect(figureIdsIn(caption)).toEqual(['axis_floor']);
  });

  it('says the answer in one sentence whose numbers are figures', () => {
    const { container } = render(<TemplateExecutive block={block} />);
    expect(container.querySelector('p')?.textContent).toBe(
      'En los últimos 7 días hubo 503 conversaciones, 102 más que en los 7 días anteriores (25.4%), sobre todo por gastar más (90.8% del movimiento); el mayor escalón fue SEDE C // MENSAJES // AGOSTO 2026 (44 más).',
    );
    expect(figureIdsIn(container.querySelector('p'))).toEqual([
      'results_current',
      'results_change_abs',
      'results_change_pct_abs',
      'volume_share',
      'step_abs_1',
    ]);
  });
});

describe('WeeklyBridge justification', () => {
  it('lays out the per-campaign table and one row per step, the first open', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const found = container.querySelector('[data-testid="weekly-bridge-steps"]');
    expect(found?.querySelectorAll('table tbody tr')).toHaveLength(5);
    const rows = [...(found?.querySelectorAll('details[data-step]') ?? [])];
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.hasAttribute('open'))).toEqual([true, false, false, false]);
    expect(rows[0]?.querySelector('p')?.textContent).toBe(
      'De 120 a 164 conversaciones (44 más): 52 por gastar más (4,170 MXN → 5,990 MXN) y 8 menos por pagar más por conversación (34.75 MXN → 36.52 MXN).',
    );
    expectFigureParity(container);
  });

  it('draws where the movement came from as one split bar of spend and cost', () => {
    const { container } = render(<TemplateJustification block={block} />);
    const split = container.querySelector('[data-testid="weekly-bridge-split"]');
    const segments = [...(split?.querySelectorAll('[data-effect]') ?? [])];
    expect(segments.map((segment) => segment.getAttribute('data-effect'))).toEqual([
      'effect_volume',
      'effect_efficiency',
    ]);
    expect(segments.map((segment) => segment.textContent)).toEqual([
      'Gastar más · 90.8%',
      'Pagar más por conversación · 9.2%',
    ]);
    expect(figureIdsIn(split)).toEqual(['volume_share', 'efficiency_share']);
  });

  it('prints every step open on paper', () => {
    const { container } = render(
      <ExportModeProvider>
        <TemplateBlock block={block} isStreaming={false} />
      </ExportModeProvider>,
    );
    const rows = [...container.querySelectorAll('details[data-step]')];
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.hasAttribute('open'))).toBe(true);
    expectFigureParity(container);
  });
});

describe('a weekly_bridge block without a bridge chart', () => {
  it('degrades to the generic bars rather than drawing a broken waterfall', () => {
    const chart = block.executive.hero_chart;
    if (!chart) throw new Error('fixture has a hero chart');
    const bars = parseBlock({
      ...fixture,
      executive: { ...fixture.executive, hero_chart: { ...chart, kind: 'bar_horizontal' } },
    });
    const { container } = render(<TemplateExecutive block={bars} />);
    expect(container.querySelector('[data-template-chart="bar_horizontal"]')).not.toBeNull();
    expect(container.querySelector('[data-bridge-bar]')).toBeNull();
  });
});
