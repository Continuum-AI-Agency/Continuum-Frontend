'use client';

import type {
  AddDestinationApproverRequest,
  DestinationApprover,
  RenderApprovalDestination,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { Button } from '@/components/ui/button';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import {
  activateDestinationApprover,
  addDestinationApprover,
  fetchDestinationApprovers,
  revokeDestinationApprover,
} from '@/lib/library/renderApprovals';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Who may decide a Forge approval package in one room. A decision counts only from an ACTIVE
// approver. `requested` is the normal way a client approver arrives — they press "Request
// approver access" on the package header in their own room — so those rows lead, and activating
// one is a single click. Revoked people stay listed so a removal is visible and reversible.

/** Every approval-room read for a brand. Invalidating it refreshes the rooms' counts and their lists. */
export const approvalDestinationsKey = (brandId: string) =>
  [...forgeQueryKeys.brand(brandId), 'approval-destinations'] as const;

const approversKey = (brandId: string, destinationId: string) =>
  [...approvalDestinationsKey(brandId), destinationId, 'approvers'] as const;

const PLATFORM_ID_LABEL: Record<RenderApprovalDestination['platform'], string> = {
  slack: 'Slack member id',
  whatsapp: 'WhatsApp number or id',
};

type AddMode = 'member' | 'platform';

export function DestinationApproversPanel({
  brandId,
  destination,
}: {
  brandId: string;
  destination: RenderApprovalDestination;
}) {
  const queryClient = useQueryClient();
  const listKey = approversKey(brandId, destination.id);
  const approversQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchDestinationApprovers(destination.id),
    staleTime: FORGE_STALE_MS.active,
    retry: false,
  });
  const membersQuery = useQuery({
    queryKey: [...forgeQueryKeys.brand(brandId), 'members'],
    queryFn: () => fetchBrandAuthors(createSupabaseBrowserClient(), brandId),
    staleTime: FORGE_STALE_MS.lists,
    retry: false,
  });
  const members = membersQuery.data ?? new Map<string, { email: string | null }>();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const settle = (approver: DestinationApprover) => {
    queryClient.setQueryData<DestinationApprover[]>(listKey, (current = []) =>
      current.some((item) => item.id === approver.id)
        ? current.map((item) => (item.id === approver.id ? approver : item))
        : [...current, approver],
    );
    // Not awaited: the row above is already right, and the room counts can follow.
    void queryClient.invalidateQueries({ queryKey: approvalDestinationsKey(brandId) });
  };

  const run = async (busy: string, write: () => Promise<DestinationApprover>) => {
    setBusyId(busy);
    setProblem(null);
    try {
      settle(await write());
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That change did not go through.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (approver: DestinationApprover) =>
    approver.displayName ??
    (approver.userId ? members.get(approver.userId)?.email : null) ??
    approver.platformUserId ??
    'Unknown person';

  const approvers = approversQuery.data ?? [];
  const byStatus = (status: DestinationApprover['status']) =>
    approvers.filter((approver) => approver.status === status);
  const requested = byStatus('requested');
  const active = byStatus('active');
  const revoked = byStatus('revoked');

  const row = (approver: DestinationApprover, action: 'activate' | 'revoke') => {
    const name = nameOf(approver);
    const detail =
      approver.platformUserId && approver.platformUserId !== name ? approver.platformUserId : null;
    return (
      <li key={approver.id} className="flex items-center gap-2 py-1">
        <span className="min-w-0 flex-1 truncate">
          {name}
          {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
        </span>
        <Button
          type="button"
          size="xs"
          variant={action === 'activate' && approver.status === 'requested' ? 'default' : 'outline'}
          disabled={busyId !== null}
          aria-label={`${action === 'activate' ? 'Activate' : 'Revoke'} ${name}`}
          onClick={() =>
            void run(approver.id, () =>
              (action === 'activate' ? activateDestinationApprover : revokeDestinationApprover)(
                destination.id,
                approver.id,
              ),
            )
          }
        >
          {busyId === approver.id ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
          ) : null}
          {action === 'activate' ? 'Activate' : 'Revoke'}
        </Button>
      </li>
    );
  };

  return (
    <fieldset
      aria-label={`Approvers for ${destination.name}`}
      className="space-y-2 rounded-md border bg-muted/20 p-2 text-xs"
    >
      {approversQuery.isPending ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Loading approvers…
        </p>
      ) : approversQuery.isError ? (
        <p className="text-destructive">Couldn’t load approvers: {approversQuery.error.message}</p>
      ) : (
        <>
          {requested.length ? (
            <section className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1">
              <h4 className="font-medium">Asking to approve ({requested.length})</h4>
              <p className="text-muted-foreground">
                They pressed “Request approver access” in this room. Nothing they decide counts
                until you activate them.
              </p>
              <ul aria-label="Requested approvers">
                {requested.map((item) => row(item, 'activate'))}
              </ul>
            </section>
          ) : null}
          <section>
            <h4 className="font-medium">Can approve ({active.length})</h4>
            {active.length ? (
              <ul aria-label="Active approvers" className="divide-y divide-border">
                {active.map((item) => row(item, 'revoke'))}
              </ul>
            ) : (
              <p className="text-warning">
                Nobody can approve here yet. Someone in the room can press “Request approver access”
                on a package, or add them below.
              </p>
            )}
          </section>
          {revoked.length ? (
            <section className="text-muted-foreground">
              <h4 className="font-medium">Revoked ({revoked.length})</h4>
              <ul aria-label="Revoked approvers">{revoked.map((item) => row(item, 'activate'))}</ul>
            </section>
          ) : null}
        </>
      )}
      <AddApprover
        destination={destination}
        members={members}
        busy={busyId !== null}
        onAdd={(body) => run('add', () => addDestinationApprover(destination.id, body))}
      />
      {problem ? (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

function AddApprover({
  destination,
  members,
  busy,
  onAdd,
}: {
  destination: RenderApprovalDestination;
  members: Map<string, { email: string | null }>;
  busy: boolean;
  onAdd: (body: AddDestinationApproverRequest) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AddMode>('member');
  const [userId, setUserId] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [displayName, setDisplayName] = useState('');

  const body: AddDestinationApproverRequest | null =
    mode === 'member'
      ? userId
        ? { userId }
        : null
      : platformUserId.trim()
        ? { platformUserId: platformUserId.trim(), displayName: displayName.trim() || null }
        : null;

  const add = async () => {
    if (!body || !(await onAdd(body))) return;
    setUserId('');
    setPlatformUserId('');
    setDisplayName('');
  };

  const input = 'h-8 rounded-md border border-input bg-background px-2 text-sm';
  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Add an approver</span>
        <select
          aria-label="Approver kind"
          value={mode}
          onChange={(event) => setMode(event.target.value === 'platform' ? 'platform' : 'member')}
          className={input}
        >
          <option value="member">A member of this brand</option>
          <option value="platform">
            Someone in {destination.platform === 'slack' ? 'Slack' : 'WhatsApp'} by id
          </option>
        </select>
      </label>
      {mode === 'member' ? (
        <select
          aria-label="Brand member"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className={cn(input, 'w-full')}
        >
          <option value="">Choose a member</option>
          {[...members].map(([id, member]) => (
            <option key={id} value={id}>
              {member.email ?? id}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            aria-label={PLATFORM_ID_LABEL[destination.platform]}
            placeholder={PLATFORM_ID_LABEL[destination.platform]}
            value={platformUserId}
            onChange={(event) => setPlatformUserId(event.target.value)}
            className={cn(input, 'w-full')}
          />
          <input
            aria-label="Display name"
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={cn(input, 'w-full')}
          />
        </>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!body || busy}
          onClick={() => void add()}
        >
          <UserPlus className="size-3.5" aria-hidden /> Add approver
        </Button>
      </div>
    </div>
  );
}
