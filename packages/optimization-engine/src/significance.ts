// ---------------------------------------------------------------------------
// Statistical rigor (P1) — uncertainty on top of the 3/7/14 weighted score,
// WITHOUT changing the calibrated weights:
//   - cpaInterval: a confidence interval on an ad set's CPA, driven by the
//     event count (Poisson). Sparse data => wide interval => "don't trust me".
//   - shrinkScores: empirical-Bayes shrinkage — pull a sparse ad set's score
//     toward the cohort mean in proportion to its sample size, so a lucky/unlucky
//     low-volume ad set doesn't swing the reallocation.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { kpiEvents } from './scoring';
import type { AdSetSnapshot, CpaInterval, WindowMetrics } from './types';

/** CI on cost-per-event from raw spend and event counts. The uncertainty is in the
 *  event count: events are ~Poisson, so a count of N has SD ~sqrt(N). Few events =>
 *  wide interval.
 *
 *  Split out from cpaInterval so anything holding a (spend, events) pair — a creative
 *  bucket, a label cluster, an ad — prices its uncertainty with the SAME arithmetic an
 *  ad set does. Two Poisson intervals in one codebase is one too many. */
export function costInterval(spend: number, events: number, z = 1.96): CpaInterval {
  if (events <= 0 || spend <= 0) return { cpa: 0, lo: 0, hi: 0, events: 0 };
  const cpa = spend / events;
  const se = Math.sqrt(events);
  const eLo = Math.max(events - z * se, 1e-6); // clamp so the upper CPA bound stays finite
  const eHi = events + z * se;
  return { cpa, lo: spend / eHi, hi: spend / eLo, events };
}

/** CI on CPA = spend / events for one window, using the config's KPI currency. */
export function cpaInterval(m: WindowMetrics, cfg: EngineConfig, z = 1.96): CpaInterval {
  return costInterval(m.spend, kpiEvents(m, cfg), z);
}

/** Ad-set CPA interval over the widest (most stable) window. */
export function adSetCpaInterval(s: AdSetSnapshot, cfg: EngineConfig, z = 1.96): CpaInterval {
  return cpaInterval(s.windows.d14, cfg, z);
}

/** Empirical-Bayes shrinkage of a cohort of scores toward an event-weighted grand
 *  mean. shrunk = w·score + (1−w)·mean, w = events/(events+k). High-volume items
 *  keep their score; sparse ones are pulled to the prior. */
export function shrinkScores<T extends { score: number; events: number }>(
  items: T[],
  k: number,
): (T & { shrunk: number })[] {
  if (items.length === 0) return [];
  const wsum = items.reduce((a, b) => a + Math.max(0, b.events), 0);
  const mean =
    wsum > 0
      ? items.reduce((a, b) => a + b.score * Math.max(0, b.events), 0) / wsum
      : items.reduce((a, b) => a + b.score, 0) / items.length;
  return items.map((it) => {
    const w = it.events > 0 ? it.events / (it.events + k) : 0;
    return { ...it, shrunk: w * it.score + (1 - w) * mean };
  });
}
