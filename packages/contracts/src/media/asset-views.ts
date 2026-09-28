// Seen by: media.asset_views, one row per (asset, person). Written only by the member RPC
// media.mark_asset_seen(p_asset_id), which upserts the caller's row and counts the view;
// members read every row of the assets they can see (restricted collections included).

import { z } from 'zod';

export const assetViewSchema = z
  .object({
    assetId: z.string().uuid(),
    brandId: z.string().uuid(),
    userId: z.string().uuid(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    viewCount: z.number().int().positive(),
  })
  .strict();
export type AssetView = z.infer<typeof assetViewSchema>;

/** The RPC's argument, as PostgREST takes it. */
export const markAssetSeenRequestSchema = z.object({ p_asset_id: z.string().uuid() }).strict();
export type MarkAssetSeenRequest = z.infer<typeof markAssetSeenRequestSchema>;
