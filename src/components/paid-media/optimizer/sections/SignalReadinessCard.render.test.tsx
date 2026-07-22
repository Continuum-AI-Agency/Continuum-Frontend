import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { AdSetSnapshot } from '@continuum/contracts';
import { HISTORY_CONFIDENT_DAYS } from '../preview/signalReadiness';
import { SignalReadinessCard } from './SignalReadinessCard';

afterEach(cleanup);

function snap(over: {
  id: string;
  kpiField?: AdSetSnapshot['kpiField'];
  days?: number;
  d14?: Partial<AdSetSnapshot['windows']['d14']>;
}): AdSetSnapshot {
  const zeroWindow = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  const daily = Array.from({ length: over.days ?? 0 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    ...zeroWindow,
  }));
  return {
    id: over.id,
    status: 'active',
    currentBudget: 100,
    ageDays: over.days ?? 0,
    kpiField: over.kpiField,
    windows: { d3: { ...zeroWindow }, d7: { ...zeroWindow }, d14: { ...zeroWindow, ...over.d14 } },
    daily,
  };
}

describe('SignalReadinessCard', () => {
  it('null-renders when there are no snapshots', () => {
    const { container } = render(<SignalReadinessCard snapshots={[]} objective="purchase" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a ready state in a success tone', () => {
    const snapshots = [
      snap({
        id: 'a',
        kpiField: 'purchases',
        days: HISTORY_CONFIDENT_DAYS,
        d14: { purchases: 10 },
      }),
    ];
    const { container, getByText } = render(
      <SignalReadinessCard snapshots={snapshots} objective="purchase" />,
    );
    expect(getByText('ready')).toBeTruthy();
    expect(container.innerHTML).toContain('bg-success');
    expect(container.textContent).toContain('Scoring on purchases');
  });

  it('renders thin_history with the confidence-window nudge in a warning tone', () => {
    const snapshots = [snap({ id: 'a', days: 4, d14: { purchases: 6 } })];
    const { container, getByText } = render(
      <SignalReadinessCard snapshots={snapshots} objective="purchase" />,
    );
    expect(getByText('thin history')).toBeTruthy();
    expect(container.innerHTML).toContain('bg-warning');
    expect(container.textContent).toContain('4 days of history');
    expect(container.textContent).toContain(`${HISTORY_CONFIDENT_DAYS} needed`);
  });

  it('names the currency mismatch and its objective KPI', () => {
    const snapshots = [
      snap({ id: 'a', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 40 } }),
      snap({ id: 'b', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 30 } }),
      snap({ id: 'c', kpiField: 'purchases', days: 20, d14: { purchases: 4 } }),
    ];
    const { container, getByText } = render(
      <SignalReadinessCard snapshots={snapshots} objective="purchase" />,
    );
    expect(getByText('currency mismatch')).toBeTruthy();
    expect(container.textContent).toContain('optimize for a different result than purchases');
    expect(container.innerHTML).toContain('bg-warning');
  });

  it('explains no_signal as a tracking gap, not an outage', () => {
    const snapshots = [snap({ id: 'a', kpiField: 'purchases', days: 20, d14: { purchases: 0 } })];
    const { container, getByText } = render(
      <SignalReadinessCard snapshots={snapshots} objective="purchase" />,
    );
    expect(getByText('no signal')).toBeTruthy();
    expect(container.textContent).toContain('No tracked purchases');
    expect(container.innerHTML).toContain('bg-warning');
  });

  it('uses the objective-derived KPI label (conversations, not CPA)', () => {
    const snapshots = [snap({ id: 'a', days: 3, d14: { conversations: 5 } })];
    const { container } = render(
      <SignalReadinessCard snapshots={snapshots} objective="conversations" />,
    );
    expect(container.textContent).toContain('Scoring on conversations');
  });
});

// The "nothing movable" verdict prescribes converting a campaign to ad-set
// budgets. That section can sit several screens below, so the diagnosis shipped
// as advice with no way to act on it. The card now takes the affordance.
describe('SignalReadinessCard — reaching the prescribed remedy', () => {
  const unmovable = [
    snap({ id: 'a', kpiField: 'purchases', days: 20, d14: { purchases: 5 } }),
    snap({ id: 'b', kpiField: 'purchases', days: 20, d14: { purchases: 5 } }),
  ].map((snapshot) => ({ ...snapshot, currentBudget: 0, freezeReason: 'unsupported_budget' }));

  it('renders the caller-supplied affordance beside the verdict', () => {
    const { getByRole, getByText } = render(
      <SignalReadinessCard
        action={<button type="button">Show 2 CBO campaigns</button>}
        objective="purchase"
        snapshots={unmovable as AdSetSnapshot[]}
      />,
    );

    expect(getByText('nothing movable')).toBeTruthy();
    expect(getByRole('button', { name: 'Show 2 CBO campaigns' })).toBeTruthy();
  });

  it('still states the diagnosis when no affordance is supplied', () => {
    const { container, queryByRole } = render(
      <SignalReadinessCard objective="purchase" snapshots={unmovable as AdSetSnapshot[]} />,
    );

    expect(container.textContent).toContain('no daily budget of their own');
    expect(queryByRole('button')).toBeNull();
  });
});
