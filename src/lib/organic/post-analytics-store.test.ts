import { beforeEach, describe, expect, it } from 'bun:test';

import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { buildPostDetailKey, usePostAnalyticsStore } from './post-analytics-store';

function post(id: string, overrides: Partial<OrganicPost> = {}): OrganicPost {
  return { id, metrics: { reach: 100, views: 500 }, ...overrides } as OrganicPost;
}

describe('usePostAnalyticsStore', () => {
  beforeEach(() => {
    usePostAnalyticsStore.getState().clearPostDetails();
  });

  it('sets and reads a post detail by account-scoped key', () => {
    const store = usePostAnalyticsStore.getState();
    store.setPostDetail({ integrationAccountId: 'acct-1', post: post('p1') });

    const found = usePostAnalyticsStore
      .getState()
      .getPostDetail({ integrationAccountId: 'acct-1', postId: 'p1' });
    expect(found?.metrics?.reach).toBe(100);
  });

  it('does not bleed a post across integration accounts', () => {
    usePostAnalyticsStore
      .getState()
      .setPostDetail({ integrationAccountId: 'acct-1', post: post('p1') });

    const otherAccount = usePostAnalyticsStore
      .getState()
      .getPostDetail({ integrationAccountId: 'acct-2', postId: 'p1' });
    expect(otherAccount).toBeUndefined();
  });

  it('builds a composite account:post key', () => {
    expect(buildPostDetailKey('acct-1', 'p1')).toBe('acct-1:p1');
  });

  it('wipes all details on brand switch', () => {
    usePostAnalyticsStore
      .getState()
      .setPostDetail({ integrationAccountId: 'acct-1', post: post('p1') });
    usePostAnalyticsStore.getState().resetForBrandSwitch();
    expect(usePostAnalyticsStore.getState().postDetailsById).toEqual({});
  });
});
