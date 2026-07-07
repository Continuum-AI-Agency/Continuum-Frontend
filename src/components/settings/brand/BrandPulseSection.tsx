'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  setPulseRecipientAction,
  updatePulseOptInAction,
} from '@/app/(post-auth)/settings/actions';
import { Pill } from '@/components/kibo-ui/pill';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
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
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleOptIn = (next: boolean) => {
    startTransition(async () => {
      try {
        await updatePulseOptInAction(brandId, next);
        show({
          title: next ? 'Continuum Pulse on' : 'Continuum Pulse off',
          description: next
            ? 'The owner and any tagged members will receive it.'
            : 'No Pulse emails will be sent for this brand.',
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Could not update',
          description: error instanceof Error ? error.message : 'Unknown error.',
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
          title: next ? 'Recipient added' : 'Recipient removed',
          description: `${formatMemberEmail(email)} will ${next ? 'now' : 'no longer'} receive the Pulse.`,
          variant: 'success',
        });
        router.refresh();
      } catch (error) {
        show({
          title: 'Could not update recipient',
          description: error instanceof Error ? error.message : 'Unknown error.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Send the Continuum Pulse</p>
          <p className="text-xs text-muted-foreground">
            The weekly performance + trends digest, plus the first one after onboarding.
          </p>
        </div>
        <Switch checked={optIn} disabled={!canEdit || isPending} onCheckedChange={handleOptIn} />
      </div>

      <div className={optIn ? undefined : 'pointer-events-none opacity-50'}>
        <p className="mb-2 block text-xs text-muted-foreground">
          Recipients — the owner always receives it. Tag other members to include them.
        </p>
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
                  {isOwner ? <Pill variant="muted">always</Pill> : null}
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
