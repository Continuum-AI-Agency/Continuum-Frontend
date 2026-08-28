'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import {
  type DisconnectPreview,
  disconnectConnection,
  fetchDisconnectPreview,
} from '@/lib/api/integrations';

type RemoveConnectionButtonProps = {
  integrationId: string;
  integrationLabel: string;
};

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/**
 * Removing a connection is not reversible and reaches past the person doing it —
 * every brand they shared it with loses access at the same moment. So the blast
 * radius is loaded and shown before the confirm, never described in the
 * abstract.
 */
export function RemoveConnectionButton({
  integrationId,
  integrationLabel,
}: RemoveConnectionButtonProps) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<DisconnectPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setPreview(null);
    setPreviewError(null);
    fetchDisconnectPreview(integrationId)
      .then(setPreview)
      .catch((error: unknown) =>
        setPreviewError(error instanceof Error ? error.message : 'Unknown error.'),
      );
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const result = await disconnectConnection(integrationId);
      const pulledFrom =
        result.brandsRevoked.length > 0 ? ` Pulled from ${result.brandsRevoked.join(', ')}.` : '';
      const unscheduled =
        result.postsDetached > 0
          ? ` ${countLabel(result.postsDetached, 'queued post')} moved back to draft.`
          : '';
      show({
        title: 'Connection removed',
        description: `${integrationLabel} is disconnected.${pulledFrom}${unscheduled}`,
      });
      router.refresh();
    } catch (error) {
      show({
        title: 'Could not remove connection',
        description: error instanceof Error ? error.message : 'Unknown error.',
        variant: 'error',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isRemoving}
            className="text-muted-foreground hover:text-destructive"
          >
            {isRemoving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Remove
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {integrationLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Continuum revokes this login at the provider and deletes it from your account. It cannot
            be undone — reconnecting means a fresh sign-in.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="text-sm text-muted-foreground">
          {previewError ? (
            <p className="text-destructive">Could not load what this affects: {previewError}</p>
          ) : preview ? (
            <ul className="flex flex-col gap-1.5">
              <li>{countLabel(preview.accountCount, 'account')} disappear from Continuum.</li>
              <li>
                {preview.brands.length > 0 ? (
                  <>
                    These brands lose access immediately:{' '}
                    <span className="text-foreground">
                      {preview.brands.map((brand) => brand.name).join(', ')}
                    </span>
                    .
                  </>
                ) : (
                  'No brand is using this connection.'
                )}
              </li>
              {preview.queuedPostCount > 0 ? (
                <li className="text-foreground">
                  {countLabel(preview.queuedPostCount, 'scheduled post')} will be moved back to
                  draft so nothing fails at publish time.
                </li>
              ) : null}
            </ul>
          ) : (
            <p>Checking what this affects…</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Keep connection</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!preview}
            onClick={() => void handleRemove()}
          >
            Remove connection
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
