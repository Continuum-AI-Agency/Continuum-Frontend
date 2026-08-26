'use client';

// Header bell over two feeds: work in flight right now, and the recipient's durable
// notifications. Mounted once in the dashboard header.

import { BellIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NotificationsPanel } from './NotificationsPanel';
import { useInFlightJobs } from './useInFlightJobs';
import { useNotifications } from './useNotifications';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications();
  const { activeBrandId } = useActiveBrandContext();
  const inFlight = useInFlightJobs(activeBrandId || null);
  const running = inFlight.runningCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9 active:scale-[0.96] transition-[transform]"
            aria-label={
              running > 0
                ? `${running} in flight, ${unreadCount} unread`
                : unreadCount > 0
                  ? `${unreadCount} unread notifications`
                  : 'Notifications'
            }
          >
            {/* Work in flight replaces the bell outright: a spinner is the one thing that
                reads as "still happening" without a number to interpret. */}
            {running > 0 ? (
              <Loader2Icon className="size-4 animate-spin text-amber-500" />
            ) : (
              <BellIcon className="size-4" />
            )}
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-3xs font-bold tabular-nums text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-2">
        <NotificationsPanel
          inFlight={inFlight}
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
