// The numeric layer under costInterval: the regularized incomplete gamma, its inverse, and
// Garwood's bounds — pinned against published chi-square tables, not against ourselves.
import { expect, test } from 'bun:test';

import {
  gammaQuantile,
  poissonCountBounds,
  regularizedGammaP,
  standardNormalCdf,
} from '../src/significancePoisson';

test('regularizedGammaP: closed forms at a = 1 and a = ½', () => {
  // Gamma(1, 1) is Exponential(1): P(1, x) = 1 − e^−x.
  expect(regularizedGammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
  expect(regularizedGammaP(1, 5)).toBeCloseTo(1 - Math.exp(-5), 12);
  // P(½, x²) = erf(x); erf(1) = 0.8427007929.
  expect(regularizedGammaP(0.5, 1)).toBeCloseTo(0.8427007929, 9);
  expect(regularizedGammaP(3, 0)).toBe(0);
  // Both branches (series below a + 1, continued fraction above) meet without a seam.
  expect(regularizedGammaP(10, 10.999)).toBeCloseTo(regularizedGammaP(10, 11.001), 3);
});

test('gammaQuantile: χ²(p, k) / 2 matches the published table', () => {
  const chiSquare = (p: number, df: number) => 2 * gammaQuantile(df / 2, p);
  expect(chiSquare(0.025, 4)).toBeCloseTo(0.4844, 4);
  expect(chiSquare(0.025, 8)).toBeCloseTo(2.1797, 4);
  expect(chiSquare(0.025, 20)).toBeCloseTo(9.5908, 4);
  expect(chiSquare(0.025, 200)).toBeCloseTo(162.728, 3);
  expect(chiSquare(0.975, 2)).toBeCloseTo(7.3778, 4);
  expect(chiSquare(0.975, 6)).toBeCloseTo(14.4494, 4);
  expect(chiSquare(0.975, 10)).toBeCloseTo(20.4832, 4);
  expect(gammaQuantile(3, 0)).toBe(0);
  expect(gammaQuantile(3, 1)).toBe(Number.POSITIVE_INFINITY);
});

test('standardNormalCdf: z = 1.96 is the 97.5th percentile', () => {
  expect(standardNormalCdf(1.96)).toBeCloseTo(0.975, 5);
  expect(standardNormalCdf(-1.96)).toBeCloseTo(0.025, 5);
  expect(standardNormalCdf(0)).toBe(0.5);
  expect(standardNormalCdf(2.5758)).toBeCloseTo(0.995, 4);
});

test("poissonCountBounds: Garwood's exact interval, zero-bounded only at zero events", () => {
  // Zero events: the mean may be 0, and the 95% upper end is the 'rule of three' 3.69.
  const none = poissonCountBounds(0, 1.96);
  expect(none.lo).toBe(0);
  expect(none.hi).toBeCloseTo(3.689, 3);
  // One event already has a positive lower end — the count is not consistent with 0.
  // Three decimals: z = 1.96 denotes Φ(1.96) = 0.9750021, a hair past the table's 0.975.
  expect(poissonCountBounds(1, 1.96).lo).toBeCloseTo(0.0253, 3);
  expect(poissonCountBounds(1, 1.96).hi).toBeCloseTo(5.5717, 3);
  // Four events: χ²(0.025, 8)/2 and χ²(0.975, 10)/2.
  const four = poissonCountBounds(4, 1.96);
  expect(four.lo).toBeCloseTo(1.0898, 3);
  expect(four.hi).toBeCloseTo(10.2416, 3);
  // A wider z widens both ends.
  const wide = poissonCountBounds(4, 2.5758);
  expect(wide.lo).toBeLessThan(four.lo);
  expect(wide.hi).toBeGreaterThan(four.hi);
});
