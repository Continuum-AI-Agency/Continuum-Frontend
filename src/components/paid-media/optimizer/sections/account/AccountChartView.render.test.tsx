// What a reader can actually get out of the two shapes the portfolio hero opens on.
//
// Every assertion here is about a figure being REACHABLE — by pointer, by keyboard, or as
// text on the page — never about how it looks. The chart may only ever say what the
// candidate supplied, so the tests also pin the two refusals: a moving `b` is a second
// series and must not be drawn as a reference line, and a date nobody supplied is printed
// back untouched rather than invented into one.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return { motion: { div: passthrough('div') }, useReducedMotion: () => true };
});

import type { AccountChart } from '@continuum/contracts';
import { chartArgues } from '@continuum/contracts';
import { heroChart } from '../detail/heroChart';
import { AccountChartView } from './AccountChartView';

afterEach(cleanup);

const rates = (over: Partial<Extract<AccountChart, { shape: 'rates' }>> = {}) =>
  ({
    shape: 'rates',
    unit: 'currency',
    points: [
      { t: '2026-09-17', a: 83, b: 70 },
      { t: '2026-09-18', a: 79, b: 70 },
      { t: '2026-09-19', a: 74, b: 70 },
    ],
    a_label: 'Cost per lead',
    b_label: 'Target',
    projected_from: null,
    gap_per_day: 120,
    ...over,
  }) as Extract<AccountChart, { shape: 'rates' }>;

const draw = (chart: AccountChart) => render(<AccountChartView chart={chart} currency="USD" />);

