// Candidates as the Decisions module receives them, with the figures of the live reads of
// 2026-10-31 (scratchpad real-reads.md): Vivo 47's six P8 cards, Easy Fit's suspended Google
// account (G12), Easy Fit's Meta branches, Pink Elephant's client checklist. The P8 headlines
// are the design's Spanish wording of those cards. Each one is parsed through the contract, so a
// candidate the producer could not emit fails at import, not inside an assertion.

import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import {
  ADD_GOOGLE_NEGATIVES,
  RAISE_GOOGLE_BUDGET,
} from '../../../../platformCards/__fixtures__/platformCardActions';

export const GOOGLE_PORTFOLIO_ID = '7a7a7a7a-0000-4000-8000-0000000000e3';

const parse = (candidate: unknown): AccountCandidate => accountCandidateSchema.parse(candidate);

const platformSignal = (
  recommendationId: string,
  over: Record<string, unknown>,
): AccountCandidate =>
  parse({
    id: `platform_signal:${recommendationId}`,
    portfolio_ids: [GOOGLE_PORTFOLIO_ID],
    impact_per_day: 0,
    impact_class: 'deferred',
    impact_basis: '',
    cta: { kind: 'portfolio', target_id: GOOGLE_PORTFOLIO_ID },
    ...over,
  });

/** Vivo 47 · 85% of the 3,857 conversions Google reports are user_engagement visits. */
export const VIVO_INFLATED_CONVERSION = platformSignal('a1a1a1a1-0000-4000-8000-000000000001', {
  detector: 'optimization_event',
  evidence: { rule: 'acct_inflated_primary_conversion', severity: 'high' },
  platform_card: {
    variant: 'google_account_finding',
    idea: 'inflated_primary_conversion',
    headline: 'La mayor parte de lo que Google llama conversión es una visita',
    campaign_name: null,
    currency: 'MXN',
    window_days: 30,
    recommend_only: false,
    facts: [
      { label: 'Costo reportado', value: '$10.96 MXN' },
      { label: 'Costo real por lead', value: '$73.86 MXN' },
    ],
    bars: [
      { label: 'Visitas y atención', value: 3285, share: 0.85, target_share: null, flagged: true },
      { label: 'Leads y ventas', value: 572, share: 0.15, target_share: null, flagged: false },
    ],
    unit: 'count',
    checklist: [
      {
        label: 'Pasa “user_engagement” a secundaria en Google Ads',
        status: null,
        detail: null,
      },
      {
        label: 'Dale dos semanas a la puja para reaprender antes de juzgar su costo',
        status: null,
        detail: null,
      },
    ],
    blocked: null,
  },
});

/** Vivo 47 · EKATAR loses 74% of impressions to budget; the raise waits for the fix. */
export const VIVO_CAPPED_BUDGET = platformSignal('a1a1a1a1-0000-4000-8000-000000000006', {
  detector: 'scale_readiness',
  evidence: { rule: 'acct_capped_budget_locked', severity: 'medium' },
  platform_card: {
    variant: 'google_account_finding',
    idea: 'capped_budget_locked',
    headline:
      '74% de las impresiones se pierden por presupuesto: subir solo después de corregir la conversión',
    campaign_name: 'VIVO 47-EKATAR',
    currency: 'MXN',
    window_days: 30,
    recommend_only: false,
    facts: [{ label: 'Presupuesto', value: '$1,179 MXN al día' }],
    bars: [
      { label: 'Se mostró', value: 0.26, share: 0.26, target_share: null, flagged: false },
      {
        label: 'Perdido por presupuesto',
        value: 0.74,
        share: 0.74,
        target_share: null,
        flagged: true,
      },
    ],
    unit: 'share',
    checklist: [],
    blocked: 'La subida espera la corrección de la conversión.',
  },
});

/** Vivo 47 · 54% of the search-term spend buys people who already searched for the brand. */
export const VIVO_BRAND_TERMS = platformSignal('a1a1a1a1-0000-4000-8000-000000000003', {
  detector: 'funnel_coverage',
  evidence: { rule: 'acct_brand_vs_nonbrand', severity: 'medium' },
  platform_card: {
    variant: 'google_account_finding',
    idea: 'brand_vs_nonbrand',
    headline: 'El 54% del gasto compra gente que ya te buscaba',
    campaign_name: null,
    currency: 'MXN',
    window_days: 30,
    recommend_only: false,
    facts: [{ label: 'Marca', value: '$13,353 MXN a $8.95 por conversión' }],
    bars: [
      { label: 'Marca', value: 13352.96, share: 0.54, target_share: null, flagged: true },
      { label: 'No marca', value: 11365.53, share: 0.46, target_share: null, flagged: false },
    ],
    unit: 'money',
    checklist: [
      { label: 'Mover los términos de marca a su propia campaña', status: null, detail: null },
    ],
    blocked: null,
  },
});

