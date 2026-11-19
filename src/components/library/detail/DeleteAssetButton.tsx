'use client';

// The third way a creative leaves the detail view, alongside a share link and a download:
// it stops being in the library. This is a soft delete — the row keeps its bytes, versions
// and comments, and every Library read path filters deleted_at — so the copy promises
// removal, never erasure.

import type { MediaAsset } from '@continuum/contracts';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { bulkDeleteAssetsOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type DeleteAssetButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onDeleted: () => void;
};

export function DeleteAssetButton({ brandId, asset, onDeleted }: DeleteAssetButtonProps) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const removed = await bulkDeleteAssetsOperation(createSupabaseBrowserClient(), {
        brandId,
        assetIds: [asset.id],
      });
      setOpen(false);
      toast.show({
        title: translateUi('deleted_from_your_library_9ae0cf0b'),
        description:
          removed.length > 1
            ? translateUi('value0_slides_removed_with_the_caro_53bea217', {
                count: Number(removed.length),
              })
            : undefined,
        variant: 'success',
      });
      onDeleted();
    } catch (error) {
      toast.show({
        title: translateUi('delete_failed_8727e2ba'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon className="size-3.5" /> {translateUi('delete_e2d0a549')}{' '}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => (deleting ? undefined : setOpen(next))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {' '}
              {translateUi('delete_fdd77e66')}
              {asset.title ?? asset.fileName}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {asset.carousel
                ? translateUi('it_leaves_your_library_with_every_s_8ef9834a')
                : translateUi('it_leaves_your_library_ce86464a')}{' '}
              {translateUi('comments_versions_and_approvals_are_3b590c33')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {translateUi('cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void handleDelete()}>
              {deleting && <Loader2Icon className="size-3.5 animate-spin" />}
              {deleting ? translateUi('deleting_43b5894c') : translateUi('delete_e2d0a549')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
