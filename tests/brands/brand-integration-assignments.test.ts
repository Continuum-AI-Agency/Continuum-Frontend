import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBrandProfileIntegrationAccountsRequestSchema,
  linkIntegrationAccountsResponseSchema,
  selectableAssetsResponseSchema,
} from "../../src/lib/schemas/integrations";
import { hasProviderConnections } from "../../src/lib/integrations/providerConnections";
import { PLATFORM_KEYS } from "../../src/components/onboarding/platforms";

type Summary = Parameters<typeof hasProviderConnections>[0];

function createEmptySummary(): Summary {
  const empty: Record<string, { accounts: Array<{ provider: string }> }> = {};
  PLATFORM_KEYS.forEach(key => {
    empty[key] = { accounts: [] };
  });
  return empty as Summary;
}

test("applyBrandProfileIntegrationAccountsRequestSchema accepts asset_pks payload", () => {
  const parsed = applyBrandProfileIntegrationAccountsRequestSchema.parse({
    asset_pks: [
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
    ],
  });
  assert.ok("asset_pks" in parsed);
  assert.equal(parsed.asset_pks.length, 2);
});

test("applyBrandProfileIntegrationAccountsRequestSchema rejects invalid ids", () => {
  assert.throws(() =>
    applyBrandProfileIntegrationAccountsRequestSchema.parse({
      asset_pks: ["also-not-a-uuid"],
    })
  );
});

test("applyBrandProfileIntegrationAccountsRequestSchema accepts integration_account_ids", () => {
  const parsed = applyBrandProfileIntegrationAccountsRequestSchema.parse({
    integration_account_ids: [
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
    ],
  });
  assert.ok("integration_account_ids" in parsed);
  assert.equal(parsed.integration_account_ids.length, 2);
});

test("linkIntegrationAccountsResponseSchema requires nonnegative ints", () => {
  const parsed = linkIntegrationAccountsResponseSchema.parse({
    linked: 1,
  });
  assert.equal(parsed.linked, 1);
  assert.throws(() =>
    linkIntegrationAccountsResponseSchema.parse({
      linked: -1,
    })
  );
});

test("selectableAssetsResponseSchema accepts backend selectable asset shape", () => {
  const parsed = selectableAssetsResponseSchema.parse({
    synced_at: "2025-12-16T23:04:15.064+00:00",
    stale: false,
    assets: [
      {
        asset_pk: "11111111-1111-1111-1111-111111111111",
        integration_account_id: null,
        external_id: "external-1",
        type: "meta_page",
        name: null,
        business_id: null,
        ad_account_id: null,
      },
    ],
  });
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0]?.integration_account_id, null);
  assert.equal(parsed.synced_at, "2025-12-16T23:04:15.064Z");
});

test("hasProviderConnections detects google and meta presence", () => {
  const summary = createEmptySummary();
  summary.youtube.accounts.push({
    id: "asset-1",
    name: "Channel A",
    status: "active",
    externalAccountId: null,
    provider: "google",
    platformKey: "youtube",
    createdAt: null,
  });
  summary.instagram.accounts.push({
    id: "asset-2",
    name: "Insta A",
    status: "active",
    externalAccountId: null,
    provider: "meta",
    platformKey: "instagram",
    createdAt: null,
  });

  assert.equal(hasProviderConnections(summary, "google"), true);
  assert.equal(hasProviderConnections(summary, "facebook"), true);
  assert.equal(hasProviderConnections(summary, "meta"), true);
});

test("hasProviderConnections returns false when empty", () => {
  const summary = createEmptySummary();
  assert.equal(hasProviderConnections(summary, "google"), false);
  assert.equal(hasProviderConnections(summary, "facebook"), false);
});
