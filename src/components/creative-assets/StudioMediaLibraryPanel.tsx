/* eslint-disable @next/next/no-img-element */
'use client';

import type { MediaAsset } from '@continuum/contracts';
import { AlertTriangle, ImageOff, Loader2, Play, Scaling, Search } from 'lucide-react';
import React from 'react';
import { LibraryFilterBar } from '@/components/library/LibraryFilterBar';
import { QuickReformatMenu } from '@/components/library/reformat/QuickReformatMenu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { setStudioAssetDragData } from '@/lib/creative-assets/studioAssetDrop';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { SOURCE_LABEL } from '@/lib/media/filters';

type Props = {
  brandProfileId: string;
};

// The unified media library, surfaced inside the ai-studio sheet. Mirrors the
// library page's filter + search semantics and makes every asset grabbable onto
// the canvas via the shared asset_drop contract.
export function StudioMediaLibraryPanel({ brandProfileId }: Props) {
  const { assets, loading, hasMore, loadMore, query, setQuery, filters, setFilters, error } =
    useStudioLibraryBrowser(brandProfileId);

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, assets.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-white/5 p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-md border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            placeholder="Search the library…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <LibraryFilterBar
          variant="compact"
          source={filters.source}
          kind={filters.kind}
          onSourceChange={(value) => setFilters({ source: value })}
          onKindChange={(value) => setFilters({ kind: value })}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {assets.length === 0 && loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : assets.length === 0 && error ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-gray-400">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span>{error}</span>
          </div>
        ) : assets.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {query.trim() ? 'No matching assets.' : 'No assets in the library yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <StudioAssetTile key={asset.id} asset={asset} brandId={brandProfileId} />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-px w-full" />
        {loading && assets.length > 0 && (
          <div className="flex items-center justify-center py-3 text-xs text-gray-500">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading more…
          </div>
        )}
      </div>
    </div>
  );
}

function StudioAssetTile({ asset, brandId }: { asset: MediaAsset; brandId: string }) {
  const url = sanitizeCreativeAssetUrl(asset.signedUrl);
  const isVideo = asset.kind === 'video';
  const label = asset.title ?? asset.fileName;

  // Detail surfaces on hover (in context), not on click. Drag-to-canvas stays
  // on the trigger via dragstart; click is intentionally left free.
  return (
    <>
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: draggable Library tile; nested quick action requires a non-button wrapper */}
          <div
            draggable
            onDragStart={(e) => setStudioAssetDragData(e.dataTransfer, asset)}
            className="group relative aspect-square cursor-grab overflow-hidden rounded-lg bg-black/40 outline outline-1 outline-white/10 active:scale-[0.96] [transition-property:scale]"
          >
            {url && !isVideo ? (
              <img src={url} alt={label} className="h-full w-full object-cover" />
            ) : url && isVideo ? (
              <video
                src={`${url}#t=0.01`}
                preload="metadata"
                muted
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-600">
                <ImageOff className="h-6 w-6" />
              </div>
            )}

            {isVideo && (
              <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1">
                <Play className="h-3 w-3 text-white" />
              </div>
            )}

            {!isVideo && url ? (
              <QuickReformatMenu
                asset={asset}
                brandId={brandId}
                trigger={
                  <button
                    type="button"
                    aria-label={`Reformat ${label}`}
                    title="Reformat image"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Scaling className="h-3.5 w-3.5" />
                  </button>
                }
              />
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate text-xs font-medium text-white">{label}</p>
            </div>
          </div>
        </HoverCardTrigger>
        <StudioAssetHoverDetail asset={asset} url={url} isVideo={isVideo} label={label} />
      </HoverCard>
    </>
  );
}

function StudioAssetHoverDetail({
  asset,
  url,
  isVideo,
  label,
}: {
  asset: MediaAsset;
  url: string | null | undefined;
  isVideo: boolean;
  label: string;
}) {
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  const tags = asset.tags?.slice(0, 6) ?? [];

  return (
    <HoverCardContent side="left" className="w-72">
      <div className="flex flex-col gap-2.5">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/30">
          {url && !isVideo ? (
            <img src={url} alt={label} className="h-full w-full object-contain" />
          ) : url && isVideo ? (
            <video
              src={`${url}#t=0.01`}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
        </div>

        <p className="text-sm font-medium leading-snug">{label}</p>

        {asset.description ? (
          <p className="line-clamp-3 text-xs text-muted-foreground">{asset.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {SOURCE_LABEL[asset.source]}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {asset.kind}
          </span>
          {dimensions ? (
            <span className="text-2xs tabular-nums text-muted-foreground/80">{dimensions}</span>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted/70 px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </HoverCardContent>
  );
}
