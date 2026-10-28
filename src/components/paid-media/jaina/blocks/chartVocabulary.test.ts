import { describe, expect, it } from 'bun:test';
import {
  type ChartBlockV2,
  chartBlockV2Schema,
  checkpointBlockV2Schema,
} from '@/lib/jaina/schemas';
import { CHART_CASES } from './chartCases.fixture';
import {
  drawnRowsOf,
  isCartesianChart,
  isHorizontalChart,
  LABEL_KEY,
  printedValueOf,
  RANGE_KEY,
  seriesKeysOf,
  seriesKindOf,
  stageShare,
  TOTAL_KEY,
} from './chartVocabulary';

const caseBlock = (id: string) => {
  const found = CHART_CASES.find((entry) => entry.id === id);
  if (!found) throw new Error(`no chart case ${id}`);
  return found.block;
};
const feBlock = (id: string): ChartBlockV2 => chartBlockV2Schema.parse(caseBlock(id));
const issuesOf = (block: unknown) => {
  const result = checkpointBlockV2Schema.safeParse(block);
  return result.success ? [] : result.error.issues;
};

describe('the render union keeps the §4 vocabulary and its invariants', () => {
  it('parses every chart case with every field as given, priority as its rank', () => {
    for (const { id, block } of CHART_CASES) {
      const parsed = checkpointBlockV2Schema.parse(block);
      const { priority, ...rest } = parsed as ChartBlockV2;
      const { priority: _contractPriority, ...input } = block;
      expect(typeof priority, id).toBe('number');
      expect(rest, id).toEqual(input);
    }
  });

  it('rejects a waterfall whose deltas do not carry the start to the end', () => {
    const block = caseBlock('case-3');
    const issues = issuesOf({ ...block, end: { label: 'Esta semana', value: 60 } });
    expect(issues.map((issue) => issue.path.join('.'))).toContain('data');
    expect(issues.map((issue) => issue.message).join(' ')).toContain('waterfall deltas sum to');
  });

  it('rejects a reference line whose value is not a number', () => {
    const block = caseBlock('case-7');
    const issues = issuesOf({
      ...block,
      reference_lines: [{ value: '1800', label: 'Meta del mes', style: 'dashed' }],
    });
    expect(issues.map((issue) => issue.path.join('.'))).toContain('reference_lines.0.value');
  });

  it('forwards the vocabulary issues the old re-parse dropped (paths outside data/chart_config)', () => {
    const block = caseBlock('case-7');
    const marker = issuesOf({ ...block, markers: [{ category: '32 oct', label: 'Hoy' }] });
    expect(marker.map((issue) => issue.path.join('.'))).toEqual(['markers.0.category']);
    const axis = issuesOf({
      ...block,
      reference_lines: [{ value: 1800, label: 'Meta', axis: 'right', style: 'dashed' }],
    });
    expect(axis.map((issue) => issue.path.join('.'))).toEqual(['reference_lines.0.axis']);
    const sorted = issuesOf({ ...block, sort: 'desc' });
    expect(sorted.map((issue) => issue.path.join('.'))).toEqual(['sort']);
  });

  it('still rejects a series that never appears in the rows', () => {
    const block = caseBlock('case-12');
    const issues = issuesOf({
      ...block,
      chart_config: { ...block.chart_config, ghost: { label: 'Ghost', color: 'red' } },
    });
    expect(issues.map((issue) => issue.path.join('.'))).toEqual(['chart_config.ghost']);
  });
});

