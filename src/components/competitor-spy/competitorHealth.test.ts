import { describe, expect, it } from 'bun:test';
import type { Competitor, CompetitorHealthState } from '@continuum/contracts';

import {
  competitorHealthChip,
  competitorHealthGuidance,
  toCompetitorHealthInput,
} from './competitorHealth';

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    brandId: '00000000-0000-0000-0000-000000000002',
    name: 'Acme Co',
    slug: 'acme-co',
    source: 'user',
    metaPageId: null,
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toCompetitorHealthInput', () => {
  it('maps meta_page_resolved_at into lastSyncedAt and carries the ad count', () => {
    const input = toCompetitorHealthInput(
      competitor({ metaPageResolvedAt: '2026-07-01T00:00:00.000Z' }),
      4,
    );
    expect(input.lastSyncedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(input.adsFound).toBe(4);
  });

  it('carries the resolution error through as lastSyncError', () => {
    const input = toCompetitorHealthInput(competitor({ metaPageResolutionError: 'graph 500' }));
    expect(input.lastSyncError).toBe('graph 500');
  });
});

describe('competitorHealthChip', () => {
  it('is healthy once resolved, synced, and producing ads', () => {
    const chip = competitorHealthChip(
      competitor({
        organicStatus: 'ready',
        metaPageResolutionStatus: 'resolved',
        metaPageResolvedAt: '2026-07-01T00:00:00.000Z',
      }),
      2,
    );
    expect(chip.state).toBe('healthy');
    expect(chip.tone).toBe('positive');
  });

  it('flags needs_handle when an Instagram handle is missing', () => {
    expect(competitorHealthChip(competitor({ organicStatus: 'needs_instagram' })).state).toBe(
      'needs_handle',
    );
  });

  it('reports no_posts_found once resolved and synced but empty', () => {
    const chip = competitorHealthChip(
      competitor({
        organicStatus: 'ready',
        metaPageResolutionStatus: 'resolved',
        metaPageResolvedAt: '2026-07-01T00:00:00.000Z',
      }),
      0,
    );
    expect(chip.state).toBe('no_posts_found');
  });

  it('stays in collecting before the first sync', () => {
    expect(competitorHealthChip(competitor({ organicStatus: 'ready' })).state).toBe('collecting');
  });

  it('surfaces a resolution error as sync_error', () => {
    expect(competitorHealthChip(competitor({ metaPageResolutionError: 'graph 500' })).state).toBe(
      'sync_error',
    );
  });
});

describe('competitorHealthGuidance', () => {
  it('returns remediation copy for every health state', () => {
    const states: CompetitorHealthState[] = [
      'healthy',
      'collecting',
      'needs_handle',
      'no_posts_found',
      'page_unresolved',
      'needs_review',
      'sync_error',
    ];
    for (const state of states) {
      expect(competitorHealthGuidance(state).length).toBeGreaterThan(0);
    }
  });
});
