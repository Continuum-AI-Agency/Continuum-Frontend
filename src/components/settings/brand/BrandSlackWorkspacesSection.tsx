'use client';

import type { BrandSlackWorkspace } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
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
import {
  disconnectBrandSlackWorkspace,
  listBrandSlackWorkspaces,
  slackInstallStartHref,
} from '@/lib/api/slackWorkspaces.client';

// The Slack workspaces a brand posts to. Forge channels, deliveries and optimizer pings are all
// scoped to these, each sent with that workspace's own install. Connecting and disconnecting is
// owner/admin work; everyone else on the brand sees the list read-only.

type BrandSlackWorkspacesSectionProps = {
  brandId: string;
  canManage: boolean;
};

export const brandSlackWorkspacesKey = (brandId: string) =>
  ['brand-slack-workspaces', brandId] as const;

const workspaceLabel = (workspace: BrandSlackWorkspace) => workspace.teamName ?? workspace.teamId;

export function BrandSlackWorkspacesSection({
  brandId,
  canManage,
}: BrandSlackWorkspacesSectionProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const installHref = slackInstallStartHref(brandId);

  const workspaces = useQuery({
    queryKey: brandSlackWorkspacesKey(brandId),
    queryFn: ({ signal }) => listBrandSlackWorkspaces(brandId, signal),
  });

  const disconnect = useMutation({
    mutationFn: (workspace: BrandSlackWorkspace) =>
      disconnectBrandSlackWorkspace(brandId, workspace.installationId),
    onSuccess: (_result, workspace) => {
      void queryClient.invalidateQueries({ queryKey: brandSlackWorkspacesKey(brandId) });
      show({
        title: 'Slack workspace disconnected',
        description: `This brand no longer posts to ${workspaceLabel(workspace)}.`,
        variant: 'success',
      });
    },
    onError: (error) =>
      show({
        title: 'Could not disconnect Slack',
        description: error instanceof Error ? error.message : 'Refresh and try again.',
        variant: 'error',
      }),
  });

  if (workspaces.isLoading) {
    return (
      <div role="status" aria-label="Loading Slack workspaces">
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (workspaces.isError) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4 text-warning" />
          Slack workspaces could not be loaded
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void workspaces.refetch()}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const rows = workspaces.data?.workspaces ?? [];

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center">
          <MessageSquareText className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No Slack workspace connected</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            {canManage
              ? 'Add Continuum to a Slack workspace to post renders and optimizer updates to its channels.'
              : 'Ask a brand owner or admin to add Continuum to your Slack workspace.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
          {rows.map((workspace) => {
            const active = workspace.status === 'active';
            const label = workspaceLabel(workspace);
            return (
              <li
                key={workspace.installationId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <Pill variant={active ? 'success' : 'warning'}>
                    <PillIndicator variant={active ? 'success' : 'warning'} />
                    {active ? 'Active' : 'Needs reinstall'}
                  </Pill>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    {active ? null : (
                      <a
                        href={installHref}
                        className={buttonVariants({ size: 'sm', variant: 'outline' })}
                      >
                        Reinstall
                      </a>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={disconnect.isPending}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Unplug className="size-3.5" />
                            Disconnect
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect {label}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This brand stops posting renders and optimizer updates to {label}. Its
                            Slack channels here are switched off; Continuum stays installed in the
                            workspace for any other brand using it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => disconnect.mutate(workspace)}
                          >
                            Disconnect workspace
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {canManage ? <AddToSlackButton href={installHref} /> : null}
    </div>
  );
}
