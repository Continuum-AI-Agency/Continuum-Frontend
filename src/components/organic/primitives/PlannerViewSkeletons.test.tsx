import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import {
  ListViewSkeleton,
  MonthGridSkeleton,
  PlannerViewSkeleton,
  WeekGridSkeleton,
} from './PlannerViewSkeletons';

const TESTID_BY_VIEW = {
  week: 'planner-week-skeleton',
  month: 'planner-month-skeleton',
  list: 'planner-list-skeleton',
} as const;

afterEach(() => {
  cleanup();
});

describe('planner view skeletons', () => {
  it('renders the week grid', () => {
    render(<WeekGridSkeleton />);
    expect(screen.getByTestId(TESTID_BY_VIEW.week)).toBeTruthy();
  });

  it('renders the month grid', () => {
    render(<MonthGridSkeleton />);
    expect(screen.getByTestId(TESTID_BY_VIEW.month)).toBeTruthy();
  });

  it('renders the list view', () => {
    render(<ListViewSkeleton />);
    expect(screen.getByTestId(TESTID_BY_VIEW.list)).toBeTruthy();
  });

  it('occupies the same box the real view will', () => {
    render(<WeekGridSkeleton />);
    const root = screen.getByTestId(TESTID_BY_VIEW.week);
    expect(root.className).toContain('h-full');
    expect(root.className).toContain('min-h-0');
  });

  it('hides itself from assistive technology', () => {
    render(<MonthGridSkeleton />);
    expect(screen.getByTestId(TESTID_BY_VIEW.month).getAttribute('aria-hidden')).toBe('true');
  });

  it('mirrors the week grid geometry: a platform rail plus seven day columns', () => {
    render(<WeekGridSkeleton />);
    const grid = screen
      .getByTestId(TESTID_BY_VIEW.week)
      .querySelector('.grid-cols-\\[6rem_repeat\\(7\\,minmax\\(7\\.5rem\\,1fr\\)\\)\\]');
    expect(grid).not.toBeNull();
  });
});

describe('PlannerViewSkeleton', () => {
  for (const view of ['week', 'month', 'list'] as const) {
    it(`dispatches ${view} to its own skeleton`, () => {
      render(<PlannerViewSkeleton view={view} />);

      expect(screen.getByTestId(TESTID_BY_VIEW[view])).toBeTruthy();
      for (const other of ['week', 'month', 'list'] as const) {
        if (other === view) continue;
        expect(screen.queryByTestId(TESTID_BY_VIEW[other])).toBeNull();
      }
    });
  }
});
