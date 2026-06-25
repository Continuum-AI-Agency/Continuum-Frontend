import { describe, expect, it } from "bun:test";

import {
  deriveInterestArea,
  derivePrimaryPlanCode,
  productsForSelection,
} from "../planSelection";

describe("productsForSelection", () => {
  it("expands Canvas Organic into studio + organic_agent", () => {
    expect(productsForSelection(["canvas_organic"], "off").sort()).toEqual(["organic_agent", "studio"]);
  });

  it("adds the trends product when a tier is chosen", () => {
    expect(productsForSelection(["canvas_organic"], "pro")).toContain("trends");
    expect(productsForSelection(["canvas_organic"], "off")).not.toContain("trends");
  });

  it("combines multiple bundles", () => {
    const products = productsForSelection(["canvas_organic", "paid_media"], "off");
    expect(products).toContain("studio");
    expect(products).toContain("paid_media");
  });

  it("returns nothing for an empty selection", () => {
    expect(productsForSelection([], "off")).toEqual([]);
  });
});

describe("deriveInterestArea", () => {
  it("maps product mixes to an interest area", () => {
    expect(deriveInterestArea(["studio", "organic_agent"])).toBe("organic");
    expect(deriveInterestArea(["paid_media"])).toBe("paid_media");
    expect(deriveInterestArea(["studio", "paid_media"])).toBe("both");
    expect(deriveInterestArea([])).toBeNull();
  });
});

describe("derivePrimaryPlanCode", () => {
  it("prefers paid_media, then organic_studio, then mcp", () => {
    expect(derivePrimaryPlanCode(["studio", "paid_media"])).toBe("paid_media");
    expect(derivePrimaryPlanCode(["studio"])).toBe("organic_studio");
    expect(derivePrimaryPlanCode(["mcp"])).toBe("mcp");
    expect(derivePrimaryPlanCode([])).toBeNull();
  });
});
