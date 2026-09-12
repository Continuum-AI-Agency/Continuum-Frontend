import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx area kit (needs ResizeObserver); the legend and the empty state are the
// subject here, plus which series the stream declares.
const areas: string[] = [];
mock.module('@/components/charts/area-chart', () => ({
  AreaChart: ({ children }: { children?: unknown }) => (
    <div data-testid="area-chart">{children as never}</div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => {
    areas.push(dataKey);
    return null;
  },
}));
mock.module('@/components/charts/tooltip', () => ({ ChartTooltip: () => null }));

const { SpendByObjectiveStream } = await import('./SpendByObjectiveStream');

afterEach(() => {
  cleanup();
  areas.length = 0;
});

const portfolio = (over: Partial<PortfolioListItem>): PortfolioListItem =>
  ({
    id: over.id ?? 'p',
    name: 'P',
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 100,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 1,
    pending_recommendations: 0,
    ...over,
  }) as PortfolioListItem;

const rows = [
  { date: '2026-09-10', objective: 'purchase', spend: 300 },
  { date: '2026-09-11', objective: 'purchase', spend: 320 },
  { date: '2026-09-11', objective: 'lead', spend: 80 },
];

describe('SpendByObjectiveStream', () => {
  it('draws one stacked layer per objective and a legend of the latest day', () => {
    const { getByTestId, container } = render(
      <SpendByObjectiveStream currency="USD" portfolios={[]} rows={rows} today="2026-09-11" />,
    );
    expect(getByTestId('area-chart')).toBeTruthy();
    // largest running sum drawn first (at the back)
    expect(areas).toEqual(['s1', 's0']);
    const text = container.textContent ?? '';
    expect(text).toContain('Spent Sep 11');
    expect(text).toContain('Purchase');
    expect(text).toContain('80%');
    expect(text).toContain('$320');
    expect(text).toContain('Lead');
    expect(text).toContain('20%');
  });

  it('falls back to the planned split when there is no spend history yet', () => {
    const { queryByTestId, container } = render(
      <SpendByObjectiveStream
        currency="USD"
        portfolios={[
          portfolio({ id: 'a', objective: 'lead', daily_total: 300 }),
          portfolio({ id: 'b', objective: 'purchase', daily_total: 100 }),
        ]}
        rows={[]}
        today="2026-09-11"
      />,
    );
    expect(queryByTestId('area-chart')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('draws after the first scored cycle');
    expect(text).toContain('Planned per day');
    expect(text).toContain('75%');
    expect(text).toContain('$300');
  });

  it('the legend filters: click toggles, "show all" clears', () => {
    const onFilter = mock((_objective: string | null) => {});
    const { getByRole } = render(
      <SpendByObjectiveStream
        currency="USD"
        filter="purchase"
        onFilter={onFilter}
        portfolios={[]}
        rows={rows}
        today="2026-09-11"
      />,
    );
    fireEvent.click(getByRole('button', { name: /Lead/ }));
    expect(onFilter).toHaveBeenLastCalledWith('lead');
    fireEvent.click(getByRole('button', { name: /Purchase/ }));
    expect(onFilter).toHaveBeenLastCalledWith(null);
    fireEvent.click(getByRole('button', { name: /Show all portfolios/ }));
    expect(onFilter).toHaveBeenLastCalledWith(null);
  });
});