describe('drawnRowsOf — the rows a chart draws, in the order it draws them', () => {
  it('ranks case-4 by October descending', () => {
    const block = feBlock('case-4');
    expect(drawnRowsOf(block).map((row) => row.campaign)).toEqual([
      'ITESO // MENSAJES',
      'ALEIRA // MENSAJES',
      'PROVIDENCIA // MENSAJES',
      'CAÑADAS // MENSAJES',
      'AV CAMACHO // MENSAJES',
    ]);
    expect(drawnRowsOf({ ...block, sort: 'asc' }).map((row) => row.campaign)[0]).toBe(
      'AV CAMACHO // MENSAJES',
    );
    expect(drawnRowsOf({ ...block, sort: null })).toEqual(block.data);
  });

  it('ranks by the first series when no value_key is set, and a stacked bar by its row total', () => {
    const bar = { ...feBlock('case-4'), value_key: null };
    // The first chart_config key is cpr_oct.
    expect(drawnRowsOf(bar)[0]?.campaign).toBe('ITESO // MENSAJES');
    const stacked = { ...feBlock('case-11'), sort: 'asc' as const };
    // Octubre totals $304,634; Septiembre $334,441.
    expect(drawnRowsOf(stacked).map((row) => row.period)).toEqual(['Octubre (1–27)', 'Septiembre']);
  });

  it('never reorders a trend', () => {
    const block = feBlock('case-7');
    expect(drawnRowsOf({ ...block, sort: 'desc' })).toEqual(block.data);
  });

  it('floats each waterfall cause from the running total, between the two totals', () => {
    const rows = drawnRowsOf(feBlock('case-3'));
    expect(rows.map((row) => row.cause)).toEqual([
      'Semana pasada',
      'CPM',
      'CTR',
      'Tasa de conversación',
      'Mezcla de campañas',
      'Esta semana',
    ]);
    const ranges = rows.map((row) =>
      (row[RANGE_KEY] as number[]).map((value) => Math.round(value * 100) / 100),
    );
    expect(ranges).toEqual([
      [0, 41.2],
      [41.2, 45.1],
      [45.1, 46.95],
      [46, 46.95],
      [46, 46.6],
      [0, 46.6],
    ]);
    expect(rows.map((row) => row[LABEL_KEY])).toEqual([
      '$41.20 MXN',
      '+$3.90 MXN',
      '+$1.85 MXN',
      '-$0.95 MXN',
      '+$0.60 MXN',
      '$46.60 MXN',
    ]);
    expect(rows.map((row) => row[TOTAL_KEY] === true)).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('runs a waterfall without totals from zero', () => {
    const { start: _start, end: _end, ...block } = feBlock('case-3');
    const rows = drawnRowsOf(block);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.[RANGE_KEY]).toEqual([0, 3.9]);
  });

  it('labels each funnel stage with its share of the stage before it, in flow order', () => {
    const rows = drawnRowsOf(feBlock('form-funnel'));
    expect(rows.map((row) => row[LABEL_KEY])).toEqual([
      '1,284,500',
      '18,420 · 1.4%',
      '2,315 · 13%',
      '412 · 18%',
    ]);
  });
});

describe('the vocabulary’s small rules', () => {
  it('prints a stage share to two significant figures, and none after an empty stage', () => {
    expect(stageShare(2_315, 18_420)).toBe('13%');
    expect(stageShare(18_420, 1_284_500)).toBe('1.4%');
    expect(stageShare(3, 1_000)).toBe('0.3%');
    expect(stageShare(5, 0)).toBeNull();
  });

  it('draws a series as series_kind names it, else as the chart type', () => {
    const combo = feBlock('case-2');
    expect(seriesKindOf(combo, 'cpr_oct')).toBe('line');
    expect(seriesKindOf(combo, 'spend_oct')).toBe('bar');
    const pacing = feBlock('case-7');
    expect(seriesKindOf(pacing, 'actual')).toBe('area');
    expect(seriesKindOf(pacing, 'expected')).toBe('line');
    expect(seriesKindOf({ ...pacing, chart_type: 'line', series_kind: undefined }, 'actual')).toBe(
      'line',
    );
  });

  it('plots one measure on a waterfall or funnel and every series elsewhere', () => {
    expect(seriesKeysOf(feBlock('case-3'))).toEqual(['delta']);
    expect(seriesKeysOf(feBlock('form-funnel'))).toEqual(['people']);
    expect(seriesKeysOf(feBlock('case-11'))).toEqual(['meta', 'google', 'tiktok', 'dv360']);
  });

  it('lays a ranking and a funnel on their side, nothing else', () => {
    expect(isHorizontalChart(feBlock('case-4'))).toBe(true);
    expect(isHorizontalChart(feBlock('case-11'))).toBe(true);
    expect(isHorizontalChart(feBlock('form-funnel'))).toBe(true);
    expect(isHorizontalChart(feBlock('case-3'))).toBe(false);
    expect(isHorizontalChart({ chart_type: 'line', orientation: 'horizontal' })).toBe(false);
  });

  it('draws waterfalls and funnels on the cartesian path, never as a pie', () => {
    for (const type of ['bar', 'line', 'area', 'stacked_bar', 'waterfall', 'funnel'] as const) {
      expect(isCartesianChart({ chart_type: type })).toBe(true);
    }
    for (const type of ['pie', 'doughnut', 'radar'] as const) {
      expect(isCartesianChart({ chart_type: type })).toBe(false);
    }
  });

  it('prints a plotted value as its bar label when it has one, else formatted', () => {
    const block = feBlock('case-3');
    const [start, cpm] = drawnRowsOf(block);
    expect(start && printedValueOf(start, 'delta', block)).toBe('$41.20 MXN');
    expect(cpm && printedValueOf(cpm, 'delta', block)).toBe('+$3.90 MXN');
    expect(printedValueOf({ delta: 2 }, 'delta', block)).toBe('$2.00 MXN');
    expect(printedValueOf({}, 'delta', block)).toBeNull();
  });
});
