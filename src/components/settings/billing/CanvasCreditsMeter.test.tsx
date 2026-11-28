import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { CanvasCreditsView } from '@/lib/billing/billingViewModel';
import { CanvasCreditsMeter } from './CanvasCreditsMeter';

afterEach(cleanup);

// The billingViewModel "available sums …" period: 312 included used, 250 rollover, 2,000
// purchased, 37 credits ($0.37) billed to the card against a $100 cap. Noon UTC keeps the
// reset date the same day in every test-runner time zone.
const PERIOD: CanvasCreditsView = {
  availableCredits: 688 + 250 + 2000,
  includedCredits: 1000,
  includedUsedCredits: 312,
  includedRemainingCredits: 688,
  rolloverCredits: 250,
  purchasedCredits: 2000,
  overageCredits: 37,
  overageUsd: 0.37,
  overageCapUsd: 100,
  billsOverageToCard: true,
  periodEnd: '2026-11-21T12:00:00.000Z',
};

const row = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('li')].find((li) => li.textContent?.includes(name))?.textContent;

describe('CanvasCreditsMeter', () => {
  it('shows the available balance and the reset date', () => {
    const { getByTestId, container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    expect(getByTestId('canvas-credits-available').textContent).toBe('2,938');
    expect(container.textContent).toContain('credits available · resets Nov 21');
  });

  it('splits the balance into rollover, included and purchased rows, in credits and USD', () => {
    const { container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    expect(row(container, 'Rollover')).toBe('Rollover250$2.50');
    expect(row(container, 'Included')).toBe('Included688$6.88');
    expect(row(container, 'Purchased')).toBe('Purchased2,000$20.00');
  });

  it('labels the stacked split in credits, never tokens', () => {
    const { getByRole, container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    const split = getByRole('meter', { name: 'Canvas credits by model' });
    expect(split.getAttribute('aria-valuenow')).toBe('2938');
    expect(split.getAttribute('aria-valuetext')).toBe(
      'Rollover 250 credits, Included 688 credits, Purchased 2,000 credits',
    );
    expect(container.textContent).not.toContain('tokens');
  });

  it('meters the included allowance: 312 of 1,000 used', () => {
    const { getByRole, container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    expect(container.textContent).toContain('312 of 1,000 included used');
    expect(getByRole('meter', { name: 'Budget used' }).getAttribute('aria-valuetext')).toBe(
      '$3.12 of $10.00 (31%)',
    );
  });

  it('says the included credits are used up, not "over budget", once they are', () => {
    const { container } = render(
      <CanvasCreditsMeter
        credits={{ ...PERIOD, includedUsedCredits: 1000, includedRemainingCredits: 0 }}
      />,
    );
    expect(container.textContent).toContain('Included credits used up');
    expect(container.textContent).not.toContain('Over budget');
  });

  it('shows the overage billed to the card against its cap', () => {
    const { getByTestId, container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    expect(container.textContent).toContain('Billed to card this period');
    expect(getByTestId('canvas-credits-overage').textContent).toBe('$0.37 of $100');
    expect(container.textContent).toContain(
      'billed to your card at $0.01 per credit, up to $100 a month.',
    );
  });

  it('renders no daily chart: billing-api has no per-day series', () => {
    const { queryByRole, container } = render(<CanvasCreditsMeter credits={PERIOD} />);
    expect(queryByRole('group')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('Last ');
  });

  it('without an included bucket: no budget bar or reset date, packs and overage still shown', () => {
    const { getByTestId, queryByRole, container } = render(
      <CanvasCreditsMeter
        credits={{
          ...PERIOD,
          availableCredits: 1000,
          includedCredits: 0,
          includedUsedCredits: 0,
          includedRemainingCredits: 0,
          rolloverCredits: 0,
          purchasedCredits: 1000,
          overageCredits: 0,
          overageUsd: 0,
          overageCapUsd: null,
          billsOverageToCard: false,
          periodEnd: null,
        }}
      />,
    );
    expect(getByTestId('canvas-credits-available').textContent).toBe('1,000');
    expect(queryByRole('meter', { name: 'Budget used' })).toBeNull();
    expect(container.textContent).not.toContain('resets');
    expect(getByTestId('canvas-credits-overage').textContent).toBe('$0');
    expect(container.textContent).toContain('generation pauses until you buy a pack');
  });
});
