import test from "node:test";
import assert from "node:assert/strict";

import {
  updateBrandIntegrationAccountsInputSchema,
  updateBrandIntegrationAccountsResponseSchema,
} from "../../src/lib/schemas/brandIntegrations";
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

test("updateBrandIntegrationAccountsInputSchema accepts valid payload", () => {
  const parsed = updateBrandIntegrationAccountsInputSchema.parse({
    brandProfileId: "11111111-1111-1111-1111-111111111111",
    assetPks: [
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
    ],
  });
  assert.equal(parsed.assetPks.length, 2);
});

test("updateBrandIntegrationAccountsInputSchema rejects invalid ids", () => {
  assert.throws(() =>
    updateBrandIntegrationAccountsInputSchema.parse({
      brandProfileId: "not-a-uuid",
      assetPks: ["also-not-a-uuid"],
    })
  );
});

test("updateBrandIntegrationAccountsResponseSchema requires nonnegative ints", () => {
  const parsed = updateBrandIntegrationAccountsResponseSchema.parse({
    linked: 1,
    unlinked: 0,
  });
  assert.equal(parsed.linked, 1);
  assert.throws(() =>
    updateBrandIntegrationAccountsResponseSchema.parse({
      linked: -1,
      unlinked: 0,
    })
  );
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
