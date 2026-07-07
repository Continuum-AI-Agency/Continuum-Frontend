'use client';

// Hover-card body for a single top post behind an AI-Awareness "Top posts by hook
// rate" row. Mirrors the "What's Working" ExemplarQuickLook: a larger cover image,
// kind + captured date, the measured hook rate + views, a caption snippet, and a
// live "Open post" permalink.

import { ExternalLink } from 'lucide-react';

import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import { type AwarenessTopPost, postKindLabel } from './types';

const nf = new Intl.NumberFormat('en-US');

function formatCaptured(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function AwarenessPostQuickLook({ post }: { post: AwarenessTopPost }) {
  const captured = formatCaptured(post.timestamp);
  const kind = postKindLabel(post);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          {kind}
        </span>
        {captured ? <span className="text-2xs text-muted-foreground">{captured}</span> : null}
      </div>

      {post.thumbnailUrl ? (
        // biome-ignore lint/performance/noImgElement: transient signed thumbnails, not Next-optimizable
        <img
          src={post.thumbnailUrl}
          alt={post.caption ?? `Top ${kind}`}
          className="max-h-44 w-full rounded-md border border-subtle object-cover"
          loading="lazy"
        />
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

      {post.caption?.trim().length ? (
        <p className="line-clamp-3 text-pretty text-xs leading-snug text-secondary">
          {post.caption}
        </p>
      ) : null}

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
