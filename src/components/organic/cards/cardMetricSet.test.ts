import { describe, expect, it } from 'bun:test';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import {
  engagementRate,
  getCardMetricSet,
  POST_METRIC_DEFINITIONS,
  resolveCardMediaKind,
} from './cardMetricSet';

function post(overrides: Partial<OrganicPost>): OrganicPost {
  return { id: 'p1', ...overrides } as OrganicPost;
}

function primaryKeys(p: OrganicPost): string[] {
  return getCardMetricSet(p)
    .filter((d) => d.emphasis === 'primary')
    .map((d) => d.key);
}

describe('resolveCardMediaKind', () => {
  it('classifies reels, carousels and images', () => {
    expect(resolveCardMediaKind(post({ mediaProductType: 'REELS' }))).toBe('reel');
    expect(resolveCardMediaKind(post({ mediaType: 'VIDEO' }))).toBe('reel');
    expect(resolveCardMediaKind(post({ mediaType: 'CAROUSEL_ALBUM' }))).toBe('carousel');
    expect(resolveCardMediaKind(post({ carouselMedia: [{ id: 'a' }, { id: 'b' }] }))).toBe(
      'carousel',
    );
    expect(resolveCardMediaKind(post({ mediaType: 'IMAGE' }))).toBe('image');
  });
});

describe('engagementRate', () => {
  it('is interactions over the larger of reach/views, as a percentage', () => {
    expect(engagementRate(post({ metrics: { totalInteractions: 100, reach: 1000 } }))).toBe(10);
    expect(
      engagementRate(post({ metrics: { totalInteractions: 100, views: 2000, reach: 0 } })),
    ).toBe(5);
  });

  it('is undefined without interactions or a denominator', () => {
    expect(engagementRate(post({ metrics: { reach: 1000 } }))).toBeUndefined();
    expect(engagementRate(post({ metrics: { totalInteractions: 100 } }))).toBeUndefined();
  });
});

describe('getCardMetricSet adaptive primary row', () => {
  it('reels lead with Views, Hook Rate, Avg Watch', () => {
    const reel = post({
      mediaProductType: 'REELS',
      metrics: { views: 12400, hookRate: 68, reelsAvgWatchTime: 4200 },
    });
    expect(primaryKeys(reel)).toEqual(['views', 'hook', 'avgWatch']);
    const hook = getCardMetricSet(reel).find((d) => d.key === 'hook');
    expect(hook?.valueColor).toBe(hookRateTextColor(68));
    expect(hook?.format).toBe('percent');
  });

  it('reels without hook/watch fall back to Views, Reach, Engagement', () => {
    const reel = post({
      mediaProductType: 'REELS',
      metrics: { views: 900, reach: 800, totalInteractions: 40 },
    });
    expect(primaryKeys(reel)).toEqual(['views', 'reach', 'engagement']);
  });

  it('images lead with Reach, Views, Engagement', () => {
    const image = post({
      mediaType: 'IMAGE',
      metrics: { reach: 8100, views: 9400, totalInteractions: 380 },
    });
    expect(primaryKeys(image)).toEqual(['reach', 'views', 'engagement']);
  });

  it('carousels lead with Reach, Views, Saves', () => {
    const carousel = post({
      mediaType: 'CAROUSEL_ALBUM',
      metrics: { reach: 8100, views: 9400, saved: 320 },
    });
    expect(primaryKeys(carousel)).toEqual(['reach', 'views', 'saved']);
  });
});

describe('getCardMetricSet secondary row', () => {
  it('includes available engagement counts and excludes ones already primary', () => {
    const carousel = post({
      mediaType: 'CAROUSEL_ALBUM',
      metrics: { reach: 10, views: 10, saved: 5, likes: 12, comments: 3, shares: 2 },
    });
    const secondaryKeys = getCardMetricSet(carousel)
      .filter((d) => d.emphasis === 'secondary')
      .map((d) => d.key);
    expect(secondaryKeys).toContain('likes');
    expect(secondaryKeys).toContain('comments');
    expect(secondaryKeys).toContain('shares');
    // saved is already a primary metric for carousels, so it is not repeated.
    expect(secondaryKeys).not.toContain('saved');
  });

  it('drops secondary metrics with no value', () => {
    const image = post({ mediaType: 'IMAGE', metrics: { reach: 10, views: 10, likes: 4 } });
    const secondaryKeys = getCardMetricSet(image)
      .filter((d) => d.emphasis === 'secondary')
      .map((d) => d.key);
    expect(secondaryKeys).toEqual(['likes']);
  });
});

describe('reachDescriptor lifetime-only', () => {
  it("never carries a comparisonKey and is flagged lifetimeOnly (reach can't be summed across days)", () => {
    const image = post({
      mediaType: 'IMAGE',
      metrics: { reach: 8100, views: 9400, totalInteractions: 380 },
    });
    const reachTile = getCardMetricSet(image).find((d) => d.key === 'reach');
    expect(reachTile?.comparisonKey).toBeUndefined();
    expect(reachTile?.lifetimeOnly).toBe(true);
  });
});

describe('POST_METRIC_DEFINITIONS', () => {
  it('has copy for every metric and uses no em dashes', () => {
    const values = Object.values(POST_METRIC_DEFINITIONS);
    expect(values.length).toBeGreaterThanOrEqual(10);
    for (const text of values) {
      expect(text.includes('—')).toBe(false);
      expect(text.includes('–')).toBe(false);
    }
  });
});
