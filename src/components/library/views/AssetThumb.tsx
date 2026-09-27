'use client';

import type { MediaAsset } from '@continuum/contracts';
import { AudioLines, FileIcon, FileText, Film } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Small square thumbnail for table rows (List view, Trash). Never paints a broken image. */
export function AssetThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
  const preview = asset.preview?.state === 'ready' && asset.preview.kind === 'image';
  const src =
    asset.thumbnailUrl ??
    (preview ? asset.preview?.signedUrl : null) ??
    (asset.kind === 'image' && asset.mimeType !== 'application/pdf' ? asset.signedUrl : null);
  const Icon =
    asset.mimeType === 'application/pdf'
      ? FileText
      : asset.kind === 'audio'
        ? AudioLines
        : asset.kind === 'video'
          ? Film
          : FileIcon;

  return (
    <span
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      {src ? (
        <Image src={src} alt="" fill sizes="40px" className="object-cover" />
      ) : (
        <Icon className="size-4 text-muted-foreground/60" aria-hidden />
      )}
    </span>
  );
}
