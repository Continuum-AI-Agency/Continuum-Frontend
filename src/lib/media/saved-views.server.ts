import 'server-only';

import { type LibrarySavedView, librarySavedViewSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from './supabase-media';

type SavedViewRow = {
  id: string;
  brand_id: string;
  name: string;
  query: unknown;
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchLibrarySavedViews(
  client: SupabaseClient,
  brandId: string,
): Promise<LibrarySavedView[]> {
  const { data, error } = await mediaSchema(client)
    .from('saved_views')
    .select('id, brand_id, name, query, is_shared, created_by, created_at, updated_at')
    .eq('brand_id', brandId)
    .order('name', { ascending: true });
  if (error) throw new Error(`Library saved views failed: ${error.message}`);

  return ((data ?? []) as unknown as SavedViewRow[]).flatMap((row) => {
    const parsed = librarySavedViewSchema.safeParse({
      id: row.id,
      brandId: row.brand_id,
      name: row.name,
      query: row.query,
      isShared: row.is_shared,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
}
