import { describe, expect, it } from 'bun:test';

import {
  cellsOfBlocks,
  chartBlockSchema,
  checkpointBlockV2Schema,
  headersOfBlocks,
} from './jaina-report';

// The presentation standard §4 chart vocabulary (P12): goal lines, a second axis, bars and
// lines together, sorted horizontal rankings, waterfalls, funnels, markers and value labels.

const base = {
  block_id: 'c1',
  category: 'chart' as const,
  scope: 'account',
  title: 'Gasto y costo por resultado',
  priority: 'primary' as const,
};

const combo = {
  ...base,
  chart_type: 'bar' as const,
  category_key: 'week',
  data: [
    { week: 'Sem 1', spend: 12_000, cpr: 41.2 },
    { week: 'Sem 2', spend: 13_500, cpr: 44.9 },
    { week: 'Sem 3', spend: 11_800, cpr: 47.3 },
  ],
  chart_config: {
    spend: { label: 'Gasto (MXN)', color: 'var(--chart-1)' },
    cpr: { label: 'Costo por resultado (MXN)', color: 'var(--chart-2)' },
  },
  value_format: 'currency' as const,
  currency_code: 'MXN',
  series_kind: { cpr: 'line' as const },
  series_axis: { cpr: 'right' as const },
  reference_lines: [
    { value: 45, label: 'Meta CPR', axis: 'right' as const, style: 'dashed' as const },
  ],
};

const waterfall = {
  ...base,
  chart_type: 'waterfall' as const,
  category_key: 'cause',
  value_key: 'delta',
  data: [
    { cause: 'CPM', delta: 3.1 },
    { cause: 'CTR', delta: 2.4 },
    { cause: 'CVR', delta: -1.0 },
    { cause: 'Mezcla', delta: 0.5 },
  ],
  chart_config: { delta: { label: 'Cambio (MXN)', color: 'var(--chart-1)' } },
  start: { label: 'Semana pasada', value: 40 },
  end: { label: 'Esta semana', value: 45 },
  show_values: true,
};

const messagesOf = (result: {
  success: boolean;
  error?: { issues: Array<{ message: string }> };
}) => (result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.message));

describe('chart vocabulary — every new field is optional', () => {
  it('parses a chart written before the vocabulary without adding a single field', () => {
    const legacy = {
      ...base,
      chart_type: 'line' as const,
      category_key: 'day',
      data: [{ day: '2026-10-01', spend: 100 }],
      chart_config: { spend: { label: 'Gasto', color: '#000' } },
    };
    const parsed = chartBlockSchema.parse(legacy);
    for (const field of [
      'reference_lines',
      'series_axis',
      'series_kind',
      'orientation',
      'sort',
      'markers',
      'show_values',
      'start',
      'end',
    ]) {
      expect(Object.hasOwn(parsed, field)).toBe(false);
    }
  });

  it('carries a combo chart — bars, a line on the right axis and its goal line — verbatim', () => {
    const parsed = chartBlockSchema.parse(combo);
    expect(parsed.series_kind).toEqual({ cpr: 'line' });
    expect(parsed.series_axis).toEqual({ cpr: 'right' });
    expect(parsed.reference_lines).toEqual(combo.reference_lines);
  });

  it('defaults a reference line to dashed, the standard target style', () => {
    const parsed = chartBlockSchema.parse({
      ...combo,
      reference_lines: [{ value: 13_000, label: 'Presupuesto semanal' }],
    });
    expect(parsed.reference_lines?.[0]?.style).toBe('dashed');
  });

  it('carries a sorted horizontal ranking with a marker on the outlier', () => {
    const ranking = {
      ...base,
      chart_type: 'bar' as const,
      category_key: 'campaign',
      data: [
        { campaign: 'ITESO', cpr: 92 },
        { campaign: 'CAÑADAS', cpr: 41 },
        { campaign: 'AV CAMACHO', cpr: 38 },
      ],
      chart_config: { cpr: { label: 'CPR (MXN)', color: 'var(--chart-1)' } },
      orientation: 'horizontal' as const,
      sort: 'desc' as const,
      markers: [{ category: 'ITESO', label: 'Atípico' }],
      show_values: true,
    };
    expect(chartBlockSchema.safeParse(ranking).success).toBe(true);
    expect(chartBlockSchema.safeParse({ ...ranking, sort: null }).success).toBe(true);
  });

  it('carries a waterfall whose deltas carry the opening total to the closing one', () => {
    const parsed = chartBlockSchema.parse(waterfall);
    expect(parsed.start).toEqual({ label: 'Semana pasada', value: 40 });
    expect(parsed.end).toEqual({ label: 'Esta semana', value: 45 });
  });

  it('carries a funnel of one measure', () => {
    const funnel = {
      ...base,
      chart_type: 'funnel' as const,
      category_key: 'stage',
      data: [
        { stage: 'Impresiones', count: 450_000 },
        { stage: 'Clics', count: 9_450 },
        { stage: 'Conversaciones', count: 610 },
        { stage: 'Ventas', count: 74 },
      ],
      chart_config: { count: { label: 'Personas', color: 'var(--chart-1)' } },
    };
    expect(chartBlockSchema.safeParse(funnel).success).toBe(true);
  });
});

