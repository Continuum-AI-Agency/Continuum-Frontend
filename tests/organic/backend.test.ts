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
      likes: 15,
      comments: 8,
      replies: 2,
      shares: 3,
      saved: 5,
      total_interactions: 33,
    },
    interactionBreakdowns: {
      likes: { REEL: 10, POST: 4 },
      comments: { REEL: 3 },
      shares: { STORY: 2 },
      saved: { POST: 1 },
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
  assert.equal(normalized.metrics.likes, 15);
  assert.equal(normalized.metrics.comments, 8);
  assert.equal(normalized.metrics.totalInteractions, 33);
  assert.equal(normalized.comparison?.reach?.percentageChange, 25);
});

test("normalizes reporting api organic metrics response with pctChange", () => {
  const payload = {
    platform: "instagram",
    brandId: "brand-1",
    integrationAccountId: "integration-1",
    externalAccountId: "ig-2",
    fetchedAt: "2025-12-12T00:00:00.000Z",
    range: {
      preset: "last_7d",
      since: "2025-12-05",
      until: "2025-12-12",
    },
    metrics: {
      reach: 100,
      views: 200,
      accountsEngaged: 30,
      reelsViews: 50,
      postViews: 70,
      storiesViews: 80,
      profileVisitsYesterday: 20,
      nonFollowerReach: 60,
      followerReach: 40,
      newFollowers: 10,
      likes: 150,
      comments: 80,
      replies: 20,
      shares: 30,
      saved: 50,
      totalInteractions: 330,
    },
    comparison: {
      reach: { current: 100, previous: 80, pctChange: 25 },
      newFollowers: { current: 10, previous: 5, pctChange: 100 },
    },
  } as const;

  const normalized = normalizeInstagramOrganicMetricsResponse(payload);
  assert.equal(normalized.accountId, "ig-2");
  assert.equal(normalized.metrics.reelsViews, 50);
  assert.equal(normalized.metrics.likes, 150);
  assert.equal(normalized.metrics.totalInteractions, 330);
  assert.equal(normalized.comparison?.reach?.percentageChange, 25);
  assert.equal(normalized.comparison?.newFollowers?.percentageChange, 100);
});
