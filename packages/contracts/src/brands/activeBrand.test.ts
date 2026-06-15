import { describe, expect, it } from "bun:test";

import { resolveActiveBrandId } from "./activeBrand";

describe("resolveActiveBrandId", () => {
  it("returns null when there are no permitted brands", () => {
    const result = resolveActiveBrandId({
      candidateBrandId: "brand-1",
      permittedBrandIds: [],
    });
    expect(result.activeBrandId).toBeNull();
    expect(result.shouldPersist).toBe(false);
  });

  it("accepts a valid candidate without flagging persistence", () => {
    const result = resolveActiveBrandId({
      candidateBrandId: "brand-2",
      permittedBrandIds: ["brand-1", "brand-2"],
    });
    expect(result.activeBrandId).toBe("brand-2");
    expect(result.shouldPersist).toBe(false);
  });

  it("falls back to the first permitted brand when the candidate is missing", () => {
    const result = resolveActiveBrandId({
      candidateBrandId: null,
      permittedBrandIds: ["brand-1", "brand-2"],
    });
    expect(result.activeBrandId).toBe("brand-1");
    expect(result.shouldPersist).toBe(true);
  });

  it("falls back when the candidate is not permitted", () => {
    const result = resolveActiveBrandId({
      candidateBrandId: "brand-3",
      permittedBrandIds: ["brand-1", "brand-2"],
    });
    expect(result.activeBrandId).toBe("brand-1");
    expect(result.shouldPersist).toBe(true);
  });

  it("treats a blank candidate as missing", () => {
    const result = resolveActiveBrandId({
      candidateBrandId: "   ",
      permittedBrandIds: ["brand-1"],
    });
    expect(result.activeBrandId).toBe("brand-1");
    expect(result.shouldPersist).toBe(true);
  });
});
