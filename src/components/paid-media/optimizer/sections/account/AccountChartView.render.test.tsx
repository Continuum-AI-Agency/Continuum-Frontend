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
    const { container } = draw(interval);
    const text = container.textContent ?? '';
    expect(text).toContain('$0');
    expect(text).toContain('$840');
  });

  it('draws the point estimate when the candidate carries one, and says it first', () => {
    const { getByTestId } = draw({ ...interval, estimate: 560, no_results: false });
    expect(getByTestId('interval-readout').textContent).toBe('$560, between $420 and $840');
  });
});
