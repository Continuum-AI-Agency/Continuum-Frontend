import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import {
  buildMetrics,
  EASY_FIT_MP1,
  GOOGLE_TOTALS,
  META_ONLY,
  META_TOTALS,
} from './__fixtures__/accountPlatformMetrics';
import {
  AllPlatformsHeadline,
  AllPlatformsSubline,
  AllPlatformsTiles,
  PlatformMetricsSection,
} from './AccountPlatformsOverview';
import { MultiPlatformUnavailable } from './MultiPlatformUnavailable';

afterEach(cleanup);

function tile(container: HTMLElement, testId: string): string {
  const node = container.querySelector(`[data-testid="${testId}"]`);
  if (!node) throw new Error(`no tile ${testId}`);
  return node.textContent ?? '';
}

describe('AllPlatformsHeadline', () => {
  it('says the account spend, each kind with its cheapest platform, and decisions', () => {
    const { getByTestId } = render(<AllPlatformsHeadline metrics={EASY_FIT_MP1} />);
    expect(getByTestId('overview-headline').textContent).toBe(
      'The account spent 38,411 MXN in 7 days across three platforms: conversations at 39.95 MXN on Meta, leads at 36.83 MXN, cheapest on Google at 31.40 MXN and 0 purchases. 6 decisions waiting.',
    );
  });

  it('names each currency on its own and no cross-currency total', () => {
    const frame = buildMetrics([
      { ...META_TOTALS, share_of_spend: null },
      {
        ...GOOGLE_TOTALS,
        currency: 'USD',
        share_of_spend: null,
        accounts: [{ account_id: 'g', currency: 'USD', ingested: true }],
      },
    ]);
    const { getByTestId } = render(<AllPlatformsHeadline metrics={frame} />);
    const text = getByTestId('overview-headline').textContent ?? '';
    expect(text).toStartWith(
      'The account spent 23,911 MXN and $11,200 in 7 days across two platforms.',
    );
    expect(text).not.toContain('35,111');
  });

  it('carries the window and the top-spend fact on the sub-line', () => {
    const { container } = render(<AllPlatformsSubline metrics={EASY_FIT_MP1} />);
    expect(container.textContent).toContain('Meta takes 62% of the spend');
    expect(container.textContent).toContain('attribution: what each platform reports');
  });
});

