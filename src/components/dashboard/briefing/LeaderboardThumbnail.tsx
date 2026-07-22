'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type LeaderboardThumbnailProps = {
  src: string;
  alt: string;
  fallbackSeed: string;
  className?: string;
};

// Creative thumbnails come from signed CDN URLs that can expire (organic media
// signed-URL TTL). On a load failure we degrade to an initial tile rather than a
// broken-image glyph, and never block the row.
export function LeaderboardThumbnail({
  src,
  alt,
  fallbackSeed,
  className,
}: LeaderboardThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const initial = fallbackSeed.trim().charAt(0).toUpperCase() || '•';

  if (failed) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/60 font-mono text-xs uppercase text-muted-foreground',
          className,
        )}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('size-9 shrink-0 rounded border border-border/60 object-cover', className)}
    />
  );
}
