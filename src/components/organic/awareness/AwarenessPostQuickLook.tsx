'use client';

// Hover-card body for a single top post behind an AI-Awareness "Top posts by hook
// rate" row. Used when we only have the awareness snapshot (no full OrganicPost
// yet). Mirrors the "What's Working" ExemplarQuickLook: a larger cover image,
// kind + captured date, the measured hook rate + views, a caption snippet, and a
// live "Open post" permalink. While a detail fetch is in flight we show a light
// skeleton so the card never looks "empty" on first hover.

import { ExternalLink } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import { type AwarenessTopPost, postKindLabel } from './types';

const nf = new Intl.NumberFormat('en-US');

function formatCaptured(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function AwarenessPostQuickLook({
  post,
  loading = false,
}: {
  post: AwarenessTopPost;
  loading?: boolean;
}) {
  const captured = formatCaptured(post.timestamp);
  const kind = postKindLabel(post);
  const hasCaption = Boolean(post.caption?.trim().length);
  const hasThumb = Boolean(post.thumbnailUrl);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          {kind}
        </span>
        {captured ? <span className="text-2xs text-muted-foreground">{captured}</span> : null}
      </div>

      {hasThumb ? (
        // biome-ignore lint/performance/noImgElement: transient signed thumbnails, not Next-optimizable
        <img
          src={post.thumbnailUrl!}
          alt={post.caption ?? `Top ${kind}`}
          className="max-h-44 w-full rounded-md border border-subtle object-cover"
          loading="lazy"
        />
      ) : loading ? (
        <Skeleton className="h-36 w-full rounded-md" />
      ) : null}

      <div className="flex items-baseline justify-between gap-2 border-t border-subtle pt-2">
        <span className="text-xs text-muted-foreground">Hook rate</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={post.hookRate !== null ? { color: hookRateTextColor(post.hookRate) } : undefined}
        >
          {post.hookRate !== null ? `${post.hookRate.toFixed(1)}%` : '—'}
        </span>
      </div>
      {post.views !== null ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">Views</span>
          <span className="text-sm font-semibold tabular-nums">{nf.format(post.views)}</span>
        </div>
      ) : null}

      {hasCaption ? (
        <p className="line-clamp-4 text-pretty text-xs leading-snug text-secondary">
          {post.caption}
        </p>
      ) : loading ? (
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5 max-w-[12rem]" />
        </div>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground">
          Caption unavailable for this post.
        </p>
      )}

      {post.permalink ? (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:text-foreground"
        >
          Open post
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
