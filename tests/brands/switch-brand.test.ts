import test from "node:test";
import assert from "node:assert/strict";

import { switchBrand } from "../../src/lib/brands/switch-brand";

test("switchBrand skips when target brand is missing or unchanged", async () => {
  let switchCalls = 0;
  let refreshCalls = 0;

  const switchedEmpty = await switchBrand({
    targetBrandId: "",
    activeBrandId: "brand-1",
    switchAction: async () => {
      switchCalls += 1;
    },
    refresh: () => {
      refreshCalls += 1;
    },
  });

  const switchedSame = await switchBrand({
    targetBrandId: "brand-1",
    activeBrandId: "brand-1",
    switchAction: async () => {
      switchCalls += 1;
    },
    refresh: () => {
      refreshCalls += 1;
    },
  });

  assert.equal(switchedEmpty, false);
  assert.equal(switchedSame, false);
  assert.equal(switchCalls, 0);
  assert.equal(refreshCalls, 0);
});

test("switchBrand triggers switch action and refresh when brand changes", async () => {
  let switchedTo: string | null = null;
  let refreshed = false;

  const didSwitch = await switchBrand({
    targetBrandId: "brand-2",
    activeBrandId: "brand-1",
    switchAction: async brandId => {
      switchedTo = brandId;
    },
    refresh: () => {
      refreshed = true;
    },
  });

  assert.equal(didSwitch, true);
  assert.equal(switchedTo, "brand-2");
  assert.equal(refreshed, true);
});
