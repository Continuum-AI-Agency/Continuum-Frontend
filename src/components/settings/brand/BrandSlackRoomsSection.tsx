'use client';

import type { ApiRenderDeliveryDestination, RenderApprovalDestination } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { useState } from 'react';
import { AddSlackRoom } from '@/components/forge/AddSlackRoom';
import {
  approvalDestinationsKey,
  DestinationApproversPanel,
} from '@/components/forge/DestinationApproversPanel';
import {
  describeSlackFailure,
  isSlackDeliveryUnavailable,
  ROLE_LABEL,
  type SlackRoomRole,
} from '@/components/forge/slackRoomCopy';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { ApiError } from '@/lib/api/errors';
import { slackInstallStartHref } from '@/lib/api/slackWorkspaces.client';
import { fetchApprovalDestinations } from '@/lib/library/renderApprovals';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// The rooms this brand's Slack workspaces receive: one channel per row, what it is for, and who
// may approve a creative in it. This is the brand admin's own surface — before it existed, a room
// could only be created inside the Forge review tray and never retired at all.
//
// Two reads, both already on the wire: the destinations endpoint owns the rooms (role, channel,
// workspace, whether the workspace is still installed) and the approval-destinations endpoint owns
// who can decide in each. They are joined on the room id, so the counts here and the counts Forge
// shows are the same number — and activating an approver in the panel below invalidates the key
// Forge reads, so neither surface goes stale behind the other.

type BrandSlackRoomsSectionProps = {
  brandId: string;
  canManage: boolean;
};

/** The rooms read. `approvalDestinationsKey` (shared with Forge) owns the approver counts. */
export const brandSlackRoomsKey = (brandId: string) => ['brand-slack-rooms', brandId] as const;

/** Settings can set up the alerts room too; Forge only offers the two a render goes to. */
const SETTINGS_ROLES: readonly SlackRoomRole[] = ['ops', 'client', 'alerts'];

const ROLE_TONE: Record<ApiRenderDeliveryDestination['role'], 'muted' | 'violet' | 'warning'> = {
  ops: 'muted',
  client: 'violet',
  alerts: 'warning',
  dm: 'muted',
};

const ROLE_PURPOSE: Record<ApiRenderDeliveryDestination['role'], string> = {
  ops: 'Every finished render',
  client: 'Renders that passed their check',
  alerts: 'Delivery problems and unanswered approvals',
  dm: 'A direct message, not a channel',
};

const approverCount = (count: number) =>
  count ? `${count} approver${count === 1 ? '' : 's'}` : 'no approvers yet';

const PENDING_CODE = 'chat_destination_has_pending_approvals';

/** A readiness pill is the control that fixes it, so it needs a visible keyboard focus of its own. */
const STEP_FOCUS =
  'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * The refusal that says this room is the last one holding pending approvals, with the count the
 * Backend named. Null for every other failure — those are toasted, not argued with in the dialog.
 */
function pendingApprovalRefusal(error: unknown): { count: number | null } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (!`${error.code ?? ''} ${error.message}`.includes(PENDING_CODE)) return null;
  const count = error.payload?.pendingApprovals;
  return { count: typeof count === 'number' ? count : null };
}

