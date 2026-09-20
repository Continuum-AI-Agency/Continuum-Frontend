import { afterEach, describe, expect, it } from 'bun:test';
import type { AccountCandidate } from '@continuum/contracts';
import { accountCandidateSchema } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { AccountRead } from './AccountRead';

afterEach(cleanup);

const candidate = (over: Partial<AccountCandidate>): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'dead_tail:a1',
    detector: 'dead_tail',
    impact_per_day: 102,
    impact_class: 'recoverable',
    impact_basis: '2 ad sets with 0 results in 7 days, together spending 102/day',
    chart: {
      shape: 'interval',
      estimate: null,
      low: 420,
      high: 840,
      reference: 70,
      reference_label: 'target',
      at_stake_per_day: 102,
      no_results: true,
    },
    ...over,
  });

describe('AccountRead', () => {
  it('leads with the highest ranked card and draws its chart', () => {
    const { container, getByText } = render(
      <AccountRead
        candidates={[
          candidate({}),
          candidate({
            id: 'portfolio_reallocation:p1>p2',
            detector: 'portfolio_reallocation',
            impact_per_day: 66.67,
            impact_class: 'better_price',
            impact_basis: '200/day moved from a portfolio at 90 to one at 60, which is 33% cheaper',
            chart: {
              shape: 'transfer',
              from: { label: 'Prospecting', cost_per_result: 90, spend_per_day: 900 },
              to: { label: 'Retargeting', cost_per_result: 60, spend_per_day: 300 },
              movable_per_day: 200,
              saving_per_day: 66.67,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const cards = container.querySelectorAll('[data-detector]');
    expect(cards).toHaveLength(2);
    // 102 recoverable outranks 66.67 at a better price.
    expect(cards[0]?.getAttribute('data-detector')).toBe('dead_tail');
    expect(getByText('Spending on nothing')).toBeTruthy();
    // The card states the real money, not the discounted value the ranking used.
    expect(container.textContent).toContain('102');
    expect(container.textContent).toContain('Recoverable now');
  });

  it('puts a guard above the list and keeps it out of the ranking', () => {
    const { container } = render(
      <AccountRead
        candidates={[
          candidate({}),
          candidate({
            id: 'measurement_integrity:act_1',
            detector: 'measurement_integrity',
            impact_per_day: 9000,
            impact_basis: '3 campaigns spending with no events recorded',
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const guard = container.querySelector('[data-guard="measurement_integrity"]');
    expect(guard).toBeTruthy();
    expect(guard?.textContent).toContain('no events recorded');
    // A guard with a huge figure must not become the lead card.
    const cards = container.querySelectorAll('[data-detector]');
    expect([...cards].map((c) => c.getAttribute('data-detector'))).toEqual(['dead_tail']);
  });

  it('names the checks that could not run, so silence is not read as health', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({})]}
        currency="USD"
        dailySpend={1200}
        starved={[
          { detector: 'target_economics', missing: 'nobody has told us what a result is worth' },
        ]}
      />,
    );
    expect(container.textContent).toContain('1 checks could not run today');
    expect(container.textContent).toContain('what a result is worth');
  });

  it('says so plainly when every check ran and found nothing', () => {
    const { container } = render(<AccountRead candidates={[]} currency="USD" dailySpend={1200} />);
    expect(container.textContent).toContain('Nothing to move today');
  });
});

// ---------------------------------------------------------------------------
// The zones: three lead, the rest behind a disclosure, the blocked list grouped.
// ---------------------------------------------------------------------------

import { fireEvent } from '@testing-library/react';

const many = (n: number): AccountCandidate[] =>
  Array.from({ length: n }, (_, i) =>
    candidate({
      id: `dead_tail:a${i}`,
      // Descending impact so the ranking order is knowable without reimplementing it here.
      impact_per_day: 1000 - i * 10,
    }),
  );

describe('AccountRead — the three that lead', () => {
  it('shows exactly three, however many fired', () => {
    const { getAllByTestId } = render(
      <AccountRead candidates={many(9)} currency="USD" dailySpend={5000} />,
    );
    expect(getAllByTestId('account-lead')).toHaveLength(3);
  });

  it('shows all of them when fewer than three fired, and offers no disclosure', () => {
    const { getAllByTestId, queryByText } = render(
      <AccountRead candidates={many(2)} currency="USD" dailySpend={5000} />,
    );
    expect(getAllByTestId('account-lead')).toHaveLength(2);
    expect(queryByText(/more/)).toBeNull();
  });

  it('keeps the money class on a lead card — it is what says the rank was discounted', () => {
    const { container } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).toContain('Recoverable now');
  });
});

describe('AccountRead — the rest, behind one control', () => {
  it('hides the rest and prices what skipping it costs', () => {
    const { getByRole, queryAllByTestId } = render(
      <AccountRead candidates={many(6)} currency="USD" dailySpend={5000} />,
    );
    expect(queryAllByTestId('account-rest-row')).toHaveLength(0);
    const toggle = getByRole('button', { name: /3 more/ });
    // 970 + 960 + 950 = 2880 a day sits behind the control, and it says so.
    expect(toggle.textContent).toContain('2,880');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals them on demand', () => {
    const { getByRole, getAllByTestId } = render(
      <AccountRead candidates={many(6)} currency="USD" dailySpend={5000} />,
    );
    fireEvent.click(getByRole('button', { name: /3 more/ }));
    expect(getAllByTestId('account-rest-row')).toHaveLength(3);
  });
});

describe('AccountRead — a guard names what it poisons', () => {
  const guard = candidate({
    id: 'measurement_integrity:acct',
    detector: 'measurement_integrity',
    impact_class: 'recoverable',
    impact_basis: 'purchase absent from 2 sibling campaigns for 31 hours',
    chart: null,
  });

  it('marks the cards that read against the broken instrument', () => {
    const { container } = render(
      <AccountRead candidates={[guard, ...many(1)]} currency="USD" dailySpend={5000} />,
    );
    // dead_tail prices itself off a conversion count, so the guard casts doubt on it.
    expect(container.textContent).toContain('affected by the guard');
  });

  it('does not mark a card the guard has no bearing on', () => {
    const untouched = candidate({
      id: 'testing_discipline:acct',
      detector: 'testing_discipline',
      impact_class: 'deferred',
      chart: null,
    });
    const { container } = render(
      <AccountRead candidates={[guard, untouched]} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).not.toContain('affected by the guard');
  });
});

describe('AccountRead — the figure explains its own size', () => {
  it('says when a velocity cap, not the gap, set the number', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({ capped_by: 'velocity' })]}
        currency="USD"
        dailySpend={5000}
      />,
    );
    expect(container.textContent).toContain('per-cycle limit');
  });

  it('stays silent when nothing capped it', () => {
    const { container } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).not.toContain('per-cycle limit');
    expect(container.textContent).not.toContain('Capped by your guardrail');
  });
});

describe('AccountRead — what could not be asked, grouped by its blocker', () => {
  it('groups nine symptoms under the decisions that unblock them', () => {
    const { container } = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        starved={[
          { detector: 'audience_overlap', missing: 'true overlap needs a Meta call' },
          { detector: 'account_saturation', missing: 'net reach deduplicated across portfolios' },
          { detector: 'target_economics', missing: 'neither margin nor lifetime value is stored' },
        ]}
      />,
    );
    expect(container.textContent).toContain('3 checks could not run today');
    // The two that share one platform call appear under one heading, not two.
    expect(container.textContent).toContain('A platform call we do not make yet');
    expect(container.textContent).toContain('Unit economics');
  });
});
