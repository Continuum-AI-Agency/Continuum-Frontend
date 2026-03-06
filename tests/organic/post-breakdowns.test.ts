import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPostBreakdown24h,
  buildPostBreakdown30d,
  buildPostBreakdown7d,
} from "../../supabase/functions/fetch-organic-analytics/lib/post-breakdowns";

test("post breakdown helpers keep first seven days and derive 24h from day one", () => {
  const dayMap = new Map(
    Array.from({ length: 10 }).map((_, index) => {
      const day = `2026-02-${String(index + 1).padStart(2, "0")}`;
      return [
        day,
        {
          date: day,
          views: index + 1,
          reach: (index + 1) * 2,
          engagement: (index + 1) * 3,
          comments: index + 1,
        },
      ] as const;
    })
  );

  const breakdown30d = buildPostBreakdown30d({
    dayMap,
    postDate: "2026-02-01",
    untilDate: "2026-02-20",
  });
  const breakdown7d = buildPostBreakdown7d(breakdown30d);
  const breakdown24h = buildPostBreakdown24h({ breakdown30d });

  assert.equal(breakdown30d.length, 10);
  assert.deepEqual(
    breakdown7d.map((point) => point.date),
    [
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
      "2026-02-05",
      "2026-02-06",
      "2026-02-07",
    ]
  );
  assert.deepEqual(breakdown24h, [
    {
      hour: 23,
      views: 1,
      reach: 2,
      engagement: 3,
      comments: 1,
    },
  ]);
});

test("post breakdown 24h falls back to lifetime metrics when daily points are unavailable", () => {
  const breakdown30d = buildPostBreakdown30d({
    dayMap: new Map(),
    postDate: "2026-02-20",
    untilDate: "2026-03-01",
    lifetimeFallback: {
      views: 120,
      reach: 95,
      engagement: 13,
      comments: 4,
    },
  });
  const breakdown24h = buildPostBreakdown24h({
    breakdown30d,
    lifetimeFallback: {
      views: 120,
      reach: 95,
      engagement: 13,
      comments: 4,
    },
  });

  assert.deepEqual(breakdown24h, [
    {
      hour: 23,
      views: 120,
      reach: 95,
      engagement: 13,
      comments: 4,
    },
  ]);
  assert.deepEqual(breakdown30d, [
    {
      date: "2026-02-20",
      views: 120,
      reach: 95,
      engagement: 13,
      comments: 4,
    },
  ]);
});
