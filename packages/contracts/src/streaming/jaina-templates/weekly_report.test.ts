import { describe, expect, it } from 'bun:test';
import { checkpointBlockV2Schema } from '../jaina-report';
import {
  ANSWER_TEMPLATE_IDS,
  type AnswerTemplatePayload,
  answerTemplatePayloadSchema,
  TEMPLATE_SPECS,
  type TemplateFigure,
  validateTemplateBlock,
  weeklyReportWindowProblems,
} from './index';

const periodA = { since: '2026-09-21', until: '2026-09-27', label: 'semana del 21 al 27' };
const periodB = { since: '2026-09-01', until: '2026-09-27', label: 'mes a la fecha' };
const priorA = { since: '2026-09-14', until: '2026-09-20', label: 'semana anterior' };

const insights = (level = 'campaign') => ({
  tool: 'get_campaign_batch_analysis',
  datasetId: 'ds_insights',
  level,
  entityId: null,
});

const fig = (
  id: string,
  value: number | null,
  unit: TemplateFigure['unit'],
  window: { since: string; until: string; label: string },
  tool = 'get_campaign_batch_analysis',
): TemplateFigure => ({
  id,
  label: id,
  value,
  unit,
  currency: unit === 'money' ? 'MXN' : null,
  window,
  source: { ...insights(), tool },
  derivation: null,
});

const figures: TemplateFigure[] = [
  fig('spend_a', 12000, 'money', periodA),
  fig('spend_prior', 10000, 'money', priorA),
  fig('leads_spend_a', 12000, 'money', periodA),
  fig('leads_results_a', 300, 'count', periodA),
  fig('leads_cpr_a', 40, 'money', periodA),
  fig('leads_target', 50, 'money', periodB, 'get_optimizer_status'),
  fig('leads_delta_a', -0.2, 'percent', periodA),
  fig('leads_spend_b', 40000, 'money', periodB),
  fig('leads_results_b', 900, 'count', periodB),
  fig('leads_cpr_b', 44.44, 'money', periodB),
  fig('leads_delta_b', -0.111, 'percent', periodB),
  fig('rec_cpa', 80, 'money', periodA, 'get_optimizer_pending_recs'),
];

const payload = (overrides: Partial<AnswerTemplatePayload> = {}): AnswerTemplatePayload =>
  answerTemplatePayloadSchema.parse({
    template_id: 'weekly_report',
    executive: { sentence: 'La semana cerró con {leads_cpr_a} por lead, bajo el objetivo.' },
    justification: {
      sections: [{ kind: 'measured', title: 'Qué medimos', text: 'Insights por campaña.' }],
    },
    figures,
    weekly_report: {
      header: {
        brand_name: 'Easy Fit',
        ad_account_id: 'act_1',
        timezone: 'America/Mexico_City',
        currency: 'MXN',
        period_a: periodA,
        period_b: periodB,
        prior_a: priorA,
      },
      tiles: [
        {
          id: 'spend',
          label: 'Inversión',
          figure_id: 'spend_a',
          prior_figure_id: 'spend_prior',
          read: 'peor',
          lower_is_better: false,
        },
      ],
      objectives: [
        {
          objective: 'leads',
          label: 'Leads',
          portfolio_ids: ['p1'],
          active: true,
          no_active_note: null,
          period_a: {
            spend: 'leads_spend_a',
            results: 'leads_results_a',
            cost_per_result: 'leads_cpr_a',
            target: 'leads_target',
            delta_vs_target: 'leads_delta_a',
          },
          period_b: {
            spend: 'leads_spend_b',
            results: 'leads_results_b',
            cost_per_result: 'leads_cpr_b',
            target: 'leads_target',
            delta_vs_target: 'leads_delta_b',
          },
          signal: { text: 'Bajo el objetivo: {leads_delta_a}.', tone: 'good' },
          what: 'El lead costó {leads_cpr_a}.',
          so_what: 'Hay margen contra {leads_target}.',
          now_what: 'Sostener el presupuesto.',
        },
        {
          objective: 'purchases',
          label: 'Compras',
          portfolio_ids: ['p2'],
          active: false,
          no_active_note: 'No active campaigns in either period.',
          period_a: null,
          period_b: null,
          signal: { text: 'Sin campañas activas.', tone: 'neutral' },
          what: 'Ninguna campaña de compras gastó.',
          so_what: 'No hay lectura.',
          now_what: 'Nada que hacer.',
        },
      ],
      recommendations: [
        {
          id: 'card_1',
          recommendation_id: 'rec_1',
          portfolio_id: 'p1',
          what: 'Pausar el conjunto SEDE 2.',
          where: { entity_id: '123', entity_name: 'SEDE 2', level: 'adset' },
          why: {
            text: 'Su costo por lead es {rec_cpa}.',
            figure_ids: ['rec_cpa'],
            source: { tool: 'get_optimizer_pending_recs', window: periodA },
          },
          impact: { level: 'medium', note: 'Libera presupuesto.', basis: 'estimate' },
          priority: 'this_week',
        },
      ],
    },
    ...overrides,
  });

