import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(240);
const timestampSchema = z.string().datetime({ offset: true });

export const chatPlatformSchema = z.enum(['slack', 'teams']);
export type ChatPlatform = z.infer<typeof chatPlatformSchema>;

export const chatConnectionStatusSchema = z.enum(['active', 'revoked']);
export type ChatConnectionStatus = z.infer<typeof chatConnectionStatusSchema>;

export const chatDestinationSchema = z
  .object({
    threadId: idSchema,
    channelId: idSchema.optional(),
  })
  .strict();
export type ChatDestination = z.infer<typeof chatDestinationSchema>;

export const chatConnectionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    platform: chatPlatformSchema,
    workspaceId: idSchema,
    platformUserId: idSchema,
    displayName: z.string().trim().min(1).max(300).optional(),
    handle: z.string().trim().min(1).max(300).optional(),
    status: chatConnectionStatusSchema,
    destination: chatDestinationSchema.optional(),
    preferredBrandIds: z.array(z.string().uuid()).default([]),
    lastVerifiedAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type ChatConnection = z.infer<typeof chatConnectionSchema>;

export const listChatConnectionsResponseSchema = z
  .object({
    connections: z.array(chatConnectionSchema),
  })
  .strict();
export type ListChatConnectionsResponse = z.infer<typeof listChatConnectionsResponseSchema>;

export const setChatPreferenceRequestSchema = z
  .object({
    connectionId: z.string().uuid(),
  })
  .strict();
export type SetChatPreferenceRequest = z.infer<typeof setChatPreferenceRequestSchema>;

export const chatPreferenceSchema = z
  .object({
    brandId: z.string().uuid(),
    connectionId: z.string().uuid(),
    updatedAt: timestampSchema,
  })
  .strict();
export type ChatPreference = z.infer<typeof chatPreferenceSchema>;

export const goalChatDeliveryStatusSchema = z.enum([
  'waiting_for_connection',
  'pending',
  'delivering',
  'delivered',
  'acknowledged',
  'failed',
  'cancelled',
]);
export type GoalChatDeliveryStatus = z.infer<typeof goalChatDeliveryStatusSchema>;

/**
 * Public Goal read projection. Provider destination, thread, and message IDs
 * deliberately remain server-private.
 */
export const goalChatDeliverySchema = z
  .object({
    id: z.string().uuid(),
    requestId: idSchema,
    recipientUserId: z.string().uuid(),
    platform: chatPlatformSchema.optional(),
    status: goalChatDeliveryStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deliveredAt: timestampSchema.optional(),
    acknowledgedAt: timestampSchema.optional(),
    failedAt: timestampSchema.optional(),
    failureSummary: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();
export type GoalChatDelivery = z.infer<typeof goalChatDeliverySchema>;

export const goalChatResponseActionSchema = z
  .object({
    deliveryId: z.string().uuid(),
  })
  .strict();
export type GoalChatResponseAction = z.infer<typeof goalChatResponseActionSchema>;
