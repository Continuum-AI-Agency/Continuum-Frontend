// The setup tile (a brand with nothing connected): how many of the first-run setup's tracked steps
// are done and which one is next. Only tracked steps count — the guidance steps (competitors, a
// first plan) have no completion signal, so counting them would print "2 of 5" over steps nobody
// can ever finish; the checklist sets them apart the same way (SetupChecklist).
//
// Headline (bench anchor): `data-value` = completedCount of deriveDashboardSetup over the RSC's
// signals (connect: a provider is connected; assign: brand_profile_integration_accounts has a row
// for the brand; brand_book: the brand book read answers present = true), `data-total` =
// trackedCount (3).

import type {
  DashboardSetupState,
  DashboardSetupStep,
} from '@/components/dashboard/first-run/setupState';

export const SETUP_MISSING = 'This brand’s setup steps could not be read.';

export type SetupTileView =
  | { state: 'missing'; reason: string }
  | {
      state: 'ready';
      done: number;
      total: number;
      /** The step the tile's button opens: the first tracked one left, else the first optional. */
      next: DashboardSetupStep | null;
      /** Tracked steps still to do, in order. */
      remaining: DashboardSetupStep[];
    };

export function setupTileView(setup: DashboardSetupState | null): SetupTileView {
  if (!setup) return { state: 'missing', reason: SETUP_MISSING };
  const remaining = setup.steps.filter((step) => step.tracked && step.status === 'todo');
  const optional = setup.steps.filter((step) => !step.tracked && step.status === 'todo');
  return {
    state: 'ready',
    done: setup.completedCount,
    total: setup.trackedCount,
    next: remaining[0] ?? optional[0] ?? null,
    remaining,
  };
}
