import { describe, expect, it } from 'bun:test';
import { deriveFreshnessMeta } from '@/lib/freshness/freshnessMeta';
import { freshnessBadgePresentation } from './FreshnessBadge';

// Fixed clock so cache-age -> label phrasing is deterministic.
const NOW = Date.parse('2026-07-18T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('freshnessBadgePresentation', () => {
  it('labels a fresh sync with its relative age and a success dot', () => {
    const meta = deriveFreshnessMeta({ lastSyncedAt: minutesAgo(120), now: NOW });
    const p = freshnessBadgePresentation(meta);
    expect(p.label).toBe('Synced 2h ago');
    expect(p.tone).toBe('success');
    expect(p.pulse).toBe(false);
  });

  it('labels a stale sync as updated with a warning dot', () => {
    const meta = deriveFreshnessMeta({ lastSyncedAt: minutesAgo(5), stale: true, now: NOW });
    const p = freshnessBadgePresentation(meta);
    expect(p.label).toBe('Updated 5m ago');
    expect(p.tone).toBe('warning');
  });

  it('shows a pulsing info dot while syncing', () => {
    const meta = deriveFreshnessMeta({ lastSyncedAt: minutesAgo(1), syncing: true, now: NOW });
    const p = freshnessBadgePresentation(meta);
    expect(p.label).toBe('Syncing…');
    expect(p.tone).toBe('info');
    expect(p.pulse).toBe(true);
  });

  it("renders a neutral 'not synced yet' when nothing has ever synced", () => {
    const meta = deriveFreshnessMeta({ lastSyncedAt: null, now: NOW });
    const p = freshnessBadgePresentation(meta);
    expect(p.label).toBe('Not synced yet');
    expect(p.tone).toBeNull();
  });

  it('surfaces a failed sync with an error dot', () => {
    const meta = deriveFreshnessMeta({
      lastSyncedAt: minutesAgo(30),
      error: '429 rate limited',
      now: NOW,
    });
    const p = freshnessBadgePresentation(meta);
    expect(p.label).toBe('Sync failed');
    expect(p.tone).toBe('error');
  });
});
