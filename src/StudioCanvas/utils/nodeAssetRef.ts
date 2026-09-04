// Which Library asset a canvas node actually holds.
//
// The pointer is written under three different keys depending on how the media
// reached the canvas — `assetId` (dragged from the Library panel, uploaded),
// `libraryAssetId` (seeded by `buildLibraryCanvasTemplate` / "Open in Canvas"),
// `renderOutputAssetId` (a generation registered by `registerCanvasIfDurable`).
// Every reader that only knew one of them reported "not saved to the Library"
// about an asset that was already there. This is the one read.
//
// `sourceAssetId` is deliberately NOT in the list: on a generation node that is
// the asset the output DERIVES from, not the bytes the node holds. Reading it
// here would matte the reference instead of the render.

import { registerCanvasOutput } from '@/lib/creative-assets/registerCanvasAsset';
import { useStudioStore } from '../stores/useStudioStore';
import type { AudioNodeData, ImageNodeData, StudioNode, VideoNodeData } from '../types';
import { uploadReferenceFile } from './uploadReferenceFile';

export interface NodeAssetRef {
  assetId: string;
  versionId?: string;
}

// Id key -> the version key written beside it, most specific first. A node's own
// render output outranks a reference it also holds (the order `layerSources` and
// `resolvePublishingAssets` already used). A legacy `libraryAssetId`-only seed
// carries no version, so it pins nothing and callers fall back to the asset head.
const KEY_PAIRS = [
  ['renderOutputAssetId', 'renderOutputAssetVersionId'],
  ['assetId', 'assetVersionId'],
  ['libraryAssetId', null],
] as const;

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

/** The node's own Library pointer, whichever key it was written under. */
export function readNodeAssetRef(data: unknown): NodeAssetRef | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  for (const [idKey, versionKey] of KEY_PAIRS) {
    const assetId = nonEmpty(record[idKey]);
    if (!assetId) continue;
    const versionId = versionKey ? nonEmpty(record[versionKey]) : undefined;
    return versionId ? { assetId, versionId } : { assetId };
  }
  return null;
}

type NodeUpdate = Partial<ImageNodeData & VideoNodeData & AudioNodeData>;

export interface EnsureNodeAssetRefDeps {
  getNodeById?: (id: string) => StudioNode | undefined;
  updateNodeData?: (id: string, data: NodeUpdate) => void;
  triggerSave?: () => void;
  register?: typeof registerCanvasOutput;
  upload?: typeof uploadReferenceFile;
  fetchImpl?: typeof fetch;
}

// Batch fan-out runs one node's action N times at once. Without this, N concurrent
// runs would each upload the same bytes and mint N Library assets for one node.
const inFlight = new Map<string, Promise<NodeAssetRef | null>>();

/**
 * The node's Library pointer, minting one if the node can be resolved to durable
 * media without it. Three rungs, cheapest first:
 *
 * 1. the pointer is already on the node under one of its three names;
 * 2. the bytes are already in a brand bucket (`bucket` + `sourcePath`) — register
 *    in place, which is idempotent on those two and returns the existing asset;
 * 3. only a URL or a data URL — fetch the bytes and upload them.
 *
 * Rungs 2 and 3 write the resolved pointer back onto the node, so the next run,
 * the Reformat button and publish all see it without repeating this work.
 * `null` means the node holds nothing a Library asset could be made from.
 */
export async function ensureNodeAssetRef(
  params: { nodeId: string; brandId: string; kind: 'image' | 'video' },
  deps: EnsureNodeAssetRefDeps = {},
): Promise<NodeAssetRef | null> {
  const store = useStudioStore.getState;
  const getNodeById = deps.getNodeById ?? ((id: string) => store().getNodeById(id));
  const node = getNodeById(params.nodeId);
  if (!node) return null;

  const existing = readNodeAssetRef(node.data);
  if (existing) return existing;

  const pending = inFlight.get(params.nodeId);
  if (pending) return pending;

  const run = resolveMissingRef(params, deps, node).finally(() => {
    inFlight.delete(params.nodeId);
  });
  inFlight.set(params.nodeId, run);
  return run;
}

async function resolveMissingRef(
  params: { nodeId: string; brandId: string; kind: 'image' | 'video' },
  deps: EnsureNodeAssetRefDeps,
  node: StudioNode,
): Promise<NodeAssetRef | null> {
  const store = useStudioStore.getState;
  const updateNodeData =
    deps.updateNodeData ?? ((id: string, data: NodeUpdate) => store().updateNodeData(id, data));
  const triggerSave = deps.triggerSave ?? (() => store().triggerSave());
  const data = (node.data ?? {}) as Record<string, unknown>;

  const bucket = nonEmpty(data.bucket);
  const storagePath = nonEmpty(data.sourcePath);
  const url = nonEmpty(data.image) ?? nonEmpty(data.video) ?? nonEmpty(data.sourceUrl);
  const mimeType = nonEmpty(data.mimeType) ?? (params.kind === 'image' ? 'image/png' : 'video/mp4');
  const fileName = nonEmpty(data.fileName) ?? fileNameFor(url, params.kind, mimeType);

  if (bucket && storagePath) {
    const registered = await (deps.register ?? registerCanvasOutput)({
      brandProfileId: params.brandId,
      kind: params.kind,
      bucket,
      storagePath,
      fileName,
      mimeType,
      originRef: { kind: 'canvas', nodeId: params.nodeId },
    });
    if (registered?.assetId) {
      const ref: NodeAssetRef = {
        assetId: registered.assetId,
        ...(registered.assetVersionId ? { versionId: registered.assetVersionId } : {}),
      };
      updateNodeData(params.nodeId, {
        assetId: ref.assetId,
        assetVersionId: ref.versionId,
      } as NodeUpdate);
      triggerSave();
      return ref;
    }
  }

  if (!url) return null;

  // Only bytes: a stock/unfurled reference or a pasted data URL. Uploading is the
  // only way it can become the source a derivative is recorded against.
  const file = await fileFromUrl(url, fileName, mimeType, deps.fetchImpl ?? fetch);
  if (!file) return null;
  const uploaded = await (deps.upload ?? uploadReferenceFile)(
    {
      nodeId: params.nodeId,
      file,
      brandId: params.brandId,
      field: params.kind === 'video' ? 'video' : 'image',
    },
    { updateNodeData, triggerSave },
  );
  if (!uploaded) return null;
  return { assetId: uploaded.assetId, versionId: uploaded.assetVersionId };
}

async function fileFromUrl(
  url: string,
  fileName: string,
  fallbackMime: string,
  fetchImpl: typeof fetch,
): Promise<File | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || fallbackMime });
  } catch (err) {
    console.warn('[studio] ensureNodeAssetRef: could not read the node media', err);
    return null;
  }
}

function fileNameFor(url: string | undefined, kind: 'image' | 'video', mimeType: string): string {
  const fromUrl = url && !url.startsWith('data:') ? lastPathSegment(url) : undefined;
  if (fromUrl) return fromUrl;
  const extension = mimeType.split('/')[1]?.split(';')[0] || (kind === 'image' ? 'png' : 'mp4');
  return `canvas-${kind}.${extension}`;
}

function lastPathSegment(rawUrl: string): string | undefined {
  try {
    const segment = new URL(rawUrl).pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : undefined;
  } catch {
    return undefined;
  }
}
