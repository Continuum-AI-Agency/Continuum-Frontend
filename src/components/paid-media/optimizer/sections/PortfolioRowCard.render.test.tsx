import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

// The apply-mode pill wants a tooltip provider ancestor and is not what these tests are
// about. `mock.module` replaces it for the whole process, so this file is run on its own.
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

// A live switch, so the calm rhythm AND its reduced-motion fallback are both reachable.
const motionPref = { reduce: false };
mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate, ...rest } = props;
      return React.createElement(tag, {
        ...rest,
        'data-anim': typeof animate === 'string' ? animate : undefined,
        ref,
      });
    });
  return {
    motion: { section: passthrough('section'), span: passthrough('span'), div: passthrough('div') },
    useReducedMotion: () => motionPref.reduce,
  };
});

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { accountCandidateSchema } from '@continuum/contracts';
import { PortfolioRowCard, portfolioLeads } from './PortfolioRowCard';

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

// ---------------------------------------------------------------------------
// STATE ONE — today's read found something inside this portfolio.
// ---------------------------------------------------------------------------

describe('PortfolioRowCard — the portfolio carries today’s finding', () => {
  it('says what was found, what it is worth in the detector’s terms, and in money', () => {
    const { getByTestId } = render(
      <PortfolioRowCard currency="USD" lead={candidate()} portfolio={portfolio()} />,
    );
    const band = getByTestId('portfolio-lead');
    expect(band.getAttribute('data-detector')).toBe('portfolio_reallocation');
    // One sentence — the catalogue's own label, never a word invented on this screen.
    expect(band.textContent).toContain('Move budget between portfolios');
    // One figure — the detector's own, not the money the ranking used.
    expect(band.textContent).toContain('33%');
    expect(band.textContent).toContain('cheaper per result');
    // And the money line every surface in this vocabulary carries.
    expect(band.textContent).toContain('$66.67/day');
    expect(band.textContent).toContain('$2,000/mo');
  });

  it('renders no band at all for a portfolio nothing was found in', () => {
    const { queryByTestId } = render(<PortfolioRowCard currency="USD" portfolio={portfolio()} />);
    expect(queryByTestId('portfolio-lead')).toBeNull();
  });

  it('survives a read naming a detector this build has never heard of', () => {
    const { getByTestId } = render(
      <PortfolioRowCard
        currency="USD"
        lead={{ ...candidate(), detector: 'brand_new_detector' } as unknown as AccountCandidate}
        portfolio={portfolio()}
      />,
    );
    expect(getByTestId('portfolio-lead').textContent).toContain('brand_new_detector');
  });

  // Twenty portfolio cards all breathing at once is not a calm screen, it is a flicker.
  it('breathes its rule only on the one card holding the account’s top finding', () => {
    const { getByTestId, rerender } = render(
      <PortfolioRowCard currency="USD" emphasis lead={candidate()} portfolio={portfolio()} />,
    );
    expect(getByTestId('portfolio-lead-rule').getAttribute('data-anim')).toBe('calm');

    rerender(
      <PortfolioRowCard
        currency="USD"
        emphasis={false}
        lead={candidate()}
        portfolio={portfolio()}
      />,
    );
    expect(getByTestId('portfolio-lead-rule').getAttribute('data-anim')).toBe('still');
  });

  it('holds everything still when the reader asked for stillness', () => {
    motionPref.reduce = true;
    const { container } = render(
      <PortfolioRowCard currency="USD" emphasis lead={candidate()} portfolio={portfolio()} />,
    );
    expect(container.querySelectorAll('[data-anim="calm"]')).toHaveLength(0);
    motionPref.reduce = false;
  });
});

// ---------------------------------------------------------------------------
// Which finding belongs to which portfolio — the pure read behind the band.
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

describe('PortfolioRowCard — a portfolio dead on Meta reads stale, not clean', () => {
  it('renders exactly as before when the row carries no staleness fields', () => {
    const { container, queryByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio()} />,
    );
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(queryByTestId('roster-chip')).toBeNull();
    expect(container.textContent).toContain('clean');
  });

  it('keeps "clean" on a fresh row after the migration', () => {
    const { container, queryByTestId } = render(
      <PortfolioRowCard currency="USD" portfolio={portfolio(FRESH_OVER)} />,
    );
    expect(queryByTestId('stale-chip')).toBeNull();
    expect(container.textContent).toContain('clean');
  });

  it('says how long since the last cycle and that the roster is gone, and drops "clean"', () => {
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
    expect(container.textContent).not.toContain('clean');
    // The count it still carries is the enrolled one — the roster chip says what is left.
    expect(container.textContent).toContain('12 ad sets');
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
    expect(reporte.container.textContent).not.toContain('clean');
  });

  it('still says what waits on a decision beside the staleness', () => {
    const { container, getByTestId } = render(
      <PortfolioRowCard
        currency="USD"
        portfolio={portfolio({ ...CITAS_OVER, pending_recommendations: 2 })}
      />,
    );
    expect(container.textContent).toContain('2 decisions waiting');
    expect(getByTestId('stale-chip')).toBeTruthy();
  });
});
