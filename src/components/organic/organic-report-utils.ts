import type {
  OrganicMetrics,
  OrganicPost,
  OrganicPostBreakdownPoint,
  OrganicTrendPoint,
} from "@/lib/schemas/organicMetrics";
import { formatWatchTime } from "./organic-metrics-utils";

export type PostWindowTotals = {
  views: number;
  reach: number;
  engagement: number;
  comments: number;
};

type PostWindowBreakdown = {
  window24h: PostWindowTotals;
  window7d: PostWindowTotals;
  window30d: PostWindowTotals;
  coverageDays: number;
};

function toNumber(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function sumBreakdownPoints(points: OrganicPostBreakdownPoint[]) {
  return points.reduce<PostWindowTotals>(
    (totals, point) => ({
      views: totals.views + toNumber(point.views),
      reach: totals.reach + toNumber(point.reach),
      engagement: totals.engagement + toNumber(point.engagement),
      comments: totals.comments + toNumber(point.comments),
    }),
    {
      views: 0,
      reach: 0,
      engagement: 0,
      comments: 0,
    }
  );
}

function normalizeDailyPoints(points: OrganicPostBreakdownPoint[] | undefined) {
  return (points ?? [])
    .map((point) => ({
      date: point.date ?? (point.timestamp ? point.timestamp.slice(0, 10) : ""),
      views: toNumber(point.views),
      reach: toNumber(point.reach),
      engagement: toNumber(point.engagement),
      comments: toNumber(point.comments),
    }))
    .filter((point) => point.date.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function totalsFromPostLifetime(post: OrganicPost): PostWindowTotals {
  return {
    views: toNumber(post.metrics?.views),
    reach: toNumber(post.metrics?.reach),
    engagement: toNumber(post.metrics?.totalInteractions),
    comments: toNumber(post.metrics?.comments),
  };
}

function hasTotals(totals: PostWindowTotals) {
  return totals.views > 0 || totals.reach > 0 || totals.engagement > 0 || totals.comments > 0;
}

export function summarizePostWindowBreakdown(post: OrganicPost): PostWindowBreakdown {
  const daily30d = normalizeDailyPoints(post.breakdown30d);
  const daily7d = normalizeDailyPoints(post.breakdown7d);
  const hourly24h = post.breakdown24h ?? [];

  const first30d = daily30d.slice(0, 30);
  const first7d = daily7d.length > 0 ? daily7d.slice(0, 7) : first30d.slice(0, 7);

  const first24hFromHourly = sumBreakdownPoints(hourly24h);
  const first24hFromDaily = first30d[0]
    ? {
        views: first30d[0].views,
        reach: first30d[0].reach,
        engagement: first30d[0].engagement,
        comments: first30d[0].comments,
      }
    : null;
  const lifetimeTotals = totalsFromPostLifetime(post);

  const window24h = hasTotals(first24hFromHourly)
    ? first24hFromHourly
    : first24hFromDaily ?? lifetimeTotals;
  const window7d = (() => {
    const totals = sumBreakdownPoints(first7d);
    return hasTotals(totals) ? totals : lifetimeTotals;
  })();
  const window30d = (() => {
    const totals = sumBreakdownPoints(first30d);
    return hasTotals(totals) ? totals : lifetimeTotals;
  })();

  return {
    window24h,
    window7d,
    window30d,
    coverageDays: first30d.length > 0 ? first30d.length : daily7d.length,
  };
}

function isReelPost(post: OrganicPost): boolean {
  const mediaType = (post.mediaType ?? "").toUpperCase();
  const productType = (post.mediaProductType ?? "").toUpperCase();
  return mediaType === "VIDEO" || productType === "REELS" || productType === "REEL";
}

// CSV uses raw seconds (analysis-friendly); HTML uses formatWatchTime for display.
function watchSecondsCell(ms: number | undefined): string | number {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  return Math.round(ms / 1000);
}

export type ReelsWatchSummary = {
  count: number;
  totalWatchMs: number;
  avgWatchMs: number;
};

export function summarizeReelsWatchTime(posts: OrganicPost[], now = new Date()): ReelsWatchSummary {
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const reels = posts.filter(
    (post) =>
      isReelPost(post) &&
      typeof post.timestamp === "string" &&
      Date.parse(post.timestamp) >= sevenDaysAgoMs,
  );

  const totalWatchMs = reels.reduce(
    (sum, post) => sum + (post.metrics?.reelsVideoViewTotalTime ?? 0),
    0,
  );
  const avgValues = reels
    .map((post) => post.metrics?.reelsAvgWatchTime)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const avgWatchMs =
    avgValues.length > 0 ? avgValues.reduce((sum, value) => sum + value, 0) / avgValues.length : 0;

  return { count: reels.length, totalWatchMs, avgWatchMs };
}

export function countPostsWithoutInsights(posts: OrganicPost[]): number {
  return posts.filter((post) => {
    const windows = summarizePostWindowBreakdown(post);
    const lifetime = totalsFromPostLifetime(post);
    return (
      !hasTotals(lifetime) &&
      !hasTotals(windows.window24h) &&
      !hasTotals(windows.window7d) &&
      !hasTotals(windows.window30d)
    );
  }).length;
}

const TREND_BREAKDOWN_ROWS: Array<{ label: string; key: keyof OrganicTrendPoint }> = [
  { label: "Reach", key: "reach" },
  { label: "Views", key: "views" },
  { label: "Reels Views", key: "reelsViews" },
  { label: "Comments", key: "comments" },
];

function last7Trends(trends: OrganicTrendPoint[] | undefined): OrganicTrendPoint[] {
  return (trends ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
}

function csvCell(value: string | number) {
  const rendered = String(value);
  if (!/[",\n]/.test(rendered)) return rendered;
  return `"${rendered.replace(/"/g, "\"\"")}"`;
}

function csvRows(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

const ACCOUNT_METRIC_ROWS: Array<{ label: string; key: keyof OrganicMetrics }> = [
  { label: "Engaged Accounts", key: "accountsEngaged" },
  { label: "Reach", key: "reach" },
  { label: "Views", key: "views" },
  { label: "Reels Views", key: "reelsViews" },
  { label: "Post Views", key: "postViews" },
  { label: "Stories Views", key: "storiesViews" },
  { label: "New Followers", key: "newFollowers" },
  { label: "Profile Visits 24h", key: "profileVisits24h" },
  { label: "Follower Reach", key: "followerReach" },
  { label: "Non-follower Reach", key: "nonFollowerReach" },
  { label: "Likes", key: "likes" },
  { label: "Comments", key: "comments" },
  { label: "Shares", key: "shares" },
  { label: "Saved", key: "saved" },
  { label: "Total Interactions", key: "totalInteractions" },
];

export function buildOrganicReportCsv(params: {
  platform: "instagram" | "facebook" | "tiktok" | "youtube";
  accountName: string;
  generatedAt: string;
  accountRangeSince: string;
  accountRangeUntil: string;
  accountMetrics: OrganicMetrics;
  posts: OrganicPost[];
  trends?: OrganicTrendPoint[];
}) {
  const rows: Array<Array<string | number>> = [];

  rows.push(["Continuum Organic Analytics Report"]);
  rows.push(["Platform", params.platform]);
  rows.push(["Account", params.accountName]);
  rows.push(["Generated At", params.generatedAt]);
  rows.push(["Account Range", `${params.accountRangeSince} to ${params.accountRangeUntil}`]);
  rows.push([]);
  rows.push(["Account Overview"]);
  rows.push(["Metric", "Value"]);
  ACCOUNT_METRIC_ROWS.forEach((metric) => {
    rows.push([metric.label, toNumber(params.accountMetrics[metric.key])]);
  });

  const dailyTrends = last7Trends(params.trends);
  if (dailyTrends.length > 0) {
    rows.push([]);
    rows.push(["Account 7-Day Daily Breakdown"]);
    rows.push(["Date", ...TREND_BREAKDOWN_ROWS.map((row) => row.label)]);
    dailyTrends.forEach((point) => {
      rows.push([
        point.date,
        ...TREND_BREAKDOWN_ROWS.map((row) => toNumber(point[row.key] as number | undefined)),
      ]);
    });
  }

  const reelsWatch = summarizeReelsWatchTime(params.posts);
  rows.push([]);
  rows.push(["Reels Watch Time (last 7 days)"]);
  rows.push(["Reels Counted", reelsWatch.count]);
  rows.push(["Total Watch Time (s)", watchSecondsCell(reelsWatch.totalWatchMs)]);
  rows.push(["Avg Watch Time (s)", watchSecondsCell(reelsWatch.avgWatchMs)]);
  rows.push(["Note", "Meta provides watch time per reel, not as an account daily series."]);

  rows.push([]);
  rows.push(["Posts Published in Last 30 Days"]);
  rows.push([
    "Post ID",
    "Published At",
    "Title",
    "Permalink",
    "Media Type",
    "Product Type",
    "Lifetime Reach",
    "Lifetime Views",
    "Lifetime Engagement",
    "Lifetime Comments",
    "Lifetime Likes",
    "Lifetime Shares",
    "Lifetime Saved",
    "Avg Watch Time (s)",
    "Total Watch Time (s)",
    "24h Reach",
    "24h Views",
    "24h Engagement",
    "24h Comments",
    "7d Reach",
    "7d Views",
    "7d Engagement",
    "7d Comments",
    "30d Reach",
    "30d Views",
    "30d Engagement",
    "30d Comments",
    "Breakdown Days",
  ]);

  params.posts
    .slice()
    .sort((a, b) => {
      const timestampA = a.timestamp ? Date.parse(a.timestamp) : 0;
      const timestampB = b.timestamp ? Date.parse(b.timestamp) : 0;
      return timestampB - timestampA;
    })
    .forEach((post) => {
      const windows = summarizePostWindowBreakdown(post);
      const lifetime = totalsFromPostLifetime(post);
      rows.push([
        post.id,
        post.timestamp ?? "",
        post.title ?? "",
        post.permalink ?? "",
        post.mediaType ?? "",
        post.mediaProductType ?? "",
        lifetime.reach,
        lifetime.views,
        lifetime.engagement,
        lifetime.comments,
        toNumber(post.metrics?.likes),
        toNumber(post.metrics?.shares),
        toNumber(post.metrics?.saved),
        watchSecondsCell(post.metrics?.reelsAvgWatchTime),
        watchSecondsCell(post.metrics?.reelsVideoViewTotalTime),
        windows.window24h.reach,
        windows.window24h.views,
        windows.window24h.engagement,
        windows.window24h.comments,
        windows.window7d.reach,
        windows.window7d.views,
        windows.window7d.engagement,
        windows.window7d.comments,
        windows.window30d.reach,
        windows.window30d.views,
        windows.window30d.engagement,
        windows.window30d.comments,
        windows.coverageDays,
      ]);
    });

  const missingInsights = countPostsWithoutInsights(params.posts);
  rows.push([]);
  rows.push(["Posts with no insights available", missingInsights]);

  return csvRows(rows);
}

function htmlCell(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function buildOrganicReportHtml(params: {
  platform: "instagram" | "facebook" | "tiktok" | "youtube";
  accountName: string;
  generatedAt: string;
  accountRangeSince: string;
  accountRangeUntil: string;
  accountMetrics: OrganicMetrics;
  posts: OrganicPost[];
  trends?: OrganicTrendPoint[];
}) {
  const accountRows = ACCOUNT_METRIC_ROWS.map((metric) => {
    const value = toNumber(params.accountMetrics[metric.key]);
    return `<tr><th>${htmlCell(metric.label)}</th><td>${htmlCell(fmtNumber(value))}</td></tr>`;
  }).join("");

  const dailyTrends = last7Trends(params.trends);
  const trendSection =
    dailyTrends.length === 0
      ? ""
      : `
    <h2>Account 7-Day Daily Breakdown</h2>
    <div class="card">
      <table>
        <thead><tr><th>Date</th>${TREND_BREAKDOWN_ROWS.map((row) => `<th>${htmlCell(row.label)}</th>`).join("")}</tr></thead>
        <tbody>${dailyTrends
          .map(
            (point) =>
              `<tr><td>${htmlCell(point.date)}</td>${TREND_BREAKDOWN_ROWS.map(
                (row) => `<td>${htmlCell(fmtNumber(toNumber(point[row.key] as number | undefined)))}</td>`,
              ).join("")}</tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`;

  const reelsWatch = summarizeReelsWatchTime(params.posts);
  const reelsWatchSection = `
    <h2>Reels Watch Time (last 7 days)</h2>
    <div class="card">
      <table>
        <tbody>
          <tr><th>Reels Counted</th><td>${htmlCell(fmtNumber(reelsWatch.count))}</td></tr>
          <tr><th>Total Watch Time</th><td>${htmlCell(formatWatchTime(reelsWatch.totalWatchMs))}</td></tr>
          <tr><th>Avg Watch Time</th><td>${htmlCell(formatWatchTime(reelsWatch.avgWatchMs))}</td></tr>
        </tbody>
      </table>
      <p style="color:#64748b;font-size:12px;margin:8px 2px 0;">Meta provides watch time per reel, not as an account daily series.</p>
    </div>`;

  const missingInsights = countPostsWithoutInsights(params.posts);

  const postRows = params.posts
    .slice()
    .sort((a, b) => {
      const timestampA = a.timestamp ? Date.parse(a.timestamp) : 0;
      const timestampB = b.timestamp ? Date.parse(b.timestamp) : 0;
      return timestampB - timestampA;
    })
    .map((post) => {
      const windows = summarizePostWindowBreakdown(post);
      const lifetime = totalsFromPostLifetime(post);

      return `<tr>
        <td>${htmlCell(post.id)}</td>
        <td>${htmlCell(post.timestamp ?? "")}</td>
        <td>${htmlCell(post.title ?? "")}</td>
        <td><a href="${htmlCell(post.permalink ?? "")}" target="_blank" rel="noopener noreferrer">Open</a></td>
        <td>${htmlCell(post.mediaType ?? "")}</td>
        <td>${htmlCell(post.mediaProductType ?? "")}</td>
        <td>${htmlCell(fmtNumber(lifetime.reach))}</td>
        <td>${htmlCell(fmtNumber(lifetime.views))}</td>
        <td>${htmlCell(fmtNumber(lifetime.engagement))}</td>
        <td>${htmlCell(fmtNumber(lifetime.comments))}</td>
        <td>${htmlCell(isReelPost(post) ? formatWatchTime(post.metrics?.reelsAvgWatchTime) : "-")}</td>
        <td>${htmlCell(isReelPost(post) ? formatWatchTime(post.metrics?.reelsVideoViewTotalTime) : "-")}</td>
        <td>${htmlCell(fmtNumber(windows.window24h.reach))}</td>
        <td>${htmlCell(fmtNumber(windows.window24h.views))}</td>
        <td>${htmlCell(fmtNumber(windows.window24h.engagement))}</td>
        <td>${htmlCell(fmtNumber(windows.window24h.comments))}</td>
        <td>${htmlCell(fmtNumber(windows.window7d.reach))}</td>
        <td>${htmlCell(fmtNumber(windows.window7d.views))}</td>
        <td>${htmlCell(fmtNumber(windows.window7d.engagement))}</td>
        <td>${htmlCell(fmtNumber(windows.window7d.comments))}</td>
        <td>${htmlCell(fmtNumber(windows.window30d.reach))}</td>
        <td>${htmlCell(fmtNumber(windows.window30d.views))}</td>
        <td>${htmlCell(fmtNumber(windows.window30d.engagement))}</td>
        <td>${htmlCell(fmtNumber(windows.window30d.comments))}</td>
        <td>${htmlCell(fmtNumber(windows.coverageDays))}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Continuum Organic Analytics Report</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #f8fafc; }
    .page { max-width: 1280px; margin: 0 auto; padding: 28px 22px 40px; }
    h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: -0.02em; }
    h2 { margin: 26px 0 10px; font-size: 18px; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; margin: 10px 0 20px; }
    .meta-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
    .meta-card .k { color: #64748b; font-size: 12px; margin-bottom: 6px; }
    .meta-card .v { font-size: 14px; font-weight: 600; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; white-space: nowrap; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; position: sticky; top: 0; z-index: 1; }
    tbody tr:nth-child(even) td { background: #fcfdff; }
    a { color: #0369a1; text-decoration: none; }
    @media print {
      body { background: #ffffff; }
      .page { padding: 0; max-width: none; }
      .card { border: none; border-radius: 0; padding: 0; }
      th, td { white-space: normal; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>Continuum Organic Analytics Report</h1>
    <div class="meta">
      <div class="meta-card"><div class="k">Platform</div><div class="v">${htmlCell(params.platform)}</div></div>
      <div class="meta-card"><div class="k">Account</div><div class="v">${htmlCell(params.accountName)}</div></div>
      <div class="meta-card"><div class="k">Generated At</div><div class="v">${htmlCell(params.generatedAt)}</div></div>
      <div class="meta-card"><div class="k">Account Range</div><div class="v">${htmlCell(`${params.accountRangeSince} to ${params.accountRangeUntil}`)}</div></div>
    </div>

    <h2>Account Overview</h2>
    <div class="card">
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>${accountRows}</tbody>
      </table>
    </div>
${trendSection}
${reelsWatchSection}

    <h2>Posts Published in Last 30 Days</h2>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Published At</th>
            <th>Title</th>
            <th>Permalink</th>
            <th>Media Type</th>
            <th>Product Type</th>
            <th>Lifetime Reach</th>
            <th>Lifetime Views</th>
            <th>Lifetime Engagement</th>
            <th>Lifetime Comments</th>
            <th>Avg Watch Time</th>
            <th>Total Watch Time</th>
            <th>24h Reach</th>
            <th>24h Views</th>
            <th>24h Engagement</th>
            <th>24h Comments</th>
            <th>7d Reach</th>
            <th>7d Views</th>
            <th>7d Engagement</th>
            <th>7d Comments</th>
            <th>30d Reach</th>
            <th>30d Views</th>
            <th>30d Engagement</th>
            <th>30d Comments</th>
            <th>Breakdown Days</th>
          </tr>
        </thead>
        <tbody>${postRows}</tbody>
      </table>
    </div>
    <p style="color:#64748b;font-size:12px;margin:12px 2px 0;">Posts with no insights available: ${htmlCell(fmtNumber(missingInsights))}</p>
  </div>
</body>
</html>`;
}
