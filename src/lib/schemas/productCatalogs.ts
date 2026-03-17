import { z } from "zod";

export const productCatalogVerticalSchema = z.enum([
  "adoptable_pets",
  "commerce",
  "destinations",
  "flights",
  "generic",
  "home_listings",
  "hotels",
  "local_service_businesses",
  "offer_items",
  "offline_commerce",
  "transactable_items",
  "vehicles",
]);

export type ProductCatalogVertical = z.infer<typeof productCatalogVerticalSchema>;

export const productCatalogAdObjectLevelSchema = z.enum(["campaign", "adset", "ad"]);

export type ProductCatalogAdObjectLevel = z.infer<typeof productCatalogAdObjectLevelSchema>;

export const productCatalogSyncStatusSchema = z.enum(["active", "stale", "error", "draft"]);

export type ProductCatalogSyncStatus = z.infer<typeof productCatalogSyncStatusSchema>;

const catalogIdSchema = z
  .string()
  .trim()
  .min(2, "Catalog id is required")
  .max(64, "Catalog id must be 64 characters or fewer");
const optionalCatalogIdSchema = z.string().trim().max(64).optional().or(z.literal(""));

const optionalUrlSchema = z.string().url("Use a valid URL").max(1024).optional().or(z.literal(""));

const optionalTextSchema = z.string().trim().max(4000).optional().or(z.literal(""));

const optionalBusinessIdSchema = z.string().trim().max(64).optional().or(z.literal(""));
const optionalCatalogStoreIdSchema = z.string().trim().max(64).optional().or(z.literal(""));
const requiredBusinessIdSchema = z
  .string()
  .trim()
  .min(1, "Meta business is required")
  .max(64, "Meta business id must be 64 characters or fewer");
const requiredCatalogStoreIdSchema = z
  .string()
  .trim()
  .min(1, "Catalog store page is required")
  .max(64, "Catalog store id must be 64 characters or fewer");
const requiredMetaAccountIdSchema = z
  .string()
  .trim()
  .min(1, "Meta account is required")
  .max(64, "Meta account id must be 64 characters or fewer");

const optionalCountSchema = z.number().int().min(0).max(10_000_000).optional();

const linkedAdObjectIdSchema = z
  .string()
  .trim()
  .min(1, "Ad object ids cannot contain empty values")
  .max(128, "Ad object ids must be 128 characters or fewer");

export const productCatalogCreateSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(2, "Catalog name is required").max(120),
  businessId: requiredBusinessIdSchema,
  catalogStoreId: requiredCatalogStoreIdSchema,
  metaAccountId: requiredMetaAccountIdSchema,
  vertical: productCatalogVerticalSchema.default("commerce"),
});

export type ProductCatalogCreateInput = z.infer<typeof productCatalogCreateSchema>;

export const productCatalogUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    externalCatalogId: catalogIdSchema.optional(),
    businessId: optionalBusinessIdSchema,
    catalogStoreId: optionalCatalogStoreIdSchema,
    vertical: productCatalogVerticalSchema.optional(),
    feedUrl: optionalUrlSchema,
    defaultImageUrl: optionalUrlSchema,
    fallbackImageUrl: optionalUrlSchema,
    linkedAdObjectLevel: productCatalogAdObjectLevelSchema.optional(),
    linkedAdObjectIds: z.array(linkedAdObjectIdSchema).max(100).optional(),
    dataFeedEnabled: z.boolean().optional(),
    productTaggingEnabled: z.boolean().optional(),
    syncStatus: productCatalogSyncStatusSchema.optional(),
    productCount: optionalCountSchema,
    feedCount: optionalCountSchema,
    productSetCount: optionalCountSchema,
    lastSyncedAt: z.string().datetime({ offset: true }).optional().nullable(),
    notes: optionalTextSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type ProductCatalogUpdateInput = z.infer<typeof productCatalogUpdateSchema>;

