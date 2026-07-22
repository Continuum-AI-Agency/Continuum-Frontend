'use client';

// The shared, recovery-aware creative thumbnail cell for optimizer tables (preview
// drill-ins, reallocation rows, the picker's ad list). Renders the Meta creative
// through ChatMediaThumb — never a raw <img> — so an expired CDN URL re-resolves
// through the Jaina preview endpoint (a letter tile is a failure, not a graceful
// degrade; the same rule AdsetCreativeVerdicts already follows).
//
// Prefers the 480×848 poster (paid_media.ad_creatives.poster_url) when present,
// falling back to the 64×64 Meta creative thumbnail. When no usable URL exists it
// shows a small labeled tile instead of a broken image.
//
// Each instance owns its own recovery hook so a table of ads can drop this cell in
// per row without threading recovery state through the list.

import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPaidVerdict } from '@/components/chat/media/media';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { cn } from '@/lib/utils';

type AdThumbProps = {
  brandId: string;
  accountId: string | null;
  adId: string;
  adName?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  className?: string;
  /** Tailwind size utility for the square tile (default a dense 24px). */
  sizeClassName?: string;
};

export function AdThumb({
  brandId,
  accountId,
  adId,
  adName,
  thumbnailUrl,
  posterUrl,
  className,
  sizeClassName = 'size-6',
}: AdThumbProps) {
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId: accountId });
  const label = adName || adId;
  const media = mediaFromPaidVerdict({
    adId,
    adName: label,
    thumbnailUrl: freshUrlById[adId] ?? posterUrl ?? thumbnailUrl ?? null,
    permalinkUrl: null,
  });

  if (!media) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-sm bg-muted text-3xs text-muted-foreground',
          sizeClassName,
          className,
        )}
        aria-hidden="true"
      >
        AD
      </span>
    );
  }

  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-sm', sizeClassName, className)}
    >
      <ChatMediaThumb
        className="rounded-sm"
        fallbackSeed={label}
        media={media}
        onRecover={() => recover(adId)}
      />
    </span>
  );
}
