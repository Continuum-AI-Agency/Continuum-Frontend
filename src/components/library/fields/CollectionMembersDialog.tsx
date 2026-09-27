'use client';

// Who can reach a collection, and at which role. "Only members" restricts the collection
// and everything inside it (sub-collections too) to its member list plus the brand's
// owners and admins; each member's role — manager, editor, commenter, viewer — then
// decides what they can do there, independently of their brand role. The database
// enforces all of it (RLS + authorize_operation); this dialog only reads and relays.

import type { CollectionAccess, CollectionMember, CollectionRole } from '@continuum/contracts';
import { Loader2, Trash2, UserLock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast-imperative';
import { type BrandRole, useBrandRole } from '@/lib/library/useBrandRole';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { useMentionTargets } from '../detail/useMentionTargets';

const ROLE_LABEL: Record<CollectionRole, string> = {
  manager: 'Manager',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};
const ROLES = Object.keys(ROLE_LABEL) as CollectionRole[];

type MembersState = {
  access: CollectionAccess;
  myRole: CollectionRole | null;
  members: CollectionMember[];
};

type Props = {
  brandId: string;
  collectionId: string;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

async function putMembers(body: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/library/collections/members', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `HTTP ${response.status}`);
  }
}

function canManage(brandRole: BrandRole | null | undefined, myRole: CollectionRole | null) {
  return brandRole === 'owner' || brandRole === 'admin' || myRole === 'manager';
}

export function CollectionMembersDialog({
  brandId,
  collectionId,
  collectionName,
  open,
  onOpenChange,
}: Props) {
  const brandRole = useBrandRole(brandId);
  const people = useMentionTargets(open ? brandId : null);
  const [state, setState] = useState<MembersState | null>(null);
  const [busy, setBusy] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<CollectionRole>('editor');

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/library/collections/members?collectionId=${encodeURIComponent(collectionId)}`,
    );
    if (!response.ok) {
      toast.error(`Loading members failed · HTTP ${response.status}`);
      return;
    }
    setState((await response.json()) as MembersState);
  }, [collectionId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // A manager in another tab adding or re-roling someone shows up here as it lands.
  useEffect(() => {
    if (!open) return;
    return subscribeToPostgresChanges({
      label: `collection-members-${collectionId}`,
      bindings: [
        {
          event: '*',
          schema: 'media',
          table: 'collection_members',
          filter: `collection_id=eq.${collectionId}`,
          onRow: () => void load(),
        },
      ],
    });
  }, [open, collectionId, load]);

  const change = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await putMembers({ collectionId, ...body });
      toast.success(done);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const manage = state ? canManage(brandRole, state.myRole) : false;
  const labelFor = (userId: string) =>
    people?.find((person) => person.userId === userId)?.label ?? 'Member';
  const memberIds = new Set(state?.members.map((member) => member.userId));
  const addable = (people ?? []).filter((person) => !memberIds.has(person.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="collection-members-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserLock className="size-4" /> Members of {collectionName}
          </DialogTitle>
          <DialogDescription>
            With “Only members” on, this collection, its sub-collections and every asset in them are
            hidden from anyone not listed here. Brand owners and admins always see everything. An
            asset that is also in another collection is hidden there too.
          </DialogDescription>
        </DialogHeader>

        {!state ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              {/* Named by id, not <label htmlFor>: Base UI puts an id on its hidden input,
                  which would leave the visible role="switch" without a name. */}
              <span id="collection-only-members-label">Only members</span>
              <Switch
                aria-labelledby="collection-only-members-label"
                checked={state.access === 'restricted'}
                disabled={!manage || busy}
                onCheckedChange={(checked) =>
                  void change(
                    { access: checked ? 'restricted' : 'brand' },
                    checked ? 'Restricted to members' : 'Open to the whole brand',
                  )
                }
              />
            </div>

            <ul className="flex flex-col gap-1.5" data-testid="collection-members-list">
              {state.members.length === 0 ? (
                <li className="text-xs text-muted-foreground">No members yet.</li>
              ) : (
                state.members.map((member) => (
                  <li
                    key={member.userId}
                    data-member-id={member.userId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{labelFor(member.userId)}</span>
                    <Select
                      value={member.role}
                      disabled={!manage || busy}
                      onValueChange={(next) =>
                        void change(
                          { userId: member.userId, role: next },
                          `${labelFor(member.userId)} is now ${ROLE_LABEL[next as CollectionRole]}`,
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-32 text-xs"
                        aria-label={`Role of ${labelFor(member.userId)}`}
                      >
                        <SelectValue items={ROLE_LABEL} />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {manage ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={busy}
                        aria-label={`Remove ${labelFor(member.userId)}`}
                        onClick={() =>
                          void change(
                            { userId: member.userId, role: null },
                            `${labelFor(member.userId)} removed`,
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>

            {manage ? (
              <div className="flex items-center gap-2">
                <Select value={addUserId} onValueChange={(next) => setAddUserId(String(next))}>
                  <SelectTrigger size="sm" className="h-8 flex-1 text-xs" aria-label="Add member">
                    <SelectValue
                      placeholder="Add a teammate…"
                      items={Object.fromEntries(addable.map((p) => [p.userId, p.label]))}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((person) => (
                      <SelectItem key={person.userId} value={person.userId} className="text-xs">
                        {person.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={addRole}
                  onValueChange={(next) => setAddRole(next as CollectionRole)}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-28 text-xs"
                    aria-label="New member role"
                  >
                    <SelectValue items={ROLE_LABEL} />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role} className="text-xs">
                        {ROLE_LABEL[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={!addUserId || busy}
                  onClick={() =>
                    void change(
                      { userId: addUserId, role: addRole },
                      `${labelFor(addUserId)} added`,
                    ).then(() => setAddUserId(''))
                  }
                >
                  Add
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only a brand owner, admin or this collection’s manager can change access.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
