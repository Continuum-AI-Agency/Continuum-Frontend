'use client';

import type { ApiRenderDeliveryDestination, RenderApprovalDestination } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import { slackInstallStartHref } from '@/lib/api/slackWorkspaces.client';
import { fetchApprovalDestinations } from '@/lib/library/renderApprovals';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { settingsSlackCopy } from './settingsSlackCopy';

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
  const tUi = useTranslations('settings');
  const formatUiError = useUiErrorMessage();

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
        title: tUi('m_c02a1fad73'),
        description: tUi('m_0eba86740e', { v0: String(room.channelName) }),
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
        title: tUi('m_b1be6de5a2'),
        description: describeSlackFailure(error, (source) =>
          settingsSlackCopy(source, tUi, formatUiError(error)),
        ),
        variant: 'error',
      });
    },
  });

  if (rooms.isLoading) {
    return (
      <div role="status" aria-label={tUi('m_e048967980')}>
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (rooms.isError) {
    return isSlackDeliveryUnavailable(rooms.error) ? (
      <p className="text-sm text-muted-foreground">{tUi('m_2d2c33c0b2')}</p>
    ) : (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4 text-warning" />
          {tUi('m_de827fce97')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void rooms.refetch()}>
          <RefreshCw className="size-3.5" />
          {tUi('m_9f5cd8a2e8')}
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
          <p className="mt-2 text-sm font-medium">{tUi('m_7d28e9870a')}</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            {slack?.state !== 'ready'
              ? tUi('m_5907bbfaab')
              : canManage
                ? tUi('m_496622068e')
                : tUi('m_2161157fe1')}
          </p>
        </div>
      ) : (
        <ul
          aria-label={tUi('m_600ba8d6dd')}
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
                    <Pill
                      variant={ROLE_TONE[room.role]}
                      title={settingsSlackCopy(ROLE_PURPOSE[room.role], tUi, formatUiError(null))}
                    >
                      {settingsSlackCopy(ROLE_LABEL[room.role], tUi, formatUiError(null))}
                    </Pill>
                    <span className="truncate text-xs text-muted-foreground">
                      {room.workspaceName ?? slack?.workspaceName ?? tUi('m_e3a4299475')}
                    </span>
                    <span
                      className={cn(
                        'text-xs',
                        active === 0 ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {active === undefined
                        ? tUi('m_176f7c9829')
                        : tUi('m_141d1c72f7', { count: active })}
                      {requested ? tUi('m_8c1cff1fbe', { count: requested }) : ''}
                    </span>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-expanded={open}
                        aria-label={tUi('m_7f2c4a5bfe', { v0: String(label) })}
                        onClick={() => setManaging(open ? null : room.id)}
                      >
                        {tUi('m_d7a73bc122')}
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
                              aria-label={tUi('m_518b3be2f7', { v0: String(label) })}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Unplug className="size-3.5" />
                              {tUi('m_c9714c15af')}
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {tUi('m_7184b7d5c2')}
                              {label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {tUi('m_3cd1180d48')}
                              {label}
                              {tUi('m_37021626b0')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          {refusal && retiring === room.id ? (
                            <p role="alert" className="text-sm text-warning">
                              {refusal.count === null
                                ? tUi('m_ed7f193568', { v0: String(label) })
                                : tUi('pendingApprovals', { count: refusal.count, room: label })}
                            </p>
                          ) : null}
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tUi('m_d9f3692497')}</AlertDialogCancel>
                            {refusal && retiring === room.id ? null : (
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={retire.isPending}
                                onClick={() => retire.mutate(room)}
                              >
                                {tUi('m_bb288ff52b')}
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
                      {label}
                      {tUi('m_cb3b022e55')}
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
            show({ title: tUi('m_f0c468b783'), variant: 'success' });
          }}
        />
      ) : slack?.state === 'ready' ? (
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          {tUi('m_1eb3ad1e48')}
        </Button>
      ) : (
        <a href={installHref} className={buttonVariants({ size: 'sm' })}>
          {slack?.state === 'not_installed' ? tUi('m_584473dc4c') : tUi('m_cc7f4b66f4')}
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
  const tUi = useTranslations('settings');
  const uiLocale = useLocale();

  const steps = [
    {
      key: 'workspace',
      state: workspaceConnected ? 'done' : 'missing',
      label: workspaceConnected ? tUi('m_09b9dc447c') : tUi('m_b68fe586db'),
      missing: tUi('m_b8aa44f1cd'),
      href: installHref,
    },
    {
      key: 'room',
      state: rooms > 0 ? 'done' : 'missing',
      label: rooms > 0 ? tUi('slackRoomCount', { count: rooms }) : tUi('m_f123b89ca4'),
      missing: tUi('m_5d6eb3e04e'),
      onClick: canManage && workspaceConnected ? onAddRoom : undefined,
    },
    {
      key: 'approver',
      state: activeApprovers === null ? 'unknown' : activeApprovers > 0 ? 'done' : 'missing',
      label:
        activeApprovers === null
          ? tUi('m_7a687d57af')
          : activeApprovers > 0
            ? tUi('m_8a90a53f18', { count: activeApprovers })
            : tUi('m_fee9ddde6a'),
      missing: tUi('m_47a2ef2fef'),
      onClick: canManage && rooms > 0 ? onManageApprovers : undefined,
    },
  ] as const;
  const missing = steps.filter((step) => step.state === 'missing');
  const unknown = steps.some((step) => step.state === 'unknown');

  return (
    <div className="space-y-2">
      <ul aria-label={tUi('m_703dd863d3')} className="flex flex-wrap items-center gap-2">
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
          ? tUi('m_2a3ebbbd8e', {
              v0: new Intl.ListFormat(uiLocale, { type: 'conjunction' }).format(
                missing.map((step) => step.missing),
              ),
            })
          : unknown
            ? tUi('m_bb38899b5d')
            : tUi('m_ec561cf401')}
      </p>
    </div>
  );
}
