'use client';

import type {
  AddDestinationApproverRequest,
  DestinationApprover,
  RenderApprovalDestination,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, Loader2, UserPlus } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
  const translateUi = useUiTranslations('forge');

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
    void queryClient.invalidateQueries({
      queryKey: approvalDestinationsKey(brandId),
    });
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
          aria-label={`${action === 'activate' ? translateUi('activate_24433c70') : translateUi('revoke_87e6d00b')} ${name}`}
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
          {action === 'activate'
            ? translateUi('activate_24433c70')
            : translateUi('revoke_87e6d00b')}
        </Button>
      </li>
    );
  };

  return (
    <fieldset
      aria-label={translateUi('approvers_for_value0_ade2d324', {
        value0: String(destination.name),
      })}
      className="space-y-2 rounded-md border bg-muted/20 p-2 text-xs"
    >
      {approversQuery.isPending ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />{' '}
          {translateUi('loading_approvers_8f6c0f93')}{' '}
        </p>
      ) : approversQuery.isError ? (
        <p className="text-destructive">
          {translateUi('couldn_t_load_approvers_ae967198')} {approversQuery.error.message}
        </p>
      ) : (
        <>
          {requested.length ? (
            <section className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1">
              <h4 className="font-medium">
                {translateUi('asking_to_approve_cb3cedba')}
                {requested.length})
              </h4>
              <p className="text-muted-foreground">
                {' '}
                {translateUi('they_pressed_request_approver_acces_6ee424cb')}{' '}
              </p>
              <ul aria-label={translateUi('requested_approvers_858cd847')}>
                {requested.map((item) => row(item, 'activate'))}
              </ul>
            </section>
          ) : null}
          <section>
            <h4 className="font-medium">
              {translateUi('can_approve_756607ec')}
              {active.length})
            </h4>
            {active.length ? (
              <ul
                aria-label={translateUi('active_approvers_e182e91c')}
                className="divide-y divide-border"
              >
                {active.map((item) => row(item, 'revoke'))}
              </ul>
            ) : (
              <p className="text-warning">
                {' '}
                {translateUi('nobody_can_approve_here_yet_someone_21f33763')}{' '}
              </p>
            )}
          </section>
          {revoked.length ? (
            <section className="text-muted-foreground">
              <h4 className="font-medium">
                {translateUi('revoked_a281a7ba')}
                {revoked.length})
              </h4>
              <ul aria-label={translateUi('revoked_approvers_452c42c7')}>
                {revoked.map((item) => row(item, 'activate'))}
              </ul>
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
  const translateUi = useUiTranslations('forge');

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
        ? {
            platformUserId: platformUserId.trim(),
            displayName: displayName.trim() || null,
          }
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
          {' '}
          {translateUi('add_an_approver_a0396c52')}{' '}
        </Label>
        <Select
          value={mode}
          onValueChange={(next) => setMode(next === 'platform' ? 'platform' : 'member')}
        >
          <SelectTrigger
            id={`approver-kind-${destination.id}`}
            aria-label={translateUi('approver_kind_8a0a6874')}
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
            <SelectItem value="member">{translateUi('a_member_of_this_brand_1eb3278c')}</SelectItem>
            <SelectItem value="platform">
              {translateUi('someone_in_eedd6d2b')} {platformLabel} {translateUi('by_id_f3967f12')}
            </SelectItem>
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
                aria-label={translateUi('brand_member_f3c71fcb')}
                aria-expanded={picking}
                disabled={busy}
                className="w-full justify-between font-normal"
              >
                <span className="min-w-0 truncate">
                  {userId ? labelOf(userId) : translateUi('choose_a_member_c6aaa720')}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            }
          />
          <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder={translateUi('search_by_email_f3ec907b')} />
              <CommandList className="scrollbar-thin">
                <CommandEmpty>
                  {members.size && !addable.length
                    ? translateUi('everyone_in_this_brand_is_already_l_a202a166')
                    : translateUi('no_one_matches_b7bab112')}
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
            aria-label={translateUi('display_name_2b7f6a84')}
            placeholder={translateUi('display_name_2b7f6a84')}
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
          <UserPlus className="size-3.5" aria-hidden /> {translateUi('add_approver_10746b93')}{' '}
        </Button>
      </div>
    </div>
  );
}
