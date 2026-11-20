'use client';

import {
  type McpClientRegistration,
  type McpConnectionsResponse,
  mcpConnectionsResponseSchema,
} from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { http } from '@/lib/api/http';

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_PILL: Record<McpClientRegistration['status'], 'success' | 'warning' | 'muted'> = {
  connected: 'success',
  pending: 'warning',
  revoked: 'muted',
};

function formatTimestamp(value: string | null, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale);
}

export function McpConnectionsSection() {
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

  const [state, setState] = useState<LoadState>('loading');
  const [connections, setConnections] = useState<McpClientRegistration[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await http.request<McpConnectionsResponse>({
        path: '/mcp/connections',
        schema: mcpConnectionsResponseSchema,
      });
      setConnections(data.connections);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (id: string) => {
      setRevokingId(id);
      try {
        await http.request({ path: `/mcp/connections/${id}/revoke`, method: 'POST' });
        await load();
      } catch {
        setState('error');
      } finally {
        setRevokingId(null);
      }
    },
    [load],
  );

  if (state === 'loading') {
    return <p className="text-sm text-muted-foreground">{tUi('m_f569abc27d')}</p>;
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{tUi('m_6dc12425f2')}</p>
        <Button variant="secondary" onClick={() => void load()}>
          {tUi('m_9f5cd8a2e8')}
        </Button>
      </div>
    );
  }

  if (connections.length === 0) {
    return <p className="text-sm text-muted-foreground">{tUi('m_555af0f778')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {connections.map((connection) => (
        <div key={connection.id} className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {connection.client_name ?? connection.client_id}
                </span>
                <Pill variant={STATUS_PILL[connection.status]}>
                  {tUi(
                    (
                      {
                        connected: 'connectionConnected',
                        pending: 'connectionPending',
                        revoked: 'connectionRevoked',
                      } as const
                    )[connection.status],
                  )}
                </Pill>
              </div>
              <span className="text-xs text-muted-foreground">
                {tUi('m_6cdacb668f')}
                {formatTimestamp(connection.authorized_at, uiLocale)}
                {connection.last_seen_at
                  ? tUi('m_1469128f48', {
                      v0: String(formatTimestamp(connection.last_seen_at, uiLocale)),
                    })
                  : ''}
              </span>
            </div>
            {connection.status !== 'revoked' ? (
              <Button
                variant="destructive"
                disabled={revokingId === connection.id}
                onClick={() => void revoke(connection.id)}
              >
                {revokingId === connection.id ? tUi('m_2c8a0ed41d') : tUi('m_0be720759f')}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
