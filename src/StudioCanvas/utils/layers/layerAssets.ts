'use client';

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { MediaAsset } from '@continuum/contracts';
import type { LayerEditorLayer } from '../../types';

/**
 * Layers that came from a FILE rather than from a wired canvas node.
 *
 * Until this existed, `sourceNodeId` was the only route to pixels, so a six-element ad
 * meant six generator nodes and six edges of plumbing before anything could be moved.
 * Dropping, pasting or picking a file now makes a layer directly.
 *
 * The file goes to the Library first, through the same `uploadMediaAsset` path
 * `persistLayerComposite` uses. That is not ceremony: the layer document lives inside the
 * canvas JSON blob, so a `data:` URL on a layer would bloat every save of the whole room,
 * and `workflowSerialization` strips base64 out of that blob anyway — the layer would come
 * back from a reload pointing at nothing. What IS stored is the durable pair (bucket +
 * storage path), which is re-signable forever; the signed URL itself is session-scoped.
 */

export interface LayerAssetCoordinates {
  bucket: string;
  storagePath: string;
}

export interface UploadedLayerAsset extends LayerAssetCoordinates {
  assetId: string;
  versionId: string;
  signedUrl: string;
  /** The file's own name, which becomes the layer's name. */
  name: string;
}

/** Images only — this is a stills compositor, and `drawImage` cannot take a video. */
export const isPlaceableImage = (file: File): boolean => file.type.startsWith('image/');

export async function uploadLayerAsset(params: {
  file: File;
  brandId: string;
}): Promise<UploadedLayerAsset> {
  const result = await uploadMediaAsset({ file: params.file, brandId: params.brandId });
  return {
    assetId: result.assetId,
    versionId: result.versionId,
    bucket: MEDIA_LIBRARY_BUCKET,
    storagePath: result.storagePath,
    signedUrl: result.signedUrl,
    // The extension is noise in a layers panel; "hero-shot" reads better than
    // "hero-shot.png", and the name is the AE join key, not a filename.
    name: params.file.name.replace(/\.[^.]+$/, '') || params.file.name,
  };
}

/** Sign one stored asset for display. Browser-side, exactly as `storageClient` does. */
export async function signLayerAsset(
  coordinates: LayerAssetCoordinates,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(coordinates.bucket)
    .createSignedUrl(coordinates.storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** The durable coordinates a layer carries, or null when it is wired to a node instead. */
export function layerAssetCoordinates(layer: LayerEditorLayer): LayerAssetCoordinates | null {
  if (!layer.sourceBucket || !layer.sourceStoragePath) return null;
  return { bucket: layer.sourceBucket, storagePath: layer.sourceStoragePath };
}

/**
 * Every layer's displayable URL, from either route.
 *
 * A wired node WINS when a layer has both. That ordering matters: a node's ref is the
 * live output of an upstream generator, so a layer wired to it must follow a regenerate,
 * while the stored asset is a fixed snapshot and would quietly pin the layer to the old
 * pixels.
 *
 * `sign` is injected rather than imported so this stays testable without a Supabase
 * client, and so a caller can hand it a cache — signing is a network round trip per
 * asset, and the editor re-resolves whenever the document changes.
 */
export async function resolveLayerSources(input: {
  layers: readonly LayerEditorLayer[];
  /** Upstream node id -> ref, from `layerSourcesFromGraph`. */
  refByNodeId: ReadonlyMap<string, string>;
  sign: (coordinates: LayerAssetCoordinates) => Promise<string | null>;
}): Promise<Map<string, string>> {
  const { layers, refByNodeId, sign } = input;
  const resolved = new Map<string, string>();
  const pending: Promise<void>[] = [];

  for (const layer of layers) {
    const wired = layer.sourceNodeId ? refByNodeId.get(layer.sourceNodeId) : undefined;
    if (wired) {
      resolved.set(layer.id, wired);
      continue;
    }
    const coordinates = layerAssetCoordinates(layer);
    if (!coordinates) continue;
    pending.push(
      sign(coordinates).then((url) => {
        // A layer that will not sign is simply absent, exactly as an unresolvable wired
        // layer is: the stage skips it and Compose refuses rather than exporting a hole.
        if (url) resolved.set(layer.id, url);
      }),
    );
  }

  await Promise.all(pending);
  return resolved;
}

/**
 * A Library asset, as the fields a layer needs.
 *
 * `MediaAsset` already carries the durable pair AND the intrinsic size, so placing from
 * the Library costs no decode round trip — unlike an uploaded file, whose dimensions are
 * only known once the browser has read it. `width`/`height` are nullable on the contract
 * though (an asset analysed before those columns existed), so the caller still needs a
 * measure fallback and is told so by the null.
 */
export function layerSourceFromAsset(asset: MediaAsset): {
  assetId: string;
  bucket: string;
  storagePath: string;
  signedUrl: string | null;
  name: string;
  width: number | null;
  height: number | null;
} {
  return {
    assetId: asset.id,
    bucket: asset.bucket,
    storagePath: asset.storagePath,
    signedUrl: asset.signedUrl ?? null,
    // The title if a person gave it one, else the file name minus its extension — the
    // same shape `uploadLayerAsset` produces, so the two routes name layers alike.
    name: asset.title?.trim() || asset.fileName.replace(/\.[^.]+$/, '') || asset.fileName,
    width: asset.width ?? null,
    height: asset.height ?? null,
  };
}
