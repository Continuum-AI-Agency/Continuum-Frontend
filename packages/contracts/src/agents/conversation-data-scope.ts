import { z } from 'zod';

export const CONVERSATION_DATA_SCOPE_MAX_ACCOUNTS = 10;

export const conversationDataPlatformSchema = z.enum([
  'meta',
  'google_ads',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
]);
export type ConversationDataPlatform = z.infer<typeof conversationDataPlatformSchema>;

export const conversationDataAccountSchema = z
  .object({
    platform: conversationDataPlatformSchema,
    accountId: z.string().min(1),
  })
  .strict();
export type ConversationDataAccount = z.infer<typeof conversationDataAccountSchema>;

export const conversationEntityFiltersSchema = z
  .object({
    statuses: z.array(z.string().min(1)).min(1).optional(),
    objectives: z.array(z.string().min(1)).min(1).optional(),
    types: z.array(z.string().min(1)).min(1).optional(),
    /** Applied case-insensitively by the resolver. */
    nameQuery: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((filters) => Object.values(filters).some((value) => value !== undefined), {
    message: 'entity filters must contain at least one constraint',
  });
export type ConversationEntityFilters = z.infer<typeof conversationEntityFiltersSchema>;

/**
 * Resolution order is IDs first, then every supplied filter as an intersection.
 * `ids: []` deliberately means an empty result. It must never be widened to all entities.
 */
export const conversationEntityScopeSchema = z
  .object({
    ids: z.array(z.string().min(1)).optional(),
    filters: conversationEntityFiltersSchema.optional(),
  })
  .strict()
  .refine((scope) => scope.ids !== undefined || scope.filters !== undefined, {
    message: 'entity scope must contain ids or filters',
  });
export type ConversationEntityScope = z.infer<typeof conversationEntityScopeSchema>;

export const conversationDataScopeV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    accounts: z
      .array(conversationDataAccountSchema)
      .min(1)
      .max(CONVERSATION_DATA_SCOPE_MAX_ACCOUNTS),
    /** Absent entity scopes mean all authorized entities at that level. */
    campaigns: conversationEntityScopeSchema.optional(),
    groups: conversationEntityScopeSchema.optional(),
    ads: conversationEntityScopeSchema.optional(),
  })
  .strict()
  .superRefine((scope, ctx) => {
    const keys = scope.accounts.map(({ platform, accountId }) => `${platform}:${accountId}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accounts'],
        message: 'accounts must contain unique platform/account pairs',
      });
    }
  });
export type ConversationDataScopeV1 = z.infer<typeof conversationDataScopeV1Schema>;
