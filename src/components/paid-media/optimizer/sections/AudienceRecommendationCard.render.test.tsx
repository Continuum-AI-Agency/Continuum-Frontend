import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { audienceCardView, portfolioSpecsFrom } from './audienceCardModel';

// The plan's posters are signed Meta URLs that expire; the card recovers them through the
// shared hook. The hook is replaced so a test can see which ad asked and hand back a URL.
const recovered: string[] = [];
let freshUrlById: Record<string, string> = {};
// Stable, like the real hook's useCallback.
const recover = (adId: string) => {
  recovered.push(adId);
};
mock.module('@/hooks/usePaidCreativeRecovery', () => ({
  usePaidCreativeRecovery: () => ({ freshUrlById, recover }),
}));

const { AudienceRecommendationCard } = await import('./AudienceRecommendationCard');

afterEach(() => {
  cleanup();
  recovered.length = 0;
  freshUrlById = {};
});

const rec = {
  id: 'rec-1',
  adset_id: 'as-1',
  kind: 'audience_expand',
  trigger: 'F3_audience_exhausted',
  severity: 'medium',
  reason: 'Reach flat for 14 days with frequency 2.1',
  status: 'pending',
  evidence: {
    metric: 'frequency',
    value: 2.1,
    comparator: '>=',
    threshold: 2,
    window: 'd7',
    estImpactPerDay: null,
    source: 'engine',
  },
  seed: null,
} as never;

const plan = {
  version: 1,
  mode: 'add',
  trigger: 'F3_audience_exhausted',
  diagnosis: 'Frequency 2.1 with CTR falling and 0 purchases in 4 days.',
  rationale: 'The same ads convert in other ad sets; the audience is the problem.',
  previous_spec: {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ['MX'] },
    custom_audiences: [{ id: 'ca-5', name: 'Lookalike 5% · leads de agosto' }],
  },
  previous_spec_hash: 'h',
  options: [
    {
      bucket: 'existing_inventory',
      kind: 'lookalike',
      id: 'ca-13',
      name: 'Lookalike 1–3% · compradores',
      spec: null,
      estimate: null,
      verified: false,
      locale: null,
      blocked_by: null,
      rationale: null,
    },
    {
      bucket: 'net_new_verified',
      kind: 'interest',
      id: '101',
      name: 'Gimnasios',
      spec: null,
      estimate: { lower: 2_000_000, upper: 2_400_000, source: 'catalogue_band' },
      verified: true,
      locale: null,
      blocked_by: null,
      rationale: null,
    },
    {
      bucket: 'net_new_verified',
      kind: 'interest',
      id: '102',
      name: 'Entrenamiento funcional',
      spec: null,
      estimate: null,
      verified: true,
      locale: null,
      blocked_by: null,
      rationale: null,
    },
    {
      bucket: 'net_new_verified',
      kind: 'interest',
      id: '103',
      name: 'Cerveza',
      spec: null,
      estimate: null,
      verified: true,
      locale: null,
      blocked_by: 'Brand DNA: nunca alcohol',
      rationale: null,
    },
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
  advantage_audience: { enabled: true, rationale: 'purchase objective, wide pool' },
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
      creative_row_id: 'r1',
      creative_id: 'cr1',
      source_adset_id: 'as-2',
      source_adset_name: 'ALEIRA // AGOSTO',
      cost_per_event: 41,
      events: 12,
      spend: 492,
      poster_url: null,
      rank: 1,
    },
  ],
  creatives_disclosure: 'Ranked across the enrolled ad sets.',
  source: {
    adset_id: 'as-1',
    adset_name: 'ITESO // AGOSTO // 2 - LKL',
    campaign_id: 'c1',
    campaign_name: 'Tours',
    status: 'ACTIVE',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    promoted_object: null,
    placements: null,
    daily_budget_minor_units: 6200,
    is_cbo: false,
    audience_type: 'prospecting',
  },
  grounded_on: [],
  disclosure: '',
  prompt_version: 'v1',
};

const row = (over: Record<string, unknown>) =>
  ({
    id: '2f1c1c1e-0000-4000-8000-000000000001',
    portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
    brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
    ad_account_id: 'act_1',
    adset_id: 'as-1',
    trigger: 'F3_audience_exhausted',
    recommendation_id: 'rec-1',
    utc_day: '2026-09-28',
    status: 'ready',
    proposal: plan,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
    ...over,
  }) as never;

