// Adaptive per-post metric selection for the gallery HoverCard quick-look.
// Each media type surfaces the metrics that matter most for its format (the way
// Sprout / Dash Hudson adapt by post type): reels lead with Views + Hook Rate +
// Avg Watch, static posts with Reach + Views + Engagement, carousels with
// Reach + Views + Saves. Pure module (no React) so it is unit-testable; the icon
// is referenced by key and resolved to a lucide component in the view layer.

import type { OrganicPost } from "@/lib/schemas/organicMetrics";
import { calculateHookRate, hookRateTier, type HookRateTier } from "./../organic-metrics-utils";
import type { PostComparisonKey } from "./../organic-metrics-utils";

export type CardMediaKind = "reel" | "image" | "carousel";
export type MetricFormat = "compact" | "percent" | "watchtime";
export type MetricIconKey =
  | "views"
  | "reach"
  | "engagement"
  | "hook"
  | "watch"
  | "totalWatch"
  | "likes"
  | "comments"
  | "shares"
  | "saved";

export interface MetricDescriptor {
  key: string;
  label: string;
  value: number | undefined;
  format: MetricFormat;
  iconKey: MetricIconKey;
  tooltip: string;
  emphasis: "primary" | "secondary";
  comparisonKey?: PostComparisonKey;
  tier?: HookRateTier;
}

// Tooltip copy shown on hover of each metric. No em dashes per design guidelines.
export const POST_METRIC_DEFINITIONS: Record<MetricIconKey, string> = {
  views: "Total plays of this post.",
  reach: "Unique accounts that saw this post.",
  engagement: "Interactions (likes, comments, shares, saves) relative to reach.",
  hook: "Share of viewers who watched past the first 3 seconds (100 minus skip rate).",
  watch: "Average time viewers spent watching this reel.",
  totalWatch: "Total watch time summed across every view.",
  likes: "Likes on this post.",
  comments: "Comments on this post.",
  shares: "Times this post was shared.",
  saved: "Times this post was saved.",
};

export function resolveCardMediaKind(post: OrganicPost): CardMediaKind {
  const mediaType = (post.mediaType ?? "").toUpperCase();
  const productType = (post.mediaProductType ?? "").toUpperCase();
  if (mediaType.includes("VIDEO") || productType.includes("REEL")) return "reel";
  if (mediaType.includes("CAROUSEL") || (post.carouselMedia?.length ?? 0) > 1) return "carousel";
  return "image";
}

// Engagement rate as a 0-100 percentage: interactions over the larger of
// reach/views. Undefined when there are no interactions or no denominator.
export function engagementRate(post: OrganicPost): number | undefined {
  const interactions = post.metrics?.totalInteractions;
  if (typeof interactions !== "number") return undefined;
  const denominator = Math.max(post.metrics?.reach ?? 0, post.metrics?.views ?? 0);
  if (denominator <= 0) return undefined;
  return Number(((interactions / denominator) * 100).toFixed(1));
}

function descriptor(input: MetricDescriptor): MetricDescriptor {
  return input;
}

function viewsDescriptor(post: OrganicPost, emphasis: MetricDescriptor["emphasis"]): MetricDescriptor {
  return descriptor({
    key: "views",
    label: "Views",
    value: post.metrics?.views,
    format: "compact",
    iconKey: "views",
    tooltip: POST_METRIC_DEFINITIONS.views,
    emphasis,
    comparisonKey: "views",
  });
}

function reachDescriptor(post: OrganicPost, emphasis: MetricDescriptor["emphasis"]): MetricDescriptor {
  return descriptor({
    key: "reach",
    label: "Reach",
    value: post.metrics?.reach,
    format: "compact",
    iconKey: "reach",
    tooltip: POST_METRIC_DEFINITIONS.reach,
    emphasis,
    comparisonKey: "reach",
  });
}

function engagementDescriptor(post: OrganicPost, emphasis: MetricDescriptor["emphasis"]): MetricDescriptor {
  const rate = engagementRate(post);
  const usesRate = rate !== undefined;
  return descriptor({
    key: "engagement",
    label: "Engagement",
    value: usesRate ? rate : post.metrics?.totalInteractions,
    format: usesRate ? "percent" : "compact",
    iconKey: "engagement",
    tooltip: POST_METRIC_DEFINITIONS.engagement,
    emphasis,
    comparisonKey: "engagement",
  });
}

