'use client';

// In-canvas Unsplash search. Type a term, browse results, click a photo to drop
// it on the board as an unattached reference node.
//
// Two Unsplash obligations live in this component and must survive any redesign:
//   - the grid HOTLINKS `thumbUrl` straight from the Unsplash CDN, because that
//     is how a photographer is credited for a view;
//   - every tile shows the photographer and links back to their profile and to
//     Unsplash. Attribution is a requirement of the API licence, not a caption.

import type { UnsplashOrientation, UnsplashPhoto } from '@continuum/contracts';
import { Camera, Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { searchUnsplash } from '@/lib/api/aiStudioUnsplash.client';
import { CanvasFloatingPanel } from './CanvasFloatingPanel';

const PER_PAGE = 24;

type Status = 'idle' | 'loading' | 'loaded' | 'error' | 'unconfigured';

const ORIENTATIONS: ReadonlyArray<{ value: UnsplashOrientation | 'any'; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'squarish', label: 'Square' },
];

interface UnsplashBrowserProps {
  brandProfileId?: string;
  onPick: (photo: UnsplashPhoto) => void;
  onClose: () => void;
}

export function UnsplashBrowser({ brandProfileId, onPick, onClose }: UnsplashBrowserProps) {
  const [query, setQuery] = useState('');
  const [orientation, setOrientation] = useState<UnsplashOrientation | 'any'>('any');
  const [status, setStatus] = useState<Status>('idle');
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (term: string, pickedOrientation: UnsplashOrientation | 'any') => {
      if (!brandProfileId || !term.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setErrorMessage(null);
      try {
        const response = await searchUnsplash({
          brandId: brandProfileId,
          query: term.trim(),
          perPage: PER_PAGE,
          orientation: pickedOrientation === 'any' ? undefined : pickedOrientation,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.configured) {
          setStatus('unconfigured');
          return;
        }
        setPhotos(response.results);
        setStatus('loaded');
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return;
        // The rate limit is shared across every brand, so "try again shortly" is
        // the honest message rather than a generic failure.
        const rateLimited = error instanceof Error && /rate.?limit|429/i.test(error.message);
        setErrorMessage(
          rateLimited
            ? 'Unsplash is rate limited right now — try again in a few minutes.'
            : "Couldn't reach Unsplash. Please try again.",
        );
        setStatus('error');
      }
    },
    [brandProfileId],
  );

  const changeOrientation = useCallback(
    (next: UnsplashOrientation | 'any') => {
      setOrientation(next);
      if (query.trim()) void runSearch(query, next);
    },
    [query, runSearch],
  );

  return (
    <CanvasFloatingPanel
      title="Unsplash"
      icon={<Camera className="size-4" aria-hidden />}
      onClose={onClose}
      className="mt-12 h-[560px]"
      bodyClassName="flex flex-col gap-3 overflow-y-auto p-4"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query, orientation);
        }}
      >
        <Input
          aria-label="Search Unsplash"
          placeholder="Search photos — e.g. minimal studio backdrop"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={status === 'loading'}
        />
        <Button type="submit" disabled={status === 'loading' || !query.trim()}>
          {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      <div className="flex gap-1">
        {ORIENTATIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={orientation === option.value ? 'secondary' : 'ghost'}
            className="h-7 px-2 text-xs"
            onClick={() => changeOrientation(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] rounded-md" />
          ))}
        </div>
      )}

      {status === 'unconfigured' && (
        <p className="text-sm text-muted-foreground">
          Unsplash isn&apos;t configured on this environment yet.
        </p>
      )}

      {status === 'error' && errorMessage && (
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      )}

      {status === 'loaded' && photos.length === 0 && (
        <p className="text-sm text-muted-foreground">No photos matched that search.</p>
      )}

      {status === 'loaded' && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <figure key={photo.id} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onPick(photo)}
                className="group relative overflow-hidden rounded-md border border-border/60 focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={`Add photo by ${photo.photographerName} to the canvas`}
              >
                {/* Hotlinked from the Unsplash CDN — see the file header. The
                    dominant colour paints the tile before the image lands. */}
                <img
                  src={photo.thumbUrl}
                  alt={photo.alt ?? `Photo by ${photo.photographerName}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90"
                  style={{ backgroundColor: photo.color }}
                />
              </button>
              <figcaption className="truncate text-[11px] leading-tight text-muted-foreground">
                <a
                  href={photo.photographerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                >
                  {photo.photographerName}
                </a>
                {' on '}
                <a
                  href={photo.unsplashUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                >
                  Unsplash
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </CanvasFloatingPanel>
  );
}
