'use client';

// The Library media bin's "Add media" affordance: pick other library assets to
// place on the timeline. Recent assets by default, semantic/keyword search when
// the user types. Only image/video can be placed, so anything else is filtered
// out client-side rather than shown as an un-addable tile.

import type { MediaAsset } from '@continuum/contracts';
import { mediaSearchResponseSchema } from '@continuum/contracts';
import { ImageIcon, Loader2, Plus, Search, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LibraryPoolSource } from './timelineDraftMapping';

const SEARCH_DEBOUNCE_MS = 350;
const RECENT_LIMIT = 48;

export type LibraryMediaPickerDialogProps = {
  brandId: string;
  /** Assets already in the bin — shown as disabled tiles so the bin stays deduped. */
  excludeAssetIds: readonly string[];
  onAdd: (sources: LibraryPoolSource[]) => void;
};

function isPlaceable(asset: MediaAsset): boolean {
  return asset.kind === 'image' || asset.kind === 'video';
}

export function assetToPoolSource(asset: MediaAsset): LibraryPoolSource {
  return {
    nodeId: asset.id,
    kind: asset.kind === 'image' ? 'image' : 'video',
    label: asset.title ?? asset.fileName,
    ...(asset.signedUrl ? { previewUrl: asset.signedUrl } : {}),
    ...(asset.durationMs != null ? { durationSec: asset.durationMs / 1000 } : {}),
  };
}

function formatDuration(durationMs: number | null | undefined): string | null {
  if (durationMs == null || durationMs <= 0) return null;
  const total = Math.round(durationMs / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function fetchRecent(brandId: string, signal: AbortSignal): Promise<MediaAsset[]> {
  const query = new URLSearchParams({ brandId, limit: String(RECENT_LIMIT) });
  const response = await fetch(`/api/library/assets?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`Could not load the library (${response.status})`);
  const body = (await response.json()) as { items?: MediaAsset[] };
  return (body.items ?? []).filter(isPlaceable);
}

async function fetchSearch(
  brandId: string,
  query: string,
  signal: AbortSignal,
): Promise<MediaAsset[]> {
  const response = await fetch('/api/library/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, mode: 'text', query, limit: 24 }),
    signal,
  });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const parsed = mediaSearchResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Search returned an unexpected response');
  return parsed.data.items.map((item) => item.asset).filter(isPlaceable);
}

function MediaTile({
  asset,
  selected,
  disabled,
  onToggle,
}: {
  asset: MediaAsset;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const duration = formatDuration(asset.durationMs);
  const preview = asset.thumbnailUrl ?? (asset.kind === 'image' ? asset.signedUrl : null);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border text-left transition-colors',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-foreground/30',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <div className="relative aspect-video w-full bg-muted/50">
        {preview ? (
          // Signed storage URLs are not on a next/image-configured host.
          // biome-ignore lint/performance/noImgElement: signed Supabase URLs are not routable through next/image
          <img
            src={preview}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            {asset.kind === 'video' ? (
              <Video className="size-5" aria-hidden />
            ) : (
              <ImageIcon className="size-5" aria-hidden />
            )}
          </span>
        )}
        <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-2xs uppercase text-muted-foreground">
          {asset.kind}
        </span>
        {duration ? (
          <span className="absolute right-1 bottom-1 rounded bg-background/80 px-1 text-2xs tabular-nums text-muted-foreground">
            {duration}
          </span>
        ) : null}
      </div>
      <span className="truncate px-2 py-1 text-xs">{asset.title ?? asset.fileName}</span>
    </button>
  );
}

export function LibraryMediaPickerDialog({
  brandId,
  excludeAssetIds,
  onAdd,
}: LibraryMediaPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excluded = new Set(excludeAssetIds);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const trimmed = query.trim();

    const load = () => {
      setLoading(true);
      setError(null);
      const request = trimmed
        ? fetchSearch(brandId, trimmed, controller.signal)
        : fetchRecent(brandId, controller.signal);
      request
        .then((items) => {
          if (!controller.signal.aborted) setAssets(items);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Could not load media');
          setAssets([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed) {
      debounceRef.current = setTimeout(load, SEARCH_DEBOUNCE_MS);
    } else {
      load();
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [open, query, brandId]);

  const toggle = useCallback((assetId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    const chosen = assets.filter((asset) => selected.has(asset.id)).map(assetToPoolSource);
    if (chosen.length > 0) onAdd(chosen);
    setSelected(new Set());
    setOpen(false);
  }, [assets, selected, onAdd]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected(new Set());
      setQuery('');
    }
  }, []);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Add media
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[70dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
            <DialogTitle className="text-sm font-medium">Add media from the Library</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pick images or videos to place on the timeline.
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b border-border px-4 py-2">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the library..."
                aria-label="Search the library"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Loading media...
              </p>
            ) : assets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {query.trim() ? 'No media matched that search.' : 'No placeable media yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((asset) => (
                  <MediaTile
                    key={asset.id}
                    asset={asset}
                    selected={selected.has(asset.id)}
                    disabled={excluded.has(asset.id)}
                    onToggle={() => toggle(asset.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={selected.size === 0} onClick={confirm}>
              Add {selected.size > 0 ? selected.size : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type LibraryBinActionsProps = LibraryMediaPickerDialogProps & {
  /** A saved draft exists, so there is something to throw away. */
  hasDraft: boolean;
  onDiscard: () => void;
};

// The adapter's `binAction`: what the media bin's header offers in the Library.
// The canvas grows its bin by wiring nodes and therefore renders nothing here.
export function LibraryBinActions({
  brandId,
  excludeAssetIds,
  onAdd,
  hasDraft,
  onDiscard,
}: LibraryBinActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <LibraryMediaPickerDialog brandId={brandId} excludeAssetIds={excludeAssetIds} onAdd={onAdd} />
      {hasDraft ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          className="text-muted-foreground"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Discard draft
        </Button>
      ) : null}
    </div>
  );
}