const rules = (block: AnswerTemplatePayload) => validateTemplateBlock(block).map((v) => v.rule);

describe('weekly_report contract', () => {
  it('is registered', () => {
    expect(ANSWER_TEMPLATE_IDS).toContain('weekly_report');
    expect(TEMPLATE_SPECS.weekly_report.id).toBe('weekly_report');
  });

  it('accepts a complete report and rides the answer_template block', () => {
    const block = payload();
    expect(validateTemplateBlock(block)).toEqual([]);
    const parsed = checkpointBlockV2Schema.safeParse({
      block_id: 'b1',
      scope: 'account',
      category: 'answer_template',
      title: 'Reporte semanal',
      ...block,
    });
    expect(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))).toEqual([]);
  });

  it('other templates carry a null body', () => {
    const other = answerTemplatePayloadSchema.parse({
      template_id: 'three_numbers',
      executive: { sentence: 'x' },
      justification: { sections: [{ kind: 'measured', title: 't', text: 'x' }] },
      figures: [figures[0]],
    });
    expect(other.weekly_report).toBeNull();
  });

  it('refuses a report without its body or a thesis figure', () => {
    expect(rules(payload({ weekly_report: null }))).toContain('payload_invalid');
    expect(rules(payload({ executive: { sentence: 'Sin cifra.', hero_chart: null } }))).toContain(
      'payload_invalid',
    );
  });

  it('checks the windows', () => {
    expect(
      weeklyReportWindowProblems({ period_a: periodA, period_b: periodB, prior_a: priorA }),
    ).toEqual([]);
    const tuesday = { since: '2026-09-22', until: '2026-09-28', label: 'x' };
    expect(
      weeklyReportWindowProblems({ period_a: tuesday, period_b: periodB, prior_a: priorA }).length,
    ).toBeGreaterThan(0);
    const crossing = { since: '2026-09-28', until: '2026-10-04', label: 'x' };
    expect(
      weeklyReportWindowProblems({
        period_a: crossing,
        period_b: { since: '2026-10-01', until: '2026-10-04', label: 'x' },
        prior_a: { since: '2026-09-21', until: '2026-09-27', label: 'x' },
      }),
    ).toEqual([]);
  });

  it('refuses a figure shown under a window it was not read over', () => {
    const block = payload();
    const moved = block.figures.map((f) =>
      f.id === 'leads_spend_a' ? { ...f, window: periodB } : f,
    );
    expect(rules({ ...block, figures: moved })).toContain('payload_invalid');
  });

  it('refuses an unresolved ref inside the body', () => {
    const block = payload();
    const body = block.weekly_report!;
    const broken = {
      ...body,
      recommendations: [
        {
          ...body.recommendations[0],
          why: { ...body.recommendations[0].why, figure_ids: ['ghost'] },
        },
      ],
    };
    expect(rules({ ...block, weekly_report: broken })).toContain('unresolved_ref');
  });

  it('refuses a number typed into prose, but not one inside an entity name', () => {
    const block = payload();
    const body = block.weekly_report!;
    const typed = {
      ...body,
      objectives: [{ ...body.objectives[0], so_what: 'Ahorramos 1,200 MXN.' }, body.objectives[1]],
    };
    expect(rules({ ...block, weekly_report: typed })).toContain('prose_number_without_figure');
    expect(rules(block)).not.toContain('prose_number_without_figure');
  });

  it('an inactive objective must say so and carry no rows', () => {
    const block = payload();
    const body = block.weekly_report!;
    const silent = {
      ...body,
      objectives: [body.objectives[0], { ...body.objectives[1], no_active_note: null }],
    };
    expect(rules({ ...block, weekly_report: silent })).toContain('payload_invalid');
  });

  it('a card must state the source its figure was read from', () => {
    const block = payload();
    const body = block.weekly_report!;
    const card = body.recommendations[0];
    const lying = {
      ...body,
      recommendations: [
        { ...card, why: { ...card.why, source: { ...card.why.source, tool: 'get_top_ads' } } },
      ],
    };
    expect(rules({ ...block, weekly_report: lying })).toContain('payload_invalid');
  });

  it('money is in the header currency', () => {
    const block = payload();
    const usd = block.figures.map((f) => (f.id === 'rec_cpa' ? { ...f, currency: 'USD' } : f));
    expect(rules({ ...block, figures: usd })).toContain('currency_inconsistent');
  });
});
