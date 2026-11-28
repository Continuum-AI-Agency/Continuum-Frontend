'use client';
import { useLocale, useTranslations } from 'next-intl';

// Notification list for the header bell: icon by kind, actor + asset from the
// payload, relative time, unread dot. Clicking a row marks it read and follows
// its href (review pings land on /library).

import type { AppNotification } from '@continuum/contracts';
import {
  AlarmClock,
  AtSign,
  BadgeCheck,
  CheckCheck,
  CircleCheck,
  Eye,
  MessageSquareReply,
  Siren,
  UserCheck,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { describeNotification } from '@/lib/notifications/notifications';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { InFlightSection } from './InFlightSection';
import type { UseInFlightJobsResult } from './useInFlightJobs';

const KIND_ICONS = {
  review_request: Eye,
  review_status_change: CircleCheck,
  comment_reply: MessageSquareReply,
  comment_mention: AtSign,
  asset_assigned: UserCheck,
  review_reminder: AlarmClock,
  review_escalation: Siren,
  prepayment_claimed: BadgeCheck,
} satisfies Record<AppNotification['kind'], typeof Eye>;

export type NotificationsPanelProps = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  onMarkAllRead: () => void;
  onMarkRead: (notificationId: string) => void;
  onNavigate?: () => void;
  /** Live work. Omitted in tests that only exercise the durable feed. */
  inFlight?: UseInFlightJobsResult;
};

export function NotificationsPanel({
  notifications,
  unreadCount,
  loading,
  onMarkAllRead,
  onMarkRead,
  onNavigate,
  inFlight,
}: NotificationsPanelProps) {
  const t = useTranslations('common');
  const router = useRouter();

  const handleRowClick = (notification: AppNotification) => {
    if (!notification.readAt) onMarkRead(notification.id);
    const { href } = describeNotification(notification, t);
    if (href) {
      onNavigate?.();
      // The Library opens the asset and comment its URL names when it mounts; already on
      // /library, a client push would change the URL and leave the old view open.
      if (href.startsWith('/library') && window.location.pathname === '/library') {
        window.location.assign(href);
      } else {
        router.push(href);
      }
    }
  };

  return (
    <div>
      {inFlight && <InFlightSection feed={inFlight} onNavigate={onNavigate} />}

      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('notificationsTitle')}
        </p>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="size-3" />
            {t('notificationsMarkAll')}
          </Button>
        )}
      </div>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          {t('loading_ba3bbbe')}
        </p>
      ) : notifications.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          {t('notificationsEmpty')}
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
  const t = useTranslations('common');
  const locale = useLocale();
  const { title, detail } = describeNotification(notification, t);
  const Icon = KIND_ICONS[notification.kind];
  const unread = !notification.readAt;

  return (
    <button
      data-notification-id={notification.id}
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
            {formatRelativeTime(notification.createdAt, undefined, locale)}
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
