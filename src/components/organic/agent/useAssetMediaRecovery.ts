'use client';

import { useCallback, useState } from 'react';
import type { ChatMedia } from '@/components/chat/media/media';
import { signMediaAsset } from '@/lib/organic/hyperframeSign';

/**
 * Fresh URLs for chat tiles backed by a media.assets row (library hits, composer
 * uploads). Their persisted URL is a 1h signature; when a tile fails, `recover`
 * mints a new one by asset id and `resolve` hands the tile media carrying it.
 * A tile with no asset id has nothing to re-sign and stays on its fallback.
 */
export function useAssetMediaRecovery(brandId: string | null | undefined) {
  const [freshById, setFreshById] = useState<Readonly<Record<string, string>>>({});

  const recover = useCallback(
    (media: ChatMedia) => {
      if (!brandId || !media.assetId) return;
      void signMediaAsset({ brandId, assetId: media.assetId }).then((url) => {
        if (url && url !== media.url) setFreshById((prev) => ({ ...prev, [media.id]: url }));
      });
    },
    [brandId],
  );

  const resolve = useCallback(
    (media: ChatMedia): ChatMedia => {
      const url = freshById[media.id];
      return url ? { ...media, url } : media;
    },
    [freshById],
  );

  return { recover, resolve };
}
