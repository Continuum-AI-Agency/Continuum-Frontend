'use client';

import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { signMediaAsset, signOrganicMediaAsset } from '@/lib/organic/hyperframeSign';
import { useCalendarStore } from '@/lib/organic/store';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// A mediaSuggestion url is only re-signable when it is a storage path — never a
// transient data: payload nor a user-supplied absolute URL.
function isSignableStoragePath(value: string | null | undefined): value is string {
  if (!hasText(value)) return false;
  const trimmed = value.trim();
  return !trimmed.startsWith('data:') && !/^https?:\/\//i.test(trimmed);
}

/**
 * Re-signs the draft's durable publishing assets on read. Persisted drafts store
 * only bucket+storagePath (the upload-time signed URL expires in ~1h), so this
 * mints fresh storageUrls whenever a surface renders the draft.
 *
 * Shared by every surface that renders draft media — the calendar card, the list
 * row and the preview panel. It lives here rather than inside `resolveDraftMedia`
 * because that resolver is deliberately pure and synchronous; re-signing belongs
 * one layer up, in the rendering component. `signOrganicMediaAsset` caches and
 * de-duplicates by durable key, so N surfaces on one pair still cost one POST.
 *
 * `brandProfileId` is optional: surfaces deep in the calendar tree (a month chip,
 * a list row) do not receive it as a prop, so it falls back to the planner's own
 * account context.
 */
