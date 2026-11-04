'use client';

// One Phase B Backend read, through the Backend client, parsed against its contract. It is read
// once per brand and query (React Query dedupes tiles and their sheets), never retried, and every
// failure reads as `unavailable`: see homeRead.ts.

import { HOME_READ_PATHS, type HomeReadEnvelope, type HomeReadName } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { request } from '@/lib/api/http';
import { PLATFORM_READ_TIMEOUT_MS } from '@/lib/api/timeout';
import { type HomeReadLoad, homeReadLoadOf, homeReadNotHereYet } from './homeRead';

const FIVE_MINUTES = 5 * 60 * 1000;

function warnUnlessNotHereYet(name: HomeReadName, error: unknown): void {
  if (!homeReadNotHereYet(error)) console.warn(`[home] ${name} read failed`, error);
}

export function useHomeRead<T>(input: {
  name: HomeReadName;
  brandId: string;
  schema: ZodType<HomeReadEnvelope<T>>;
  query?: Record<string, string | undefined>;
  enabled?: boolean;
}): HomeReadLoad<T> {
  const { name, brandId, schema, query = {}, enabled = true } = input;
  const params = new URLSearchParams({ brandId });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();

  const read = useQuery({
    queryKey: ['home-read', name, search],
    queryFn: async () => {
      try {
        return await request<HomeReadEnvelope<T>>({
          path: `${HOME_READ_PATHS[name]}?${search}`,
          schema,
          // Stored figures, no platform call; a cold read composes several of them.
          timeoutMs: PLATFORM_READ_TIMEOUT_MS,
        });
      } catch (error) {
        warnUnlessNotHereYet(name, error);
        throw error;
      }
    },
    enabled: enabled && Boolean(brandId),
    retry: false,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });

  if (read.data) return homeReadLoadOf(read.data);
  return read.isError ? { status: 'unavailable' } : { status: 'loading' };
}
