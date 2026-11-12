// brand_profiles.notifications helpers for the bell UI: DB row → contract
// mapping and per-kind display strings. Pure — unit tested with bun.

import {
  type AppNotification,
  appNotificationSchema,
  buildLibraryAssetHref,
} from '@continuum/contracts';

export type NotificationRow = {
  id: string;
  brand_id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  kind: string;
  payload: unknown;
  read_at: string | null;
  created_at: string;
};

export function mapNotificationRow(row: NotificationRow): AppNotification | null {
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const parsed = appNotificationSchema.safeParse({
    id: row.id,
    brandId: row.brand_id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    kind: row.kind,
    payload,
    readAt: row.read_at,
    createdAt: row.created_at,
  });
  return parsed.success ? parsed.data : null;
}

function payloadString(notification: AppNotification, key: string): string | null {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type NotificationDisplay = {
  title: string;
  detail: string | null;
  href: string | null;
};

// Every kind deep-links to the asset's detail modal (/library?assetId=…);
// the library page opens it on load. A comment's notification (reply, mention)
// also names the comment, so the modal opens on that thread and its moment.
// Legacy rows without an assetId in their payload still land on /library.
export type NotificationMessageKey =
  | 'notificationActor'
  | 'notificationAsset'
  | 'notificationReviewRequest'
  | 'notificationStatusChanged'
  | 'notificationReviewChanged'
  | 'notificationReply'
  | 'notificationMention'
  | 'notificationAssignedMany'
  | 'notificationAssignedOne'
  | 'notificationReminder'
  | 'notificationOverdue'
  | 'notificationStateNone'
  | 'notificationStateDraft'
  | 'notificationStateInReview'
  | 'notificationStateNeedsChanges'
  | 'notificationStateApproved';

export type NotificationTranslator = (
  key: NotificationMessageKey,
  values?: Record<string, string | number>,
) => string;

const stateMessages = {
  none: 'notificationStateNone',
  draft: 'notificationStateDraft',
  in_review: 'notificationStateInReview',
  needs_changes: 'notificationStateNeedsChanges',
  approved: 'notificationStateApproved',
} as const;

export function describeNotification(
  notification: AppNotification,
  t: NotificationTranslator,
): NotificationDisplay {
  const actorName = payloadString(notification, 'actorName') ?? t('notificationActor');
  const assetName = payloadString(notification, 'assetName') ?? t('notificationAsset');
  const message = payloadString(notification, 'message');
  const assetId = payloadString(notification, 'assetId');
  const commentId = payloadString(notification, 'commentId');
  const href = assetId
    ? buildLibraryAssetHref({
        assetId,
        deepLink: commentId ? { commentId, timeMs: null, endMs: null } : null,
      })
    : '/library';

  switch (notification.kind) {
    case 'review_request':
      return {
        title: t('notificationReviewRequest', { actorName, assetName }),
        detail: message,
        href,
      };
    case 'review_status_change': {
      const state = payloadString(notification, 'status');
      const status =
        payloadString(notification, 'statusLabel') ??
        (state && Object.hasOwn(stateMessages, state)
          ? t(stateMessages[state as keyof typeof stateMessages])
          : null);
      return {
        title: status
          ? t('notificationStatusChanged', { assetName, status })
          : t('notificationReviewChanged', { assetName }),
        detail: message,
        href,
      };
    }
    case 'comment_reply':
      return {
        title: t('notificationReply', { actorName, assetName }),
        detail: message ?? payloadString(notification, 'excerpt'),
        href,
      };
    case 'comment_mention':
      return {
        title: t('notificationMention', { actorName, assetName }),
        detail: message ?? payloadString(notification, 'excerpt'),
        href,
      };
    case 'asset_assigned': {
      const count = typeof notification.payload.count === 'number' ? notification.payload.count : 1;
      return {
        title:
          count > 1
            ? t('notificationAssignedMany', { actorName, count })
            : t('notificationAssignedOne', { actorName, assetName }),
        detail: payloadString(notification, 'fieldName'),
        href,
      };
    }
    case 'review_reminder':
      return {
        title: t('notificationReminder', { assetName }),
        detail: message,
        href,
      };
    case 'review_escalation':
      return {
        title: t('notificationOverdue', { assetName }),
        detail: message,
        href,
      };
  }
}
