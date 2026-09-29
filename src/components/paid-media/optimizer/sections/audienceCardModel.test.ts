import { describe, expect, it } from 'bun:test';
import {
  audienceCardStateFor,
  audienceCardView,
  audienceDiff,
  audienceNovelty,
  audienceWords,
  carriedRecommendation,
  implementationLines,
  implementedRows,
  isAudienceRecommendation,
  portfolioSpecsFrom,
  proposalFailureReason,
  proposedAudience,
  reachDeltaLabel,
  triggerLabel,
} from './audienceCardModel';

const option = (over: Record<string, unknown>) => ({
  bucket: 'net_new_verified',
  kind: 'interest',
  id: 'x',
  name: 'x',
  spec: null,
  estimate: null,
  verified: true,
  locale: null,
  blocked_by: null,
  rationale: null,
  ...over,
});

// A full proposal as the builder writes it: the current spec (a 5% lookalike of leads, MX,
// 18–65, no interests) and the proposed one (a 1–3% lookalike of buyers, 25–45, two verified
// interests), with the options Jaina chose and one the brand rules crossed out.
const plan = {
  version: 1,
  mode: 'add',
  trigger: 'F3_audience_exhausted',
  diagnosis: 'Frecuencia 2.1 con CTR cayendo y 0 compras en 4 días.',
  rationale: 'Los mismos anuncios convierten en otros conjuntos; el problema es la audiencia.',
  previous_spec: {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ['MX'] },
    custom_audiences: [{ id: 'ca-5', name: 'Lookalike 5% · leads de agosto' }],
  },
  previous_spec_hash: 'h',
  options: [
    option({
      bucket: 'currently_live',
      kind: 'lookalike',
      id: 'ca-5',
      name: 'Lookalike 5% · leads de agosto',
      verified: false,
    }),
    option({
      bucket: 'existing_inventory',
      kind: 'lookalike',
      id: 'ca-13',
      name: 'Lookalike 1–3% · compradores',
      verified: false,
    }),
    option({
      id: '101',
      name: 'Gimnasios',
      estimate: { lower: 2_000_000, upper: 2_400_000, source: 'catalogue_band' },
    }),
    option({ id: '102', name: 'Entrenamiento funcional' }),
    option({ id: '103', name: 'Cerveza', blocked_by: 'Brand DNA: nunca alcohol' }),
  ],
  chosen_option_ids: ['ca-13', '101', '102'],
  targeting_spec: {
    age_min: 25,
    age_max: 45,
    geo_locations: { countries: ['MX'] },
    custom_audiences: [{ id: 'ca-13', name: 'Lookalike 1–3% · compradores' }],
    flexible_spec: [
      {
        interests: [
          { id: '101', name: 'Gimnasios' },
          { id: '102', name: 'Entrenamiento funcional' },
        ],
      },
    ],
    targeting_automation: { advantage_audience: 1 },
  },
  advantage_audience: { enabled: true, rationale: 'objetivo de compras, pool amplio' },
  reach: {
    current: { lower: 3_300_000, upper: 3_500_000, source: 'delivery_estimate' },
    proposed: { lower: 1_100_000, upper: 1_300_000, source: 'delivery_estimate' },
    estimated_at: null,
  },
  budget: {
    suggested_minor_units: 6200,
    currency: 'MXN',
    source: 'source_adset',
    bounds: { min_minor_units: 2000, max_minor_units: 12000 },
    note: null,
  },
  adset_name: 'ITESO // AGOSTO // 2 - LKL · compradores · 2026-09-28',
  creatives: [
    {
      ad_id: 'a1',
      ad_name: 'Tour nocturno',
      creative_row_id: null,
      creative_id: 'cr1',
      source_adset_id: 'as-2',
      source_adset_name: 'ALEIRA // AGOSTO',
      cost_per_event: 41,
      events: 12,
      spend: 492,
      poster_url: null,
      rank: 1,
    },
    {
      ad_id: 'a2',
      ad_name: 'Tour de día',
      creative_row_id: null,
      creative_id: 'cr2',
      source_adset_id: 'as-1',
      source_adset_name: 'ITESO // AGOSTO // 2 - LKL',
      cost_per_event: 55,
      events: 7,
      spend: 385,
      poster_url: null,
      rank: 2,
    },
  ],
  creatives_disclosure: 'Ranking entre los conjuntos inscritos.',
  source: {
    adset_id: 'as-1',
    campaign_id: 'c1',
    adset_name: 'ITESO // AGOSTO // 2 - LKL',
    campaign_name: 'Tours',
    status: 'ACTIVE',
    optimization_goal: null,
    billing_event: null,
    promoted_object: null,
    placements: null,
    daily_budget_minor_units: 6200,
    is_cbo: false,
    audience_type: null,
  },
  grounded_on: [],
  disclosure: '',
  prompt_version: 'v1',
} as never;

