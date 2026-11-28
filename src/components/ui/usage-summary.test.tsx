import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { UsageSummary } from './usage-summary';

afterEach(cleanup);

const models = [{ id: 'a', name: 'Model A', color: 'red' }];
const days = [
  { date: '2026-11-15', byModel: { a: { tokens: 1200, cost: 1 } } },
  { date: '2026-11-16', byModel: { a: { tokens: 800, cost: 2 } } },
];

describe('UsageSummary', () => {
  it('defaults: a daily chart, compact amounts, "tokens"', () => {
    const { getByRole, getAllByRole, container } = render(<UsageSummary data={{ days, models }} />);
    expect(getByRole('group')).toBeTruthy();
    expect(getAllByRole('button')).toHaveLength(2);
    expect(container.textContent).toContain('Last 2 days');
    expect(getAllByRole('button')[0].getAttribute('aria-label')).toContain('1.2k tokens');
  });

  it('a unit and formatter replace "tokens" and the compact form', () => {
    const { getAllByRole } = render(
      <UsageSummary
        unit="credits"
        formatAmount={(n) => n.toLocaleString('en-US')}
        data={{ days, models }}
      />,
    );
    expect(getAllByRole('button')[0].getAttribute('aria-label')).toContain('1,200 credits');
  });

  it('with totals and no days: no chart, a stacked bar, budget measured by `used`', () => {
    const { queryByRole, getByRole, container } = render(
      <UsageSummary
        unit="credits"
        data={{
          models,
          totals: { a: { tokens: 500, cost: 5 } },
          budget: { limit: 10, used: 9, warnLabel: 'Running low' },
        }}
      />,
    );
    expect(queryByRole('group')).toBeNull();
    expect(container.textContent).not.toContain('Last ');
    expect(getByRole('meter', { name: 'Usage by model' }).getAttribute('aria-valuenow')).toBe(
      '500',
    );
    expect(getByRole('meter', { name: 'Budget used' }).getAttribute('aria-valuetext')).toBe(
      '$9.00 of $10.00 (90%)',
    );
    expect(container.textContent).toContain('Running low');
  });
});
