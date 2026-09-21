import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

// A live switch rather than a constant: the calm rhythm and its reduced-motion fallback are
// two behaviours of the same card, and a mock that can only express one of them cannot pin
// the rule that "nothing moves when the reader asked for nothing to move".
const motionPref = { reduce: false };

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate, ...rest } = props;
      return React.createElement(tag, {
        ...rest,
        // The variant label the card asked for, surfaced so a test can read it.
        'data-anim': typeof animate === 'string' ? animate : undefined,
        ref,
      });
    });
  return {
    motion: { section: passthrough('section'), span: passthrough('span'), div: passthrough('div') },
    useReducedMotion: () => motionPref.reduce,
  };
});

import type { AccountCandidate } from '@continuum/contracts';
import { accountCandidateSchema, LINE_BUDGET } from '@continuum/contracts';
import { AccountLeadCard } from './AccountLeadCard';

afterEach(cleanup);
beforeEach(() => {
  motionPref.reduce = false;
});

const candidate = (over: Partial<AccountCandidate> = {}): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'dead_tail:a1',
    detector: 'dead_tail',
    impact_per_day: 102,
    impact_class: 'recoverable',
    impact_basis: '2 ad sets with 0 results in 7 days, together spending 102/day',
    result_label: 'purchases',
    chart: null,
    ...over,
  });

const guard = (over: Partial<AccountCandidate> = {}): AccountCandidate =>
  candidate({
    id: 'measurement_integrity:acct',
    detector: 'measurement_integrity',
    impact_per_day: 9000,
    impact_basis: 'purchase absent from 2 sibling campaigns for 31 hours',
    ...over,
  });

// ---------------------------------------------------------------------------
// STATE ONE — something fired, and the card is about the single best of them.
// ---------------------------------------------------------------------------

