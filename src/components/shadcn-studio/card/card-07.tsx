import * as React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type CardOverlayDemoProps = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  alt?: string;
  status?: string | null;
  callToAction?: string | null;
  className?: string;
};

const FALLBACK_ASPECT_RATIO = '16 / 9';

const clampMaxWidth = (width: number): number => {
  return Math.max(260, Math.min(width, 620));
};

export function CardOverlayDemo({
  title,
  description,
  imageUrl,
  alt,
  status,
  callToAction,
  className,
}: CardOverlayDemoProps) {
  const [mediaSize, setMediaSize] = React.useState<{ width: number; height: number } | null>(null);

  const dynamicStyle = React.useMemo(() => {
    if (!mediaSize || mediaSize.width <= 0 || mediaSize.height <= 0) {
      return {
        maxWidth: '620px',
        aspectRatio: FALLBACK_ASPECT_RATIO,
      };
    }

    return {
      maxWidth: `${clampMaxWidth(mediaSize.width)}px`,
      aspectRatio: `${mediaSize.width} / ${mediaSize.height}`,
    };
  }, [mediaSize]);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;

    if (naturalWidth > 0 && naturalHeight > 0) {
      setMediaSize({ width: naturalWidth, height: naturalHeight });
    }
  };

  return (
    <Card
      className={cn(
        'group relative w-full overflow-hidden border-white/10 bg-black py-0 text-white shadow-lg',
        className,
      )}
      style={{ maxWidth: dynamicStyle.maxWidth }}
    >
      <CardContent className="p-0">
        <div className="relative w-full" style={{ aspectRatio: dynamicStyle.aspectRatio }}>
          {imageUrl ? (
            // Meta creative thumbnails come from dynamic CDN hosts that are not static at build time.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={alt ?? title}
              className="h-full w-full object-cover"
              loading="lazy"
              onLoad={handleImageLoad}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-sm text-neutral-400">
              No creative preview available
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>
      </CardContent>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end">
        <CardHeader className="pointer-events-auto translate-y-2 pb-2 pt-5 text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <CardTitle className="line-clamp-2 text-base tracking-tight text-white">
            {title}
          </CardTitle>
        </CardHeader>

        <CardContent className="pointer-events-auto translate-y-2 space-y-2 pb-5 text-sm text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          {description ? (
            <p className="line-clamp-4 select-text text-white">{description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-white">
            {status ? (
              <span className="select-text rounded-full bg-white/20 px-2 py-1 text-white">
                {status}
              </span>
            ) : null}
            {callToAction ? (
              <span className="select-text rounded-full bg-white/20 px-2 py-1 text-white">
                CTA: {callToAction}
              </span>
            ) : null}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default CardOverlayDemo;
