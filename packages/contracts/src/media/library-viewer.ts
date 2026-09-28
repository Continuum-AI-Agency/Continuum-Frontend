// What the Library's specialty viewers (3D, HTML bundle, paged InDesign) are handed by the
// Backend. The credential is the original's signed storage URL: whoever holds it could
// download those bytes already, so the Backend may hand them what is derived from them (a
// converted GLB, page images, a sandboxed bundle session) without re-deciding access — the
// detail view and a share page each hold that URL through their own access rules.

import { z } from 'zod';
import { classifyLibraryFile } from './asset-formats';

export const LIBRARY_VIEWER_PATH = '/api/media/library/viewer';
export const LIBRARY_HTML_BUNDLE_PATH_PREFIX = '/api/media/html-bundle';

/** Formats the 3D viewer loads straight from the original. */
export const DIRECT_MODEL_FORMATS = [
  'glb',
  'gltf',
  'obj',
  'stl',
  'fbx',
  'ply',
  'dae',
  '3ds',
  'usdz',
] as const;
export type DirectModelFormat = (typeof DIRECT_MODEL_FORMATS)[number];

/** CAD formats the Backend converts (occt-import-js) into a stored `model_glb`. */
export const CONVERTED_MODEL_EXTENSIONS = ['step', 'stp', 'iges', 'igs'] as const;

/** A converted model larger than this is refused rather than tying up the Backend. */
export const MAX_MODEL_CONVERSION_BYTES = 64 * 1024 * 1024;

export type ViewerFamily = 'model_3d' | 'html_bundle' | 'paged';

/**
 * Which viewer draws this file, from its name and type alone. Every ZIP answers
 * `html_bundle` here — only its entries tell a bundle from an archive or an AE package, and
 * the Backend reads those.
 */
export function viewerFamily(file: {
  fileName: string;
  mimeType?: string | null;
}): ViewerFamily | null {
  const format = classifyLibraryFile(file);
  if (!format.accepted) return null;
  if (format.previewStrategy === 'model_viewer') return 'model_3d';
  if (format.previewStrategy === 'embedded_pages') return 'paged';
  if (format.extensions.includes('zip')) return 'html_bundle';
  return null;
}

export const libraryViewerRequestSchema = z
  .object({
    sourceUrl: z.string().url().max(4096),
  })
  .strict();
export type LibraryViewerRequest = z.infer<typeof libraryViewerRequestSchema>;

const ids = {
  assetId: z.string().uuid(),
  versionId: z.string().uuid(),
};

export const modelViewerSourceSchema = z
  .object({
    url: z.string().url(),
    format: z.enum(DIRECT_MODEL_FORMATS),
    /** True when this is the stored `model_glb` of a STEP/IGES original. */
    converted: z.boolean(),
  })
  .strict();
export type ModelViewerSource = z.infer<typeof modelViewerSourceSchema>;

export const viewerPageSchema = z
  .object({
    page: z.number().int().positive(),
    url: z.string().url(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
  })
  .strict();
export type ViewerPage = z.infer<typeof viewerPageSchema>;

export const libraryViewerManifestSchema = z.discriminatedUnion('family', [
  z
    .object({
      family: z.literal('model_3d'),
      ...ids,
      /** Null with `modelError` set when a conversion failed or was refused. */
      model: modelViewerSourceSchema.nullable(),
      modelError: z.string().nullable(),
      /** The stored card poster; null means the viewer should render and save one. */
      posterUrl: z.string().url().nullable(),
    })
    .strict(),
  z
    .object({
      family: z.literal('html_bundle'),
      ...ids,
      /** The bundle's entry page on the isolated origin, with its short-lived token. */
      entryUrl: z.string().url(),
      entry: z.string().min(1),
      expiresAt: z.string(),
    })
    .strict(),
  z
    .object({
      family: z.literal('paged'),
      ...ids,
      pageCount: z.number().int().nonnegative().nullable(),
      pages: z.array(viewerPageSchema),
    })
    .strict(),
  // A ZIP that is an archive or an AE package, or a file no viewer draws.
  z.object({ family: z.literal('none'), ...ids }).strict(),
]);
export type LibraryViewerManifest = z.infer<typeof libraryViewerManifestSchema>;
