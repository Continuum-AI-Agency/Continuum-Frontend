import type { PaidEntityKpi } from '@continuum/contracts';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Persisted dashboard UI preferences. The KPI the top-ads tables rank by and the
// scope toggle — kept here (not component state) so both tables share them and
// the choice survives navigation — plus the id of the newest "What's New"
// changelog entry the viewer has seen (drives the header Sparkles badge). Account
// memory lives in the shared useAccountSelectionStore (brandId:platform), reused
// by organic and paid.
export type PaidEntityScope = 'top_campaigns' | 'top_adsets';

type DashboardPrefsState = {
  paidKpi: PaidEntityKpi;
  setPaidKpi: (kpi: PaidEntityKpi) => void;
  paidScope: PaidEntityScope;
  setPaidScope: (scope: PaidEntityScope) => void;
  lastSeenChangelogId: string | null;
  setLastSeenChangelogId: (id: string | null) => void;
};

// v1 stores predate the changelog badge. Spread the prior state so the existing
// paidKpi/paidScope keys survive, and default the new lastSeenChangelogId to null
// (fail-open: the badge then shows the full current bundle).
export function migrateDashboardPrefs(
  persisted: unknown,
  fromVersion: number,
): DashboardPrefsState {
  if (fromVersion < 2) {
    return {
      ...(persisted as Partial<DashboardPrefsState>),
      lastSeenChangelogId: null,
    } as DashboardPrefsState;
  }
  return persisted as DashboardPrefsState;
}

export const useDashboardPrefsStore = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      paidKpi: 'roas',
      setPaidKpi: (kpi) => set({ paidKpi: kpi }),
      paidScope: 'top_campaigns',
      setPaidScope: (scope) => set({ paidScope: scope }),
      lastSeenChangelogId: null,
      setLastSeenChangelogId: (id) => set({ lastSeenChangelogId: id }),
    }),
    {
      name: 'continuum:dashboard-prefs',
      version: 2,
      migrate: migrateDashboardPrefs,
    },
  ),
);
