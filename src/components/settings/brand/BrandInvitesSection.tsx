'use client';

import {
  type BrandInviteRecord,
  type BrandInviteStatus,
  inviteIsResendable,
} from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createMagicLinkAction, revokeInviteAction } from '@/app/(post-auth)/settings/actions';
import { Pill } from '@/components/kibo-ui/pill';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import type { BrandRole } from '@/lib/onboarding/state';

type BrandInvitesSectionProps = {
  invites: BrandInviteRecord[];
  canEdit: boolean;
};

const INVITE_ROLES: BrandRole[] = ['admin', 'operator', 'viewer'];

const STATUS_LABEL: Record<BrandInviteStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** What the inviter can actually learn about the send, in one phrase. */
function deliveryLabel(invite: BrandInviteRecord): string {
  if (invite.delivery.lastEmailError) return `Send failed (${invite.delivery.lastEmailError})`;
  if (invite.delivery.lastEmailedAt) return 'Emailed';
  return 'No send recorded';
}

export function BrandInvitesSection({ invites, canEdit }: BrandInvitesSectionProps) {
  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<BrandRole>('operator');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatDate = (value: string) => (mounted ? new Date(value).toLocaleString() : '—');

  const handleCreateMagicLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      show({
        title: 'Email required',
        description: 'Add an email to send an invite.',
        variant: 'error',
      });
      return;
    }
    startTransition(async () => {
      try {
        const result = await createMagicLinkAction(activeBrandId, trimmed, inviteRole);
        setGeneratedLink(result.link);
        setInviteEmail('');
        if (result.warning) {
          show({ title: 'Invite ready', description: result.warning, variant: 'warning' });
        } else if (result.emailSent) {
          show({
            title: result.resent ? 'Magic link resent' : 'Magic link sent',
            description: `Invite emailed to ${trimmed}.`,
            variant: 'success',
          });
        } else {
          show({
            title: 'Invite ready',
            description: 'Invite link created. Share it manually.',
            variant: 'warning',
          });
        }
        router.refresh();
      } catch (error) {
        show({
          title: 'Invite failed',
          description: error instanceof Error ? error.message : 'Unable to create invite.',
          variant: 'error',
        });
      }
    });
  };

  const handleResend = (invite: BrandInviteRecord) => {
    startTransition(async () => {
      try {
        // forceResend blanks the provider idempotency key, which is exactly
        // right here and exactly wrong on a first send.
        const result = await createMagicLinkAction(activeBrandId, invite.email, invite.role, true);
        setGeneratedLink(result.link);
        show({
          title: result.emailSent ? 'Invite resent' : 'Invite ready',
          description: result.emailSent
            ? `A fresh link is on its way to ${invite.email}.`
            : (result.warning ?? 'Link created. Share it manually.'),
          variant: result.emailSent ? 'success' : 'warning',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Resend failed',
          description: error instanceof Error ? error.message : 'Unable to resend invite.',
          variant: 'error',
        });
      }
    });
  };

  const handleRevoke = (inviteId: string) => {
    startTransition(async () => {
      try {
        await revokeInviteAction(activeBrandId, inviteId);
        show({
          title: 'Invite revoked',
          description: 'This invite link is no longer valid.',
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Revoke failed',
          description: error instanceof Error ? error.message : 'Unable to revoke invite.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <form onSubmit={handleCreateMagicLink}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Email</span>
                <Input
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Role</span>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as BrandRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={isPending} className="min-h-10 w-full md:w-auto">
                Generate magic link
              </Button>
            </div>
            {generatedLink ? (
              <div className="flex flex-col gap-2">
                <Alert className="border-success/30 bg-success/10">
                  <AlertDescription className="text-success">
                    Invite link generated. Share it directly with your teammate.
                  </AlertDescription>
                </Alert>
                <Textarea readOnly value={generatedLink} className="font-mono text-sm" />
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      <div>
        <h3 className="mb-2 text-base font-semibold">Invitations</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-lg border border-border/60 bg-card/20 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium">{invite.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {STATUS_LABEL[invite.status]} · {deliveryLabel(invite)}
                        {invite.delivery.lastEmailedAt
                          ? ` ${formatDate(invite.delivery.lastEmailedAt)}`
                          : ''}
                      </p>
                    </div>
                    <Pill>{invite.role}</Pill>
                  </div>
                  {canEdit ? (
                    <div className="mt-3 flex gap-2">
                      {inviteIsResendable(invite.status) ? (
                        <Button
                          variant="ghost"
                          onClick={() => handleResend(invite)}
                          disabled={isPending}
                          className="min-h-10"
                        >
                          Resend
                        </Button>
                      ) : null}
                      {invite.status === 'pending' || invite.status === 'expired' ? (
                        <Button
                          variant="ghost"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={isPending}
                          className="min-h-10 text-destructive hover:text-destructive"
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email delivery</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>{invite.role}</TableCell>
                      <TableCell>
                        <Pill>{STATUS_LABEL[invite.status]}</Pill>
                      </TableCell>
                      <TableCell
                        className={
                          invite.delivery.lastEmailError ? 'text-destructive' : 'text-secondary'
                        }
                      >
                        {deliveryLabel(invite)}
                        {invite.delivery.lastEmailedAt
                          ? ` · ${formatDate(invite.delivery.lastEmailedAt)}`
                          : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            {inviteIsResendable(invite.status) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResend(invite)}
                                disabled={isPending}
                              >
                                Resend
                              </Button>
                            ) : null}
                            {invite.status === 'pending' || invite.status === 'expired' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRevoke(invite.id)}
                                disabled={isPending}
                                className="text-destructive hover:text-destructive"
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
