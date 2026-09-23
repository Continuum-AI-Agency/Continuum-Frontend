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
import { AccountLeadCard, type DeliveryPoint, peakDay, readDelivery } from './AccountLeadCard';

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

  // ── The headline vocabulary ───────────────────────────────────────────────
  // Money per day is the ranking scale, not the finding. The card leads with what the
  // detector actually found and drops the money to the line every card shares.

  it('leads with the detector’s own figure, not with the money it is priced at', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            id: 'portfolio_reallocation:p1>p2',
            detector: 'portfolio_reallocation',
            impact_class: 'better_price',
            headline: {
              kind: 'efficiency',
              value: 33,
              unit: 'percent',
              label: 'cheaper per result',
              from: 90,
              to: 60,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const figure = getByTestId('account-lead-figure').textContent ?? '';
    expect(figure).toContain('33%');
    expect(figure).toContain('cheaper per result');
    // The percentage is printed as it arrived. A renderer that multiplies is one that will
    // one day be handed a figure that was multiplied already.
    expect(figure).not.toContain('3300');
    expect(figure).not.toContain('$102');
  });

  it('keeps the money as the support line every card shares — day AND month', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            headline: {
              kind: 'avoided',
              value: 102,
              unit: 'currency_per_day',
              label: 'a day buying nothing',
              from: null,
              to: null,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const money = getByTestId('account-lead-money').textContent ?? '';
    expect(money).toContain('$102/day');
    // 102 × 30, the same thirty days the budget wizard normalises against.
    expect(money).toContain('$3,060/mo');
    expect(money).toContain('purchases');
  });

  it('draws the two sides only when the detector declared both of them', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <AccountLeadCard
        candidates={[
          candidate({
            headline: {
              kind: 'efficiency',
              value: 33,
              unit: 'percent',
              label: 'cheaper per result',
              from: 90,
              to: 60,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-lead-sides').textContent).toContain('90% → 60%');

    rerender(
      <AccountLeadCard
        candidates={[
          candidate({
            headline: {
              kind: 'share',
              value: 92,
              unit: 'percent',
              label: 'of spend on one platform',
              from: null,
              to: null,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(queryByTestId('account-lead-sides')).toBeNull();
  });

  it('still reads as finished when a detector holds no headline — money leads, month follows', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    const figure = getByTestId('account-lead-figure').textContent ?? '';
    expect(figure).toContain('$102');
    expect(figure).toContain('/day');
    // The support line carries the month alone: repeating the day would be the same money twice.
    const money = getByTestId('account-lead-money').textContent ?? '';
    expect(money).toContain('$3,060/mo');
    expect(money).not.toContain('/day');
    expect(money).toContain('purchases');
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

// A fortnight of real-shaped days: a steady first week, a lighter second one, so the two
// halves the card compares are actually different numbers.
const days = (spend: number[]): DeliveryPoint[] =>
  spend.map((value, index) => ({
    date: new Date(Date.UTC(2026, 8, 8 + index)).toISOString().slice(0, 10),
    spend: value,
  }));

const FORTNIGHT = days([300, 300, 300, 300, 300, 300, 300, 200, 200, 200, 200, 200, 200, 200]);

// The same fortnight with one day that is nothing like the others: the 13th day (Sep 20)
// spent 520 against an average of 273, and that is the day a reader wants named.
const SWINGY = days([300, 300, 300, 300, 300, 300, 300, 200, 200, 200, 200, 200, 520, 200]);

describe('AccountLeadCard — a quiet day is not an empty day', () => {
  it('leads with what the account is doing, never with a count of our own checks', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
      />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.getAttribute('data-mode')).toBe('quiet');

    const figure = getByTestId('account-lead-figure');
    // The last seven days of the series, not 18 of 20 checks.
    expect(figure.textContent).toContain('$200');
    expect(figure.textContent).toContain('a day, last 7 days');
    expect(figure.getAttribute('data-reading')).toBe('window');

    // And nowhere on the card is a check count printed at headline size.
    const headline = card.querySelector('.text-3xl');
    expect(headline?.textContent).toBe('$200');
  });

  // The owner's complaint, pinned: the card may report how results and spend are going, and
  // it may not report how many checks were reviewed. "22 of 25 checks asked", "3 could not
  // run" and "Every check ran" were three rows of the product describing itself.
  it('never counts its own checks anywhere on the card', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
        mix={{ basis: 'spent', days: 14, slices: [{ label: 'Leads', share: 100 }] }}
      />,
    );
    const text = getByTestId('account-lead-card').textContent ?? '';
    expect(text).not.toMatch(/checks?/i);
    expect(text).not.toContain('could not run');
    expect(text).not.toContain('Nothing is waiting on us');
    expect(text).not.toContain('found nothing');
  });

  it('says which way the account moved, against the window before it', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
      />,
    );
    const trend = getByTestId('account-lead-trend').textContent ?? '';
    expect(trend).toContain('$300');
    expect(trend).toContain('the 7 days before');
    // 200 against 300 is a third less, and the direction is stated rather than implied.
    expect(trend).toContain('-33%');
    // Both figures the direction came from, so the verdict can be checked.
    expect(trend).toContain('$200 a day now');
  });

  it('reads the delivery against the plan, and states the plan it was read against', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
      />,
    );
    const pacing = getByTestId('account-lead-pacing').textContent ?? '';
    expect(pacing).toContain('50% of plan');
    expect(pacing).toContain('$400 a day planned');
  });

  it('names the day that strayed furthest from the account’s own average', () => {
    const { getByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={1200} delivery={SWINGY} />,
    );
    const peak = getByTestId('account-lead-peak').textContent ?? '';
    expect(peak).toContain('Sep 20');
    expect(peak).toContain('$520');
    // 520 against a 14-day average of 272.86 — up 91%, against the whole series, not the week.
    expect(peak).toContain('+91%');
    expect(peak).toContain('14-day average');
  });

  it('says what the money is split across, and whether that is spend or plan', () => {
    const { getByTestId, rerender } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        mix={{
          basis: 'spent',
          days: 14,
          slices: [
            { label: 'Leads', share: 62 },
            { label: 'Purchases', share: 38 },
          ],
        }}
      />,
    );
    let mix = getByTestId('account-lead-mix').textContent ?? '';
    expect(mix).toContain('Leads · 62%');
    expect(mix).toContain('Purchases 38%');
    expect(mix).toContain('of spend, last 14 days');

    // Before the first snapshot there is only the plan, and the row must not call it spend.
    rerender(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        mix={{ basis: 'planned', slices: [{ label: 'Conversations', share: 59 }] }}
      />,
    );
    mix = getByTestId('account-lead-mix').textContent ?? '';
    expect(mix).toContain('Conversations · 59%');
    expect(mix).toContain('of the daily plan');
    expect(mix).not.toContain('spend');
  });

  it('holds the mix back when nothing carries any money', () => {
    const { queryByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={1200} mix={null} />,
    );
    expect(queryByTestId('account-lead-mix')).toBeNull();
  });

  it('draws the window, because a shape is the one thing the three figures cannot carry', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
      />,
    );
    const drawn = getByTestId('account-lead-delivery');
    // The series it actually spent, against the plan drawn as the line it is read against.
    expect(drawn.textContent).toContain('Spent a day');
    expect(getByTestId('rates-reference').textContent).toContain('Planned $400');
    expect(drawn.querySelectorAll('[data-point]')).toHaveLength(14);
  });

  it('falls back to the scale the read measured itself at, and says so', () => {
    const { getByTestId, queryByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={1200} plannedPerDay={2400} />,
    );
    const figure = getByTestId('account-lead-figure');
    expect(figure.textContent).toContain('$1,200');
    expect(figure.textContent).toContain('a day across this account');
    expect(figure.getAttribute('data-reading')).toBe('scale');
    // No series, so nothing to draw, no direction to claim, and no odd day to name.
    expect(queryByTestId('account-lead-delivery')).toBeNull();
    expect(queryByTestId('account-lead-trend')).toBeNull();
    expect(queryByTestId('account-lead-peak')).toBeNull();
    // The pacing still stands: the read's own scale against the plan is a real comparison.
    expect(getByTestId('account-lead-pacing').textContent).toContain('50% of plan');
  });

  it('holds the pacing back when there is no plan to read anything against', () => {
    const { queryByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={1200} plannedPerDay={0} />,
    );
    expect(queryByTestId('account-lead-pacing')).toBeNull();
  });

  it('prints no figure at all when neither a series nor a scale was measured', () => {
    const { queryByTestId, getByTestId } = render(
      <AccountLeadCard candidates={[]} currency="USD" dailySpend={null} />,
    );
    expect(queryByTestId('account-lead-figure')).toBeNull();
    expect(getByTestId('account-lead-card').textContent).toContain('Nothing worth moving today');
  });

  it('can be seated inside a larger surface without a second border', () => {
    const { getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        className="rounded-none border-0 border-b"
        currency="USD"
        dailySpend={1200}
      />,
    );
    const card = getByTestId('account-lead-card');
    expect(card.className).toContain('rounded-none');
    expect(card.className).not.toContain('rounded-lg');
  });
});