const executedResult = {
  read_back_at: null,
  campaign: { id: 'c1', name: 'Tours', status: 'ACTIVE' },
  adset: {
    id: 'as-9',
    name: plan.adset_name,
    status: 'PAUSED',
    effective_status: 'PAUSED',
    daily_budget: '6200',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: null,
    targeting: plan.targeting_spec,
    promoted_object: null,
  },
  ads: [
    {
      id: 'ad-9',
      name: 'Tour nocturno · new',
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
    name: 'ITESO // AGOSTO // 2 - LKL',
    prior_status: 'ACTIVE',
    status_after: 'ACTIVE',
    paused: false,
    note: null,
  },
  activation: null,
  advantage_audience_written: true,
  ads_manager_urls: null,
};

const portfolioSpecs = portfolioSpecsFrom(
  [
    { adsetId: 'as-1', spec: plan.previous_spec },
    {
      adsetId: 'as-2',
      spec: { flexible_spec: [{ interests: [{ id: '101', name: 'Gimnasios' }] }] },
    },
  ],
  (adsetId) => (adsetId === 'as-2' ? 'ALEIRA // AGOSTO' : null),
);

const noop = () => undefined;
const baseProps = {
  rec,
  adsetName: 'ITESO // AGOSTO // 2 - LKL',
  snapshot: null,
  portfolioSpecs,
  currency: 'MXN',
  brandId: 'brand-1',
  adAccountId: 'act_1',
  onRequest: noop,
  requesting: false,
  onRetry: noop,
  retrying: false,
  onApprove: noop,
  approving: false,
  onCancel: noop,
  onActivate: noop,
  onUndo: noop,
  busy: false,
  onConvertCbo: noop,
  convertingCbo: false,
  cboPreview: null,
  resultWord: 'purchases',
};

const chipsIn = (testId: string, tone: string) =>
  [
    ...screen
      .getByTestId(testId)
      .querySelectorAll(`[data-testid="audience-chip"][data-tone="${tone}"]`),
  ].map((chip) => chip.textContent);

const failedWith = (error: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  audienceCardView([row({ status: 'failed', error, ...over })], rec);

/** Strings the card used to print in Spanish. None may come back. */
const FORMER_SPANISH = [
  'Qué audiencia',
  'Audiencia actual',
  'Qué cambia',
  'Qué es nuevo',
  'Por qué una audiencia nueva',
  'Cómo se implementa',
  'Crear el conjunto',
  'Pedírsela a Jaina',
  'No se pudo construir',
  'Bloqueada',
  'Descartar',
  'Empezar activo',
  'nadie lo usa hoy',
  'descartado por regla de marca',
  'Alcance agotado',
  'pausado, junto a',
  'Presupuesto',
  'Deshacer',
];

function expectEnglish(container: HTMLElement) {
  const text = container.textContent ?? '';
  for (const former of FORMER_SPANISH) expect(text).not.toContain(former);
  expect(text).not.toMatch(/[áéíóúñ¿¡]/);
}

describe('AudienceRecommendationCard — before → after', () => {
  it('lays the current audience beside the proposed one, with every change coloured in place', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const current = screen.getByTestId('audience-current');
    const proposed = screen.getByTestId('audience-proposed');
    expect(current.textContent).toContain('Current audience');
    expect(proposed.textContent).toContain('Proposed audience');
    for (const label of [
      'Age · gender',
      'Locations',
      'Interests',
      'Custom/saved audiences',
      'Excludes',
      'Advantage+',
    ]) {
      expect(current.textContent).toContain(label);
      expect(proposed.textContent).toContain(label);
    }
    expect(current.textContent).toContain('18–65 · all');
    expect(proposed.textContent).toContain('25–45 · all');
    // The lookalike the proposal drops is red on the current side; what it adds is green.
    expect(chipsIn('audience-current', 'removed')).toEqual(['−Lookalike 5% · leads de agosto']);
    expect(chipsIn('audience-proposed', 'added')).toEqual([
      '+Gimnasios',
      '+Entrenamiento funcionalNEW',
      '+Lookalike 1–3% · compradoresNEW',
    ]);
    expect(proposed.textContent).toContain('Reach 1.1M–1.3M');
    expect(proposed.textContent).toContain('−65%');
    expect(current.textContent).toContain('Reach 3.3M–3.5M');
    expect(screen.queryByTestId('audience-exclusion-warning')).toBeNull();
  });

  it('marks NEW only what no other ad set of the portfolio uses', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const proposed = screen.getByTestId('audience-proposed');
    const newNames = [...proposed.querySelectorAll('[data-testid="audience-chip-new"]')].map(
      (marker) => marker.closest('[data-testid="audience-chip"]')?.textContent,
    );
    expect(newNames).toEqual(['+Entrenamiento funcionalNEW', '+Lookalike 1–3% · compradoresNEW']);
  });

  it('warns when the proposal lifts an exclusion', () => {
    const lifted = {
      ...plan,
      previous_spec: {
        ...plan.previous_spec,
        excluded_custom_audiences: [{ id: 'ca-9', name: 'Lookalike 5% · Inscritos 2025' }],
      },
    };
    render(
      <AudienceRecommendationCard
        {...baseProps}
        view={audienceCardView([row({ proposal: lifted })], rec)}
      />,
    );
    expect(chipsIn('audience-current', 'removed')).toContain('−Lookalike 5% · Inscritos 2025');
    expect(screen.getByTestId('audience-exclusion-warning').textContent).toBe(
      'People in Lookalike 5% · Inscritos 2025 can see these ads again.',
    );
  });

  it('adds the 7-day frequency under the current audience when the snapshot has it', () => {
    render(
      <AudienceRecommendationCard
        {...baseProps}
        snapshot={{ frequency7d: 1.5, audienceType: 'prospecting' } as never}
        view={audienceCardView([row({})], rec)}
      />,
    );
    expect(screen.getByTestId('audience-current').textContent).toContain(
      'Reach 3.3M–3.5M · freq 1.5 / 7 days',
    );
  });
});

