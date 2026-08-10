/* eslint-disable @next/next/no-img-element */
'use client';

import type { MediaAsset } from '@continuum/contracts';
import {
  AlertTriangle,
  ImageOff,
  Loader2,
  Play,
  RefreshCw,
  Scaling,
  Search,
  Sparkles,
} from 'lucide-react';
import React from 'react';
import { LibraryFilterBar } from '@/components/library/LibraryFilterBar';
import { QuickReformatMenu } from '@/components/library/reformat/QuickReformatMenu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { setStudioAssetDragData } from '@/lib/creative-assets/studioAssetDrop';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { SOURCE_LABEL } from '@/lib/media/filters';
import { streamInspirations } from '@/lib/onboarding/inspirationsClient';

type Props = {
  brandProfileId: string;
};

// The unified media library, surfaced inside the ai-studio sheet. Mirrors the
// library page's filter + search semantics and makes every asset grabbable onto
// the canvas via the shared asset_drop contract.
export function StudioMediaLibraryPanel({ brandProfileId }: Props) {
  const {
    assets,
    loading,
    hasMore,
    loadMore,
    refresh,
    query,
    setQuery,
    filters,
    setFilters,
    error,
  } = useStudioLibraryBrowser(brandProfileId);

  const isInspiration = filters.source === 'inspiration';
  const pull = useInspirationPull(brandProfileId, refresh);

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

        {isInspiration && assets.length > 0 ? (
          <InspirationPullButton label="Regenerate" pull={pull} />
        ) : null}
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
        ) : assets.length === 0 && isInspiration && !query.trim() ? (
          <InspirationEmptyState pull={pull} />
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

type InspirationPull = {
  running: boolean;
  found: number;
  error: string | null;
  start: () => void;
};

// "Inspiration" is competitor creative, not an AI generation — so filling the
// folder means re-running the competitor pull that onboarding uses, never a
// second generation pipeline. The Backend registers everything it pulls into
// media.assets with source='inspiration', so a completed run leaves the folder
// populated for next time; we just re-read it when the stream ends.
function useInspirationPull(brandId: string, onSettled: () => void): InspirationPull {
  const [running, setRunning] = React.useState(false);
  const [found, setFound] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const start = React.useCallback(() => {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setFound(0);
    setError(null);

    // Mutated from inside the frame callback, so it cannot be a narrowed `let`.
    const outcome = { pulled: 0, message: null as string | null };

    void (async () => {
      try {
        await streamInspirations({
          brandId,
          signal: controller.signal,
          onFrame: (frame) => {
            if (frame.type === 'post_pulled' || frame.type === 'ad_pulled') {
              outcome.pulled += 1;
              setFound(outcome.pulled);
              return;
            }
            if (frame.type === 'error') outcome.message = frame.data.message;
          },
        });
        // A run that streamed nothing is a failure the user has to see; the old
        // surface just went back to looking empty with no explanation.
        setError(
          outcome.pulled > 0
            ? null
            : (outcome.message ??
                'No inspiration came back. Add competitors for this brand, then try again.'),
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('[StudioMediaLibraryPanel] inspiration pull failed', err);
          setError("Couldn't pull inspiration. Please try again.");
        }
      } finally {
        abortRef.current = null;
        setRunning(false);
        // Partial runs still registered assets, so re-read either way.
        onSettled();
      }
    })();
  }, [brandId, onSettled]);

  return { running, found, error, start };
}

function InspirationPullButton({ label, pull }: { label: string; pull: InspirationPull }) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="studio-inspiration-regenerate"
        onClick={pull.start}
        disabled={pull.running}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pull.running ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {pull.found > 0 ? `Finding inspiration… ${pull.found} found` : 'Finding inspiration…'}
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5" />
            {label}
          </>
        )}
      </button>
      {pull.error ? (
        <p data-testid="studio-inspiration-error" className="text-2xs text-amber-400">
          {pull.error}
        </p>
      ) : null}
    </div>
  );
}

function InspirationEmptyState({ pull }: { pull: InspirationPull }) {
  return (
    <div
      data-testid="studio-inspiration-empty"
      className="flex flex-col items-center gap-3 p-6 text-center"
    >
      <Sparkles className="h-6 w-6 text-purple-400" />
      <p className="text-sm font-medium text-white">No inspiration saved yet</p>
      <p className="max-w-[16rem] text-xs leading-relaxed text-gray-400">
        Inspiration is competitor creative pulled from the brands you track. Nothing has been saved
        for this brand yet — pull a set to fill this folder.
      </p>
      <InspirationPullButton label="Find inspiration" pull={pull} />
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
        <HoverCardTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: draggable Library tile; nested quick action requires a non-button wrapper
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
          }
        />
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
