import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { ContextMetricCard, MetricDeltaText } from './CampaignTimelineWorkspace';

// The timeline workspace paints five period-over-period deltas, and every one of them used
// to test the sign: `delta >= 0 ? green : red`. Two of the seven KPI columns it cycles
// through are CPC and CPA, where the good move is DOWNWARDS — those rendered red on the
// good news. These assert the colour for a rise and a fall on both polarities, and that the
// printed sign still follows the number rather than the judgement.

describe('MetricDeltaText', () => {
  afterEach(cleanup);

  it('colours a rising ROAS green and a falling one red', () => {
    const { rerender } = render(<MetricDeltaText metric="roas" deltaPct={12.5} />);
    expect(screen.getByText('+12.50%').className).toContain('text-emerald-600');
    rerender(<MetricDeltaText metric="roas" deltaPct={-12.5} />);
    expect(screen.getByText('-12.50%').className).toContain('text-rose-600');
  });

  it('colours a FALLING CPA green and a rising one red', () => {
    const { rerender } = render(<MetricDeltaText metric="cpa" deltaPct={-12.5} />);
    expect(screen.getByText('-12.50%').className).toContain('text-emerald-600');
    rerender(<MetricDeltaText metric="cpa" deltaPct={12.5} />);
    expect(screen.getByText('+12.50%').className).toContain('text-rose-600');
  });

  it('colours a falling CPC green too', () => {
    render(<MetricDeltaText metric="cpc" deltaPct={-4} />);
    expect(screen.getByText('-4.00%').className).toContain('text-emerald-600');
  });

  it('never flips the sign — the colour is the judgement, the sign is the fact', () => {
    const { rerender } = render(<MetricDeltaText metric="cpa" deltaPct={-9} />);
    expect(screen.getByText('-9.00%')).toBeDefined();
    rerender(<MetricDeltaText metric="cpa" deltaPct={9} />);
    expect(screen.getByText('+9.00%')).toBeDefined();
  });
});

describe('ContextMetricCard', () => {
  afterEach(cleanup);

  const noop = () => {};

  it('colours a rising ROAS pill green and a falling one red', () => {
    const { rerender } = render(
      <ContextMetricCard metric="roas" value={2.4} delta={8} selected={false} onClick={noop} />,
    );
    expect(screen.getByText(/8\.00%/).className).toContain('text-emerald-600');
    rerender(
      <ContextMetricCard metric="roas" value={2.4} delta={-8} selected={false} onClick={noop} />,
    );
    expect(screen.getByText(/8\.00%/).className).toContain('text-rose-600');
  });

  it('colours a FALLING CPA pill green and a rising one red', () => {
    const { rerender } = render(
      <ContextMetricCard metric="cpa" value={14} delta={-8} selected={false} onClick={noop} />,
    );
    const fell = screen.getByText(/8\.00%/);
    expect(fell.className).toContain('text-emerald-600');
    expect(fell.textContent).toBe('-8.00%');

    rerender(
      <ContextMetricCard metric="cpa" value={14} delta={8} selected={false} onClick={noop} />,
    );
    const rose = screen.getByText(/8\.00%/);
    expect(rose.className).toContain('text-rose-600');
    expect(rose.textContent).toBe('+8.00%');
  });
});
