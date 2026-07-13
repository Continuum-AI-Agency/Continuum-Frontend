'use client';

// Notification list for the header bell: icon by kind, actor + asset from the
// payload, relative time, unread dot. Clicking a row marks it read and follows
// its href (review pings land on /library).

import type { AppNotification } from '@continuum/contracts';
import {
  AtSignIcon,
  CheckCheckIcon,
  CircleCheckBigIcon,
  EyeIcon,
  MessageSquareReplyIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { describeNotification } from '@/lib/notifications/notifications';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

const KIND_ICONS = {
  review_request: EyeIcon,
  review_status_change: CircleCheckBigIcon,
  comment_reply: MessageSquareReplyIcon,
  comment_mention: AtSignIcon,
} satisfies Record<AppNotification['kind'], typeof EyeIcon>;

export type NotificationsPanelProps = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  onMarkAllRead: () => void;
  onMarkRead: (notificationId: string) => void;
  onNavigate?: () => void;
};

export function NotificationsPanel({
  notifications,
  unreadCount,
  loading,
  onMarkAllRead,
  onMarkRead,
  onNavigate,
}: NotificationsPanelProps) {
  const router = useRouter();

  const handleRowClick = (notification: AppNotification) => {
    if (!notification.readAt) onMarkRead(notification.id);
    const { href } = describeNotification(notification);
    if (href) {
      onNavigate?.();
      router.push(href);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications
        </p>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={onMarkAllRead}
          >
            <CheckCheckIcon className="size-3" />
            Mark all read
          </Button>
        )}
      </div>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing yet. Review pings and replies land here.
        </p>
      ) : (
        <div className="max-h-80 space-y-0.5 overflow-y-auto">
          {notifications.map((notification) => (
            <NotificationRowItem
              key={notification.id}
              notification={notification}
              onClick={() => handleRowClick(notification)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRowItem({
  notification,
  onClick,
}: {
  notification: AppNotification;
  onClick: () => void;
}) {
  const { title, detail } = describeNotification(notification);
  const Icon = KIND_ICONS[notification.kind];
  const unread = !notification.readAt;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', unread ? 'text-primary' : 'text-muted-foreground')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('text-xs', unread ? 'font-medium' : 'text-muted-foreground')}>
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      )}
    </button>
  );
}
