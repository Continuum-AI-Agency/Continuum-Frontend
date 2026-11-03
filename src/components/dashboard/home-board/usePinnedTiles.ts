'use client';

// Pinned tiles, per member and brand, in this browser (localStorage; no table, by decision of
// 2026-11-03). A pinned tile stays at the top of the board whatever the sort.
import { type HomeTileId, homeTileIdSchema } from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';

export function pinsStorageKey(userId: string | null, brandId: string): string {
  return `continuum:home:pins:${userId ?? 'anon'}:${brandId}`;
}

export function parsePins(raw: string | null): HomeTileId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const id = homeTileIdSchema.safeParse(value);
      return id.success ? [id.data] : [];
    });
  } catch {
    return [];
  }
}

export function usePinnedTiles(userId: string | null, brandId: string) {
  const key = pinsStorageKey(userId, brandId);
  const [pins, setPins] = useState<HomeTileId[]>([]);

  useEffect(() => {
    setPins(parsePins(window.localStorage.getItem(key)));
  }, [key]);

  const togglePin = useCallback(
    (id: HomeTileId) => {
      setPins((current) => {
        const next = current.includes(id)
          ? current.filter((pinned) => pinned !== id)
          : [...current, id];
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // A full or blocked storage keeps the pin for this visit only.
        }
        return next;
      });
    },
    [key],
  );

  return { pins, togglePin };
}
