import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AudienceRecommendationCard } from './AudienceRecommendationCard';
import { audienceCardView, portfolioSpecsFrom } from './audienceCardModel';

afterEach(cleanup);

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
  creatives_disclosure: 'Ranking entre los conjuntos inscritos.',
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
      name: 'Tour nocturno · nuevo',
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
  adAccountId: 'act_1',
  onRequest: noop,
  requesting: false,
  onApprove: noop,
  approving: false,
  onCancel: noop,
  onActivate: noop,
  onUndo: noop,
  busy: false,
  onConvertCbo: noop,
  convertingCbo: false,
  cboPreview: null,
  resultWord: 'compras',
};

const SECTION_LABELS = [
  'Qué audiencia',
  'Audiencia actual',
  'Qué cambia',
  'Qué es nuevo',
  'Por qué una audiencia nueva',
  'Cómo se implementa',
];

/** The five labels, in document order, followed by the decision. */
function frameOrder(container: HTMLElement): string[] {
  return [...container.querySelectorAll('section')].map(
    (section) =>
      section.querySelector('h4')?.textContent ?? section.getAttribute('data-testid') ?? '',
  );
}

describe('AudienceRecommendationCard — an open proposal', () => {
  it('shows the five sections in order and then the create button', () => {
    const view = audienceCardView([row({})], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(frameOrder(container)).toEqual([...SECTION_LABELS, 'audience-decision']);
    const create = screen.getByTestId('audience-create') as HTMLButtonElement;
    expect(create.disabled).toBe(false);
    expect(create.textContent).toBe('Crear el conjunto nuevo (pausado)');
    expect(container.textContent).toContain('Descartar');
  });

  it('qué audiencia: the proposed targeting in words with the estimated reach', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const text = screen.getByTestId('audience-what').textContent ?? '';
    expect(text).toContain(
      'Lookalike 1–3% · compradores · MX · 25–45 · intereses: Gimnasios, Entrenamiento funcional',
    );
    expect(text).toContain('Alcance estimado 1.1M–1.3M');
    expect(text).toContain('3.3M–3.5M → 1.1M–1.3M');
  });

  it('audiencia actual / qué cambia: two columns from previous_spec against the proposal', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const current = screen.getByTestId('audience-current').textContent ?? '';
    expect(current).toContain('Lookalike 5% · leads de agosto');
    expect(current).toContain('18–65');
    expect(current).toContain('Sin intereses');
    expect(current).toContain('Alcance 3.3M–3.5M');
    const changes = screen.getByTestId('audience-changes').textContent ?? '';
    expect(changes).toContain('Se suma una audiencia: Lookalike 1–3% · compradores');
    expect(changes).toContain('25–45 (antes 18–65)');
    expect(changes).toContain('Se suman 2 intereses: Gimnasios, Entrenamiento funcional');
    expect(changes).toContain('Advantage+');
  });

  it('qué es nuevo: what no ad set of the portfolio uses, what another one already does, what the rules crossed out', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    expect(screen.getByTestId('audience-fresh').textContent).toContain('Entrenamiento funcional');
    expect(screen.getByTestId('audience-fresh').textContent).toContain('nadie lo usa hoy');
    expect(screen.getByTestId('audience-reused').textContent).toContain(
      'Gimnasios ya se usa en ALEIRA // AGOSTO',
    );
    expect(screen.getByTestId('audience-excluded').textContent).toContain('Cerveza');
    expect(screen.getByTestId('audience-excluded').textContent).toContain(
      'Brand DNA: nunca alcohol',
    );
    expect(screen.getByTestId('audience-new').textContent).toContain(
      'Comparado con el otro conjunto del portafolio.',
    );
  });

  it('qué es nuevo says when only this ad set could be compared', () => {
    render(
      <AudienceRecommendationCard
        {...baseProps}
        portfolioSpecs={[]}
        view={audienceCardView([row({})], rec)}
      />,
    );
    expect(screen.getByTestId('audience-new').textContent).toContain(
      'Comparado solo con este conjunto',
    );
    expect(screen.queryByTestId('audience-reused')).toBeNull();
  });

  it('por qué: the trigger with its figure and window, the diagnosis and the rationale', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const why = screen.getByTestId('audience-why').textContent ?? '';
    expect(why).toContain('Alcance agotado');
    expect(why).toContain('2.1');
    expect(why).toContain('7d');
    expect(why).toContain(plan.diagnosis);
    expect(why).toContain(plan.rationale);
  });

  it('cómo se implementa: the paused ad set beside the current one, the budget and the carried creatives', () => {
    render(<AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />);
    const how = screen.getByTestId('audience-how').textContent ?? '';
    expect(how).toContain(
      'pausado, junto a "ITESO // AGOSTO // 2 - LKL"; los dos siguen corriendo',
    );
    expect(how).toContain('62.00 MXN/día');
    expect(how).toContain('1 con resultados: Tour nocturno');
    expect(how).toContain('Ranking entre los conjuntos inscritos.');
  });

  it('keeps the create flow: the budget seeded from the plan, the activate switch and the confirm dialog', async () => {
    const { container } = render(
      <AudienceRecommendationCard {...baseProps} view={audienceCardView([row({})], rec)} />,
    );
    expect((container.querySelector('#budget-rec-1') as HTMLInputElement).value).toBe('62');
    expect(container.textContent).toContain('Empezar activo');
    expect(container.textContent).toContain('se crea pausado; vos lo activás');
    fireEvent.click(screen.getByTestId('audience-create'));
    await waitFor(() =>
      expect(document.body.textContent).toContain(`¿Crear "${plan.adset_name}" en Meta?`),
    );
    expect(document.body.textContent).toContain('62.00 MXN/día');
    expect(document.body.textContent).toContain('Crear el conjunto');
  });
});