export function useDraftWithFreshMedia(
  draft: OrganicCalendarDraft,
  brandProfileId?: string,
): OrganicCalendarDraft {
  const contextBrandId = useCalendarStore((state) => state.accountContext?.brandId ?? null);
  const resolvedBrandId = brandProfileId ?? contextBrandId ?? null;
  const [freshByPath, setFreshByPath] = React.useState<Record<string, string>>({});

  const signables = React.useMemo(
    () =>
      (draft.publishingAssets ?? []).filter(
        (a) => hasText(a.storagePath) && (hasText(a.assetId) || hasText(a.bucket)),
      ),
    [draft.publishingAssets],
  );

  React.useEffect(() => {
    if (!resolvedBrandId || signables.length === 0) return;
    let cancelled = false;
    void Promise.all(
      signables.map(async (asset) => {
        const url = hasText(asset.assetId)
          ? await signMediaAsset({ brandId: resolvedBrandId, assetId: asset.assetId })
          : await signOrganicMediaAsset({
              brandId: resolvedBrandId,
              bucket: asset.bucket as string,
              path: asset.storagePath,
            });
        return url ? ([asset.storagePath, url] as const) : null;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      if (Object.keys(next).length > 0) setFreshByPath(next);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedBrandId, signables]);

  const reel = draft.mediaSuggestion?.reel;
  const reelBucket = reel?.generated === true && hasText(reel.url) ? (reel.bucket ?? null) : null;
  const reelPath = reel?.generated === true ? (reel.url ?? null) : null;
  const [freshReelUrl, setFreshReelUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!resolvedBrandId || !reelBucket || !reelPath) return;
    let cancelled = false;
    void signOrganicMediaAsset({
      brandId: resolvedBrandId,
      bucket: reelBucket,
      path: reelPath,
    }).then((url) => {
      if (!cancelled && url) setFreshReelUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedBrandId, reelBucket, reelPath]);

  // Hyperframe MP4 + cover are durable bucket+path references too; re-sign both so
  // the player/card render fresh URLs instead of an expired URL or a base64 cover.
  const hyperframe = draft.mediaSuggestion?.hyperframe;
  const hfMp4Bucket = hasText(hyperframe?.mp4Path) ? (hyperframe?.mp4Bucket ?? null) : null;
  const hfMp4Path = hasText(hyperframe?.mp4Path) ? (hyperframe?.mp4Path ?? null) : null;
  const hfCoverBucket = hasText(hyperframe?.coverPath) ? (hyperframe?.bucket ?? null) : null;
  const hfCoverPath = hasText(hyperframe?.coverPath) ? (hyperframe?.coverPath ?? null) : null;
  const [freshHfMp4Url, setFreshHfMp4Url] = React.useState<string | null>(null);
  const [freshHfCoverUrl, setFreshHfCoverUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!resolvedBrandId) return;
    let cancelled = false;
    void (async () => {
      if (hfMp4Bucket && hfMp4Path) {
        const url = await signOrganicMediaAsset({
          brandId: resolvedBrandId,
          bucket: hfMp4Bucket,
          path: hfMp4Path,
        });
        if (!cancelled && url) setFreshHfMp4Url(url);
      }
      if (hfCoverBucket && hfCoverPath) {
        const url = await signOrganicMediaAsset({
          brandId: resolvedBrandId,
          bucket: hfCoverBucket,
          path: hfCoverPath,
        });
        if (!cancelled && url) setFreshHfCoverUrl(url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedBrandId, hfMp4Bucket, hfMp4Path, hfCoverBucket, hfCoverPath]);

  // Single-image drafts persist the durable pair on the suggestion itself
  // (bucket + url as a storage path) with no publishingAssets/reel/hyperframe
  // row claiming it. Re-sign that pair too so an expired assetUrl refreshes
  // like every other leg.
  const suggestion = draft.mediaSuggestion;
  const suggestionUnclaimed = !suggestion?.reel && !suggestion?.hyperframe;
  const suggestionUrl = suggestion?.url ?? null;
  const suggestionBucket = suggestion?.bucket ?? null;
  const singleImagePath =
    suggestionUnclaimed && hasText(suggestionBucket) && isSignableStoragePath(suggestionUrl)
      ? suggestionUrl
      : null;
  const singleImageBucket = singleImagePath ? suggestionBucket : null;
  const [freshSingleImageUrl, setFreshSingleImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!resolvedBrandId || !singleImageBucket || !singleImagePath) return;
    let cancelled = false;
    void signOrganicMediaAsset({
      brandId: resolvedBrandId,
      bucket: singleImageBucket,
      path: singleImagePath,
    }).then((url) => {
      if (!cancelled && url) setFreshSingleImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedBrandId, singleImageBucket, singleImagePath]);

  return React.useMemo(() => {
    const freshPublishing = Object.keys(freshByPath).length > 0 && draft.publishingAssets;
    const freshHyperframe = (freshHfMp4Url || freshHfCoverUrl) && draft.mediaSuggestion?.hyperframe;
    const freshSingleImage = freshSingleImageUrl && draft.mediaSuggestion;
    if (!freshPublishing && !freshReelUrl && !freshHyperframe && !freshSingleImage) return draft;
    const next: OrganicCalendarDraft = { ...draft };
    if (freshPublishing && draft.publishingAssets) {
      next.publishingAssets = draft.publishingAssets.map((asset) =>
        freshByPath[asset.storagePath]
          ? { ...asset, storageUrl: freshByPath[asset.storagePath] }
          : asset,
      );
    }
    if ((freshReelUrl || freshHyperframe || freshSingleImage) && draft.mediaSuggestion) {
      next.mediaSuggestion = {
        ...draft.mediaSuggestion,
        ...(freshSingleImage
          ? { assetUrl: freshSingleImageUrl, signedUrl: freshSingleImageUrl }
          : {}),
        ...(freshReelUrl && draft.mediaSuggestion.reel
          ? { reel: { ...draft.mediaSuggestion.reel, signedUrl: freshReelUrl } }
          : {}),
        ...(freshHyperframe
          ? {
              hyperframe: {
                ...draft.mediaSuggestion.hyperframe,
                ...(freshHfMp4Url ? { mp4Url: freshHfMp4Url } : {}),
                ...(freshHfCoverUrl ? { coverImageUrl: freshHfCoverUrl } : {}),
              },
            }
          : {}),
      };
    }
    return next;
  }, [draft, freshByPath, freshReelUrl, freshHfMp4Url, freshHfCoverUrl, freshSingleImageUrl]);
}
