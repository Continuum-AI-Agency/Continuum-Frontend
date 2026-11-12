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

import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { AddToSlackButton } from '@/components/slack/AddToSlackButton';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import {
  listChatConnections,
  revokeChatConnection,
  setPreferredChatConnection,
} from '@/lib/api/chatConnections.client';
import { slackInstallStartHref } from '@/lib/api/slackWorkspaces.client';
import {
  type ChatConnection,
  type ChatPlatform,
  orderChatConnections,
} from '@/lib/chat/connections';

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
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');
  const format = useFormatter();

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
        title: tUi('m_4fe3233066'),
        description: tUi('m_895bb82f35', {
          v0: String(PLATFORM_LABEL[connection.platform]),
          v1: String(brandName),
        }),
        variant: 'success',
      });
    } catch (error) {
      show({
        title: tUi('m_b9e7acc3b1'),
        description: error instanceof Error ? uiErrorMessage(error) : tUi('m_41848a0e55'),
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
        title: tUi('m_a8c8b8bc08'),
        description: tUi('m_3a9317b3f6', {
          v0: String(connection.displayName ?? connection.handle ?? connection.platformUserId),
        }),
        variant: 'success',
      });
    } catch (error) {
      show({
        title: tUi('m_d6328fd593'),
        description: error instanceof Error ? uiErrorMessage(error) : tUi('m_41848a0e55'),
        variant: 'error',
      });
    } finally {
      setMutatingId(null);
    }
  }

  if (state === 'loading') {
    return (
      <div role="status" aria-label={tUi('m_0ffe9dda56')} className="divide-y divide-border/60">
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
            {tUi('m_831af0a8c4')}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{tUi('m_b76b952a28')}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-3.5" />
          {tUi('m_9f5cd8a2e8')}
        </Button>
      </div>
    );
  }

  if (orderedConnections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
        <MessageSquareText className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{tUi('m_8e5a2d7d53')}</p>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
          {tUi('m_03866c61d2')}
        </p>
        <AddToSlackButton href={slackInstallStartHref(brandId)} className="mx-auto mt-4" />
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
                  {routable ? tUi('m_265b0ef759') : tUi('m_a126722ec0')}
                </Pill>
                {preferred ? (
                  <Pill variant="violet">
                    <Radio className="size-3" />
                    {tUi('m_c1d9b56abd')}
                    {brandName}
                  </Pill>
                ) : null}
              </div>
              <p className="mt-1 truncate font-mono text-2xs text-muted-foreground">
                {PLATFORM_LABEL[connection.platform]} · {connection.workspaceId}
                {tUi('m_2a7c47867f')}{' '}
                {format.relativeTime(new Date(connection.lastVerifiedAt), {
                  now: Date.now(),
                })}
              </p>
              {!routable ? (
                <p className="mt-1 text-xs leading-5 text-warning">{tUi('m_85149b7407')}</p>
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
                  {tUi('m_f6d96f7851')}
                </Button>
              ) : null}
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isMutating}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Unplug className="size-3.5" />
                      {tUi('m_0be720759f')}
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tUi('m_3b5e346a32')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {tUi('m_c416692b0d')}
                      {displayName}
                      {tUi('m_53474777ed')} {PLATFORM_LABEL[connection.platform]}
                      {tUi('m_10aa0dd5e3')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tUi('m_8c4ad0128c')}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void revoke(connection)}
                    >
                      {tUi('m_d6f480f9eb')}
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
