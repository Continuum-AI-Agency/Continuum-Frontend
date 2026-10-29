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
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';

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
    // `collections` and `collection_members` are change signals (no row): a private or
    // restricted collection is not every member's to see, so the topic only says "re-read".
    const stops = [
      subscribeToRowBroadcasts({
        topic: `collections:${brandId}`,
        bindings: [{ event: '*', onRow: refresh }],
      }),
      // Being added to (or dropped from) a restricted collection changes what this
      // person can see: the collection and its assets appear or vanish.
      subscribeToRowBroadcasts({
        topic: `collection_members:${brandId}`,
        bindings: [{ event: '*', onRow: refresh }],
      }),
      subscribeToRowBroadcasts({
        topic: `asset_field_values:${brandId}`,
        bindings: [{ event: '*', onRow: refreshOnFieldChange }],
      }),
      subscribeToRowBroadcasts({
        topic: `assets:${brandId}`,
        bindings: [{ event: 'UPDATE', onRow: refreshIfSmart }],
      }),
    ];
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const stop of stops) stop();
    };
  }, [brandId, router]);

  // A manual collection's items live on the collection's own topic, joined while it is open.
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId) return;
    return subscribeToRowBroadcasts({
      topic: `collection_items:${selectedId}`,
      bindings: [
        {
          event: '*',
          onRow: () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
          },
        },
      ],
    });
  }, [selectedId, router]);
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
    const unsubscribe = subscribeToRowBroadcasts({
      topic: `asset_field_values:${brandId}`,
      bindings: [
        {
          event: '*',
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
