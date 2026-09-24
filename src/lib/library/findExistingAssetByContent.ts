// A file dropped onto the canvas is often one the brand already stores: an output
// downloaded and dropped back in, or the same photo dropped twice. Downloading renames
// the file, so its name proves nothing; identical bytes do. Matching on sha256 + size
// lets the drop point at the stored asset instead of saving a second copy.

import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { computeChecksum, type SupabaseBrowserClient } from './uploadMediaAsset';

export interface ExistingAsset {
  assetId: string;
  versionId: string;
  storagePath: string;
  bucket: string;
  signedUrl: string;
}

export interface FindExistingAssetDeps {
  createClient?: () => SupabaseBrowserClient;
  fetchImpl?: typeof fetch;
}

type MatchingRow = {
  id: string;
  bucket: string;
  storage_path: string;
  head_version_id: string;
};

/** The brand's stored asset with these exact bytes, or null. Never throws: a miss or
 *  any failure just means the caller uploads as it always did. */
export async function findExistingAssetByContent(
  params: { file: File; brandId: string },
  deps: FindExistingAssetDeps = {},
): Promise<ExistingAsset | null> {
  try {
    const checksum = await computeChecksum(params.file);
    if (!checksum) return null;

    const client = (deps.createClient ?? createSupabaseBrowserClient)();
    const { data, error } = await mediaSchema(client)
      .from('assets')
      .select('id, bucket, storage_path, head_version_id')
      .eq('brand_id', params.brandId)
      .eq('checksum', checksum)
      .eq('size_bytes', params.file.size)
      .is('deleted_at', null)
      .not('head_version_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as MatchingRow;

    const response = await (deps.fetchImpl ?? fetch)('/api/library/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: params.brandId, assetId: row.id }),
    });
    if (!response.ok) return null;
    const { signedUrl } = (await response.json()) as { signedUrl?: string };
    if (!signedUrl) return null;

    return {
      assetId: row.id,
      versionId: row.head_version_id,
      storagePath: row.storage_path,
      bucket: row.bucket,
      signedUrl,
    };
  } catch (err) {
    console.warn('[library] content lookup failed; uploading instead', err);
    return null;
  }
}
