import type { ActionId, CanvasOutputFiling } from '@continuum/contracts';
import { canvasOutputFiling } from '@continuum/contracts';

import { signLibraryAsset } from '@/lib/ai-studio/elements';
import { registerCanvasOutput } from '@/lib/creative-assets/registerCanvasAsset';
import {
  persistGeneratedMedia,
  storeGeneratedMediaBytes,
} from '@/lib/library/persistGeneratedMedia';
import type { NodeOutput } from '../../types/execution';
import { buildDataUrl } from '../dataUrl';

type MediaOutput = Extract<NodeOutput, { type: 'image' | 'video' }>;

type PersistActionOutputDeps = {
  fetchImpl?: typeof fetch;
  persist?: typeof persistGeneratedMedia;
  store?: typeof storeGeneratedMediaBytes;
  register?: typeof registerCanvasOutput;
  sign?: typeof signLibraryAsset;
};

export async function persistActionOutput(
  params: {
    output: NodeOutput;
    actionId: ActionId;
    brandId: string;
    nodeId: string;
    roomId?: string;
    sourceAssetIds: string[];
    keep?: boolean;
    wiredToLibrarySink?: boolean;
  },
  deps: PersistActionOutputDeps = {},
): Promise<NodeOutput> {
  if (params.output.type === 'text') return params.output;
  if (params.output.type === 'images') {
    return {
      type: 'images',
      items: await Promise.all(
        params.output.items.map(async (item) => {
          const persisted = await persistMedia(
            { ...params, output: { type: 'image', ...item } },
            deps,
          );
          if (persisted.type !== 'image') {
            throw new Error('Image action returned the wrong media type');
          }
          const { type: _type, ...image } = persisted;
          return image;
        }),
      ),
    };
  }
  if (params.output.type === 'collection') {
    return {
      ...params.output,
      items: await Promise.all(
        params.output.items.map((output) => persistActionOutput({ ...params, output }, deps)),
      ),
    };
  }
  return persistMedia({ ...params, output: params.output }, deps);
}

async function persistMedia(
  params: {
    output: MediaOutput;
    actionId: ActionId;
    brandId: string;
    nodeId: string;
    roomId?: string;
    sourceAssetIds: string[];
    keep?: boolean;
    wiredToLibrarySink?: boolean;
  },
  deps: PersistActionOutputDeps,
): Promise<MediaOutput> {
  const filing: CanvasOutputFiling = canvasOutputFiling({
    keep: params.keep === true,
    wiredToLibrarySink: params.wiredToLibrarySink === true,
  });
  const { output } = params;

  if (output.assetId && output.assetVersionId && output.storagePath && output.storageBucket) {
    if (output.url && !output.url.startsWith('data:') && !output.url.startsWith('blob:')) {
      return output;
    }
    return {
      ...output,
      url: await (deps.sign ?? signLibraryAsset)(params.brandId, output.assetId),
    };
  }

  if (output.storagePath && output.storageBucket) {
    return finishStoredPointer(params, deps, filing, output);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const source =
    output.type === 'video'
      ? output.url
      : (output.url ?? (output.base64 ? buildDataUrl(output.mimeType, output.base64) : undefined));
  if (!source) throw new Error('The finished action has no readable media to save.');
  const response = await fetchImpl(source);
  if (!response.ok) throw new Error(`Could not read the finished action (${response.status}).`);
  const blob = await response.blob();
  const kind = output.type;
  const extension = kind === 'video' ? 'mp4' : output.mimeType.includes('jpeg') ? 'jpg' : 'png';
  const operation = params.actionId.replace(/[^a-z0-9]+/g, '_');
  const fileName = `${operation}-${params.nodeId}.${extension}`;

  if (filing === 'graph_durable') {
    const stored = await (deps.store ?? storeGeneratedMediaBytes)({
      blob,
      brandId: params.brandId,
      kind,
      fileName,
    });
    return mediaFromStore(kind, blob, stored, output);
  }

  const saved = await (deps.persist ?? persistGeneratedMedia)({
    blob,
    brandId: params.brandId,
    kind,
    fileName,
    operation,
    originRef: {
      kind: 'canvas_action',
      roomId: params.roomId ?? null,
      nodeId: params.nodeId,
      actionId: params.actionId,
      keep: params.keep === true,
    },
    sourceAssetIds: [...new Set(params.sourceAssetIds)],
  });
  const url = await (deps.sign ?? signLibraryAsset)(params.brandId, saved.assetId);
  return mediaFromLibrary(kind, blob, saved, output, url);
}

async function finishStoredPointer(
  params: {
    output: MediaOutput;
    brandId: string;
    nodeId: string;
    roomId?: string;
    actionId: ActionId;
  },
  deps: PersistActionOutputDeps,
  filing: CanvasOutputFiling,
  output: MediaOutput,
): Promise<MediaOutput> {
  const mimeType = output.type === 'image' ? output.mimeType : (output.mimeType ?? 'video/mp4');
  const hostedUrl =
    output.url && !output.url.startsWith('data:') && !output.url.startsWith('blob:')
      ? output.url
      : null;

  if (filing === 'graph_durable') {
    if (hostedUrl) return output;
    throw new Error('The finished action has stored bytes but no playable URL to wire.');
  }

  const registered = await (deps.register ?? registerCanvasOutput)({
    brandProfileId: params.brandId,
    kind: output.type,
    bucket: output.storageBucket ?? '',
    storagePath: output.storagePath ?? '',
    fileName: output.storagePath?.split('/').pop() || `canvas-${output.type}`,
    mimeType,
    sizeBytes: output.sizeBytes,
    originRef: {
      kind: 'canvas',
      roomId: params.roomId ?? null,
      nodeId: params.nodeId,
      generator: 'action',
      actionId: params.actionId,
    },
  });
  if (!registered?.assetId || !registered.assetVersionId) {
    throw new Error('The result was rendered but could not be saved to Library. Retry the action.');
  }
  return {
    ...output,
    url: hostedUrl ?? (await (deps.sign ?? signLibraryAsset)(params.brandId, registered.assetId)),
    assetId: registered.assetId,
    assetVersionId: registered.assetVersionId,
  };
}

function mediaFromStore(
  kind: 'image' | 'video',
  blob: Blob,
  stored: {
    bucket: string;
    storagePath: string;
    signedUrl: string;
    sizeBytes: number;
    mimeType: string;
  },
  output: MediaOutput,
): MediaOutput {
  const common = {
    url: stored.signedUrl,
    storagePath: stored.storagePath,
    storageBucket: stored.bucket,
    sizeBytes: stored.sizeBytes,
  };
  return kind === 'image'
    ? { type: 'image', mimeType: blob.type || output.mimeType || 'image/png', ...common }
    : { type: 'video', mimeType: blob.type || output.mimeType || 'video/mp4', ...common };
}

function mediaFromLibrary(
  kind: 'image' | 'video',
  blob: Blob,
  saved: { assetId: string; versionId: string; bucket: string; storagePath: string },
  output: MediaOutput,
  url: string,
): MediaOutput {
  const common = {
    url,
    storagePath: saved.storagePath,
    storageBucket: saved.bucket,
    sizeBytes: blob.size,
    assetId: saved.assetId,
    assetVersionId: saved.versionId,
  };
  return kind === 'image'
    ? { type: 'image', mimeType: blob.type || output.mimeType || 'image/png', ...common }
    : { type: 'video', mimeType: blob.type || output.mimeType || 'video/mp4', ...common };
}