const planWith = (over: Record<string, unknown>) => ({ ...(plan as object), ...over }) as never;

describe('audience card model', () => {
  it('recognises the audience recommendation and reads the row into a view', () => {
    expect(
      isAudienceRecommendation({ kind: 'audience_expand', trigger: 'F3_audience_exhausted' }),
    ).toBe(true);
    expect(
      isAudienceRecommendation({ kind: 'creative_refresh', trigger: 'F1_creative_fatigue' }),
    ).toBe(false);
    const row = {
      id: '2f1c1c1e-0000-4000-8000-000000000001',
      portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
      brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
      ad_account_id: 'act_1',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
      recommendation_id: 'rec',
      utc_day: '2026-09-28',
      status: 'ready',
      proposal: plan,
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    } as never;
    const view = audienceCardView([row], {
      id: 'rec',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
    });
    expect(view.state).toBe('ready');
    expect(view.plan?.mode).toBe('add');
    expect(
      audienceCardView([], { id: 'rec', adset_id: 'as-1', trigger: 'F3_audience_exhausted' }).state,
    ).toBe('none');
  });

  it('names the trigger in words', () => {
    expect(triggerLabel('F2_audience_saturation')).toBe('Frecuencia saturada');
    expect(triggerLabel('F3_audience_exhausted')).toBe('Alcance agotado');
    expect(triggerLabel('rule:custom')).toBe('rule:custom');
  });
});

