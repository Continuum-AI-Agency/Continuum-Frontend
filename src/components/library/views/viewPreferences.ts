// A user's own Library presentation (layout + grid card options), one row per
// (user, brand) in media.library_view_preferences. Shared by the RSC page (read) and
// the client hook (write) — so no 'use client' here.
//
// The table may not exist yet on a database that has not taken its migration; the
// Library must still render, with defaults, rather than fail on a preference.

import { type CollectionViewConfig, collectionViewConfigSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from '@/lib/media/supabase-media';

export const VIEW_PREFERENCES_TABLE = 'library_view_preferences';

const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205']);

export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_RELATION_CODES.has(error.code);
}

export function parseViewPreferences(raw: unknown): CollectionViewConfig {
  const parsed = collectionViewConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export async function readLibraryViewPreferences(
  supabase: SupabaseClient,
  brandId: string,
): Promise<CollectionViewConfig> {
  // RLS returns only the caller's own row, so brand_id alone picks it.
  const { data, error } = await mediaSchema(supabase)
    .from(VIEW_PREFERENCES_TABLE)
    .select('config')
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) {
      console.error('[library] view preferences read failed', error);
    }
    return {};
  }
  return parseViewPreferences((data as { config?: unknown } | null)?.config);
}

export async function writeLibraryViewPreferences(
  supabase: SupabaseClient,
  brandId: string,
  config: CollectionViewConfig,
): Promise<void> {
  // user_id defaults to auth.uid(), so the conflict target resolves to the caller's row.
  const { error } = await mediaSchema(supabase)
    .from(VIEW_PREFERENCES_TABLE)
    .upsert(
      { brand_id: brandId, config, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,brand_id' },
    );
  if (error && !isMissingTableError(error)) {
    console.error('[library] view preferences write failed', error);
  }
}
