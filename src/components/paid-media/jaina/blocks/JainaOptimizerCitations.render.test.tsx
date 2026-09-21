/**
 * The wiring, not the card: does a citation reach `OptimizerCardBlock` with figures resolved
 * from the read it NAMES, and does it reach the fallbacks when it cannot.
 *
 * `resolutionFrom` is the whole decision and is pure, so it is asserted directly. The render
 * pass then proves the resolver is actually handed to the block — a correct resolver nobody
 * passes is exactly the shape of the bug this task existed to fix.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

import { type CitedRead, resolutionFrom } from '@/lib/jaina/optimizerCitedRead';
import { OptimizerCardBlock } from './OptimizerCardBlock';

afterEach(cleanup);

const candidate = (over: Partial<AccountCandidate> = {}): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'dead_tail:acct',
    detector: 'dead_tail',
    impact_per_day: 102,
    impact_class: 'recoverable',
    impact_basis: '2 ad sets with 0 results in 7 days',
    result_label: 'purchases',
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

const storedRead = (over: Partial<CitedRead> = {}): CitedRead => ({
  id: 'read-abc',
  utc_day: '2026-09-20',
  read: { candidates: [candidate()], guards: [], currency: 'USD' },
  ...over,
});

describe('a citation resolves against the read it names', () => {
  it('finds the candidate, its date and its currency', () => {
    const { resolve, readDate, currency } = resolutionFrom(storedRead(), 'read-abc');

    expect(resolve('dead_tail:acct')?.impact_per_day).toBe(102);
    expect(readDate).toBe('20 Sep');
    expect(currency).toBe('USD');
  });

  it('resolves a guard as readily as a candidate — a cited guard is still cited', () => {
    const read = storedRead({
      read: {
        candidates: [],
        guards: [
          candidate({ id: 'measurement_integrity:acct', detector: 'measurement_integrity' }),
        ],
        currency: 'USD',
      },
    });

    expect(resolutionFrom(read, 'read-abc').resolve('measurement_integrity:acct')).not.toBeNull();
  });

  it('resolves NOTHING and claims NO date when the loaded read is a different one', () => {
    // The answer cites Tuesday's read; what loaded is today's. Drawing today's figures under
    // Tuesday's sentence is the exact failure the read_id exists to prevent, so the card goes
    // to its cleared line instead — and the footer must not claim a date it does not have.
    const { resolve, readDate } = resolutionFrom(storedRead(), 'read-from-tuesday');

    expect(resolve('dead_tail:acct')).toBeNull();
    expect(readDate).toBeNull();
  });

  it('resolves nothing when no read has loaded yet', () => {
    expect(resolutionFrom(null, 'read-abc').resolve('dead_tail:acct')).toBeNull();
  });

  it('answers null for a candidate the read no longer holds', () => {
    expect(resolutionFrom(storedRead(), 'read-abc').resolve('budget_drift:acct')).toBeNull();
  });
});

describe('what the block draws with that resolver', () => {
  const draw = (
    read: CitedRead | null,
    readId: string,
    card: { read_id: string; candidate_ids: string[]; size: 'chip' | 'card' | 'strip' },
  ) => {
    const resolution = resolutionFrom(read, readId);
    return render(
      <OptimizerCardBlock
        card={card}
        currency={resolution.currency}
        readDate={resolution.readDate}
        resolve={resolution.resolve}
      />,
    );
  };

  it('draws the resolved card with the cited read s date in the footer', () => {
    const { getByTestId } = draw(storedRead(), 'read-abc', {
      read_id: 'read-abc',
      candidate_ids: ['dead_tail:acct'],
      size: 'card',
    });

    const host = getByTestId('optimizer-card');
    expect(host.textContent).toContain('Spending on nothing');
    expect(host.textContent).toContain('read of 20 Sep');
  });

  it('draws the cleared line rather than nothing when the read has moved on', () => {
    const { getByTestId } = draw(storedRead(), 'read-from-tuesday', {
      read_id: 'read-from-tuesday',
      candidate_ids: ['dead_tail:acct'],
      size: 'card',
    });

    expect(getByTestId('optimizer-cleared').textContent).toContain('cleared');
  });

  it('picks the chip renderer for a chip', () => {
    const { getByTestId } = draw(storedRead(), 'read-abc', {
      read_id: 'read-abc',
      candidate_ids: ['dead_tail:acct'],
      size: 'chip',
    });

    expect(getByTestId('optimizer-chip').tagName).toBe('BUTTON');
  });

  it('picks the strip renderer for three', () => {
    const read = storedRead({
      read: {
        candidates: [candidate({ id: 'a:1' }), candidate({ id: 'b:2' }), candidate({ id: 'c:3' })],
        guards: [],
        currency: 'USD',
      },
    });
    const { getByTestId } = draw(read, 'read-abc', {
      read_id: 'read-abc',
      candidate_ids: ['a:1', 'b:2', 'c:3'],
      size: 'strip',
    });

    expect(getByTestId('optimizer-strip')).toBeTruthy();
  });

  it('names the bug for a size/count mismatch instead of half-drawing it', () => {
    const { getByTestId } = draw(storedRead(), 'read-abc', {
      read_id: 'read-abc',
      candidate_ids: ['dead_tail:acct'],
      size: 'strip',
    });

    expect(getByTestId('optimizer-malformed')).toBeTruthy();
  });
});
