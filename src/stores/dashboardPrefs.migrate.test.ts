import { describe, expect, it } from 'bun:test';
import { migrateDashboardPrefs } from './dashboardPrefs';

describe('migrateDashboardPrefs', () => {
  it('injects lastSeenChangelogId=null and preserves paidKpi/paidScope on v1→v2', () => {
    const v1 = { paidKpi: 'cpa', paidScope: 'top_adsets' };
    const migrated = migrateDashboardPrefs(v1, 1);

    expect(migrated.lastSeenChangelogId).toBeNull();
    expect(migrated.paidKpi).toBe('cpa');
    expect(migrated.paidScope).toBe('top_adsets');
  });

  it('does not drop unrelated persisted keys', () => {
    const v1 = { paidKpi: 'roas', paidScope: 'top_campaigns', someFutureKey: 'keep-me' };
    const migrated = migrateDashboardPrefs(v1, 1) as Record<string, unknown>;

    expect(migrated.someFutureKey).toBe('keep-me');
    expect(migrated.lastSeenChangelogId).toBeNull();
  });

  it('leaves a current-version payload untouched', () => {
    const v2 = {
      paidKpi: 'roas',
      paidScope: 'top_campaigns',
      lastSeenChangelogId: '2026-07-20-planner-bulk-actions',
    };
    const migrated = migrateDashboardPrefs(v2, 2);

    expect(migrated.lastSeenChangelogId).toBe('2026-07-20-planner-bulk-actions');
  });
});
