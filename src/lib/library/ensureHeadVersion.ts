// Data access for the asset head (media.assets) and its version history, plus
// the lazy v1 backfill both writers depend on.
//
// media.assets is the head: its file columns mirror the newest version. History
// only starts existing the first time a file is superseded, so an asset that was
// never re-uploaded has ZERO media.asset_versions rows even though a "v1"
// conceptually exists. Anything that needs to name the current version by id —
// registering v2, pinning a comment to what the author was looking at — must
// therefore materialize v1 first. That backfill lives here so the versions route
// and the comments route cannot drift apart on it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from '@/lib/media/supabase-media';
import {
  ASSET_VERSION_SELECT,
  type AssetVersionRow,
  buildBackfillV1Row,
  isHeadVersion,
} from './versionMapping';

const UNIQUE_VIOLATION = '23505';

export type AssetHeadRow = {
  id: string;
  brand_id: string;
  created_by: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum: string | null;
  review_status: string;
};

export const ASSET_HEAD_SELECT =
  'id, brand_id, created_by, bucket, storage_path, file_name, mime_type, ' +
  'size_bytes, width, height, duration_ms, checksum, review_status';

export async function loadAssetHead(
  client: SupabaseClient,
  brandId: string,
  assetId: string,
): Promise<AssetHeadRow | null> {
  const { data, error } = await mediaSchema(client)
    .from('assets')
    .select(ASSET_HEAD_SELECT)
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('[library/versions] asset lookup failed', error);
    throw new Error('Asset lookup failed');
  }
  return (data as AssetHeadRow | null) ?? null;
}

// Newest first — every caller below relies on that ordering.
export async function loadVersionRows(
  client: SupabaseClient,
  brandId: string,
  assetId: string,
): Promise<AssetVersionRow[]> {
  const { data, error } = await mediaSchema(client)
    .from('asset_versions')
    .select(ASSET_VERSION_SELECT)
    .eq('asset_id', assetId)
    .eq('brand_id', brandId)
    .order('version_number', { ascending: false });
  if (error) {
    console.error('[library/versions] version list failed', error);
    throw new Error('Version list failed');
  }
  return (data ?? []) as unknown as AssetVersionRow[];
}

// A rollback copies the promoted file's bucket+path into a new row, so more than
// one row can match the head object — the newest match is the head version.
export function findHeadVersionId(
  rows: AssetVersionRow[],
  head: { bucket: string; storage_path: string },
): string | null {
  return rows.find((row) => isHeadVersion(row, head))?.id ?? null;
}

// Read-only: the id of the version the asset currently shows, or null when no
// history row exists yet. A GET must never materialize v1 — reads do not write.
export async function resolveHeadVersionId(
  client: SupabaseClient,
  head: { id: string; brand_id: string; bucket: string; storage_path: string },
): Promise<string | null> {
  const rows = await loadVersionRows(client, head.brand_id, head.id);
  return findHeadVersionId(rows, head);
}

export type EnsuredHeadVersion = {
  headVersionId: string;
  // Highest version_number on record after the ensure — always >= 1.
  maxVersionNumber: number;
};

// Materializes v1 from the head row when history is empty, then names the head
// version. Runs on the admin client: the backfill preserves the ASSET's creator
// as created_by, which the RLS insert policy (created_by = auth.uid()) forbids
// any other member from writing.
//
// Concurrency: two first-writers can both see an empty history and both insert
// v1. The unique (asset_id, version_number) constraint makes the loser fail with
// 23505 — which is a success for our purpose (v1 exists), so we swallow it and
// re-read to pin to the row that actually landed. Exactly one v1 row can exist.
export async function ensureHeadVersion(
  admin: SupabaseClient,
  head: AssetHeadRow,
): Promise<EnsuredHeadVersion> {
  let rows = await loadVersionRows(admin, head.brand_id, head.id);

  if (rows.length === 0) {
    const { error } = await mediaSchema(admin)
      .from('asset_versions')
      .insert(buildBackfillV1Row(head));
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error('[library/versions] v1 backfill failed', error);
      throw new Error('Version backfill failed');
    }
    rows = await loadVersionRows(admin, head.brand_id, head.id);
  }

  const firstRow = rows[0];
  if (!firstRow) {
    throw new Error('Version backfill produced no rows');
  }

  // No row matching the head file means a writer replaced media.assets' file
  // without appending a version. History is then out of step with the head, but
  // the newest row is still the closest thing to "current" — pinning to it beats
  // dropping the comment or 500ing the upload.
  const matchedHeadId = findHeadVersionId(rows, head);
  if (!matchedHeadId) {
    console.warn('[library/versions] head file has no version row; pinning to the newest', {
      assetId: head.id,
    });
  }

  return {
    headVersionId: matchedHeadId ?? firstRow.id,
    maxVersionNumber: firstRow.version_number,
  };
}