export const productCatalogRecordSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string(),
  externalCatalogId: z.string(),
  businessId: z.string().nullable(),
  catalogStoreId: z.string().nullable(),
  vertical: productCatalogVerticalSchema,
  feedUrl: z.string().nullable(),
  defaultImageUrl: z.string().nullable(),
  fallbackImageUrl: z.string().nullable(),
  linkedAdObjectLevel: productCatalogAdObjectLevelSchema,
  linkedAdObjectIds: z.array(z.string()),
  dataFeedEnabled: z.boolean(),
  productTaggingEnabled: z.boolean(),
  syncStatus: productCatalogSyncStatusSchema,
  productCount: z.number().int().min(0),
  feedCount: z.number().int().min(0),
  productSetCount: z.number().int().min(0),
  lastSyncedAt: z.string().datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type ProductCatalogRecord = z.infer<typeof productCatalogRecordSchema>;

export const productCatalogListResponseSchema = z.object({
  catalogs: z.array(productCatalogRecordSchema),
});

export const productCatalogSingleResponseSchema = z.object({
  catalog: productCatalogRecordSchema,
});

export const productCatalogFormSchema = z.object({
  name: z.string().trim().min(2, "Catalog name is required").max(120),
  externalCatalogId: optionalCatalogIdSchema,
  businessId: requiredBusinessIdSchema,
  catalogStoreId: requiredCatalogStoreIdSchema,
  vertical: productCatalogVerticalSchema,
  feedUrl: optionalUrlSchema,
  defaultImageUrl: optionalUrlSchema,
  fallbackImageUrl: optionalUrlSchema,
  linkedAdObjectLevel: productCatalogAdObjectLevelSchema,
  linkedAdObjectIdsText: z.string().max(5000).optional().or(z.literal("")),
  dataFeedEnabled: z.boolean().default(true),
  productTaggingEnabled: z.boolean().default(true),
  syncStatus: productCatalogSyncStatusSchema,
  productCount: optionalCountSchema,
  feedCount: optionalCountSchema,
  productSetCount: optionalCountSchema,
  lastSyncedAtLocal: z.string().optional().or(z.literal("")),
  notes: optionalTextSchema,
});

export type ProductCatalogFormValues = z.infer<typeof productCatalogFormSchema>;

export const EMPTY_PRODUCT_CATALOG_FORM: ProductCatalogFormValues = {
  name: "",
  externalCatalogId: "",
  businessId: "",
  catalogStoreId: "",
  vertical: "commerce",
  feedUrl: "",
  defaultImageUrl: "",
  fallbackImageUrl: "",
  linkedAdObjectLevel: "adset",
  linkedAdObjectIdsText: "",
  dataFeedEnabled: true,
  productTaggingEnabled: true,
  syncStatus: "draft",
  productCount: 0,
  feedCount: 0,
  productSetCount: 0,
  lastSyncedAtLocal: "",
  notes: "",
};

export const PRODUCT_CATALOG_VERTICAL_LABELS: Record<ProductCatalogVertical, string> = {
  adoptable_pets: "Adoptable Pets",
  commerce: "Commerce",
  destinations: "Destinations",
  flights: "Flights",
  generic: "Generic",
  home_listings: "Home Listings",
  hotels: "Hotels",
  local_service_businesses: "Local Service Businesses",
  offer_items: "Offer Items",
  offline_commerce: "Offline Commerce",
  transactable_items: "Transactable Items",
  vehicles: "Vehicles",
};

export const PRODUCT_CATALOG_SYNC_STATUS_LABELS: Record<ProductCatalogSyncStatus, string> = {
  active: "Active",
  stale: "Stale",
  error: "Error",
  draft: "Draft",
};

export function parseLinkedAdObjectIds(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

export function formatLinkedAdObjectIds(ids: string[]): string {
  return ids.join("\n");
}

export function normalizeNullableText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
