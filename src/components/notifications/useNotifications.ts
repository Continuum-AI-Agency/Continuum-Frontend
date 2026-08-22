'use client';

// Recipient-scoped notification feed for the header bell. Initial read goes
// through the browser Supabase client (RLS limits rows to the signed-in
// recipient), INSERTs stream in over realtime, and read-marking updates
// read_at (RLS allows recipients to update their own rows).

import type { AppNotification } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { mapNotificationRow, type NotificationRow } from '@/lib/notifications/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

const FEED_LIMIT = 30;

export type UseNotificationsResult = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAllRead: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
};

export function useNotifications(): UseNotificationsResult {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .schema('brand_profiles')
        .from('notifications')
        .select(
          'id, brand_id, recipient_user_id, actor_user_id, kind, payload, read_at, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (cancelled) return;
      if (error) {
        console.error('[notifications] initial load failed', error);
      } else {
        setNotifications(
          (data ?? []).flatMap((row) => {
            const mapped = mapNotificationRow(row);
            return mapped ? [mapped] : [];
          }),
        );
      }
      setLoading(false);
    };
    void load();

    const unsubscribe = subscribeToPostgresChanges({
      label: `notifications-${userId}`,
      bindings: [
        {
          event: 'INSERT',
          schema: 'brand_profiles',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
          onRow: (row) => {
            const mapped = mapNotificationRow(row as NotificationRow);
            if (!mapped) return;
            setNotifications((prev) =>
              prev.some((n) => n.id === mapped.id) ? prev : [mapped, ...prev].slice(0, FEED_LIMIT),
            );
          },
        },
      ],
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .schema('brand_profiles')
      .from('notifications')
      .update({ read_at: readAt })
      .eq('recipient_user_id', userId)
      .is('read_at', null);
    if (error) console.error('[notifications] mark all read failed', error);
  }, [userId]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!userId) return;
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId && !n.readAt ? { ...n, readAt } : n)),
      );
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .schema('brand_profiles')
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', notificationId)
        .is('read_at', null);
      if (error) console.error('[notifications] mark read failed', error);
    },
    [userId],
  );

  return { notifications, unreadCount, loading, markAllRead, markRead };
}
