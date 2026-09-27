'use client';

// Keeps the Library page live for every viewer, brand-wide, from the moment it mounts.
// Collection create/rename/delete refreshes the list for everyone; a grid whose order or
// membership SQL decides (a smart collection, a field sort, field filters) re-reads when a
// field value it depends on changes.
//
// Most changes are merged where they are shown, without a round trip: the grid merges asset
// rows (useMediaLibrary), the board merges field values and review moves (LibraryBoardView),
// the asset panel merges its own field values (AssetFieldsPanel). What cannot be merged in
// the browser is MEMBERSHIP that SQL decides — a smart collection is whatever
// media.asset_matches_smart_query says, and restating that predicate here is the copy that
// drifts — and the collection list itself. Those re-read the RSC seed (router.refresh),
// debounced, and only when the change can actually move what is on screen.

import type { MediaCollection } from '@continuum/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
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
  // A grid sorted by a custom field (?sort=field_asc|field_desc) is ordered by SQL on the
  // field's values, so another member's edit to one can move a card.
  const sort = useSearchParams().get('sort');
  const sortedByFieldRef = useRef(false);
  sortedByFieldRef.current = sort === 'field_asc' || sort === 'field_desc';

  useEffect(() => {
    if (!brandId) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };
    const refreshIfSmart = () => {
      if (selectedRef.current?.kind === 'smart') refresh();
    };
    const refreshOnFieldChange = () => {
      if (selectedRef.current?.kind === 'smart' || sortedByFieldRef.current) refresh();
    };
    const brandFilter = `brand_id=eq.${brandId}`;
    const unsubscribe = subscribeToPostgresChanges({
      label: `library-live-${brandId}`,
      bindings: [
        { event: '*', schema: 'media', table: 'collections', filter: brandFilter, onRow: refresh },
        // Being added to (or dropped from) a restricted collection changes what this
        // person can see: the collection and its assets appear or vanish.
        {
          event: '*',
          schema: 'media',
          table: 'collection_members',
          filter: brandFilter,
          onRow: refresh,
        },
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
          onRow: refreshOnFieldChange,
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

/**
 * A grid filtered by custom fields (the filter-bar chips) is decided by the field values,
 * so another member's edit can add or remove a card: re-read while any field filter is on.
 */
export function useFieldFilterLiveRefresh(brandId: string | null, active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!brandId || !active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToPostgresChanges({
      label: `library-field-filter-${brandId}`,
      bindings: [
        {
          event: '*',
          schema: 'media',
          table: 'asset_field_values',
          filter: `brand_id=eq.${brandId}`,
          onRow: () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
          },
        },
      ],
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [brandId, active, router]);
}
