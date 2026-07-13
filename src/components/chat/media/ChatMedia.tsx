'use client';

import { FileIcon } from '@radix-ui/react-icons';
import { ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import { cn } from '@/lib/utils';
import type { ChatMedia } from './media';

// The single media renderer for both chat surfaces. It branches on `kind`, which is the whole point:
// every previous renderer was an <img>, so a video creative or a reel rendered its MP4 into an image
// tag. Video now gets a real <video> with a poster.
export function ChatMediaThumb({ media, className }: { media: ChatMedia; className?: string }) {
  return (
    <div className={cn('relative size-full overflow-hidden rounded-md bg-muted', className)}>
      {media.kind === 'video' ? (
        <>
          {/* #t=0.01 makes browsers paint the first frame when there is no poster, instead of
              showing an empty black box. */}
          <video
            src={media.thumbnailUrl ? media.url : `${media.url}#t=0.01`}
            poster={media.thumbnailUrl}
            preload="metadata"
            muted
            playsInline
            className="size-full object-cover"
          >
            <track kind="captions" />
          </video>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="size-5 fill-white/90 text-white/90 drop-shadow" aria-hidden="true" />
          </span>
        </>
      ) : media.kind === 'image' ? (
        <Image
          src={media.url}
          alt={media.name ?? media.caption ?? ''}
          fill
          unoptimized
          sizes="(max-width: 768px) 40vw, 240px"
          className="object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <FileIcon width={18} height={18} aria-hidden="true" />
        </span>
      )}

      {media.badge ? (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {media.badge}
        </span>
      ) : null}
    </div>
  );
}

type ChatMediaGridProps = {
  items: readonly ChatMedia[];
  /** Title of the lightbox that opens on click. Omit to render the media inert. */
  lightboxTitle?: string;
  className?: string;
  tileClassName?: string;
};

/**
 * A grid of media that opens the shared MediaLightbox on click — the lightbox is the one component
 * in the repo that already renders video properly, and no chat surface was using it.
 */
export function ChatMediaGrid({
  items,
  lightboxTitle,
  className,
  tileClassName,
}: ChatMediaGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const lightboxItems: LightboxItem[] = items.map((media) => ({
    url: media.url,
    caption: media.caption ?? media.name ?? '',
    isVideo: media.kind === 'video',
  }));

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((media, index) => (
          <figure key={media.id} className="group relative">
            <button
              type="button"
              disabled={!lightboxTitle}
              onClick={() => setOpenIndex(index)}
              aria-label={media.name ?? media.caption ?? 'Open media'}
              className={cn(
                'relative block size-24 overflow-hidden rounded-md border transition-opacity',
                lightboxTitle ? 'hover:opacity-90' : 'cursor-default',
                tileClassName,
              )}
            >
              <ChatMediaThumb media={media} />
            </button>

            {media.permalink ? (
              <a
                href={media.permalink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the live post"
                className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </figure>
        ))}
      </div>

      {lightboxTitle ? (
        <MediaLightbox
          open={openIndex !== null}
          onOpenChange={(open) => setOpenIndex(open ? (openIndex ?? 0) : null)}
          title={lightboxTitle}
          items={lightboxItems}
          index={openIndex ?? 0}
          onIndexChange={setOpenIndex}
        />
      ) : null}
    </>
  );
}
