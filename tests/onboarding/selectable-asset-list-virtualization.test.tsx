import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "../mocks/radixThemes";
import type { SelectableAsset } from "@/lib/schemas/integrations";

function createAsset(index: number): SelectableAsset {
  return {
    asset_pk: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    integration_account_id: `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`,
    external_id: `ext-${index}`,
    type: "facebook_page",
    name: `Asset ${index}`,
    business_id: null,
    ad_account_id: null,
  };
}

test("SelectableAssetList renders items in SSR even with large list", async () => {
  const { SelectableAssetList } = await import("@/components/onboarding/integrations/SelectableAssetList");
  const assets = Array.from({ length: 40 }, (_, i) => createAsset(i + 1));
  const html = renderToStaticMarkup(
    <SelectableAssetList
      provider="facebook"
      assets={assets}
      selectedAccountIds={new Set()}
      onToggleAccount={() => undefined}
    />
  );

  expect(html).toContain("Asset 40");
});
