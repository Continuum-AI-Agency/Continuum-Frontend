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

const metaSelectableHierarchyAdAccountSchema = z.object({
  ad_account_id: z.string().min(1),
  ad_account: selectableAssetSchema.nullable(),
  pages: z.array(selectableAssetSchema),
  instagram_accounts: z.array(selectableAssetSchema),
  threads_accounts: z.array(selectableAssetSchema),
});

const metaSelectableHierarchyBusinessSchema = z.object({
  business_id: z.string().nullable(),
  business_name: z.string().nullable(),
  ad_accounts: z.array(metaSelectableHierarchyAdAccountSchema),
  pages_without_ad_account: z.array(selectableAssetSchema),
  instagram_accounts_without_ad_account: z.array(selectableAssetSchema),
  threads_accounts_without_ad_account: z.array(selectableAssetSchema),
});

const metaSelectableHierarchyIntegrationSchema = z.object({
  integration_id: z.string().uuid(),
  businesses: z.array(metaSelectableHierarchyBusinessSchema),
});

const metaSelectableHierarchySchema = z.object({
  integrations: z.array(metaSelectableHierarchyIntegrationSchema).optional(),
});

const googleSelectableHierarchyIntegrationSchema = z.object({
  integration_id: z.string().uuid(),
  ad_accounts: z.array(selectableAssetSchema).optional().default([]),
  youtube_channels: z.array(selectableAssetSchema).optional().default([]),
  dv360_advertisers: z.array(selectableAssetSchema).optional().default([]),
});

const googleSelectableHierarchySchema = z.object({
  integrations: z.array(googleSelectableHierarchyIntegrationSchema).optional().default([]),
});

const selectableAssetsHierarchySchema = z.record(z.string(), z.any()).optional();

const providerSelectableAssetsSchema = z
  .object({
    asset_count: z.number().int().nonnegative().optional(),
    assets: z.array(selectableAssetSchema).optional().default([]),
    hierarchy: selectableAssetsHierarchySchema.optional(),
  })
  .catchall(z.unknown());

export const selectableAssetsResponseSchema = z.object({
  synced_at: z.union([isoDateString, z.null()]).default(null),
  stale: z.boolean(),
  assets: z.array(selectableAssetSchema).optional().default([]),
  providers: z.record(z.string(), providerSelectableAssetsSchema).default({}),
});

export type SelectableAsset = z.infer<typeof selectableAssetSchema>;
export type MetaSelectableHierarchy = z.infer<typeof metaSelectableHierarchySchema>;
export type SelectableAssetsHierarchy = z.infer<typeof selectableAssetsHierarchySchema>;
export type ProviderSelectableAssets = z.infer<typeof providerSelectableAssetsSchema>;
export type SelectableAssetsResponse = z.infer<typeof selectableAssetsResponseSchema>;

const selectableAssetWithIntegrationIdSchema = selectableAssetSchema.extend({
  integration_id: z.string().uuid(),
});

export const integrationAssetsResponseSchema = selectableAssetsResponseSchema.extend({
  integration_id: z.string().uuid(),
  provider: z.string().min(1).nullable(),
  assets: z.array(selectableAssetWithIntegrationIdSchema),
  assets_flat: z.array(selectableAssetSchema),
});

export type IntegrationAssetsResponse = z.infer<typeof integrationAssetsResponseSchema>;

export const applyBrandProfileIntegrationAccountsRequestSchema = z.union([
  z.object({ asset_pks: z.array(z.string().uuid()) }),
  z.object({ integration_account_ids: z.array(z.string().uuid()) }),
]);

export const linkIntegrationAccountsResponseSchema = z.object({
  linked: z.number().int().nonnegative(),
});

export type LinkIntegrationAccountsResponse = z.infer<typeof linkIntegrationAccountsResponseSchema>;
