import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

// The apply-mode pill wants a tooltip provider ancestor and is not what these tests are
// about. `mock.module` replaces it for the whole process, so this file is run on its own.
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

import type {
  AccountCandidate,
  EfficiencySeriesPoint,
  PortfolioListItem,
} from '@continuum/contracts';
import { accountCandidateSchema } from '@continuum/contracts';
import { portfolioWindow } from './account/overviewModel';
import { PortfolioRowCard, portfolioLeads, stateChipLabel } from './PortfolioRowCard';

afterEach(cleanup);

const portfolio = (over: Partial<PortfolioListItem> = {}): PortfolioListItem =>
  ({
    id: 'pf_1',
    name: 'Prospecting',
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
    ...over,
  }) as PortfolioListItem;

// One cycle: 2,000 spent over the window for 50 leads — 40 per lead — and the window before
// it the same shape. Every window below is built through `portfolioWindow`, never by hand.
const point = (over: Partial<EfficiencySeriesPoint> = {}): EfficiencySeriesPoint => ({
  cycle_ts: '2026-09-27T06:00:00Z',
  spend_d3: 900,
  conv_d3: 20,
  spend_d7: 2000,
  conv_d7: 50,
  spend_d14: 4200,
  conv_d14: 100,
  adsets: 2,
  ...over,
});

const windowFor = (pf: PortfolioListItem, pt: EfficiencySeriesPoint = point()) =>
  portfolioWindow(pf, [pt]);

const candidate = (over: Partial<AccountCandidate> = {}): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'portfolio_reallocation:pf_1>pf_2',
    detector: 'portfolio_reallocation',
    portfolio_ids: ['pf_1'],
    impact_per_day: 66.67,
    impact_class: 'better_price',
    impact_basis: '200/day moved from a portfolio at 90 to one at 60',
    result_label: 'leads',
    chart: null,
    headline: {
      kind: 'efficiency',
      value: 33,
      unit: 'percent',
      label: 'cheaper per result',
      from: 90,
      to: 60,
    },
    ...over,
  });

const figure = (container: HTMLElement, key: string) => {
  const node = container.querySelector(`[data-figure="portfolio-row.pf_1.${key}"]`);
  if (!node) throw new Error(`no figure ${key}`);
  return node;
};

// ---------------------------------------------------------------------------
// The row — name, what it buys, three figures over the window, and the state chip.
// ---------------------------------------------------------------------------