describe('AudienceRecommendationCard — the rail', () => {
  it('why: the trigger, the diagnosis, the figure, and the rationale behind Read more', async () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const why = screen.getByTestId('audience-why');
    expect(why.textContent).toContain('Reach exhausted.');
    expect(why.textContent).toContain(plan.diagnosis);
    expect(why.textContent).toContain('2.1');
    expect(why.textContent).not.toContain(plan.rationale);
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    await waitFor(() => expect(why.textContent).toContain(plan.rationale));
  });

  it('new to the portfolio: counts up front, the lists folded away', async () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const tile = screen.getByTestId('audience-new');
    expect(tile.textContent).toContain('2 of 3 new');
    expect(tile.textContent).toContain('Compared with the other ad set of the portfolio.');
    expect(tile.textContent).toContain('1 reused in 1 ad set · 1 filtered by brand rules');
    expect(screen.queryByTestId('audience-novelty-list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /See the list/ }));
    await waitFor(() => expect(screen.getByTestId('audience-novelty-list')).toBeTruthy());
    const list = screen.getByTestId('audience-novelty-list');
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('max-h-40');
    expect(screen.getByTestId('audience-fresh').textContent).toContain('Entrenamiento funcional');
    expect(screen.getByTestId('audience-reused').textContent).toContain(
      'Gimnasios already runs in ALEIRA // AGOSTO',
    );
    expect(screen.getByTestId('audience-excluded').textContent).toContain(
      'filtered by a brand rule: Brand DNA: nunca alcohol',
    );
  });

  it('launch plan: the new ad set paused beside the current one, its campaign and budget', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const how = screen.getByTestId('audience-how').textContent ?? '';
    expect(how).toContain(plan.adset_name);
    expect(how).toContain('Paused, next to "ITESO // AGOSTO // 2 - LKL"; both keep running');
    expect(how).toContain('Tours');
    expect(how).toContain('62.00 MXN/day');
  });

  it('ads: an ad with no poster asks for a fresh one and shows its rank meanwhile', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const ads = screen.getByTestId('audience-ads');
    expect(ads.textContent).toContain('Ads · 1');
    expect(ads.textContent).toContain('41.00 MXN');
    expect(ads.textContent).toContain('12 results');
    expect(screen.getByTestId('audience-ad-placeholder').textContent).toBe('#1');
    expect(recovered).toEqual(['a1']);
  });

  it('ads: an expired poster recovers through the preview endpoint, never showing a broken image', () => {
    const withPoster = {
      ...plan,
      creatives: [{ ...plan.creatives[0], poster_url: 'https://cdn.meta.test/expired.jpg' }],
    };
    const view = audienceCardView([row({ proposal: withPoster })], rec);
    const { container, rerender } = render(
      <AudienceRecommendationCard {...baseProps} view={view} />,
    );
    const img = container.querySelector('[data-testid="audience-ads"] img') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    fireEvent.error(img);
    expect(recovered).toEqual(['a1']);
    expect(screen.getByTestId('audience-ad-placeholder').textContent).toBe('#1');
    freshUrlById = { a1: 'https://cdn.meta.test/fresh.jpg' };
    rerender(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(
      (container.querySelector('[data-testid="audience-ads"] img') as HTMLImageElement).src,
    ).toBe('https://cdn.meta.test/fresh.jpg');
  });
});