/** Easy Fit Google · every campaign dark for 5 days: billing, one cause for the account. */
export const EASYFIT_SUSPENDED = platformSignal('b2b2b2b2-0000-4000-8000-000000000012', {
  detector: 'delivery_collapse',
  evidence: { rule: 'G12', severity: 'high' },
  impact_basis:
    'This account has 2 campaigns that should be serving, with 670.00 MXN/day of budget, and none showed an ad in the last 5 days. Google says: SERVING_STATUS_SUSPENDED, BUDGET_CONSTRAINED. One cause for the w',
  platform_card: {
    variant: 'google_delivery_issue',
    campaign_name: 'Search | Octubre | Easy Fit',
    reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
    dark_days: 5,
    currency: 'MXN',
    budget_per_day: 670,
    disapproved_ads: 0,
    account_wide: true,
  },
});

/** Vivo 47 · G03 with the engine's write: EKATAR 1,179 → 1,473.75 MXN/day. */
export const VIVO_BUDGET_WRITE = platformSignal('099715be-19c7-4c04-9cac-1e416391498a', {
  detector: 'scale_readiness',
  evidence: { rule: 'G03', severity: 'medium' },
  impact_basis:
    'VIVO 47-EKATAR loses 28% of impressions to budget with results at 772.98 MXN, 14% under target. Raise to 1473.75 MXN/day.',
  platform_card: {
    variant: 'google_budget_limited',
    campaign_name: 'VIVO 47-EKATAR',
    budget_lost_impression_share: 0.2802764224591953,
    days_limited: null,
    currency: 'MXN',
    cost_per_result: 772.9756571888496,
    result_label: 'leads',
    budget_per_day: 1179,
    proposed_budget_per_day: 1473.75,
    projection: null,
  },
  card_action: {
    recommendation_id: '099715be-19c7-4c04-9cac-1e416391498a',
    portfolio_id: GOOGLE_PORTFOLIO_ID,
    action: RAISE_GOOGLE_BUDGET,
    apply_enabled: true,
  },
});

/** Vivo 47 · G05: two search terms over the target with no conversion, with the write. */
export const VIVO_NEGATIVES_WRITE = platformSignal('655b7c7e-0027-4036-8f21-970ef088a470', {
  detector: 'dead_tail',
  evidence: { rule: 'G05', severity: 'medium' },
  impact_per_day: 72.4,
  impact_class: 'recoverable',
  impact_basis:
    '2 search terms in VIVO 47-EKATAR each cost more than the 900.00 MXN target in 30 days with no conversions, 2171.87 MXN together. Add them as exact negatives.',
  platform_card: {
    variant: 'google_negative_terms',
    campaign_name: 'VIVO 47-EKATAR',
    currency: 'MXN',
    window_days: 30,
    terms: [
      { term: 'vivo 47 la estancia', spend: 965.53, clicks: 38, conversions: 0 },
      { term: 'vivo 47 center', spend: 1206.34, clicks: 36, conversions: 0 },
    ],
    savings_per_day: 72.4,
    match_type: 'EXACT',
  },
  card_action: {
    recommendation_id: '655b7c7e-0027-4036-8f21-970ef088a470',
    portfolio_id: GOOGLE_PORTFOLIO_ID,
    action: ADD_GOOGLE_NEGATIVES,
    apply_enabled: true,
  },
});

/** Pink Elephant · the client applied 2 of the 3 agreed changes (change history, 15 Oct). */
export const PINK_CHECKLIST = platformSignal('c3c3c3c3-0000-4000-8000-000000000011', {
  detector: 'structure_consolidation',
  evidence: { rule: 'acct_client_executes_checklist', severity: 'medium' },
  platform_card: {
    variant: 'google_account_finding',
    idea: 'client_executes_checklist',
    headline: 'Checklist del cliente: 2 de 3 aplicados',
    campaign_name: null,
    currency: 'MXN',
    window_days: 30,
    recommend_only: true,
    facts: [{ label: 'Pendiente', value: '1 desde el 9 oct' }],
    checklist: [
      { label: 'Pausar el grupo Gestión de Proyectos', status: 'done', detail: '15 oct' },
      { label: 'Quitar Display de la campaña de Búsqueda', status: 'done', detail: '15 oct' },
      {
        label: 'Cambiar de Maximizar clics a Maximizar conversiones',
        status: 'pending',
        detail: 'pendiente desde el 9 oct',
      },
    ],
    blocked: null,
  },
});

