// ---------------------------------------------------------------------------
// Statistical rigor (P1) — uncertainty on top of the 3/7/14 weighted score,
// WITHOUT changing the calibrated weights:
//   - cpaInterval: a confidence interval on an ad set's CPA, driven by the
//     event count (Poisson, exact — see significancePoisson.ts). Sparse data =>
//     wide interval => "don't trust me".
//   - shrinkScores: empirical-Bayes shrinkage — pull a sparse ad set's score
//     toward the cohort mean in proportion to its sample size, so a lucky/unlucky
//     low-volume ad set doesn't swing the reallocation.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { kpiEvents } from './scoring';
import { poissonCountBounds } from './significancePoisson';
import type { AdSetSnapshot, CpaInterval, WindowMetrics } from './types';

/** CI on cost-per-event from raw spend and event counts. The uncertainty is in the
 *  event count: events are ~Poisson, and the interval is Garwood's exact one on the Poisson
 *  mean (`significancePoisson.ts`), inverted through the spend — a cost per result is
 *  spend ÷ count, so the count's lower end is the cost's upper end. Few events => wide.
 *
 *  Split out from cpaInterval so anything holding a (spend, events) pair — a creative
 *  bucket, a label cluster, an ad — prices its uncertainty with the SAME arithmetic an
 *  ad set does. Two Poisson intervals in one codebase is one too many.
 *
 *  WHY EXACT, AND NOT N ± z√N. The normal approximation's lower count N − z√N is not
 *  positive until N > z² (3.84 at 95%), so it had two failure modes in a row. First it was
 *  clamped to 1e-6 "so the upper CPA bound stays finite", which turned spend into
 *  spend × 1,000,000: live on Easy Fit's FORMULARIOS // TODOS — a portfolio whose whole daily
 *  budget is 324 — the ad set ALEIRA // AGOSTO - LKL spent 339.70 for 2 leads over 14 days and
 *  the stored row carried `hi: 339700000`, which a client read on a card as the top of a
 *  cost-per-lead range. Then the clamp went and the bound became null at N ≤ 3 — true, but
 *  a cliff: at N = 4 the divisor is 0.08, so 346.40 spent on 4 results (an estimate of
 *  86.60) printed an upper bound of 4,330.00, fifty times the estimate, and one result
 *  fewer printed nothing at all.
 *
 *  Garwood's lower count at N = 4 is χ²(0.025, 8)/2 = 1.09, and the same 346.40 bounds at
 *  317.85. At N = 2 ALEIRA bounds at 1,402.57 — wide, finite, and under the 4,536 the
 *  portfolio could have spent over the window. The bound is continuous in N from 1 up, and
 *  at N ≥ 100 it agrees with N ± z√N to within two percent (the tests pin the convergence).
 *
 *  WHY `hi` IS STILL NULLABLE. With no events the exact interval's lower count is 0: the
 *  window is consistent with a rate of zero, and spend ÷ 0 is no upper bound at all. That
 *  is the one case left, and every reader still has to say so. */
export function costInterval(spend: number, events: number, z = 1.96): CpaInterval {
  if (events <= 0 || spend <= 0) return { cpa: 0, lo: 0, hi: null, events: 0 };
  const count = poissonCountBounds(events, z);
  return { cpa: spend / events, lo: spend / count.hi, hi: spend / count.lo, events };
}

/** Why an interval has no upper bound, in the words a surface can print. Null when it has one. */
export function upperBoundMissingBecause(interval: CpaInterval): string | null {
  return interval.hi != null ? null : 'no events to divide the spend by';
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
