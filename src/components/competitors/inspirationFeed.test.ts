import { describe, expect, it } from 'bun:test';
import type { CompetitorOrganicPost, InstagramPost, TimelineEntry } from '@continuum/contracts';

import { buildInspirationFeed } from './inspirationFeed';

function makePost(over: Partial<InstagramPost> = {}): InstagramPost {
  return {
    id: 'p1',
    shortcode: 'abc',
    permalink: 'https://instagram.com/p/abc/',
    kind: 'post',
    coverUrl: 'https://cdn.example.com/cover.jpg',
    caption: 'hello',
    timestamp: '2026-01-01T00:00:00.000Z',
    likeCount: 12,
    commentsCount: 3,
    mediaCount: 1,
    items: [{ kind: 'image', url: 'https://cdn.example.com/cover.jpg' }],
    ...over,
  };
}

function makeOrganic(over: Partial<CompetitorOrganicPost> = {}): CompetitorOrganicPost {
  return {
    competitorId: 'c1',
    competitorName: 'Nike',
    instagramUsername: 'nike',
    post: makePost(),
    ...over,
  };
}

function makePaid(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    snapshotId: 's1',
    competitorId: 'c1',
    competitorName: 'Nike',
    competitorSlug: 'nike',
    sourceAdId: 'ad1',
    firstSeenAt: '2026-02-01T00:00:00.000Z',
    lastSeenAt: '2026-02-05T00:00:00.000Z',
    status: 'active',
    snapshotUrl: null,
    imageUrl: null,
    body: 'buy now',
    cta: 'Shop',
    platforms: ['instagram'],
    deliveryStart: null,
    deliveryStop: null,
    ...over,
  };
}

describe('buildInspirationFeed', () => {
  it('merges organic and paid, newest first by timestamp', () => {
    const feed = buildInspirationFeed(
      [makeOrganic({ post: makePost({ id: 'old', timestamp: '2026-01-01T00:00:00.000Z' }) })],
      [makePaid({ snapshotId: 'new', firstSeenAt: '2026-03-01T00:00:00.000Z' })],
    );
    expect(feed.map((item) => item.source)).toEqual(['paid', 'organic']);
    expect(feed[0].key).toBe('paid:new');
    expect(feed[1].key).toBe('organic:nike:old');
  });

  it('interleaves the two sources strictly by recency', () => {
    const feed = buildInspirationFeed(
      [
        makeOrganic({ post: makePost({ id: 'jan', timestamp: '2026-01-10T00:00:00.000Z' }) }),
        makeOrganic({ post: makePost({ id: 'mar', timestamp: '2026-03-10T00:00:00.000Z' }) }),
      ],
      [
        makePaid({ snapshotId: 'feb', firstSeenAt: '2026-02-10T00:00:00.000Z' }),
        makePaid({ snapshotId: 'apr', firstSeenAt: '2026-04-10T00:00:00.000Z' }),
      ],
    );
    expect(feed.map((item) => item.key)).toEqual([
      'paid:apr',
      'organic:nike:mar',
      'paid:feb',
      'organic:nike:jan',
    ]);
  });

  it('keeps the original entry on each item for rendering and saving', () => {
    const organic = makeOrganic();
    const paid = makePaid();
    const feed = buildInspirationFeed([organic], [paid]);
    const organicItem = feed.find((item) => item.source === 'organic');
    const paidItem = feed.find((item) => item.source === 'paid');
    expect(organicItem?.source === 'organic' && organicItem.view.post).toBe(organic.post);
    expect(paidItem?.source === 'paid' && paidItem.entry).toBe(paid);
  });

  it('sorts missing timestamps to the end without dropping them', () => {
    const feed = buildInspirationFeed(
      [makeOrganic({ post: makePost({ id: 'undated', timestamp: null }) })],
      [makePaid({ snapshotId: 'dated', firstSeenAt: '2026-02-01T00:00:00.000Z' })],
    );
    expect(feed).toHaveLength(2);
    expect(feed[0].key).toBe('paid:dated');
    expect(feed[1].key).toBe('organic:nike:undated');
  });

  it('returns an empty feed when both sources are empty', () => {
    expect(buildInspirationFeed([], [])).toEqual([]);
  });
});
