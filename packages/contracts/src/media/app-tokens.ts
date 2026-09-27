// Personal app tokens (brand_profiles.app_tokens) — how a desktop client such as
// the Drive sync app authenticates as a user. The plaintext token exists exactly
// once, in the create response; the row keeps only its hash and last four.

import { z } from 'zod';

export const APP_TOKEN_PREFIX = 'cnt_';

const appTokenScopesSchema = z.array(z.string().min(1)).default(['drive']);

export const appTokenSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().min(1).max(80),
    last4: z.string().length(4),
    scopes: appTokenScopesSchema,
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
  })
  .strict();
export type AppToken = z.infer<typeof appTokenSchema>;

export const createAppTokenRequestSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export type CreateAppTokenRequest = z.infer<typeof createAppTokenRequestSchema>;

export const createAppTokenResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    token: z.string().regex(/^cnt_[0-9a-f]{64}$/),
    last4: z.string().length(4),
    scopes: appTokenScopesSchema,
    createdAt: z.string(),
  })
  .strict();
export type CreateAppTokenResponse = z.infer<typeof createAppTokenResponseSchema>;

export const revokeAppTokenResponseSchema = z
  .object({
    id: z.string().uuid(),
    revokedAt: z.string(),
  })
  .strict();
export type RevokeAppTokenResponse = z.infer<typeof revokeAppTokenResponseSchema>;
