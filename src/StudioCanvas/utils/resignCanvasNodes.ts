import {
  CANVAS_MEDIA_BUCKETS,
  CANVAS_MEDIA_SIGN_MAX_ITEMS,
  CANVAS_MEDIA_SIGN_ROUTE,
  type CanvasMediaCoordinate,
  type CanvasMediaSignResponse,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';
import type { CanvasDocument, StudioNode } from '../types';

// Same-origin Next route (NOT the Backend `request` helper): it is what mints from an
// exact `media.asset_versions` row.
const LIBRARY_SIGN_ROUTE = '/api/library/sign';

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

interface VersionRef {
  assetId: string;
  versionId: string;
}

function versionRefKey(assetId: string, versionId: string): string {
  return `${assetId}\n${versionId}`;
}

/**
 * References that identify their bytes by Library asset + EXACT version instead of by
 * storage coordinates — an api-render output dropped onto the canvas is the case that
 * needs this. Storage coordinates win when a node has both: they are one hop cheaper and
 * already covered above.
 */
function collectVersionRefs(nodes: StudioNode[]): VersionRef[] {
  const refs = new Map<string, VersionRef>();
  for (const node of nodes) {
    if (node.type !== 'image' && node.type !== 'video') continue;
    const data = node.data as Record<string, unknown>;
    const assetId = data.assetId;
    const versionId = data.assetVersionId;
    if (typeof assetId !== 'string' || typeof versionId !== 'string') continue;
    if (typeof data.bucket === 'string' && typeof data.sourcePath === 'string') continue;
    refs.set(versionRefKey(assetId, versionId), { assetId, versionId });
  }
  return [...refs.values()];
}

/**
 * One same-origin sign per unique asset/version pair, each on its OWN failure boundary:
 * a render whose asset refuses to sign leaves THAT node stale and nothing else. A single
 * shared try would throw away every URL already minted for its siblings — which on a
 * canvas holding five outputs of one batch is four working previews lost to one bad row.
 */
async function signVersionRefs(
  refs: VersionRef[],
  brandProfileId: string,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    refs.map(async (ref): Promise<[string, string] | null> => {
      try {
        const response = await fetch(LIBRARY_SIGN_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: brandProfileId,
            assetId: ref.assetId,
            versionId: ref.versionId,
          }),
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as { signedUrl?: string };
        return payload.signedUrl
          ? [versionRefKey(ref.assetId, ref.versionId), payload.signedUrl]
          : null;
      } catch (err) {
        console.warn('[studio] resignCanvasNodes: version re-sign failed', ref.versionId, err);
        return null;
      }
    }),
  );
  return new Map(entries.filter((entry): entry is [string, string] => entry !== null));
}

/** Re-signing the storage-coordinate references, batched the way the backend route caps them. */
async function signCoordinates(
  items: CanvasMediaCoordinate[],
  brandProfileId: string,
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map();
  try {
    const results: CanvasMediaSignResponse['items'] = [];
    for (let index = 0; index < items.length; index += CANVAS_MEDIA_SIGN_MAX_ITEMS) {
      const response = await request<CanvasMediaSignResponse>({
        path: CANVAS_MEDIA_SIGN_ROUTE,
        method: 'POST',
        body: {
          brandProfileId,
          items: items.slice(index, index + CANVAS_MEDIA_SIGN_MAX_ITEMS),
        },
      });
      results.push(...response.items);
    }
    return new Map(results.map((result) => [signKey(result.bucket, result.path), result.signedUrl]));
  } catch (err) {
    console.warn('[studio] resignCanvasNodes: failed to re-sign, using stale URLs', err);
    return new Map();
  }
}

function applySignedUrls(
  nodes: StudioNode[],
  urlMap: Map<string, string>,
  versionUrlMap: Map<string, string>,
): StudioNode[] {
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
    // Asset/version references carry no coordinates, so they resolve out of the Library
    // map instead. Coordinates still win where a node has both. Only image/video nodes
    // hold a reference field to paint, so nothing else is looked up.
    const versionUrl =
      (node.type === 'image' || node.type === 'video') &&
      typeof data.assetId === 'string' &&
      typeof data.assetVersionId === 'string'
        ? versionUrlMap.get(versionRefKey(data.assetId, data.assetVersionId))
        : undefined;
    const mediaUrl = refUrl ?? versionUrl;

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
      if (!hasChanges && !imgUrl && !vidUrl && !mediaUrl) return node;
      return {
        ...node,
        data: {
          ...data,
          documents: hasChanges ? resignedDocs : data.documents,
          ...(imgUrl ? { generatedImageUrl: imgUrl } : {}),
          ...(vidUrl ? { generatedVideoUrl: vidUrl } : {}),
          ...(imgUrl || vidUrl ? { isComplete: true } : {}),
          ...(mediaUrl ? { image: mediaUrl, sourceUrl: mediaUrl } : {}),
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

    if (!imgUrl && !vidUrl && !mediaUrl) return node;

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
        // The fresh URL lands on the media field and on sourceUrl only. `originalImage`
        // is the markup baseline; writing an expiring URL there would freeze a link the
        // next load has no way to refresh.
        ...(mediaUrl ? { [refField]: mediaUrl, sourceUrl: mediaUrl } : {}),
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
  const versionRefs = collectVersionRefs(nodes);
  if (uniqueItems.length === 0 && versionRefs.length === 0) return nodes;

  // Two independent passes: the coordinate route going down takes no version reference
  // with it, and vice versa. Each returns an empty map rather than throwing, so a node
  // whose URL could not be minted keeps its stale one and every other node still updates.
  const [urlMap, versionUrlMap] = await Promise.all([
    signCoordinates(uniqueItems, brandProfileId),
    signVersionRefs(versionRefs, brandProfileId),
  ]);
  return applySignedUrls(nodes, urlMap, versionUrlMap);
}