describe('PortfolioRowCard — one line per portfolio', () => {
  it('is a button the bench can find by name, stamped with its id and state', () => {
    const pf = portfolio({ cpa_target: 30 });
    const { getByRole, getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
    );
    expect(getByRole('button').textContent).toContain('Prospecting');
    const row = getByTestId('portfolio-row');
    expect(row.tagName).toBe('BUTTON');
    expect(row.getAttribute('data-portfolio-id')).toBe('pf_1');
    expect(row.getAttribute('data-state')).toBe('bad');
  });

  it('says what it buys, how many ad sets, and the daily budget, in Spanish', () => {
    const { container } = render(<PortfolioRowCard currency="USD" portfolio={portfolio()} />);
    expect(container.textContent).toContain('Lead');
    expect(container.textContent).toContain('2 conjuntos');
    expect(container.textContent).toContain('$500/día');
  });

  it('counts a single ad set in the singular', () => {
    const { container } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio({ adset_count: 1 })} />,
    );
    expect(container.textContent).toContain('1 conjunto');
    expect(container.textContent).not.toContain('1 conjuntos');
  });

  it('quotes cost per result against its target, results, and spend over the window', () => {
    const pf = portfolio({ cpa_target: 30 });
    const { container, getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
    );
    expect(figure(container, 'cost').textContent).toBe('$40.00');
    expect(getByTestId('portfolio-row-cost').textContent).toContain('por lead · obj. $30.00');
    expect(figure(container, 'results').textContent).toBe('50');
    expect(getByTestId('portfolio-row-results').textContent).toContain('leads 7d');
    expect(figure(container, 'spend').textContent).toBe('$2,000');
    expect(getByTestId('portfolio-row-spend').textContent).toContain('USD 7d');
  });

  it('carries provenance on every figure so the parity bench can grade it', () => {
    const pf = portfolio({ cpa_target: 30 });
    const { container } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
    );
    const cost = figure(container, 'cost');
    expect(cost.getAttribute('data-figure-raw')).toBe('40');
    expect(cost.getAttribute('data-figure-unit')).toBe('currency');
    expect(cost.getAttribute('data-figure-window')).toBe('d7');
    expect(cost.getAttribute('data-figure-currency')).toBe('USD');
    const results = figure(container, 'results');
    expect(results.getAttribute('data-figure-raw')).toBe('50');
    expect(results.getAttribute('data-figure-unit')).toBe('count');
    const spend = figure(container, 'spend');
    expect(spend.getAttribute('data-figure-raw')).toBe('2000');
    expect(spend.getAttribute('data-figure-unit')).toBe('currency');
  });

  it('says "sin objetivo" under the cost when the portfolio set none', () => {
    const pf = portfolio();
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
    );
    expect(getByTestId('portfolio-row-cost').textContent).toContain('por lead · sin objetivo');
  });

  it('spells the window in the account currency, or leaves it bare without one', () => {
    const pf = portfolio({ cpa_target: 30 });
    const mxn = render(<PortfolioRowCard currency="MXN" portfolio={pf} window={windowFor(pf)} />);
    expect(mxn.getByTestId('portfolio-row-spend').textContent).toContain('MXN 7d');
    expect(figure(mxn.container, 'cost').textContent).toBe('40.00 MXN');
    cleanup();
    const bare = render(<PortfolioRowCard portfolio={pf} window={windowFor(pf)} />);
    expect(bare.getByTestId('portfolio-row-spend').textContent).toBe('2,0007d');
    expect(figure(bare.container, 'spend').getAttribute('data-figure-currency')).toBe('none');
  });

  it('groups results the Spanish way', () => {
    const pf = portfolio({ cpa_target: 30 });
    const { container } = render(
      <PortfolioRowCard
        currency="USD"
        portfolio={pf}
        window={windowFor(pf, point({ conv_d7: 1516, conv_d14: 3000 }))}
      />,
    );
    expect(figure(container, 'results').textContent).toBe('1,516');
  });
});

// ---------------------------------------------------------------------------
// No cycle yet — nothing to quote, and the row says so rather than reading as zero.
// ---------------------------------------------------------------------------

describe('PortfolioRowCard — before the first cycle', () => {
  it('draws every figure as a dash and says no cycle has run', () => {
    const { container, getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio({ cpa_target: 30 })} />,
    );
    expect(figure(container, 'cost').textContent).toBe('—');
    expect(figure(container, 'results').textContent).toBe('—');
    expect(figure(container, 'spend').textContent).toBe('—');
    expect(getByTestId('portfolio-state-chip').textContent).toBe('sin ciclo aún');
    expect(getByTestId('portfolio-row').getAttribute('data-state')).toBe('none');
  });

  it('leaves the provenance raw empty so the bench reads "no figure", not zero', () => {
    const { container } = render(<PortfolioRowCard currency="USD" portfolio={portfolio()} />);
    expect(figure(container, 'cost').getAttribute('data-figure-raw')).toBe('');
    expect(figure(container, 'spend').getAttribute('data-figure-raw')).toBe('');
  });

  it('treats an explicit null window the same as none', () => {
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio()} window={null} />,
    );
    expect(getByTestId('portfolio-state-chip').textContent).toBe('sin ciclo aún');
  });
});

// ---------------------------------------------------------------------------
// The state chip — the one word the reader scans the column for.
// ---------------------------------------------------------------------------

