'use client';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { deleteBrandProfileAction } from '@/app/[locale]/(post-auth)/settings/actions';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';

type BrandDangerZoneProps = {
  brandName: string;
  hasProfile: boolean;
  canDelete: boolean;
};

export function BrandDangerZone({ brandName, hasProfile, canDelete }: BrandDangerZoneProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  if (!canDelete) return null;

  const handleDelete = () => {
    if (!hasProfile) {
      show({ title: tUi('m_27c8cc75f6'), description: tUi('m_c6bc9a32bc'), variant: 'error' });
      return;
    }
    if (confirmName.trim() !== brandName.trim()) {
      show({
        title: tUi('m_9f088da791'),
        description: tUi('m_0de2b794b8'),
        variant: 'error',
      });
      return;
    }
    startTransition(async () => {
      try {
        const { nextBrandId } = await deleteBrandProfileAction(activeBrandId);
        show({
          title: tUi('m_a9e1fc1114'),
          description: tUi('m_b53b647573'),
          variant: 'success',
        });
        setOpen(false);
        setConfirmName('');
        if (nextBrandId) router.refresh();
        else router.push('/onboarding');
      } catch (error) {
        show({
          title: tUi('m_64513b47d4'),
          description: error instanceof Error ? uiErrorMessage(error) : tUi('m_776902de9b'),
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{tUi('m_fa8272a4d7')}</h3>
          <p className="text-sm text-destructive">{tUi('m_034d87e50b')}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button variant="destructive" disabled={isPending || !hasProfile}>
                {tUi('m_fa8272a4d7')}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-[420px]">
            <DialogTitle>{tUi('m_e35cfd27d2')}</DialogTitle>
            <DialogDescription>{tUi('m_db01b856da')}</DialogDescription>
            <div className="mt-3 flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{tUi('m_6b4b8b5df0')}</span>
              <Input
                placeholder={brandName}
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tUi('m_77dfd2135f')}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {tUi('m_c9f2829e38')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
