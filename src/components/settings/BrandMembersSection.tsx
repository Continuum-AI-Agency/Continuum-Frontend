'use client';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import {
  changeMemberRoleAction,
  removeMemberAction,
} from '@/app/[locale]/(post-auth)/settings/actions';
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
import { useUiErrorMessage } from '@/i18n/errors';
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
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');
  const roleLabels = {
    owner: tUi('roleOwner'),
    admin: tUi('roleAdmin'),
    operator: tUi('roleOperator'),
    viewer: tUi('roleViewer'),
  };
  const roleLabel = (role: string) =>
    Object.hasOwn(roleLabels, role)
      ? roleLabels[role as keyof typeof roleLabels]
      : tUi('roleUnknown');

  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const ownerEmails = members.filter((m) => m.role === 'owner').map((m) => m.email);

  const handleRoleChange = (memberId: string, email: string | null, next: string) => {
    startTransition(async () => {
      try {
        await changeMemberRoleAction(brandId, memberId, next as Exclude<BrandRole, 'owner'>);
        show({
          title: tUi('m_e6f6a17db7'),
          description: tUi('m_8b26439510', {
            v0: String(formatMemberEmail(email)),
            v1: String(next),
          }),
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_b6be99839f'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_3716d64264'),
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
          title: tUi('m_1666974ad2'),
          description: tUi('m_840f3c6851', {
            v0: String(formatMemberEmail(email)),
          }),
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_57af949595'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_5b847b0aca'),
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
                      {tUi('m_6403f2b7eb')}
                    </Pill>
                  ) : null}
                </div>
                {!canEdit || isOwnerRow ? <Pill>{roleLabel(member.role)}</Pill> : null}
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
                        <SelectItem value="admin">{tUi('m_d033e22ae3')}</SelectItem>
                        <SelectItem value="operator">{tUi('m_fe96dd3975')}</SelectItem>
                        <SelectItem value="viewer">{tUi('m_40b4f25b1f')}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button
                    variant="ghost"
                    disabled={isOwnerRow || isPending}
                    onClick={() => handleRemove(member.id, member.email)}
                    className="min-h-10 text-destructive hover:text-destructive"
                  >
                    {tUi('m_e963907dac')}
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
              <TableHead>{tUi('m_84add5b295')}</TableHead>
              <TableHead>{tUi('m_c3f104d136')}</TableHead>
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
                      {member.isRecentlyAccepted ? (
                        <Pill variant="success">{tUi('m_6403f2b7eb')}</Pill>
                      ) : null}
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
                          <SelectItem value="admin">{tUi('m_d033e22ae3')}</SelectItem>
                          <SelectItem value="operator">{tUi('m_fe96dd3975')}</SelectItem>
                          <SelectItem value="viewer">{tUi('m_40b4f25b1f')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Pill>{roleLabel(member.role)}</Pill>
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
                        {tUi('m_e963907dac')}
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
        <span className="text-xs text-warning">{tUi('m_de219726d5')}</span>
      )}
    </div>
  );
}
