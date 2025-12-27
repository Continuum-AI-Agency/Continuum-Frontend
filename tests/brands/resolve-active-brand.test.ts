import test from "node:test";
import assert from "node:assert/strict";

import { resolveActiveBrandId } from "../../src/lib/brands/resolve-active-brand";

test("resolveActiveBrandId returns null when no permitted brands", () => {
  const result = resolveActiveBrandId({
    candidateBrandId: "brand-1",
    permittedBrandIds: [],
  });

  assert.equal(result.activeBrandId, null);
  assert.equal(result.shouldPersist, false);
});

test("resolveActiveBrandId accepts a valid candidate", () => {
  const result = resolveActiveBrandId({
    candidateBrandId: "brand-2",
    permittedBrandIds: ["brand-1", "brand-2"],
  });

  assert.equal(result.activeBrandId, "brand-2");
  assert.equal(result.shouldPersist, false);
});

test("resolveActiveBrandId falls back when candidate missing", () => {
  const result = resolveActiveBrandId({
    candidateBrandId: null,
    permittedBrandIds: ["brand-1", "brand-2"],
  });

  assert.equal(result.activeBrandId, "brand-1");
  assert.equal(result.shouldPersist, true);
});

test("resolveActiveBrandId falls back when candidate not permitted", () => {
  const result = resolveActiveBrandId({
    candidateBrandId: "brand-3",
    permittedBrandIds: ["brand-1", "brand-2"],
  });

  assert.equal(result.activeBrandId, "brand-1");
  assert.equal(result.shouldPersist, true);
});
