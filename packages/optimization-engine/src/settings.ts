// ---------------------------------------------------------------------------
// SETTINGS — the S family. Every other trigger says something about an ad set; these
// say something about the portfolio's own knobs. The solver already reports, per item,
// where a guardrail had to bend (capBreached / floorRelaxed) and how much of the pool
// it could not place (residual); the ingest already shows ad sets spending with no
// tracked conversions. Nothing here reads new data — it turns those signals into a
// recommendation a human can act on, with the proposed change attached where there is
// a single knob to turn.
//
// Proposals, never actions. A settings recommendation is applied only by a person,
// through optimizer_update_portfolio. An optimizer that tunes its own guardrails is an
// optimizer removing its own safety rails.
// ---------------------------------------------------------------------------
import type { EngineConfig } from './config';
import { kpiEvents } from './scoring';
import type {
  AdSetSnapshot,
  OptimizationMode,
  PORTFOLIO_SCOPE as PortfolioScopeType,
  ReallocationResult,
  Recommendation,
} from './types';
import { PORTFOLIO_SCOPE } from './types';

export type SettingsContext = {
  mode: OptimizationMode;
  /** The portfolio's autopilot hold threshold (max_change_pct_per_cycle), when set.
   *  Null/undefined when the portfolio has none or the caller did not pass it. */
  applyCapPct?: number | null;
};

/** Share of movable items on which the velocity cap bound before S1 fires. */
export const CAP_BINDING_SHARE = 0.5;
/** Share of movable items whose floor the solver relaxed before S2 fires. */
export const FLOOR_RELAXED_SHARE = 0.3;
/** Residual as a share of the pool before S3 fires (efficiency mode only). */
export const UNDERSPEND_SHARE = 0.1;

const round2 = (x: number): number => Math.round(x * 100) / 100;

