import { afterEach, describe, expect, it } from 'bun:test';
import type { OrganicBestTimes } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { BestTimeTiles, formatSlotHour, headlineSlot } from './BestTimeTiles';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

afterEach(() => cleanup());

const slot = (
  weekday: number,
  hour: number,
  rank: number,
  medianInteractions: number,
  basis: 'weekday' | 'all_days' = 'weekday',
) => ({
  weekday,
  hour,
  time: `${String(hour).padStart(2, '0')}:00`,
  rank,
  basis,
  postCount: 3,
  medianInteractions,
  medianReach: null,
});

const learned: OrganicBestTimes = {
  platform: 'instagram',
  timeZone: 'America/Denver',
  windowDays: 90,
  postsAnalyzed: 27,
  postsPerWeek: 2.1,
  slots: [slot(1, 9, 1, 40), slot(1, 18, 2, 22), slot(4, 19, 1, 151), slot(4, 7, 2, 60)],
};

describe('formatSlotHour', () => {
  it('reads a 24h slot as a 12h clock', () => {
    expect(formatSlotHour(0)).toBe('12 AM');
    expect(formatSlotHour(9)).toBe('9 AM');
    expect(formatSlotHour(12)).toBe('12 PM');
    expect(formatSlotHour(19)).toBe('7 PM');
  });
});

describe('headlineSlot', () => {
  it("picks the strongest of each day's best, never a runner-up", () => {
    expect(headlineSlot(learned.slots)).toMatchObject({ weekday: 4, hour: 19 });
    expect(headlineSlot([slot(2, 8, 2, 999)])).toBeNull();
  });
});

describe('BestTimeTiles', () => {
  it('shows every learned slot under its weekday, in rank order', () => {
    const { container } = render(<BestTimeTiles bestTimes={learned} />);
    const thursday = container.querySelector('[data-weekday="4"]');
    const times = Array.from(thursday?.querySelectorAll('[data-slot-time]') ?? []).map((node) =>
      node.getAttribute('data-slot-time'),
    );
    expect(times).toEqual(['19:00', '07:00']);
    expect(container.querySelector('[data-weekday="0"]')?.textContent).toContain('—');
    expect(screen.getByText('Thu, 7 PM')).toBeTruthy();
  });

  it('never names a weekday for an hour pooled across all days', () => {
    render(<BestTimeTiles bestTimes={{ ...learned, slots: [slot(0, 19, 1, 150, 'all_days')] }} />);
    expect(screen.getByText('Any day, 7 PM')).toBeTruthy();
  });

  it('says the planner still uses defaults while under the 20-post bar', () => {
    render(<BestTimeTiles bestTimes={{ ...learned, postsAnalyzed: 12 }} />);
    expect(screen.getByText(/Early read from 12 posts/)).toBeTruthy();
    expect(screen.getByText(/switch to these times at 20 posts/)).toBeTruthy();
  });

  it('reports posting frequency as posts per week', () => {
    render(<BestTimeTiles bestTimes={learned} />);
    expect(screen.getByText('2.1')).toBeTruthy();
    expect(screen.getByText('27 posts in the last 90 days')).toBeTruthy();
  });
});