/** Pink Elephant · 65 terms with no intent to buy, $805 MXN, as negative lists by theme. */
export const PINK_INTENT_NEGATIVES = platformSignal('c3c3c3c3-0000-4000-8000-000000000013', {
  detector: 'dead_tail',
  evidence: { rule: 'acct_intent_negatives', severity: 'medium' },
  platform_card: {
    variant: 'google_account_finding',
    idea: 'intent_negatives',
    headline: 'Búsquedas con la intención equivocada: listas de negativos por tema',
    campaign_name: null,
    currency: 'MXN',
    window_days: 30,
    recommend_only: true,
    facts: [{ label: 'Gasto sin intención', value: '$805 MXN' }],
    bars: [
      { label: 'Gratis y descargas', value: 354, share: 0.44, target_share: null, flagged: true },
      { label: 'Estudiantes y tareas', value: 239, share: 0.3, target_share: null, flagged: true },
    ],
    unit: 'money',
    checklist: [],
    negatives: [
      { theme: 'Gratis y descargas', terms: ['curso iso 27001 gratis', 'iso 27001 pdf'] },
      { theme: 'Estudiantes y tareas', terms: ['iso 27001 tarea'] },
    ],
    blocked: null,
  },
});

export const META_PORTFOLIO_ID = '0fd6f383-0000-4000-8000-000000000001';

/** Easy Fit Meta · ITESO at $557.41 a tour, ALEIRA at $330.71: move $150/day. */
export const EASYFIT_BRANCH_MOVE = parse({
  id: 'portfolio_reallocation:iteso>aleira',
  detector: 'portfolio_reallocation',
  portfolio_ids: [META_PORTFOLIO_ID],
  impact_per_day: 61.01,
  impact_class: 'better_price',
  impact_basis: '150/day moved from ITESO at 557.41 to ALEIRA at 330.71, which is 41% cheaper',
  result_label: 'tours',
  headline: {
    kind: 'efficiency',
    value: 41,
    unit: 'percent',
    label: 'cheaper per result',
    from: 557.41,
    to: 330.71,
  },
  chart: {
    shape: 'transfer',
    unit: 'currency',
    from: { label: 'ITESO', cost_per_result: 557.41, spend_per_day: 520.25 },
    to: { label: 'ALEIRA', cost_per_result: 330.71, spend_per_day: 584.25 },
    movable_per_day: 150,
    saving_per_day: 61.01,
  },
  state: 'autopilot',
  cta: { kind: 'portfolio', target_id: META_PORTFOLIO_ID },
});

/** Easy Fit Meta · the read's auction finding, as the live read stamped it. */
export const EASYFIT_AUCTION = parse({
  id: 'auction_pressure:act_521903353286118',
  detector: 'auction_pressure',
  portfolio_ids: [],
  impact_per_day: 233,
  impact_class: 'deferred',
  impact_basis:
    'cost per thousand up 23% while the click rate held, so the auction moved and the ads did not',
  result_label: 'conversations',
  title: {
    entity: 'Cuenta',
    figure: 23,
    unit: '% más por cada mil impresiones',
    comparator: '38.66 MXN de CPM antes frente a 47.71 MXN ahora',
    window: 'd7',
  },
  headline: {
    kind: 'drift',
    value: 23,
    unit: 'percent',
    label: 'more per thousand shown',
    from: 38.66,
    to: 47.71,
  },
  state: 'recommend',
  confidence: 0.335,
});

/** A Meta guard, shaped like the producer's: the counted conversions cannot be trusted. */
export const META_MEASUREMENT_GUARD = parse({
  id: 'measurement_integrity:act_521903353286118',
  detector: 'measurement_integrity',
  portfolio_ids: [],
  impact_per_day: 0,
  impact_class: 'deferred',
  impact_basis: 'the conversions Meta reports and the events the read counts disagree',
});
