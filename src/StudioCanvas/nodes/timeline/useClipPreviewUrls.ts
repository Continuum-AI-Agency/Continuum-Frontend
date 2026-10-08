import type {
  EditorAudioClip,
  EditorOverlayClip,
  EditorProjectV2,
  EditorVideoClip,
} from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { listAssetVersions } from '@/lib/library/versions';
import type { TimelineInputSource } from '../../types';
import { exactVersionPreviewUrl } from './editorProjectV2AssemblyModel';

// ponytail: signed URLs live ~1h in this cache; evict on expiry if sessions run longer.
const resolvedPreviewUrls = new Map<string, string>();

export const libraryVersionKey = (assetId: string, versionId: string) => `${assetId}:${versionId}`;

/** Seeds the exact-version cache so a just-uploaded clip previews without a round trip. */
export function rememberPreviewUrl(assetId: string, versionId: string, url: string): void {
  resolvedPreviewUrls.set(libraryVersionKey(assetId, versionId), url);
}

function sourceCoordinates(clip: EditorVideoClip | EditorAudioClip | EditorOverlayClip) {
  const source = clip.source;
  if (source.sourceType !== 'library_asset' || !source.renditionId) return null;
  return { assetId: source.assetId, versionId: source.renditionId };
}

/** Clips placed straight off the canvas preview through the media bin's own URL. */
function allProjectTracks(project: EditorProjectV2): EditorProjectV2['tracks'] {
  return [...project.tracks, ...project.nestedSequences.flatMap((sequence) => sequence.tracks)];
}

function canvasNodeClipIds(project: EditorProjectV2): Array<{ clipId: string; nodeId: string }> {
  return allProjectTracks(project).flatMap((track) =>
    track.clips.flatMap((clip) =>
      'source' in clip && clip.source.sourceType === 'canvas_node'
        ? [{ clipId: clip.id, nodeId: clip.source.nodeId }]
        : [],
    ),
  );
}

export function useExactPreviewUrls(
  project: EditorProjectV2,
  brandId: string,
  pool: TimelineInputSource[],
): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const coordinates = useMemo(() => {
    const values = allProjectTracks(project).flatMap((track) =>
      track.clips.flatMap((clip) => {
        if (clip.kind !== 'video' && clip.kind !== 'audio' && clip.kind !== 'overlay') return [];
        const source = sourceCoordinates(clip);
        return source ? [{ clipId: clip.id, ...source }] : [];
      }),
    );
    return values;
  }, [project]);
  const canvasClips = useMemo(() => canvasNodeClipIds(project), [project]);

  useEffect(() => {
    let cancelled = false;
    const poolUrls = new Map<string, string>();
    for (const canvasClip of canvasClips) {
      const url = pool.find((candidate) => candidate.nodeId === canvasClip.nodeId)?.previewUrl;
      if (url) poolUrls.set(canvasClip.clipId, url);
    }
    for (const coordinate of coordinates) {
      const source = pool.find(
        (candidate) =>
          candidate.sourceAssetId === coordinate.assetId &&
          candidate.sourceVersionId === coordinate.versionId &&
          candidate.previewUrl,
      );
      if (source?.previewUrl) poolUrls.set(coordinate.clipId, source.previewUrl);
      const cached = resolvedPreviewUrls.get(
        libraryVersionKey(coordinate.assetId, coordinate.versionId),
      );
      if (cached) poolUrls.set(coordinate.clipId, cached);
    }
    setUrls(poolUrls);

    const unresolved = coordinates.filter(
      (coordinate) =>
        !resolvedPreviewUrls.has(libraryVersionKey(coordinate.assetId, coordinate.versionId)),
    );
    const assets = [...new Set(unresolved.map((coordinate) => coordinate.assetId))];
    if (assets.length) {
      void Promise.all(
        assets.map(async (assetId) => ({
          assetId,
          versions: await listAssetVersions({ brandId, assetId }),
        })),
      )
        .then((results) => {
          const byAsset = new Map(
            results.map((result) => [result.assetId, result.versions] as const),
          );
          const resolved = new Map<string, string>();
          for (const coordinate of unresolved) {
            const url = exactVersionPreviewUrl(
              byAsset.get(coordinate.assetId) ?? [],
              coordinate.versionId,
            );
            if (!url) continue;
            rememberPreviewUrl(coordinate.assetId, coordinate.versionId, url);
            resolved.set(coordinate.clipId, url);
          }
          if (cancelled || !resolved.size) return;
          setUrls((current) => new Map([...current, ...resolved]));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [brandId, canvasClips, coordinates, pool]);

  return urls;
}
