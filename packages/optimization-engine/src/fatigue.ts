// ---------------------------------------------------------------------------
// Stage B' — creative / audience FATIGUE. Independent of the pause triggers:
// the ad set is STILL converting, but recent efficiency is decaying. We never
// pause or restage it — we surface a renewal recommendation (always needs
// approval): refresh the creative, or expand / rotate the audience.
//   F1 — creative fatigue: CTR decaying + CPA rising (engagement worn out)
//   F2 — audience saturation: frequency over the per-audience cap + CPA rising
//   F3 — audience EXHAUSTED: reach has stopped growing + CPA rising
// All three require CPA to be rising (decaying efficiency); a healthy, high-frequency
// ad set that is still cheap is NOT flagged.
//
// F3 exists because F2 asks the saturation question through a fixed frequency cap, and on
// a real account that cap is almost never reached — mean frequency 1.45 against a 3.0
// cap, and F2 fired on one ad set out of 115. Frequency is a ratio of two things that
// both move; the reach curve asks the same question directly. An audience can be used up
// at frequency 1.6 if it is a small audience.
// ---------------------------------------------------------------------------

import { isCreativeEvaluable } from './classify';
import type { EngineConfig } from './config';
import { readDecay } from './decay';
import { REACH_EXHAUSTED_EXPANSION } from './delivery';
import { scoreAdSet } from './scoring';
import type { AdSetSnapshot, DeliveryRead, Recommendation } from './types';

const isRemarketing = (a: AdSetSnapshot['audienceType']): boolean =>
  a === 'remarketing' || a === 'retargeting';

