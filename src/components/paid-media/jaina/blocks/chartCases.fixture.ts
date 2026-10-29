// The chart of each worked case in the presentation standard §12 that calls for one (2, 3, 4,
// 7, 11, 12), plus a funnel — the §4 vocabulary end to end. Invented MXN figures for a mixed
// WhatsApp + checkout account in October 2026 (27 of 31 days elapsed), as §12 allows.
//
// Contract-shaped (`chartBlockSchema` parses each at module load, so a fixture that breaks an
// invariant fails here, not in a screenshot). Shared by the ChartBlock render tests and
// `jaina:answer-formats:e2e:bench`, which streams them to the real chat as finished answers.

import { type ChartBlock, chartBlockSchema } from '@continuum/contracts';

export type ChartCase = {
  /** The §12 row, or the §4 form for a chart no worked case carries. */
  id: string;
  question: string;
  /** The answer's lead sentence: the result first, in the question's language. */
  sentence: string;
  /** What the chart must show for the case to read as the standard specifies. */
  expect: string;
  block: ChartBlock;
};

const base = (block_id: string, title: string) => ({
  block_id,
  category: 'chart' as const,
  scope: 'account',
  title,
  priority: 'primary' as const,
  currency_code: 'MXN',
});

const DAYS_IN_MONTH = 31;
const TODAY = 27;
const MONTH_GOAL = 1_800;
/** Conversations per day, Oct 1–27. */
const DAILY = [
  48, 51, 55, 57, 60, 44, 41, 53, 56, 58, 62, 59, 46, 43, 54, 57, 60, 61, 58, 45, 42, 55, 59, 63,
  60, 58, 63,
];

const pacingRows = (): ChartBlock['data'] => {
  let actual = 0;
  const rows: ChartBlock['data'] = [];
  const toDate = DAILY.reduce((sum, day) => sum + day, 0);
  const rate = toDate / TODAY;
  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    const row: Record<string, string | number> = {
      day: `${day} oct`,
      expected: Math.round((MONTH_GOAL * day) / DAYS_IN_MONTH),
    };
    if (day <= TODAY) {
      actual += DAILY[day - 1] ?? 0;
      row.actual = actual;
    }
    if (day >= TODAY) row.projected = Math.round(toDate + rate * (day - TODAY));
    rows.push(row);
  }
  return rows;
};

