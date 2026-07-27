import {
  CANVAS_MEDIA_BUCKETS,
  CANVAS_MEDIA_SIGN_MAX_ITEMS,
  CANVAS_MEDIA_SIGN_ROUTE,
  type CanvasMediaCoordinate,
  type CanvasMediaSignResponse,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';
import type { CanvasDocument, StudioNode } from '../types';

function signKey(bucket: string, path: string): string {
  return `${bucket}\n${path}`;
}

function addSignItem(items: CanvasMediaCoordinate[], bucket: unknown, path: unknown): void {
  if (
    typeof bucket === 'string' &&
    typeof path === 'string' &&
    (CANVAS_MEDIA_BUCKETS as readonly string[]).includes(bucket)
  ) {
    items.push({ bucket: bucket as CanvasMediaCoordinate['bucket'], path });
  }
}

function collectSignItems(nodes: StudioNode[]): CanvasMediaCoordinate[] {
  const items: CanvasMediaCoordinate[] = [];
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;

    // Generated outputs (nanoGen / video generators).
    const imgPath = data.generatedImageStoragePath;
    const imgBucket = data.generatedImageBucket;
    addSignItem(items, imgBucket, imgPath);
    const vidPath = data.generatedVideoStoragePath;
    const vidBucket = data.generatedVideoBucket;
    addSignItem(items, vidBucket, vidPath);

    // Uploaded reference nodes (image/video). sourcePath + bucket re-sign into the
    // node's media value so a saved/broadcast reference renders after its signed
    // URL has expired.
    const refPath = data.sourcePath;
    const refBucket = data.bucket;
    addSignItem(items, refBucket, refPath);

    // Document nodes: each CanvasDocument with a storagePath + bucket needs re-signing.
    if (node.type === 'document') {
      const docs = (data.documents ?? []) as CanvasDocument[];
      for (const doc of docs) {
        if (typeof doc.storagePath === 'string' && typeof doc.bucket === 'string') {
          addSignItem(items, doc.bucket, doc.storagePath);
        }
      }
    }

    // Omni nodes: every variation in the micro-library carries durable coords that
    // must re-sign (not just the active clip covered by generatedVideo* above).
    if (node.type === 'omniGen') {
      const variations = (data.variations ?? []) as Array<{
        storagePath?: string;
        bucket?: string;
      }>;
      for (const variation of variations) {
        if (typeof variation.storagePath === 'string' && typeof variation.bucket === 'string') {
          addSignItem(items, variation.bucket, variation.storagePath);
        }
      }
    }
  }
  return items;
}

function applySignedUrls(nodes: StudioNode[], urlMap: Map<string, string>): StudioNode[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    const imgPath = data.generatedImageStoragePath;
    const vidPath = data.generatedVideoStoragePath;
    const refPath = data.sourcePath;
    const imgBucket = data.generatedImageBucket;
    const vidBucket = data.generatedVideoBucket;
    const refBucket = data.bucket;
    const imgUrl =
      typeof imgPath === 'string' && typeof imgBucket === 'string'
        ? urlMap.get(signKey(imgBucket, imgPath))
        : undefined;
    const vidUrl =
      typeof vidPath === 'string' && typeof vidBucket === 'string'
        ? urlMap.get(signKey(vidBucket, vidPath))
        : undefined;
    const refUrl =
      typeof refPath === 'string' && typeof refBucket === 'string'
        ? urlMap.get(signKey(refBucket, refPath))
        : undefined;

    // Re-sign document entries that have durable storage coordinates.
    if (node.type === 'document') {
      const docs = (data.documents ?? []) as CanvasDocument[];
      const resignedDocs = docs.map((doc) => {
        if (typeof doc.storagePath !== 'string' || typeof doc.bucket !== 'string') return doc;
        const freshUrl = urlMap.get(signKey(doc.bucket, doc.storagePath));
        if (!freshUrl) return doc;
        return { ...doc, sourceUrl: freshUrl };
      });
      const hasChanges = resignedDocs.some((doc, i) => doc !== docs[i]);
      if (!hasChanges && !imgUrl && !vidUrl && !refUrl) return node;
      return {
        ...node,
        data: {
          ...data,
          documents: hasChanges ? resignedDocs : data.documents,
          ...(imgUrl ? { generatedImageUrl: imgUrl } : {}),
          ...(vidUrl ? { generatedVideoUrl: vidUrl } : {}),
          ...(imgUrl || vidUrl ? { isComplete: true } : {}),
          ...(refUrl ? { image: refUrl, sourceUrl: refUrl } : {}),
        } as StudioNode['data'],
      };
    }

    // Omni nodes: re-sign every variation clip and mirror the active clip into the
    // durable generated* fields (which downstream consumers read).
    if (node.type === 'omniGen') {
      const variations = (data.variations ?? []) as Array<Record<string, unknown>>;
      const resignedVariations = variations.map((variation) => {
        if (typeof variation.storagePath !== 'string' || typeof variation.bucket !== 'string') {
          return variation;
        }
        const fresh = urlMap.get(signKey(variation.bucket, variation.storagePath));
        return fresh ? { ...variation, videoUrl: fresh } : variation;
      });
      const variationsChanged = resignedVariations.some((v, i) => v !== variations[i]);
      if (!variationsChanged && !vidUrl) return node;
      return {
        ...node,
        data: {
          ...data,
          ...(variationsChanged ? { variations: resignedVariations } : {}),
          ...(vidUrl
            ? { generatedVideo: vidUrl, generatedVideoUrl: vidUrl, isComplete: true }
            : {}),
        } as StudioNode['data'],
      };
    }

    if (!imgUrl && !vidUrl && !refUrl) return node;

    const refField = node.type === 'video' ? 'video' : 'image';
    return {
      ...node,
      data: {
        ...data,
        ...(imgUrl ? { generatedImageUrl: imgUrl } : {}),
        ...(vidUrl ? { generatedVideoUrl: vidUrl } : {}),
        // Restore the completed badge for a re-signed generated output; the flag
        // is stripped on save, so a reloaded finished node would otherwise look
        // unfinished. Reference (image/video) nodes carry no completed state.
        ...(imgUrl || vidUrl ? { isComplete: true } : {}),
        ...(refUrl ? { [refField]: refUrl, sourceUrl: refUrl } : {}),
      } as StudioNode['data'],
    };
  });
}

export async function resignCanvasNodes(
  nodes: StudioNode[],
  brandProfileId?: string,
): Promise<StudioNode[]> {
  if (!brandProfileId) return nodes;
  const uniqueItems = [
    ...new Map(
      collectSignItems(nodes).map((item) => [signKey(item.bucket, item.path), item]),
    ).values(),
  ];
  if (uniqueItems.length === 0) return nodes;

  try {
    const results: CanvasMediaSignResponse['items'] = [];
    for (let index = 0; index < uniqueItems.length; index += CANVAS_MEDIA_SIGN_MAX_ITEMS) {
      const response = await request<CanvasMediaSignResponse>({
        path: CANVAS_MEDIA_SIGN_ROUTE,
        method: 'POST',
        body: {
          brandProfileId,
          items: uniqueItems.slice(index, index + CANVAS_MEDIA_SIGN_MAX_ITEMS),
        },
      });
      results.push(...response.items);
    }

    const urlMap = new Map<string, string>(
      results.map((result) => [signKey(result.bucket, result.path), result.signedUrl]),
    );
    return applySignedUrls(nodes, urlMap);
  } catch (err) {
    console.warn('[studio] resignCanvasNodes: failed to re-sign, using stale URLs', err);
    return nodes;
  }
}
