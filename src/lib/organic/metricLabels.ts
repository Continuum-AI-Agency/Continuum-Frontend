import type { OrganicMetricId } from '@continuum/contracts';

export const organicMetricMessageKeys = {
  reach: 'metricReach',
  impressions: 'metricImpressions',
  views: 'metricViews',
  accountsEngaged: 'metricAccountsEngaged',
  totalInteractions: 'metricEngagements',
  newFollowers: 'metricNewFollowers',
  subscribers: 'metricFollowers',
  following: 'metricFollowing',
  videoCount: 'metricVideos',
  reelsViews: 'metricReelsViews',
  postViews: 'metricPostViews',
  storiesViews: 'metricStoriesViews',
  profileVisits24h: 'metricProfile24h',
  followerReach: 'metricFollowerReach',
  nonFollowerReach: 'metricNonFollowerReach',
  likes: 'metricLikes',
  comments: 'metricComments',
  shares: 'metricShares',
  hookRate: 'metricAverageView',
  avgRetentionRate: 'metricAverageRetention',
  avgSkipRate: 'metricTypicalSkip',
} as const satisfies Partial<Record<OrganicMetricId, string>>;

export type OrganicMetricMessageKey =
  | (typeof organicMetricMessageKeys)[keyof typeof organicMetricMessageKeys]
  | 'metricUnavailable';

export function organicMetricLabel(
  id: OrganicMetricId,
  translate: (key: OrganicMetricMessageKey) => string,
): string {
  const keys: Partial<Record<OrganicMetricId, OrganicMetricMessageKey>> = organicMetricMessageKeys;
  return translate(keys[id] ?? 'metricUnavailable');
}
