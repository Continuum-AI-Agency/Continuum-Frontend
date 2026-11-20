'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

export function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.mp4') || pathname.endsWith('.mov') || pathname.endsWith('.webm');
  } catch {
    return false;
  }
}

export function CreativeSwapComparison({
  originalUrl,
  newUrl,
}: {
  originalUrl: string;
  newUrl: string;
}) {
  const uiText = useTranslations('common');
  return (
    <div>
      <p className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {uiText('m_c878426043')}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Badge variant="outline">{uiText('original_88d759e')}</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-[var(--gray-2)]">
            <div className="relative aspect-[16/9]">
              {isVideoUrl(originalUrl) ? (
                // biome-ignore lint/a11y/useMediaCaption: Comparison URLs contain no caption-track metadata; preserve the source media.
                <video
                  aria-label={uiText('m_db3001b35c')}
                  src={originalUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={originalUrl}
                  alt={uiText('m_db3001b35c')}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Badge variant="default">{uiText('new_18fdd54')}</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-[var(--gray-2)]">
            <div className="relative aspect-[16/9]">
              {isVideoUrl(newUrl) ? (
                // biome-ignore lint/a11y/useMediaCaption: Comparison URLs contain no caption-track metadata; preserve the source media.
                <video
                  aria-label={uiText('m_28014d268c')}
                  src={newUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={newUrl}
                  alt={uiText('m_28014d268c')}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
