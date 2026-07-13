// Render-time byte resolution for a Library timeline.
//
// The canvas resolver (StudioCanvas/utils/splice/resolveClipSources) turns a
// source NODE id into bytes by reading the upstream node's output. The Library
// has no graph: a source id is a media.assets uuid, so it is re-signed through
// /api/library/sign and fetched. Everything after that — the field mapping onto
// TimelineRenderItem / TimelineOverlayRenderItem — is deliberately identical, so
// both hosts feed the same mediabunny compositor.
//
// The signed URL is minted here rather than reused from the media bin's preview:
// a bin URL is signed when the editor loads and expires after an hour, which is
// well inside a long editing session.

import type { TimelineItem, TimelineTrack } from '@/StudioCanvas/types';
import type {
  TimelineOverlayRenderItem,
  TimelineRenderItem,
} from '@/StudioCanvas/utils/splice/composeTimeline';
import type { LibraryPoolSource } from './timelineDraftMapping';

type ResolvedSource = { kind: 'video' | 'image'; blob: Blob };

export interface LibraryTimelineResolver {
  resolveSources(items: TimelineItem[]): Promise<TimelineRenderItem[]>;
  resolveOverlays(tracks: TimelineTrack[]): Promise<TimelineOverlayRenderItem[]>;
}

export interface LibraryTimelineResolverOptions {
  brandId: string;
  pool: readonly LibraryPoolSource[];
  fetchImpl?: typeof fetch;
}

async function signAsset(
  fetchImpl: typeof fetch,
  brandId: string,
  assetId: string,
): Promise<string> {
  const response = await fetchImpl('/api/library/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, assetId }),
  });
  if (!response.ok) {
    throw new Error(`Could not sign library asset ${assetId} (${response.status})`);
  }
  const body = (await response.json()) as { signedUrl?: unknown };
  if (typeof body.signedUrl !== 'string' || !body.signedUrl) {
    throw new Error(`Library asset ${assetId} returned no signed URL`);
  }
  return body.signedUrl;
}

export function createLibraryTimelineResolver(
  options: LibraryTimelineResolverOptions,
): LibraryTimelineResolver {
  const { brandId, pool } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const poolById = new Map(pool.map((source) => [source.nodeId, source]));

  // A source placed more than once (split, or reused across base + overlay
  // tracks) is signed and downloaded once, then shared.
  const cache = new Map<string, Promise<ResolvedSource>>();

  function resolveSource(assetId: string): Promise<ResolvedSource> {
    const cached = cache.get(assetId);
    if (cached) return cached;
    const source = poolById.get(assetId);
    if (!source) {
      throw new Error(`Timeline source ${assetId} is not in the media bin`);
    }
    const promise = (async () => {
      const signedUrl = await signAsset(fetchImpl, brandId, assetId);
      const response = await fetchImpl(signedUrl);
      if (!response.ok) {
        throw new Error(`Could not download library asset ${assetId} (${response.status})`);
      }
      return { kind: source.kind, blob: await response.blob() } satisfies ResolvedSource;
    })();
    cache.set(assetId, promise);
    return promise;
  }

  // A placement whose source left the bin is a hard, named failure. Dropping it
  // would silently ship a shorter video than the one the user cut.
  function requireSource(item: TimelineItem, label: string): Promise<ResolvedSource> {
    if (!item.sourceNodeId || !poolById.has(item.sourceNodeId)) {
      throw new Error(
        `${label}: its source (${item.sourceNodeId || 'none'}) is missing from the media bin. ` +
          'Re-add it from the Library or remove the clip.',
      );
    }
    return resolveSource(item.sourceNodeId);
  }

  return {
    async resolveSources(items) {
      const ordered = [...items].sort((a, b) => a.order - b.order);
      return Promise.all(
        ordered.map(async (item) => {
          const { kind, blob } = await requireSource(item, `Clip ${item.order + 1}`);
          return {
            itemId: item.id,
            kind,
            blob,
            trimStartSec: item.trimStartSec,
            trimEndSec: item.trimEndSec,
            durationSec: item.durationSec,
            muteAudio: item.muteAudio,
            volume: item.volume,
            audioFadeInSec: item.audioFadeInSec,
            audioFadeOutSec: item.audioFadeOutSec,
            effects: item.effects,
            transition: item.transition,
          } satisfies TimelineRenderItem;
        }),
      );
    },

    async resolveOverlays(tracks) {
      const overlayItems = tracks.flatMap((track) => track.items);
      if (overlayItems.length === 0) return [];
      return Promise.all(
        overlayItems.map(async (item) => {
          const { kind, blob } = await requireSource(item, `Overlay clip ${item.id}`);
          return {
            itemId: item.id,
            kind,
            blob,
            startSec: Math.max(0, item.startSec ?? 0),
            trimStartSec: item.trimStartSec,
            trimEndSec: item.trimEndSec,
            durationSec: item.durationSec,
            muteAudio: item.muteAudio,
            volume: item.volume,
            audioFadeInSec: item.audioFadeInSec,
            audioFadeOutSec: item.audioFadeOutSec,
            effects: item.effects,
          } satisfies TimelineOverlayRenderItem;
        }),
      );
    },
  };
}
