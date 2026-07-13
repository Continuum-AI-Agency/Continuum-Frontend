// Creative DNA — importing a SYNCED Meta ad creative into the media Library.
//
// A creative that arrived through the paid sync (paid_media.ad_creatives) is a
// second-class citizen: comments, versions and review state all hang off
// media.assets, so an ad the brand is actually running cannot be annotated,
// versioned or approved. The import materializes it as a real Library asset and
// stamps the deployment ledger with a `link_method: 'import'` row — the strongest
// possible link, because we KNOW the asset came from that ad.
//
// The route lives on the Backend rather than an edge function because Meta token
// custody is Backend-side (@continuum/meta-graph): Meta CDN URLs expire, and a
// re-read from Graph needs the brand's decrypted access token.

import { z } from 'zod';

export const importAdCreativeRequestSchema = z
  .object({
    brandId: z.string().min(1),
    /** paid_media.ad_creatives.id — the synced creative ROW, not Meta's creative id. */
    creativeRowId: z.string().min(1),
  })
  .strict();
export type ImportAdCreativeRequest = z.infer<typeof importAdCreativeRequestSchema>;

export const importAdCreativeResponseSchema = z
  .object({
    ok: z.literal(true),
    assetId: z.string(),
    // True when the creative was already imported: the import is idempotent per
    // creative row, so a second call returns the first asset rather than minting
    // a duplicate that would split the creative's comments and version history.
    alreadyExisted: z.boolean(),
    creativeId: z.string(),
    kind: z.enum(['image', 'video']),
    // sha256 of the stored bytes — the same value paid byte-hash matching keys on.
    // Null only when an already-imported asset predates checksum capture: a real
    // "we don't have it" beats a fabricated digest.
    checksum: z.string().nullable(),
  })
  .strict();
export type ImportAdCreativeResponse = z.infer<typeof importAdCreativeResponseSchema>;

// Honest failure codes. `creative_media_unavailable` is the one that matters:
// Meta CDN URLs expire, and when a re-read from Graph ALSO fails we say so rather
// than registering an empty asset that looks imported but has no bytes.
export const importAdCreativeErrorCodeSchema = z.enum([
  'creative_not_found',
  'creative_has_no_media',
  'creative_media_unavailable',
  'asset_register_failed',
]);
export type ImportAdCreativeErrorCode = z.infer<typeof importAdCreativeErrorCodeSchema>;
