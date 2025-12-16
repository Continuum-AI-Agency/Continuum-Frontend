import test from "node:test";
import assert from "node:assert/strict";

import { normalizeInstagramOrganicMetricsResponse } from "../../src/lib/organic-metrics/normalize";

test("normalizes edge instagram organic metrics response to frontend shape", () => {
  const payload = {
    platform: "instagram",
    account_id: "ig-1",
    range: {
      preset: "last_7d",
      since: "2025-12-05",
      until: "2025-12-12",
    },
    metrics: {
      reach: 10,
      views: 20,
      accounts_engaged: 3,
      reels_views: 5,
      post_views: 7,
      stories_views: 8,
      profile_visits_yesterday: 2,
      non_follower_reach: 6,
      follower_reach: 4,
      new_followers: 1,
    },
    comparison: {
      reach: { current: 10, previous: 8, percentage_change: 25 },
    },
  } as const;

  const normalized = normalizeInstagramOrganicMetricsResponse(payload);
  assert.equal(normalized.platform, "instagram");
  assert.equal(normalized.accountId, "ig-1");
  assert.equal(normalized.range.preset, "last_7d");
  assert.equal(normalized.range.since, "2025-12-05");
  assert.equal(normalized.metrics.accountsEngaged, 3);
  assert.equal(normalized.metrics.profileVisitsYesterday, 2);
  assert.equal(normalized.comparison?.reach?.percentageChange, 25);
});