const cases: Array<Omit<ChartCase, 'block'> & { block: unknown }> = [
  {
    id: 'case-2',
    question: '¿Cómo le fue a la cuenta este mes?',
    sentence:
      'Octubre va 13% arriba de septiembre en gasto, y el costo por conversación ya pasó la meta de $45.00 MXN en la semana 3.',
    expect:
      'grouped spend bars (Sep vs Oct) on the left axis, the cost-per-conversation line on a right axis, the $45.00 MXN goal as a dashed reference line on that axis',
    block: {
      ...base('case2_spend_cpr', 'Gasto por semana y costo por conversación'),
      chart_type: 'bar',
      category_key: 'week',
      data: [
        { week: 'Sem 1', spend_sep: 21_480.5, spend_oct: 23_105.2, cpr_oct: 42.31 },
        { week: 'Sem 2', spend_sep: 22_010, spend_oct: 24_870.65, cpr_oct: 44.12 },
        { week: 'Sem 3', spend_sep: 20_950.75, spend_oct: 25_402.1, cpr_oct: 47.85 },
        { week: 'Sem 4 (parcial)', spend_sep: 18_300.4, spend_oct: 19_880.3, cpr_oct: 49.02 },
      ],
      chart_config: {
        spend_sep: { label: 'Gasto septiembre (MXN)', color: 'var(--chart-4)' },
        spend_oct: { label: 'Gasto octubre (MXN)', color: 'var(--chart-1)' },
        cpr_oct: { label: 'Costo por conversación octubre (MXN)', color: 'var(--chart-3)' },
      },
      x_axis_label: 'Semana',
      value_format: 'currency',
      series_kind: { cpr_oct: 'line' },
      series_axis: { cpr_oct: 'right' },
      reference_lines: [
        { value: 45, label: 'Meta de costo por conversación', axis: 'right', style: 'dashed' },
      ],
    },
  },
  {
    id: 'case-3',
    question: '¿Por qué subió el costo por resultado esta semana?',
    sentence:
      'El costo por conversación subió de $41.20 MXN a $46.60 MXN; el CPM explica $3.90 MXN de los $5.40 MXN (72%).',
    expect:
      'a waterfall from last week’s cost to this week’s, one signed bar per cause with its value label',
    block: {
      ...base('case3_cpr_contribution', 'Qué movió el costo por conversación'),
      chart_type: 'waterfall',
      category_key: 'cause',
      value_key: 'delta',
      data: [
        { cause: 'CPM', delta: 3.9 },
        { cause: 'CTR', delta: 1.85 },
        { cause: 'Tasa de conversación', delta: -0.95 },
        { cause: 'Mezcla de campañas', delta: 0.6 },
      ],
      chart_config: { delta: { label: 'Aporte (MXN)', color: 'var(--chart-1)' } },
      value_format: 'currency',
      start: { label: 'Semana pasada', value: 41.2 },
      end: { label: 'Esta semana', value: 46.6 },
      show_values: true,
    },
  },
  {
    id: 'case-4',
    question: 'Compárame las cinco campañas que más gastaron este mes contra el mes pasado',
    sentence:
      'ITESO duplicó su costo por conversación (de $44.10 MXN a $96.40 MXN); las otras cuatro se movieron menos de 10%.',
    expect:
      'horizontal grouped bars of cost per conversation by campaign (Oct vs Sep), sorted by October descending, the outlier marked',
    block: {
      ...base('case4_campaign_cpr', 'Costo por conversación por campaña'),
      chart_type: 'bar',
      category_key: 'campaign',
      value_key: 'cpr_oct',
      data: [
        { campaign: 'CAÑADAS // MENSAJES', cpr_sep: 39.8, cpr_oct: 42.15 },
        { campaign: 'AV CAMACHO // MENSAJES', cpr_sep: 41.25, cpr_oct: 40.6 },
        { campaign: 'ITESO // MENSAJES', cpr_sep: 44.1, cpr_oct: 96.4 },
        { campaign: 'ALEIRA // MENSAJES', cpr_sep: 52.3, cpr_oct: 55.75 },
        { campaign: 'PROVIDENCIA // MENSAJES', cpr_sep: 47.9, cpr_oct: 45.2 },
      ],
      chart_config: {
        cpr_oct: { label: 'Octubre (MXN)', color: 'var(--chart-1)' },
        cpr_sep: { label: 'Septiembre (MXN)', color: 'var(--chart-4)' },
      },
      value_format: 'currency',
      orientation: 'horizontal',
      sort: 'desc',
      markers: [{ category: 'ITESO // MENSAJES', label: 'Atípico' }],
      show_values: true,
    },
  },
  {
    id: 'case-7',
    question: '¿Cómo va la campaña CAÑADAS // MENSAJES contra su meta del mes?',
    sentence:
      'Al día 27 lleva 1,468 conversaciones de 1,800; al ritmo actual cerraría el mes en unas 1,685, 6% debajo de la meta.',
    expect:
      'cumulative actuals as an area, the expected-pace line, the labelled linear projection to month end, the 1,800 goal as a dashed line, a marker on today',
    block: {
      ...base('case7_pacing', 'Conversaciones acumuladas contra la meta de octubre'),
      currency_code: null,
      chart_type: 'area',
      category_key: 'day',
      data: pacingRows(),
      chart_config: {
        actual: { label: 'Real acumulado', color: 'var(--chart-1)' },
        expected: { label: 'Ritmo esperado', color: 'var(--chart-4)' },
        projected: { label: 'Proyección (lineal, ritmo actual)', color: 'var(--chart-3)' },
      },
      value_format: 'number',
      series_kind: { expected: 'line', projected: 'line' },
      reference_lines: [{ value: MONTH_GOAL, label: 'Meta del mes', style: 'dashed' }],
      markers: [{ category: `${TODAY} oct`, label: 'Hoy' }],
    },
  },
  {
    id: 'case-11',
    question: 'Dame el portafolio consolidado de este mes contra el pasado, todas las plataformas',
    sentence: 'Octubre lleva $304,634.05 MXN en tres plataformas activas; DV360 no gastó este mes.',
    expect:
      'a horizontal stacked bar of spend by platform per period (Sep vs Oct), segment values shown, no cross-platform efficiency',
    block: {
      ...base('case11_platform_share', 'Gasto por plataforma'),
      chart_type: 'stacked_bar',
      category_key: 'period',
      data: [
        { period: 'Septiembre', meta: 182_450.3, google: 96_120, tiktok: 31_870.55, dv360: 24_000 },
        {
          period: 'Octubre (1–27)',
          meta: 171_905.1,
          google: 104_388.75,
          tiktok: 28_340.2,
          dv360: 0,
        },
      ],
      chart_config: {
        meta: { label: 'Meta', color: 'var(--chart-1)' },
        google: { label: 'Google', color: 'var(--chart-2)' },
        tiktok: { label: 'TikTok', color: 'var(--chart-5)' },
        dv360: { label: 'DV360', color: 'var(--chart-3)' },
      },
      value_format: 'currency',
      orientation: 'horizontal',
      show_values: true,
    },
  },
  {
    id: 'case-12',
    question: '¿Cómo va el alcance de la campaña de awareness en DV360 contra el plan?',
    sentence:
      'Entregó 936,742 personas únicas de 1,000,000 planeadas (94%); la semana 4 va parcial.',
    expect: 'grouped bars of planned vs delivered unique reach per week, each value labelled',
    block: {
      ...base('case12_reach_plan', 'Alcance único: plan contra entregado'),
      currency_code: null,
      chart_type: 'bar',
      category_key: 'week',
      data: [
        { week: 'Sem 1', planned: 250_000, delivered: 231_480 },
        { week: 'Sem 2', planned: 250_000, delivered: 262_915 },
        { week: 'Sem 3', planned: 250_000, delivered: 244_007 },
        { week: 'Sem 4 (parcial)', planned: 250_000, delivered: 198_340 },
      ],
      chart_config: {
        planned: { label: 'Alcance planeado', color: 'var(--chart-4)' },
        delivered: { label: 'Alcance entregado', color: 'var(--chart-1)' },
      },
      value_format: 'number',
      show_values: true,
    },
  },
  {
    id: 'form-funnel',
    question: '¿Dónde se pierde la gente en el checkout este mes?',
    sentence:
      'De 18,420 clics, 2,315 llegaron a pago y 412 compraron: el salto más grande es clic → pago (13%).',
    expect: 'descending stage bars with each stage’s share of the stage before it',
    block: {
      ...base('funnel_checkout', 'Embudo de checkout, octubre'),
      currency_code: null,
      chart_type: 'funnel',
      category_key: 'stage',
      value_key: 'people',
      data: [
        { stage: 'Impresiones', people: 1_284_500 },
        { stage: 'Clics en enlace', people: 18_420 },
        { stage: 'Vistas de pago', people: 2_315 },
        { stage: 'Compras', people: 412 },
      ],
      chart_config: { people: { label: 'Personas', color: 'var(--chart-1)' } },
      value_format: 'number',
      show_values: true,
    },
  },
];

export const CHART_CASES: ChartCase[] = cases.map((entry) => ({
  ...entry,
  block: chartBlockSchema.parse(entry.block),
}));
