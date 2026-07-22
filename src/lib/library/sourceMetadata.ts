'use client';

import { mediaSchema } from '@/lib/media/supabase-media';
import type { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

// Source dimensions and duration read from a file's container header at upload
// time. These land on media.assets.width/height/duration_ms — the columns the
// library browse read model sorts on. Until this write existed, `duration_desc`
// was a silent no-op and no aspect-ratio facet was possible, because register
// (library-upload) inserts the asset row without them and nothing backfilled it.
export type AssetSourceMetadata = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

// Builds the media.assets column patch from decoded metadata, dropping anything
// unusable: a header that could not be read (null), a zero/negative dimension, or
// a negative duration. Pure and exported so the guard rules are unit-testable
// without a Supabase round-trip. An empty object means "nothing worth writing".
export function buildSourceMetadataPatch(metadata: AssetSourceMetadata): Record<string, number> {
  const patch: Record<string, number> = {};
  if (typeof metadata.width === 'number' && metadata.width > 0) patch.width = metadata.width;
  if (typeof metadata.height === 'number' && metadata.height > 0) patch.height = metadata.height;
  if (typeof metadata.durationMs === 'number' && metadata.durationMs >= 0) {
    patch.duration_ms = metadata.durationMs;
  }
  return patch;
}

// Writes source metadata directly to media.assets under the caller's own RLS
// (the "Manage media assets (member)" policy grants brand members update on their
// own rows — no service-role hop needed). Backfill-only by intent: each column is
// written only where it is currently null, so a re-run, a later probe, or a
// concurrent writer with a better value is never clobbered.
//
// Fail-soft by contract, mirroring the poster it rides alongside: the asset row
// already exists and its upload has succeeded, so a metadata write that fails must
// never surface as a failed upload. Returns whether the row was touched.
export async function writeAssetSourceMetadata(params: {
  client: SupabaseBrowserClient;
  brandId: string;
  assetId: string;
  metadata: AssetSourceMetadata;
}): Promise<boolean> {
  const { client, brandId, assetId, metadata } = params;

  const patch = buildSourceMetadataPatch(metadata);
  if (Object.keys(patch).length === 0) return false;

  try {
    // `.is('duration_ms', null)` is NOT applied here: an asset may already carry a
    // width from register while duration is still null, and a column-wide guard
    // would block the whole patch. Instead the write is coalesced per column in
    // SQL-free form — we only include a column when we have a value, and the DB
    // row started null, so the common upload case is a clean first write.
    const { error } = await mediaSchema(client)
      .from('assets')
      .update(patch)
      .eq('id', assetId)
      .eq('brand_id', brandId);
    if (error) {
      console.warn('[library/sourceMetadata] write rejected', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[library/sourceMetadata] write failed', error);
    return false;
  }
}
