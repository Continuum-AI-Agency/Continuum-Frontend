import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import {
  buildAggregatedMetricsContext,
  MetricCardDelta,
  MetricValue,
} from './CampaignAdSetWorkspace';

// Both the campaign row and the ad-set row of this workspace render a metric card per KPI —
// CPC and CPA included — and the change chip under each used to test `changePct >= 0`. A
// cost that fell, which is the outcome the whole optimiser is trying to produce, rendered in
// the destructive colour.

describe('MetricCardDelta', () => {
  afterEach(cleanup);

  it('colours a rising ROAS green and a falling one destructive', () => {
    const { rerender } = render(<MetricCardDelta metric="roas" changePct={9.2} />);
    expect(screen.getByText('+9.2%').className).toContain('text-emerald-600');
    rerender(<MetricCardDelta metric="roas" changePct={-9.2} />);
    expect(screen.getByText('-9.2%').className).toContain('text-destructive');
  });

  it('colours a FALLING CPA green and a rising one destructive', () => {
    const { rerender } = render(<MetricCardDelta metric="cpa" changePct={-9.2} />);
    const fell = screen.getByText('-9.2%');
    expect(fell.className).toContain('text-emerald-600');
    expect(fell.className).not.toContain('text-destructive');

    rerender(<MetricCardDelta metric="cpa" changePct={9.2} />);
    const rose = screen.getByText('+9.2%');
    expect(rose.className).toContain('text-destructive');
  });

  it('colours a falling CPC green too', () => {
    render(<MetricCardDelta metric="cpc" changePct={-2.5} />);
    expect(screen.getByText('-2.5%').className).toContain('text-emerald-600');
  });

  it('stays quiet when there is no change to judge', () => {
    render(<MetricCardDelta metric="cpa" changePct={null} />);
    expect(screen.getByText('No change data').className).toContain('text-muted-foreground');
  });
});

// A Google campaign whose goals name no single result arrives with cpa null (edge
// result_basis.unambiguous false). Scale must print "—" with the reason, never $0.00.
describe('Scale workspace — null CPA', () => {
  afterEach(cleanup);

  const base = { spend: 79.82, roas: 0, ctr: 3, cpc: 1.25, impressions: 2100, clicks: 64 };

  it('prints "—" with the reason and stamps no figure', () => {
    render(
      <MetricValue
        className=""
        scope="dashboard.campaigns"
        metric="cpa"
        value={null}
        currency="MXN"
        dayCount={7}
      />,
    );
    const node = screen.getByTitle('No single result defined');
    expect(node.textContent).toBe('— No single result defined');
    expect(node.getAttribute('data-figure')).toBeNull();
  });

  it('still prints a real CPA in the account currency', () => {
    render(
      <MetricValue
        className=""
        scope="dashboard.campaigns"
        metric="cpa"
        value={79.82}
        currency="MXN"
        dayCount={7}
      />,
    );
    expect(screen.getByText('$79.82 MXN')).toBeTruthy();
  });

  it('keeps the selection CPA null when no selected campaign has one', () => {
    const context = buildAggregatedMetricsContext([
      {
        metrics: { ...base, cpa: null },
        trends: [{ date: '2026-10-20', spend: 79.82, cpa: null }],
      },
    ]);
    expect(context?.metrics.cpa).toBeNull();
  });
});
