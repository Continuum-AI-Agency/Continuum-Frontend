"use client";

// Shared "post activity" markers for organic reporting time-series charts. Given
// the canonical annotated join from @continuum/contracts, this renders one dashed
// vertical recharts ReferenceLine per calendar day that had published posts,
// color-coded by content type, with a hover card listing that day's posts. Reused
// by the dashboard reporting widget and the full analytics account chart so the
// demarcation looks and behaves identically on both.
//
// recharts only detects ReferenceLine when it is a direct/array child of the chart
// (a wrapper component is ignored), so this exposes a function that returns the
// ReferenceLine array to spread inside <LineChart>, mirroring the boost-marker map
// already in OrganicMetricsDashboard.

import {
  type AnnotatedDailyTrend,
  annotatePostActivityByDate,
  type OrganicPostSummary,
} from "@continuum/contracts";
import React from "react";
import { ReferenceLine } from "recharts";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

type ContentType = "reel" | "post" | "story";

const CONTENT_TYPE_COLOR: Record<ContentType, string> = {
  reel: "var(--color-primary)",
  post: "var(--color-secondary)",
  story: "var(--chart-3)",
};

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  reel: "Reel",
  post: "Post",
  story: "Story",
};

const MIXED_COLOR = "var(--color-muted-foreground)";

function classifyContentType(post: OrganicPostSummary): ContentType {
  const productType = (post.mediaProductType ?? "").toUpperCase();
  if (productType === "REELS") return "reel";
  if (productType === "STORY") return "story";
  if (productType === "FEED") return "post";
  const mediaType = (post.mediaType ?? "").toUpperCase();
  if (mediaType === "VIDEO") return "reel";
  return "post";
}

// One color for a marker: the shared content type when the day is homogeneous,
// otherwise a neutral line (the hover card still shows each post's own color).
function dayMarkerColor(day: AnnotatedDailyTrend): string {
  const types = new Set(day.publishedPosts.map(classifyContentType));
  if (types.size === 1) {
    const [only] = [...types];
    return CONTENT_TYPE_COLOR[only];
  }
  return MIXED_COLOR;
}

// Days that both fall on the categorical axis and carry at least one post. Posts
// on days absent from the axis (rare within a shared window) are dropped because
// recharts renders a ReferenceLine only when x matches an existing category.
export function buildPostActivityDays(
  trends: ReadonlyArray<Record<string, unknown>> | null | undefined,
  posts: ReadonlyArray<Record<string, unknown>> | null | undefined,
  axisDates: ReadonlySet<string>,
): AnnotatedDailyTrend[] {
  return annotatePostActivityByDate(trends, posts).filter(
    (day) => day.postCount > 0 && axisDates.has(day.date),
  );
}

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDayHeading(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function PostRow({ post }: { post: OrganicPostSummary }) {
  const type = classifyContentType(post);
  const thumbnail = post.thumbnailUrl ?? post.mediaUrl ?? null;
  const time = formatTime(post.timestamp);
  const caption = (post.caption ?? "").trim();

  return (
    <div className="flex gap-2 px-3 py-2">
      <div
        className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted"
        style={{ boxShadow: `inset 0 0 0 1px ${CONTENT_TYPE_COLOR[type]}` }}
      >
        {thumbnail ? (
          // biome-ignore lint/performance/noImgElement: Meta CDN thumbnail in a hover card; next/image adds no value here and would require remote-domain config
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
            style={{ backgroundColor: CONTENT_TYPE_COLOR[type] }}
          >
            {CONTENT_TYPE_LABEL[type]}
          </span>
          {time ? <span className="text-[11px] text-muted-foreground">{time}</span> : null}
        </div>
        {caption ? (
          <p className="mt-1 line-clamp-2 text-xs text-foreground/90">{caption.slice(0, 120)}</p>
        ) : (
          <p className="mt-1 text-xs italic text-muted-foreground">No caption</p>
        )}
        {post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline"
          >
            View post ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

type LabelViewBox = { x?: number; y?: number; width?: number; height?: number };

// Rendered by recharts as a ReferenceLine `label`; recharts injects `viewBox`.
function PostFlagLabel(props: { viewBox?: LabelViewBox; day: AnnotatedDailyTrend; color: string }) {
  const { viewBox, day, color } = props;
  const centerX = viewBox?.x ?? 0;
  const top = viewBox?.y ?? 0;
  const boxWidth = 44;
  const boxHeight = 22;
  const count = day.postCount;

  return (
    <foreignObject
      x={centerX - boxWidth / 2}
      y={Math.max(0, top - boxHeight + 2)}
      width={boxWidth}
      height={boxHeight}
      style={{ overflow: "visible" }}
    >
      <div className="flex h-full w-full items-start justify-center">
        <HoverCard openDelay={80} closeDelay={80}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${count} post${count === 1 ? "" : "s"} published on ${day.date}`}
              className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white shadow-sm ring-1 ring-white/60 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              style={{ backgroundColor: color }}
            >
              {count > 1 ? count : ""}
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="top" align="center" className="w-72 overflow-hidden p-0">
            <div className="border-b border-border/70 bg-muted/30 px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{formatDayHeading(day.date)}</p>
              <p className="text-[11px] text-muted-foreground">
                {count} post{count === 1 ? "" : "s"} published
              </p>
            </div>
            <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
              {day.publishedPosts.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>
    </foreignObject>
  );
}

// Returns the ReferenceLine array to render directly inside a recharts chart.
// Spread the result inside <LineChart>{...}</LineChart>; do not wrap it.
export function renderPostActivityReferenceLines(
  days: AnnotatedDailyTrend[],
): React.ReactElement[] {
  return days.map((day) => {
    const color = dayMarkerColor(day);
    return (
      <ReferenceLine
        key={`post-activity-${day.date}`}
        x={day.date}
        stroke={color}
        strokeDasharray="3 3"
        strokeOpacity={0.7}
        ifOverflow="extendDomain"
        label={<PostFlagLabel day={day} color={color} />}
      />
    );
  });
}
