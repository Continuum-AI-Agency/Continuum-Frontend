import { describe, expect, it } from "bun:test";

import { ceilingForTarget, nextDisplayPercent } from "./useSmoothTrendProgress";

describe("ceilingForTarget", () => {
  it("creeps to just under the next backend anchor", () => {
    expect(ceilingForTarget(8)).toBe(33); // next anchor 34 → 33
    expect(ceilingForTarget(34)).toBe(57); // next anchor 58 → 57
    expect(ceilingForTarget(90)).toBe(99); // next anchor 100 → 99
  });

  it("returns 100 at or past the final anchor", () => {
    expect(ceilingForTarget(100)).toBe(100);
    expect(ceilingForTarget(120)).toBe(100);
  });

  it("never returns below the current target", () => {
    expect(ceilingForTarget(57)).toBeGreaterThanOrEqual(57);
  });
});

describe("nextDisplayPercent", () => {
  it("is monotonic — never moves backward and honors a real checkpoint floor", () => {
    const result = nextDisplayPercent({ current: 40, target: 58, ceiling: 67, dtMs: 16, remainingMs: 30000 });
    expect(result).toBeGreaterThanOrEqual(58);
  });

  it("never exceeds the ceiling before the next checkpoint", () => {
    const result = nextDisplayPercent({ current: 56.9, target: 34, ceiling: 57, dtMs: 100000, remainingMs: 100 });
    expect(result).toBeLessThanOrEqual(57);
  });

  it("paces toward 100 using the backend remaining_ms", () => {
    // base 50, 50% left, 5s remaining → ~1%/100ms; 100ms tick ≈ +1
    const result = nextDisplayPercent({ current: 50, target: 50, ceiling: 99, dtMs: 100, remainingMs: 5000 });
    expect(result).toBeGreaterThan(50);
    expect(result).toBeCloseTo(51, 0);
  });

  it("falls back to a stage-paced creep when remaining_ms is absent", () => {
    const result = nextDisplayPercent({ current: 8, target: 8, ceiling: 33, dtMs: 4000 });
    expect(result).toBeGreaterThan(8);
    expect(result).toBeLessThanOrEqual(33);
  });

  it("clamps at the ceiling once reached", () => {
    expect(nextDisplayPercent({ current: 99, target: 90, ceiling: 99, dtMs: 1000, remainingMs: 1000 })).toBe(99);
  });
});
