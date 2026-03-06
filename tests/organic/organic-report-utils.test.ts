import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrganicReportCsv,
  buildOrganicReportHtml,
  summarizePostWindowBreakdown,
} from "../../src/components/organic/organic-report-utils";
import type { OrganicPost } from "../../src/lib/schemas/organicMetrics";

function buildPost(values: number[]): OrganicPost {
  return {
    id: "post-1",
    timestamp: "2026-02-10T10:00:00.000Z",
    title: "Launch teaser",
    permalink: "https://instagram.com/p/post-1",
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    metrics: {
      views: 500,
      reach: 320,
      totalInteractions: 81,
      comments: 6,
      likes: 44,
      shares: 3,
      saved: 7,
      accountsEngaged: 0,
      newFollowers: 0,
      reelsViews: 0,
      postViews: 0,
      storiesViews: 0,
      profileVisits24h: 0,
      followerReach: 0,
      nonFollowerReach: 0,
    },
    breakdown30d: values.map((value, index) => ({
      date: `2026-02-${String(index + 1).padStart(2, "0")}`,
      views: value,
      reach: value * 2,
      engagement: value * 3,
      comments: value,
    })),
    breakdown24h: [
      { hour: 23, views: 8, reach: 5, engagement: 2, comments: 1 },
    ],
  };
}

test("summarizePostWindowBreakdown computes 24h, first 7d, and first 30d totals", () => {
  const post = buildPost([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const totals = summarizePostWindowBreakdown(post);

  assert.deepEqual(totals.window24h, {
    views: 8,
    reach: 5,
    engagement: 2,
    comments: 1,
  });
  assert.deepEqual(totals.window7d, {
    views: 28,
    reach: 56,
    engagement: 84,
    comments: 28,
  });
  assert.deepEqual(totals.window30d, {
    views: 45,
    reach: 90,
    engagement: 135,
    comments: 45,
  });
  assert.equal(totals.coverageDays, 9);
});

test("buildOrganicReportCsv includes account and post sections", () => {
  const csv = buildOrganicReportCsv({
    platform: "instagram",
    accountName: "Acme IG",
    generatedAt: "2026-03-06T12:00:00.000Z",
    accountRangeSince: "2026-02-04",
    accountRangeUntil: "2026-03-05",
    accountMetrics: {
      accountsEngaged: 100,
      reach: 220,
      views: 350,
      reelsViews: 120,
      postViews: 70,
      storiesViews: 45,
      newFollowers: 19,
      profileVisits24h: 11,
      profileVisitsYesterday: 9,
      followerReach: 130,
      nonFollowerReach: 90,
      comments: 17,
      likes: 55,
      shares: 12,
      saved: 8,
      totalInteractions: 92,
      impressions: 350,
    },
    posts: [
      {
        ...buildPost([2, 4, 6]),
        title: "Line one,\nline two",
      },
    ],
  });

  assert.match(csv, /Continuum Organic Analytics Report/);
  assert.match(csv, /Account Overview/);
  assert.match(csv, /Posts Published in Last 30 Days/);
  assert.match(csv, /"Line one,\nline two"/);
});

test("buildOrganicReportHtml includes escaped content and sections", () => {
  const html = buildOrganicReportHtml({
    platform: "instagram",
    accountName: "Acme <IG>",
    generatedAt: "2026-03-06T12:00:00.000Z",
    accountRangeSince: "2026-02-04",
    accountRangeUntil: "2026-03-05",
    accountMetrics: {
      accountsEngaged: 100,
      reach: 220,
      views: 350,
      reelsViews: 120,
      postViews: 70,
      storiesViews: 45,
      newFollowers: 19,
      profileVisits24h: 11,
      profileVisitsYesterday: 9,
      followerReach: 130,
      nonFollowerReach: 90,
      comments: 17,
      likes: 55,
      shares: 12,
      saved: 8,
      totalInteractions: 92,
      impressions: 350,
    },
    posts: [
      {
        ...buildPost([2, 4, 6]),
        title: "A <title> & \"quotes\"",
      },
    ],
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Account Overview/);
  assert.match(html, /Posts Published in Last 30 Days/);
  assert.match(html, /Acme &lt;IG&gt;/);
  assert.match(html, /A &lt;title&gt; &amp; &quot;quotes&quot;/);
});
