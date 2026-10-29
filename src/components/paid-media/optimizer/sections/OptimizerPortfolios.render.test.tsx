import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PortfolioOpenPlan } from './portfolioAccounts';

// The archived section runs live React Query reads; stub the data layer so the card
// stack renders without a QueryClient. The apply-mode pill needs a Radix
// TooltipProvider ancestor — not relevant here — so it is stubbed out too.
//
// SPREAD THE REAL MODULE. `mock.module` replaces a module for the whole PROCESS, and bun
// runs every test file in one — so a partial replacement here left the next file in the
// run importing a `useOptimizerData` with only two exports, and it died on
// "Export named 'useOptimizerAccountEnrollments' not found". Overriding only what this
// file needs keeps the leak harmless.
const realOptimizerData = await import('../useOptimizerData');

/** What today's account read found, per test. Empty by default: most cases are not about it. */
let accountReadCandidates: unknown[] = [];
let archivedPortfolios: unknown[] = [];
/** Each portfolio's efficiency series, in the order the portfolios arrive. Empty = no cycle. */
let efficiencySeries: unknown[][] = [];
/** Each portfolio's latest-run pacing block, by id. Empty = nothing read. */
let pacingById = new Map<string, unknown>();

mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerArchivedPortfolios: () => ({ data: archivedPortfolios }),
  useOptimizerPortfolioEfficiency: () => ({
    series: efficiencySeries,
    pending: false,
    failed: 0,
    retryFailed: () => {},
  }),
  // The foot band's source. Stubbed rather than stripped, because the band is now part of
  // what this file renders — leaving the hook out is how "No QueryClient set" gets in.
  useOptimizerAccountRead: () => ({ data: { read: { candidates: accountReadCandidates } } }),
  useOptimizerPortfolioPacing: () => pacingById,
  useOptimizerMutations: () => ({
    restore: { mutate: () => {}, isPending: false, isError: false, error: null },
  }),
}));
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

// The rows' headline figures (usePortfolioFigures) read the account snapshots and each
// roster through React Query. Here the cycle series stands in for the live read, priced by
// the REAL `portfolioFigure()`, so the rows print what they printed before the live read
// existed; `figuresLive = false` makes the live read miss so the snapshot fallback shows.
const realPortfolioFigure = await import('./portfolioFigure');
const realPortfolioFigures = await import('./usePortfolioFigures');
let figuresLive = true;
mock.module('./usePortfolioFigures', () => ({
  ...realPortfolioFigures,
  usePortfolioFigures: ({
    portfolios,
    series,
  }: {
    portfolios: readonly PortfolioListItem[];
    series: readonly (readonly EfficiencySeriesPoint[])[];
  }) => {
    const figures = new Map<string, ReturnType<typeof realPortfolioFigure.portfolioFigure>>();
    portfolios.forEach((row, index) => {
      const cycle = realPortfolioFigure.seriesWindowFigures(series[index] ?? []);
      const figure = realPortfolioFigure.portfolioFigure({
        portfolio: row,
        live: figuresLive ? cycle : null,
        snapshot: cycle,
      });
      if (figure) figures.set(row.id, figure);
    });
    return { figures, pending: false };
  },
}));

const { OptimizerPortfolios } = await import('./OptimizerPortfolios');

function portfolio(
  overrides: Partial<PortfolioListItem> & { id: string; name: string },
): PortfolioListItem {
  return {
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...overrides,
  };
}

const PROSPECTING = portfolio({ id: 'p1', name: 'Prospecting' });
const openPlan: () => PortfolioOpenPlan = () => ({ kind: 'open', portfolioId: 'p1' });

function renderList(
  props: Partial<Parameters<typeof OptimizerPortfolios>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <OptimizerPortfolios
      brandId="b1"
      adAccountId="act_1"
      portfolios={[PROSPECTING]}
      currency="USD"
      onCreate={() => {}}
      onOpenDetail={() => {}}
      brandGroups={[]}
      brandPortfolioCount={1}
      planOpen={openPlan}
      onOpenAcrossAccounts={() => {}}
      {...props}
    />,
  );
}

afterEach(() => {
  figuresLive = true;
  accountReadCandidates = [];
  efficiencySeries = [];
  archivedPortfolios = [];
  pacingById = new Map();
  cleanup();
});

