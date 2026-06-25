"use client";

import type { CompetitorOrganicPost } from "@continuum/contracts";
import { useInstagramPosts } from "@/lib/api/competitorSpy";
import { SaveToBoardButton } from "./SaveToBoardButton";

function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function PostCard({ item, brandId }: { item: CompetitorOrganicPost; brandId?: string }) {
  const { post } = item;
  const href = post.permalink;
  const likeCount = formatCount(post.likeCount);
  const commentsCount = formatCount(post.commentsCount);
  const postDate = formatDate(post.timestamp);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <a href={href} target="_blank" rel="noreferrer" className="relative aspect-square bg-muted">
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Instagram CDN preview
          <img src={post.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium capitalize text-white">
          {post.kind}
        </span>
        {post.mediaCount > 1 ? (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white">
            {post.mediaCount}
          </span>
        ) : null}
      </a>

      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.competitorName}</div>
            <div className="truncate text-xs text-muted-foreground">@{item.instagramUsername}</div>
          </div>
          {postDate ? <div className="shrink-0 text-xs text-muted-foreground">{postDate}</div> : null}
        </div>
        {post.caption ? <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex gap-2 text-xs text-muted-foreground">
            {likeCount ? <span>{likeCount} likes</span> : null}
            {commentsCount ? <span>{commentsCount} comments</span> : null}
          </div>
          {brandId ? (
            <SaveToBoardButton
              brandId={brandId}
              request={{
                kind: "organic",
                competitorId: item.competitorId,
                competitorName: item.competitorName,
                instagramUsername: item.instagramUsername,
                post: item.post,
              }}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function InstagramPostGrid({
  brandId,
  competitorId,
  limit = 12,
}: {
  brandId: string;
  competitorId?: string;
  limit?: number;
}) {
  const { data, isLoading, isError, error } = useInstagramPosts({ brandId, competitorId, limit });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="aspect-square animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Failed to load Instagram posts.";
    return <p className="p-6 text-sm text-muted-foreground">{message}</p>;
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">No Instagram posts yet</p>
        <p className="text-xs text-muted-foreground">
          Tag competitors with Instagram handles to show recent organic posts here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => (
        <PostCard key={`${item.competitorId}:${item.post.id}`} item={item} brandId={brandId} />
      ))}
    </div>
  );
}
