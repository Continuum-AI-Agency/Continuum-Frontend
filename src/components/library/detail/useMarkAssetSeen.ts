'use client';

// Records that the signed-in member opened an asset (media.asset_views), which is what the
// info panel's "Seen by" reads. One call per open; a failure is swallowed because a missed
// view stamp must never break the viewer — the next open records it.

import { useEffect } from 'react';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function useMarkAssetSeen(assetId: string | null): void {
  useEffect(() => {
    if (!assetId) return;
    void Promise.resolve(
      mediaSchema(createSupabaseBrowserClient()).rpc('mark_asset_seen', { p_asset_id: assetId }),
    ).catch(() => undefined);
  }, [assetId]);
}
