import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { QueueTraySkeleton, queueSkeletonShape } from './QueueTraySkeleton';

// PP-L1V-cls-overview-0.865 (Actions 0.57): the loading tray must open to the rows the
// portfolio already says are waiting, not a fixed 112px card that the real queue then outgrows.

describe('queueSkeletonShape', () => {
  it('lays out one row per pending recommendation and budget move', () => {
    expect(queueSkeletonShape({ pending_recommendations: 9, pending_budget_moves: 0 })).toEqual({
      rows: 9,
      storyRows: 0,
    });
    expect(queueSkeletonShape({ pending_recommendations: 4, pending_budget_moves: 3 })).toEqual({
      rows: 7,
      storyRows: 4,
    });
  });

  it('holds at least one row, and reads a missing move count as none', () => {
    expect(queueSkeletonShape({ pending_recommendations: 0 })).toEqual({ rows: 1, storyRows: 0 });
  });
});

describe('QueueTraySkeleton', () => {
  afterEach(() => cleanup());

  it('renders the waiting rows and the story, borderless, and names what is loading', () => {
    render(
      <QueueTraySkeleton
        portfolio={{ name: 'Tours', pending_recommendations: 1, pending_budget_moves: 2 }}
      />,
    );
    const tray = screen.getByRole('region', { name: 'Loading the actions for Tours' });
    expect(tray.getAttribute('aria-busy')).toBe('true');
    expect(screen.getAllByTestId('queue-skeleton-row')).toHaveLength(3 + 3);
    expect(screen.getByTestId('queue-skeleton-story')).toBeTruthy();
    expect(tray.outerHTML).not.toMatch(/(^|[\s"])(border|rounded-lg|bg-card)([\s"]|$)/);
  });
});
