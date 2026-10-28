// The §4 chart vocabulary, rendered: every form and every §12 chart case, light and dark, at a
// 375px phone and a 1280px desktop. happy-dom does no layout, so these assert what the renderer
// writes — the marks Recharts draws from the stubbed width, their labels, and the theme tokens
// they are painted with — not pixels.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import { chartBlockV2Schema } from '@/lib/jaina/schemas';
import { ChartBlock } from './ChartBlock';
import { CHART_CASES } from './chartCases.fixture';

global.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
let chartWidth = 800;

beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (!this.classList.contains('recharts-responsive-container')) {
      return originalGetBoundingClientRect.call(this);
    }
    return {
      width: chartWidth,
      height: 360,
      top: 0,
      right: chartWidth,
      bottom: 360,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

afterEach(cleanup);

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [375, 1280] as const;
type Theme = (typeof THEMES)[number];
type Width = (typeof WIDTHS)[number];
/** Bars draw their labels once their entry animation ends (400ms); a line's after 1500ms. */
const SETTLE = { timeout: 4_000 };

function renderChart(input: unknown, theme: Theme, width: Width): HTMLElement {
  chartWidth = width;
  const block = chartBlockV2Schema.parse(input);
  const { container } = render(
    <div className={theme === 'dark' ? 'dark' : undefined} data-theme={theme}>
      <ChartBlock block={block} isStreaming={false} />
    </div>,
  );
  const root = container.querySelector<HTMLElement>('[data-testid="chart-block"]');
  if (!root) throw new Error('the chart block rendered no root');
  return root;
}

const all = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)];
const num = (node: Element, attribute: string) => Number(node.getAttribute(attribute));
const valueLabels = (root: HTMLElement) =>
  all(root, '[data-chart-value-label]').map((node) => node.getAttribute('data-chart-value-label'));
const categoryTicks = (root: HTMLElement, axis: 'x' | 'y') =>
  all(root, `text.recharts-${axis}Axis.recharts-cartesian-axis-tick-value`)
    .sort((a, b) => (axis === 'x' ? num(a, 'x') - num(b, 'x') : num(a, 'y') - num(b, 'y')))
    .map((node) => node.getAttribute('aria-label') ?? node.textContent);
const tickNamed = (root: HTMLElement, label: string) =>
  all(root, 'text.recharts-cartesian-axis-tick-value').find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label,
  );
// Recharts 3 draws value ticks in their own layer, outside the axis group, tagged by side.
const RIGHT_AXIS_TICKS = 'text.recharts-cartesian-axis-tick-value[orientation="right"]';
const yAxes = (root: HTMLElement) => all(root, 'g.recharts-cartesian-axis.recharts-yAxis');
const bars = (root: HTMLElement) =>
  all(root, '.recharts-bar-rectangle path.recharts-rectangle').map((node) => ({
    x: num(node, 'x'),
    y: num(node, 'y'),
    width: num(node, 'width'),
    height: num(node, 'height'),
    fill: node.getAttribute('fill'),
  }));
const legendItems = (root: HTMLElement) =>
  all(root, '.recharts-legend-wrapper > div > div').map((node) => node.textContent);
