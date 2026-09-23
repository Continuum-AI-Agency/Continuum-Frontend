import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AccountCandidate } from '@continuum/contracts';
import { ACCOUNT_DETECTOR_META, accountCandidateSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AccountRead } from './AccountRead';

afterEach(cleanup);

const candidate = (over: Partial<AccountCandidate>): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'dead_tail:a1',
    detector: 'dead_tail',
    impact_per_day: 102,
    impact_class: 'recoverable',
    impact_basis: '2 ad sets with 0 results in 7 days, together spending 102/day',
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

describe('AccountRead', () => {
  it('leads with the highest ranked card and draws its chart', () => {
    const { container, getByText } = render(
      <AccountRead
        candidates={[
          candidate({}),
          candidate({
            id: 'portfolio_reallocation:p1>p2',
            detector: 'portfolio_reallocation',
            impact_per_day: 66.67,
            impact_class: 'better_price',
            impact_basis: '200/day moved from a portfolio at 90 to one at 60, which is 33% cheaper',
            chart: {
              shape: 'transfer',
              from: { label: 'Prospecting', cost_per_result: 90, spend_per_day: 900 },
              to: { label: 'Retargeting', cost_per_result: 60, spend_per_day: 300 },
              movable_per_day: 200,
              saving_per_day: 66.67,
            },
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const cards = container.querySelectorAll('[data-detector]');
    expect(cards).toHaveLength(2);
    // 102 recoverable outranks 66.67 at a better price.
    expect(cards[0]?.getAttribute('data-detector')).toBe('dead_tail');
    expect(getByText('Spending on nothing')).toBeTruthy();
    // The card states the real money, not the discounted value the ranking used.
    expect(container.textContent).toContain('102');
    expect(container.textContent).toContain('Recoverable now');
  });

  it('puts a guard above the list and keeps it out of the ranking', () => {
    const { container } = render(
      <AccountRead
        candidates={[
          candidate({}),
          candidate({
            id: 'measurement_integrity:act_1',
            detector: 'measurement_integrity',
            impact_per_day: 9000,
            impact_basis: '3 campaigns spending with no events recorded',
          }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const guard = container.querySelector('[data-guard="measurement_integrity"]');
    expect(guard).toBeTruthy();
    expect(guard?.textContent).toContain('no events recorded');
    // A guard with a huge figure must not become the lead card.
    const cards = container.querySelectorAll('[data-detector]');
    expect([...cards].map((c) => c.getAttribute('data-detector'))).toEqual(['dead_tail']);
  });

  it('names the checks that could not run, so silence is not read as health', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({})]}
        currency="USD"
        dailySpend={1200}
        starved={[
          { detector: 'target_economics', missing: 'nobody has told us what a result is worth' },
        ]}
      />,
    );
    expect(container.textContent).toContain('1 check could not run today');
    expect(container.textContent).toContain('what a result is worth');
  });

  // ── The headline vocabulary, on the ranked list ────────────────────────────
  // The RANK is untouched — `rankAccountCandidates` still orders on money. What changes is
  // what a row says first, and a screen where every row leads with "$X/day" says the same
  // small sentence twenty-five times and buries the finding underneath it.

  it('leads a row with the detector’s own figure and keeps money as the support line', () => {
    const { getByTestId } = render(
      <AccountRead
        candidates={[
          candidate({
            id: 'portfolio_reallocation:p1>p2',
            detector: 'portfolio_reallocation',
            impact_per_day: 66.67,
            impact_class: 'better_price',
            result_label: 'leads',
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
    const row = getByTestId('account-lead');
    expect(row.textContent).toContain('33%');
    expect(row.textContent).toContain('cheaper per result');
    expect(row.textContent).toContain('90% → 60%');
    expect(row.textContent).toContain('$66.67/day · $2,000/mo');
    expect(row.textContent).toContain('leads');
  });

  it('still reads as finished for a detector holding no headline — money leads', () => {
    const { getByTestId } = render(
      <AccountRead candidates={[candidate({})]} currency="USD" dailySpend={1200} />,
    );
    const row = getByTestId('account-lead');
    expect(row.textContent).toContain('$102');
    expect(row.textContent).toContain('/day');
    // The month is the half the reader has not been given; the day is not said twice.
    expect(row.textContent).toContain('$3,060/mo');
  });

  it('keeps the ranking on money even when the headlines are not comparable', () => {
    const { getAllByTestId } = render(
      <AccountRead
        candidates={[
          candidate({
            id: 'platform_diversification:acct',
            detector: 'platform_diversification',
            impact_per_day: 40,
            impact_class: 'recoverable',
            // A big-looking percentage on a small amount of money must not overtake.
            headline: {
              kind: 'share',
              value: 92,
              unit: 'percent',
              label: 'of spend on one platform',
              from: null,
              to: null,
            },
          }),
          candidate({ impact_per_day: 400 }),
        ]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    const rows = getAllByTestId('account-lead');
    expect(rows[0]?.getAttribute('data-detector')).toBe('dead_tail');
  });

  // A quiet day used to open with "Nothing to move today — every check ran" and close with
  // "All 25 checks apply", beside a fold saying three could not run. The lead card above now
  // says how the account is doing; this may keep only the operator's footnotes.
  it('renders nothing at all on a quiet day with nothing to footnote', () => {
    const { container, queryByTestId } = render(
      <AccountRead candidates={[]} currency="USD" dailySpend={1200} />,
    );
    expect(queryByTestId('account-read')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('keeps only the footnotes on a quiet day — never a sentence about our own checks', () => {
    const { getByTestId } = render(
      <AccountRead
        candidates={[]}
        currency="USD"
        dailySpend={1200}
        starved={[
          { detector: 'target_economics', missing: 'nobody has told us what a result is worth' },
        ]}
      />,
    );
    const read = getByTestId('account-read');
    expect(read.getAttribute('data-quiet')).toBe('true');
    expect(read.textContent).not.toContain('Nothing to move today');
    expect(read.textContent).not.toContain('Every check ran');
    expect(read.textContent).not.toContain('checks apply');
    // The fold survives, as a footnote: no heading, no panel, one small line to open.
    const fold = getByTestId('account-starved');
    expect(fold.tagName).toBe('DETAILS');
    expect(fold.textContent).toContain('1 check could not run today');
    expect(read.querySelector('h2')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The zones: three lead, the rest behind a disclosure, the blocked list grouped.
// ---------------------------------------------------------------------------

const many = (n: number): AccountCandidate[] =>
  Array.from({ length: n }, (_, i) =>
    candidate({
      id: `dead_tail:a${i}`,
      // Descending impact so the ranking order is knowable without reimplementing it here.
      impact_per_day: 1000 - i * 10,
    }),
  );

describe('AccountRead — the three that lead', () => {
  it('shows exactly three, however many fired', () => {
    const { getAllByTestId } = render(
      <AccountRead candidates={many(9)} currency="USD" dailySpend={5000} />,
    );
    expect(getAllByTestId('account-lead')).toHaveLength(3);
  });

  it('shows all of them when fewer than three fired, and offers no disclosure', () => {
    const { getAllByTestId, queryByText } = render(
      <AccountRead candidates={many(2)} currency="USD" dailySpend={5000} />,
    );
    expect(getAllByTestId('account-lead')).toHaveLength(2);
    expect(queryByText(/more/)).toBeNull();
  });

  it('keeps the money class on a lead card — it is what says the rank was discounted', () => {
    const { container } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).toContain('Recoverable now');
  });
});

describe('AccountRead — the rest, behind one control', () => {
  it('hides the rest and prices what skipping it costs', () => {
    const { getByRole, queryAllByTestId } = render(
      <AccountRead candidates={many(6)} currency="USD" dailySpend={5000} />,
    );
    expect(queryAllByTestId('account-rest-row')).toHaveLength(0);
    const toggle = getByRole('button', { name: /3 more/ });
    // 970 + 960 + 950 = 2880 a day sits behind the control, and it says so.
    expect(toggle.textContent).toContain('2,880');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals them on demand', () => {
    const { getByRole, getAllByTestId } = render(
      <AccountRead candidates={many(6)} currency="USD" dailySpend={5000} />,
    );
    fireEvent.click(getByRole('button', { name: /3 more/ }));
    expect(getAllByTestId('account-rest-row')).toHaveLength(3);
  });
});

describe('AccountRead — a guard names what it poisons', () => {
  const guard = candidate({
    id: 'measurement_integrity:acct',
    detector: 'measurement_integrity',
    impact_class: 'recoverable',
    impact_basis: 'purchase absent from 2 sibling campaigns for 31 hours',
    chart: null,
  });

  it('marks the cards that read against the broken instrument', () => {
    const { container } = render(
      <AccountRead candidates={[guard, ...many(1)]} currency="USD" dailySpend={5000} />,
    );
    // dead_tail prices itself off a conversion count, so the guard casts doubt on it.
    expect(container.textContent).toContain('affected by the guard');
  });

  it('does not mark a card the guard has no bearing on', () => {
    const untouched = candidate({
      id: 'testing_discipline:acct',
      detector: 'testing_discipline',
      impact_class: 'deferred',
      chart: null,
    });
    const { container } = render(
      <AccountRead candidates={[guard, untouched]} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).not.toContain('affected by the guard');
  });
});

describe('AccountRead — the figure explains its own size', () => {
  it('says when a velocity cap, not the gap, set the number', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({ capped_by: 'velocity' })]}
        currency="USD"
        dailySpend={5000}
      />,
    );
    expect(container.textContent).toContain('per-cycle limit');
  });

  it('stays silent when nothing capped it', () => {
    const { container } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).not.toContain('per-cycle limit');
    expect(container.textContent).not.toContain('Capped by your guardrail');
  });
});

describe('AccountRead — what could not be asked, grouped by its blocker', () => {
  it('groups nine symptoms under the decisions that unblock them', () => {
    const { container } = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        starved={[
          { detector: 'audience_overlap', missing: 'true overlap needs a Meta call' },
          { detector: 'account_saturation', missing: 'net reach deduplicated across portfolios' },
          { detector: 'target_economics', missing: 'neither margin nor lifetime value is stored' },
        ]}
      />,
    );
    expect(container.textContent).toContain('3 checks could not run today');
    // The two that share one platform call appear under one heading, not two.
    expect(container.textContent).toContain('A platform call we do not make yet');
    expect(container.textContent).toContain('Unit economics');
  });

  it('orders a group by the catalogue, not by the order the worker happened to emit', () => {
    // The grouping is the contracts helper's, so two reads that starve on the same two
    // detectors read identically whichever order they arrived in.
    const { container } = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        starved={[
          { detector: 'account_saturation', missing: 'net reach deduplicated across portfolios' },
          { detector: 'audience_overlap', missing: 'true overlap needs a Meta call' },
        ]}
      />,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Two portfolios bidding on the same people')).toBeGreaterThan(-1);
    expect(text.indexOf('Two portfolios bidding on the same people')).toBeLessThan(
      text.indexOf('The account has run out of people'),
    );
  });

  it('still names a detector the catalogue has no blocker for', () => {
    // An older worker can name one; dropping the row would turn a gap into a clean screen.
    const { container } = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        starved={[{ detector: 'dead_tail', missing: 'the window had no spend in it' }]}
      />,
    );
    expect(container.textContent).toContain('Something else');
    expect(container.textContent).toContain('the window had no spend in it');
  });
});

describe('AccountRead — how far these figures sit from the money', () => {
  it('says the figures can be held against margin only when the account buys revenue', () => {
    const { getByTestId } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} objective="purchase" />,
    );
    expect(getByTestId('account-rung-note').textContent).toContain('margin');
  });

  it('says an attention buy is attention, so $/day is not read as money recovered', () => {
    const { getByTestId } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} objective="awareness" />,
    );
    const note = getByTestId('account-rung-note').textContent ?? '';
    expect(note).toContain('attention');
    expect(note).not.toContain('margin');
  });

  it('reads a custom conversion at its analog’s rung, never at the placeholder', () => {
    const { getByTestId } = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        objective="custom"
        objectiveAnalog="purchase"
      />,
    );
    expect(getByTestId('account-rung-note').textContent).toContain('margin');
  });

  it('stays silent when nobody said what this account buys', () => {
    const { queryByTestId } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(queryByTestId('account-rung-note')).toBeNull();
  });
});

describe('AccountRead — it does not count its own checks', () => {
  // "All 25 checks apply to what this account buys" was the deck note, and beside a fold
  // saying three could not run it read as a contradiction. Neither number is about the
  // account; the reader was asked not to be told how many checks were reviewed.
  it('prints no line about how many checks apply, on a busy day or a quiet one', () => {
    const busy = render(
      <AccountRead
        candidates={many(1)}
        currency="USD"
        dailySpend={5000}
        starved={[{ detector: 'target_economics', missing: 'neither margin nor lifetime value' }]}
      />,
    );
    expect(busy.container.textContent).not.toMatch(/checks apply/);
    expect(busy.container.textContent).not.toMatch(/All \d+ checks/);
    // The gap list still names the starved detector, for the operator who has to explain it.
    expect(busy.getByTestId('account-starved').textContent).toContain(
      ACCOUNT_DETECTOR_META.target_economics.label,
    );
    cleanup();

    const quiet = render(
      <AccountRead
        candidates={[]}
        currency="USD"
        dailySpend={5000}
        starved={[{ detector: 'target_economics', missing: 'neither margin nor lifetime value' }]}
      />,
    );
    expect(quiet.container.textContent).not.toMatch(/checks apply/);
    expect(quiet.container.textContent).not.toMatch(/Every check/);
  });
});

describe('AccountRead — the card says what it will actually do', () => {
  it('shows nothing when nobody has been asked', () => {
    // A read composed before approvals existed. "We did not look" is not "it recommends".
    const { container } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} />,
    );
    expect(container.textContent).not.toContain('Acts on its own');
    expect(container.textContent).not.toContain('does not allow it yet');
  });

  it('says so when a card acts unattended', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({ state: 'autopilot' })]}
        currency="USD"
        dailySpend={5000}
      />,
    );
    expect(container.textContent).toContain('Acts on its own');
  });

  it('names the family standing in the way when a choice was lowered', () => {
    // Without this, someone sets a detector to autopilot, watches nothing happen, and
    // concludes the switch is broken.
    const { getByTestId } = render(
      <AccountRead
        candidates={[candidate({ state: 'recommend', state_lowered: true })]}
        currency="USD"
        dailySpend={5000}
      />,
    );
    const note = getByTestId('state-lowered').textContent ?? '';
    expect(note).toContain('does not allow it yet');
    // dead_tail belongs to the structure family, and the reader is told which one to raise
    expect(note).toContain('Structure changes');
  });

  it('stays quiet on a plain recommend — the common case is not worth a line', () => {
    const { container } = render(
      <AccountRead
        candidates={[candidate({ state: 'recommend' })]}
        currency="USD"
        dailySpend={5000}
      />,
    );
    expect(container.textContent).not.toContain('Acts on its own');
    expect(container.textContent).not.toContain('does not allow it yet');
  });
});

describe('AccountRead — the control that would promote an insight from its own card', () => {
  // The control is hidden while `ADOPTING_A_DETECTOR_IS_ENFORCED` is false in AccountRead.tsx:
  // the state it writes is read only to LABEL the next report, and no apply path consults it.
  // This is the test that goes red if someone unhides the button before wiring enforcement.
  it('is offered nowhere — not on a lead card, not on a rest row', () => {
    const { container, getAllByTestId, getByRole } = render(
      <AccountRead
        candidates={Array.from({ length: 6 }, (_, i) =>
          candidate({ id: `dead_tail:h${i}`, impact_per_day: 1000 - i, state: 'recommend' }),
        )}
        currency="USD"
        dailySpend={5000}
        onSetState={mock()}
      />,
    );
    // The cards ARE on screen — otherwise the absence below proves nothing.
    expect(getAllByTestId('account-lead').length).toBe(3);
    fireEvent.click(getByRole('button', { name: /more ·/ }));
    expect(container.querySelectorAll('[data-testid="always-do-this"]').length).toBe(0);
    expect(container.textContent).not.toContain('Always do this');
  });
});

// Parked, not deleted: these are the behaviours the control had, and they are what has to pass
// again the day `ADOPTING_A_DETECTOR_IS_ENFORCED` flips to true.
describe.skip('AccountRead — promoting an insight from its own card', () => {
  it('offers the control and reports the detector and the new state', () => {
    // This is where autopilot gets adopted, once adoption means something. Nobody opens a
    // settings screen to decide they trust a recommendation; that happens looking at the card.
    const onSetState = mock();
    const { getByTestId } = render(
      <AccountRead
        candidates={[candidate({ state: 'recommend' })]}
        currency="USD"
        dailySpend={5000}
        onSetState={onSetState}
      />,
    );
    fireEvent.click(getByTestId('always-do-this'));
    expect(onSetState).toHaveBeenCalledWith('dead_tail', 'autopilot');
  });

  it('offers the way back out, with the opposite state', () => {
    const onSetState = mock();
    const { getByTestId } = render(
      <AccountRead
        candidates={[candidate({ state: 'autopilot' })]}
        currency="USD"
        dailySpend={5000}
        onSetState={onSetState}
      />,
    );
    expect(getByTestId('always-do-this').textContent).toContain('Stop doing this');
    fireEvent.click(getByTestId('always-do-this'));
    expect(onSetState).toHaveBeenCalledWith('dead_tail', 'recommend');
  });

  // This used `measurement_integrity`, which is a GUARD — `rankAccountCandidates` filters
  // guards out, so it renders no card at all and the assertion held whether or not the
  // measurement rule existed. Deleting the rule from `AlwaysDoThis` left the file green.
  // `decision_window` is measurement AND not a guard, so it actually renders a card.
  it('never offers it for a family that approves nothing', () => {
    const { getByTestId, queryByTestId } = render(
      <AccountRead
        candidates={[
          candidate({
            id: 'decision_window:x',
            detector: 'decision_window',
            state: 'recommend',
            chart: null,
          }),
        ]}
        currency="USD"
        dailySpend={5000}
        onSetState={mock()}
      />,
    );
    // The card IS on screen — otherwise the absence below proves nothing.
    expect(getByTestId('account-lead')).toBeTruthy();
    expect(queryByTestId('always-do-this')).toBeNull();
  });

  it('does offer it for a family that approves something, on the same path', () => {
    const { getByTestId } = render(
      <AccountRead
        candidates={[candidate({ id: 'dead_tail:x', detector: 'dead_tail', state: 'recommend' })]}
        currency="USD"
        dailySpend={5000}
        onSetState={mock()}
      />,
    );
    expect(getByTestId('always-do-this')).toBeTruthy();
  });

  it('never offers it when no state was resolved', () => {
    // Offering a control whose effect we cannot predict is worse than offering none.
    const { queryByTestId } = render(
      <AccountRead candidates={many(1)} currency="USD" dailySpend={5000} onSetState={mock()} />,
    );
    expect(queryByTestId('always-do-this')).toBeNull();
  });
});

describe('what the read assumed', () => {
  // A custom conversion is measured as the closest objective we actually backtested, and
  // every figure inherits that choice. Printing it is the only way a person can correct it.
  it('prints each assumption the worker made, on the normal read', () => {
    const { getByTestId } = render(
      <AccountRead
        assumptions={['Read as a signup: the event carries no revenue and arrives in 4 days.']}
        candidates={many(3)}
        currency="USD"
        dailySpend={5000}
      />,
    );
    expect(getByTestId('account-assumptions').textContent).toContain('Read as a signup');
  });

  // The empty read is a different render path, and the two must not disagree about what
  // was assumed — "nothing to move" is itself a conclusion that rests on the assumption.
  it('prints them on the empty read too', () => {
    const { getByTestId } = render(
      <AccountRead
        assumptions={['Read as a purchase: the event carries revenue.']}
        candidates={[]}
        currency="USD"
        dailySpend={1200}
      />,
    );
    expect(getByTestId('account-assumptions').textContent).toContain('Read as a purchase');
  });

  it('says nothing when nothing had to be assumed', () => {
    const { queryByTestId } = render(
      <AccountRead candidates={many(3)} currency="USD" dailySpend={5000} />,
    );
    expect(queryByTestId('account-assumptions')).toBeNull();
  });
});

// Every test above this point renders three candidates or fewer, so every card lands in a
// LeadColumn and nothing has ever rendered a RestRow. That is the exact shape of the defect
// this wave already shipped once: the approval control was added to both, its tests covered
// one, and the control rendered nowhere on the path they did not cover. Deleting StateNote
// and AlwaysDoThis from RestRow left this file green.
describe('the rest, behind the disclosure', () => {
  const withState = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      candidate({
        id: `dead_tail:r${i}`,
        impact_per_day: 1000 - i * 10,
        state: 'recommend',
        state_lowered: i === 4,
      }),
    );

  function openRest(candidates: AccountCandidate[], onSetState = mock()) {
    const view = render(
      <AccountRead
        candidates={candidates}
        currency="USD"
        dailySpend={5000}
        onSetState={onSetState}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: /more ·/ }));
    return view;
  }

  it('renders a row per candidate past the first three', () => {
    const { getAllByTestId } = openRest(withState(6));
    expect(getAllByTestId('account-rest-row').length).toBe(3);
  });

  // Parked with the control itself — see ADOPTING_A_DETECTOR_IS_ENFORCED in AccountRead.tsx.
  it.skip('offers the approval control on a rest row, not only on a lead card', () => {
    const { getAllByTestId } = openRest(withState(6));
    const rows = getAllByTestId('account-rest-row');
    const controls = rows.filter((row) => row.querySelector('[data-testid="always-do-this"]'));
    expect(controls.length).toBe(3);
  });

  it.skip('asks for the detector of the row that was clicked', () => {
    const onSetState = mock((_d: string, _s: string) => {});
    const { getAllByTestId } = openRest(withState(6), onSetState);
    const row = getAllByTestId('account-rest-row')[0];
    fireEvent.click(row.querySelector('[data-testid="always-do-this"]') as HTMLElement);
    expect(onSetState).toHaveBeenCalledWith('dead_tail', 'autopilot');
  });

  it('says a rest row was lowered by its family, same as a lead card would', () => {
    const { getAllByTestId } = openRest(withState(6));
    const lowered = getAllByTestId('account-rest-row').filter((row) =>
      row.querySelector('[data-testid="state-lowered"]'),
    );
    expect(lowered.length).toBe(1);
  });
});