export function evaluateSettings(
  reallocation: ReallocationResult,
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  ctx: SettingsContext,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const scope: typeof PortfolioScopeType = PORTFOLIO_SCOPE;
  const movable = reallocation.items.filter((it) => it.status === 'active');
  const n = movable.length;

  // S1 — the velocity cap bound on most moves. "At the cap" is a change whose size is
  // the cap itself (the one-shot clamp), or one the solver had to breach to conserve.
  if (n >= 2) {
    const cap = cfg.velocityCapPct;
    const atCap = movable.filter(
      (it) => it.capBreached || Math.abs(Math.abs(it.changePct) - cap) < 1e-6,
    );
    const share = atCap.length / n;
    if (share >= CAP_BINDING_SHARE) {
      const applyCap = ctx.applyCapPct ?? null;
      const canRaise = applyCap != null && applyCap > 0 && applyCap < cap;
      const capPct = Math.round(cap * 100);
      recs.push({
        adSetId: scope,
        kind: 'settings',
        trigger: 'S1_velocity_cap_binding',
        severity: 'medium',
        reason: canRaise
          ? `The ±${capPct}% velocity cap bound on ${atCap.length} of ${n} moves this cycle, and your autopilot holds anything over ${Math.round(applyCap * 100)}% for approval — so most of what the engine scored waits on you every cycle. Raising the hold threshold to the ${capPct}% the ${cfg.objective ?? 'objective'} profile is calibrated to lets reallocation complete as scored.`
          : `The ±${capPct}% velocity cap bound on ${atCap.length} of ${n} moves this cycle: the engine scored bigger changes than the cap let through. That is the calibrated cap for ${cfg.objective ?? 'this objective'}; if the account needs faster moves, a shorter cycle or scale mode is the lever, not a looser cap.`,
        evidence: {
          metric: 'cap_binding_share',
          value: share,
          comparator: `${atCap.length} of ${n} moves at the ±${capPct}% cap`,
          threshold: CAP_BINDING_SHARE,
          window: 'd3',
          estImpactPerDay: null,
          source: 'engine',
        },
        ...(canRaise
          ? { patch: { field: 'max_change_pct_per_cycle', from: applyCap, to: round2(cap) } }
          : {}),
        needsApproval: true,
      });
    }
  }

  // S2 — floors demand more than the pool. The solver relaxed floors on many items,
  // which means several ad sets sit below the budget at which they carry a signal.
  if (n >= 2) {
    const relaxed = movable.filter((it) => it.floorRelaxed);
    const share = relaxed.length / n;
    if (share >= FLOOR_RELAXED_SHARE) {
      recs.push({
        adSetId: scope,
        kind: 'settings',
        trigger: 'S2_floor_too_high',
        severity: 'medium',
        reason: `Floors asked for more than the pool holds: the solver had to relax the floor on ${relaxed.length} of ${n} ad sets. Below its floor an ad set cannot carry a readable signal. Either consolidate the smallest ad sets or grow the daily total — spreading the same money thinner will not score better.`,
        evidence: {
          metric: 'floor_relaxed_share',
          value: share,
          comparator: `${relaxed.length} of ${n} floors relaxed`,
          threshold: FLOOR_RELAXED_SHARE,
          window: 'd3',
          estImpactPerDay: null,
          source: 'engine',
        },
        needsApproval: true,
      });
    }
  }

  // S3 — efficiency mode left money on the table. The residual is exactly the money the
  // inventory could not absorb within the caps; a plan that leaves it every cycle is a
  // plan bigger than the account.
  if (ctx.mode === 'efficiency' && reallocation.pool > 0) {
    const share = reallocation.residual / reallocation.pool;
    if (share >= UNDERSPEND_SHARE) {
      recs.push({
        adSetId: scope,
        kind: 'settings',
        trigger: 'S3_persistent_underspend',
        severity: 'low',
        reason: `Efficiency mode left $${reallocation.residual.toFixed(0)} of the $${reallocation.pool.toFixed(0)} pool unallocated (${Math.round(share * 100)}%): the inventory cannot absorb the plan within its caps. Lower the daily total to what gets placed, or switch to balanced mode if growth matters more than efficiency.`,
        evidence: {
          metric: 'residual_share',
          value: share,
          comparator: `$${reallocation.residual.toFixed(0)} of $${reallocation.pool.toFixed(0)} unallocated`,
          threshold: UNDERSPEND_SHARE,
          window: 'd3',
          estImpactPerDay: reallocation.residual,
          source: 'engine',
        },
        patch: {
          field: 'daily_total',
          from: round2(reallocation.totalBudget),
          to: round2(reallocation.allocatedTotal),
        },
        needsApproval: true,
      });
    }
  }

  // S5 — spending, not converting, not even once. P3 already proposes pausing these as
  // dead weight; S5 is the other reading of the same rows, and the more dangerous one to
  // miss: a working ad set whose pixel stopped reporting looks exactly like this, and
  // the engine will defund it.
  const untracked = snapshots.filter(
    (s) =>
      s.status === 'active' &&
      s.windows.d14.spend > cfg.cpaTarget &&
      kpiEvents(s.windows.d14, cfg) === 0 &&
      s.windows.d14.impressions > 0,
  );
  if (untracked.length > 0) {
    const spend = untracked.reduce((sum, s) => sum + s.windows.d14.spend, 0);
    recs.push({
      adSetId: scope,
      kind: 'settings',
      trigger: 'S5_tracking_gap',
      severity: untracked.length > 1 ? 'high' : 'medium',
      reason: `${untracked.length} ad set${untracked.length === 1 ? '' : 's'} spent $${spend.toFixed(0)} over 14 days with impressions but zero tracked ${cfg.kpiField ?? 'conversions'}. The engine reads that as failure and will keep cutting them. If they do convert, the pixel / CAPI is not reporting it — check the event setup before approving any pause on: ${untracked.map((s) => s.id).join(', ')}.`,
      evidence: {
        metric: 'spend',
        value: spend,
        comparator: `with 0 tracked ${cfg.kpiField ?? 'conversions'} across ${untracked.length} delivering ad set${untracked.length === 1 ? '' : 's'}`,
        threshold: cfg.cpaTarget,
        window: 'd14',
        estImpactPerDay: spend / 14,
        source: 'engine',
      },
      needsApproval: true,
    });
  }

  return recs;
}
