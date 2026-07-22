import { z } from 'zod';

export const paidMediaPlatformSchema = z.enum(['meta']);

export const paidMediaObjectTypeSchema = z.enum(['campaign', 'adset', 'ad']);

export const catalogProductAvailabilitySchema = z.enum([
  'in_stock',
  'out_of_stock',
  'preorder',
  'unknown',
]);

export const catalogProductRecordSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  catalogId: z.string().uuid(),
  externalProductId: z.string().min(1),
  title: z.string().nullable(),
  availability: catalogProductAvailabilitySchema,
  imageUrl: z.string().nullable(),
  productUrl: z.string().nullable(),
  currency: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type CatalogProductRecord = z.infer<typeof catalogProductRecordSchema>;

export const paidMediaAdObjectRecordSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  platform: paidMediaPlatformSchema,
  objectType: paidMediaObjectTypeSchema,
  externalObjectId: z.string().min(1),
  name: z.string().nullable(),
  status: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type PaidMediaAdObjectRecord = z.infer<typeof paidMediaAdObjectRecordSchema>;

export const productAdActivityRecordSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  catalogId: z.string().uuid(),
  productId: z.string().uuid(),
  adObjectId: z.string().uuid(),
  isActive: z.boolean(),
  firstSeenAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  activeFrom: z.string().datetime({ offset: true }).nullable(),
  activeTo: z.string().datetime({ offset: true }).nullable(),
  source: z.string(),
  syncJobId: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type ProductAdActivityRecord = z.infer<typeof productAdActivityRecordSchema>;

export const productCatalogLinkRecordSchema = z.object({
  activity: productAdActivityRecordSchema,
  product: catalogProductRecordSchema,
  adObject: paidMediaAdObjectRecordSchema,
});

export type ProductCatalogLinkRecord = z.infer<typeof productCatalogLinkRecordSchema>;

const optionalNullableStringSchema = z.string().trim().optional().or(z.literal(''));

export const upsertProductCatalogLinkSchema = z.object({
  brandId: z.string().uuid(),
  product: z.object({
    externalProductId: z.string().trim().min(1).max(150),
    title: optionalNullableStringSchema,
    availability: catalogProductAvailabilitySchema.default('unknown'),
    imageUrl: z.string().url().optional().or(z.literal('')),
    productUrl: z.string().url().optional().or(z.literal('')),
    currency: z.string().trim().length(3).optional().or(z.literal('')),
  }),
  adObject: z.object({
    platform: paidMediaPlatformSchema.default('meta'),
    objectType: paidMediaObjectTypeSchema,
    externalObjectId: z.string().trim().min(1).max(120),
    name: optionalNullableStringSchema,
    status: optionalNullableStringSchema,
  }),
  activity: z.object({
    isActive: z.boolean().default(true),
    seenAt: z.string().datetime({ offset: true }).optional(),
    activeFrom: z.string().datetime({ offset: true }).optional().nullable(),
    activeTo: z.string().datetime({ offset: true }).optional().nullable(),
    source: z.string().trim().min(1).max(64).default('sync'),
    syncJobId: z.string().uuid().optional().nullable(),
  }),
});

export type UpsertProductCatalogLinkInput = z.infer<typeof upsertProductCatalogLinkSchema>;

export const renameCatalogProductSchema = z.object({
  brandId: z.string().uuid(),
  externalProductId: z.string().trim().min(1).max(150),
  title: optionalNullableStringSchema,
});

export type RenameCatalogProductInput = z.infer<typeof renameCatalogProductSchema>;

export const removeCatalogProductSchema = z.object({
  brandId: z.string().uuid(),
  externalProductId: z.string().trim().min(1).max(150),
});

export type RemoveCatalogProductInput = z.infer<typeof removeCatalogProductSchema>;

export const productCatalogLinksListResponseSchema = z.object({
  links: z.array(productCatalogLinkRecordSchema),
});

export const productCatalogLinkSingleResponseSchema = z.object({
  link: productCatalogLinkRecordSchema,
});

export function toNullableText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
