import { describe, expect, it } from "bun:test";
import { isPaidTier } from "../tier";

describe("isPaidTier", () => {
  it("returns false for tier 0 (free)", () => {
    expect(isPaidTier(0)).toBe(false);
  });

  it("returns true for tier 1", () => {
    expect(isPaidTier(1)).toBe(true);
  });

  it("returns true for any positive tier", () => {
    expect(isPaidTier(2)).toBe(true);
    expect(isPaidTier(99)).toBe(true);
  });

  it("returns false for negative values (safety)", () => {
    expect(isPaidTier(-1)).toBe(false);
  });
});
