'use client';

import {
  type BrandInviteRecord,
  type BrandInviteStatus,
  inviteIsResendable,
} from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import {
  createMagicLinkAction,
  revokeInviteAction,
} from '@/app/[locale]/(post-auth)/settings/actions';
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
import { useUiErrorMessage } from '@/i18n/errors';
import type { BrandRole } from '@/lib/onboarding/state';

type BrandInvitesSectionProps = {
  invites: BrandInviteRecord[];
  canEdit: boolean;
};

const INVITE_ROLES: BrandRole[] = ['admin', 'operator', 'viewer'];

const STATUS_LABEL = {
  pending: 'invitePending',
  accepted: 'inviteAccepted',
  expired: 'inviteExpired',
  revoked: 'inviteRevoked',
} as const;
const ROLE_LABEL = {
  owner: 'roleOwner',
  admin: 'roleAdmin',
  operator: 'roleOperator',
  viewer: 'roleViewer',
} as const;

function deliveryLabel(
  invite: BrandInviteRecord,
  tUi: ReturnType<typeof useTranslations<'settings'>>,
): string {
  if (invite.delivery.lastEmailError) return tUi('inviteDeliveryFailed');
  return tUi(invite.delivery.lastEmailedAt ? 'inviteEmailed' : 'inviteNoSend');
}

export function BrandInvitesSection({ invites, canEdit }: BrandInvitesSectionProps) {
  const uiLocale = useLocale();

  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

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

  const formatDate = (value: string) => (mounted ? new Date(value).toLocaleString(uiLocale) : '—');

  const handleCreateMagicLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      show({
        title: tUi('m_887c8dbb94'),
        description: tUi('m_aff96da74c'),
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
          show({ title: tUi('m_20cfec91c6'), description: result.warning, variant: 'warning' });
        } else if (result.emailSent) {
          show({
            title: result.resent ? tUi('m_93e7e9c2ca') : tUi('m_8f84cd2826'),
            description: tUi('m_b0d5fb7060', { v0: String(trimmed) }),
            variant: 'success',
          });
        } else {
          show({
            title: tUi('m_20cfec91c6'),
            description: tUi('m_81e47dbef8'),
            variant: 'warning',
          });
        }
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_2e82bbd534'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_b4a564578a'),
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
          title: result.emailSent ? tUi('m_20538e872d') : tUi('m_20cfec91c6'),
          description: result.emailSent
            ? tUi('m_e29312d8af', { v0: String(invite.email) })
            : (result.warning ?? tUi('m_6baee9ff81')),
          variant: result.emailSent ? 'success' : 'warning',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_4be7910772'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_829102d42b'),
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
          title: tUi('m_4e6cdd5580'),
          description: tUi('m_696514be63'),
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_064efc10df'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_07c9923569'),
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
                <span className="text-xs text-muted-foreground">{tUi('m_84add5b295')}</span>
                <Input
                  placeholder={tUi('m_f0d0fed59a')}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{tUi('m_c3f104d136')}</span>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as BrandRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tUi('m_c3f104d136')} />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {tUi(ROLE_LABEL[role])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={isPending} className="min-h-10 w-full md:w-auto">
                {tUi('m_a0eab943bb')}
              </Button>
            </div>
            {generatedLink ? (
              <div className="flex flex-col gap-2">
                <Alert className="border-success/30 bg-success/10">
                  <AlertDescription className="text-success">
                    {tUi('m_bf6c953972')}
                  </AlertDescription>
                </Alert>
                <Textarea readOnly value={generatedLink} className="font-mono text-sm" />
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      <div>
        <h3 className="mb-2 text-base font-semibold">{tUi('m_9b69a35ab5')}</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tUi('m_485c403a62')}</p>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-lg border border-border/60 bg-card/20 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium">{invite.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tUi(STATUS_LABEL[invite.status])} · {deliveryLabel(invite, tUi)}
                        {invite.delivery.lastEmailedAt
                          ? tUi('m_73e84c2ec7', {
                              v0: String(formatDate(invite.delivery.lastEmailedAt)),
                            })
                          : ''}
                      </p>
                    </div>
                    <Pill>{tUi(ROLE_LABEL[invite.role])}</Pill>
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
                          {tUi('m_0f4f469452')}
                        </Button>
                      ) : null}
                      {invite.status === 'pending' || invite.status === 'expired' ? (
                        <Button
                          variant="ghost"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={isPending}
                          className="min-h-10 text-destructive hover:text-destructive"
                        >
                          {tUi('m_0be720759f')}
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
                    <TableHead>{tUi('m_84add5b295')}</TableHead>
                    <TableHead>{tUi('m_c3f104d136')}</TableHead>
                    <TableHead>{tUi('m_bae7d5be70')}</TableHead>
                    <TableHead>{tUi('m_3776c7a872')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>{tUi(ROLE_LABEL[invite.role])}</TableCell>
                      <TableCell>
                        <Pill>{tUi(STATUS_LABEL[invite.status])}</Pill>
                      </TableCell>
                      <TableCell
                        className={
                          invite.delivery.lastEmailError ? 'text-destructive' : 'text-secondary'
                        }
                      >
                        {deliveryLabel(invite, tUi)}
                        {invite.delivery.lastEmailedAt
                          ? tUi('m_2130fb1aa9', {
                              v0: String(formatDate(invite.delivery.lastEmailedAt)),
                            })
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
                                {tUi('m_0f4f469452')}
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
                                {tUi('m_0be720759f')}
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
