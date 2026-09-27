// In-app notifications (brand_profiles.notifications) + the review-ping
// request that fans out to selected brand members (notification row per
// recipient + email via the send-library-ping edge function).

import { z } from 'zod';

export const notificationKindSchema = z.enum([
  'review_request',
  'review_status_change',
  'comment_reply',
  'comment_mention',
  // A user custom field (an assignee) was pointed at the recipient. `count` > 1
  // when one bulk write assigned several assets at once.
  'asset_assigned',
  'review_reminder',
  'review_escalation',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

// Every producer must stamp at least this context so the bell can deep-link
// straight to the asset (href = /library?assetId=<assetId>) and render a line.
export const notificationPayloadBaseSchema = z
  .object({
    assetId: z.string().min(1),
    assetName: z.string().min(1),
    actorName: z.string().min(1),
  })
  .strict();
export type NotificationPayloadBase = z.infer<typeof notificationPayloadBaseSchema>;

const commentNotificationPayloadSchema = notificationPayloadBaseSchema.extend({
  commentId: z.string().min(1).optional(),
  // Plain-text preview of the comment body (mention tokens stripped).
  excerpt: z.string().max(200).optional(),
});

export const commentReplyPayloadSchema = commentNotificationPayloadSchema.strict();
export type CommentReplyPayload = z.infer<typeof commentReplyPayloadSchema>;

export const commentMentionPayloadSchema = commentNotificationPayloadSchema.strict();
export type CommentMentionPayload = z.infer<typeof commentMentionPayloadSchema>;

export const reviewStatusChangePayloadSchema = notificationPayloadBaseSchema.extend({
  status: z.string().min(1).optional(),
  message: z.string().max(2000).optional(),
});
export type ReviewStatusChangePayload = z.infer<typeof reviewStatusChangePayloadSchema>;

// Producers write one of the typed payloads above; readers fall back to the
// permissive record so legacy rows keep rendering.
export function parseNotificationPayload(
  kind: NotificationKind,
  payload: Record<string, unknown>,
):
  | CommentReplyPayload
  | CommentMentionPayload
  | ReviewStatusChangePayload
  | Record<string, unknown> {
  const schema =
    kind === 'comment_reply'
      ? commentReplyPayloadSchema
      : kind === 'comment_mention'
        ? commentMentionPayloadSchema
        : kind === 'review_status_change'
          ? reviewStatusChangePayloadSchema
          : null;
  if (!schema) return payload;
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : payload;
}

export const appNotificationSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    recipientUserId: z.string().min(1),
    actorUserId: z.string().nullable().optional(),
    kind: notificationKindSchema,
    // kind-specific context: assetId, assetTitle, commentId, message, url…
    payload: z.record(z.string(), z.unknown()).default({}),
    readAt: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .strict();
export type AppNotification = z.infer<typeof appNotificationSchema>;

export const reviewPingRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    recipientUserIds: z.array(z.string().min(1)).min(1).max(50),
    message: z.string().max(2000).optional(),
  })
  .strict();
export type ReviewPingRequest = z.infer<typeof reviewPingRequestSchema>;

export const reviewPingResponseSchema = z
  .object({
    notified: z.number().int().nonnegative(),
    emailed: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewPingResponse = z.infer<typeof reviewPingResponseSchema>;

export const listNotificationsResponseSchema = z
  .object({
    notifications: z.array(appNotificationSchema),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();
export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;

export const markNotificationsReadRequestSchema = z
  .object({
    notificationIds: z.array(z.string().min(1)).min(1).max(200),
  })
  .strict();
export type MarkNotificationsReadRequest = z.infer<typeof markNotificationsReadRequestSchema>;

// Per-user delivery preferences (brand_profiles.notification_preferences):
// one row per (user, notification kind, channel). `kind` is free text so a new
// producer does not need a migration to become configurable.
export const notificationChannelSchema = z.enum(['in_app', 'email', 'slack', 'web_push']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationFrequencySchema = z.enum(['immediate', 'hourly', 'daily', 'never']);
export type NotificationFrequency = z.infer<typeof notificationFrequencySchema>;

/** What a user who never touched the preferences page gets, per channel. */
export const DEFAULT_NOTIFICATION_FREQUENCY: Record<NotificationChannel, NotificationFrequency> = {
  in_app: 'immediate',
  email: 'daily',
  slack: 'never',
  web_push: 'never',
};

export const notificationPreferenceSchema = z
  .object({
    userId: z.string().uuid(),
    kind: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    channel: notificationChannelSchema,
    frequency: notificationFrequencySchema,
    updatedAt: z.string(),
  })
  .strict();
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const notificationDeliveryStatusSchema = z.enum(['pending', 'sent', 'failed', 'skipped']);
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>;

// One channel's attempt to deliver a notification (service-only table). The
// recipient's preference is resolved once, when the notification is inserted:
// `frequency` is what it said, and `dueAt` is null while a digest row waits for
// its hourly/daily release. `providerRef` is the provider's receipt — the Resend
// message id, the Slack message ts, or the push service's HTTP status.
export const notificationDeliverySchema = z
  .object({
    notificationId: z.string().uuid(),
    channel: notificationChannelSchema,
    status: notificationDeliveryStatusSchema,
    frequency: notificationFrequencySchema,
    dueAt: z.string().nullable(),
    attempts: z.number().int().nonnegative(),
    lastError: z.string().nullable(),
    providerRef: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;

// A browser Push API subscription (brand_profiles.web_push_subscriptions).
export const webPushSubscriptionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    endpoint: z
      .string()
      .url()
      .regex(/^https:\/\//),
    p256dh: z.string().min(1),
    auth: z.string().min(1),
    userAgent: z.string().nullable(),
    createdAt: z.string(),
    lastSeenAt: z.string(),
  })
  .strict();
export type WebPushSubscription = z.infer<typeof webPushSubscriptionSchema>;
