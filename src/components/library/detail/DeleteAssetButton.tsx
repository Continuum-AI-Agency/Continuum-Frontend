'use client';

// The third way a creative leaves the detail view, alongside a share link and a download:
// it stops being in the library. This is a soft delete — the row keeps its bytes, versions
// and comments, and every Library read path filters deleted_at — so the copy promises
// removal, never erasure.

import type { MediaAsset } from '@continuum/contracts';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
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
import { bulkDeleteAssetsOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type DeleteAssetButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onDeleted: () => void;
};

export function DeleteAssetButton({ brandId, asset, onDeleted }: DeleteAssetButtonProps) {
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
        title: 'Deleted from your library',
        description:
          removed.length > 1 ? `${removed.length} slides removed with the carousel.` : undefined,
        variant: 'success',
      });
      onDeleted();
    } catch (error) {
      toast.show({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Please try again.',
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
        <Trash2Icon className="size-3.5" />
        Delete
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => (deleting ? undefined : setOpen(next))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Delete “{asset.title ?? asset.fileName}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {asset.carousel
                ? 'It leaves your library with every slide of the carousel. '
                : 'It leaves your library. '}
              Comments, versions and approvals are kept, and support can still bring it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void handleDelete()}>
              {deleting && <Loader2Icon className="size-3.5 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
