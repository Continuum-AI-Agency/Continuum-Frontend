'use client';

// Keeps the Library page live for every viewer, brand-wide, from the moment it mounts.
//
// Most changes are merged where they are shown, without a round trip: the grid merges asset
// rows (useMediaLibrary), the board merges field values and review moves (LibraryBoardView),
// the asset panel merges its own field values (AssetFieldsPanel). What cannot be merged in
// the browser is MEMBERSHIP that SQL decides — a smart collection is whatever
// media.asset_matches_smart_query says, and restating that predicate here is the copy that
// drifts — and the collection list itself. Those re-read the RSC seed (router.refresh),
// debounced, and only when the change can actually move what is on screen.

import type { MediaCollection } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

const REFRESH_DEBOUNCE_MS = 250;

export function useLibraryLiveRefresh(
  brandId: string,
  selected: Pick<MediaCollection, 'id' | 'kind'> | null,
) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside the handlers, so switching collections re-targets without resubscribing.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (!brandId) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };
    const refreshIfSmart = () => {
      if (selectedRef.current?.kind === 'smart') refresh();
    };
    const brandFilter = `brand_id=eq.${brandId}`;
    const unsubscribe = subscribeToPostgresChanges({
      label: `library-live-${brandId}`,
      bindings: [
        { event: '*', schema: 'media', table: 'collections', filter: brandFilter, onRow: refresh },
        {
          event: '*',
          schema: 'media',
          table: 'collection_items',
          onRow: (row, meta) => {
            const source = meta.eventType === 'DELETE' ? meta.old : row;
            if (source.collection_id === selectedRef.current?.id) refresh();
          },
        },
        {
          event: '*',
          schema: 'media',
          table: 'asset_field_values',
          filter: brandFilter,
          onRow: refreshIfSmart,
        },
        {
          event: 'UPDATE',
          schema: 'media',
          table: 'assets',
          filter: brandFilter,
          onRow: refreshIfSmart,
        },
      ],
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [brandId, router]);
}
