import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "../mocks/radixThemes";
import type { MetaSelectableAdAccountBundles } from "@/lib/integrations/selectableAssets";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";

function createEmptySelections(): Record<PlatformKey, Set<string>> {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {} as Record<PlatformKey, Set<string>>);
}

function createAsset(overrides: Partial<SelectableAsset> = {}): SelectableAsset {
  return {
    asset_pk: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    integration_account_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    external_id: "ext-asset",
    type: "meta_ad_account",
    name: "Meta Ad Account",
    business_id: null,
    ad_account_id: "ad-1",
    ...overrides,
  };
}

test("MetaBundlesAccordion badge reflects partial selection", async () => {
  const { MetaBundlesAccordion } = await import("@/components/onboarding/integrations/MetaBundlesAccordion");
  const adAccount = createAsset({
    integration_account_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    type: "meta_ad_account",
    name: "Primary Ad",
  });
  const pageAsset = createAsset({
    asset_pk: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    integration_account_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    type: "meta_page",
    name: "Page One",
    ad_account_id: "ad-1",
  });

  const bundles: MetaSelectableAdAccountBundles = {
    ad_accounts: [
      {
        ad_account_id: "ad-1",
        ad_account: adAccount,
        assets: [pageAsset],
      },
    ],
    assets_without_ad_account: [],
  };

  const selections = createEmptySelections();
  selections.facebook.add(adAccount.integration_account_id ?? "");

  const html = renderToStaticMarkup(
    <MetaBundlesAccordion
      bundles={bundles}
      selectedAccountIdsByKey={selections}
      onToggleAssets={() => undefined}
      onToggleAccount={() => undefined}
    />
  );

  expect(html).toContain("Selected 1/2");
});