export function BrandSlackRoomsSection({ brandId, canManage }: BrandSlackRoomsSectionProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ count: number | null } | null>(null);

  const rooms = useQuery({
    queryKey: brandSlackRoomsKey(brandId),
    queryFn: () => apiRendersApi.listDeliveryDestinations(brandId),
    retry: false,
  });
  // The approver counts, and the room objects the approvers panel takes. Read separately from the
  // rooms even though the rooms response carries the same counts, because THIS key is the one the
  // panel invalidates — activating someone moves the count beside them without a manual refresh.
  // Soft on purpose: a failure here falls back to the counts on the room row, never hides a room.
  const approvals = useQuery({
    queryKey: approvalDestinationsKey(brandId),
    queryFn: () => fetchApprovalDestinations(brandId),
    retry: false,
  });

  const refreshRooms = () => {
    void queryClient.invalidateQueries({ queryKey: brandSlackRoomsKey(brandId) });
    void queryClient.invalidateQueries({ queryKey: approvalDestinationsKey(brandId) });
  };

  const retire = useMutation({
    mutationFn: (room: ApiRenderDeliveryDestination) =>
      apiRendersApi.retireDeliveryDestination(room.id),
    onSuccess: (_result, room) => {
      setRetiring(null);
      setRefusal(null);
      refreshRooms();
      show({
        title: 'Room retired',
        description: `Nothing new is posted to #${room.channelName}. Everything already delivered there stays.`,
        variant: 'success',
      });
    },
    onError: (error) => {
      const pending = pendingApprovalRefusal(error);
      // The dialog stays open on this one: it is the only place that can explain the refusal.
      if (pending) {
        setRefusal(pending);
        return;
      }
      setRetiring(null);
      show({
        title: 'Could not retire that room',
        description: describeSlackFailure(error),
        variant: 'error',
      });
    },
  });

  if (rooms.isLoading) {
    return (
      <div role="status" aria-label="Loading Slack rooms">
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (rooms.isError) {
    return isSlackDeliveryUnavailable(rooms.error) ? (
      <p className="text-sm text-muted-foreground">
        Slack delivery isn’t switched on for this workspace yet. Renders still go to the Library.
      </p>
    ) : (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4 text-warning" />
          Slack rooms could not be loaded
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void rooms.refetch()}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const slack = rooms.data?.slack;
  const rows = slack?.destinations ?? [];
  const approvalRooms = new Map<string, RenderApprovalDestination>(
    (approvals.data?.destinations ?? []).map((destination) => [destination.id, destination]),
  );
  // Undefined, not zero, when neither read could say — "nobody can approve" is a call to action
  // and must not be printed over a failed read.
  const approverCounts = (room: ApiRenderDeliveryDestination) => {
    const joined = approvalRooms.get(room.id);
    return {
      active: joined?.activeApprovers ?? room.activeApprovers,
      requested: joined?.requestedApprovers ?? room.requestedApprovers,
    };
  };
  const counted = rows.map((room) => approverCounts(room).active);
  const activeApprovers = counted.some((count) => count === undefined)
    ? null
    : counted.reduce<number>((total, count) => total + (count ?? 0), 0);
  const installHref = slackInstallStartHref(brandId);

  return (
    <div className="space-y-3">
      <SlackReadiness
        workspaceConnected={slack?.state === 'ready'}
        rooms={rows.length}
        activeApprovers={activeApprovers}
        installHref={installHref}
        canManage={canManage}
        onAddRoom={() => setAdding(true)}
        onManageApprovers={() => setManaging(rows[0]?.id ?? null)}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center">
          <Hash className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No Slack room yet</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            {slack?.state !== 'ready'
              ? 'Connect a Slack workspace to this brand first — rooms are its channels.'
              : canManage
                ? 'Add the channel your team watches as an Ops room, and the one your client reads as a Client room. Finished renders post to Ops immediately; a Client room only gets a render that passed its check.'
                : 'Ask a brand owner, admin or operator to add the channel finished renders should post to.'}
          </p>
        </div>
      ) : (
        <ul
          aria-label="Slack rooms"
          className="divide-y divide-border/60 rounded-lg border border-border/70"
        >
          {rows.map((room) => {
            const approvalRoom = approvalRooms.get(room.id);
            const { active, requested } = approverCounts(room);
            const label = `#${room.channelName}`;
            const open = managing === room.id;
            return (
              <li key={room.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{label}</p>
                    <Pill variant={ROLE_TONE[room.role]} title={ROLE_PURPOSE[room.role]}>
                      {ROLE_LABEL[room.role]}
                    </Pill>
                    <span className="truncate text-xs text-muted-foreground">
                      {room.workspaceName ?? slack?.workspaceName ?? 'Workspace unnamed'}
                    </span>
                    <span
                      className={cn(
                        'text-xs',
                        active === 0 ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {active === undefined ? 'approvers unknown' : approverCount(active)}
                      {requested ? ` · ${requested} asking` : ''}
                    </span>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-expanded={open}
                        aria-label={`Manage approvers for ${label}`}
                        onClick={() => setManaging(open ? null : room.id)}
                      >
                        Manage approvers
                      </Button>
                      <AlertDialog
                        open={retiring === room.id}
                        onOpenChange={(next) => {
                          setRetiring(next ? room.id : null);
                          setRefusal(null);
                        }}
                      >
                        <AlertDialogTrigger
                          render={
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label={`Retire ${label}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Unplug className="size-3.5" />
                              Retire
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Retire {label}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Nothing new is posted to {label} and nobody approves there any more.
                              Everything already delivered stays, and you can add the channel back
                              later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          {refusal && retiring === room.id ? (
                            <p role="alert" className="text-sm text-warning">
                              {refusal.count === null
                                ? `Approvals are still pending in ${label}, and it is the only room left that can decide them. Decide them first, or add another room.`
                                : `${refusal.count} approval${refusal.count === 1 ? '' : 's'} ${
                                    refusal.count === 1 ? 'is' : 'are'
                                  } still pending in ${label}, and it is the only room left that can decide ${
                                    refusal.count === 1 ? 'it' : 'them'
                                  }. Decide ${
                                    refusal.count === 1 ? 'it' : 'them'
                                  } first, or add another room.`}
                            </p>
                          ) : null}
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            {refusal && retiring === room.id ? null : (
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={retire.isPending}
                                onClick={() => retire.mutate(room)}
                              >
                                Retire room
                              </AlertDialogAction>
                            )}
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </div>
                {open ? (
                  approvalRoom ? (
                    <DestinationApproversPanel brandId={brandId} destination={approvalRoom} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {label} can’t take approvals — only channel rooms can, and this one is
                      addressed directly.
                    </p>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!canManage ? null : adding ? (
        <AddSlackRoom
          brandId={brandId}
          roles={SETTINGS_ROLES}
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refreshRooms();
            show({ title: 'Slack room added', variant: 'success' });
          }}
        />
      ) : slack?.state === 'ready' ? (
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden /> Add a room
        </Button>
      ) : (
        <a href={installHref} className={buttonVariants({ size: 'sm' })}>
          {slack?.state === 'not_installed' ? 'Reinstall Slack' : 'Connect Slack'}
        </a>
      )}
    </div>
  );
}

/**
 * What is still missing before a render or an approval can reach Slack, each step linking to the
 * control that fixes it. No endpoint of its own: a connected workspace is `slack.state`, a room is
 * the list length, and an approver is the sum of the rooms' active approvers.
 */
function SlackReadiness({
  workspaceConnected,
  rooms,
  activeApprovers,
  installHref,
  canManage,
  onAddRoom,
  onManageApprovers,
}: {
  workspaceConnected: boolean;
  rooms: number;
  /** Null when the approver read failed — unknown is not the same as zero. */
  activeApprovers: number | null;
  installHref: string;
  canManage: boolean;
  onAddRoom: () => void;
  onManageApprovers: () => void;
}) {
  const steps = [
    {
      key: 'workspace',
      state: workspaceConnected ? 'done' : 'missing',
      label: workspaceConnected ? 'Workspace connected' : 'Connect a Slack workspace',
      missing: 'connect a Slack workspace',
      href: installHref,
    },
    {
      key: 'room',
      state: rooms > 0 ? 'done' : 'missing',
      label: rooms > 0 ? `${rooms} room${rooms === 1 ? '' : 's'}` : 'Add the first room',
      missing: 'add a room',
      onClick: canManage && workspaceConnected ? onAddRoom : undefined,
    },
    {
      key: 'approver',
      state: activeApprovers === null ? 'unknown' : activeApprovers > 0 ? 'done' : 'missing',
      label:
        activeApprovers === null
          ? 'Approvers unknown'
          : activeApprovers > 0
            ? `${activeApprovers} can approve`
            : 'Activate an approver',
      missing: 'activate someone who can approve',
      onClick: canManage && rooms > 0 ? onManageApprovers : undefined,
    },
  ] as const;
  const missing = steps.filter((step) => step.state === 'missing');
  const unknown = steps.some((step) => step.state === 'unknown');

  return (
    <div className="space-y-2">
      <ul aria-label="Slack readiness" className="flex flex-wrap items-center gap-2">
        {steps.map((step) => {
          const pill = (
            <Pill
              variant={
                step.state === 'done' ? 'success' : step.state === 'unknown' ? 'muted' : 'warning'
              }
            >
              <PillIndicator
                variant={
                  step.state === 'done' ? 'success' : step.state === 'unknown' ? 'info' : 'warning'
                }
              />
              {step.label}
            </Pill>
          );
          if (step.state !== 'missing') return <li key={step.key}>{pill}</li>;
          return (
            <li key={step.key}>
              {'href' in step ? (
                <a href={step.href} className={STEP_FOCUS}>
                  {pill}
                </a>
              ) : step.onClick ? (
                <button type="button" className={STEP_FOCUS} onClick={step.onClick}>
                  {pill}
                </button>
              ) : (
                pill
              )}
            </li>
          );
        })}
      </ul>
      {/* Never claims a readiness it could not read: an unknown approver count is said out loud. */}
      <p role="status" className="text-xs text-muted-foreground">
        {missing.length
          ? `Before renders and approvals can reach Slack: ${missing
              .map((step) => step.missing)
              .join(', then ')}.`
          : unknown
            ? 'Renders can reach Slack. Who may approve there could not be read — retry to check.'
            : 'Renders and approvals can reach Slack.'}
      </p>
    </div>
  );
}
