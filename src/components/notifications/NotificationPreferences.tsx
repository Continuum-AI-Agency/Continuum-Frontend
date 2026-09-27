'use client';

// Kind × channel × frequency. A cell nobody has touched shows the default
// (DEFAULT_NOTIFICATION_FREQUENCY) — that is what the DB resolves for a missing row,
// so what this grid shows is what the delivery worker will do. Each change saves on
// its own, so a half-edited grid is never a half-saved one.

import {
  DEFAULT_NOTIFICATION_FREQUENCY,
  type NotificationChannel,
  type NotificationFrequency,
  type NotificationPreference,
} from '@continuum/contracts';
import { BellRing, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';

const KINDS: { kind: string; label: string }[] = [
  { kind: 'asset_assigned', label: 'Assigned to me' },
  { kind: 'review_request', label: 'Review requested' },
  { kind: 'review_reminder', label: 'Review reminder' },
  { kind: 'review_escalation', label: 'Review overdue' },
  { kind: 'review_status_change', label: 'Review status changed' },
  { kind: 'comment_mention', label: 'Mentioned in a comment' },
  { kind: 'comment_reply', label: 'Reply to my comment' },
];

const CHANNELS: { channel: NotificationChannel; label: string }[] = [
  { channel: 'in_app', label: 'In app' },
  { channel: 'email', label: 'Email' },
  { channel: 'slack', label: 'Slack' },
  { channel: 'web_push', label: 'Push' },
];

const FREQUENCY_LABEL: Record<NotificationFrequency, string> = {
  immediate: 'Immediately',
  hourly: 'Hourly digest',
  daily: 'Daily digest',
  never: 'Off',
};

type Grid = Map<string, NotificationFrequency>;
const cellKey = (kind: string, channel: NotificationChannel) => `${kind}:${channel}`;

export function NotificationPreferences() {
  const [grid, setGrid] = useState<Grid | null>(null);

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Loading preferences failed (${response.status})`);
        const body = (await response.json()) as { preferences: NotificationPreference[] };
        setGrid(
          new Map(body.preferences.map((row) => [cellKey(row.kind, row.channel), row.frequency])),
        );
      })
      .catch((error: unknown) => {
        setGrid(new Map());
        toast.error((error as Error).message);
      });
  }, []);

  const save = async (
    kind: string,
    channel: NotificationChannel,
    frequency: NotificationFrequency,
  ) => {
    const key = cellKey(kind, channel);
    const previous = grid?.get(key);
    setGrid((current) => new Map(current ?? []).set(key, frequency));
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: [{ kind, channel, frequency }] }),
    });
    if (!response.ok) {
      setGrid((current) => {
        const next = new Map(current ?? []);
        if (previous) next.set(key, previous);
        else next.delete(key);
        return next;
      });
      toast.error('Saving the preference failed');
    }
  };

  if (!grid) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Update</th>
              {CHANNELS.map((column) => (
                <th key={column.channel} className="px-3 py-2 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KINDS.map((row) => (
              <tr key={row.kind} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 text-xs font-medium">{row.label}</td>
                {CHANNELS.map((column) => {
                  const value =
                    grid.get(cellKey(row.kind, column.channel)) ??
                    DEFAULT_NOTIFICATION_FREQUENCY[column.channel];
                  return (
                    <td key={column.channel} className="px-3 py-1.5">
                      <Select
                        value={value}
                        onValueChange={(next) =>
                          void save(row.kind, column.channel, next as NotificationFrequency)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-8 w-36 text-xs"
                          aria-label={`${row.label} by ${column.label}`}
                        >
                          <SelectValue items={FREQUENCY_LABEL} />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FREQUENCY_LABEL) as NotificationFrequency[]).map(
                            (frequency) => (
                              <SelectItem key={frequency} value={frequency} className="text-xs">
                                {FREQUENCY_LABEL[frequency]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Slack posts go to your brand&apos;s connected ops channel. “Off” in the app column still
        keeps the update in your bell, already marked read.
      </p>
      <PushOnThisBrowser />
    </div>
  );
}

// Push needs a service worker and the VAPID public key the Backend signs with.
// Either missing means push cannot work here, and the section says so instead of
// offering a button that silently fails.
function PushOnThisBrowser() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const [state, setState] = useState<'idle' | 'working' | 'on'>('idle');

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .getRegistration('/push-sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) setState('on');
      })
      .catch(() => undefined);
  }, [supported]);

  const enable = async () => {
    if (!publicKey) return;
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked for this site');
      const registration = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // The Push API takes the VAPID key as base64url text directly.
        applicationServerKey: publicKey,
      });
      const response = await fetch('/api/notifications/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error(`Saving the subscription failed (${response.status})`);
      setState('on');
      toast.success('Push notifications are on for this browser');
    } catch (error) {
      setState('idle');
      toast.error((error as Error).message);
    }
  };

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Push on this browser</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {!supported
              ? 'This browser does not support push notifications.'
              : !publicKey
                ? 'Push is not configured for this deployment yet.'
                : state === 'on'
                  ? 'This browser receives push notifications for the updates set to Push above.'
                  : 'Turn it on, then pick Push for the updates you want here.'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!supported || !publicKey || state !== 'idle'}
          onClick={() => void enable()}
        >
          {state === 'working' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <BellRing className="size-3.5" />
          )}
          {state === 'on' ? 'Push is on' : 'Turn on push'}
        </Button>
      </div>
    </section>
  );
}