describe('AudienceRecommendationCard — the decision', () => {
  it('keeps the create flow: the budget seeded from the plan, the activate switch and the confirm dialog', async () => {
    const { container } = render(
      <AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />,
    );
    expect((container.querySelector('#budget-rec-1') as HTMLInputElement).value).toBe('62');
    expect(container.textContent).toContain('Start active');
    expect(container.textContent).toContain('created paused; you switch it on');
    const create = screen.getByTestId('audience-create') as HTMLButtonElement;
    expect(create.textContent).toBe('Create the new ad set (paused)');
    expect(container.textContent).toContain('Discard');
    fireEvent.click(create);
    await waitFor(() =>
      expect(document.body.textContent).toContain(`Create "${plan.adset_name}" in Meta?`),
    );
    expect(document.body.textContent).toContain('62.00 MXN/day');
    expect(document.body.textContent).toContain('Create the ad set');
  });

  it('with no proposal yet, keeps the frame and offers to ask Jaina now', () => {
    const { container } = render(
      <AudienceRecommendationCard {...baseProps} view={audienceCardView([], rec)} />,
    );
    expect(screen.getByTestId('audience-proposed').textContent).toContain('daily cycle');
    expect(screen.getByTestId('audience-why').textContent).toContain('Reach exhausted');
    expect(screen.getByTestId('audience-why').textContent).toContain(
      'Reach flat for 14 days with frequency 2.1',
    );
    expect(screen.getByTestId('audience-new').textContent).toContain(
      'Known once there is a proposal.',
    );
    expect(screen.queryByTestId('audience-ads')).toBeNull();
    expect(container.textContent).toContain('Ask Jaina now');
    expect(screen.queryByTestId('audience-create')).toBeNull();
    expect(screen.queryByTestId('audience-failure')).toBeNull();
  });

  it('blocked for want of creatives: the reason in the proposed tile, the create button disabled', () => {
    const blocked = row({
      status: 'blocked',
      proposal: null,
      blocked_by: {
        code: 'no_creatives',
        message: 'No delivering creative has enough results to carry into a new ad set yet.',
        campaign_id: 'c1',
        campaign_name: 'Tours',
      },
    });
    const pending = render(
      <AudienceRecommendationCard {...baseProps} view={audienceCardView([blocked], rec)} />,
    );
    expect(pending.getByTestId('audience-proposed').textContent).toContain('Blocked');
    expect(pending.getByTestId('audience-blocked-reason').textContent).toContain(
      'No delivering creative',
    );
    expect(pending.getByTestId('audience-how').textContent).toContain(
      'Nothing is created while the proposal is blocked.',
    );
    const create = pending.getByTestId('audience-create-blocked') as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(create.textContent).toBe('Create the new ad set (paused)');
    expect(pending.container.textContent).toContain('Ask Jaina again');
    cleanup();

    // Superseded by the next cycle: the reason stays, the ask does not (the rec has expired).
    const expiredRec = { ...(rec as object), status: 'expired' } as never;
    const closed = render(
      <AudienceRecommendationCard
        {...baseProps}
        rec={expiredRec}
        view={audienceCardView([{ ...blocked, status: 'superseded' }], expiredRec)}
      />,
    );
    expect((closed.getByTestId('audience-create-blocked') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(closed.container.textContent).toContain('No delivering creative');
    expect(closed.container.textContent).not.toContain('Ask Jaina again');
    expect(closed.container.textContent).toContain('already closed this recommendation');
  });

  it('blocked by a campaign budget: says what is needed and offers the conversion preview', () => {
    const view = audienceCardView(
      [
        row({
          status: 'blocked',
          proposal: null,
          blocked_by: {
            code: 'cbo_campaign',
            message: 'This campaign holds the budget.',
            campaign_id: 'c1',
            campaign_name: 'Tours',
          },
        }),
      ],
      rec,
    );
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(screen.getByTestId('audience-blocked-reason').textContent).toContain('holds the budget');
    expect(container.textContent).toContain('This campaign holds the budget');
    expect(container.textContent).toContain('Preview the conversion');
    expect(screen.queryByTestId('audience-create')).toBeNull();
    expect(screen.queryByTestId('audience-create-blocked')).toBeNull();
  });

  it('executed: the identifiers, the What was implemented dropdown, Activate and Undo', () => {
    const view = audienceCardView([row({ status: 'executed', result: executedResult })], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Created in Meta');
    expect(text).toContain('as-9');
    expect(text).toContain('ad-9');
    expect(text).toContain('What was implemented');
    expect(text).toContain('Activate');
    expect(text).toContain('Undo');
    expect(container.querySelector('a[href*="selected_adset_ids=as-9"]')).not.toBeNull();
  });
});

describe('AudienceRecommendationCard — a failed row always says what failed', () => {
  // MENSAJES // TODOS, 2026-09-29: proposal e2310011 failed in the propose phase and the
  // worker stored the Zod issue list as `error.message`. The block prints the human line
  // and offers to ask again; the dump never reaches the screen.
  it('a propose failure: the block on top, the human reason, nothing created, Ask Jaina again', () => {
    const zodDump =
      '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 240,\n    "path": ["blocked_option_ids", 0, "rule"]\n  }\n]';
    const onRequest = mock(() => {});
    const { container } = render(
      <AudienceRecommendationCard
        {...baseProps}
        onRequest={onRequest}
        view={failedWith(
          { code: 'propose_failed', phase: 'propose', message: zodDump },
          { proposal: null },
        )}
      />,
    );
    const card = screen.getByTestId('audience-recommendation-card');
    expect(card.firstElementChild?.getAttribute('data-testid')).toBe('audience-failure');
    const failure = screen.getByTestId('audience-failure').textContent ?? '';
    expect(failure).toContain("Jaina couldn't build the proposal.");
    expect(failure).toContain('Nothing was created in Meta.');
    expect(container.textContent).not.toContain('too_big');
    expect(container.textContent).not.toContain('blocked_option_ids');
    expect(screen.queryByTestId('audience-retry')).toBeNull();
    expect(screen.queryByTestId('audience-create')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Jaina again' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('failed WITH a plan: the failure is shown, not hidden behind the plan, and offers Retry in Meta', () => {
    const onRetry = mock(() => {});
    render(
      <AudienceRecommendationCard
        {...baseProps}
        onRetry={onRetry}
        view={failedWith({
          code: 'execute_failed',
          phase: 'execute',
          message: 'Meta rejected the ad set: the daily budget is below the minimum.',
        })}
      />,
    );
    const failure = screen.getByTestId('audience-failure').textContent ?? '';
    expect(failure).toContain('Meta refused the new ad set.');
    expect(failure).toContain('Meta rejected the ad set: the daily budget is below the minimum.');
    expect(failure).toContain('Nothing was created in Meta.');
    // The plan still reads beside it.
    expect(screen.getByTestId('audience-proposed').textContent).toContain('Gimnasios');
    expect(screen.queryByTestId('audience-check-connection')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask Jaina again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry in Meta' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("meta_permission: the account sentence, Meta's own words small, and Check Meta connection", () => {
    render(
      <AudienceRecommendationCard
        {...baseProps}
        view={failedWith({
          code: 'meta_permission',
          phase: 'execute',
          message: "Continuum's Meta connection only reads ad account …118; it can't write there.",
          meta_message: 'No tienes permiso para editar esta cuenta publicitaria.',
        })}
      />,
    );
    const failure = screen.getByTestId('audience-failure').textContent ?? '';
    expect(failure).toContain('Meta refused the new ad set.');
    expect(failure).toContain("only reads ad account …118; it can't write there.");
    expect(screen.getByTestId('audience-meta-said').textContent).toBe(
      'Meta said: “No tienes permiso para editar esta cuenta publicitaria.”',
    );
    expect(screen.getByRole('button', { name: 'Retry in Meta' })).toBeTruthy();
    const link = screen.getByTestId('audience-check-connection') as HTMLAnchorElement;
    expect(link.textContent).toBe('Check Meta connection');
    expect(link.getAttribute('href')).toBe('/settings?section=integrations');
  });

  it('a partial create says what is left and that a retry picks up from there', () => {
    render(
      <AudienceRecommendationCard
        {...baseProps}
        view={failedWith({ code: 'execute_failed', phase: 'execute' }, { result: executedResult })}
      />,
    );
    expect(screen.getByTestId('audience-failure').textContent).toContain(
      'A partial result is left in Meta (ad set as-9); retrying picks up from there.',
    );
  });

  it('a throttled re-ask says when Jaina can look again instead of doing nothing', () => {
    const view = failedWith({ code: 'propose_failed', phase: 'propose' }, { proposal: null });
    render(
      <AudienceRecommendationCard
        {...baseProps}
        onRequest={(handlers) => handlers?.onDone?.(view.row?.id ?? '')}
        view={view}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask Jaina again' }));
    expect(screen.getByTestId('audience-action-notice').textContent).toMatch(
      /^Jaina already re-analysed this in the last hour\. Try again after .+\.$/,
    );
  });

  it('a refused retry prints the error inline and the button shows it is working', () => {
    const view = failedWith(
      { code: 'activate_failed', phase: 'activate' },
      { result: executedResult },
    );
    const { rerender } = render(
      <AudienceRecommendationCard
        {...baseProps}
        onRetry={(handlers) => handlers?.onError?.('Could not retry in Meta: permission denied')}
        view={view}
      />,
    );
    expect(screen.getByTestId('audience-failure').textContent).toContain(
      "Couldn't activate the new ad set.",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry in Meta' }));
    expect(screen.getByTestId('audience-action-notice').textContent).toBe(
      'Could not retry in Meta: permission denied',
    );
    rerender(<AudienceRecommendationCard {...baseProps} retrying view={view} />);
    const retry = screen.getByTestId('audience-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(retry.querySelector('.animate-spin')).not.toBeNull();
  });
});

describe('AudienceRecommendationCard — English only', () => {
  it('no face of the card prints the former Spanish copy', () => {
    const faces = [
      audienceCardView([row({})], rec),
      audienceCardView([], rec),
      audienceCardView(
        [
          row({
            status: 'blocked',
            proposal: null,
            blocked_by: {
              code: 'no_creatives',
              message: 'x',
              campaign_id: 'c1',
              campaign_name: 'Tours',
            },
          }),
        ],
        rec,
      ),
      failedWith({ code: 'execute_failed', phase: 'execute', message: '{"x":1}' }),
      failedWith({ code: 'propose_failed' }, { proposal: null }),
      audienceCardView([row({ status: 'executed', result: executedResult })], rec),
    ];
    for (const view of faces) {
      const { container, unmount } = render(
        <AudienceRecommendationCard {...baseProps} view={view} />,
      );
      expectEnglish(container);
      unmount();
    }
  });
});

describe('AudienceRecommendationCard — the optimizer type scale', () => {
  const MICRO = /text-[23]xs/;

  it('an open proposal carries no micro type, labels at the label size, and one-step-up buttons', () => {
    const view = audienceCardView([row({})], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(container.innerHTML).not.toMatch(MICRO);
    for (const heading of container.querySelectorAll('h4')) {
      expect(heading.className).toContain('uppercase');
      expect(heading.className).toContain('text-xs');
    }
    for (const button of container.querySelectorAll('button[data-slot="button"]')) {
      expect(button.className).toContain('h-8');
      expect(button.className).toContain('text-sm');
    }
  });

  it('the no-proposal, blocked, CBO-preview, failed and executed faces carry no micro type either', () => {
    const faces = [
      audienceCardView([], rec),
      audienceCardView(
        [
          row({
            status: 'blocked',
            proposal: null,
            blocked_by: {
              code: 'no_creatives',
              message: 'x',
              campaign_id: 'c1',
              campaign_name: 'Tours',
            },
          }),
        ],
        rec,
      ),
      audienceCardView(
        [
          row({
            status: 'blocked',
            proposal: null,
            blocked_by: {
              code: 'cbo_campaign',
              message: 'This campaign holds the budget.',
              campaign_id: 'c1',
              campaign_name: 'Tours',
            },
          }),
        ],
        rec,
      ),
      failedWith({ code: 'meta_permission', phase: 'execute', meta_message: 'x' }),
      audienceCardView([row({ status: 'executed', result: executedResult })], rec),
    ];
    for (const view of faces) {
      const { container, unmount } = render(
        <AudienceRecommendationCard
          {...baseProps}
          cboPreview={
            {
              ok: true,
              dryRun: true,
              currency: 'MXN',
              adset_budgets: [{ adset_id: 'as-1', adset_name: 'Source', daily_major: 62 }],
            } as never
          }
          view={view}
        />,
      );
      expect(container.innerHTML).not.toMatch(MICRO);
      unmount();
    }
  });
});