/** Each goal line is one `<g data-chart-reference-line>` holding its `<line>` and its label. */
const referenceLines = (root: HTMLElement) => all(root, '[data-chart-reference-line]');
const lineOf = (callout: Element | undefined | null) => callout?.querySelector('line') ?? null;
/** Painted after every bar: drawn over them. */
const drawnAfterBars = (root: HTMLElement, node: Element | null) => {
  const lastBar = all(root, '.recharts-bar-rectangle').at(-1);
  return (
    !!node &&
    !!lastBar &&
    (lastBar.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
};
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

const HARD_CODED = new Set(['#000', '#000000', '#fff', '#ffffff', 'black', 'white']);

/**
 * Every callout the vocabulary adds, and every axis tick, is painted with a theme token: the
 * same attribute reads right on a light page and a dark one, because the token does the work.
 */
function expectThemeTokens(root: HTMLElement) {
  const painted = all(
    root,
    [
      '[data-chart-reference-line] line',
      '.chart-reference-label',
      '[data-chart-marker] line',
      '.chart-marker-label',
      '[data-chart-value-label]',
      'text.recharts-cartesian-axis-tick-value',
    ].join(', '),
  );
  for (const node of painted) {
    for (const attribute of ['fill', 'stroke']) {
      const paint = node.getAttribute(attribute)?.trim().toLowerCase();
      if (!paint || paint === 'none') continue;
      expect(HARD_CODED.has(paint)).toBe(false);
      expect(paint.startsWith('var(--')).toBe(true);
    }
  }
}

/** A chart on its side never forces the page wider than a phone. */
function expectFitsAPhone(root: HTMLElement) {
  if (root.getAttribute('data-chart-orientation') !== 'horizontal') return;
  const chart = root.querySelector<HTMLElement>('[data-slot="chart"]');
  expect(chart?.style.minWidth).toBe('');
}

const caseBlock = (id: string) => {
  const found = CHART_CASES.find((entry) => entry.id === id);
  if (!found) throw new Error(`no chart case ${id}`);
  return found.block;
};

const ROOT_HOOKS: Record<string, { type: string; orientation: string; categories: string[] }> = {
  'case-2': {
    type: 'bar',
    orientation: 'vertical',
    categories: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4 (parcial)'],
  },
  'case-3': {
    type: 'waterfall',
    orientation: 'vertical',
    categories: [
      'Semana pasada',
      'CPM',
      'CTR',
      'Tasa de conversación',
      'Mezcla de campañas',
      'Esta semana',
    ],
  },
  'case-4': {
    type: 'bar',
    orientation: 'horizontal',
    categories: [
      'ITESO // MENSAJES',
      'ALEIRA // MENSAJES',
      'PROVIDENCIA // MENSAJES',
      'CAÑADAS // MENSAJES',
      'AV CAMACHO // MENSAJES',
    ],
  },
  'case-7': {
    type: 'area',
    orientation: 'vertical',
    categories: Array.from({ length: 31 }, (_, index) => `${index + 1} oct`),
  },
  'case-11': {
    type: 'stacked_bar',
    orientation: 'horizontal',
    categories: ['Septiembre', 'Octubre (1–27)'],
  },
  'case-12': {
    type: 'bar',
    orientation: 'vertical',
    categories: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4 (parcial)'],
  },
  'form-funnel': {
    type: 'funnel',
    orientation: 'horizontal',
    categories: ['Impresiones', 'Clics en enlace', 'Vistas de pago', 'Compras'],
  },
};

const CASE_EXPECTATIONS: Record<string, (root: HTMLElement, width: Width) => Promise<void>> = {
  'case-2': async (root) => {
    // Spend bars on the left axis, the cost line on a right one, the goal read against it.
    await waitFor(() => expect(bars(root)).toHaveLength(8), SETTLE);
    expect(yAxes(root)).toHaveLength(2);
    expect(all(root, '.recharts-line')).toHaveLength(1);
    const [goal] = referenceLines(root);
    expect(referenceLines(root)).toHaveLength(1);
    expect(goal?.getAttribute('data-chart-reference-axis')).toBe('right');
    expect(goal?.getAttribute('data-chart-reference-style')).toBe('dashed');
    expect(lineOf(goal)?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(goal?.querySelector('.chart-reference-label')?.textContent).toBe(
      'Meta de costo por conversación · $45.00 MXN',
    );
    // The cost line is painted over the spend bars, not hidden between them.
    expect(drawnAfterBars(root, root.querySelector('.recharts-line'))).toBe(true);
    const rightTick = all(root, RIGHT_AXIS_TICKS).find((node) => node.textContent === '$45.00 MXN');
    expect(rightTick).toBeTruthy();
    expect(num(lineOf(goal) as Element, 'y1')).toBe(num(rightTick as Element, 'y'));
    expect(all(root, '.chart-reference-label').map((node) => node.textContent)).toEqual([
      'Meta de costo por conversación · $45.00 MXN',
    ]);
    expect(legendItems(root)).toEqual([
      'Gasto septiembre (MXN)',
      'Gasto octubre (MXN)',
      'Costo por conversación octubre (MXN)',
    ]);
  },
  'case-3': async (root) => {
    const signed = [
      '$41.20 MXN',
      '+$3.90 MXN',
      '+$1.85 MXN',
      '-$0.95 MXN',
      '+$0.60 MXN',
      '$46.60 MXN',
    ];
    await waitFor(() => expect(valueLabels(root)).toEqual(signed), SETTLE);
    expect(categoryTicks(root, 'x')).toEqual(ROOT_HOOKS['case-3']?.categories ?? []);
    const drawn = bars(root);
    // Start + four causes + end.
    expect(drawn).toHaveLength(6);
    expect(drawn.map((bar) => bar.fill)).toEqual([
      'var(--muted-foreground)',
      'var(--color-delta)',
      'var(--color-delta)',
      'var(--color-delta)',
      'var(--color-delta)',
      'var(--muted-foreground)',
    ]);
    const [start, , ctr, conversion, mix, end] = drawn;
    if (!start || !ctr || !conversion || !mix || !end) throw new Error('missing waterfall bars');
    // The totals stand on the axis; the −0.95 cause hangs from the top CTR left and ends where
    // the campaign-mix cause starts — off the axis.
    expect(close(start.y + start.height, end.y + end.height)).toBe(true);
    expect(close(conversion.y, ctr.y)).toBe(true);
    expect(close(conversion.y + conversion.height, mix.y + mix.height)).toBe(true);
    expect(conversion.y + conversion.height).toBeLessThan(start.y + start.height);
    expect(legendItems(root)).toEqual([]);
    expect(root.querySelector('.recharts-pie')).toBeNull();
  },
  'case-4': async (root) => {
    const ranking = ROOT_HOOKS['case-4']?.categories ?? [];
    expect(categoryTicks(root, 'y')).toEqual(ranking);
    // On its side the outlier is called out in its own name's tick, not by a line across bars.
    const marker = root.querySelector('[data-chart-marker]');
    expect(all(root, '[data-chart-marker]')).toHaveLength(1);
    expect(marker?.getAttribute('data-chart-marker')).toBe('Atípico');
    expect(marker?.getAttribute('data-chart-marker-category')).toBe('ITESO // MENSAJES');
    expect(marker).toBe(tickNamed(root, 'ITESO // MENSAJES') ?? null);
    expect(marker?.querySelector('.chart-marker-label')?.textContent).toBe('Atípico');
    const providencia = tickNamed(root, 'PROVIDENCIA // MENSAJES');
    expect(providencia?.querySelector('title')?.textContent).toBe('PROVIDENCIA // MENSAJES');
    expect(all(providencia as Element, 'tspan').map((node) => node.textContent)).toEqual([
      'PROVIDENCIA //',
      'MENSAJES',
    ]);
    await waitFor(() => expect(valueLabels(root)).toHaveLength(10), SETTLE);
    // Each bar's label sits on its row: October's, in ranking order down the side.
    const october = all(root, '[data-chart-value-label]')
      .filter((node) =>
        ['$96.40 MXN', '$55.75 MXN', '$45.20 MXN', '$42.15 MXN', '$40.60 MXN'].includes(
          node.getAttribute('data-chart-value-label') ?? '',
        ),
      )
      .sort((a, b) => num(a, 'y') - num(b, 'y'))
      .map((node) => node.getAttribute('data-chart-value-label'));
    expect(october).toEqual(['$96.40 MXN', '$55.75 MXN', '$45.20 MXN', '$42.15 MXN', '$40.60 MXN']);
    expect(legendItems(root)).toEqual(['Octubre (MXN)', 'Septiembre (MXN)']);
  },
  'case-7': async (root) => {
    expect(all(root, '.recharts-area')).toHaveLength(1);
    expect(all(root, '.recharts-line')).toHaveLength(2);
    const [goal] = referenceLines(root);
    expect(goal?.getAttribute('data-chart-reference-line')).toBe('Meta del mes');
    expect(goal?.getAttribute('data-chart-reference-axis')).toBe('left');
    expect(lineOf(goal)?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(all(root, '.chart-reference-label').map((node) => node.textContent)).toEqual([
      'Meta del mes · 1,800',
    ]);
    const today = root.querySelector('g[data-chart-marker]');
    expect(today?.getAttribute('data-chart-marker')).toBe('Hoy');
    expect(today?.querySelector('.chart-marker-label')?.textContent).toBe('Hoy');
    expect(all(root, '.chart-marker-label').map((node) => node.textContent)).toEqual(['Hoy']);
    // The marker stands on the 27 oct tick.
    expect(num(lineOf(today) as Element, 'x1')).toBe(
      num(tickNamed(root, '27 oct') as Element, 'x'),
    );
    expect(legendItems(root)).toEqual([
      'Real acumulado',
      'Ritmo esperado',
      'Proyección (lineal, ritmo actual)',
    ]);
    const label = root.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Reference line Meta del mes 1,800');
    expect(label).toContain('Marker Hoy at 27 oct');
  },
  'case-11': async (root, width) => {
    expect(root.querySelector('[data-testid="chart-as-tiles"]')).toBeNull();
    expect(root.querySelector('[data-slot="chart"]')).toBeTruthy();
    expect(categoryTicks(root, 'y')).toEqual(['Septiembre', 'Octubre (1–27)']);
    await waitFor(() => expect(valueLabels(root)).toContain('$182,450 MXN'), SETTLE);
    // Seven segments: DV360 spent nothing in October. Each series animates on its own clock,
    // so the geometry is read once every segment has landed.
    await waitFor(() => {
      const drawn = bars(root);
      expect(drawn).toHaveLength(7);
      const [metaSep, , googleSep] = drawn;
      if (!metaSep || !googleSep) throw new Error('missing stacked segments');
      // Google's September segment starts where Meta's ends, on the same row.
      expect(close(googleSep.x, metaSep.x + metaSep.width)).toBe(true);
      expect(googleSep.y).toBe(metaSep.y);
      // A segment prints its value inside itself or not at all: at 1280 Google's fits.
      if (width === 1280) expect(valueLabels(root)).toContain('$96,120 MXN');
    }, SETTLE);
    expect(valueLabels(root)).not.toContain('$0.00 MXN');
    expect(legendItems(root)).toEqual(['Meta', 'Google', 'TikTok', 'DV360']);
  },
  'case-12': async (root, width) => {
    await waitFor(() => expect(valueLabels(root)).toHaveLength(8), SETTLE);
    // Each series' labels land when its bars finish animating, in either order.
    expect(valueLabels(root).sort()).toEqual(
      [
        '250,000',
        '250,000',
        '250,000',
        '250,000',
        '231,480',
        '262,915',
        '244,007',
        '198,340',
      ].sort(),
    );
    // Too wide for a 24px bar at 375, the figures turn upright; at 1280 they sit level.
    const rotated = all(root, '[data-chart-value-label]').filter((node) =>
      node.getAttribute('transform')?.startsWith('rotate(-90'),
    );
    expect(rotated).toHaveLength(width === 375 ? 8 : 0);
    expect(legendItems(root)).toEqual(['Alcance planeado', 'Alcance entregado']);
  },
  'form-funnel': async (root) => {
    expect(categoryTicks(root, 'y')).toEqual(ROOT_HOOKS['form-funnel']?.categories ?? []);
    await waitFor(
      () =>
        expect(valueLabels(root)).toEqual([
          '1,284,500',
          '18,420 · 1.4%',
          '2,315 · 13%',
          '412 · 18%',
        ]),
      SETTLE,
    );
    const drawn = bars(root);
    expect(drawn).toHaveLength(4);
    // 412 of 1,284,500 is a sliver on a linear scale; it still draws as a bar.
    for (const bar of drawn) expect(bar.width).toBeGreaterThanOrEqual(6);
    expect(drawn.map((bar) => bar.width)).toEqual(
      [...drawn.map((bar) => bar.width)].sort((a, b) => b - a),
    );
    // The labels carry the numbers; the value axis would only lie about the slivers.
    expect(root.querySelector('g.recharts-cartesian-axis.recharts-xAxis')).toBeNull();
    expect(legendItems(root)).toEqual([]);
  },
};

describe('ChartBlock renders each §12 chart case', () => {
  for (const { id, block } of CHART_CASES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        it(`${id} · ${theme} · ${width}px`, async () => {
          const root = renderChart(block, theme, width);
          const hooks = ROOT_HOOKS[id];
          if (!hooks) throw new Error(`no expectations for ${id}`);
          expect(root.getAttribute('data-chart-type')).toBe(hooks.type);
          expect(root.getAttribute('data-chart-block-id')).toBe(block.block_id);
          expect(root.getAttribute('data-chart-orientation')).toBe(hooks.orientation);
          expect(JSON.parse(root.getAttribute('data-chart-categories') ?? '[]')).toEqual(
            hooks.categories,
          );
          expect(root.querySelector('[role="img"]')).toBeTruthy();
          await CASE_EXPECTATIONS[id]?.(root, width);
          expectThemeTokens(root);
          expectFitsAPhone(root);
        });
      }
    }
  }

  it('covers every case the fixture carries', () => {
    expect(Object.keys(CASE_EXPECTATIONS).sort()).toEqual(CHART_CASES.map(({ id }) => id).sort());
  });
});

const base = {
  block_id: 'form',
  category: 'chart',
  scope: 'account',
  title: 'Form',
  priority: 'primary',
  currency_code: 'MXN',
  value_format: 'currency',
};
const spendRows = [
  { campaign: 'Alpha', spend: 40, cpr: 12 },
  { campaign: 'Beta', spend: 60, cpr: 18 },
  { campaign: 'Gamma', spend: 80, cpr: 9 },
  { campaign: 'Delta', spend: 20, cpr: 30 },
];
const WEEK = [12, 18, 15, 22, 30, 26, 19];
const spendBar = {
  ...base,
  chart_type: 'bar',
  category_key: 'campaign',
  data: spendRows,
  chart_config: { spend: { label: 'Spend', color: 'var(--chart-1)' } },
};

describe('ChartBlock draws each form of the §4 vocabulary', () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const at = `${theme} · ${width}px`;

      it(`reference lines: dashed and solid, labelled, a goal above the data still drawn · ${at}`, () => {
        const root = renderChart(
          {
            ...spendBar,
            reference_lines: [
              { value: 120, label: 'Goal', style: 'dashed' },
              { value: 50, label: 'Floor', style: 'solid' },
            ],
          },
          theme,
          width,
        );
        const [goal, floor] = referenceLines(root);
        expect(referenceLines(root)).toHaveLength(2);
        expect(goal?.getAttribute('data-chart-reference-line')).toBe('Goal');
        expect(lineOf(goal)?.getAttribute('stroke-dasharray')).toBe('6 4');
        expect(goal?.getAttribute('data-chart-reference-style')).toBe('dashed');
        expect(lineOf(floor)?.hasAttribute('stroke-dasharray')).toBe(false);
        expect(floor?.getAttribute('data-chart-reference-style')).toBe('solid');
        expect(all(root, '.chart-reference-label').map((node) => node.textContent)).toEqual([
          'Goal · $120 MXN',
          'Floor · $50.00 MXN',
        ]);
        // The value axis grew to hold the goal: it sits on a tick, not off the chart.
        expect(tickNamed(root, '$120 MXN')).toBeTruthy();
        const label = root.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '';
        expect(label).toContain('Reference line Goal $120 MXN');
        expect(label).toContain('Reference line Floor $50.00 MXN');
        expectThemeTokens(root);
      });

      it(`a second axis and a combo: bars on the left, a line on the right · ${at}`, async () => {
        const combo = renderChart(
          {
            ...spendBar,
            chart_config: {
              spend: { label: 'Spend', color: 'var(--chart-1)' },
              cpr: { label: 'Cost per result', color: 'var(--chart-3)' },
            },
            series_kind: { cpr: 'line' },
            series_axis: { cpr: 'right' },
          },
          theme,
          width,
        );
        await waitFor(() => expect(bars(combo)).toHaveLength(4), SETTLE);
        expect(yAxes(combo)).toHaveLength(2);
        expect(all(combo, RIGHT_AXIS_TICKS).length).toBeGreaterThan(0);
        expect(all(combo, '.recharts-line')).toHaveLength(1);
        expect(drawnAfterBars(combo, combo.querySelector('.recharts-line'))).toBe(true);
        expect(legendItems(combo)).toEqual(['Spend', 'Cost per result']);
        expectThemeTokens(combo);
        cleanup();
        // Without series_axis there is one value axis and both series are bars.
        const plain = renderChart(
          {
            ...spendBar,
            chart_config: {
              spend: { label: 'Spend', color: 'var(--chart-1)' },
              cpr: { label: 'Cost per result', color: 'var(--chart-3)' },
            },
          },
          theme,
          width,
        );
        await waitFor(() => expect(bars(plain)).toHaveLength(8), SETTLE);
        expect(yAxes(plain)).toHaveLength(1);
        expect(all(plain, '.recharts-line')).toHaveLength(0);
      });

      it(`a horizontal ranking in each sort order, long names clipped with a title · ${at}`, () => {
        const ranking = {
          ...spendBar,
          orientation: 'horizontal',
          data: [
            ...spendRows.slice(0, 3),
            { campaign: 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS', spend: 20, cpr: 30 },
          ],
        };
        const desc = renderChart({ ...ranking, sort: 'desc' }, theme, width);
        const longName = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS';
        expect(categoryTicks(desc, 'y')).toEqual(['Gamma', 'Beta', 'Alpha', longName]);
        expect(desc.getAttribute('data-chart-orientation')).toBe('horizontal');
        const long = tickNamed(desc, longName);
        expect(long?.querySelector('title')?.textContent).toBe(longName);
        expect(all(long as Element, 'tspan').map((node) => node.textContent)).toEqual([
          'SUPERCALIFRAGIL…',
        ]);
        expectFitsAPhone(desc);
        cleanup();
        const asc = renderChart({ ...ranking, sort: 'asc' }, theme, width);
        expect(categoryTicks(asc, 'y')).toEqual([longName, 'Alpha', 'Beta', 'Gamma']);
        cleanup();
        const asGiven = renderChart(ranking, theme, width);
        expect(categoryTicks(asGiven, 'y')).toEqual(['Alpha', 'Beta', 'Gamma', longName]);
        expect(JSON.parse(asGiven.getAttribute('data-chart-categories') ?? '[]')).toEqual([
          'Alpha',
          'Beta',
          'Gamma',
          longName,
        ]);
      });

      it(`a waterfall without totals draws its causes from zero, signed · ${at}`, async () => {
        const root = renderChart(
          {
            ...base,
            chart_type: 'waterfall',
            category_key: 'cause',
            data: [
              { cause: 'Price', delta: 12 },
              { cause: 'Volume', delta: -5 },
              { cause: 'Mix', delta: 3 },
            ],
            chart_config: { delta: { label: 'Impact', color: 'var(--chart-1)' } },
          },
          theme,
          width,
        );
        await waitFor(
          () => expect(valueLabels(root)).toEqual(['+$12.00 MXN', '-$5.00 MXN', '+$3.00 MXN']),
          SETTLE,
        );
        expect(bars(root).map((bar) => bar.fill)).toEqual([
          'var(--color-delta)',
          'var(--color-delta)',
          'var(--color-delta)',
        ]);
        expect(JSON.parse(root.getAttribute('data-chart-categories') ?? '[]')).toEqual([
          'Price',
          'Volume',
          'Mix',
        ]);
        expectThemeTokens(root);
      });

      it(`a funnel keeps its flow order even when a stage outgrows the last · ${at}`, async () => {
        const root = renderChart(
          {
            ...base,
            value_format: 'number',
            chart_type: 'funnel',
            category_key: 'stage',
            data: [
              { stage: 'Visits', people: 1_000 },
              { stage: 'Carts', people: 200 },
              { stage: 'Checkouts', people: 250 },
            ],
            chart_config: { people: { label: 'People', color: 'var(--chart-1)' } },
          },
          theme,
          width,
        );
        expect(categoryTicks(root, 'y')).toEqual(['Visits', 'Carts', 'Checkouts']);
        await waitFor(
          () => expect(valueLabels(root)).toEqual(['1,000', '200 · 20%', '250 · 130%']),
          SETTLE,
        );
      });

      it(`a marker on a vertical bar chart stands on its category · ${at}`, () => {
        const root = renderChart(
          { ...spendBar, markers: [{ category: 'Beta', label: 'Outlier' }] },
          theme,
          width,
        );
        const marker = root.querySelector('g[data-chart-marker]');
        expect(marker?.getAttribute('data-chart-marker')).toBe('Outlier');
        expect(marker?.getAttribute('data-chart-marker-category')).toBe('Beta');
        expect(num(lineOf(marker) as Element, 'x1')).toBe(
          num(tickNamed(root, 'Beta') as Element, 'x'),
        );
        expect(all(root, '.chart-marker-label').map((node) => node.textContent)).toEqual([
          'Outlier',
        ]);
        expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
          'Marker Outlier at Beta',
        );
        expectThemeTokens(root);
      });

      it(`value labels print only when show_values asks, on bars and on points · ${at}`, async () => {
        chartWidth = width;
        render(
          <div className={theme === 'dark' ? 'dark' : undefined}>
            <div data-case="labelled">
              <ChartBlock
                block={chartBlockV2Schema.parse({ ...spendBar, show_values: true })}
                isStreaming={false}
              />
            </div>
            <div data-case="bare">
              <ChartBlock block={chartBlockV2Schema.parse(spendBar)} isStreaming={false} />
            </div>
            <div data-case="line">
              <ChartBlock
                block={chartBlockV2Schema.parse({
                  ...spendBar,
                  chart_type: 'line',
                  category_key: 'day',
                  // A week: fewer points and a one-series line is its figures as tiles.
                  data: WEEK.map((spend, index) => ({ day: `Oct ${index + 1}`, spend })),
                  show_values: true,
                })}
                isStreaming={false}
              />
            </div>
          </div>,
        );
        const section = (name: string) =>
          document.querySelector<HTMLElement>(`[data-case="${name}"]`) as HTMLElement;
        const printed = (name: string) =>
          all(section(name), '.chart-value-label').map((node) => node.textContent);
        const figures = ['$40.00 MXN', '$60.00 MXN', '$80.00 MXN', '$20.00 MXN'];
        await waitFor(() => expect(printed('labelled')).toEqual(figures), SETTLE);
        await waitFor(
          () => expect(printed('line')).toEqual(WEEK.map((spend) => `$${spend}.00 MXN`)),
          SETTLE,
        );
        // Both bar charts finished animating together; the one not asked prints nothing.
        expect(printed('bare')).toEqual([]);
        for (const name of ['labelled', 'line']) expectThemeTokens(section(name));
      });
    }
  }
});

