'use client';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import {
  setPulseRecipientAction,
  updatePulseOptInAction,
} from '@/app/[locale]/(post-auth)/settings/actions';
import { SendPulseButton } from '@/components/dashboard/SendPulseButton';
import { Pill } from '@/components/kibo-ui/pill';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatMemberEmail } from '@/lib/brands/memberDisplay';
import type { PulseRecipient } from '@/lib/brands/pulseRecipients';

type BrandPulseSectionProps = {
  brandId: string;
  optIn: boolean;
  recipients: PulseRecipient[];
  ownerUserId: string | null;
  canEdit: boolean;
};

export function BrandPulseSection({
  brandId,
  optIn,
  recipients,
  ownerUserId,
  canEdit,
}: BrandPulseSectionProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleOptIn = (next: boolean) => {
    startTransition(async () => {
      try {
        await updatePulseOptInAction(brandId, next);
        show({
          title: next ? tUi('m_abb39b646a') : tUi('m_da4e737298'),
          description: next ? tUi('m_e50a976e14') : tUi('m_8239715cd0'),
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_ebc8eff192'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_3716d64264'),
          variant: 'error',
        });
      }
    });
  };

  const handleRecipient = (userId: string, email: string | null, next: boolean) => {
    startTransition(async () => {
      try {
        await setPulseRecipientAction(brandId, userId, next);
        show({
          title: next ? tUi('m_a938ff0b2b') : tUi('m_36b9490412'),
          description: tUi(next ? 'pulseRecipientAdded' : 'pulseRecipientRemoved', {
            recipient: formatMemberEmail(email),
          }),
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: tUi('m_246c0d3b8b'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_3716d64264'),
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{tUi('m_a90b2b59f2')}</p>
          <p className="text-xs text-muted-foreground">{tUi('m_00c1ac8dfd')}</p>
        </div>
        <Switch checked={optIn} disabled={!canEdit || isPending} onCheckedChange={handleOptIn} />
      </div>

      <div className={optIn ? undefined : 'pointer-events-none opacity-50'}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{tUi('m_12bd59381e')}</p>
          <SendPulseButton brandId={brandId} />
        </div>
        <div className="space-y-2">
          {recipients.map((member) => {
            const isOwner = ownerUserId ? member.userId === ownerUserId : member.role === 'owner';
            const checked = isOwner || member.receivesEmailReport;
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/10 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{formatMemberEmail(member.email)}</span>
                  <Pill>{member.role}</Pill>
                  {isOwner ? <Pill variant="muted">{tUi('m_6656018ac9')}</Pill> : null}
                </div>
                <Switch
                  checked={checked}
                  disabled={!canEdit || isOwner || isPending}
                  onCheckedChange={(next) => handleRecipient(member.userId, member.email, next)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
