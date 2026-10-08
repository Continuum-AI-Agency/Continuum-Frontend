// ---------------------------------------------------------------------------
// The exact (Garwood) confidence interval on a Poisson count.
//
// A count of N events over a window is one draw from Poisson(λ). The question the cost
// interval asks is "which λ could plausibly have produced N?", and Garwood (1936) answers it
// exactly through the chi-square distribution, with no appeal to N being large:
//
//   λ_lo = χ²(α/2, 2N) / 2          (0 when N = 0 — nothing was seen, λ may be 0)
//   λ_hi = χ²(1 − α/2, 2N + 2) / 2
//
// χ²(p, 2k)/2 is the p-quantile of Gamma(k, 1), so both ends are one function: the inverse
// of the regularized lower incomplete gamma P(k, x). That is what this file computes, with
// the series and continued-fraction forms of P and a bracketed bisection for its inverse.
// `z` stays the caller's currency — the tail α/2 = 1 − Φ(z) comes from the same P, since
// erf(x) = P(½, x²) — so a caller asking for z = 1.96 still gets 95%.
//
// The normal approximation N ± z√N is the large-N limit of this and is what every consumer
// used to get. It is wrong where it matters: its lower end N − z√N is not positive until
// N > z², so at N ≤ 3 it says "no bound" and at N = 4 it says 0.08 — a divisor that turns a
// 346.40 spend into a 4,330 upper bound on a cost per result whose estimate is 86.60. The
// exact lower end at N = 4 is 1.09 (χ²(0.025, 8)/2), and the bound is 318. At N ≥ 100 the two
// agree to about a percent, which is the convergence the tests pin.
// ---------------------------------------------------------------------------

/** Log Γ(x) for x > 0 — Lanczos approximation (g = 7, n = 9), accurate to ~1e-15. */
function lnGamma(x: number): number {
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const shifted = x - 1;
  let sum = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) sum += coefficients[i] / (shifted + i);
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

const EPSILON = 1e-15;
const MAX_ITERATIONS = 1000;

/** P(a, x) by its power series — converges fast when x < a + 1. */
function gammaPBySeries(a: number, x: number): number {
  let term = 1 / a;
  let sum = term;
  let denominator = a;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    denominator += 1;
    term *= x / denominator;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPSILON) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Q(a, x) = 1 − P(a, x) by its continued fraction (modified Lentz) — for x ≥ a + 1. */
function gammaQByContinuedFraction(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a), the CDF of Gamma(a, 1). */
export function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaPBySeries(a, x) : 1 - gammaQByContinuedFraction(a, x);
}

/** The p-quantile of Gamma(a, 1): the x with P(a, x) = p. Equals χ²(p, 2a) / 2. */
export function gammaQuantile(a: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let lo = 0;
  let hi = Math.max(1, a);
  while (regularizedGammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedGammaP(a, mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo <= hi * 1e-13) break;
  }
  return (lo + hi) / 2;
}

/** Φ(z), the standard normal CDF, through erf(x) = P(½, x²). */
export function standardNormalCdf(z: number): number {
  const erf = regularizedGammaP(0.5, (z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export type PoissonCountBounds = { lo: number; hi: number };

/** Garwood's exact two-sided interval on the Poisson mean behind a count of `events`, at the
 *  coverage a normal quantile of `z` denotes (z = 1.96 ⇒ 95%). `lo` is 0 exactly when no
 *  event was seen, and positive for every count of one or more. */
export function poissonCountBounds(events: number, z: number): PoissonCountBounds {
  const tail = 1 - standardNormalCdf(z);
  return {
    lo: events > 0 ? gammaQuantile(events, tail) : 0,
    hi: gammaQuantile(events + 1, 1 - tail),
  };
}
