import { describe, it, expect } from "bun:test";
import { getMetaSelectableAdAccountBundles } from "./selectableAssets";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";

function metaAdAccount(overrides: Partial<SelectableAsset>): SelectableAsset {
  return {
    asset_pk: "00000000-0000-0000-0000-000000000000",
    integration_account_id: "00000000-0000-0000-0000-000000000000",
    external_id: "act_123",
    type: "meta_ad_account",
    name: "Shared Ad Account",
    business_id: "biz-1",
    ad_account_id: "123",
    role: null,
    also_accessible_via: null,
    ...overrides,
  };
}

function responseWith(assets: SelectableAsset[]): SelectableAssetsResponse {
  return { synced_at: null, stale: false, assets, providers: {} };
}

describe("getMetaSelectableAdAccountBundles cross-login dedup (#155)", () => {
  it("collapses one ad account reached via two logins into a single bundle, keeping the highest-privilege row", () => {
    // Same ad_account_id, different local ids (two Meta logins) + different roles.
    const advertiserRow = metaAdAccount({
      asset_pk: "11111111-1111-1111-1111-111111111111",
      integration_account_id: "11111111-1111-1111-1111-111111111111",
      role: "advertiser",
    });
    const analystRow = metaAdAccount({
      asset_pk: "22222222-2222-2222-2222-222222222222",
      integration_account_id: "22222222-2222-2222-2222-222222222222",
      role: "analyst",
    });

    const bundles = getMetaSelectableAdAccountBundles(responseWith([analystRow, advertiserRow]));

    expect(bundles).not.toBeNull();
    // Exactly one ad-account bundle for the shared id — not two duplicate rows.
    expect(bundles!.ad_accounts).toHaveLength(1);
    const bundle = bundles!.ad_accounts[0];
    expect(bundle.ad_account_id).toBe("123");
    // The advertiser login wins over the analyst login regardless of input order.
    expect(bundle.ad_account?.role).toBe("advertiser");
    expect(bundle.ad_account?.integration_account_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("keeps distinct ad accounts as separate bundles", () => {
    const first = metaAdAccount({
      asset_pk: "11111111-1111-1111-1111-111111111111",
      integration_account_id: "11111111-1111-1111-1111-111111111111",
      external_id: "act_123",
      ad_account_id: "123",
      role: "advertiser",
    });
    const second = metaAdAccount({
      asset_pk: "22222222-2222-2222-2222-222222222222",
      integration_account_id: "22222222-2222-2222-2222-222222222222",
      external_id: "act_999",
      ad_account_id: "999",
      role: "analyst",
    });

    const bundles = getMetaSelectableAdAccountBundles(responseWith([first, second]));
    expect(bundles!.ad_accounts.map((b) => b.ad_account_id).sort()).toEqual(["123", "999"]);
  });
});