describe('ChartBlock keeps a §4 block that predates the vocabulary as it was', () => {
  it('draws a legacy bar chart with one value axis, no callouts, no legend, no labels', async () => {
    const root = renderChart(caseBlock('case-12'), 'light', 1280);
    expect(yAxes(root)).toHaveLength(1);
    expect(referenceLines(root)).toHaveLength(0);
    expect(root.querySelector('[data-chart-marker]')).toBeNull();
    cleanup();
    const { show_values: _shown, ...legacy } = caseBlock('case-12');
    const single = renderChart(
      { ...legacy, chart_config: { delivered: legacy.chart_config.delivered } },
      'light',
      1280,
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(valueLabels(single)).toEqual([]);
    expect(legendItems(single)).toEqual([]);
  });
});

describe('ChartBlock fits a narrow answer', () => {
  it('wraps a waterfall’s long cause names instead of forcing a sideways scroll', () => {
    const waterfall = caseBlock('case-3');
    expect(
      waterfall.data.some((row: Record<string, unknown>) => String(row.cause).length > 18),
    ).toBe(true);
    const root = renderChart(waterfall, 'light', 375);
    expect(root.querySelector<HTMLElement>('[data-chart]')?.style.minWidth).toBe('');
    // No scroller around it either: its scrollbar is what left a chart drawn 10px too wide.
    expect(root.querySelector('.overflow-x-auto')).toBeNull();
  });

  it('still gives a legacy vertical bar chart with long names its width, in a scroller', () => {
    const long = {
      ...caseBlock('case-12'),
      data: (caseBlock('case-12').data as Array<Record<string, unknown>>).map((row, index) => ({
        ...row,
        week: `Semana ${index + 1} del vuelo de awareness`,
      })),
    };
    const root = renderChart(long, 'light', 375);
    expect(root.querySelector<HTMLElement>('[data-chart]')?.style.minWidth).toBe('640px');
    expect(root.querySelector('.overflow-x-auto [data-chart]')).not.toBeNull();
  });
});
