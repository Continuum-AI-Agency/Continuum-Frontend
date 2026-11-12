'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

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
import { subscribeThisBrowser } from '@/lib/notifications/pushSubscribe';

const getKINDS = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): { kind: string; label: string }[] => [
  { kind: 'asset_assigned', label: tUi('m_5db35296ea') },
  { kind: 'review_request', label: tUi('m_86a9586cc4') },
  { kind: 'review_reminder', label: tUi('m_b022181b6d') },
  { kind: 'review_escalation', label: tUi('m_19d4b60f74') },
  { kind: 'review_status_change', label: tUi('m_4f623e1c45') },
  { kind: 'comment_mention', label: tUi('m_1cdcaa02df') },
  { kind: 'comment_reply', label: tUi('m_66628888b1') },
];

const getCHANNELS = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): { channel: NotificationChannel; label: string }[] => [
  { channel: 'in_app', label: tUi('m_11478953f5') },
  { channel: 'email', label: tUi('m_84add5b295') },
  { channel: 'slack', label: tUi('m_430b38bf6d') },
  { channel: 'web_push', label: tUi('m_8f7f57b519') },
];

const getFREQUENCY_LABEL = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): Record<NotificationFrequency, string> => ({
  immediate: tUi('m_21b60a9549'),
  hourly: tUi('m_41cf4a8943'),
  daily: tUi('m_b0a92efc30'),
  never: tUi('m_e3de5ab0ca'),
});

type Grid = Map<string, NotificationFrequency>;
const cellKey = (kind: string, channel: NotificationChannel) => `${kind}:${channel}`;

export function NotificationPreferences() {
  const getUiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('common');
  const FREQUENCY_LABEL = getFREQUENCY_LABEL(tUi);

  const CHANNELS = getCHANNELS(tUi);

  const KINDS = getKINDS(tUi);

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
        toast.error(getUiErrorMessage(error as Error));
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
      toast.error(tUi('m_672128c9fc'));
    }
  };

  if (!grid) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {tUi('m_e41958acfe')}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">{tUi('m_fb91e24fa5')}</th>
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
                          aria-label={tUi('m_063bf82872', {
                            v0: String(row.label),
                            v1: String(column.label),
                          })}
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
      <p className="text-xs text-muted-foreground">{tUi('m_ef2bf56c6c')}</p>
      <PushOnThisBrowser />
    </div>
  );
}

// Push needs a service worker and the VAPID public key the Backend signs with.
// Either missing means push cannot work here, and the section says so instead of
// offering a button that silently fails.
function PushOnThisBrowser() {
  const getUiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('common');

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
      await subscribeThisBrowser({
        publicKey,
        requestPermission: () => Notification.requestPermission(),
        serviceWorker: navigator.serviceWorker,
        fetch: (input, init) => fetch(input, init),
      });
      setState('on');
      toast.success(tUi('m_4d3fa746ef'));
    } catch (error) {
      setState('idle');
      toast.error(getUiErrorMessage(error as Error));
    }
  };

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{tUi('m_ec73d164ea')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {!supported
              ? tUi('m_612e6c577c')
              : !publicKey
                ? tUi('m_3d310887e0')
                : state === 'on'
                  ? tUi('m_fe517537ae')
                  : tUi('m_e016f292f1')}
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
          {state === 'on' ? tUi('m_e70a874e14') : tUi('m_e96e05ed3d')}
        </Button>
      </div>
    </section>
  );
}