describe('AccountLeadCard — a lead was found', () => {
  it('leads with the single most valuable thing across the account', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            id: 'testing_discipline:acct',
            detector: 'testing_discipline',
            impact_per_day: 80,
            impact_class: 'deferred',
          }),
          candidate({}),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.getAttribute('data-mode')).toBe('lead');
    // The catalogue's own label for the detector, not a word invented on this screen.
    expect(card.textContent).toContain('Spending on nothing');
    expect(getByTestId('account-lead-foot').textContent).toContain('dead_tail');
  });

  it('ranks by the discounted value, the way the catalogue ranks', () => {
    // 100 deferred is worth 40 against 90 recoverable, so the smaller raw figure leads.
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            id: 'testing_discipline:acct',
            detector: 'testing_discipline',
            impact_per_day: 100,
            impact_class: 'deferred',
          }),
          candidate({ impact_per_day: 90 }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-lead-foot').textContent).toContain('dead_tail');
  });

  it('states what it is worth per day, and what one result is called', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    const figure = getByTestId('account-lead-figure').textContent ?? '';
    expect(figure).toContain('102');
    expect(figure).toContain('/day');
    expect(figure).toContain('purchases');
  });

  it('says what that figure BUYS — the kind of money, and the rung it sits on', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[candidate({})]}
        currency="USD"
        dailySpend={1200}
        objective="lead"
      />,
    );
    const buys = getByTestId('account-lead-buys').textContent ?? '';
    expect(buys).toContain('Recoverable now');
    // $102 of a lead is not $102 of revenue, and the card must not let them read alike.
    expect(buys).toContain('a person, not revenue');
    expect(buys).not.toContain('carries revenue');
  });

  it('holds the rung line back when nobody said what this account buys', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    expect(getByTestId('account-lead-buys').textContent).not.toContain('not revenue');
  });

  it('says how sure it is, and what that reading is made of', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            confidence: 0.62,
            evidence: { spend_per_day: 102, results_7d: 0, interval_high: 840 },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const sure = getByTestId('account-lead-sure').textContent ?? '';
    expect(sure).toContain('Fair');
    expect(sure).toContain('62%');
    // The two terms `seedConfidence` actually multiplies — and no invented third one.
    expect(sure).toContain('3 figures compared');
    expect(sure).toContain('how well this objective predicts');
  });

  it('names the one action it implies, from the detector’s own family', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[candidate({ state: 'recommend' })]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const act = getByTestId('account-lead-do').textContent ?? '';
    expect(act).toContain('Structure changes');
    expect(act).toContain('waits on you');
  });

  it('says nothing about what will happen when nobody has been asked', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    const act = getByTestId('account-lead-do').textContent ?? '';
    expect(act).toContain('Structure changes');
    expect(act).not.toContain('waits on you');
    expect(act).not.toContain('acts on its own');
  });

  it('names the family standing in the way when the choice was lowered', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[candidate({ state: 'recommend', state_lowered: true })]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-lead-lowered').textContent).toContain('does not allow it yet');
  });

  it('sends the reader where the action lives', () => {
    const onOpenPortfolio = mock((_id: string) => {});
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[candidate({ cta: { kind: 'portfolio', target_id: 'pf_1' } })]}
        currency="USD"
        dailySpend={1200}
        onOpenPortfolio={onOpenPortfolio}
      />,
    );
    fireEvent.click(getByTestId('account-lead-cta'));
    expect(onOpenPortfolio).toHaveBeenCalledWith('pf_1');
  });

  it('explains a figure smaller than the gap, rather than reading as a weak one', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[candidate({ capped_by: 'velocity' })]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-lead-cap').textContent).toContain('per-cycle limit');
  });

  it('reads a detector nobody has seen on this screen straight from the catalogue', () => {
    // The point of the card is the whole catalogue, not the three that happen to be common.
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            id: 'platform_diversification:acct',
            detector: 'platform_diversification',
            impact_class: 'deferred',
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.textContent).toContain('One auction is one point of failure');
    expect(card.textContent).toContain('spend share by platform');
    expect(getByTestId('account-lead-do').textContent).toContain('Structure changes');
  });

  it('keeps its one line inside the budget the compiled frame settled on', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            id: 'seasonality:acct',
            detector: 'seasonality',
            impact_class: 'deferred',
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const card = getByTestId('account-lead-card');
    // `seasonality.compares` is 92 characters; the card may not print it whole.
    const line = [...card.querySelectorAll('p')]
      .map((node) => node.textContent ?? '')
      .find((text) => text.startsWith('the window ahead'));
    expect(line).toBeTruthy();
    expect((line ?? '').length).toBeLessThanOrEqual(LINE_BUDGET);
    expect(line).toContain('…');
  });
});

// ---------------------------------------------------------------------------
// STATE TWO — nothing fired. A quiet day is a reading, not a blank.
// ---------------------------------------------------------------------------

describe('AccountLeadCard — a quiet day is not an empty day', () => {
  it('prints what was checked as a figure, not as one grey sentence', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        deck={{ applies: 20, total: 25 }}
        starved={[
          { detector: 'audience_overlap', missing: 'true overlap needs a Meta call' },
          { detector: 'seasonality', missing: 'a new account has nothing to compare against' },
        ]}
      />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.getAttribute('data-mode')).toBe('quiet');
    const figure = getByTestId('account-lead-figure').textContent ?? '';
    expect(figure).toContain('18');
    expect(figure).toContain('checks asked');
    expect(getByTestId('account-lead-checked').textContent).toContain('18 of 20 ran');
  });

  it('says what would change it, grouped by the thing that unblocks it', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        deck={{ applies: 20, total: 25 }}
        starved={[
          { detector: 'audience_overlap', missing: 'true overlap needs a Meta call' },
          { detector: 'account_saturation', missing: 'net reach deduplicated across portfolios' },
          { detector: 'target_economics', missing: 'neither margin nor lifetime value is stored' },
        ]}
      />,
    );
    const blocked = getByTestId('account-lead-blocked').textContent ?? '';
    expect(blocked).toContain('3 could not run');
    // Two detectors waiting on the same platform call are one decision, not two defects.
    expect(blocked).toContain('A platform call we do not make yet');
    expect(blocked).toContain('Unit economics');
  });

  it('says so plainly when nothing at all was blocked', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        deck={{ applies: 25, total: 25 }}
      />,
    );
    const blocked = getByTestId('account-lead-blocked').textContent ?? '';
    expect(blocked).toContain('Nothing is waiting on us');
    expect(getByTestId('account-lead-checked').textContent).toContain('25 of 25 ran');
  });

  it('still stands on a read written before the worker carried a deck', () => {
    const { getByTestId, queryByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={1200} />,
    );
    expect(queryByTestId('account-lead-figure')).toBeNull();
    expect(getByTestId('account-lead-checked').textContent).toContain(
      'Every check that applies here ran',
    );
    expect(getByTestId('account-lead-card').textContent).toContain('Nothing worth moving today');
  });
});

