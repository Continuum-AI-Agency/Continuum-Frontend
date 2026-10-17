'use client';

import { ExternalLink, GalleryHorizontalEnd, Play } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { isCarouselMediaType } from '@/lib/organic/carousel';
import { postPlatformLabel } from '@/lib/organic/postPlatforms';
import { cn } from '@/lib/utils';
import { SocialPostFrame } from './SocialPostFrame';
import {
  frameDayLabel,
  type LoadedMediaSize,
  loadedMediaSize,
  postedPreviewInput,
} from './social-preview-utils';
import type { OrganicCalendarPostedContent } from './types';

function PostedActions({
  post,
  onViewMetrics,
}: {
  post: OrganicCalendarPostedContent;
  onViewMetrics?: () => void;
}) {
  return (
    <>
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
      {onViewMetrics && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="w-full justify-between"
          onClick={onViewMetrics}
        >
          View post metrics <ExternalLink data-icon="inline-end" />
        </Button>
      )}
    </>
  );
}

/**
 * A published post. On a platform we publish to it renders the same native frame as the
 * draft it came from — sized by the same slot rules — so "how it looks" never changes at
 * the moment it goes live. Anything else keeps the generic card. Memoised: it renders
 * inside calendar cells and hover cards.
 */
export const PostedContentPreview = React.memo(function PostedContentPreview({
  post,
  onViewMetrics,
  brandName,
  className,
}: {
  post: OrganicCalendarPostedContent;
  onViewMetrics?: () => void;
  brandName?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = React.useState<LoadedMediaSize | null>(null);
  const mediaUrl = post.thumbnailUrl ?? post.mediaUrl;
  // The generic card only ever shows a still; a video file is never an <img>.
  const stillUrl = post.thumbnailUrl ?? (post.mediaKind === 'video' ? null : post.mediaUrl);
  const preview = postedPreviewInput(post, loaded?.src === mediaUrl ? loaded : null);
  const isCarousel = isCarouselMediaType(post.mediaType);

  if (!preview) {
    return (
      <div
        className={cn(
          'w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card',
          className,
        )}
      >
        {stillUrl ? (
          <div className="aspect-video overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stillUrl}
              alt={post.title}
              className="size-full object-cover"
              loading="lazy"
            />
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
            <span className="ml-auto font-mono text-2xs text-muted-foreground">
              {post.timeLabel}
            </span>
          </div>
          <p className="text-sm font-semibold leading-tight text-foreground">{post.title}</p>
          {post.caption ? (
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {post.caption}
            </p>
          ) : null}
          <PostedActions post={post} onViewMetrics={onViewMetrics} />
        </div>
      </div>
    );
  }

  const { frame } = preview;
  // One still per published post — the thumbnail, or the media itself; a post whose only
  // media is its video file (every published IG reel) paints that video's first frame. A
  // video gets a play glyph and a carousel a carousel mark; neither invents a slide count.
  // The box is transparent so a full-screen frame letterboxes the media on black.
  const mediaNode = preview.mediaUrl ? (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `${frame.mediaAspect}` }}
    >
      {preview.mediaKind === 'video' ? (
        <video
          // #t=0.01 makes the browser paint the first frame when there is no poster.
          src={`${preview.mediaUrl}#t=0.01`}
          aria-label={post.title}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
        >
          <track kind="captions" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.mediaUrl}
          alt={post.title}
          className={cn(
            'absolute inset-0 size-full object-cover',
            // YouTube only serves landscape stills, a Short pillarboxed in the middle of one:
            // cropping to the frame shows the Short, letterboxing would shrink it to a strip.
            preview.platform === 'youtube' && frame.kind === 'vertical' && 'object-cover!',
          )}
        />
      )}
      {preview.isVideo && frame.kind !== 'landscape' && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-neutral-950/55 text-neutral-50">
            <Play className="size-5 fill-current" aria-hidden />
          </span>
        </span>
      )}
      {preview.format === 'carousel' && (
        <span className="absolute right-2 top-2 rounded-full bg-neutral-950/55 p-1.5 text-neutral-50">
          <GalleryHorizontalEnd className="size-4" aria-label="Carousel" />
        </span>
      )}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'flex h-[min(36rem,calc(100dvh-4rem))] w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 overflow-hidden rounded-lg border border-border bg-card p-3',
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Badge variant="success">Posted</Badge>
        <Badge variant="outline">{postPlatformLabel(post.platform)}</Badge>
        <span className="ml-auto font-mono text-2xs text-muted-foreground">{post.timeLabel}</span>
      </div>
      <div
        data-preview-frame-slot=""
        className="flex min-h-0 flex-1 flex-col overflow-hidden [container-type:size]"
        onLoadCapture={(event) => setLoaded(loadedMediaSize(event.target))}
      >
        <SocialPostFrame
          platform={preview.platform}
          frame={frame}
          caption={post.caption ?? ''}
          // The analytics feed carries YouTube's own title (snippet.title) apart from the
          // description. Our own row's title is our label: the publisher titled the video by
          // the caption's first line, which the frame derives itself.
          title={
            preview.platform === 'youtube' && post.source === 'external' ? post.title : undefined
          }
          brandName={brandName}
          dayLabel={frameDayLabel(post.dayId)}
          timeLabel={post.timeLabel}
          mediaNode={mediaNode}
          isEditing={false}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <PostedActions post={post} onViewMetrics={onViewMetrics} />
      </div>
    </div>
  );
});
