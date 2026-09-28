// Wire schema + browser client for the Library → Canvas handoff. Both ends of this
// call live in the Frontend (a Next route handler and the detail modal), so the
// schema is local rather than in @continuum/contracts — nothing crosses the FE↔BE
// boundary here. The Backend's own canvas seam is the MCP studio_workflow tool,
// which writes the same canvas_sessions row through its own contract.

import { type MediaAsset, mediaAssetSchema } from '@continuum/contracts';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { recordCanvasLineage } from '@/StudioCanvas/library/libraryContextStore';
import { LIBRARY_CANVAS_TEMPLATES } from './canvasTemplates';
import {
  registerAssetVersion,
  signVersionUpload,
  transitionAssetReviewOperation,
} from './creativeOperations';

export const openInCanvasRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    template: z.enum(LIBRARY_CANVAS_TEMPLATES),
  })
  .strict();
export type OpenInCanvasRequest = z.infer<typeof openInCanvasRequestSchema>;

export const openInCanvasResponseSchema = z
  .object({
    roomId: z.string().uuid(),
    seedId: z.string().min(1),
    referenceNodeId: z.string().min(1),
    genNodeIds: z.array(z.string().min(1)),
  })
  .strict();
export type OpenInCanvasResponse = z.infer<typeof openInCanvasResponseSchema>;

export const CANVAS_ROUTE = '/ai-studio';

