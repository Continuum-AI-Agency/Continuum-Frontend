// A Template Forge render output as a Library asset.
//
// The slot is the identity of an output: the same render-set row rendering the same
// format again is a new VERSION of one asset, never a second asset. register_forge_output
// enforces that with a partial unique index on origin_ref.forgeSlot, so the backend
// ingest and the backfill must build the key the same way — which is why it lives here.

import { z } from 'zod';
import { mediaReviewStatusSchema } from './asset';

const uuid = () => z.string().uuid();

/**
 * Which format of a template a file is, from its name. The fleet names each file for the
 * comp it rendered plus a random suffix (`Producto_individual_con_descuento_9_16_ooqxxwb.jpg`),
 * so dropping the suffix leaves a key that is stable across re-renders. The extension stays:
 * a still and a video of the same comp are two outputs.
 */
export function forgeOutputFormatKey(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const underscore = stem.lastIndexOf('_');
  const comp = (underscore > 0 ? stem.slice(0, underscore) : stem)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return extension ? `${comp || 'output'}.${extension}` : comp || 'output';
}

/** `${renderSetId}:${rowId}:${format}`, falling back to the request (then the job) off a set. */
export function forgeOutputSlot(input: {
  renderSetId: string | null;
  rowId: string | null;
  renderRequestId: string | null;
  renderJobId: string;
  format: string;
}): string {
  if (input.renderSetId && input.rowId) {
    return `${input.renderSetId}:${input.rowId}:${input.format}`;
  }
  return `${input.renderRequestId ?? input.renderJobId}:${input.format}`;
}

/** asset_lineage.parameters of a forge_render edge. */
export const forgeLineageParametersSchema = z.object({
  renderJobId: uuid(),
  renderRequestId: uuid().nullable(),
  renderSetId: uuid().nullable(),
  rowId: uuid().nullable(),
  labelPath: z.array(z.string()).nullable(),
  templateRef: z.string().nullable(),
  format: z.string().min(1),
});
export type ForgeLineageParameters = z.infer<typeof forgeLineageParametersSchema>;

/** The Library side of one Forge output, as the Forge UI shows it. */
export const forgeOutputLibraryStateSchema = z.object({
  assetId: uuid(),
  reviewStatus: mediaReviewStatusSchema,
  versionNumber: z.number().int().positive(),
  versionCount: z.number().int().positive(),
  commentCount: z.number().int().nonnegative(),
});
export type ForgeOutputLibraryState = z.infer<typeof forgeOutputLibraryStateSchema>;

/** Where a Library asset came from in Forge, as the asset's provenance panel shows it. */
export const forgeProvenanceSchema = z.object({
  assetId: uuid(),
  templateAssetId: uuid().nullable(),
  templateName: z.string().nullable(),
  templateKey: z.string().nullable(),
  renderSetId: uuid().nullable(),
  renderSetName: z.string().nullable(),
  rowId: uuid().nullable(),
  labelPath: z.array(z.string()),
  format: z.string().nullable(),
  renderJobId: uuid(),
  renderRequestId: uuid().nullable(),
});
export type ForgeProvenance = z.infer<typeof forgeProvenanceSchema>;

export const FORGE_LIBRARY_STATE_ROUTE = '/api/ai-studio/renders/library-state';
export const FORGE_PROVENANCE_ROUTE = '/api/ai-studio/renders/provenance';
export const forgeRenderSetShareRoute = (renderSetId: string) =>
  `/api/ai-studio/renders/sets/${encodeURIComponent(renderSetId)}/share`;

export const forgeLibraryStateResponseSchema = z.object({
  items: z.array(forgeOutputLibraryStateSchema),
});
export type ForgeLibraryStateResponse = z.infer<typeof forgeLibraryStateResponseSchema>;

export const forgeProvenanceResponseSchema = z.object({
  provenance: forgeProvenanceSchema.nullable(),
});
export type ForgeProvenanceResponse = z.infer<typeof forgeProvenanceResponseSchema>;

/** A render set shared as its Library collection: a revocable media.share_links row. */
export const forgeRenderSetShareResponseSchema = z.object({
  shareLinkId: uuid(),
  path: z.string().startsWith('/share/'),
  assetCount: z.number().int().nonnegative(),
});
export type ForgeRenderSetShareResponse = z.infer<typeof forgeRenderSetShareResponseSchema>;