export function evaluateFatigue(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  skipIds: Set<string> = new Set(),
  deliveryReads: ReadonlyMap<string, DeliveryRead> = new Map(),
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const s of snapshots) {
    // A budget-authority freeze (CBO / lifetime) does NOT silence fatigue: refreshing a
    // creative and expanding an audience are suggestions, not budget moves. See
    // isCreativeEvaluable.
    if (!isCreativeEvaluable(s) || skipIds.has(s.id)) continue;
    if (s.ageDays <= cfg.newItemProtectDays) continue; // young ad sets are still learning

    const d3 = s.windows.d3;
    const d14 = s.windows.d14;

    // Read d3 against d14 once; F1 and F2 both branch off the same numbers. The identical
    // read runs per-CREATIVE in creative.ts — see decay.ts for why it is not copied.
    const decay = readDecay(d3, d14, cfg, {
      cpaDriftPct: cfg.fatigueCpaDriftPct,
      ctrDropPct: cfg.fatigueCtrDropPct,
    });

    // Fatigue is for ad sets that STILL convert — a dead one is a pause trigger.
    if (!decay.convertsInBothWindows) continue;
    if (!decay.cpaRising) continue; // efficiency not decaying -> not fatigued
    if (scoreAdSet(s, cfg).trajectoryState === 'positive') continue; // recovering -> not fatigued

    const { cppRecent, cppBase } = decay;
    const cpaUpPct = decay.cpaUpPct.toFixed(0);
    const freq = s.frequency7d ?? 0;
    const freqCap = isRemarketing(s.audienceType)
      ? cfg.fatigueFreqRemarketing
      : cfg.fatigueFreqProspecting;
    // The money a fatigue call puts on the table: the share of today's spend that is the
    // CPA rise itself. Spending $90/day at a CPA up 50% means $30/day is the decay.
    const dailySpend = s.windows.d3.spend / 3;
    const excessPerDay = dailySpend * (decay.cpaUpPct / (100 + decay.cpaUpPct));

    // F2 — audience saturation (frequency over cap takes precedence: expanding the
    // audience is the lever, refreshing creative won't fix an exhausted pool).
    if (freq >= freqCap) {
      recs.push({
        adSetId: s.id,
        kind: 'audience_expand',
        trigger: 'F2_audience_saturation',
        severity: 'medium',
        reason: `Frequency ${freq.toFixed(1)} ≥ ${freqCap} with CPA up ${cpaUpPct}% (3d $${cppRecent.toFixed(0)} vs 14d $${cppBase.toFixed(0)}): audience saturated — expand or rotate.`,
        evidence: {
          metric: 'frequency',
          value: freq,
          comparator: `at or over the ${freqCap} cap, CPA up ${cpaUpPct}%`,
          threshold: freqCap,
          window: 'd7',
          estImpactPerDay: excessPerDay,
          // The frequency IS the finding — the money is what the decay it causes costs.
          // `from → to` is the value and its ceiling, which is exactly the comparison the
          // trigger fired on; one decimal because 3 and 3.2 are different verdicts here.
          headline: {
            kind: 'count',
            value: Math.round(freq * 10) / 10,
            unit: 'count',
            label: 'times each person saw it',
            from: Math.round(freq * 10) / 10,
            to: freqCap,
          },
          source: 'engine',
        },
        needsApproval: true,
      });
      continue;
    }

    // F3 — audience EXHAUSTED. Fourteen days of delivery reached barely more people than
    // the last seven did, and efficiency is decaying: the pool is used up, not the
    // creative. Ordered before F1 for the same reason F2 is — when the audience is the
    // constraint, a new creative is shown to the same people and buys very little.
    //
    // Reads the reach curve rather than the frequency scalar, so it can fire on a small
    // audience at frequency 1.6, which is where this account actually lives. Silent when
    // the reach read is missing: unknown is not "flat".
    const reachExpansion = deliveryReads.get(s.id)?.reachExpansion ?? null;
    if (reachExpansion !== null && reachExpansion <= REACH_EXHAUSTED_EXPANSION) {
      const newPeoplePct = ((reachExpansion - 1) * 100).toFixed(0);
      recs.push({
        adSetId: s.id,
        kind: 'audience_expand',
        trigger: 'F3_audience_exhausted',
        severity: 'medium',
        reason: `Doubling the window to 14 days reached only ${newPeoplePct}% more people than the last 7 did, with CPA up ${cpaUpPct}% (3d $${cppRecent.toFixed(0)} vs 14d $${cppBase.toFixed(0)}) at frequency ${freq.toFixed(1)}. The audience is used up, not the creative — a new ad here is shown to the same people. Widen or rotate the audience.`,
        evidence: {
          metric: 'reach_expansion',
          value: reachExpansion,
          comparator: `14d reach vs 7d — only ${newPeoplePct}% new people, CPA up ${cpaUpPct}%`,
          threshold: REACH_EXHAUSTED_EXPANSION,
          window: 'd14',
          estImpactPerDay: excessPerDay,
          // A slice of a whole, not a movement: of everyone the 14-day window reached, this
          // is the part the extra seven days added. No `from → to` — the threshold is a
          // reach RATIO and the headline is a percentage, and printing one as the other is
          // how a card ends up comparing 4% against 1.05.
          headline: {
            kind: 'share',
            value: Math.round((reachExpansion - 1) * 100),
            unit: 'percent',
            label: 'of 14d reach is new',
            from: null,
            to: null,
          },
          source: 'engine',
        },
        needsApproval: true,
      });
      continue;
    }

    // F1 — creative fatigue (engagement decaying while CPA rises). The CTR gate is
    // "did d3 DELIVER", not "did d3 get clicks" — readDecay owns that distinction now.
    if (decay.ctrDropped) {
      const { ctrRecent, ctrBase } = decay;
      const ctrDownPct = decay.ctrDownPct.toFixed(0);
      recs.push({
        adSetId: s.id,
        kind: 'creative_refresh',
        trigger: 'F1_creative_fatigue',
        severity: 'medium',
        reason: `CTR down ${ctrDownPct}% (3d ${(ctrRecent * 100).toFixed(2)}% vs 14d ${(ctrBase * 100).toFixed(2)}%) with CPA up ${cpaUpPct}%: creative worn out — refresh.`,
        evidence: {
          metric: 'ctr',
          value: ctrRecent,
          comparator: `down ${ctrDownPct}% vs 14d, CPA up ${cpaUpPct}%`,
          threshold: ctrBase,
          window: 'd3',
          estImpactPerDay: excessPerDay,
          // The engagement drop is what this trigger found; the CPA rise is the consequence
          // it is priced by. No `from → to`: both sides are CTRs near 1%, and a headline
          // percentage prints whole, so "1% → 1%" would show a drop of nothing.
          headline: {
            kind: 'drift',
            value: Math.round(decay.ctrDownPct),
            unit: 'percent',
            label: 'less click-through than 14d',
            from: null,
            to: null,
          },
          source: 'engine',
        },
        needsApproval: true,
      });
    }
  }

  return recs;
}
