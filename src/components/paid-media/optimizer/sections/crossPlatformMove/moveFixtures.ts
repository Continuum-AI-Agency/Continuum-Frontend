// Shared fixtures for the cross-platform move tests: escenarios.html 01 (TikTok → Meta, the same
// percentage on each side) cut down to two decreases and two increases, and 18/19 for the
// Activity states. Minor units, MXN — the shape the executor and the ledger carry.

import type {
  BudgetMoveAction,
  PlatformEntityRef,
  RecommendationRow,
  SetBudgetAction,
} from '@continuum/contracts';
import type { OptimizerActionFeedRow } from '../../useOptimizerData';

export const MOVE_ID = '7b0e3a52-5d1f-4b8e-9a51-0c3c1d2e4f60';

export function ref(
  platform: PlatformEntityRef['platform'],
  id: string,
  name?: string,
): PlatformEntityRef {
  const native =
    platform === 'meta'
      ? { level: 'group' as const, nativeLevel: 'adset' as const }
      : platform === 'google_ads'
        ? { level: 'campaign' as const, nativeLevel: 'campaign' as const }
        : { level: 'group' as const, nativeLevel: 'ad_group' as const };
  return { platform, ...native, id, accountId: `acct-${platform}`, ...(name ? { name } : {}) };
}

export function leg(
  entity: PlatformEntityRef,
  expectedMinor: number,
  targetMinor: number,
  currency = 'MXN',
): SetBudgetAction {
  return {
    kind: 'set_budget',
    ref: entity,
    budget: { kind: 'daily', minor: expectedMinor, currency, shared: false, ownerRef: entity },
    expectedMinor,
    targetMinor,
  };
}

/** TikTok 201 400 → 383.07 and 202 1,000 → 957.68 (−4.23%); Meta two ad sets +25%. The
 *  decreases total 59.25, and so do the increases. */
export const TIKTOK_TO_META: BudgetMoveAction = {
  kind: 'budget_move',
  moveId: MOVE_ID,
  currency: 'MXN',
  legs: [
    leg(ref('tiktok_ads', '201', 'EF | Leads | Broad MX'), 40_000, 38_307),
    leg(ref('tiktok_ads', '202', 'EF | Leads | Intereses fitness'), 100_000, 95_768),
    leg(ref('meta', '120252366877000236', 'CAÑADAS // AGOSTO - BROAD'), 4_273, 5_341),
    leg(ref('meta', '120252366877000999'), 19_427, 24_284),
  ],
};

export function moveRec(over: Partial<RecommendationRow> & Record<string, unknown> = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    adset_id: '201',
    kind: 'budget_move',
    trigger: 'G27',
    severity: 'high',
    reason:
      'Move 59.25 MXN/day from TikTok to Meta: last 7 days TikTok paid 65.72 MXN per result and Meta 43.81 MXN (1.50×).',
    status: 'pending',
    action: TIKTOK_TO_META,
    ...over,
  } as RecommendationRow;
}

/** One action-feed row, the loose fields the move readers look for included. */
export function feedRow(
  over: Partial<OptimizerActionFeedRow> & Record<string, unknown>,
): OptimizerActionFeedRow {
  return {
    id: 'a-1',
    ts: '2026-10-05T19:12:00.000Z',
    family: 'money',
    op: 'budget',
    portfolio_id: 'p-1',
    portfolio_name: 'Leads // All platforms',
    actor_kind: 'human',
    reversible: true,
    ...over,
  } as OptimizerActionFeedRow;
}
