// Wire schema + browser client for the Library → Canvas handoff. Both ends of this
// call live in the Frontend (a Next route handler and the detail modal), so the
// schema is local rather than in @continuum/contracts — nothing crosses the FE↔BE
// boundary here. The Backend's own canvas seam is the MCP studio_workflow tool,
// which writes the same canvas_sessions row through its own contract.

import { type MediaAsset, mediaAssetSchema } from '@continuum/contracts';
import { z } from 'zod';
import { LIBRARY_CANVAS_TEMPLATES } from './canvasTemplates';
import { saveFileAsNewVersion } from './quickLook';

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

// Promotes a canvas output onto the asset it was derived from, through the same
// sign + register version flow the rest of the Library uses.
export async function saveDerivedAssetAsVersion(params: {
  brandId: string;
  assetId: string;
  derived: MediaAsset;
}): Promise<number> {
  const { brandId, assetId, derived } = params;
  if (!derived.signedUrl) throw new Error('That canvas output has no readable file');

  const response = await fetch(derived.signedUrl);
  if (!response.ok) throw new Error('Could not download the canvas output');
  const blob = await response.blob();
  const file = new File([blob], derived.fileName, { type: derived.mimeType });

  return saveFileAsNewVersion({ brandId, assetId, file, note: 'Canvas output' });
}
