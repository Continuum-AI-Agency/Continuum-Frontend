import { describe, expect, it } from 'bun:test';
import type { BrandBookResponse } from '@continuum/contracts';
import { deriveDashboardSetup } from '@/components/dashboard/first-run/setupState';
import { SETUP_MISSING, setupTileView } from './setupModel';

const READY_BOOK = {
  brand_id: 'brand-1',
  status: 'ready',
  present: true,
  refreshed_at: '2026-07-01T00:00:00.000Z',
  assembled: { report: { readiness: null } },
} as unknown as BrandBookResponse;

describe('setupTileView', () => {
  it('counts the tracked steps done and names the first one left as next', () => {
    const view = setupTileView(
      deriveDashboardSetup({
        hasConnectedProviders: true,
        hasAssignedAccounts: false,
        brandBook: null,
      }),
    );
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.done).toBe(1);
    expect(view.total).toBe(3);
    expect(view.next?.id).toBe('assign');
    expect(view.remaining.map((step) => step.id)).toEqual(['assign', 'brand_book']);
  });

  it('starts at the first step on a brand with nothing done', () => {
    const view = setupTileView(
      deriveDashboardSetup({
        hasConnectedProviders: false,
        hasAssignedAccounts: false,
        brandBook: null,
      }),
    );
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.done).toBe(0);
    expect(view.next?.id).toBe('connect');
  });

  it('points at the optional steps once every tracked one is done', () => {
    const view = setupTileView(
      deriveDashboardSetup({
        hasConnectedProviders: true,
        hasAssignedAccounts: true,
        brandBook: READY_BOOK,
      }),
    );
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.done).toBe(3);
    expect(view.total).toBe(3);
    expect(view.remaining).toEqual([]);
    expect(view.next?.id).toBe('competitors');
  });

  it('is missing only when the setup state is not readable', () => {
    expect(setupTileView(null)).toEqual({ state: 'missing', reason: SETUP_MISSING });
  });
});
