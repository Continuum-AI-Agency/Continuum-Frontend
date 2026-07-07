'use client';

import {
  type McpClientRegistration,
  type McpConnectionsResponse,
  mcpConnectionsResponseSchema,
} from '@continuum/contracts';
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

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

export function McpConnectionsSection() {
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
    return <p className="text-sm text-muted-foreground">Loading connected apps…</p>;
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">Could not load connected apps.</p>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No connectors linked yet. Add the Continuum connector in Claude and authorize it to see it
        here.
      </p>
    );
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
                <Pill variant={STATUS_PILL[connection.status]}>{connection.status}</Pill>
              </div>
              <span className="text-xs text-muted-foreground">
                Authorized {formatTimestamp(connection.authorized_at)}
                {connection.last_seen_at
                  ? ` · last active ${formatTimestamp(connection.last_seen_at)}`
                  : ''}
              </span>
            </div>
            {connection.status !== 'revoked' ? (
              <Button
                variant="destructive"
                disabled={revokingId === connection.id}
                onClick={() => void revoke(connection.id)}
              >
                {revokingId === connection.id ? 'Revoking…' : 'Revoke'}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
