'use client';

// Keeps the Library page live for every viewer, with no reload: when anything a
// collection's membership depends on changes — its items, a field value, an asset's
// tags or review status — the RSC seed is re-read, which re-renders the grid through
// the same path a navigation takes. The collection list re-reads on any change too,
// so a collection someone else saves appears in the sidebar.
//
// router.refresh() rather than a hand-rolled merge: a smart collection's membership
// is decided by SQL (media.asset_matches_smart_query), and restating that predicate
// in the browser is exactly the copy that drifts.

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { type PostgresChangesBinding, subscribeToPostgresChanges } from '@/lib/supabase/realtime';

const REFRESH_DEBOUNCE_MS = 400;

export function useLibraryLiveRefresh(brandId: string, selectedCollectionId: string | null) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };
    const brandFilter = `brand_id=eq.${brandId}`;
    const bindings: PostgresChangesBinding[] = [
      { event: '*', schema: 'media', table: 'collections', filter: brandFilter, onRow: refresh },
    ];
    if (selectedCollectionId) {
      bindings.push(
        {
          event: '*',
          schema: 'media',
          table: 'collection_items',
          filter: `collection_id=eq.${selectedCollectionId}`,
          onRow: refresh,
        },
        {
          event: '*',
          schema: 'media',
          table: 'asset_field_values',
          filter: brandFilter,
          onRow: refresh,
        },
        { event: 'UPDATE', schema: 'media', table: 'assets', filter: brandFilter, onRow: refresh },
      );
    }
    const unsubscribe = subscribeToPostgresChanges({
      label: `library-live-${brandId}`,
      bindings,
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [brandId, selectedCollectionId, router]);
}