/** A candidate in the shape the detectors write, with the headline vocabulary on it. */
function candidate(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dead_tail:act_1',
    detector: 'dead_tail',
    portfolio_ids: ['p1'],
    impact_per_day: 69.75,
    impact_class: 'recoverable',
    confidence: 1,
    impact_basis: '3 ad sets with 0 results in 7 days',
    evidence: {},
    headline: {
      kind: 'avoided',
      value: 69.75,
      unit: 'currency_per_day',
      label: 'a day buying nothing',
      from: null,
      to: null,
    },
    chart: null,
    capped_by: null,
    result_label: 'leads',
    state: null,
    state_lowered: false,
    cta: { kind: 'none', target_id: null },
    ...over,
  };
}

describe('OptimizerPortfolios', () => {
  it('opens the detail workspace on a single card click', () => {
    const onOpenDetail = mock((_id: string) => {});
    const { getByRole } = renderList({ onOpenDetail });

    fireEvent.click(getByRole('button', { name: 'Open Prospecting' }));
    expect(onOpenDetail).toHaveBeenCalledWith('p1');
  });

  it('no longer renders the split Performance / Manage disclosures', () => {
    const { queryByText, queryByRole } = renderList();

    expect(queryByText('Performance')).toBeNull();
    expect(queryByText('Manage')).toBeNull();
    expect(queryByRole('button', { name: 'Performance' })).toBeNull();
    expect(queryByRole('button', { name: 'Manage' })).toBeNull();
  });

  it('fires onCreate from the New portfolio button (no sheet)', () => {
    const onCreate = mock(() => {});
    const { getByRole } = renderList({ onCreate });

    fireEvent.click(getByRole('button', { name: 'New portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('warms the detail reads when a card is hovered', () => {
    const onPrefetchPortfolio = mock((_id: string) => {});
    const { getByRole } = renderList({ onPrefetchPortfolio });

    fireEvent.mouseEnter(getByRole('button', { name: 'Open Prospecting' }));
    expect(onPrefetchPortfolio).toHaveBeenCalledWith('p1');
  });

  // A finding must read the SAME way here as on the Overview, in the detector's own figure —
  // not as money on one screen and a percentage on the other. Here it is ONE muted line.
  it('carries today’s finding as one line under the name, led by the detector’s own figure', () => {
    accountReadCandidates = [candidate()];
    const { getByTestId } = renderList();

    const line = getByTestId('portfolio-lead');
    expect(line.tagName).toBe('P');
    expect(line.getAttribute('data-detector')).toBe('dead_tail');
    expect(line.textContent).toBe('Spending on nothing · $69.75 USD a day buying nothing');
    const figure = line.querySelector('[data-figure="portfolios.p1.lead.figure"]');
    expect(figure?.getAttribute('data-figure-raw')).toBe('69.75');
  });

  it('says what the portfolio buys under the name when today’s read says nothing about it', () => {
    accountReadCandidates = [candidate({ portfolio_ids: ['other'] })];
    const { queryByTestId, getByRole } = renderList();

    expect(queryByTestId('portfolio-lead')).toBeNull();
    expect(getByRole('button', { name: 'Open Prospecting' }).textContent).toContain('Lead');
  });

  // PP-L3-identical-pacing-block-on-every-portfolio / PP-L3-pacing-noun-from-window-kind: the
  // account_pacing candidate names EVERY flight on the account, so printing it as each row's
  // lead put the same account verdict and the account's noun on a lead portfolio, a 0-ad-set
  // purchase portfolio and the third one alike. A pacing row reads its OWN run's pacing and
  // names its OWN result.
  describe('under an account-wide pacing finding', () => {
    const leadPortfolio = portfolio({
      id: 'p1',
      name: 'FORMULARIOS',
      objective: 'lead',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      period_budget: 31_000,
    });
    const purchasePortfolio = portfolio({
      id: 'p2',
      name: 'Tours',
      objective: 'purchase',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      period_budget: 15_000,
    });
    const accountPacing = candidate({
      id: 'account_pacing:act_1',
      detector: 'account_pacing',
      portfolio_ids: ['p1', 'p2'],
      impact_per_day: 2608,
      result_label: 'purchases',
      headline: {
        kind: 'drift',
        value: 166,
        unit: 'percent',
        label: 'over plan',
        from: 78_252,
        to: 46_000,
      },
    });
    const run = (pacingRatio: number, status: string) => ({
      dailyTotal: 1000,
      idealCumulative: 12_000,
      pacingRatio,
      status,
      note: '',
      source: 'pacing',
    });

    it('prints each row’s own pacing and its own result noun, never the account’s', () => {
      accountReadCandidates = [accountPacing];
      pacingById = new Map([
        ['p1', run(1.2, 'overpacing')],
        ['p2', run(0.9, 'underpacing')],
      ]);
      const { getByRole } = renderList({ portfolios: [leadPortfolio, purchasePortfolio] });

      const formularios = getByRole('button', { name: 'Open FORMULARIOS' });
      const tours = getByRole('button', { name: 'Open Tours' });
      const lineOf = (row: HTMLElement) =>
        row.querySelector('[data-testid="portfolio-lead"]') as HTMLElement;

      expect(lineOf(formularios).textContent).toBe(
        'The month will not land · 20% over plan · leads',
      );
      expect(lineOf(tours).textContent).toBe(
        'The month will not land · 10% under plan · purchases',
      );
      expect(formularios.textContent).not.toContain('purchases');
      expect(formularios.textContent).not.toContain('166');

      const figure = lineOf(formularios).querySelector(
        '[data-figure="portfolios.p1.pacing.figure"]',
      );
      expect(figure?.textContent).toBe('20%');
      expect(figure?.getAttribute('data-figure-raw')).toBe('20');
      expect(figure?.getAttribute('data-figure-unit')).toBe('percent');
    });

    it('says what the portfolio buys when its own run holds no pacing verdict', () => {
      accountReadCandidates = [accountPacing];
      pacingById = new Map([['p1', run(1.2, 'overpacing')]]);
      const { getByRole } = renderList({ portfolios: [leadPortfolio, purchasePortfolio] });

      const tours = getByRole('button', { name: 'Open Tours' });
      expect(tours.querySelectorAll('[data-testid="portfolio-lead"]')).toHaveLength(0);
      expect(tours.textContent).toContain('Purchase');
      expect(tours.textContent).not.toContain('166');
    });
  });

  // The brand-wide scope is a navigation list across every ad account the brand owns, and an
  // account read is per account. Decorating it would cost one read per group; it does not.
  it('leaves the all-accounts browser undecorated', () => {
    accountReadCandidates = [candidate()];
    const { getByRole, queryByTestId } = renderList({
      brandPortfolioCount: 4,
      brandGroups: [
        {
          accountId: 'act_2',
          label: 'Another account',
          known: true,
          isSelected: false,
          portfolios: [portfolio({ id: 'p9', name: 'Elsewhere', ad_account_id: 'act_2' })],
        },
      ],
    });

    fireEvent.click(getByRole('button', { name: /All accounts/ }));
    expect(queryByTestId('portfolio-lead')).toBeNull();
  });
});

// The three production portfolios the live bench (stale:portfolios:live) named on 2026-09-23.
// Days, last cycle, roster state and counts are the real figures; roster_absent_since is a
// fixture value. Noon UTC so the "since" day reads the same in any test timezone.
const DANIEL_OVER = {
  adset_count: 2,
  last_actual_cycle_at: '2026-07-23T12:00:00Z',
  stale_for_days: 61,
  roster_state: 'absent' as const,
  roster_absent_since: '2026-07-24T12:00:00Z',
  roster_missing_count: 2,
};
const CITAS_OVER = {
  adset_count: 12,
  last_actual_cycle_at: '2026-08-05T12:00:00Z',
  stale_for_days: 49,
  roster_state: 'absent' as const,
  roster_absent_since: '2026-08-06T12:00:00Z',
  roster_missing_count: 12,
};
const REPORTE_OVER = {
  adset_count: 0,
  last_actual_cycle_at: '2026-08-06T12:00:00Z',
  stale_for_days: 48,
  roster_state: 'empty' as const,
  roster_absent_since: null,
  roster_missing_count: 0,
};
const FRESH_OVER = {
  adset_count: 12,
  last_actual_cycle_at: '2026-09-23T06:00:00Z',
  stale_for_days: null,
  roster_state: 'present' as const,
  roster_absent_since: null,
  roster_missing_count: 0,
};

describe('OptimizerPortfolios — a portfolio dead on Meta reads stale', () => {
  it('renders the card exactly as before when the row carries no staleness fields', () => {
    const { queryByTestId, getByRole } = renderList();
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(queryByTestId('roster-chip')).toBeNull();
    expect(getByRole('button', { name: 'Open Prospecting' }).textContent).toContain('2 ad sets');
  });

  it('names members by what they are on their platform: campaigns on Google, members when mixed', () => {
    const google = portfolio({
      id: 'g1',
      name: 'Leads Google',
      adset_count: 3,
      platforms: ['google_ads'],
    });
    const mixed = portfolio({
      id: 'm1',
      name: 'Mixed',
      adset_count: 2,
      platforms: ['meta', 'google_ads'],
    });
    const { getByRole } = renderList({ portfolios: [google, mixed], brandPortfolioCount: 2 });
    expect(getByRole('button', { name: 'Open Leads Google' }).textContent).toContain('3 campaigns');
    expect(getByRole('button', { name: 'Open Mixed' }).textContent).toContain('2 members');
  });

  it('adds nothing to a fresh row after the migration', () => {
    const { queryByTestId } = renderList({
      portfolios: [portfolio({ id: 'p1', name: 'MENSAJES // TODOS', ...FRESH_OVER })],
    });
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(queryByTestId('roster-chip')).toBeNull();
  });

  it('says how long since the last cycle and that the roster is gone on the card', () => {
    const { getByRole } = renderList({
      portfolios: [
        portfolio({ id: 'p1', name: 'Citas Agosto - check leads', ...CITAS_OVER }),
        portfolio({ id: 'p2', name: 'Daniel Gutierrez Buendia', ...DANIEL_OVER }),
        portfolio({ id: 'p3', name: 'Reporte Agosto - Citas y Mensajes', ...REPORTE_OVER }),
      ],
    });
    const citas = getByRole('button', { name: 'Open Citas Agosto - check leads' });
    expect(citas.querySelector('[data-testid="stale-chip"]')?.textContent).toBe(
      'last cycle 49 days ago',
    );
    expect(citas.querySelector('[data-testid="roster-chip"]')?.textContent).toBe(
      'roster gone since Aug 6 · 12 of 12 ad sets',
    );
    const daniel = getByRole('button', { name: 'Open Daniel Gutierrez Buendia' });
    expect(daniel.querySelector('[data-testid="stale-chip"]')?.textContent).toBe(
      'last cycle 61 days ago',
    );
    expect(daniel.querySelector('[data-testid="roster-chip"]')?.textContent).toBe(
      'roster gone since Jul 24 · 2 of 2 ad sets',
    );
    const reporte = getByRole('button', { name: 'Open Reporte Agosto - Citas y Mensajes' });
    expect(reporte.querySelector('[data-testid="stale-chip"]')?.textContent).toBe(
      'last cycle 48 days ago',
    );
    expect(reporte.querySelector('[data-testid="roster-chip"]')).toBeNull();
  });
});

describe('OptimizerPortfolios — a live table, one row per portfolio', () => {
  // 2,000 over the window for 50 leads = 40 per lead.
  const cycle = {
    cycle_ts: '2026-09-27T06:00:00Z',
    spend_d3: 900,
    conv_d3: 20,
    spend_d7: 2000,
    conv_d7: 50,
    spend_d14: 4200,
    conv_d14: 100,
    adsets: 2,
  };

  it('labels the columns once, above the rows', () => {
    const { getByTestId } = renderList();
    expect(getByTestId('portfolio-table-header').textContent).toBe(
      'PortfolioCost vs targetPer dayMembersPendingStatus',
    );
  });

  it('draws no boxed card — rows are separated by hairlines', () => {
    const { getByRole } = renderList();
    const row = getByRole('button', { name: 'Open Prospecting' });
    expect(row.className).not.toContain('border');
    expect(row.className).not.toContain('bg-card');
    expect(row.parentElement?.className).toContain('border-t');
  });

  it('quotes cost per result against its target, coloured by the verdict', () => {
    efficiencySeries = [[cycle]];
    const { container, getByRole } = renderList({
      portfolios: [portfolio({ id: 'p1', name: 'Prospecting', cpa_target: 30 })],
    });
    const row = getByRole('button', { name: 'Open Prospecting' });
    expect(row.getAttribute('data-state')).toBe('bad');
    const cost = container.querySelector('[data-figure="portfolios.p1.cost"]');
    expect(cost?.textContent).toBe('$40.00 USD');
    expect(cost?.className).toContain('text-destructive');
    expect(container.querySelector('[data-figure="portfolios.p1.target"]')?.textContent).toBe(
      '$30.00 USD',
    );
    expect(container.querySelector('[data-testid="portfolio-cost-bar"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="portfolio-state-chip"]')?.textContent).toBe('33% over');
  });

  it('prints a live figure with no caveat', () => {
    efficiencySeries = [[cycle]];
    const { container, getByRole } = renderList({
      portfolios: [portfolio({ id: 'p1', name: 'Prospecting', cpa_target: 30 })],
    });
    const row = getByRole('button', { name: 'Open Prospecting' });
    expect(row.querySelector('[data-figure-source="live"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="portfolio-figure-as-of"]')).toBeNull();
  });

  it('dates the last cycle’s figure when the live read cannot supply one, and says it is old', () => {
    figuresLive = false;
    efficiencySeries = [[cycle]];
    const { getByRole } = renderList({
      portfolios: [portfolio({ id: 'p1', name: 'Prospecting', cpa_target: 30 })],
    });
    const row = getByRole('button', { name: 'Open Prospecting' });
    expect(row.querySelector('[data-figure-source="snapshot"]')).not.toBeNull();
    // The figure is still the cycle's — only now it says when it was measured.
    expect(row.querySelector('[data-testid="portfolio-state-chip"]')?.textContent).toBe('33% over');
    const asOf = row.querySelector('[data-testid="portfolio-figure-as-of"]');
    expect(asOf?.textContent).toMatch(/^as of Sep 27 · \d+ days old$/);
    expect(asOf?.getAttribute('data-stale')).toBe('true');
    expect(asOf?.className).toContain('text-warning');
  });

  it('still names the target before the first cycle, and says no cycle has run', () => {
    const { container, getByRole } = renderList({
      portfolios: [portfolio({ id: 'p1', name: 'Prospecting', cpa_target: 30 })],
    });
    expect(container.querySelector('[data-figure="portfolios.p1.cost"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-figure="portfolios.p1.target"]')?.textContent).toBe(
      '$30.00 USD',
    );
    const row = getByRole('button', { name: 'Open Prospecting' });
    expect(row.querySelector('[data-testid="portfolio-state-chip"]')?.textContent).toBe(
      'no cycle yet',
    );
  });

  it('prints the daily budget with provenance and the pending count as a badge', () => {
    const { container, getByTestId } = renderList({
      portfolios: [
        portfolio({
          id: 'p1',
          name: 'Prospecting',
          pending_recommendations: 2,
          pending_budget_moves: 1,
        }),
      ],
    });
    const daily = container.querySelector('[data-figure="portfolios.p1.daily"]');
    expect(daily?.textContent).toBe('$500 USD');
    expect(daily?.getAttribute('data-figure-raw')).toBe('500');
    expect(getByTestId('portfolio-pending-count').textContent).toBe('3');
  });

  it('shows no pending badge when nothing waits', () => {
    const { queryByTestId } = renderList();
    expect(queryByTestId('portfolio-pending-count')).toBeNull();
  });

  it('keeps archived portfolios collapsed, then restores from a quiet row', () => {
    archivedPortfolios = [portfolio({ id: 'a1', name: 'Old campaign', status: 'archived' })];
    const { getByRole, queryByText, getByText } = renderList();
    expect(queryByText('Old campaign')).toBeNull();
    fireEvent.click(getByRole('button', { name: /Archived \(1\)/ }));
    const row = getByText('Old campaign').closest('li');
    expect(row?.className).not.toContain('border-dashed');
    expect(row?.textContent).toContain('Restore');
  });
});
