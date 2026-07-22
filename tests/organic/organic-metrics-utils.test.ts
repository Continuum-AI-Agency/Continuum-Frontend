import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPostMetricSeries,
  post24hComparisons,
  postWindowRange,
  summarizePost7dMetrics,
} from '../../src/components/organic/organic-metrics-utils';
import type { OrganicPost } from '../../src/lib/schemas/organicMetrics';

function buildPostWithDailyViews(values: number[]): OrganicPost {
  return {
    id: 'post-1',
    breakdown30d: values.map((value, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      views: value,
      reach: value * 10,
      engagement: value * 2,
      comments: value,
    })),
  };
}

test('postWindowRange returns rolling 30d ranges with 3-month cap', () => {
  const now = new Date('2026-02-26T12:00:00.000Z');

  assert.deepEqual(postWindowRange(0, now), {
    from: '2026-01-27',
    to: '2026-02-25',
  });
  assert.deepEqual(postWindowRange(1, now), {
    from: '2025-12-28',
    to: '2026-01-26',
  });
  assert.deepEqual(postWindowRange(2, now), {
    from: '2025-11-28',
    to: '2025-12-27',
  });
  assert.equal(postWindowRange(3, now), null);
});

test('buildPostMetricSeries uses the latest seven days for 7d window', () => {
  const post = buildPostWithDailyViews([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const series = buildPostMetricSeries({
    post,
    metricKey: 'views',
    window: '7d',
  });

  assert.equal(series.length, 7);
  assert.deepEqual(
    series.map((point) => point.value),
    [4, 5, 6, 7, 8, 9, 10],
  );
});

test('summarizePost7dMetrics and post24hComparisons derive metrics from recent daily data', () => {
  const post = buildPostWithDailyViews([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const summary = summarizePost7dMetrics(post);
  assert.equal(summary.views, 49);
  assert.equal(summary.reach, 490);
  assert.equal(summary.engagement, 98);
  assert.equal(summary.comments, 49);

  const comparisons = post24hComparisons(post);
  assert.equal(comparisons.views?.current, 10);
  assert.equal(comparisons.views?.previous, 9);
  assert.equal(comparisons.views?.percentageChange, 11.1);
});
