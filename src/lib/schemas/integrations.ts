import { z } from "zod";

// Accept Supabase/Postgres timestamps that include offsets (e.g., "+00:00") and normalize to ISO with trailing Z.
const isoDateString = z.string().transform((value, ctx) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid datetime" });
    return z.NEVER;
  }
  return new Date(timestamp).toISOString();
});

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
  integration_account_id: z.string().uuid().nullable(),
  external_id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).nullable(),
  business_id: z.string().nullable(),
  ad_account_id: z.string().nullable(),
});

export const selectableAssetsResponseSchema = z.object({
  synced_at: z.union([isoDateString, z.null()]).default(null),
  stale: z.boolean(),
  assets: z.array(selectableAssetSchema),
});

export type SelectableAsset = z.infer<typeof selectableAssetSchema>;
export type SelectableAssetsResponse = z.infer<typeof selectableAssetsResponseSchema>;

export const applyBrandProfileIntegrationAccountsRequestSchema = z.union([
  z.object({ asset_pks: z.array(z.string().uuid()) }),
  z.object({ integration_account_ids: z.array(z.string().uuid()) }),
]);

export const linkIntegrationAccountsResponseSchema = z.object({
  linked: z.number().int().nonnegative(),
});

export type LinkIntegrationAccountsResponse = z.infer<typeof linkIntegrationAccountsResponseSchema>;
