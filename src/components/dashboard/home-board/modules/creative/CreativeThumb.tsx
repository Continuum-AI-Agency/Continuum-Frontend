'use client';

// An ad's thumbnail on the Home: the URL the creative report stored, or a neutral placeholder.
// Stored Meta CDN URLs expire; an expired one falls back to the placeholder. The Home never
// re-resolves a thumbnail from the Graph (that is a live read per ad).
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CreativeThumb({
  url,
  alt,
  className,
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const shown = url && url !== failedUrl ? url : null;
  const frame = cn('overflow-hidden rounded-md border bg-muted', className);

  if (!shown) {
    return (
      <span
        aria-hidden="true"
        className={cn(frame, 'grid place-items-center text-muted-foreground/60')}
        data-testid="creative-thumb-placeholder"
      >
        <ImageIcon className="size-4" />
      </span>
    );
  }
  // A plain <img>: the stored URL is a third-party CDN URL that expires; next/image would proxy
  // and cache it past its expiry.
  return (
    <img
      alt={alt}
      className={cn(frame, 'object-cover')}
      data-testid="creative-thumb"
      decoding="async"
      loading="lazy"
      onError={() => setFailedUrl(shown)}
      referrerPolicy="no-referrer"
      src={shown}
    />
  );
}
