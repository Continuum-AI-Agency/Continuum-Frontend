import { describe, expect, test } from "bun:test";
import {
  buildAssignmentSections,
  filterSection,
  sectionToggleIds,
  type AssignmentSection,
} from "@/lib/integrations/assignmentGroups";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import type { MetaSelectableAdAccountBundles } from "@/lib/integrations/selectableAssets";

function asset(partial: Partial<SelectableAsset> & Pick<SelectableAsset, "asset_pk" | "type">): SelectableAsset {
  return {
    integration_account_id: partial.asset_pk,
    external_id: partial.external_id ?? partial.asset_pk,
    name: partial.name ?? null,
    business_id: partial.business_id ?? null,
    ad_account_id: partial.ad_account_id ?? null,
    role: partial.role,
    ...partial,
  };
}

function response(assets: SelectableAsset[]): SelectableAssetsResponse {
  return { synced_at: null, stale: false, assets, providers: {} };
}

function sectionByKey(sections: AssignmentSection[], key: string): AssignmentSection {
  const found = sections.find((section) => section.key === key);
  if (!found) throw new Error(`section ${key} not found in [${sections.map((s) => s.key).join(", ")}]`);
  return found;
}

const metaBundles: MetaSelectableAdAccountBundles = {
  ad_accounts: [
    {
      ad_account_id: "act_1",
      ad_account: asset({
        asset_pk: "aa-1",
        type: "meta_ad_account",
        name: "Acme Ads",
        ad_account_id: "act_1",
        role: "analyst",
      }),
      assets: [
        asset({ asset_pk: "pg-1", type: "meta_page", name: "Acme Page", ad_account_id: "act_1" }),
        asset({ asset_pk: "ig-1", type: "meta_instagram_account", name: "@acme", ad_account_id: "act_1" }),
      ],
    },
  ],
  assets_without_ad_account: [
    asset({ asset_pk: "ig-solo", type: "meta_instagram_account", name: "@acme.side" }),
  ],
};

describe("buildAssignmentSections", () => {
  test("builds a Meta ad-account section with children as rows and the ad account as an extra id", () => {
    const sections = buildAssignmentSections(response([]), metaBundles);
    const adAccount = sectionByKey(sections, "meta-ad-account:act_1");

    expect(adAccount.title).toBe("Acme Ads");
    expect(adAccount.providerLabel).toBe("Meta");
    expect(adAccount.readOnly).toBe(true);
    expect(adAccount.rows.map((r) => r.selectionId)).toEqual(["pg-1", "ig-1"]);
    expect(adAccount.extraSelectionIds).toEqual(["aa-1"]);
    expect(adAccount.rows.find((r) => r.assetPk === "ig-1")?.iconPlatformKey).toBe("instagram");
  });

  test("adds a standalone Meta section for assets without an ad account", () => {
    const sections = buildAssignmentSections(response([]), metaBundles);
    const standalone = sectionByKey(sections, "meta-standalone");

    expect(standalone.providerLabel).toBe("Meta");
    expect(standalone.subtitle).toBe("Not attached to a Meta ad account");
    expect(standalone.rows.map((r) => r.selectionId)).toEqual(["ig-solo"]);
  });

  test("groups Google-family assets under a Google band in a stable order", () => {
    const sections = buildAssignmentSections(
      response([
        asset({ asset_pk: "ga-1", type: "ga4_property", name: "acme.com" }),
        asset({ asset_pk: "yt-1", type: "youtube_channel", name: "Acme TV" }),
      ]),
      null
    );

    const google = sections.filter((s) => s.providerLabel === "Google");
    expect(google.map((s) => s.title)).toEqual(["YouTube", "Google Analytics"]);
  });

  test("puts non-Meta, non-Google platforms in standalone sections with no band", () => {
    const sections = buildAssignmentSections(
      response([asset({ asset_pk: "tt-1", type: "tiktok_account", name: "Acme TikTok" })]),
      null
    );
    const tiktok = sectionByKey(sections, "platform:tiktok");

    expect(tiktok.title).toBe("TikTok");
    expect(tiktok.providerLabel).toBeNull();
    expect(tiktok.rows.map((r) => r.selectionId)).toEqual(["tt-1"]);
  });

  test("ignores Meta types in the flat list so they are never double-listed", () => {
    const sections = buildAssignmentSections(
      response([asset({ asset_pk: "pg-flat", type: "meta_page", name: "Flat Page" })]),
      null
    );
    expect(sections).toHaveLength(0);
  });

  test("orders sections Meta, then Google, then others", () => {
    const sections = buildAssignmentSections(
      response([
        asset({ asset_pk: "tt-1", type: "tiktok_account", name: "TT" }),
        asset({ asset_pk: "yt-1", type: "youtube_channel", name: "YT" }),
      ]),
      metaBundles
    );
    const providers = sections.map((s) => s.providerLabel);
    expect(providers[0]).toBe("Meta");
    expect(providers).toContain("Google");
    expect(providers[providers.length - 1]).toBeNull();
  });
});

describe("filterSection", () => {
  const section = buildAssignmentSections(response([]), metaBundles).find(
    (s) => s.key === "meta-ad-account:act_1"
  ) as AssignmentSection;

  test("returns all rows and no title match when the query is empty", () => {
    expect(filterSection(section, "  ")).toEqual({ visibleRows: section.rows, titleMatched: false });
  });

  test("keeps every row when the query matches the section title", () => {
    const result = filterSection(section, "acme ads");
    expect(result.titleMatched).toBe(true);
    expect(result.visibleRows).toEqual(section.rows);
  });

  test("narrows to matching rows when only a row matches", () => {
    const result = filterSection(section, "@acme");
    expect(result.titleMatched).toBe(false);
    expect(result.visibleRows.map((r) => r.selectionId)).toEqual(["ig-1"]);
  });

  test("returns no rows when nothing matches", () => {
    expect(filterSection(section, "zzz").visibleRows).toEqual([]);
  });
});

describe("sectionToggleIds", () => {
  const section = buildAssignmentSections(response([]), metaBundles).find(
    (s) => s.key === "meta-ad-account:act_1"
  ) as AssignmentSection;

  test("includes the ad account extra id when the whole section is shown", () => {
    expect(sectionToggleIds(section, section.rows, true)).toEqual(["pg-1", "ig-1", "aa-1"]);
  });

  test("excludes extra ids when filtered to a subset of rows", () => {
    const [firstRow] = section.rows;
    expect(sectionToggleIds(section, [firstRow], false)).toEqual(["pg-1"]);
  });
});
