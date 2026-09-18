'use client';

import type {
  AddDestinationApproverRequest,
  DestinationApprover,
  RenderApprovalDestination,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        // Someone already listed here — active, revoked or still asking — is not an add.
        taken={new Set(approvers.map((approver) => approver.userId).filter(Boolean) as string[])}
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
  taken,
  busy,
  onAdd,
}: {
  destination: RenderApprovalDestination;
  members: Map<string, { email: string | null }>;
  taken: Set<string>;
  busy: boolean;
  onAdd: (body: AddDestinationApproverRequest) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AddMode>('member');
  const [userId, setUserId] = useState('');
  const [platformUserId, setPlatformUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [picking, setPicking] = useState(false);

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

  const addable = [...members].filter(([id]) => !taken.has(id));
  const labelOf = (id: string) => members.get(id)?.email ?? id;
  const platformLabel = destination.platform === 'slack' ? 'Slack' : 'WhatsApp';

  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`approver-kind-${destination.id}`} className="text-muted-foreground">
          Add an approver
        </Label>
        <Select
          value={mode}
          onValueChange={(next) => setMode(next === 'platform' ? 'platform' : 'member')}
        >
          <SelectTrigger
            id={`approver-kind-${destination.id}`}
            aria-label="Approver kind"
            size="sm"
            className="w-full"
          >
            <SelectValue
              items={{
                member: 'A member of this brand',
                platform: `Someone in ${platformLabel} by id`,
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">A member of this brand</SelectItem>
            <SelectItem value="platform">Someone in {platformLabel} by id</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'member' ? (
        // A brand can have more people than a dropdown is bearable at, and the only thing anyone
        // knows about them here is an email — so the picker is searchable, like every other person
        // picker in the app. cmdk's own scoring does the matching; do not hand-roll one.
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                role="combobox"
                size="sm"
                aria-label="Brand member"
                aria-expanded={picking}
                disabled={busy}
                className="w-full justify-between font-normal"
              >
                <span className="min-w-0 truncate">
                  {userId ? labelOf(userId) : 'Choose a member'}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            }
          />
          <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search by email…" />
              <CommandList className="scrollbar-thin">
                <CommandEmpty>
                  {members.size && !addable.length
                    ? 'Everyone in this brand is already listed.'
                    : 'No one matches.'}
                </CommandEmpty>
                <CommandGroup>
                  {addable.map(([id]) => (
                    <CommandItem
                      key={id}
                      value={`${labelOf(id)} ${id}`}
                      onSelect={() => {
                        setUserId(id);
                        setPicking(false);
                      }}
                    >
                      <CheckIcon
                        className={cn('mr-2 size-3.5', id === userId ? 'opacity-100' : 'opacity-0')}
                      />
                      <span className="min-w-0 flex-1 break-all">{labelOf(id)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          <Input
            aria-label={PLATFORM_ID_LABEL[destination.platform]}
            placeholder={PLATFORM_ID_LABEL[destination.platform]}
            value={platformUserId}
            onChange={(event) => setPlatformUserId(event.target.value)}
            className="h-8 text-sm"
          />
          <Input
            aria-label="Display name"
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-8 text-sm"
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
