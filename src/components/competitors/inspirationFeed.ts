// Merges a competitor's organic Instagram posts and paid ad snapshots into one
// recency-ordered feed for the Inspiration "All" view. Pure view-model logic
// (no rendering, no data fetching): each item keeps its original entry so the
// caller can render the existing organic tile or paid card, and Save-to-board
// against the right kind. Timestamps are epoch ms (0 when unknown) so missing
// dates sort to the end without special-casing.

import type { CompetitorOrganicPost, TimelineEntry } from "@continuum/contracts";
import { organicPostToView, type CompetitorPostView } from "./competitorPostView";

export type InspirationFeedItem =
  | { source: "organic"; ts: number; key: string; view: CompetitorPostView }
  | { source: "paid"; ts: number; key: string; entry: TimelineEntry };

function toTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const parsed = new Date(iso).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function organicItem(post: CompetitorOrganicPost): InspirationFeedItem {
  const view = organicPostToView(post);
  return {
    source: "organic",
    ts: toTime(view.post.timestamp),
    key: `organic:${view.instagramUsername}:${view.post.id}`,
    view,
  };
}

function paidItem(entry: TimelineEntry): InspirationFeedItem {
  return {
    source: "paid",
    ts: toTime(entry.firstSeenAt),
    key: `paid:${entry.snapshotId}`,
    entry,
  };
}

// Newest first; organic and paid interleave purely by timestamp.
export function buildInspirationFeed(
  posts: CompetitorOrganicPost[],
  timeline: TimelineEntry[],
): InspirationFeedItem[] {
  return [...posts.map(organicItem), ...timeline.map(paidItem)].sort((a, b) => b.ts - a.ts);
}
