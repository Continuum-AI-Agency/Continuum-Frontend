'use client';

// An ad's thumbnail on the Home: the stored URL, then a second stored copy when one is given, then
// a placeholder. Stored Meta CDN URLs are signed and expire, so a failed load is normal: the
// placeholder says the preview expired rather than draw a broken image. The Home never re-resolves
// a thumbnail from the Graph (that is a live read per ad).
import { ImageIcon } from 'lucide-react';
import { useTranslations as useBetaTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CreativeThumb({
  url,
  fallbackUrl = null,
  alt,
  className,
  compact = false,
}: {
  url: string | null;
  fallbackUrl?: string | null;
  alt: string;
  className?: string;
  /** Too small to say why there is no image: the icon alone. */
  compact?: boolean;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const candidates = [url, fallbackUrl].filter((candidate): candidate is string =>
    Boolean(candidate),
  );
  const shown = candidates.find((candidate) => !failedUrls.includes(candidate)) ?? null;
  const frame = cn('overflow-hidden rounded-md border bg-muted', className);

  if (!shown) {
    const expired = candidates.length > 0;
    return (
      <span
        aria-hidden="true"
        className={cn(frame, 'grid place-items-center gap-0.5 text-muted-foreground')}
        data-expired={expired || undefined}
        data-testid="creative-thumb-placeholder"
      >
        <ImageIcon className="size-4" />
        {expired && !compact ? (
          <span className="px-1 text-center text-[0.6rem]">{betaUiText('beta_3ce68316f440')}</span>
        ) : null}
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
      key={shown}
      loading="lazy"
      onError={() => setFailedUrls((failed) => [...failed, shown])}
      referrerPolicy="no-referrer"
      src={shown}
    />
  );
}
