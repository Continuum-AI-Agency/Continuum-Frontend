'use client';

import { ExternalLink, GalleryHorizontalEnd } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isCarouselMediaType } from '@/lib/organic/carousel';
import { cn } from '@/lib/utils';
import type { OrganicCalendarPostedContent } from './types';

export function PostedContentPreview({ post }: { post: OrganicCalendarPostedContent }) {
  const mediaUrl = post.thumbnailUrl ?? post.mediaUrl;
  const isCarousel = isCarouselMediaType(post.mediaType);

  return (
    <div className="w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card">
      {mediaUrl ? (
        <div className="aspect-video overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt={post.title} className="size-full object-cover" loading="lazy" />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 p-[var(--card-pad)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="success">Posted</Badge>
          <Badge variant="outline">{post.platform}</Badge>
          {isCarousel ? (
            <Badge variant="muted">
              <GalleryHorizontalEnd />
              Carousel
            </Badge>
          ) : null}
          <span className="ml-auto font-mono text-2xs text-muted-foreground">{post.timeLabel}</span>
        </div>
        <p className="text-sm font-semibold leading-tight text-foreground">{post.title}</p>
        {post.caption ? (
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {post.caption}
          </p>
        ) : null}
        {post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'self-start')}
          >
            Open post
            <ExternalLink data-icon="inline-end" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function PostedContentQuickLook({
  post,
  compact = false,
}: {
  post: OrganicCalendarPostedContent;
  compact?: boolean;
}) {
  const isCarousel = isCarouselMediaType(post.mediaType);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`View posted content: ${post.title}`}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 text-left text-muted-foreground transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              compact ? 'px-1.5 py-1 text-2xs' : 'px-2 py-1.5 text-xs',
            )}
          >
            <Badge variant="success" className="px-1.5 py-0 text-3xs">
              Posted
            </Badge>
            <span className="shrink-0 font-mono text-3xs">{post.timeLabel}</span>
            {isCarousel ? <GalleryHorizontalEnd aria-label="Carousel" /> : null}
            <span className="truncate text-foreground">{post.title}</span>
          </button>
        }
      />
      <PopoverContent
        side="right"
        align="start"
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <PostedContentPreview post={post} />
      </PopoverContent>
    </Popover>
  );
}
