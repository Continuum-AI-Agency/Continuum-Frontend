'use client';

import type { MediaAsset } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { VideoStill } from './VideoStill';

type StillSource = Pick<MediaAsset, 'kind' | 'thumbnailUrl' | 'preview' | 'signedUrl'>;

/**
 * The still a tile draws for a Library asset: its poster or 480 px resize (`thumbnailUrl`), else
 * the Library preview still (audio, PSD, INDD, 3D, PDF…). Only an image with neither (a GIF)
 * draws its own file, and a video's file is never a still.
 */
export function assetStill(asset: StillSource): string | null {
  const preview = asset.preview;
  const previewStill =
    preview?.state === 'ready' && preview.kind === 'image' ? preview.signedUrl : null;
  return sanitizeCreativeAssetUrl(
    asset.thumbnailUrl ?? previewStill ?? (asset.kind === 'image' ? asset.signedUrl : null),
  );
}

/** A Library asset in a tile: its still, lazily; a video plays only through VideoStill's rule. */
export function AssetStill({
  asset,
  alt,
  className,
  eager = false,
  fallback = null,
}: {
  asset: StillSource;
  alt: string;
  className?: string;
  eager?: boolean;
  /** Drawn when the asset has nothing to show. */
  fallback?: ReactNode;
}) {
  const still = assetStill(asset);
  const video = asset.kind === 'video' ? sanitizeCreativeAssetUrl(asset.signedUrl) : null;
  if (video) {
    return (
      <VideoStill
        src={video}
        poster={still}
        alt={alt}
        eager={eager}
        placeholder={fallback ?? undefined}
        className={className}
      />
    );
  }
  if (!still) return <>{fallback}</>;
  return (
    // biome-ignore lint/performance/noImgElement: a signed storage still, not a Next-optimisable asset
    <img
      src={still}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
    />
  );
}
