import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import {
  buildMetrics,
  EASY_FIT_MP1,
  GOOGLE_TOTALS,
  META_ONLY,
  META_TOTALS,
} from './__fixtures__/accountPlatformMetrics';
import {
  COMPARISON_PREFERENCE_KEY,
  readComparisonHidden,
  writeComparisonHidden,
} from './comparisonPreference';
import { PlatformComparisonRow } from './PlatformComparisonRow';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const TWO_CURRENCIES = buildMetrics([
  { ...META_TOTALS, share_of_spend: null },
  {
    ...GOOGLE_TOTALS,
    currency: 'USD',
    share_of_spend: null,
    accounts: [{ account_id: 'g', currency: 'USD', ingested: true }],
  },
]);

describe('PlatformComparisonRow — the columns', () => {
  it('shows one column per connected platform, Meta, Google, TikTok', () => {
    const { getAllByTestId } = render(<PlatformComparisonRow metrics={EASY_FIT_MP1} />);
    expect(
      getAllByTestId('comparison-column').map((node) => node.getAttribute('data-platform')),
    ).toEqual(['meta', 'google_ads', 'tiktok_ads']);
  });

  it('gives every column the same four figures in the same order', () => {
    const { getAllByTestId } = render(<PlatformComparisonRow metrics={EASY_FIT_MP1} />);
    const labels = getAllByTestId('comparison-column').map((column) =>
      [...column.querySelectorAll('dt')].map((node) => node.textContent),
    );
    for (const columnLabels of labels) {
      expect(columnLabels).toEqual(['Spend · 7 days', 'Leads', 'Cost per lead', 'Share of leads']);
    }
    const google = getAllByTestId('comparison-column')[1];
    expect([...(google?.querySelectorAll('dd') ?? [])].map((node) => node.textContent)).toEqual([
      '11,200 MXN',
      '118',
      '31.40 MXN',
      '55%',
    ]);
  });

  it('names the cheapest in a sentence and with a word in its column, not by colour', () => {
    const { getByTestId, getAllByTestId } = render(
      <PlatformComparisonRow metrics={EASY_FIT_MP1} />,
    );
    expect(getByTestId('comparison-sentence').textContent).toBe(
      'Google buys leads cheapest: 31.40 MXN per lead, against 41.30 MXN on Meta and 53.00 MXN on TikTok.',
    );
    const marked = getAllByTestId('comparison-cheapest');
    expect(marked).toHaveLength(1);
    expect(marked[0]?.closest('[data-platform]')?.getAttribute('data-platform')).toBe('google_ads');
    expect(marked[0]?.textContent).toBe('· cheapest');
  });

  it('totals the account in its one currency, and every column says its currency', () => {
    const { getByTestId, getAllByTestId } = render(
      <PlatformComparisonRow metrics={EASY_FIT_MP1} />,
    );
    expect(getByTestId('comparison-totals').textContent).toBe(
      'All platforms: 38,411 MXN · 214 leads · 36.83 MXN per lead',
    );
    expect(getAllByTestId('comparison-currency').map((node) => node.textContent)).toEqual([
      'MXN',
      'MXN',
      'MXN',
    ]);
  });

  it('with two currencies says so and shows no totals, no share and no cheapest', () => {
    const { getByTestId, queryByTestId, getAllByTestId } = render(
      <PlatformComparisonRow metrics={TWO_CURRENCIES} />,
    );
    expect(getByTestId('comparison-sentence').textContent).toBe(
      'Meta bills in MXN and Google in USD, so their costs are not compared and nothing is added up.',
    );
    expect(getByTestId('comparison-no-totals').textContent).toBe(
      'No totals: the platforms bill in different currencies.',
    );
    expect(queryByTestId('comparison-totals')).toBeNull();
    expect(queryByTestId('comparison-cheapest')).toBeNull();
    expect(getAllByTestId('comparison-currency').map((node) => node.textContent)).toEqual([
      'MXN',
      'USD',
    ]);
    const google = getAllByTestId('comparison-column')[1];
    expect(google?.textContent).toContain('$11,200');
    expect(google?.textContent).not.toContain('MXN');
    expect(getByTestId('platform-comparison').textContent).not.toContain('35,111');
  });

  it('renders nothing with a single connected platform', () => {
    const { container } = render(<PlatformComparisonRow metrics={META_ONLY} />);
    expect(container.textContent).toBe('');
  });
});

describe('PlatformComparisonRow — the toggle', () => {
  it('hides the row, remembers it for this viewer, and brings it back', () => {
    const first = render(<PlatformComparisonRow metrics={EASY_FIT_MP1} />);
    fireEvent.click(first.getByTestId('comparison-toggle'));
    expect(first.queryByTestId('platform-comparison')).toBeNull();
    expect(window.localStorage.getItem(COMPARISON_PREFERENCE_KEY)).toBe('hidden');
    first.unmount();

    const second = render(<PlatformComparisonRow metrics={EASY_FIT_MP1} />);
    expect(second.queryByTestId('platform-comparison')).toBeNull();
    expect(second.getByTestId('comparison-toggle').textContent).toBe('Show platforms side by side');
    fireEvent.click(second.getByTestId('comparison-toggle'));
    expect(second.getByTestId('platform-comparison')).toBeTruthy();
    expect(window.localStorage.getItem(COMPARISON_PREFERENCE_KEY)).toBe('shown');
  });

  it('shows the row when storage throws, and the toggle still works for the visit', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const { getByTestId, queryByTestId } = render(
        <PlatformComparisonRow metrics={EASY_FIT_MP1} />,
      );
      expect(getByTestId('platform-comparison')).toBeTruthy();
      act(() => fireEvent.click(getByTestId('comparison-toggle')));
      expect(queryByTestId('platform-comparison')).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('comparisonPreference', () => {
  it('reads hidden only from its own key, and survives a store that throws', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readComparisonHidden(fake)).toBe(false);
    writeComparisonHidden(true, fake);
    expect(readComparisonHidden(fake)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readComparisonHidden(broken)).toBe(false);
    expect(() => writeComparisonHidden(true, broken)).not.toThrow();
    expect(readComparisonHidden(null)).toBe(false);
  });
});
