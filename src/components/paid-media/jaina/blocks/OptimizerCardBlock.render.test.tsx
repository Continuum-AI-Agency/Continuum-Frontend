import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AccountCandidate } from '@continuum/contracts';
import { accountCandidateSchema, jainaOptimizerCardSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
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

const part = (over: Record<string, unknown> = {}) =>
  jainaOptimizerCardSchema.parse({
    read_id: 'read_2026_09_20',
    candidate_ids: ['dead_tail:acct'],
    size: 'card',
    ...over,
  });

const resolves = (c: AccountCandidate | null) => () => c;

describe('a citation renders from the stored read, not from the model', () => {
  it('draws the card and its chart', () => {
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part()}
        currency="USD"
        readDate="20 Sep"
        resolve={resolves(candidate())}
      />,
    );
    const host = getByTestId('optimizer-card');
    // Only one of the seven shapes draws in SVG; an interval is composed of elements. Assert
    // on the reading line the chart is required to carry, which every shape emits.
    expect(host.textContent).toContain('the estimate with its uncertainty');
    expect(host.textContent).toContain('Spending on nothing');
  });

  it('always says which read it is quoting — a citation without a date lies', () => {
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part()}
        currency="USD"
        readDate="20 Sep"
        resolve={resolves(candidate())}
      />,
    );
    expect(getByTestId('optimizer-card').textContent).toContain('read of 20 Sep');
  });

  it('speaks the objective’s own word, resolved upstream', () => {
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part()}
        currency="USD"
        readDate="20 Sep"
        resolve={resolves(candidate({ result_label: 'conversations' }))}
      />,
    );
    expect(getByTestId('optimizer-card').textContent).toContain('conversations');
  });

  it('says why a figure is smaller than the gap, when something capped it', () => {
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part()}
        currency="USD"
        readDate="20 Sep"
        resolve={resolves(candidate({ capped_by: 'guardrail' }))}
      />,
    );
    expect(getByTestId('optimizer-card').textContent).toContain('Capped by a guardrail');
  });
});

describe('a citation that no longer resolves still renders', () => {
  it('says it cleared instead of vanishing', () => {
    // Vanishing takes the answer's evidence with it and leaves prose that looks invented —
    // worse than being stale, because the reader cannot tell it happened.
    const { getByTestId, queryByTestId } = render(
      <OptimizerCardBlock
        card={part()}
        currency="USD"
        readDate="20 Sep"
        resolve={resolves(null)}
      />,
    );
    expect(getByTestId('optimizer-cleared').textContent).toContain('cleared');
    expect(queryByTestId('optimizer-card')).toBeTruthy();
  });

  it('keeps the other two when one of a strip has cleared', () => {
    const { getAllByTestId, container } = render(
      <OptimizerCardBlock
        card={part({ size: 'strip', candidate_ids: ['a:1', 'b:2', 'c:3'] })}
        currency="USD"
        readDate="20 Sep"
        resolve={(id) => (id === 'b:2' ? null : candidate({ id }))}
      />,
    );
    expect(getAllByTestId('optimizer-cleared')).toHaveLength(1);
    expect(container.textContent).toContain('Spending on nothing');
  });
});

describe('the three sizes', () => {
  it('renders a chip inline, and opens the read when tapped', () => {
    const onOpenRead = mock();
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part({ size: 'chip' })}
        currency="USD"
        onOpenRead={onOpenRead}
        readDate="20 Sep"
        resolve={resolves(candidate())}
      />,
    );
    const chip = getByTestId('optimizer-chip');
    expect(chip.tagName).toBe('BUTTON');
    fireEvent.click(chip);
    expect(onOpenRead).toHaveBeenCalledWith('read_2026_09_20');
  });

  it('renders a strip of exactly three', () => {
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part({ size: 'strip', candidate_ids: ['a:1', 'b:2', 'c:3'] })}
        currency="USD"
        readDate="20 Sep"
        resolve={(id) => candidate({ id })}
      />,
    );
    const strip = getByTestId('optimizer-strip');
    const readings = strip.textContent?.match(/the estimate with its uncertainty/g) ?? [];
    expect(readings).toHaveLength(3);
  });

  it('refuses to half-render a malformed citation', () => {
    // A strip carrying one id is a bug upstream. Rendering a one-third strip would hide it.
    const { getByTestId } = render(
      <OptimizerCardBlock
        card={part({ size: 'strip', candidate_ids: ['a:1'] })}
        currency="USD"
        readDate="20 Sep"
        resolve={(id) => candidate({ id })}
      />,
    );
    expect(getByTestId('optimizer-malformed')).toBeTruthy();
  });
});
