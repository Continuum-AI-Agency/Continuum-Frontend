// brand_profiles.notifications helpers for the bell UI: DB row → contract
// mapping and per-kind display strings. Pure — unit tested with bun.

import { type AppNotification, appNotificationSchema } from '@continuum/contracts';

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

// Deep-linking to the specific asset is a documented follow-up; every kind
// currently lands on /library.
export function describeNotification(notification: AppNotification): NotificationDisplay {
  const actorName = payloadString(notification, 'actorName') ?? 'A teammate';
  const assetName = payloadString(notification, 'assetName') ?? 'a creative';
  const message = payloadString(notification, 'message');

  switch (notification.kind) {
    case 'review_request':
      return {
        title: `${actorName} asked you to review “${assetName}”`,
        detail: message,
        href: '/library',
      };
    case 'review_status_change': {
      const status = payloadString(notification, 'status');
      return {
        title: status
          ? `“${assetName}” moved to ${status.replaceAll('_', ' ')}`
          : `“${assetName}” review status changed`,
        detail: message,
        href: '/library',
      };
    }
    case 'comment_reply':
      return {
        title: `${actorName} replied on “${assetName}”`,
        detail: message,
        href: '/library',
      };
    case 'comment_mention':
      return {
        title: `${actorName} mentioned you on “${assetName}”`,
        detail: message,
        href: '/library',
      };
  }
}
