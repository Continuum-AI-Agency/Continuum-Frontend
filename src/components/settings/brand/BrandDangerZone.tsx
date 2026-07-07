'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteBrandProfileAction } from '@/app/(post-auth)/settings/actions';
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

type BrandDangerZoneProps = {
  brandName: string;
  hasProfile: boolean;
  canDelete: boolean;
};

export function BrandDangerZone({ brandName, hasProfile, canDelete }: BrandDangerZoneProps) {
  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  if (!canDelete) return null;

  const handleDelete = () => {
    if (!hasProfile) {
      show({ title: 'No brand profile', description: 'Nothing to delete.', variant: 'error' });
      return;
    }
    if (confirmName.trim() !== brandName.trim()) {
      show({
        title: 'Confirmation required',
        description: 'Type the brand name exactly to confirm deletion.',
        variant: 'error',
      });
      return;
    }
    startTransition(async () => {
      try {
        const { nextBrandId } = await deleteBrandProfileAction(activeBrandId);
        show({
          title: 'Brand profile deleted',
          description: 'Related reports and analyses were deactivated.',
          variant: 'success',
        });
        setOpen(false);
        setConfirmName('');
        if (nextBrandId) router.refresh();
        else router.push('/onboarding');
      } catch (error) {
        show({
          title: 'Delete failed',
          description: error instanceof Error ? error.message : 'Unable to delete brand profile.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Delete brand profile</h3>
          <p className="text-sm text-destructive">
            Permanently removes this brand profile and deactivates linked reports and analyses.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={isPending || !hasProfile}>
              Delete brand profile
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px]">
            <DialogTitle>Delete this brand profile?</DialogTitle>
            <DialogDescription>
              Type the brand name below to confirm. Related reports and strategic analyses will be
              deactivated.
            </DialogDescription>
            <div className="mt-3 flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Brand name</span>
              <Input
                placeholder={brandName}
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                Confirm delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
