import { describe, expect, it } from 'bun:test';
import type { InstagramCompetitorSearchResult, InstagramPost } from '@continuum/contracts';

import {
  type CompetitorPostView,
  carouselSlides,
  competitorPostViewKey,
  countBy,
  filterViews,
  formatOutlier,
  searchResultToViews,
  sortByOutlier,
} from './competitorPostView';

const post: InstagramPost = {
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
};

function makeView(over: Partial<CompetitorPostView>, postOver: Partial<InstagramPost> = {}) {
  return {
    competitorId: 'c1',
    competitorName: 'Nike',
    instagramUsername: 'nike',
    post: { ...post, ...postOver },
    format: 'photo',
    analysis: null,
    relevance: null,
    whyItWorked: null,
    ...over,
  } satisfies CompetitorPostView;
}

describe('competitorPostView', () => {
  it('keys a view by account and post id', () => {
    expect(competitorPostViewKey(makeView({}))).toBe('nike:p1');
  });

  it('maps search results with no competitorId and account name fallback', () => {
    const result: InstagramCompetitorSearchResult = {
      query: 'nike',
      resolvedUsername: 'nike',
      account: {
        id: '1',
        username: 'nike',
        name: 'Nike',
        followersCount: 1000,
        mediaCount: 50,
        profilePictureUrl: 'https://cdn.example.com/pic.jpg',
      },
      posts: [post],
      metaPageCandidates: [],
      warnings: [],
    };
    const views = searchResultToViews(result);
    expect(views).toHaveLength(1);
    expect(views[0].competitorId).toBeNull();
    expect(views[0].competitorName).toBe('Nike');
    expect(views[0].instagramUsername).toBe('nike');
    // Not analysed: the contract's kind fallback, and nothing else invented.
    expect(views[0].format).toBe('photo');
    expect(views[0].analysis).toBeNull();
    expect(views[0].whyItWorked).toBeNull();
  });

  it('falls back to the username when the account has no display name', () => {
    const result: InstagramCompetitorSearchResult = {
      query: 'someshop',
      resolvedUsername: 'someshop',
      account: { username: 'someshop', name: null, followersCount: null },
      posts: [post],
      metaPageCandidates: [],
      warnings: [],
    };
    const [view] = searchResultToViews(result);
    expect(view.competitorName).toBe('someshop');
  });

  describe('carouselSlides', () => {
    it('returns every media item for a multi-item carousel', () => {
      const carousel: InstagramPost = {
        ...post,
        id: 'p2',
        kind: 'carousel',
        mediaCount: 3,
        items: [
          { kind: 'image', url: 'https://cdn.example.com/1.jpg' },
          { kind: 'video', url: 'https://cdn.example.com/2.mp4' },
          { kind: 'image', url: 'https://cdn.example.com/3.jpg' },
        ],
      };
      const slides = carouselSlides(carousel);
      expect(slides).toHaveLength(3);
      expect(slides.map((slide) => slide.kind)).toEqual(['image', 'video', 'image']);
    });

    it('returns no slides for a single-item post or reel', () => {
      expect(carouselSlides(post)).toHaveLength(0);
      const reel: InstagramPost = {
        ...post,
        id: 'p3',
        kind: 'reel',
        mediaCount: 1,
        items: [{ kind: 'video', url: 'https://cdn.example.com/reel.mp4' }],
      };
      expect(carouselSlides(reel)).toHaveLength(0);
    });
  });
});

describe('formatOutlier', () => {
  it('renders one decimal below 10 and a whole number from 10 up', () => {
    expect(formatOutlier(3.24)).toBe('3.2x');
    expect(formatOutlier(0.5)).toBe('0.5x');
    expect(formatOutlier(12.6)).toBe('13x');
  });

  it('returns null when the account has no baseline', () => {
    expect(formatOutlier(null)).toBeNull();
    expect(formatOutlier(undefined)).toBeNull();
    expect(formatOutlier(Number.NaN)).toBeNull();
  });
});

describe('sortByOutlier', () => {
  const view = (id: string, outlierScore: number | null) => makeView({}, { id, outlierScore });

  it('orders by multiplier descending and sinks unscored posts, without mutating input', () => {
    const input = [view('a', 1.1), view('b', null), view('c', 4.2), view('d', 0.3)];
    expect(sortByOutlier(input).map((v) => v.post.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(input.map((v) => v.post.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('filterViews + countBy', () => {
  const views = [
    makeView({ format: 'talking_head' }, { id: 'r1', kind: 'reel' }),
    makeView({ format: 'reel' }, { id: 'r2', kind: 'reel' }),
    makeView({ format: 'photo_carousel' }, { id: 'c1', kind: 'carousel' }),
    makeView({ format: 'photo' }, { id: 'p1', kind: 'post' }),
    makeView({ format: 'talking_head' }, { id: 'r3', kind: 'reel' }),
  ];
  const ids = (list: CompetitorPostView[]) => list.map((v) => v.post.id);

  it('passes everything through on all/all', () => {
    expect(ids(filterViews(views, { postType: 'all', format: 'all' }))).toEqual(ids(views));
  });

  it('keeps only the chosen post type', () => {
    expect(ids(filterViews(views, { postType: 'reel', format: 'all' }))).toEqual([
      'r1',
      'r2',
      'r3',
    ]);
  });

  it('keeps only the chosen format', () => {
    expect(ids(filterViews(views, { postType: 'all', format: 'talking_head' }))).toEqual([
      'r1',
      'r3',
    ]);
  });

  it('intersects post type and format', () => {
    expect(filterViews(views, { postType: 'carousel', format: 'talking_head' })).toEqual([]);
  });

  it('counts each value in first-seen order', () => {
    expect(countBy(views, (v) => v.format)).toEqual([
      ['talking_head', 2],
      ['reel', 1],
      ['photo_carousel', 1],
      ['photo', 1],
    ]);
  });
});