describe('chart vocabulary — renderability invariants', () => {
  it('refuses a reference line without a numeric value', () => {
    for (const value of ['45', null, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      const result = chartBlockSchema.safeParse({
        ...combo,
        reference_lines: [{ value, label: 'Meta', axis: 'right' }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('refuses a waterfall whose deltas do not sum to end − start', () => {
    const result = chartBlockSchema.safeParse({
      ...waterfall,
      data: waterfall.data.slice(0, 3),
    });
    expect(messagesOf(result).join(' ')).toContain('waterfall deltas sum to');
  });

  it('measures a missing cause against the move, not the totals', () => {
    // $0.50 of a $5.00 rise left out: 1% of the $45 total would let it through.
    const result = chartBlockSchema.safeParse({
      ...waterfall,
      data: [
        { cause: 'CPM', delta: 3.1 },
        { cause: 'CTR', delta: 2.4 },
        { cause: 'CVR', delta: -1.0 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a waterfall off by cent rounding, and one with a single total (nothing to sum against)', () => {
    const rounded = waterfall.data.map((row) => ({ ...row, delta: row.delta + 0.005 }));
    expect(chartBlockSchema.safeParse({ ...waterfall, data: rounded }).success).toBe(true);
    const { end: _end, ...openOnly } = waterfall;
    expect(chartBlockSchema.safeParse({ ...openOnly, data: rounded.slice(0, 2) }).success).toBe(
      true,
    );
  });

  it('refuses a waterfall or funnel row without a number to plot', () => {
    const result = chartBlockSchema.safeParse({
      ...waterfall,
      start: undefined,
      end: undefined,
      data: [...waterfall.data, { cause: 'Otro', delta: 'n/d' }],
    });
    expect(messagesOf(result).join(' ')).toContain('needs a number at "delta"');
  });

  it('refuses a waterfall with two measures and no value_key', () => {
    const result = chartBlockSchema.safeParse({
      ...waterfall,
      value_key: null,
      data: waterfall.data.map((row) => ({ ...row, other: 1 })),
      chart_config: {
        delta: { label: 'Cambio', color: '#111' },
        other: { label: 'Otro', color: '#222' },
      },
    });
    expect(messagesOf(result).join(' ')).toContain('plots one measure');
  });

  it('refuses a series role, a right-axis goal or a marker that names nothing on the chart', () => {
    expect(
      messagesOf(chartBlockSchema.safeParse({ ...combo, series_axis: { cost: 'right' } })).join(
        ' ',
      ),
    ).toContain('"cost", which is not a chart_config series');
    expect(
      messagesOf(chartBlockSchema.safeParse({ ...combo, series_kind: { ctr: 'line' } })).join(' '),
    ).toContain('"ctr", which is not a chart_config series');
    expect(
      messagesOf(chartBlockSchema.safeParse({ ...combo, series_axis: { cpr: 'left' } })).join(' '),
    ).toContain('no series is on the right axis');
    expect(
      messagesOf(
        chartBlockSchema.safeParse({ ...combo, markers: [{ category: 'Sem 9', label: 'Hoy' }] }),
      ).join(' '),
    ).toContain('"Sem 9" is not a week in the data');
  });

  it('refuses a sorted or sideways trend, and cartesian furniture on a chart without axes', () => {
    const line = { ...combo, chart_type: 'line' as const, series_kind: undefined };
    expect(messagesOf(chartBlockSchema.safeParse({ ...line, sort: 'desc' })).join(' ')).toContain(
      'scrambles the order',
    );
    expect(
      messagesOf(chartBlockSchema.safeParse({ ...line, orientation: 'horizontal' })).join(' '),
    ).toContain('only a bar chart lies on its side');
    const doughnut = {
      ...base,
      chart_type: 'doughnut' as const,
      category_key: 'platform',
      value_key: 'spend',
      data: [
        { platform: 'Meta', spend: 10 },
        { platform: 'Google', spend: 5 },
      ],
      chart_config: { Meta: { label: 'Meta', color: '#111' } },
    };
    expect(
      messagesOf(
        chartBlockSchema.safeParse({ ...doughnut, reference_lines: [{ value: 1, label: 'x' }] }),
      ).join(' '),
    ).toContain('no value axis');
    expect(
      messagesOf(
        chartBlockSchema.safeParse({ ...doughnut, markers: [{ category: 'Meta', label: 'x' }] }),
      ).join(' '),
    ).toContain('no category axis');
    expect(
      messagesOf(chartBlockSchema.safeParse({ ...combo, start: { label: 'x', value: 1 } })).join(
        ' ',
      ),
    ).toContain('totals of a waterfall');
  });

  it('enforces the same rules on the union the Frontend and the Backend both parse', () => {
    expect(checkpointBlockV2Schema.safeParse(combo).success).toBe(true);
    expect(checkpointBlockV2Schema.safeParse(waterfall).success).toBe(true);
    expect(
      checkpointBlockV2Schema.safeParse({ ...waterfall, data: waterfall.data.slice(0, 1) }).success,
    ).toBe(false);
  });
});

describe('chart vocabulary — what the renderer prints is a figure like any other', () => {
  it('lists a goal line and a waterfall’s totals among the block’s shown values', () => {
    const cells = cellsOfBlocks([combo, waterfall]).map((cell) => [cell.where, cell.value]);
    expect(cells).toContainEqual(['c1.reference_lines[0].value', 45]);
    expect(cells).toContainEqual(['c1.start.value', 40]);
    expect(cells).toContainEqual(['c1.end.value', 45]);
  });

  it('lists reference-line and marker labels among the headings', () => {
    const headers = headersOfBlocks([
      { ...combo, markers: [{ category: 'Sem 3', label: 'Hoy' }] },
    ]).map((cell) => cell.value);
    expect(headers).toContain('Meta CPR');
    expect(headers).toContain('Hoy');
  });
});
