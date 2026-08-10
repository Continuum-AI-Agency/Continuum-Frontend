/* eslint-disable @next/next/no-img-element */
'use client';

import type { MediaAsset } from '@continuum/contracts';
import { creativeRefFromAsset, findMultiVideoSelectionError } from '@continuum/contracts';
import { ImageOff, Loader2, PencilRuler, Play, Search, Wand2 } from 'lucide-react';
import * as React from 'react';
import { LibraryFilterBar } from '@/components/library/LibraryFilterBar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { cn } from '@/lib/utils';

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}

function AssetTile({
  asset,
  order,
  onToggle,
}: {
  asset: MediaAsset;
  order: number;
  onToggle: () => void;
}) {
  const url = sanitizeCreativeAssetUrl(asset.signedUrl);
  const isVideo = asset.kind === 'video';
  const isSelected = order > 0;

  return (
    <button
      type="button"
      aria-label={asset.title ?? asset.fileName}
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cn(
        'group relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all duration-150',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-1'
          : 'border-border/50 hover:border-border',
      )}
    >
      {url && !isVideo ? (
        <img
          src={url}
          alt={asset.title ?? asset.fileName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : url && isVideo ? (
        <video
          src={`${url}#t=0.01`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="size-5" />
        </div>
      )}

      {isVideo && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1">
          <Play className="size-3 text-white" />
        </div>
      )}

      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
          isSelected
            ? 'bg-primary/30 opacity-100'
            : 'bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100',
        )}
      >
        {isSelected && (
          <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {order}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * The single contextual media surface: click the media zone → this Popover opens
 * anchored on the frame with the unified library browser (search + filters +
 * multi-select grid) and a Generate action. The selection is emitted as
 * MediaAsset[]; the parent routes it through useDraftMediaPlacement (the one
 * write path) so attach gains undo and never drifts. Selection order = carousel
 * slide order. Library browse + Generate only; native file upload is a follow-on
 * (needs an upload endpoint).
 */
export function MediaSelectPopover({
  brandProfileId,
  open,
  onOpenChange,
  anchor,
  onAttachAssets,
  onGenerate,
  canGenerate = false,
  isGenerating = false,
  onEnrich,
  canEnrich = false,
  isEnriching = false,
}: {
  brandProfileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.ReactNode;
  onAttachAssets: (assets: MediaAsset[]) => void;
  onGenerate?: () => void;
  canGenerate?: boolean;
  isGenerating?: boolean;
  /** Stage-2 "Enrich (sketch first)" — offered for text-stage drafts beside Generate. */
  onEnrich?: () => void;
  canEnrich?: boolean;
  isEnriching?: boolean;
}) {
  const { assets, loading, hasMore, loadMore, query, setQuery, filters, setFilters } =
    useStudioLibraryBrowser(brandProfileId);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Reset the selection whenever the surface closes so a re-open starts clean.
  React.useEffect(() => {
    if (!open) setSelectedIds([]);
  }, [open]);

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || !open) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, assets.length, open]);

  const toggleAsset = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedAssets = React.useMemo(() => {
    const byId = new Map(assets.map((a) => [a.id, a]));
    return selectedIds.map((id) => byId.get(id)).filter((a): a is MediaAsset => !!a);
  }, [assets, selectedIds]);

  // A post has exactly one video slot, so the shape a 2-video selection produces
  // keeps only the first pick. Refuse it here instead of losing the rest silently.
  const multiVideoError = findMultiVideoSelectionError(selectedAssets.map(creativeRefFromAsset));

  const handleAttach = () => {
    if (selectedAssets.length === 0 || multiVideoError) return;
    onAttachAssets(selectedAssets);
    onOpenChange(false);
  };

  const handleGenerate = () => {
    onGenerate?.();
    onOpenChange(false);
  };

  const handleEnrich = () => {
    onEnrich?.();
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor render={<div className="w-full">{anchor}</div>} />
      <PopoverContent side="right" align="start" sideOffset={10} className="w-[22rem] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add media
          </p>
          <div className="flex items-center gap-1.5">
            {canEnrich && onEnrich && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleEnrich}
                disabled={isEnriching}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Sketch a low-cost blueprint first, then approve it into final media"
              >
                {isEnriching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PencilRuler className="h-3.5 w-3.5" />
                )}
                Enrich (sketch first)
              </Button>
            )}
            {canGenerate && onGenerate && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="h-7 gap-1 border-primary/40 bg-primary/10 px-2 text-xs text-primary hover:bg-primary/20"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            )}
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library…"
            className="w-full rounded-md border border-border/60 bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:border-border"
          />
        </div>

        {/* Scroll/shrink wrapper: the source + kind pill groups can together exceed
            the fixed-width popover; keep them reachable instead of clipped. */}
        <div className="min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <LibraryFilterBar
            source={filters.source}
            kind={filters.kind}
            onSourceChange={(value) => setFilters({ source: value })}
            onKindChange={(value) => setFilters({ kind: value })}
            variant="compact"
            className="flex-nowrap"
          />
        </div>

        <div className="mt-2 max-h-64 overflow-y-auto pr-0.5">
          {assets.length === 0 && loading ? (
            <SkeletonGrid />
          ) : assets.length === 0 ? (
            <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-4">
              <p className="text-center text-xs text-muted-foreground/60">
                {query.trim() ? (
                  'No matching creatives.'
                ) : (
                  <>
                    Nothing in your library yet.{' '}
                    <span className="text-muted-foreground">
                      Generate, or add media in AI Studio.
                    </span>
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {assets.map((asset) => (
                  <AssetTile
                    key={asset.id}
                    asset={asset}
                    order={selectedIds.indexOf(asset.id) + 1}
                    onToggle={() => toggleAsset(asset.id)}
                  />
                ))}
              </div>
              <div ref={sentinelRef} className="h-px w-full" />
            </>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {multiVideoError && (
              <p
                role="alert"
                className="mr-auto text-2xs font-medium text-amber-600 dark:text-amber-400"
              >
                {multiVideoError}
              </p>
            )}
            <Button type="button" size="sm" disabled={!!multiVideoError} onClick={handleAttach}>
              Attach {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