describe('AudienceRecommendationCard — the other faces', () => {
  it('with no proposal yet, keeps the frame and offers to ask Jaina now', () => {
    const view = audienceCardView([], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    expect(frameOrder(container)).toEqual([...SECTION_LABELS, 'audience-decision']);
    expect(screen.getByTestId('audience-what').textContent).toContain('ciclo diario');
    expect(screen.getByTestId('audience-why').textContent).toContain('Alcance agotado');
    expect(screen.getByTestId('audience-why').textContent).toContain(rec.reason);
    expect(container.textContent).toContain('Pedírsela a Jaina ahora');
    expect(screen.queryByTestId('audience-create')).toBeNull();
  });

  it('blocked for want of creatives: the same frame, the reason where the audience would be, the create button disabled', () => {
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
    expect(frameOrder(pending.container)).toEqual([...SECTION_LABELS, 'audience-decision']);
    expect(pending.getByTestId('audience-what').textContent).toContain('Bloqueada');
    expect(pending.getByTestId('audience-blocked-reason').textContent).toContain(
      'No delivering creative',
    );
    expect(pending.getByTestId('audience-how').textContent).toContain(
      'No se crea nada mientras la propuesta esté bloqueada.',
    );
    const create = pending.getByTestId('audience-create-blocked') as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(create.textContent).toBe('Crear el conjunto nuevo (pausado)');
    expect(pending.container.textContent).toContain('Pedírsela a Jaina de nuevo');
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
    expect(closed.container.textContent).not.toContain('Pedírsela a Jaina de nuevo');
    expect(closed.container.textContent).toContain('ya cerró esta recomendación');
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
    expect(container.textContent).toContain('Esta campaña tiene el presupuesto');
    expect(container.textContent).toContain('Previsualizar la conversión');
    expect(screen.queryByTestId('audience-create')).toBeNull();
    expect(screen.queryByTestId('audience-create-blocked')).toBeNull();
  });

  it('executed: the identifiers, the Qué se implementó dropdown, Activar and Deshacer', () => {
    const view = audienceCardView([row({ status: 'executed', result: executedResult })], rec);
    const { container } = render(<AudienceRecommendationCard {...baseProps} view={view} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Creado en Meta');
    expect(text).toContain('as-9');
    expect(text).toContain('ad-9');
    expect(text).toContain('Qué se implementó');
    expect(text).toContain('Activar');
    expect(text).toContain('Deshacer');
    expect(container.querySelector('a[href*="selected_adset_ids=as-9"]')).not.toBeNull();
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
    expect(screen.getByText(plan.diagnosis).className).toContain('text-[15px]');
    for (const button of container.querySelectorAll('button[data-slot="button"]')) {
      expect(button.className).toContain('h-8');
      expect(button.className).toContain('text-sm');
    }
  });

  it('the no-proposal, blocked, CBO-preview and executed faces carry no micro type either', () => {
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