describe('PortfolioRowCard — the state chip', () => {
  const chipFor = (pf: PortfolioListItem, pt?: EfficiencySeriesPoint) => {
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf, pt)} />,
    );
    return {
      text: getByTestId('portfolio-state-chip').textContent,
      state: getByTestId('portfolio-row').getAttribute('data-state'),
    };
  };

  it('reads "33% sobre" and goes red past the warning ceiling', () => {
    expect(chipFor(portfolio({ cpa_target: 30 }))).toEqual({ text: '33% sobre', state: 'bad' });
  });

  it('reads "11% sobre" and goes amber inside the warning ceiling', () => {
    expect(chipFor(portfolio({ cpa_target: 36 }))).toEqual({ text: '11% sobre', state: 'warn' });
  });

  it('reads "20% bajo" and goes green under the target', () => {
    expect(chipFor(portfolio({ cpa_target: 50 }))).toEqual({ text: '20% bajo', state: 'ok' });
  });

  it('reads "en objetivo" exactly on the target', () => {
    expect(chipFor(portfolio({ cpa_target: 40 }))).toEqual({ text: 'en objetivo', state: 'ok' });
  });

  it('reads "0 resultados" when the window bought nothing, target or not', () => {
    const zero = point({ conv_d7: 0, conv_d14: 0 });
    expect(chipFor(portfolio({ cpa_target: 30 }), zero)).toEqual({
      text: '0 resultados',
      state: 'none',
    });
    cleanup();
    expect(chipFor(portfolio(), zero).text).toBe('0 resultados');
  });

  it('reads "sin objetivo" with a cost but nothing to measure it against', () => {
    expect(chipFor(portfolio())).toEqual({ text: 'sin objetivo', state: 'none' });
  });

  it('appends the decisions waiting, singular and plural', () => {
    expect(chipFor(portfolio({ cpa_target: 30, pending_recommendations: 3 })).text).toBe(
      '33% sobre · 3 decisiones',
    );
    cleanup();
    expect(
      chipFor(portfolio({ cpa_target: 30, pending_recommendations: 0, pending_budget_moves: 1 }))
        .text,
    ).toBe('33% sobre · 1 decisión');
    cleanup();
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio({ pending_recommendations: 2 })} />,
    );
    expect(getByTestId('portfolio-state-chip').textContent).toBe('sin ciclo aún · 2 decisiones');
  });

  it('maps every tile state to its own tone', () => {
    const variant = (pf: PortfolioListItem) => {
      const { getByTestId } = render(
        <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
      );
      const chip = getByTestId('portfolio-state-chip');
      const tone = chip.className;
      cleanup();
      return tone;
    };
    const tones = new Set([
      variant(portfolio({ cpa_target: 50 })),
      variant(portfolio({ cpa_target: 36 })),
      variant(portfolio({ cpa_target: 30 })),
      variant(portfolio()),
    ]);
    expect(tones.size).toBe(4);
  });
});

describe('stateChipLabel', () => {
  it('shortens the target distance to the word the column already implies', () => {
    const pf = portfolio({ cpa_target: 30 });
    expect(stateChipLabel(windowFor(pf))).toBe('33% sobre');
    expect(stateChipLabel(windowFor(portfolio({ cpa_target: 50 })))).toBe('20% bajo');
    expect(stateChipLabel(windowFor(portfolio({ cpa_target: 40 })))).toBe('en objetivo');
    expect(stateChipLabel(windowFor(portfolio()))).toBe('sin objetivo');
    expect(stateChipLabel(windowFor(pf, point({ conv_d7: 0 })))).toBe('0 resultados');
    expect(stateChipLabel(null)).toBe('sin ciclo aún');
    expect(stateChipLabel(undefined)).toBe('sin ciclo aún');
  });
});

