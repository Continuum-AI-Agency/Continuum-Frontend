// One Library asset as the canvas sees it: the version it pins and the file it draws.
// Every caller reads media.canvas_library_context with the CALLER's own client (browser
// for a drop, the user's server client for Open in Canvas), so RLS decides what is
// visible — never a service key.

import {
  type CanvasLibraryContext,
  type CanvasLibrarySource,
  type CanvasLibraryVersionContext,
  canvasLibraryContextSchema,
  canvasLibrarySource,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from '@/lib/media/supabase-media';

export type LibraryCanvasPick = {
  version: CanvasLibraryVersionContext;
  /** Null when the version has nothing drawable yet (a proxy still rendering, an Office file). */
  source: CanvasLibrarySource | null;
};

export async function readCanvasLibraryContext(
  client: SupabaseClient,
  params: { brandId: string; assetIds: string[]; versionIds?: string[] },
): Promise<CanvasLibraryContext> {
  const { data, error } = await mediaSchema(client).rpc('canvas_library_context', {
    p_brand_id: params.brandId,
    p_asset_ids: params.assetIds,
    p_version_ids: params.versionIds ?? [],
  });
  if (error) throw new Error(`Could not read the Library asset: ${error.message}`);
  return canvasLibraryContextSchema.parse(data);
}

/** The pinned version when the context holds it, else the head. Null for a missing or trashed asset. */
export function pickCanvasLibrarySource(
  context: CanvasLibraryContext,
  assetId: string,
  versionId?: string | null,
): LibraryCanvasPick | null {
  const asset = context.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.deletedAt) return null;
  const version =
    context.versions.find((v) => v.assetId === assetId && v.id === versionId) ??
    context.versions.find((v) => v.id === asset.headVersionId);
  if (!version) return null;
  return {
    version,
    source: canvasLibrarySource({
      kind: asset.kind,
      fileName: version.fileName,
      mimeType: version.mimeType,
      bucket: version.bucket,
      storagePath: version.storagePath,
      renditions: version.renditions,
    }),
  };
}
