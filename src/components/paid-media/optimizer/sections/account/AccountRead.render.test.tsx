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
