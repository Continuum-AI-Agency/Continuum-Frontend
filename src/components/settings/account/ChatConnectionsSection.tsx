'use client';

import {
  MessageSquareText,
  Radio,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import {
  listChatConnections,
  revokeChatConnection,
  setPreferredChatConnection,
} from '@/lib/api/chatConnections.client';
import {
  type ChatConnection,
  type ChatPlatform,
  orderChatConnections,
} from '@/lib/chat/connections';
import { formatRelativeTime } from '@/lib/time/relativeTime';

type LoadState = 'loading' | 'ready' | 'error';

const PLATFORM_LABEL: Record<ChatPlatform, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
};

const PLATFORM_ICON = {
  slack: MessageSquareText,
  teams: Users,
} satisfies Record<ChatPlatform, typeof MessageSquareText>;

type ChatConnectionsSectionProps = {
  brandId: string;
  brandName: string;
};

export function ChatConnectionsSection({ brandId, brandName }: ChatConnectionsSectionProps) {
  const { show } = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [connections, setConnections] = useState<ChatConnection[]>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await listChatConnections();
      setConnections(response.connections);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedConnections = useMemo(
    () => orderChatConnections(connections, brandId),
    [brandId, connections],
  );

  async function makePreferred(connection: ChatConnection) {
    setMutatingId(connection.id);
    try {
      await setPreferredChatConnection(brandId, connection.id);
      await load();
      show({
        title: 'Chat route updated',
        description: `${PLATFORM_LABEL[connection.platform]} is preferred for ${brandName}.`,
        variant: 'success',
      });
    } catch (error) {
      show({
        title: 'Could not update chat route',
        description: error instanceof Error ? error.message : 'Refresh and try again.',
        variant: 'error',
      });
    } finally {
      setMutatingId(null);
    }
  }

  async function revoke(connection: ChatConnection) {
    setMutatingId(connection.id);
    try {
      await revokeChatConnection(connection.id);
      await load();
      show({
        title: 'Chat connection revoked',
        description: `${
          connection.displayName ?? connection.handle ?? connection.platformUserId
        } can no longer receive Continuum requests.`,
        variant: 'success',
      });
    } catch (error) {
      show({
        title: 'Could not revoke connection',
        description: error instanceof Error ? error.message : 'Refresh and try again.',
        variant: 'error',
      });
    } finally {
      setMutatingId(null);
    }
  }

  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label="Loading chat connections"
        className="divide-y divide-border/60"
      >
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center gap-3 py-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2.5 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-warning" />
            Chat routes could not be loaded
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Goal requests still remain available in Continuum.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (orderedConnections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
        <MessageSquareText className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No chat identity linked</p>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
          Sign in to Continuum from Slack or Microsoft Teams to link your identity. Until then,
          teammate requests stay available in the Goal case file.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border/70">
      {orderedConnections.map((connection) => {
        const Icon = PLATFORM_ICON[connection.platform];
        const preferred = connection.preferredBrandIds.includes(brandId);
        const routable = connection.status === 'active' && Boolean(connection.destination);
        const displayName =
          connection.displayName ?? connection.handle ?? connection.platformUserId;
        const isMutating = mutatingId === connection.id;
        return (
          <div
            key={connection.id}
            className="grid gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/30">
              <Icon className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <Pill variant={routable ? 'success' : 'warning'}>
                  <PillIndicator variant={routable ? 'success' : 'warning'} />
                  {routable ? 'Routable' : 'Needs attention'}
                </Pill>
                {preferred ? (
                  <Pill variant="violet">
                    <Radio className="size-3" />
                    Preferred for {brandName}
                  </Pill>
                ) : null}
              </div>
              <p className="mt-1 truncate font-mono text-2xs text-muted-foreground">
                {PLATFORM_LABEL[connection.platform]} · {connection.workspaceId} · verified{' '}
                {formatRelativeTime(connection.lastVerifiedAt)}
              </p>
              {!routable ? (
                <p className="mt-1 text-xs leading-5 text-warning">
                  Reopen Continuum from this workspace to restore a reply destination.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              {!preferred ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!routable || isMutating}
                  onClick={() => void makePreferred(connection)}
                >
                  <ShieldCheck className="size-3.5" />
                  Use for this brand
                </Button>
              ) : null}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isMutating}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Unplug className="size-3.5" />
                    Revoke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke this chat identity?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Continuum will stop routing Goal requests to {displayName} on{' '}
                      {PLATFORM_LABEL[connection.platform]}. Requests will remain available in-app.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep connection</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void revoke(connection)}
                    >
                      Revoke connection
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        );
      })}
    </div>
  );
}
