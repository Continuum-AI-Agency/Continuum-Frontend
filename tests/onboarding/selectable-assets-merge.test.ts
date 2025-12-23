import { expect, test } from "bun:test";

import { createDefaultOnboardingState } from "@/lib/onboarding/state";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { mergeSelectableAssetsConnections } from "@/components/onboarding/selectableAssetsMerge";

function createEmptySelections(): Record<PlatformKey, Set<string>> {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {} as Record<PlatformKey, Set<string>>);
}

function createAsset(overrides: Partial<SelectableAsset> = {}): SelectableAsset {
  return {
    asset_pk: "11111111-1111-1111-1111-111111111111",
    integration_account_id: "22222222-2222-2222-2222-222222222222",
    external_id: "ext-1",
    type: "facebook_page",
    name: "Test Page",
    business_id: null,
    ad_account_id: null,
    ...overrides,
  };
}

function createResponse(overrides: Partial<SelectableAssetsResponse> = {}): SelectableAssetsResponse {
  return {
    synced_at: null,
    stale: false,
    assets: [],
    providers: {},
    ...overrides,
  };
}

test("mergeSelectableAssetsConnections merges assets into connections", () => {
  const state = createDefaultOnboardingState();
  const asset = createAsset();
  const selections = createEmptySelections();
  selections.facebook.add(asset.integration_account_id ?? "");

  const result = mergeSelectableAssetsConnections({
    prevConnections: state.connections,
    selectableAssets: [asset],
    selectableAssetsData: createResponse({ assets: [asset] }),
    selectedAccountIdsByKey: selections,
    isHydrated: true,
  });

  expect(result).not.toBeNull();
  const facebook = result?.facebook;
  expect(facebook?.accounts.length).toBe(1);
  expect(facebook?.accounts[0]?.id).toBe(asset.integration_account_id);
  expect(facebook?.accounts[0]?.selected).toBe(true);
  expect(facebook?.connected).toBe(true);
});

test("mergeSelectableAssetsConnections clears connections after hydration on empty payload", () => {
  const state = createDefaultOnboardingState();
  state.connections.facebook = {
    connected: true,
    accountId: "33333333-3333-3333-3333-333333333333",
    accounts: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Old Page",
        status: "active",
        selected: true,
      },
    ],
    integrationIds: ["44444444-4444-4444-4444-444444444444"],
    lastSyncedAt: null,
  };

  const result = mergeSelectableAssetsConnections({
    prevConnections: state.connections,
    selectableAssets: [],
    selectableAssetsData: createResponse({ providers: {} }),
    selectedAccountIdsByKey: createEmptySelections(),
    isHydrated: true,
  });

  expect(result).not.toBeNull();
  const facebook = result?.facebook;
  expect(facebook?.connected).toBe(false);
  expect(facebook?.accounts.length).toBe(0);
  expect(facebook?.integrationIds.length).toBe(0);
  expect(facebook?.accountId).toBeNull();
});

test("mergeSelectableAssetsConnections skips clearing before hydration", () => {
  const state = createDefaultOnboardingState();
  state.connections.facebook.connected = true;

  const result = mergeSelectableAssetsConnections({
    prevConnections: state.connections,
    selectableAssets: [],
    selectableAssetsData: createResponse({ providers: {} }),
    selectedAccountIdsByKey: createEmptySelections(),
    isHydrated: false,
  });

  expect(result).toBeNull();
});
