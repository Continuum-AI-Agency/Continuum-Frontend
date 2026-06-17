// Small numeric helpers shared across the engine. Internal — not part of the
// package's public API (index.ts).

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));
