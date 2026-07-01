import { describe, expect, it } from "bun:test";

import { buildEntityPathLabel, entityHierarchySchema } from "./hierarchy";

describe("buildEntityPathLabel", () => {
  it("joins campaign › adset › ad names", () => {
    const hierarchy = entityHierarchySchema.parse({
      campaign: { id: "7", name: "Spring Sale" },
      adset: { id: "45", name: "LAL 1%" },
      ad: { id: "123", name: "High Hook" },
    });
    expect(buildEntityPathLabel(hierarchy)).toBe("Spring Sale › LAL 1% › High Hook");
  });

  it("skips levels whose name is missing", () => {
    const hierarchy = entityHierarchySchema.parse({
      campaign: { id: "7", name: "Spring Sale" },
      adset: { id: "45", name: null },
      ad: { id: "123", name: "High Hook" },
    });
    expect(buildEntityPathLabel(hierarchy)).toBe("Spring Sale › High Hook");
  });

  it("returns an empty string for an empty hierarchy", () => {
    expect(buildEntityPathLabel(entityHierarchySchema.parse({}))).toBe("");
  });
});