describe('audience card model — a full proposal', () => {
  it('qué audiencia: the proposed spec in words with its estimated reach', () => {
    expect(proposedAudience(plan)).toEqual({
      words:
        'Lookalike 1–3% · compradores · MX · 25–45 · intereses: Gimnasios, Entrenamiento funcional · Advantage+ activo',
      reach: '1.1M–1.3M',
    });
    expect(audienceWords({})).toBeNull();
    expect(audienceWords({ genders: [2], geo_locations: { countries: ['MX', 'CO'] } })).toBe(
      'MX, CO · mujeres',
    );
    expect(reachDeltaLabel(plan)).toBe('3.3M–3.5M → 1.1M–1.3M (-65%)');
  });

  it('audiencia actual / qué cambia: the current facets and only what the proposal changes', () => {
    const diff = audienceDiff(plan);
    expect(diff.hasPrevious).toBe(true);
    expect(diff.current).toEqual([
      { label: 'Audiencias', value: 'Lookalike 5% · leads de agosto' },
      { label: 'Ubicación', value: 'MX' },
      { label: 'Edad', value: '18–65' },
      { label: 'Género', value: 'todos' },
      { label: 'Intereses', value: 'Sin intereses' },
    ]);
    expect(diff.changes).toEqual([
      {
        label: 'Audiencias',
        value:
          'Se suma una audiencia: Lookalike 1–3% · compradores · Se quita Lookalike 5% · leads de agosto',
      },
      { label: 'Edad', value: '25–45 (antes 18–65)' },
      { label: 'Intereses', value: 'Se suman 2 intereses: Gimnasios, Entrenamiento funcional' },
      { label: 'Advantage+', value: 'activo' },
    ]);
  });

  it('qué es nuevo: what no ad set of the portfolio targets, what another one already does, and what the rules crossed out', () => {
    const specs = portfolioSpecsFrom(
      [
        {
          adsetId: 'as-1',
          spec: (plan as { previous_spec: Record<string, unknown> }).previous_spec,
        },
        {
          adsetId: 'as-2',
          spec: { flexible_spec: [{ interests: [{ id: '101', name: 'Gimnasios' }] }] },
        },
        { adsetId: 'as-3', spec: { custom_audiences: [{ id: 'ca-13' }] } },
        { adsetId: 'as-4', spec: { age_min: 'not a number' } },
      ],
      (adsetId) =>
        ({ 'as-2': 'ALEIRA // AGOSTO', 'as-3': 'ITESO // AGOSTO - RTG' })[adsetId] ?? null,
    );
    expect(specs.map((s) => s.adsetId)).toEqual(['as-1', 'as-2', 'as-3']);
    expect(audienceNovelty(plan, specs)).toEqual({
      comparedAdsets: 2,
      fresh: [{ name: 'Entrenamiento funcional', kindLabel: 'interés' }],
      reused: [
        {
          name: 'Lookalike 1–3% · compradores',
          kindLabel: 'lookalike',
          usedIn: ['ITESO // AGOSTO - RTG'],
        },
        { name: 'Gimnasios', kindLabel: 'interés', usedIn: ['ALEIRA // AGOSTO'] },
      ],
      excludedByRule: [{ name: 'Cerveza', rule: 'Brand DNA: nunca alcohol' }],
    });
  });

  it('qué es nuevo with no other spec available compares against this ad set only and says so', () => {
    const novelty = audienceNovelty(plan, []);
    expect(novelty.comparedAdsets).toBe(0);
    expect(novelty.fresh.map((f) => f.name)).toEqual([
      'Lookalike 1–3% · compradores',
      'Gimnasios',
      'Entrenamiento funcional',
    ]);
    expect(novelty.reused).toEqual([]);
  });

  it('cómo se implementa: the paused ad set beside the current one, the budget and the carried ads', () => {
    expect(implementationLines(plan, 'MXN')).toEqual([
      {
        label: 'Conjunto nuevo',
        value:
          '"ITESO // AGOSTO // 2 - LKL · compradores · 2026-09-28", pausado, junto a "ITESO // AGOSTO // 2 - LKL"; los dos siguen corriendo',
      },
      { label: 'Presupuesto', value: '62.00 MXN/día · entre 20.00 MXN y 120 MXN' },
      { label: 'Anuncios', value: '2 con resultados: Tour nocturno, Tour de día' },
      { label: 'Advantage+', value: 'activo · objetivo de compras, pool amplio' },
      { label: 'Campaña', value: 'Tours' },
    ]);
    expect(
      implementationLines(planWith({ mode: 'replace', creatives: [] }), null)
        .map((line) => line.value)
        .slice(0, 3),
    ).toEqual([
      '"ITESO // AGOSTO // 2 - LKL · compradores · 2026-09-28", pausado, junto a "ITESO // AGOSTO // 2 - LKL"; el actual se pausa cuando el nuevo esté activo',
      '62.00 MXN/día · entre 20.00 MXN y 120 MXN',
      'Ninguno con resultados suficientes',
    ]);
  });
});

describe('audience card model — a proposal with no previous_spec', () => {
  const bare = planWith({
    previous_spec: {},
    targeting_spec: {},
    reach: { current: null, proposed: null, estimated_at: null },
  });

  it('reads the proposal from the chosen options and lists it whole instead of a diff', () => {
    expect(proposedAudience(bare)).toEqual({
      words: 'Lookalike 1–3% · compradores · intereses: Gimnasios, Entrenamiento funcional',
      reach: null,
    });
    const diff = audienceDiff(bare);
    expect(diff.hasPrevious).toBe(false);
    expect(diff.current).toEqual([]);
    expect(diff.changes).toEqual([
      { label: 'Audiencias', value: 'Lookalike 1–3% · compradores' },
      { label: 'Intereses', value: 'Gimnasios, Entrenamiento funcional' },
    ]);
    expect(reachDeltaLabel(bare)).toBeNull();
  });

  it('treats every chosen option as new when nothing was recorded to compare against', () => {
    const novelty = audienceNovelty(bare, []);
    expect(novelty.fresh.map((f) => f.name)).toEqual([
      'Lookalike 1–3% · compradores',
      'Gimnasios',
      'Entrenamiento funcional',
    ]);
  });
});

