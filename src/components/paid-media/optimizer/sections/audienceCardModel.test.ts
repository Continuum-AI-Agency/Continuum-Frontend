import { describe, expect, it } from 'bun:test';
import {
  AUDIENCE_PROPOSAL_STATE_LABEL,
  audienceCardStateFor,
  audienceCardView,
  audienceComparison,
  audienceNovelty,
  audienceWords,
  carriedRecommendation,
  implementationLines,
  implementedRows,
  isAudienceRecommendation,
  noveltySummary,
  portfolioSpecsFrom,
  proposalFailure,
  proposalFailureReason,
  proposedAudience,
  reachChange,
  reaskThrottledNote,
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
    expect(triggerLabel('F2_audience_saturation')).toBe('Frequency saturated');
    expect(triggerLabel('F3_audience_exhausted')).toBe('Reach exhausted');
    expect(triggerLabel('rule:custom')).toBe('rule:custom');
  });
});

describe('audience card model — a full proposal', () => {
  it('the proposed spec in words with its estimated reach', () => {
    expect(proposedAudience(plan)).toEqual({
      words:
        'Lookalike 1–3% · compradores · MX · 25–45 · interests: Gimnasios, Entrenamiento funcional · Advantage+ on',
      reach: '1.1M–1.3M',
    });
    expect(audienceWords({})).toBeNull();
    expect(audienceWords({ genders: [2], geo_locations: { countries: ['MX', 'CO'] } })).toBe(
      'MX, CO · women',
    );
    expect(reachChange(plan)).toEqual({ label: '−65%', up: false });
    expect(
      reachChange(
        planWith({
          reach: {
            current: { lower: 516_000, upper: 607_000, source: 'delivery_estimate' },
            proposed: { lower: 569_000, upper: 669_000, source: 'delivery_estimate' },
            estimated_at: null,
          },
        }),
      ),
    ).toEqual({ label: '+10%', up: true });
  });

  it('a radius around a place reads as the place, never as "Anywhere"', () => {
    // Easy Fit's ALEIRA ad sets target 4 km around the gym (geo_locations.places), which the
    // shared summary skips — the card said "Anywhere" on 2026-09-29.
    const aroundTheGym = {
      places: [{ key: '420172691413376', name: 'Vivo 47 Easy Fit Plaza Aleira', radius: 4, distance_unit: 'kilometer' }],
      location_types: ['home', 'recent'],
    };
    const comparison = audienceComparison(
      planWith({
        previous_spec: { ...plan.previous_spec, geo_locations: aroundTheGym },
        targeting_spec: { ...plan.targeting_spec, geo_locations: aroundTheGym },
      }),
      null,
    );
    const geoRow = comparison.rows.find((row) => row.label === 'Locations');
    const around = { kind: 'text', text: '4 km around Vivo 47 Easy Fit Plaza Aleira' };
    expect(geoRow?.current).toEqual(around);
    expect(geoRow?.proposed).toEqual(around);
  });

  it('before → after: one row per facet, list facets as added / removed / kept chips', () => {
    const novelty = audienceNovelty(plan, []);
    const comparison = audienceComparison(plan, novelty);
    expect(comparison.hasPrevious).toBe(true);
    expect(comparison.rows.map((row) => row.label)).toEqual([
      'Age · gender',
      'Locations',
      'Interests',
      'Custom/saved audiences',
      'Excludes',
      'Advantage+',
    ]);
    const [ageRow, geoRow, interestRow, seedRow, excludeRow, advantageRow] = comparison.rows;
    expect(ageRow?.current).toEqual({ kind: 'text', text: '18–65 · all' });
    expect(ageRow?.proposed).toEqual({ kind: 'text', text: '25–45 · all' });
    expect(geoRow?.proposed).toEqual({ kind: 'text', text: 'MX' });
    expect(interestRow?.current).toEqual({ kind: 'chips', chips: [], empty: 'None' });
    expect(interestRow?.proposed).toEqual({
      kind: 'chips',
      empty: 'None',
      chips: [
        { name: 'Gimnasios', tone: 'added', isNew: true },
        { name: 'Entrenamiento funcional', tone: 'added', isNew: true },
      ],
    });
    expect(seedRow?.current).toEqual({
      kind: 'chips',
      empty: 'None',
      chips: [{ name: 'Lookalike 5% · leads de agosto', tone: 'removed', isNew: false }],
    });
    expect(seedRow?.proposed).toEqual({
      kind: 'chips',
      empty: 'None',
      chips: [{ name: 'Lookalike 1–3% · compradores', tone: 'added', isNew: true }],
    });
    expect(excludeRow?.proposed).toEqual({ kind: 'chips', chips: [], empty: 'Nothing' });
    expect(advantageRow).toEqual({
      label: 'Advantage+',
      current: { kind: 'text', text: 'Not set' },
      proposed: { kind: 'text', text: 'On' },
    });
    expect(comparison.currentReach).toBe('Reach 3.3M–3.5M');
    expect(comparison.proposedReach).toBe('Reach 1.1M–1.3M');
    expect(comparison.exclusionWarning).toBeNull();
  });

  it('before → after: a chip another ad set already uses is added but not NEW', () => {
    const specs = portfolioSpecsFrom(
      [
        {
          adsetId: 'as-2',
          spec: { flexible_spec: [{ interests: [{ id: '101', name: 'Gimnasios' }] }] },
        },
      ],
      () => 'ALEIRA // AGOSTO',
    );
    const interests = audienceComparison(plan, audienceNovelty(plan, specs)).rows[2]?.proposed;
    expect(interests).toEqual({
      kind: 'chips',
      empty: 'None',
      chips: [
        { name: 'Gimnasios', tone: 'added', isNew: false },
        { name: 'Entrenamiento funcional', tone: 'added', isNew: true },
      ],
    });
  });

  it('before → after: a lifted exclusion is a removed chip and a warning', () => {
    const lifted = planWith({
      previous_spec: {
        age_min: 20,
        age_max: 65,
        excluded_custom_audiences: [{ id: 'ca-9', name: 'Lookalike 5% · Inscritos 2025' }],
      },
      targeting_spec: { age_min: 20, age_max: 65 },
    });
    const comparison = audienceComparison(lifted);
    expect(comparison.rows[4]?.current).toEqual({
      kind: 'chips',
      empty: 'Nothing',
      chips: [{ name: 'Lookalike 5% · Inscritos 2025', tone: 'removed', isNew: false }],
    });
    expect(comparison.exclusionWarning).toBe(
      'People in Lookalike 5% · Inscritos 2025 can see these ads again.',
    );
  });

  it('new to the portfolio: what no ad set of the portfolio targets, what another one already does, and what the rules crossed out', () => {
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
    const novelty = audienceNovelty(plan, specs);
    expect(novelty).toEqual({
      comparedAdsets: 2,
      fresh: [{ name: 'Entrenamiento funcional', kindLabel: 'interest' }],
      reused: [
        {
          name: 'Lookalike 1–3% · compradores',
          kindLabel: 'lookalike',
          usedIn: ['ITESO // AGOSTO - RTG'],
        },
        { name: 'Gimnasios', kindLabel: 'interest', usedIn: ['ALEIRA // AGOSTO'] },
      ],
      excludedByRule: [{ name: 'Cerveza', rule: 'Brand DNA: nunca alcohol' }],
    });
    expect(noveltySummary(novelty)).toEqual({
      headline: '1 of 3 new',
      basis: 'Compared with the other 2 ad sets of the portfolio.',
      counts: '2 reused in 2 ad sets · 1 filtered by brand rules',
    });
  });

  it('new to the portfolio with no other spec available compares against this ad set only and says so', () => {
    const novelty = audienceNovelty(plan, []);
    expect(novelty.comparedAdsets).toBe(0);
    expect(novelty.fresh.map((f) => f.name)).toEqual([
      'Lookalike 1–3% · compradores',
      'Gimnasios',
      'Entrenamiento funcional',
    ]);
    expect(novelty.reused).toEqual([]);
    expect(noveltySummary(novelty).basis).toContain('Compared with this ad set only');
  });

  it('launch plan: the new ad set, paused beside the current one, its campaign and budget', () => {
    expect(implementationLines(plan, 'MXN')).toEqual([
      { label: 'New ad set', value: 'ITESO // AGOSTO // 2 - LKL · compradores · 2026-09-28' },
      { label: 'Starts', value: 'Paused, next to "ITESO // AGOSTO // 2 - LKL"; both keep running' },
      { label: 'Campaign', value: 'Tours' },
      { label: 'Budget', value: '62.00 MXN/day · between 20.00 MXN and 120 MXN' },
    ]);
    expect(implementationLines(planWith({ mode: 'replace' }), null)[1]?.value).toBe(
      'Paused, next to "ITESO // AGOSTO // 2 - LKL"; the current one pauses once the new one is live',
    );
  });
});

