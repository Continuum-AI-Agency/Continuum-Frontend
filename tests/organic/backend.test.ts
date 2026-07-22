import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeInstagramOrganicMetricsResponse } from '../../src/lib/organic-metrics/normalize';

test('normalizes edge instagram organic metrics response to frontend shape', () => {
  const payload = {
    platform: 'instagram',
    account_id: 'ig-1',
    range: {
      preset: 'last_7d',
      since: '2025-12-05',
      until: '2025-12-12',
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
  assert.equal(normalized.platform, 'instagram');
  assert.equal(normalized.accountId, 'ig-1');
  assert.equal(normalized.range.preset, 'last_7d');
  assert.equal(normalized.range.since, '2025-12-05');
  assert.equal(normalized.metrics.accountsEngaged, 3);
  assert.equal(normalized.metrics.profileVisitsYesterday, 2);
  assert.equal(normalized.metrics.likes, 15);
  assert.equal(normalized.metrics.comments, 8);
  assert.equal(normalized.metrics.totalInteractions, 33);
  assert.equal(normalized.comparison?.reach?.percentageChange, 25);
});

test('normalizes reporting api organic metrics response with pctChange', () => {
  const payload = {
    platform: 'instagram',
    brandId: 'brand-1',
    integrationAccountId: 'integration-1',
    externalAccountId: 'ig-2',
    fetchedAt: '2025-12-12T00:00:00.000Z',
    range: {
      preset: 'last_7d',
      since: '2025-12-05',
      until: '2025-12-12',
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
  assert.equal(normalized.accountId, 'ig-2');
  assert.equal(normalized.metrics.reelsViews, 50);
  assert.equal(normalized.metrics.likes, 150);
  assert.equal(normalized.metrics.totalInteractions, 330);
  assert.equal(normalized.comparison?.reach?.percentageChange, 25);
  assert.equal(normalized.comparison?.newFollowers?.percentageChange, 100);
});

test('keeps extended organic analytics payload fields', () => {
  const payload = {
    platform: 'instagram',
    accountId: 'ig-3',
    range: {
      preset: 'last_7d',
      since: '2026-02-01',
      until: '2026-02-08',
    },
    metrics: {
      reach: 120,
      views: 230,
      accountsEngaged: 50,
      reelsViews: 80,
      postViews: 90,
      storiesViews: 60,
      newFollowers: 12,
      profileVisits24h: 15,
      profileVisitsYesterday: 15,
      nonFollowerReach: 77,
      followerReach: 43,
      comments: 18,
      likes: 55,
      shares: 9,
      saved: 14,
      totalInteractions: 96,
    },
    trends: [
      { date: '2026-02-01', reach: 20, views: 32, boosted: false },
      {
        date: '2026-02-02',
        reach: 24,
        views: 35,
        boosted: true,
        boostedAt: '2026-02-02T10:00:00.000Z',
      },
    ],
    boostedEvents: [
      {
        id: 'boost-1',
        date: '2026-02-02',
        postId: 'post-1',
        label: 'Boost started',
        boostedAt: '2026-02-02T10:00:00.000Z',
      },
    ],
    audienceBreakdown: {
      followers: 43,
      nonFollowers: 77,
    },
    contentTypePerformance: [
      { contentType: 'REEL', reach: 40, views: 80, engagement: 22, comments: 5, posts: 2 },
    ],
    posts: [
      {
        id: 'post-1',
        caption: 'hello',
        timestamp: '2026-02-02T10:00:00.000Z',
        mediaType: 'CAROUSEL_ALBUM',
        mediaUrl: 'https://example.com/cover.jpg',
        isBoosted: true,
        boostedAt: '2026-02-02T10:00:00.000Z',
        carouselMedia: [{ id: 'm-1', mediaType: 'IMAGE', mediaUrl: 'https://example.com/1.jpg' }],
        comments: [{ id: 'c-1', username: 'ana', text: 'Great', likeCount: 3 }],
        breakdown24h: [{ hour: 1, views: 10, reach: 9, engagement: 2 }],
        breakdown7d: [{ date: '2026-02-02', views: 10, reach: 9, engagement: 2 }],
        breakdown30d: [{ date: '2026-02-02', views: 10, reach: 9, engagement: 2 }],
      },
    ],
    recentComments: [{ id: 'c-1', username: 'ana', text: 'Great', likeCount: 3 }],
  } as const;

  const normalized = normalizeInstagramOrganicMetricsResponse(payload);
  assert.equal(normalized.metrics.profileVisits24h, 15);
  assert.equal(normalized.trends?.length, 2);
  assert.equal(normalized.boostedEvents?.[0]?.postId, 'post-1');
  assert.equal(normalized.audienceBreakdown?.followers, 43);
  assert.equal(normalized.posts?.[0]?.breakdown24h?.[0]?.views, 10);
  assert.equal(normalized.posts?.[0]?.breakdown30d?.[0]?.views, 10);
  assert.equal(normalized.recentComments?.[0]?.id, 'c-1');
});