function hookDescriptor(post: OrganicPost): MetricDescriptor | null {
  const hookRate = calculateHookRate(post);
  if (hookRate === undefined) return null;
  return descriptor({
    key: "hook",
    label: "Hook Rate",
    value: hookRate,
    format: "percent",
    iconKey: "hook",
    tooltip: POST_METRIC_DEFINITIONS.hook,
    emphasis: "primary",
    tier: hookRateTier(hookRate),
  });
}

function watchDescriptor(post: OrganicPost): MetricDescriptor | null {
  const ms = post.metrics?.reelsAvgWatchTime;
  if (ms === undefined) return null;
  return descriptor({
    key: "avgWatch",
    label: "Avg Watch",
    value: ms,
    format: "watchtime",
    iconKey: "watch",
    tooltip: POST_METRIC_DEFINITIONS.watch,
    emphasis: "primary",
  });
}

const SECONDARY_DEFS: Array<{
  key: string;
  label: string;
  iconKey: MetricIconKey;
  pick: (post: OrganicPost) => number | undefined;
  comparisonKey?: PostComparisonKey;
  format?: MetricFormat;
}> = [
  { key: "likes", label: "Likes", iconKey: "likes", pick: (p) => p.metrics?.likes, comparisonKey: "likes" },
  { key: "comments", label: "Comments", iconKey: "comments", pick: (p) => p.metrics?.comments, comparisonKey: "comments" },
  { key: "shares", label: "Shares", iconKey: "shares", pick: (p) => p.metrics?.shares, comparisonKey: "shares" },
  { key: "saved", label: "Saves", iconKey: "saved", pick: (p) => p.metrics?.saved, comparisonKey: "saved" },
  { key: "totalWatch", label: "Total Watch", iconKey: "totalWatch", pick: (p) => p.metrics?.reelsVideoViewTotalTime, format: "watchtime" },
];

function secondaryDescriptors(post: OrganicPost, excludeKeys: Set<string>): MetricDescriptor[] {
  return SECONDARY_DEFS.filter((def) => !excludeKeys.has(def.key))
    .map((def) =>
      descriptor({
        key: def.key,
        label: def.label,
        value: def.pick(post),
        format: def.format ?? "compact",
        iconKey: def.iconKey,
        tooltip: POST_METRIC_DEFINITIONS[def.iconKey],
        emphasis: "secondary",
        comparisonKey: def.comparisonKey,
      })
    )
    .filter((d) => typeof d.value === "number");
}

// Returns the adaptive primary metrics (2-3) followed by the available secondary
// metrics. Primary set is chosen by media type.
export function getCardMetricSet(post: OrganicPost): MetricDescriptor[] {
  const kind = resolveCardMediaKind(post);

  let primary: MetricDescriptor[];
  if (kind === "reel") {
    primary = [viewsDescriptor(post, "primary"), hookDescriptor(post), watchDescriptor(post)].filter(
      (d): d is MetricDescriptor => d !== null
    );
    // A video that exposes neither hook rate nor watch time still needs a
    // sensible primary row.
    if (primary.length < 2) primary = [viewsDescriptor(post, "primary"), reachDescriptor(post, "primary"), engagementDescriptor(post, "primary")];
  } else if (kind === "carousel") {
    primary = [
      reachDescriptor(post, "primary"),
      viewsDescriptor(post, "primary"),
      descriptor({
        key: "saved",
        label: "Saves",
        value: post.metrics?.saved,
        format: "compact",
        iconKey: "saved",
        tooltip: POST_METRIC_DEFINITIONS.saved,
        emphasis: "primary",
        comparisonKey: "saved",
      }),
    ];
  } else {
    primary = [reachDescriptor(post, "primary"), viewsDescriptor(post, "primary"), engagementDescriptor(post, "primary")];
  }

  const primaryKeys = new Set(primary.map((d) => d.key));
  return [...primary, ...secondaryDescriptors(post, primaryKeys)];
}
