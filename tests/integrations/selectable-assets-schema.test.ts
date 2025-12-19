import { describe, expect, test } from "bun:test";
import {
  integrationAssetsResponseSchema,
  selectableAssetsResponseSchema,
  type SelectableAssetsResponse,
} from "@/lib/schemas/integrations";
import { getMetaSelectableAdAccountBundles, getSelectableAssetsFlatList } from "@/lib/integrations/selectableAssets";

const SAMPLE_ASSET = {
  asset_pk: "11111111-1111-1111-1111-111111111111",
  integration_account_id: "22222222-2222-2222-2222-222222222222",
  external_id: "ext_1",
  type: "meta_ad_account",
  name: "Account 1",
  business_id: "biz_1",
  ad_account_id: "act_1",
};

const SAMPLE_PAGE_ASSET = {
  asset_pk: "44444444-4444-4444-4444-444444444444",
  integration_account_id: "55555555-5555-5555-5555-555555555555",
  external_id: "ext_page_1",
  type: "meta_page",
  name: "Page 1",
  business_id: "biz_1",
  ad_account_id: "act_1",
};

describe("selectable assets schemas", () => {
  test("selectableAssetsResponseSchema accepts legacy payload", () => {
    const parsed = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: false,
      assets: [SAMPLE_ASSET],
    });

    expect(parsed.providers).toEqual({});
  });

  test("selectableAssetsResponseSchema accepts provider-categorized payload", () => {
    const parsed = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: true,
      assets: [SAMPLE_ASSET],
      providers: {
        meta: {
          assets: [SAMPLE_ASSET],
          hierarchy: {
            meta: {
              integrations: [
                {
                  integration_id: "33333333-3333-3333-3333-333333333333",
                  businesses: [
                    {
                      business_id: "biz_1",
                      business_name: "Business 1",
                      ad_accounts: [
                        {
                          ad_account_id: "act_1",
                          ad_account: SAMPLE_ASSET,
                          pages: [],
                          instagram_accounts: [],
                          threads_accounts: [],
                        },
                      ],
                      pages_without_ad_account: [],
                      instagram_accounts_without_ad_account: [],
                      threads_accounts_without_ad_account: [],
                    },
                  ],
                },
              ],
            },
          },
        },
        google: {
          assets: [],
        },
      },
    });

    expect(parsed.providers.meta.assets).toHaveLength(1);
    expect(parsed.providers.meta.hierarchy?.meta.integrations).toHaveLength(1);
  });

  test("selectableAssetsResponseSchema accepts hierarchy-only provider payloads", () => {
    const parsed = selectableAssetsResponseSchema.parse({
      synced_at: "2025-12-16T23:04:15.064+00:00",
      stale: false,
      providers: {
        google: { asset_count: 0 },
        meta: {
          asset_count: 2,
          hierarchy: {
            integrations: [
              {
                integration_id: "33333333-3333-3333-3333-333333333333",
                businesses: [
                  {
                    business_id: null,
                    business_name: null,
                    ad_accounts: [
                      {
                        ad_account_id: "act_1",
                        ad_account: SAMPLE_ASSET,
                        pages: [SAMPLE_PAGE_ASSET],
                        instagram_accounts: [],
                        threads_accounts: [],
                      },
                    ],
                    pages_without_ad_account: [],
                    instagram_accounts_without_ad_account: [],
                    threads_accounts_without_ad_account: [],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(parsed.assets).toEqual([]);
    expect(parsed.providers.meta.hierarchy?.meta.integrations).toHaveLength(1);
  });

  test("getSelectableAssetsFlatList returns the cross-provider assets list", () => {
    const response: SelectableAssetsResponse = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: false,
      assets: [SAMPLE_ASSET],
      providers: {
        meta: { assets: [SAMPLE_ASSET] },
      },
    });

    expect(getSelectableAssetsFlatList(response)).toEqual([SAMPLE_ASSET]);
  });

  test("getSelectableAssetsFlatList flattens provider hierarchy when assets are omitted", () => {
    const response: SelectableAssetsResponse = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: false,
      providers: {
        meta: {
          asset_count: 2,
          hierarchy: {
            integrations: [
              {
                integration_id: "33333333-3333-3333-3333-333333333333",
                businesses: [
                  {
                    business_id: null,
                    business_name: null,
                    ad_accounts: [
                      {
                        ad_account_id: "act_1",
                        ad_account: SAMPLE_ASSET,
                        pages: [SAMPLE_PAGE_ASSET],
                        instagram_accounts: [],
                        threads_accounts: [],
                      },
                    ],
                    pages_without_ad_account: [],
                    instagram_accounts_without_ad_account: [],
                    threads_accounts_without_ad_account: [],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(getSelectableAssetsFlatList(response)).toEqual([SAMPLE_ASSET, SAMPLE_PAGE_ASSET]);
  });

  test("getMetaSelectableAdAccountBundles groups by ad account and ignores businesses", () => {
    const response: SelectableAssetsResponse = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: false,
      providers: {
        meta: {
          hierarchy: {
            integrations: [
              {
                integration_id: "33333333-3333-3333-3333-333333333333",
                businesses: [
                  {
                    business_id: "biz_1",
                    business_name: "Business 1",
                    ad_accounts: [
                      {
                        ad_account_id: "act_1",
                        ad_account: SAMPLE_ASSET,
                        pages: [SAMPLE_PAGE_ASSET],
                        instagram_accounts: [
                          {
                            ...SAMPLE_PAGE_ASSET,
                            asset_pk: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                            integration_account_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                            external_id: "ext_ig_1",
                            type: "meta_instagram_account",
                            name: "IG 1",
                          },
                        ],
                        threads_accounts: [
                          {
                            ...SAMPLE_PAGE_ASSET,
                            asset_pk: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                            integration_account_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
                            external_id: "ext_threads_1",
                            type: "meta_threads_account",
                            name: "Threads 1",
                          },
                        ],
                      },
                    ],
                    pages_without_ad_account: [],
                    instagram_accounts_without_ad_account: [],
                    threads_accounts_without_ad_account: [],
                  },
                  {
                    business_id: "biz_2",
                    business_name: "Business 2",
                    ad_accounts: [
                      {
                        ad_account_id: "act_1",
                        ad_account: SAMPLE_ASSET,
                        pages: [
                          {
                            ...SAMPLE_PAGE_ASSET,
                            asset_pk: "66666666-6666-6666-6666-666666666666",
                            integration_account_id: "77777777-7777-7777-7777-777777777777",
                            external_id: "ext_page_2",
                            name: "Page 2",
                          },
                        ],
                        instagram_accounts: [],
                        threads_accounts: [],
                      },
                    ],
                    pages_without_ad_account: [
                      {
                        ...SAMPLE_PAGE_ASSET,
                        asset_pk: "88888888-8888-8888-8888-888888888888",
                        integration_account_id: "99999999-9999-9999-9999-999999999999",
                        external_id: "ext_page_3",
                        name: "Page 3",
                        ad_account_id: null,
                      },
                    ],
                    instagram_accounts_without_ad_account: [],
                    threads_accounts_without_ad_account: [],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const bundles = getMetaSelectableAdAccountBundles(response);
    expect(bundles).not.toBeNull();
    expect(bundles?.ad_accounts).toHaveLength(1);
    expect(bundles?.ad_accounts[0]?.ad_account_id).toBe("act_1");
    // Sorted by type then label: instagram first, then pages, then threads
    expect(bundles?.ad_accounts[0]?.assets.map(a => a.name)).toEqual(["IG 1", "Page 1", "Page 2", "Threads 1"]);
    expect(bundles?.assets_without_ad_account.map(a => a.name)).toEqual(["Page 3"]);
  });

  test("getMetaSelectableAdAccountBundles falls back to flat assets list", () => {
    const response: SelectableAssetsResponse = selectableAssetsResponseSchema.parse({
      synced_at: null,
      stale: false,
      assets: [
        {
          ...SAMPLE_ASSET,
          ad_account_id: "act_1",
        },
        {
          ...SAMPLE_PAGE_ASSET,
          ad_account_id: "act_1",
        },
        {
          ...SAMPLE_PAGE_ASSET,
          asset_pk: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          integration_account_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          external_id: "ext_ig_1",
          type: "meta_instagram_account",
          name: "IG 1",
          ad_account_id: "act_1",
        },
        {
          ...SAMPLE_PAGE_ASSET,
          asset_pk: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          integration_account_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          external_id: "ext_page_2",
          name: "Page 2",
          ad_account_id: "act_1",
        },
        {
          ...SAMPLE_PAGE_ASSET,
          asset_pk: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          integration_account_id: "11111111-2222-3333-4444-555555555555",
          external_id: "ext_page_3",
          name: "Page 3",
          ad_account_id: null,
          business_id: "biz_3",
        },
      ],
    });

    const bundles = getMetaSelectableAdAccountBundles(response);
    expect(bundles).not.toBeNull();
    expect(bundles?.ad_accounts).toHaveLength(1);
    expect(bundles?.ad_accounts[0]?.ad_account_id).toBe("act_1");
    expect(bundles?.ad_accounts[0]?.assets.map(a => a.name)).toEqual(["IG 1", "Page 1", "Page 2"]);
    expect(bundles?.assets_without_ad_account.map(a => a.name)).toEqual(["Page 3"]);
  });

  test("integrationAssetsResponseSchema parses integration scoped payload", () => {
    const parsed = integrationAssetsResponseSchema.parse({
      integration_id: "33333333-3333-3333-3333-333333333333",
      provider: "meta",
      synced_at: null,
      stale: false,
      assets: [{ ...SAMPLE_ASSET, integration_id: "33333333-3333-3333-3333-333333333333" }],
      assets_flat: [SAMPLE_ASSET],
      providers: {
        meta: { assets: [SAMPLE_ASSET] },
      },
    });

    expect(parsed.provider).toBe("meta");
    expect(parsed.assets_flat).toHaveLength(1);
    expect(parsed.providers.meta.assets).toHaveLength(1);
  });
});