describe('audience card model — a proposal with no previous_spec', () => {
  const bare = planWith({
    previous_spec: {},
    targeting_spec: {},
    reach: { current: null, proposed: null, estimated_at: null },
  });

  it('reads the proposal from the chosen options and marks the current side as not recorded', () => {
    expect(proposedAudience(bare)).toEqual({
      words: 'Lookalike 1–3% · compradores · interests: Gimnasios, Entrenamiento funcional',
      reach: null,
    });
    const comparison = audienceComparison(bare);
    expect(comparison.hasPrevious).toBe(false);
    for (const row of comparison.rows) {
      expect(row.current).toEqual({ kind: 'text', text: 'Not recorded' });
    }
    expect(comparison.rows[3]?.proposed).toEqual({
      kind: 'chips',
      empty: 'None',
      chips: [{ name: 'Lookalike 1–3% · compradores', tone: 'added', isNew: false }],
    });
    expect(reachChange(bare)).toBeNull();
    expect(comparison.currentReach).toBeNull();
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
const PROPOSE_COPY = 'Jaina ran into an error while reading the audience, catalogue and creatives.';

describe('audience card model — why a proposal failed, in one line', () => {
  const zodDump =
    '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 240,\n    "message": "Too big: expected string to have <=240 characters"\n  }\n]';

  it('replaces a JSON dump with the sentence the code stands for', () => {
    expect(
      proposalFailureReason({ code: 'propose_failed', phase: 'propose', message: zodDump }),
    ).toBe('Jaina ran into an error while reading the audience, catalogue and creatives.');
    expect(proposalFailureReason({ code: 'execute_failed', message: '{"error":1}' })).toBe(
      'Meta returned an error while the new ad set was being created.',
    );
    expect(proposalFailureReason({ code: 'something_else', message: '' })).toBe(
      'The proposal could not be built.',
    );
  });

  it('keeps a message written as one short sentence', () => {
    expect(
      proposalFailureReason({
        code: 'propose_failed',
        message: '  Jaina ran out of catalogue.  ',
      }),
    ).toBe('Jaina ran out of catalogue.');
    expect(
      proposalFailureReason({ code: 'signal_stopped', message: 'The trigger did not fire again.' }),
    ).toBe('The trigger did not fire again.');
  });

  it('treats a multi-line or over-long message as a dump', () => {
    expect(proposalFailureReason({ code: 'propose_failed', message: 'line one\nline two' })).toBe(
      PROPOSE_COPY,
    );
    expect(proposalFailureReason({ code: 'propose_failed', message: 'x'.repeat(241) })).toBe(
      PROPOSE_COPY,
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
    expect(view.errorMessage).toBe(PROPOSE_COPY);
    expect(view.failure?.headline).toBe("Jaina couldn't build the proposal.");
    expect(view.failure?.action).toBe('reask');
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
      { label: 'Campaign', value: 'Tours (c1)' },
      { label: 'Ad set', value: 'New (as9)' },
      { label: 'Status', value: 'PAUSED' },
      { label: 'Daily budget', value: '62 (minor units 6200)' },
      { label: 'Optimization goal', value: 'OFFSITE_CONVERSIONS' },
      { label: 'Billing event', value: 'IMPRESSIONS' },
      { label: 'Targeting', value: '25–45 · interests: Gimnasios · Advantage+ on' },
      { label: 'Interests', value: 'Gimnasios' },
      { label: 'Advantage+', value: 'on' },
      {
        label: 'Ad',
        value: 'Tour nocturno (ad9) · PAUSED · creative cr1 · from ALEIRA // AGOSTO',
      },
      { label: 'Source ad set', value: 'Source · still ACTIVE' },
      { label: 'Mode', value: 'Adds a new audience' },
    ]);
  });
});

describe('audience card model — a failed row: what failed and the button that fixes it', () => {
  const failedRow = (error: Record<string, unknown> | null) =>
    ({ status: 'failed', error }) as never;
  const partial = { adset: { id: 'as-9' } } as never;

  it('a Meta write that failed on a sound plan is a retry in Meta', () => {
    const failure = proposalFailure(
      failedRow({ code: 'execute_failed', phase: 'execute', message: '{"error":1}' }),
      plan,
      null,
    );
    expect(failure).toEqual({
      phase: 'execute',
      headline: 'Meta refused the new ad set.',
      reason: 'Meta returned an error while the new ad set was being created.',
      metaSaid: null,
      outcome: 'Nothing was created in Meta.',
      action: 'retry',
      checkConnection: false,
    });
  });

  it('a stored "Meta rejected … HTTP n: <Meta text>" never becomes the reason; Meta text moves to metaSaid', () => {
    // The shape rows carried before the Backend classified Meta refusals — 1e89d5e7 on
    // 2026-09-29 read this way, in the connected user's Meta language.
    const message =
      'Meta rejected ad set creation with HTTP 400: No tienes permiso de escritura en la cuenta publicitaria';
    const failure = proposalFailure(
      failedRow({ code: 'execute_failed', phase: 'execute', message }),
      plan,
      null,
    );
    expect(failure?.reason).toBe('Meta returned an error while the new ad set was being created.');
    expect(failure?.metaSaid).toBe('No tienes permiso de escritura en la cuenta publicitaria');
    expect(failure?.action).toBe('retry');
    expect(proposalFailureReason({ code: 'execute_failed', message })).toBe(
      'Meta returned an error while the new ad set was being created.',
    );
  });

  it('meta_permission names the account, quotes Meta, and points at the connection', () => {
    const failure = proposalFailure(
      failedRow({
        code: 'meta_permission',
        phase: 'execute',
        message: "Continuum's Meta connection can read ad account …118 but cannot write to it.",
        meta_message: 'No tienes permiso para realizar esta acción.',
      }),
      plan,
      null,
    );
    expect(failure?.headline).toBe('Meta refused the new ad set.');
    expect(failure?.reason).toBe(
      "Continuum's Meta connection can read ad account …118 but cannot write to it.",
    );
    expect(failure?.metaSaid).toBe('No tienes permiso para realizar esta acción.');
    expect(failure?.action).toBe('retry');
    expect(failure?.checkConnection).toBe(true);
  });

  it('activate and undo failures say what stays in Meta; a partial create says a retry picks up', () => {
    expect(
      proposalFailure(failedRow({ code: 'activate_failed', phase: 'activate' }), plan, partial),
    ).toMatchObject({
      headline: "Couldn't activate the new ad set.",
      outcome: 'The new ad set (as-9) is still in Meta, unchanged.',
      action: 'retry',
    });
    expect(proposalFailure(failedRow({ code: 'undo_failed' }), plan, partial)?.headline).toBe(
      "Couldn't undo the new ad set.",
    );
    expect(proposalFailure(failedRow({ code: 'execute_failed' }), plan, partial)?.outcome).toBe(
      'A partial result is left in Meta (ad set as-9); retrying picks up from there.',
    );
  });

  it('a propose failure, no plan, or a plan the world moved under is a fresh ask to Jaina', () => {
    expect(
      proposalFailure(failedRow({ code: 'propose_failed', phase: 'propose' }), null, null),
    ).toMatchObject({ headline: "Jaina couldn't build the proposal.", action: 'reask' });
    expect(proposalFailure(failedRow({ code: 'execute_failed' }), null, null)?.action).toBe(
      'reask',
    );
    expect(
      proposalFailure(failedRow({ code: 'targeting_changed', phase: 'execute' }), plan, null)
        ?.action,
    ).toBe('reask');
    expect(proposalFailure(failedRow(null), null, null)?.action).toBe('reask');
  });

  it('reads nothing off a row that is not failed', () => {
    expect(proposalFailure({ status: 'ready', error: null } as never, plan, null)).toBeNull();
    expect(proposalFailure(null, plan, null)).toBeNull();
  });
});

describe('audience card model — a re-ask the RPC throttled', () => {
  const row = {
    id: 'p-1',
    status: 'failed',
    created_at: '2026-09-29T19:08:00Z',
  } as never;
  const iso = (at: Date) => at.toISOString().slice(11, 16);

  it('says when to try again when the RPC handed back the same failed/blocked/ready row', () => {
    expect(reaskThrottledNote('p-1', row, iso)).toBe(
      'Jaina already re-analysed this in the last hour. Try again after 20:08.',
    );
    expect(
      reaskThrottledNote('p-1', { ...(row as object), status: 'blocked' } as never, iso),
    ).not.toBeNull();
  });

  it('says nothing when the press opened a new proposal or the row is still moving', () => {
    expect(reaskThrottledNote('p-2', row, iso)).toBeNull();
    expect(
      reaskThrottledNote('p-1', { ...(row as object), status: 'queued' } as never, iso),
    ).toBeNull();
    expect(reaskThrottledNote('p-1', null, iso)).toBeNull();
  });
});

describe('audience card model — every label is English', () => {
  it('the state labels', () => {
    expect(AUDIENCE_PROPOSAL_STATE_LABEL).toMatchObject({
      queued: 'Queued',
      proposing: 'Jaina is reading',
      ready: 'Ready',
      blocked: 'Blocked',
      failed: 'Failed',
      executed: 'Created in Meta',
      undone: 'Undone',
    });
    for (const label of Object.values(AUDIENCE_PROPOSAL_STATE_LABEL)) {
      expect(label).not.toMatch(/[áéíóúñ¿¡]|conjunto|propuesta|Jaina está/);
    }
  });
});
