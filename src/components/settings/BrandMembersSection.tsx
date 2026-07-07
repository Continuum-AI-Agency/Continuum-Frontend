'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { changeMemberRoleAction, removeMemberAction } from '@/app/(post-auth)/settings/actions';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/ToastProvider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMemberEmail } from '@/lib/brands/memberDisplay';
import type { BrandRole } from '@/lib/onboarding/state';

export type BrandMemberRow = {
  id: string;
  email: string | null;
  role: string;
  isRecentlyAccepted?: boolean;
};

type BrandMembersSectionProps = {
  brandId: string;
  members: BrandMemberRow[];
  canEdit: boolean;
};

export function BrandMembersSection({ brandId, members, canEdit }: BrandMembersSectionProps) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const ownerEmails = members.filter((m) => m.role === 'owner').map((m) => m.email);

  const handleRoleChange = (memberId: string, email: string | null, next: string) => {
    startTransition(async () => {
      try {
        await changeMemberRoleAction(brandId, memberId, next as Exclude<BrandRole, 'owner'>);
        show({
          title: 'Role updated',
          description: `${formatMemberEmail(email)} is now ${next}.`,
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Could not change role',
          description: error instanceof Error ? error.message : 'Unknown error.',
          variant: 'error',
        });
      }
    });
  };

  const handleRemove = (memberId: string, email: string | null) => {
    startTransition(async () => {
      try {
        await removeMemberAction(brandId, memberId, email ?? undefined);
        show({
          title: 'Member removed',
          description: `${formatMemberEmail(email)} no longer has access.`,
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Action failed',
          description: error instanceof Error ? error.message : 'Unable to remove member.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div>
      <div className="space-y-2 md:hidden">
        {members.map((member) => {
          const isOwnerRow = member.role === 'owner';
          return (
            <div key={member.id} className="rounded-lg border border-border/60 bg-card/20 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{formatMemberEmail(member.email)}</p>
                  {member.isRecentlyAccepted ? (
                    <Pill variant="success" className="mt-1">
                      New
                    </Pill>
                  ) : null}
                </div>
                {!canEdit || isOwnerRow ? <Pill>{member.role}</Pill> : null}
              </div>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!isOwnerRow ? (
                    <Select
                      value={member.role}
                      disabled={isPending}
                      onValueChange={(next) => {
                        if (next === member.role) return;
                        handleRoleChange(member.id, member.email, next);
                      }}
                    >
                      <SelectTrigger className="min-h-10 min-w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="operator">operator</SelectItem>
                        <SelectItem value="viewer">viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button
                    variant="ghost"
                    disabled={isOwnerRow || isPending}
                    onClick={() => handleRemove(member.id, member.email)}
                    className="min-h-10 text-destructive hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isOwnerRow = member.role === 'owner';
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{formatMemberEmail(member.email)}</span>
                      {member.isRecentlyAccepted ? <Pill variant="success">New</Pill> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canEdit && !isOwnerRow ? (
                      <Select
                        value={member.role}
                        disabled={isPending}
                        onValueChange={(next) => {
                          if (next === member.role) return;
                          handleRoleChange(member.id, member.email, next);
                        }}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="operator">operator</SelectItem>
                          <SelectItem value="viewer">viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Pill>{member.role}</Pill>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isOwnerRow || isPending}
                        onClick={() => handleRemove(member.id, member.email)}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {ownerEmails.length === 0 && (
        <span className="text-xs text-warning">
          Warning: no owners detected. Ensure at least one owner remains.
        </span>
      )}
    </div>
  );
}
