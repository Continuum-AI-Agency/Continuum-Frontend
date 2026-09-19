import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Calendar } from './calendar';

afterEach(cleanup);

// react-day-picker v9 ignores v8 class slots. The regression this pins: the weekday header
// row must share the week rows' layout, or "Su MoTuWeThFrSa" collapses into one run again.
describe('Calendar', () => {
  it('lays the weekday header out like a week row: seven 2rem cells in a flex row', () => {
    const { container } = render(
      <Calendar defaultMonth={new Date(2026, 8, 1)} mode="single" showOutsideDays />,
    );
    const header = container.querySelector('thead tr');
    expect(header?.className).toContain('flex');
    const weekdays = container.querySelectorAll('thead th');
    expect(weekdays).toHaveLength(7);
    for (const cell of weekdays) expect(cell.className).toContain('w-8');

    const firstWeek = container.querySelector('tbody tr');
    expect(firstWeek?.className).toContain('flex');
    expect(container.querySelectorAll('tbody tr:first-child td')).toHaveLength(7);
  });

  it('renders a selected day with the v9 modifier class, not the v8 one', () => {
    const { container } = render(
      <Calendar
        defaultMonth={new Date(2026, 8, 1)}
        mode="single"
        selected={new Date(2026, 8, 15)}
      />,
    );
    const selected = container.querySelector(
      'td[aria-selected="true"], td.day-selected, td[data-selected="true"]',
    );
    expect(selected).not.toBeNull();
    expect(selected?.className).toContain('bg-primary');
  });
});
