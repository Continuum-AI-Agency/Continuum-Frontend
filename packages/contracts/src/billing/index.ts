import { z } from 'zod';

import { canvasCreditActionCodeSchema } from './modelId';

export * from './modelId';

export const BILLING_MVP_CATALOG_VERSION = 'billing-mvp-v1' as const;
export const billingOperationIdSchema = z.string().uuid();

export const catalogCodeSchema = z.enum([
  'library_storage',
  'canvas',
  'canvas_credits',
  'organic_agent',
  'jaina',
  'trends',
  // Trends Plus is a single sellable add-on SKU whose grant expands to the three
  // provider entitlement codes below. Customers see one "Trends Plus"; the
  // providers stay as entitlement codes but are no longer sold individually.
  'trends_plus',
  'provider_exa',
  'provider_serpapi',
  'provider_apify',
]);
export type CatalogCode = z.infer<typeof catalogCodeSchema>;

export const catalogVersionSchema = z.string().min(1);
export type CatalogVersion = z.infer<typeof catalogVersionSchema>;

export const billingCatalogItemSchema = z
  .object({
    code: catalogCodeSchema,
    displayName: z.string().min(1),
    kind: z.enum(['access', 'capacity', 'credit']),
    availability: z.enum(['baseline', 'invite', 'available', 'deferred']),
    dependencyCodes: z.array(catalogCodeSchema),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();
export type BillingCatalogItem = z.infer<typeof billingCatalogItemSchema>;

export const billingCatalogSchema = z
  .object({
    version: catalogVersionSchema,
    items: z.array(billingCatalogItemSchema),
  })
  .strict();
export type BillingCatalog = z.infer<typeof billingCatalogSchema>;

export const entitlementSourceSchema = z.enum([
  'admin',
  'trial',
  'stripe',
  'manual_invoice',
  'compatibility',
]);
export type EntitlementSource = z.infer<typeof entitlementSourceSchema>;

export const entitlementGrantSchema = z
  .object({
    entitlementCode: catalogCodeSchema,
    effect: z.enum(['allow', 'deny']),
    source: entitlementSourceSchema,
    sourceKey: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type EntitlementGrant = z.infer<typeof entitlementGrantSchema>;

export const capacityGrantSchema = z
  .object({
    capacityCode: z.literal('library_storage_bytes'),
    amountBytes: z.number().int().positive(),
    source: entitlementSourceSchema,
    sourceKey: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type CapacityGrant = z.infer<typeof capacityGrantSchema>;

export const canvasCreditGrantSchema = z
  .object({
    grantId: z.string().uuid(),
    brandId: z.string().uuid(),
    grantedCredits: z.number().int().positive(),
    remainingCredits: z.number().int().nonnegative(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type CanvasCreditGrant = z.infer<typeof canvasCreditGrantSchema>;

export const canvasCreditBalanceSchema = z
  .object({
    available: z.number().int().nonnegative(),
    expiringWithin30Days: z.number().int().nonnegative(),
    nextExpirationAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type CanvasCreditBalance = z.infer<typeof canvasCreditBalanceSchema>;

export const intelligenceProviderSchema = z.enum([
  'provider_exa',
  'provider_serpapi',
  'provider_apify',
]);
export type IntelligenceProvider = z.infer<typeof intelligenceProviderSchema>;

export const effectiveEntitlementsSchema = z
  .object({
    brandId: z.string().uuid(),
    tier: z.number().int().nonnegative(),
    tierMode: z.enum(['emergency_lock', 'payment', 'manual_invoice', 'friends_family']),
    compatibilityProfile: z.boolean(),
    features: z.array(catalogCodeSchema),
    access: z
      .object({
        canvas: z.boolean(),
        organicAgent: z.boolean(),
        jaina: z.boolean(),
        trends: z.boolean(),
      })
      .strict(),
    intelligenceProviders: z.array(intelligenceProviderSchema),
    libraryCapacityBytes: z.number().int().nonnegative(),
    canvasCredits: canvasCreditBalanceSchema,
    explicitDenies: z.array(catalogCodeSchema),
    resolvedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type EffectiveEntitlements = z.infer<typeof effectiveEntitlementsSchema>;

export const storageUsageSummarySchema = z
  .object({
    usedBytes: z.number().int().nonnegative(),
    capacityBytes: z.number().int().nonnegative(),
    availableBytes: z.number().int().nonnegative(),
    utilizationPercent: z.number().min(0),
  })
  .strict();
export type StorageUsageSummary = z.infer<typeof storageUsageSummarySchema>;

export const canvasUsageHealthSchema = z.enum([
  'not_entitled',
  'unfunded',
  'depleted',
  'low',
  'unused',
  'healthy',
]);
export type CanvasUsageHealth = z.infer<typeof canvasUsageHealthSchema>;

export const usageSummarySchema = z
  .object({
    health: canvasUsageHealthSchema,
    creditsSpent7Days: z.number().int().nonnegative(),
    creditsSpent30Days: z.number().int().nonnegative(),
    lastSpendAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type UsageSummary = z.infer<typeof usageSummarySchema>;

export const billingSummarySchema = z
  .object({
    entitlements: effectiveEntitlementsSchema,
    storage: storageUsageSummarySchema,
    canvasUsage: usageSummarySchema,
  })
  .strict();
export type BillingSummary = z.infer<typeof billingSummarySchema>;

export const storageCapacityCheckSchema = z
  .object({
    allowed: z.boolean(),
    usedBytes: z.number().int().nonnegative(),
    reservedBytes: z.number().int().nonnegative(),
    additionalBytes: z.number().int().nonnegative(),
    capacityBytes: z.number().int().nonnegative(),
    availableBytes: z.number().int().nonnegative(),
  })
  .strict();
export type StorageCapacityCheck = z.infer<typeof storageCapacityCheckSchema>;

export const canvasCreditSpendRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    actionCode: canvasCreditActionCodeSchema,
    modelId: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    idempotencyKey: z.string().min(1),
    runId: z.string().min(1).nullable().default(null),
    sessionId: z.string().min(1).nullable().default(null),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type CanvasCreditSpendRequest = z.infer<typeof canvasCreditSpendRequestSchema>;

const declinedCanvasCreditSpendSchema = z
  .object({
    allowed: z.literal(false),
    recorded: z.literal(false),
    idempotentReplay: z.literal(false),
    reason: z.enum(['canvas_not_entitled', 'insufficient_credits']),
    creditsRequired: z.number().int().nonnegative(),
    creditsAvailable: z.number().int().nonnegative(),
  })
  .strict();

const acceptedCanvasCreditSpendSchema = z
  .object({
    allowed: z.literal(true),
    recorded: z.boolean(),
    idempotentReplay: z.boolean(),
    reservationStatus: z.enum(['reserved', 'settled', 'released']),
    spendId: z.string().uuid(),
    creditsSpent: z.number().int().positive(),
    creditsAvailable: z.number().int().nonnegative().optional(),
  })
  .strict();

export const canvasCreditSpendResponseSchema = z.discriminatedUnion('allowed', [
  declinedCanvasCreditSpendSchema,
  acceptedCanvasCreditSpendSchema,
]);
export type CanvasCreditSpendResponse = z.infer<typeof canvasCreditSpendResponseSchema>;

export const canvasCreditSettlementSchema = z
  .object({
    spendId: z.string().uuid(),
    status: z.enum(['settled', 'released']),
    creditsSpent: z.number().int().positive().optional(),
    creditsReleased: z.number().int().positive().optional(),
    settledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export type CanvasCreditSettlement = z.infer<typeof canvasCreditSettlementSchema>;
