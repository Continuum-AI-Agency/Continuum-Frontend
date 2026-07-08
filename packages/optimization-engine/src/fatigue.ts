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

import type { EngineConfig } from './config';
import { costPerEvent, kpiEvents, scoreAdSet } from './scoring';
import type { AdSetSnapshot, Recommendation, WindowMetrics } from './types';

const isEvaluable = (s: AdSetSnapshot): boolean =>
  s.status !== 'frozen' && s.status !== 'flagged' && s.status !== 'starved';

const ctr = (m: WindowMetrics): number =>
  m.impressions && m.impressions > 0 ? (m.clicks ?? 0) / m.impressions : 0;

const isRemarketing = (a: AdSetSnapshot['audienceType']): boolean =>
  a === 'remarketing' || a === 'retargeting';

export function evaluateFatigue(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
  skipIds: Set<string> = new Set(),
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const s of snapshots) {
    if (!isEvaluable(s) || skipIds.has(s.id)) continue; // skip frozen/flagged/already-starved
    if (s.ageDays <= cfg.newItemProtectDays) continue; // young ad sets are still learning

    const d3 = s.windows.d3;
    const d14 = s.windows.d14;

    // Fatigue is for ad sets that STILL convert — a dead one is a pause trigger.
    if (kpiEvents(d14, cfg) <= 0 || kpiEvents(d3, cfg) <= 0) continue;

    const cppRecent = costPerEvent(d3, cfg);
    const cppBase = costPerEvent(d14, cfg);
    const cpaRising = cppBase > 0 && cppRecent > (1 + cfg.fatigueCpaDriftPct) * cppBase;
    if (!cpaRising) continue; // efficiency not decaying -> not fatigued
    if (scoreAdSet(s, cfg).trajectoryState === 'positive') continue; // recovering -> not fatigued

    const cpaUpPct = (((cppRecent - cppBase) / cppBase) * 100).toFixed(0);
    const freq = s.frequency7d ?? 0;
    const freqCap = isRemarketing(s.audienceType) ? cfg.fatigueFreqRemarketing : cfg.fatigueFreqProspecting;

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

    // F1 — creative fatigue (engagement decaying while CPA rises).
    const ctrRecent = ctr(d3);
    const ctrBase = ctr(d14);
    const ctrDrop = ctrBase > 0 && ctrRecent > 0 && ctrRecent < (1 - cfg.fatigueCtrDropPct) * ctrBase;
    if (ctrDrop) {
      const ctrDownPct = (((ctrBase - ctrRecent) / ctrBase) * 100).toFixed(0);
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
