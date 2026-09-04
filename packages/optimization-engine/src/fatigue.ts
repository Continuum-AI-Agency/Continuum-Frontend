// ---------------------------------------------------------------------------
// Stage B' — creative / audience FATIGUE. Independent of the pause triggers:
// the ad set is STILL converting, but recent efficiency is decaying. We never
// pause or restage it — we surface a renewal recommendation (always needs
// approval): refresh the creative, or expand / rotate the audience.
//   F1 — creative fatigue: CTR decaying + CPA rising (engagement worn out)
//   F2 — audience saturation: frequency over the per-audience cap + CPA rising
// Both require CPA to be rising (decaying efficiency); a healthy, high-frequency
// ad set that is still cheap is NOT flagged.
// ---------------------------------------------------------------------------

import { isCreativeEvaluable } from './classify';
import type { EngineConfig } from './config';
import { readDecay } from './decay';
import { scoreAdSet } from './scoring';
import type { AdSetSnapshot, Recommendation } from './types';

const isRemarketing = (a: AdSetSnapshot['audienceType']): boolean =>
  a === 'remarketing' || a === 'retargeting';

export function evaluateFatigue(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  skipIds: Set<string> = new Set(),
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

    // F2 — audience saturation (frequency over cap takes precedence: expanding the
    // audience is the lever, refreshing creative won't fix an exhausted pool).
    if (freq >= freqCap) {
      recs.push({
        adSetId: s.id,
        kind: 'audience_expand',
        trigger: 'F2_audience_saturation',
        severity: 'medium',
        reason: `Frequency ${freq.toFixed(1)} ≥ ${freqCap} with CPA up ${cpaUpPct}% (3d $${cppRecent.toFixed(0)} vs 14d $${cppBase.toFixed(0)}): audience saturated — expand or rotate.`,
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
        needsApproval: true,
      });
    }
  }

  return recs;
}
