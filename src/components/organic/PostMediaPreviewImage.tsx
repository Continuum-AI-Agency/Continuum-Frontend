'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type PostMediaPreviewImageProps = {
  postId: string;
  src: string;
  alt: string;
  className?: string;
  onRecover?: (postId: string) => void;
  fallbackLabel?: string;
};

export function PostMediaPreviewImage({
  postId,
  src,
  alt,
  className,
  onRecover,
  fallbackLabel = 'Media preview unavailable',
}: PostMediaPreviewImageProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <span className="text-xs text-muted-foreground">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    // Provider media is signed dynamically and cannot use the Next image optimizer.
    // biome-ignore lint/performance/noImgElement: signed provider media requires a direct browser request
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setFailedSrc(src);
        onRecover?.(postId);
      }}
    />
  );
}
