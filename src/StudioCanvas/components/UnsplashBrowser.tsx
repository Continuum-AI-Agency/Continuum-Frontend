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
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useRef, useState, useMemo as useUiConfigMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { searchUnsplash } from '@/lib/api/aiStudioUnsplash.client';
import { CanvasFloatingPanel } from './CanvasFloatingPanel';

const PER_PAGE = 24;

type Status = 'idle' | 'loading' | 'loaded' | 'error' | 'unconfigured';

function useLocalOrientationsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: ReadonlyArray<{
      value: UnsplashOrientation | 'any';
      label: string;
    }> = [
      { value: 'any', label: translateConfig('any_2b505597') },
      { value: 'landscape', label: translateConfig('landscape_e658d3ae') },
      { value: 'portrait', label: translateConfig('portrait_f71094c3') },
      { value: 'squarish', label: translateConfig('square_c11092bc') },
    ];
    return value;
  }, [translateConfig]);
}

interface UnsplashBrowserProps {
  brandProfileId?: string;
  onPick: (photo: UnsplashPhoto) => void;
  onClose: () => void;
}

export function UnsplashBrowser({ brandProfileId, onPick, onClose }: UnsplashBrowserProps) {
  const ORIENTATIONS = useLocalOrientationsMessages();

  const translateUi = useUiTranslations('studio');

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
            ? translateUi('unsplash_is_rate_limited_right_now__f1b0f7b2')
            : translateUi('couldn_t_reach_unsplash_please_try__b4f23a35'),
        );
        setStatus('error');
      }
    },
    [brandProfileId, translateUi],
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
          aria-label={translateUi('search_unsplash_89223d02')}
          placeholder={translateUi('search_photos_e_g_minimal_studio_ba_4ad6116a')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={status === 'loading'}
        />
        <Button type="submit" disabled={status === 'loading' || !query.trim()}>
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            translateUi('search_49c266ba')
          )}
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
          {' '}
          {translateUi('unsplash_isn_t_configured_on_this_e_91db2499')}{' '}
        </p>
      )}

      {status === 'error' && errorMessage && (
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      )}

      {status === 'loaded' && photos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {translateUi('no_photos_matched_that_search_0c10dab0')}
        </p>
      )}

      {status === 'loaded' && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <figure key={photo.id} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onPick(photo)}
                className="group relative overflow-hidden rounded-md border border-border/60 focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={translateUi('add_photo_by_value0_to_the_canvas_07c20e4c', {
                  value0: String(photo.photographerName),
                })}
              >
                {/* Hotlinked from the Unsplash CDN — see the file header. The
                    dominant colour paints the tile before the image lands. */}
                <img
                  src={photo.thumbUrl}
                  alt={
                    photo.alt ??
                    translateUi('photo_by_value0_05034f6b', {
                      value0: String(photo.photographerName),
                    })
                  }
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90"
                  style={{ backgroundColor: photo.color }}
                />
              </button>
              <figcaption className="truncate text-xs leading-tight text-muted-foreground">
                <a
                  href={photo.photographerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                >
                  {photo.photographerName}
                </a>
                {translateUi('unsplashCreditOn')}
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