// The odd day, away from the DOM: which day the card is allowed to single out.
describe('peakDay', () => {
  it('names the day furthest from the average of the whole series, signed', () => {
    const peak = peakDay(readDelivery(SWINGY));
    expect(peak?.date).toBe('2026-09-20');
    expect(peak?.spend).toBe(520);
    expect(peak?.deltaPct).toBe(91);
    expect(peak?.days).toBe(14);
  });

  it('names a trough as readily as a spike', () => {
    const peak = peakDay(readDelivery(days([300, 300, 300, 300, 40, 300, 300])));
    expect(peak?.date).toBe('2026-09-12');
    expect(peak?.deltaPct).toBeLessThan(0);
  });

  it('has no outlier to name on a series too short to average', () => {
    expect(peakDay(readDelivery(days([100, 300])))).toBeNull();
    expect(peakDay(null)).toBeNull();
  });
});

// The reading itself, away from the DOM: what the card is allowed to claim it measured.
describe('readDelivery', () => {
  it('compares the last window against the one before it', () => {
    const reading = readDelivery(FORTNIGHT);
    expect(reading?.perDay).toBe(200);
    expect(reading?.priorPerDay).toBe(300);
    expect(reading?.deltaPct).toBe(-33);
    expect(reading?.days).toBe(7);
  });

  it('refuses to read a window that spent nothing — zeros are how an empty series looks', () => {
    expect(readDelivery(days([0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readDelivery([])).toBeNull();
    expect(readDelivery(null)).toBeNull();
  });

  it('holds the direction back when there is no window before this one', () => {
    const reading = readDelivery(days([100, 120, 140]));
    expect(reading?.days).toBe(2);
    expect(reading?.perDay).toBe(130);
    expect(reading?.priorPerDay).toBeNull();
    expect(reading?.deltaPct).toBeNull();
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

  it('still breathes exactly one rule on a quiet day, chart and all', () => {
    const { container, getByTestId } = render(
      <AccountLeadCard
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        delivery={FORTNIGHT}
        plannedPerDay={400}
      />,
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