// ---------------------------------------------------------------------------
// Which finding belongs to which portfolio — the pure read the Portfolios tab uses.
// ---------------------------------------------------------------------------

describe('portfolioLeads', () => {
  it('gives a portfolio its strongest finding, and names the account’s own lead', () => {
    const weak = candidate({
      id: 'seasonality:pf_1',
      detector: 'seasonality',
      portfolio_ids: ['pf_1'],
      impact_per_day: 10,
    });
    const strong = candidate({ portfolio_ids: ['pf_1', 'pf_2'], impact_per_day: 400 });
    const { leads, emphasised } = portfolioLeads([weak, strong]);
    expect(leads.get('pf_1')?.id).toBe(strong.id);
    expect(leads.get('pf_2')?.id).toBe(strong.id);
    expect(emphasised).toBe('pf_1');
  });

  it('keeps a guard out of it — "the figures cannot be trusted" is not a portfolio’s advice', () => {
    const guard = candidate({
      id: 'measurement_integrity:act_1',
      detector: 'measurement_integrity',
      portfolio_ids: ['pf_1'],
      impact_per_day: 9000,
    });
    const { leads, emphasised } = portfolioLeads([guard]);
    expect(leads.size).toBe(0);
    expect(emphasised).toBeNull();
  });

  it('names no portfolio for an account-wide finding', () => {
    const { leads, emphasised } = portfolioLeads([candidate({ portfolio_ids: [] })]);
    expect(leads.size).toBe(0);
    expect(emphasised).toBeNull();
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

describe('PortfolioRowCard — a portfolio dead on Meta wears its staleness beside the state', () => {
  it('wears no staleness chip when the row carries no staleness fields', () => {
    const { queryByTestId } = render(<PortfolioRowCard currency="USD" portfolio={portfolio()} />);
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(queryByTestId('roster-chip')).toBeNull();
  });

  it('wears none on a fresh row after the migration', () => {
    const { queryByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio(FRESH_OVER)} />,
    );
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(queryByTestId('roster-chip')).toBeNull();
  });

  it('says how long since the last cycle and that the roster is gone', () => {
    const { container, getByTestId } = render(
      <PortfolioRowCard
        currency="USD"
        portfolio={portfolio({ name: 'Citas Agosto - check leads', ...CITAS_OVER })}
      />,
    );
    expect(getByTestId('stale-chip').textContent).toBe('last cycle 49 days ago');
    expect(getByTestId('roster-chip').textContent).toBe(
      'roster gone since Aug 6 · 12 of 12 ad sets',
    );
    // The count it still carries is the enrolled one — the roster chip says what is left.
    expect(container.textContent).toContain('12 conjuntos');
  });

  it('reads the 61-day and the 0-enrolled shapes each by their own facts', () => {
    const daniel = render(<PortfolioRowCard currency="USD" portfolio={portfolio(DANIEL_OVER)} />);
    expect(daniel.getByTestId('stale-chip').textContent).toBe('last cycle 61 days ago');
    expect(daniel.getByTestId('roster-chip').textContent).toBe(
      'roster gone since Jul 24 · 2 of 2 ad sets',
    );
    cleanup();
    const reporte = render(<PortfolioRowCard currency="USD" portfolio={portfolio(REPORTE_OVER)} />);
    expect(reporte.getByTestId('stale-chip').textContent).toBe('last cycle 48 days ago');
    expect(reporte.queryByTestId('roster-chip')).toBeNull();
    expect(reporte.container.textContent).toContain('0 conjuntos');
  });

  it('still says what waits on a decision beside the staleness', () => {
    const pf = portfolio({ ...CITAS_OVER, cpa_target: 30, pending_recommendations: 2 });
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={pf} window={windowFor(pf)} />,
    );
    expect(getByTestId('portfolio-state-chip').textContent).toBe('33% sobre · 2 decisiones');
    expect(getByTestId('stale-chip')).toBeTruthy();
  });
});