// A blocked proposal the next cycle superseded (Easy Fit → Tours, 2026-09-28: no_creatives,
// proposal null, status superseded). The block is the one fact the row still holds.
describe('audience card model — a blocked proposal', () => {
  const superseded = {
    id: 'p-1',
    brand_id: '33333333-3333-4333-8333-333333333333',
    ad_account_id: 'act_1',
    campaign_id: 'c1',
    adset_id: 'as-1',
    trigger: 'F3_audience_exhausted',
    kind: 'audience_expand',
    recommendation_id: '44444444-4444-4444-8444-444444444444',
    cycle_run_id: '22222222-2222-4222-8222-222222222222',
    utc_day: '2026-09-27',
    status: 'superseded',
    requested_via: 'human',
    requested_by: null,
    attempts: 1,
    proposal: null,
    proposal_built_at: null,
    blocked_by: {
      code: 'no_creatives',
      message: 'No delivering creative has enough results yet.',
      campaign_id: 'c1',
      campaign_name: 'Tours',
    },
    approved_at: null,
    approved_by: null,
    approval: null,
    result: null,
    executed_at: null,
    undo_requested_at: null,
    undo_result: null,
    undone_at: null,
    error: { code: 'signal_stopped', message: 'The trigger did not fire again.' },
    created_at: '2026-09-27T09:20:16Z',
    updated_at: '2026-09-28T00:20:00Z',
  } as never;

  it('is blocked while still blocked, and keeps its blocked face once superseded', () => {
    const view = audienceCardView([{ ...(superseded as object), status: 'blocked' } as never], {
      id: '44444444-4444-4444-8444-444444444444',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
    });
    expect(view.state).toBe('blocked');
    expect(view.plan).toBeNull();
    expect(view.block?.code).toBe('no_creatives');
    expect(view.block?.message).toBe('No delivering creative has enough results yet.');

    expect(audienceCardStateFor(superseded)).toBe('blocked');
    expect(audienceCardStateFor({ ...(superseded as object), proposal: plan } as never)).toBe(
      'none',
    );
    expect(audienceCardStateFor({ ...(superseded as object), blocked_by: null } as never)).toBe(
      'none',
    );
    expect(
      audienceCardView([superseded], {
        id: '44444444-4444-4444-8444-444444444444',
        adset_id: 'as-1',
        trigger: 'F3_audience_exhausted',
      }).state,
    ).toBe('blocked');
  });

  it("rebuilds the expired recommendation it belonged to from the proposal's own fields", () => {
    expect(carriedRecommendation(superseded, 'ITESO // AGOSTO // 2 - LKL')).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      adset_id: 'as-1',
      adset_name: 'ITESO // AGOSTO // 2 - LKL',
      ad_id: null,
      kind: 'audience_expand',
      trigger: 'F3_audience_exhausted',
      severity: null,
      reason: 'No delivering creative has enough results yet.',
      status: 'expired',
      run_id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-09-27T09:20:16Z',
    });
    expect(
      carriedRecommendation({ ...(superseded as object), recommendation_id: null } as never),
    ).toBeNull();
  });

  // The report is a cached read: the recommendation a press just minted is not in it until
  // the next fetch, so a live proposal's recommendation is carried too, with the status its
  // proposal's state implies.
  it('carries a live proposal as a pending recommendation, and a cancelled one as rejected', () => {
    const status = (proposalStatus: string) =>
      carriedRecommendation({ ...(superseded as object), status: proposalStatus } as never)?.status;
    expect(status('queued')).toBe('pending');
    expect(status('proposing')).toBe('pending');
    expect(status('ready')).toBe('pending');
    expect(status('blocked')).toBe('pending');
    expect(status('failed')).toBe('pending');
    expect(status('cancelled')).toBe('rejected');
    expect(status('executed')).toBe('applied');
    expect(status('undone')).toBe('applied');
    expect(status('superseded')).toBe('expired');
  });
});

