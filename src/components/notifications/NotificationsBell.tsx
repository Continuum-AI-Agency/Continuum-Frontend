'use client';

// Header bell with an unread badge over the recipient's notification feed.
// Mounted once in the dashboard header; visual language mirrors ReportJobsBell.

import { BellIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NotificationsPanel } from './NotificationsPanel';
import { useNotifications } from './useNotifications';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 active:scale-[0.96] transition-[transform]"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-3xs font-bold tabular-nums text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <NotificationsPanel
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          onMarkAllRead={() => void markAllRead()}
          onMarkRead={(notificationId) => void markRead(notificationId)}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
