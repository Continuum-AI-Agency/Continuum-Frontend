import { z } from "zod";

const integrationSyncResponseBase = z.object({
  url: z.string().url(),
});

export const metaSyncResponseSchema = integrationSyncResponseBase;

export const googleSyncResponseSchema = integrationSyncResponseBase.extend({
  state: z.string().min(1),
});

export const googleDrivePickerResponseSchema = integrationSyncResponseBase.extend({
  state: z.string().min(1),
});

export type MetaSyncResponse = z.infer<typeof metaSyncResponseSchema>;
export type GoogleSyncResponse = z.infer<typeof googleSyncResponseSchema>;
export type GoogleDrivePickerResponse = z.infer<typeof googleDrivePickerResponseSchema>;

const selectableAssetSchema = z.object({
  asset_pk: z.string().uuid(),
  external_id: z.string().min(1),
  type: z.enum([
    "meta_ad_account",
    "meta_page",
    "meta_instagram_account",
    "meta_threads_account",
    "google_ad_account",
    "youtube_channel",
    "dv360_advertiser",
  ]),
  name: z.string().min(1),
  business_id: z.string().nullable(),
});

export const selectableAssetsResponseSchema = z.object({
  synced_at: z.string().datetime().nullable(),
  stale: z.boolean(),
  assets: z.array(selectableAssetSchema),
});

export type SelectableAsset = z.infer<typeof selectableAssetSchema>;
export type SelectableAssetsResponse = z.infer<typeof selectableAssetsResponseSchema>;

export const linkIntegrationAccountsResponseSchema = z.object({
  linked: z.number().int().nonnegative(),
});

export type LinkIntegrationAccountsResponse = z.infer<typeof linkIntegrationAccountsResponseSchema>;
