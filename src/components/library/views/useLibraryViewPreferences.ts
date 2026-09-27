'use client';

// Optimistic local copy of the user's Library view preferences. The RSC page reads
// the row once and seeds it; changes apply instantly and persist in the background.
// Card tweaks are debounced (a user clicks through sizes); a layout change is written
// at once and awaitable, because the next page render reads it when the URL omits it.

import type { CollectionViewConfig, LibraryLayout } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CardViewOptions } from './cardOptions';
import { writeLibraryViewPreferences } from './viewPreferences';

const CARD_WRITE_DEBOUNCE_MS = 600;

export function useLibraryViewPreferences(brandId: string, initial: CollectionViewConfig) {
  const [config, setConfig] = useState<CollectionViewConfig>(initial);
  const latest = useRef(config);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the page inside the debounce window flushes the write rather than losing it.
  useEffect(
    () => () => {
      if (!pendingWrite.current) return;
      clearTimeout(pendingWrite.current);
      void writeLibraryViewPreferences(createSupabaseBrowserClient(), brandId, latest.current);
    },
    [brandId],
  );

  const apply = useCallback((next: CollectionViewConfig) => {
    latest.current = next;
    setConfig(next);
  }, []);

  const setLayout = useCallback(
    (layout: LibraryLayout): Promise<void> => {
      if (pendingWrite.current) clearTimeout(pendingWrite.current);
      pendingWrite.current = null;
      const next = { ...latest.current, layout };
      apply(next);
      return writeLibraryViewPreferences(createSupabaseBrowserClient(), brandId, next);
    },
    [apply, brandId],
  );

  const setCard = useCallback(
    (patch: Partial<CardViewOptions>) => {
      const next = { ...latest.current, card: { ...latest.current.card, ...patch } };
      apply(next);
      if (pendingWrite.current) clearTimeout(pendingWrite.current);
      pendingWrite.current = setTimeout(() => {
        pendingWrite.current = null;
        void writeLibraryViewPreferences(createSupabaseBrowserClient(), brandId, latest.current);
      }, CARD_WRITE_DEBOUNCE_MS);
    },
    [apply, brandId],
  );

  return { config, card: config.card, setLayout, setCard };
}