describe('AccountChartView — rates says which values, and when', () => {
  it('opens on the newest point, naming the value, its label and its day', () => {
    const { getByTestId, container } = draw(rates());
    expect(getByTestId('rates-readout-value').textContent).toBe('$74');
    expect(getByTestId('rates-readout-day').textContent).toBe('Sep 19');
    expect(container.textContent).toContain('Cost per lead');
  });

  it('puts the window on the axis, so any figure can be checked against a date', () => {
    const { container } = draw(rates());
    const text = container.textContent ?? '';
    expect(text).toContain('Sep 17');
    expect(text).toContain('Sep 19');
  });

  it('names the value axis at both ends of the scale it actually draws', () => {
    const { container } = draw(rates());
    // min is pinned at 0 and max at the series maximum — the same domain as before.
    expect(container.textContent).toContain('$83');
    expect(container.textContent).toContain('$0');
  });

  it('gives every point an accessible name carrying its date, label and value', () => {
    const { container } = draw(rates());
    const points = container.querySelectorAll('button[data-point]');
    expect(points).toHaveLength(3);
    expect(points[0]?.getAttribute('aria-label')).toContain('September 17, 2026');
    expect(points[0]?.getAttribute('aria-label')).toContain('Cost per lead $83');
    expect(points[0]?.getAttribute('aria-label')).toContain('Target $70');
  });

  it('reads the mark under the pointer, and reads its own datum', () => {
    const { container, getByTestId } = draw(
      rates({
        points: [
          { t: '2026-09-17', a: 8347, b: 7000 },
          { t: '2026-09-18', a: 7902, b: 7000 },
          { t: '2026-09-19', a: 7450, b: 7000 },
        ],
      }),
    );
    const points = Array.from(container.querySelectorAll('button[data-point]'));
    act(() => {
      fireEvent.pointerEnter(points[0] as HTMLButtonElement);
    });
    // The value the candidate supplied for THAT day, to the unit. A readout taken off the
    // drawing would have come back through a 0-100 viewBox and landed near it, not on it.
    expect(getByTestId('rates-readout-value').textContent).toBe('$8,347');
    expect(getByTestId('rates-readout-day').textContent).toBe('Sep 17');
    act(() => {
      fireEvent.pointerEnter(points[1] as HTMLButtonElement);
    });
    expect(getByTestId('rates-readout-value').textContent).toBe('$7,902');
  });

  it('gives the keyboard the same reading the pointer gets, in the same place', () => {
    const { container, getByTestId } = draw(rates());
    const points = Array.from(container.querySelectorAll('button[data-point]'));
    act(() => {
      fireEvent.pointerEnter(points[0] as HTMLButtonElement);
    });
    const byPointer = [
      getByTestId('rates-readout-value').textContent,
      getByTestId('rates-readout-day').textContent,
    ];
    act(() => (points[0] as HTMLButtonElement).focus());
    expect([
      getByTestId('rates-readout-value').textContent,
      getByTestId('rates-readout-day').textContent,
    ]).toEqual(byPointer);
    expect(byPointer).toEqual(['$83', 'Sep 17']);
  });

  it('is reachable by keyboard: one tab stop, and arrows walk the window', () => {
    const { container, getByTestId } = draw(rates());
    const points = Array.from(container.querySelectorAll('button[data-point]'));
    // A roving tabindex — the newest point is the single stop, not three of them.
    expect(points.map((p) => p.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    const newest = points[2] as HTMLButtonElement;
    act(() => newest.focus());
    act(() => {
      fireEvent.keyDown(newest, { key: 'ArrowLeft' });
    });
    expect(getByTestId('rates-readout-day').textContent).toBe('Sep 18');
    expect(getByTestId('rates-readout-value').textContent).toBe('$79');
    act(() => {
      fireEvent.keyDown(container.querySelectorAll('button[data-point]')[1] as HTMLButtonElement, {
        key: 'Home',
      });
    });
    expect(getByTestId('rates-readout-day').textContent).toBe('Sep 17');
  });

  it('draws a target that never moves as the LINE, wearing its own name and value', () => {
    const { getByTestId } = draw(rates());
    expect(getByTestId('rates-reference').textContent).toBe('Target $70');
  });

  it('refuses to call a moving b a reference line — that is a second series', () => {
    const { queryByTestId, container } = draw(
      rates({
        points: [
          { t: '2026-09-17', a: 8, b: 3 },
          { t: '2026-09-18', a: 6, b: 5 },
          { t: '2026-09-19', a: 4, b: 9 },
        ],
        a_label: 'New per week',
        b_label: 'Dying per week',
        unit: 'count',
      }),
    );
    expect(queryByTestId('rates-reference')).toBeNull();
    // It becomes a legend entry instead, which is what a second series gets.
    expect(container.textContent).toContain('Dying per week');
  });

  it('prints a t it cannot read as a day straight back, rather than inventing a date', () => {
    const { getByTestId } = draw(
      rates({
        points: [
          { t: 'W1', a: 8, b: null },
          { t: 'W2', a: 6, b: null },
        ],
        b_label: 'No target set',
      }),
    );
    expect(getByTestId('rates-readout-day').textContent).toBe('W2');
  });
});

describe('AccountChartView — interval says what the interval is, and what the line is', () => {
  const interval: AccountChart = {
    shape: 'interval',
    unit: 'currency',
    value_label: 'Cost per lead',
    estimate: null,
    low: 420,
    high: 840,
    reference: 70,
    reference_label: 'target',
    at_stake_per_day: 420,
    no_results: true,
  };

  it('states the bounds, and says plainly that there is no upper bound to draw', () => {
    const { getByTestId } = draw(interval);
    expect(getByTestId('interval-readout').textContent).toContain('at least $420');
    expect(getByTestId('interval-readout').textContent).toContain('no upper bound');
  });

  it('makes the reference identifiable as the line, by name and by value', () => {
    const { getByTestId } = draw(interval);
    const reference = getByTestId('interval-reference');
    expect(reference.textContent).toBe('target $70');
    expect(reference.getAttribute('aria-label')).toBe('target $70');
  });

  it('swaps the readout to the reference on focus — keyboard, not just pointer', () => {
    const { getByTestId } = draw(interval);
    act(() => (getByTestId('interval-reference') as HTMLButtonElement).focus());
    expect(getByTestId('interval-readout').textContent).toBe('target $70');
  });

  it('names the axis by the two ends the drawing actually reaches', () => {
    const { getByTestId } = draw(interval);
    // Both ends are drawn: 0 is where the track starts, $840 is where the interval stops.
    expect(getByTestId('interval-axis-low').textContent).toBe('$0');
    expect(getByTestId('interval-axis-high').textContent).toBe('$840');
  });

  it('takes the axis name from the contract, verbatim', () => {
    expect(draw(interval).getByTestId('interval-axis-label').textContent).toBe('Cost per lead');
    cleanup();
    // The same drawing measuring a different thing. The view prints what it was given and
    // never a word of its own: a view that turned `unit: currency` into "Cost" would get
    // this one wrong, and would go on getting it wrong silently.
    const { getByTestId } = draw({ ...interval, value_label: 'Spend per day at risk' });
    expect(getByTestId('interval-axis-label').textContent).toBe('Spend per day at risk');
  });

  it('prints no axis name at all when the producer did not give one', () => {
    const { queryByTestId, getByTestId } = draw({ ...interval, value_label: null });
    expect(queryByTestId('interval-axis-label')).toBeNull();
    // and the two ends stay, so the drawing is still readable
    expect(getByTestId('interval-axis-high').textContent).toBe('$840');
  });

  it('reads the real bounds on hover, not a figure re-derived from the drawing', () => {
    const { getByTestId } = draw({ ...interval, low: 41735, high: 83470, no_results: false });
    const band = getByTestId('interval-band');
    expect(band.getAttribute('data-active')).toBe('false');
    act(() => {
      fireEvent.pointerEnter(band);
    });
    expect(band.getAttribute('data-active')).toBe('true');
    // The drawing places the band by percentage of the axis; the readout gives the two
    // numbers the candidate supplied, to the unit.
    expect(getByTestId('interval-readout').textContent).toBe('between $41,735 and $83,470');
    act(() => {
      fireEvent.pointerLeave(band);
    });
    expect(band.getAttribute('data-active')).toBe('false');
  });

  it('gives the keyboard the same reading the pointer gets, in the same place', () => {
    const { getByTestId } = draw(interval);
    const reference = getByTestId('interval-reference') as HTMLButtonElement;
    act(() => {
      fireEvent.pointerEnter(reference);
    });
    expect(reference.getAttribute('data-active')).toBe('true');
    const byPointer = getByTestId('interval-readout').textContent;
    act(() => {
      fireEvent.pointerLeave(reference);
    });
    act(() => reference.focus());
    expect(reference.getAttribute('data-active')).toBe('true');
    expect(getByTestId('interval-readout').textContent).toBe(byPointer);
    expect(byPointer).toBe('target $70');
  });

  it('draws the point estimate when the candidate carries one, and says it first', () => {
    const { getByTestId } = draw({ ...interval, estimate: 560, no_results: false });
    expect(getByTestId('interval-readout').textContent).toBe('$560, between $420 and $840');
  });
});

// The settled rule for the portfolio's news card: a chart appears only when it ARGUES. A
// trend and an interval each tell a reader something the sentence cannot. The other five
// shapes draw the arithmetic the sentence already made, and drawing it again is paid for
// out of the space the justification needed.
//
// The rule is `chartArgues` in the contract; the gate is `heroChart`, which is where the
// news card's chart is chosen. Both run here against the real renderer, so "renders no
// chart" is asserted on the thing that renders.
describe('the news card draws a chart only when the chart argues', () => {
  const slot = (chart: AccountChart | null) =>
    render(<div>{chart ? <AccountChartView chart={chart} currency="USD" /> : null}</div>);

  const day = (date: string, spend: number, results: number) => ({ date, spend, results });
  const budgetMove = {
    id: 'rec:1',
    module: 'budget',
    kind: 'budget_move',
    trigger: 'solver',
    adset_id: null,
    adset_name: null,
    impact_per_day: 80,
    impact_unit: 'currency',
    results_per_day: null,
    impact_basis: 'two budget moves this cycle',
    reason: null,
    cta: { kind: 'manage', target_id: null },
  } as unknown as Parameters<typeof heroChart>[0]['candidate'];

  it('a trend and an interval argue; the five arithmetic shapes do not', () => {
    expect(chartArgues(rates())).toBe(true);
    expect(
      chartArgues({
        shape: 'interval',
        unit: 'currency',
        value_label: null,
        estimate: null,
        low: 1,
        high: 2,
        reference: null,
        reference_label: null,
        at_stake_per_day: null,
        no_results: true,
      }),
    ).toBe(true);
    expect(
      chartArgues({
        shape: 'transfer',
        unit: 'currency',
        from: { label: 'A', cost_per_result: 90, spend_per_day: 100 },
        to: { label: 'B', cost_per_result: 60, spend_per_day: 40 },
        movable_per_day: 60,
        saving_per_day: 20,
      }),
    ).toBe(false);
    expect(chartArgues(null)).toBe(false);
  });

  it('renders no chart when a budget move has only its own arithmetic to show', () => {
    // One priced day is no trend, and a budget move's argument — move this much, keep the
    // difference — is complete as a sentence. Nothing here argues, so nothing is drawn.
    const chart = heroChart({
      candidate: budgetMove,
      series: [day('2026-09-19', 160, 2)],
      target: 70,
      resultLabel: 'Leads',
    });
    expect(chart).toBeNull();
    expect(slot(chart).container.textContent).toBe('');
  });

  it('and draws it as soon as there is a trend to argue with', () => {
    const chart = heroChart({
      candidate: budgetMove,
      series: [day('2026-09-17', 166, 2), day('2026-09-18', 158, 2), day('2026-09-19', 149, 2)],
      target: 70,
      resultLabel: 'Leads',
    });
    expect(chart?.shape).toBe('rates');
    expect(slot(chart).container.textContent).toContain('Cost per leads');
  });
});