// ---------------------------------------------------------------------------
// STATE THREE — a guard fired. It qualifies the figure, or it replaces it.
// ---------------------------------------------------------------------------

describe('AccountLeadCard — a guard is present', () => {
  it('strips the guard over a lead that still stands, and says the figure reads against it', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[guard(), candidate({})]} currency="USD" dailySpend={1200} />,
    );
    const card = getByTestId('account-lead-card');
    // A guard's huge figure must never become the lead.
    expect(card.getAttribute('data-mode')).toBe('lead');
    expect(getByTestId('account-lead-foot').textContent).toContain('dead_tail');
    const strip = getByTestId('account-lead-guard');
    expect(strip.textContent).toContain('The figures cannot be trusted');
    expect(strip.textContent).toContain('reads against it');
    // And the doubt is repeated where confidence is claimed, not only in the strip.
    expect(getByTestId('account-lead-doubted').textContent).toContain('casts doubt');
  });

  it('says when the guard has no bearing on the figure beside it', () => {
    // target_economics doubts what is compared against a target; dead_tail is not that.
    const { getByTestId, queryByTestId } = render(
      <AccountLeadCard
        candidates={[
          guard({ id: 'target_economics:acct', detector: 'target_economics' }),
          candidate({}),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-lead-guard').textContent).toContain('does not bear on');
    expect(queryByTestId('account-lead-doubted')).toBeNull();
  });

  it('becomes the whole card when nothing else fired', () => {
    const { getByTestId, queryByTestId } = render(
      <AccountLeadCard candidates={[guard()]} currency="USD" dailySpend={1200} />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.getAttribute('data-mode')).toBe('guard');
    expect(card.textContent).toContain('The figures cannot be trusted');
    expect(card.textContent).toContain('31 hours');
    expect(getByTestId('account-lead-foot').textContent).toContain('Guard · measurement_integrity');
    // No strip — the guard is not qualifying anything, it IS the card.
    expect(queryByTestId('account-lead-guard')).toBeNull();
  });

  it('names the checks a guard poisons, or it is decoration', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[guard()]} currency="USD" dailySpend={1200} />,
    );
    const affects = getByTestId('account-lead-affects').textContent ?? '';
    expect(affects).toContain('5 checks read against it');
    expect(affects).toContain('Spending on nothing');
    expect(affects).toContain('Move budget between portfolios');
    // Measurement reports; it approves nothing and has no switch to offer.
    expect(getByTestId('account-lead-do').textContent).toContain('Approves nothing');
  });
});

// ---------------------------------------------------------------------------
// The register: one element moves, on a calm cycle, and only if motion is wanted.
// ---------------------------------------------------------------------------

describe('AccountLeadCard — the calm rhythm', () => {
  it('breathes exactly one rule, and nothing else', () => {
    const { container, getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    expect(getByTestId('account-lead-rule').getAttribute('data-anim')).toBe('calm');
    expect(container.querySelectorAll('[data-anim="calm"]')).toHaveLength(1);
  });

  it('holds everything still when the reader asked for stillness', () => {
    motionPref.reduce = true;
    const { container, getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    expect(getByTestId('account-lead-rule').getAttribute('data-anim')).toBe('still');
    expect(container.querySelectorAll('[data-anim="calm"]')).toHaveLength(0);
  });
});