export async function seedCanvasFromLibrary(
  request: OpenInCanvasRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenInCanvasResponse> {
  const response = await fetchImpl('/api/library/open-in-canvas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Could not open this asset in the canvas (${response.status})`);
  }
  return openInCanvasResponseSchema.parse(await response.json());
}

const derivedAssetsResponseSchema = z.object({ assets: z.array(mediaAssetSchema) });

// Everything generated FROM this asset: canvas outputs from a room it seeded, canvas
// outputs it was wired into as a reference, and its Smart resize variants. The route
// resolves the lineage through media_get_asset_usage, so this list matches the usage
// panel exactly.
export async function fetchDerivedCanvasAssets(
  params: { brandId: string; assetId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<MediaAsset[]> {
  const query = new URLSearchParams({ brandId: params.brandId, assetId: params.assetId });
  const response = await fetchImpl(`/api/library/derived?${query.toString()}`);
  if (!response.ok) throw new Error('Could not load the canvas outputs for this asset');
  return derivedAssetsResponseSchema.parse(await response.json()).assets;
}

// Promotes a canvas output (listed on the Library asset it derived from) onto that asset
// as its next version — the same revision the canvas's own "Save as revision" makes, with
// lineage from the version the output was actually made from (its canvas edge, re-pinned
// by the canvas) and the asset's head as the fallback.
export async function saveDerivedAssetAsVersion(params: {
  brandId: string;
  assetId: string;
  derived: MediaAsset;
}): Promise<number> {
  const { brandId, assetId, derived } = params;
  const supabase = createSupabaseBrowserClient();
  const media = supabase.schema('media');
  const [{ data: edge }, { data: asset }] = await Promise.all([
    media
      .from('asset_lineage')
      .select('source_version_id')
      .eq('brand_id', brandId)
      .eq('derived_asset_id', derived.id)
      .eq('source_asset_id', assetId)
      .limit(1)
      .maybeSingle(),
    media.from('assets').select('head_version_id').eq('id', assetId).maybeSingle(),
  ]);
  const sourceVersionId =
    (edge as { source_version_id?: string } | null)?.source_version_id ??
    (asset as { head_version_id?: string | null } | null)?.head_version_id;
  if (!sourceVersionId) throw new Error('This asset has no version to revise yet');

  const saved = await saveCanvasOutputAsRevision({
    brandId,
    sourceAssetId: assetId,
    sourceVersionId,
    output: {
      bucket: derived.bucket,
      storagePath: derived.storagePath,
      fileName: derived.fileName,
      mimeType: derived.mimeType,
      sizeBytes: derived.sizeBytes ?? null,
      assetId: derived.id,
    },
  });
  return saved.versionNumber;
}

export type CanvasRevisionInput = {
  brandId: string;
  /** The Library asset the output revises, and the exact version the canvas node pinned. */
  sourceAssetId: string;
  sourceVersionId: string;
  /** Where the output already sits (the generator's bucket), and its own asset if it has one. */
  output: {
    bucket: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes?: number | null;
    assetId?: string | null;
  };
  roomId?: string | null;
  nodeId?: string | null;
  /** Put the asset straight into review once the version lands. */
  fileIntoReview?: boolean;
};

export type CanvasRevisionResult = {
  versionId: string;
  versionNumber: number;
  /** False when the version landed but its lineage write failed — the version stands. */
  lineageRecorded: boolean;
  filedIntoReview: boolean;
};

// A canvas output becomes the next version of the asset it revises. The bytes never pass
// through the browser: Storage copies the object server-side into the path
// sign_version_upload assigns under the asset, register_asset_version records it as the new
// head, and record_canvas_lineage writes the canvas_revision edge from the version the node
// PINNED (room + node in its parameters — the Library's link back).
export async function saveCanvasOutputAsRevision(
  input: CanvasRevisionInput,
): Promise<CanvasRevisionResult> {
  const supabase = createSupabaseBrowserClient();
  const { brandId, sourceAssetId, sourceVersionId, output } = input;
  const ticket = await signVersionUpload(supabase, {
    brandId,
    assetId: sourceAssetId,
    fileName: output.fileName,
    mimeType: output.mimeType,
  });
  const { error: copyError } = await supabase.storage
    .from(output.bucket)
    .copy(output.storagePath, ticket.path, { destinationBucket: ticket.bucket });
  if (copyError) {
    throw new Error(`Could not copy the canvas output into the Library: ${copyError.message}`);
  }
  let sizeBytes = output.sizeBytes ?? null;
  if (sizeBytes === null) {
    const { data: info } = await supabase.storage.from(ticket.bucket).info(ticket.path);
    sizeBytes = typeof info?.size === 'number' ? info.size : 0;
  }

  const registered = await registerAssetVersion(supabase, {
    brandId,
    assetId: sourceAssetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: output.fileName,
    mimeType: output.mimeType,
    sizeBytes,
    note: 'Canvas revision',
    // No baseVersionId: it is the edge function's compare-and-swap against the CURRENT
    // head, and a revision of an older pinned version is exactly the case it would refuse.
    // Which version this derives from is the canvas_revision lineage edge below.
    integrityState: 'unknown',
  });
  const versionId =
    registered.versionId ??
    registered.versions.find((version) => version.versionNumber === registered.versionNumber)?.id;
  if (!versionId) throw new Error('The Library did not return the new version');

  let lineageRecorded = false;
  try {
    lineageRecorded =
      (await recordCanvasLineage({
        p_brand_id: brandId,
        p_derived_version_id: versionId,
        p_operation: 'canvas_revision',
        p_sources: [{ asset_id: sourceAssetId, version_id: sourceVersionId }],
        p_parameters: {
          roomId: input.roomId ?? null,
          nodeId: input.nodeId ?? null,
          outputAssetId: output.assetId ?? null,
        },
      })) > 0;
  } catch (error) {
    console.warn('[canvas revision] lineage not recorded', error);
  }

  let filedIntoReview = false;
  if (input.fileIntoReview) {
    await transitionAssetReviewOperation(supabase, {
      brandId,
      assetId: sourceAssetId,
      toStatus: 'in_review',
      note: `Revision v${registered.versionNumber} filed from the canvas`,
    });
    filedIntoReview = true;
  }
  return { versionId, versionNumber: registered.versionNumber, lineageRecorded, filedIntoReview };
}
