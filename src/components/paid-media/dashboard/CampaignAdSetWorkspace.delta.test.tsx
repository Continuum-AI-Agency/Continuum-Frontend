import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MetricCardDelta } from './CampaignAdSetWorkspace';

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
