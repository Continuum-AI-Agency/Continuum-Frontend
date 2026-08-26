'use client';

import type { UiFetchedPost } from '@continuum/contracts';
import { ExternalLink } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { ChatMediaThumb, MediaFallbackTile } from '@/components/chat/media/ChatMedia';
import { mediaFromFetchedPost } from '@/components/chat/media/media';
import { MetaRow, PlatformTag, StatusLabel } from '@/components/shared/agent-cards/agentCardKit';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function formatMetricValue(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(0);
}

function formatMetricName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string | null {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

type Props = {
  post: UiFetchedPost;
};

export function PostContentCard({ post }: Props) {
  const [open, setOpen] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const platformLabel = post.platform ?? post.source;
  const media = mediaFromFetchedPost(post);
  const fallbackSeed = post.caption ?? post.topic ?? platformLabel;
  const reduceMotion = useReducedMotion();

  const topMetric = post.metrics
    ? (Object.entries(post.metrics).find(([, v]) => v !== null) ?? null)
    : null;

  const metricEntries = post.metrics
    ? Object.entries(post.metrics)
        .filter(([, v]) => v !== null)
        .slice(0, 6)
    : [];

  const dateStr = post.postedAt
    ? formatDate(post.postedAt)
    : post.scheduledAt
      ? formatDate(post.scheduledAt)
      : null;
  const dateLabel = post.postedAt ? 'Posted' : 'Scheduled';

  const statusText =
    post.status && !['published', 'top', 'bottom'].includes(post.status) ? post.status : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <motion.button
            className={cn(
              // w-36 rather than a pixel literal: the strip's track rides --font-size-root
              // with the rest of the density ladder.
              'w-36 shrink-0 overflow-hidden rounded-lg cursor-pointer text-left',
              'border border-border/40 bg-card',
              'transition-[border-color] duration-150',
              'hover:border-primary/30',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            aria-label={
              post.caption ? `Post: ${post.caption.slice(0, 60)}` : `${platformLabel} post`
            }
          >
            {/* The card stays a card — only its media goes through the shared primitive, which is
                what makes a reel render as a video rather than an <img> of an MP4. */}
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
              {media ? (
                <ChatMediaThumb media={media} className="absolute inset-0 rounded-none" />
              ) : (
                <MediaFallbackTile className="absolute inset-0 border-0" seed={fallbackSeed} />
              )}
              {post.rank != null && (
                <span className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-bold text-amber-300 backdrop-blur-sm leading-none">
                  #{post.rank}
                </span>
              )}
            </div>

            <div className="p-2 space-y-1">
              <div className="flex items-center justify-between gap-1 min-w-0">
                <PlatformTag platform={platformLabel} />
                {post.format && (
                  <span className="text-2xs text-muted-foreground capitalize shrink-0">
                    {post.format}
                  </span>
                )}
              </div>
              {post.caption ? (
                <p className="line-clamp-2 text-xs leading-snug text-foreground/80">
                  {post.caption}
                </p>
              ) : post.topic ? (
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground italic">
                  {post.topic}
                </p>
              ) : null}
              {topMetric && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground/90">
                    {formatMetricValue(topMetric[1])}
                  </span>{' '}
                  {formatMetricName(topMetric[0])}
                </p>
              )}
            </div>
          </motion.button>
        }
      />

      <PopoverContent className="w-80 p-0 overflow-hidden" align="center" side="top" sideOffset={8}>
        {/* The popover used to show a 1px bar where the media should be — you opened a post and
            never saw the post. */}
        {media ? (
          <div className="relative h-48 w-full overflow-hidden bg-muted">
            <ChatMediaThumb media={media} className="rounded-none" hoverPlay />
          </div>
        ) : null}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PlatformTag platform={platformLabel} />
            {post.format && (
              <span className="text-xs text-muted-foreground capitalize">{post.format}</span>
            )}
            {post.quality && (
              <span className="ml-auto">
                <StatusLabel tone={post.quality.passed ? 'done' : 'failed'}>
                  {post.quality.passed ? 'Quality passed' : 'Quality failed'}
                  {post.quality.score !== undefined &&
                    ` · ${Math.round(post.quality.score * 100)}%`}
                </StatusLabel>
              </span>
            )}
          </div>

          <MetaRow items={[dateStr ? `${dateLabel} ${dateStr}` : null, statusText]} />

          {post.caption && (
            <div>
              <p
                className={cn(
                  'text-sm leading-relaxed text-foreground whitespace-pre-line',
                  !showFullCaption && 'line-clamp-4',
                )}
              >
                {post.caption}
              </p>
              {post.caption.length > 200 && (
                <button
                  type="button"
                  onClick={() => setShowFullCaption((v) => !v)}
                  className="mt-1 text-sm text-primary hover:underline"
                >
                  {showFullCaption ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {metricEntries.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border/50">
              {metricEntries.map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground">{formatMetricName(key)}</p>
                  <p className="text-base font-semibold tabular-nums">{formatMetricValue(value)}</p>
                </div>
              ))}
            </div>
          )}

          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline pt-1 border-t border-border/50"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              View on {post.platform ?? 'platform'}
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