// MENSAJES // TODOS, 2026-09-29: proposal e2310011 failed in the propose phase and the worker
// stored the Zod issue list as `error.message`. A row is a sentence for a person, never a dump.
describe('audience card model — why a proposal failed, in one line', () => {
  const zodDump =
    '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 240,\n    "message": "Too big: expected string to have <=240 characters"\n  }\n]';

  it('replaces a JSON dump with the sentence the code stands for', () => {
    expect(
      proposalFailureReason({ code: 'propose_failed', phase: 'propose', message: zodDump }),
    ).toBe('Jaina no pudo armar la propuesta.');
    expect(proposalFailureReason({ code: 'execute_failed', message: '{"error":1}' })).toBe(
      'No se pudo crear el conjunto en Meta.',
    );
    expect(proposalFailureReason({ code: 'something_else', message: '' })).toBe(
      'La propuesta no se pudo construir.',
    );
  });

  it('keeps a message written as one short sentence', () => {
    expect(
      proposalFailureReason({
        code: 'propose_failed',
        message: '  Jaina se quedó sin catálogo.  ',
      }),
    ).toBe('Jaina se quedó sin catálogo.');
    expect(
      proposalFailureReason({ code: 'signal_stopped', message: 'The trigger did not fire again.' }),
    ).toBe('The trigger did not fire again.');
  });

  it('treats a multi-line or over-long message as a dump', () => {
    expect(proposalFailureReason({ code: 'propose_failed', message: 'line one\nline two' })).toBe(
      'Jaina no pudo armar la propuesta.',
    );
    expect(proposalFailureReason({ code: 'propose_failed', message: 'x'.repeat(241) })).toBe(
      'Jaina no pudo armar la propuesta.',
    );
  });

  it('reads nothing off a row with no error, and hands the card the human line', () => {
    expect(proposalFailureReason(null)).toBeNull();
    const failed = {
      id: 'p-2',
      brand_id: '33333333-3333-4333-8333-333333333333',
      ad_account_id: 'act_1',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
      kind: 'audience_expand',
      recommendation_id: '44444444-4444-4444-8444-444444444444',
      utc_day: '2026-09-29',
      status: 'failed',
      proposal: null,
      blocked_by: null,
      error: { code: 'propose_failed', phase: 'propose', message: zodDump },
      created_at: '2026-09-29T19:08:58Z',
      updated_at: '2026-09-29T19:09:45Z',
    } as never;
    const view = audienceCardView([failed], {
      id: '44444444-4444-4444-8444-444444444444',
      adset_id: 'as-1',
      trigger: 'F3_audience_exhausted',
    });
    expect(view.state).toBe('failed');
    expect(view.errorMessage).toBe('Jaina no pudo armar la propuesta.');
  });
});

describe('audience card model — what was implemented', () => {
  it('lists the read-back, never the intent', () => {
    const rows = implementedRows(
      {
        read_back_at: null,
        campaign: { id: 'c1', name: 'Tours', status: 'ACTIVE' },
        adset: {
          id: 'as9',
          name: 'New',
          status: 'PAUSED',
          effective_status: 'PAUSED',
          daily_budget: '6200',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          bid_strategy: null,
          targeting: {
            age_min: 25,
            age_max: 45,
            flexible_spec: [{ interests: [{ id: '101', name: 'Gimnasios' }] }],
            targeting_automation: { advantage_audience: 1 },
          },
          promoted_object: null,
        },
        ads: [
          {
            id: 'ad9',
            name: 'Tour nocturno',
            status: 'PAUSED',
            effective_status: 'PAUSED',
            creative_id: 'cr1',
            thumbnail_url: null,
            source_adset_id: 'as-2',
            source_adset_name: 'ALEIRA // AGOSTO',
          },
        ],
        source_adset: {
          id: 'as-1',
          name: 'Source',
          prior_status: 'ACTIVE',
          status_after: 'ACTIVE',
          paused: false,
          note: null,
        },
        activation: null,
        advantage_audience_written: true,
        ads_manager_urls: null,
      },
      plan,
    );
    expect(rows).toEqual([
      { label: 'Campaña', value: 'Tours (c1)' },
      { label: 'Conjunto', value: 'New (as9)' },
      { label: 'Estado', value: 'PAUSED' },
      { label: 'Presupuesto diario', value: '62 (menor 6200)' },
      { label: 'Objetivo', value: 'OFFSITE_CONVERSIONS' },
      { label: 'Evento de cobro', value: 'IMPRESSIONS' },
      { label: 'Segmentación', value: '25–45 · intereses: Gimnasios · Advantage+ activo' },
      { label: 'Intereses', value: 'Gimnasios' },
      { label: 'Advantage+', value: 'activo' },
      {
        label: 'Anuncio',
        value: 'Tour nocturno (ad9) · PAUSED · creativo cr1 · de ALEIRA // AGOSTO',
      },
      { label: 'Conjunto origen', value: 'Source · sigue ACTIVE' },
      { label: 'Modo', value: 'Suma una audiencia nueva' },
    ]);
  });
});
