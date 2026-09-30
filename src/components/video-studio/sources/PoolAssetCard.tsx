'use client';

import type { VideoEditorPoolAsset } from '@continuum/contracts';
import { ExternalLink, Film, ImageIcon, Music, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { VIDEO_STUDIO_ASSET_DRAG_TYPE, type VideoStudioContext } from '../types';

const KIND_ICON = { video: Film, image: ImageIcon, audio: Music } as const;

/** Tells every sources panel the pool changed (a generation finished). */
export const POOL_CHANGED_EVENT = 'video-studio:pool-changed';

export const formatDuration = (sec: number): string =>
  sec >= 60
    ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
    : `${sec.toFixed(1)}s`;

/** Playable bytes for the hover preview, signed only when someone actually hovers. */
export async function signAsset(brandId: string, assetId: string): Promise<string | null> {
  const response = await fetch('/api/library/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, assetId }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { signedUrl?: unknown };
  return typeof body.signedUrl === 'string' ? body.signedUrl : null;
}

export function PoolAssetCard({
  asset,
  studio,
}: {
  asset: VideoEditorPoolAsset;
  studio: Pick<VideoStudioContext, 'brandId' | 'addAssetToTimeline'>;
}): React.ReactNode {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const Icon = KIND_ICON[asset.kind];
  const add = () => void studio.addAssetToTimeline(asset);
  const meta = [
    asset.kind,
    asset.durationSec ? formatDuration(asset.durationSec) : null,
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ContextMenu>
      <HoverCard
        openDelay={400}
        onOpenChange={(open) => {
          if (open && asset.kind !== 'image' && !mediaUrl) {
            void signAsset(studio.brandId, asset.assetId).then(setMediaUrl);
          }
        }}
      >
        <ContextMenuTrigger
          render={
            <HoverCardTrigger
              render={
                // biome-ignore lint/a11y/noStaticElementInteractions: a pointer drag source; keyboard users add through the tile's Add button and its context menu
                <div
                  draggable
                  data-pool-asset={asset.assetId}
                  data-pool-origin={asset.origin}
                  className="group relative flex aspect-video cursor-grab flex-col justify-end overflow-hidden rounded-md border border-border/60 bg-muted/40 active:cursor-grabbing"
                  onDragStart={(event) => {
                    event.dataTransfer.setData(VIDEO_STUDIO_ASSET_DRAG_TYPE, JSON.stringify(asset));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                />
              }
            />
          }
        >
          {asset.thumbnailUrl ? (
            // biome-ignore lint/performance/noImgElement: signed Library thumbnail
            <img
              src={asset.thumbnailUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <Icon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
          )}
          <Badge
            variant="muted"
            className="absolute top-1 left-1 bg-background/80 text-3xs capitalize backdrop-blur-sm"
          >
            {asset.kind}
          </Badge>
          <div className="relative flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-3xs text-white">
            <span className="min-w-0 flex-1 truncate">{asset.title}</span>
            {asset.durationSec ? (
              <span className="shrink-0 tabular-nums">{formatDuration(asset.durationSec)}</span>
            ) : null}
          </div>
          <Button
            size="icon"
            variant="secondary"
            aria-label={`Add ${asset.title} at the playhead`}
            className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={add}
          >
            <Plus className="size-3" />
          </Button>
        </ContextMenuTrigger>
        <HoverCardContent className="w-72 space-y-2 p-3">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
            {asset.kind === 'video' && mediaUrl ? (
              <video
                src={mediaUrl}
                poster={asset.thumbnailUrl}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-contain"
              />
            ) : asset.kind === 'audio' && mediaUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: a music or voice bed has no captions to offer
              <audio src={mediaUrl} controls className="w-full" />
            ) : asset.thumbnailUrl ? (
              // biome-ignore lint/performance/noImgElement: signed Library thumbnail
              <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Icon className="size-8 text-muted-foreground" />
            )}
          </div>
          <p className="truncate text-xs font-medium">{asset.title}</p>
          <p className="text-2xs text-muted-foreground capitalize">{meta}</p>
        </HoverCardContent>
      </HoverCard>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={add}>
          <Plus className="mr-2 size-4" />
          Add at playhead
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            window.open(
              `/library?assetId=${encodeURIComponent(asset.assetId)}`,
              '_blank',
              'noopener,noreferrer',
            )
          }
        >
          <ExternalLink className="mr-2 size-4" />
          Open in Library
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
