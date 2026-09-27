'use client';

import type { MediaAsset } from '@continuum/contracts';
import { ChevronLeft, ChevronRight, FileText, ImageOff, Maximize2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDurationMs } from './cardOptions';

const LOAD_AHEAD = 3;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function ReelMedia({ asset }: { asset: MediaAsset }) {
  const name = asset.title ?? asset.fileName;
  const preview = asset.preview?.state === 'ready' ? asset.preview : null;
  if (asset.kind === 'video' && asset.signedUrl) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: the user's own creative; no caption track exists
      <video
        key={asset.id}
        src={asset.signedUrl}
        poster={asset.thumbnailUrl ?? undefined}
        className="size-full object-contain"
        autoPlay
        muted
        controls
        playsInline
      />
    );
  }
  if (asset.kind === 'audio' && asset.signedUrl) {
    return (
      <div className="flex flex-col items-center gap-4 text-white/80">
        <p className="text-sm">{formatDurationMs(asset.durationMs) ?? 'Audio'}</p>
        {/* biome-ignore lint/a11y/useMediaCaption: the user's own audio; no caption track exists */}
        <audio key={asset.id} src={asset.signedUrl} controls autoPlay />
      </div>
    );
  }
  const imageSrc =
    asset.kind === 'image' && asset.mimeType !== 'application/pdf'
      ? (preview?.signedUrl ?? asset.signedUrl)
      : preview?.kind === 'image'
        ? preview.signedUrl
        : null;
  if (imageSrc) {
    return (
      <Image
        key={asset.id}
        src={imageSrc}
        alt={name}
        fill
        sizes="100vw"
        className="object-contain"
        priority
      />
    );
  }
  const Icon = asset.mimeType === 'application/pdf' ? FileText : ImageOff;
  return (
    <div className="flex flex-col items-center gap-2 text-white/70">
      <Icon className="size-10" aria-hidden />
      <span className="text-sm">{asset.fileName}</span>
    </div>
  );
}

// One asset at a time, full-bleed, stepped with the arrow keys — the "review a stack
// of cuts" mode. Enter opens the detail workspace, Escape goes back to the grid.
export function ReelView({
  assets,
  active,
  onOpenDetail,
  onExit,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: {
  assets: MediaAsset[];
  /** False while the detail workspace is open, so its own keys are left alone. */
  active: boolean;
  onOpenDetail: (asset: MediaAsset) => void;
  onExit: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(assets.length - 1, 0));
  const asset = assets[current];

  useEffect(() => {
    if (onLoadMore && hasMore && !loadingMore && current >= assets.length - LOAD_AHEAD) {
      onLoadMore();
    }
  }, [current, assets.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          setIndex(Math.min(current + 1, assets.length - 1));
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          setIndex(Math.max(current - 1, 0));
          return;
        case 'Enter':
          if (asset) {
            event.preventDefault();
            onOpenDetail(asset);
          }
          return;
        case 'Escape':
          event.preventDefault();
          onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, asset, assets.length, current, onExit, onOpenDetail]);

  if (!asset) {
    return (
      <div
        data-testid="library-reel-view"
        className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground"
      >
        No media yet.
      </div>
    );
  }

  return (
    <section
      data-testid="library-reel-view"
      aria-label="Reel view"
      className="flex h-[calc(var(--app-content-h,100dvh)-14rem)] min-h-96 flex-col overflow-hidden rounded-xl bg-neutral-950"
    >
      <div
        data-testid="library-reel-item"
        data-asset-id={asset.id}
        className="relative flex min-h-0 flex-1 items-center justify-center"
      >
        <ReelMedia asset={asset} />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-2 text-white">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous asset"
          disabled={current === 0}
          onClick={() => setIndex(current - 1)}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span data-testid="library-reel-index" className="text-sm tabular-nums text-white/70">
          {current + 1} / {assets.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next asset"
          disabled={current >= assets.length - 1}
          onClick={() => setIndex(current + 1)}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {asset.title ?? asset.fileName}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenDetail(asset)}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="size-3.5" />
          Details
        </Button>
      </div>
    </section>
  );
}