describe('AllPlatformsTiles', () => {
  it('renders spend with shares, each kind, decisions and autopilot — six tiles', () => {
    const onOpenActions = mock(() => {});
    const { container, getByTestId } = render(
      <AllPlatformsTiles metrics={EASY_FIT_MP1} onOpenActions={onOpenActions} />,
    );
    const tiles = getByTestId('account-tiles');
    expect(tiles.getAttribute('data-source')).toBe('account-platform-metrics');
    expect(tile(container, 'tile-spend')).toContain('38,411 MXN');
    expect(tile(container, 'tile-spend')).toContain('Meta 62% · Google 29% · TikTok 9%');
    expect(tile(container, 'tile-kind-conversations')).toContain('Conversations · Meta');
    expect(tile(container, 'tile-kind-conversations')).toContain('516');
    expect(tile(container, 'tile-kind-leads')).toContain('Leads · 3 platforms');
    expect(tile(container, 'tile-kind-leads')).toContain('214');
    expect(tile(container, 'tile-kind-leads')).toContain('Google cheapest at 31.40 MXN');
    expect(tile(container, 'tile-kind-purchases')).toContain('75.60 MXN spent, no results');
    expect(tile(container, 'tile-decisions')).toContain('6');
    expect(tile(container, 'tile-autopilot')).toContain('4 of 5');
    expect(tile(container, 'tile-autopilot')).toContain('1 recommend, do not apply');
    expect(container.querySelector('[data-testid="tile-platforms"]')).toBeNull();
    fireEvent.click(within(getByTestId('tile-decisions')).getByText('Review'));
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it('adds a platforms tile when fewer than four would show', () => {
    const empty = buildMetrics(
      [{ ...META_TOTALS, share_of_spend: 1, results_by_kind: [], unclassified_spend: 23911 }],
      { decisions_waiting: 0, autopilot: { on: 0, total: 0 } },
    );
    const { container } = render(<AllPlatformsTiles metrics={empty} onOpenActions={() => {}} />);
    expect(tile(container, 'tile-platforms')).toContain('1 of 3');
    expect(tile(container, 'tile-decisions')).toContain('nothing waits for your decision');
    expect(tile(container, 'tile-autopilot')).toContain('no active portfolio');
  });

  it('shows each currency in the spend tile and no shares across currencies', () => {
    const frame = buildMetrics([
      { ...META_TOTALS, share_of_spend: null },
      {
        ...GOOGLE_TOTALS,
        currency: 'USD',
        share_of_spend: null,
        accounts: [{ account_id: 'g', currency: 'USD', ingested: true }],
      },
    ]);
    const { container } = render(<AllPlatformsTiles metrics={frame} onOpenActions={() => {}} />);
    expect(tile(container, 'tile-spend')).toContain('23,911 MXN · $11,200');
    expect(tile(container, 'tile-spend')).not.toContain('%');
  });
});

describe('AllPlatformsTiles — the per-platform second line (feature 04)', () => {
  const breakdownOf = (container: HTMLElement, testId: string) =>
    container.querySelector(`[data-testid="${testId}"] [data-testid="tile-breakdown"]`)
      ?.textContent ?? null;

  it('splits a result bought on several platforms by platform, under the cost line', () => {
    const { container } = render(
      <AllPlatformsTiles metrics={EASY_FIT_MP1} onOpenActions={() => {}} />,
    );
    expect(breakdownOf(container, 'tile-kind-leads')).toBe(
      'Meta · 78 · Google · 118 · TikTok · 18',
    );
  });

  it('omits the line when one platform alone bought the result', () => {
    const { container } = render(
      <AllPlatformsTiles metrics={EASY_FIT_MP1} onOpenActions={() => {}} />,
    );
    expect(breakdownOf(container, 'tile-kind-conversations')).toBeNull();
    expect(breakdownOf(container, 'tile-kind-purchases')).toBeNull();
    expect(breakdownOf(container, 'tile-spend')).toBeNull();
  });
});

describe('PlatformMetricsSection', () => {
  it("renders Google's own tiles from the same producer", () => {
    const { container, getByTestId } = render(
      <PlatformMetricsSection metrics={EASY_FIT_MP1} platform="google_ads" />,
    );
    expect(getByTestId('platform-headline').textContent).toBe(
      'Google spent 11,200 MXN in 7 days (29% of the account): 118 leads at 31.40 MXN.',
    );
    expect(tile(container, 'platform-tile-spend')).toContain('29% of the account');
    expect(tile(container, 'platform-tile-kind-leads')).toContain('118');
    expect(tile(container, 'platform-tile-kind-leads')).toContain('prev. 33.10 MXN');
    expect(tile(container, 'platform-tile-unclassified')).toContain('7,495 MXN');
    expect(container.textContent).toContain('every campaign of the connected accounts');
  });

  it("renders TikTok's tiles, and Meta's coverage as its portfolios", () => {
    const tiktok = render(<PlatformMetricsSection metrics={EASY_FIT_MP1} platform="tiktok_ads" />);
    expect(tiktok.getByTestId('platform-headline').textContent).toContain('TikTok spent 3,300 MXN');
    expect(tile(tiktok.container, 'platform-tile-spend')).toContain('+10% on the period before');
    cleanup();
    const meta = render(<PlatformMetricsSection metrics={EASY_FIT_MP1} platform="meta" />);
    expect(meta.container.textContent).toContain('counts what its portfolios hold');
  });

  it('renders nothing for a platform that is not connected', () => {
    const { container } = render(
      <PlatformMetricsSection metrics={META_ONLY} platform="tiktok_ads" />,
    );
    expect(container.textContent).toBe('');
  });

  it('says a connected platform with nothing read yet, with no figures', () => {
    const frame = buildMetrics([
      { ...META_TOTALS, share_of_spend: null },
      {
        ...GOOGLE_TOTALS,
        spend: null,
        share_of_spend: null,
        prior_spend: null,
        spend_delta_pct: null,
        unclassified_spend: null,
        results_by_kind: [],
        accounts: [{ account_id: 'g', currency: 'MXN', ingested: false }],
      },
    ]);
    const { getByTestId, queryByTestId } = render(
      <PlatformMetricsSection metrics={frame} platform="google_ads" />,
    );
    expect(getByTestId('platform-headline').textContent).toBe(
      'Google is connected, but nothing has been read from it yet.',
    );
    expect(queryByTestId('platform-tiles-google_ads')).toBeNull();
  });
});

describe('PlatformMetricsSection — currency', () => {
  it('says once that the currency is unknown when the read carries none', () => {
    const frame = buildMetrics([
      { ...META_TOTALS, share_of_spend: null },
      { ...GOOGLE_TOTALS, currency: null, share_of_spend: null },
    ]);
    const { getByTestId } = render(
      <PlatformMetricsSection metrics={frame} platform="google_ads" />,
    );
    const section = getByTestId('platform-metrics-google_ads').textContent ?? '';
    expect(section.match(/currency not reported/g)?.length).toBe(1);
  });

  it('says nothing about the currency when the read names it', () => {
    const frame = buildMetrics([META_TOTALS, GOOGLE_TOTALS]);
    const { getByTestId } = render(
      <PlatformMetricsSection metrics={frame} platform="google_ads" />,
    );
    expect(getByTestId('platform-metrics-google_ads').textContent).not.toContain(
      'currency not reported',
    );
  });

  it("says the live figures below are the platform's own read when the Optimizer has not read it", () => {
    const frame = buildMetrics([
      META_TOTALS,
      { ...GOOGLE_TOTALS, spend: null, share_of_spend: null, results_by_kind: [] },
    ]);
    const { getByTestId, queryByTestId } = render(
      <PlatformMetricsSection liveBelow metrics={frame} platform="google_ads" />,
    );
    expect(getByTestId('platform-reading-note').textContent).toBe(
      "The live figures below come straight from Google. The Optimizer's own reading of Google starts once a portfolio holds Google campaigns.",
    );
    expect(queryByTestId('platform-headline')).toBeNull();
  });
});

describe('MultiPlatformUnavailable', () => {
  it('says the numbers are not available yet, with no figure', () => {
    const { getByTestId } = render(<MultiPlatformUnavailable detail="Meta's are below." />);
    expect(getByTestId('multiplatform-unavailable').textContent).toBe(
      "Multi-platform numbers aren't available yet. Meta's are below.",
    );
  });
});
