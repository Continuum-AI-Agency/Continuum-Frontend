'use client';

import type { ScenePreview, ScenePreviewRequest } from '@continuum/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { useDebounce } from '@/hooks/useDebounce';
import { requestScenePreview, sceneProblem } from '@/lib/library/sceneTemplates';
import type { SceneChanges } from './sceneEditorReducer';

// A draft still of the scene as edited. Each settled edit (600 ms quiet) is one Blender render on
// the server, so keystrokes never each cost one. The query's AbortSignal cancels a draft that a
// newer edit made stale, and the previous picture stays on screen until the next one lands.

export const PREVIEW_DEBOUNCE_MS = 600;
/** The renderer answers 429 when every slot is drawing; a short wait usually finds one. */
const BUSY_RETRIES = 3;
/** Re-read a cached draft a minute before its signed URL stops working. */
const URL_MARGIN_MS = 60_000;

type Draft = Pick<ScenePreviewRequest, 'versionId' | 'outputId' | 'values'>;

export function useScenePreview({
  brandId,
  assetId,
  versionId,
  outputId,
  values,
}: {
  brandId: string;
  assetId: string;
  /** Null while the template is still being read: nothing is drawn. */
  versionId: string | null;
  outputId: string | null;
  values: SceneChanges;
}) {
  const live =
    versionId && outputId ? JSON.stringify({ versionId, outputId, values } satisfies Draft) : null;
  const debounced = useDebounce(live, PREVIEW_DEBOUNCE_MS);
  // The first draw has nothing to wait for: only an EDIT settles before it is drawn.
  const settled = debounced ?? live;
  const query = useQuery({
    queryKey: forgeQueryKeys.scenePreview(brandId, assetId, settled),
    queryFn: ({ signal }): Promise<ScenePreview> =>
      requestScenePreview(
        assetId,
        { brandId, scope: 'all', ...(JSON.parse(settled as string) as Draft) },
        signal,
      ),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    staleTime: (q) =>
      q.state.data
        ? Math.max(0, Date.parse(q.state.data.expiresAt) - Date.now() - URL_MARGIN_MS)
        : 0,
    retry: (failures, error) =>
      failures < BUSY_RETRIES && sceneProblem(error).code === 'scene_preview_busy',
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 2_000),
  });
  return {
    ...query,
    /** An edit not yet drawn: still settling, or drawing. */
    updating: live !== settled || query.isFetching,
  };
}
