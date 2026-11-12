'use client';

import { Loader2, Trash2 } from 'lucide-react';

import { useTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import {
  type DisconnectPreview,
  disconnectConnection,
  fetchDisconnectPreview,
} from '@/lib/api/integrations';

type RemoveConnectionButtonProps = {
  integrationId: string;
  integrationLabel: string;
};

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
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
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
      .catch((error: unknown) => setPreviewError(getUiErrorMessage(error)));
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const result = await disconnectConnection(integrationId);
      const pulledFrom =
        result.brandsRevoked.length > 0 ? uiText('m_b1d4268c34',{brands:result.brandsRevoked.join(', ')}) : '';
      const unscheduled =
        result.postsDetached > 0
          ? uiText('m_f8644a8c95',{count:result.postsDetached})
          : '';
      show({
        title: uiText('m_144e7d8a58'),
        description: uiText('m_df2c56ca7e', {
          v0: String(integrationLabel),
          v1: String(pulledFrom),
          v2: String(unscheduled),
        }),
      });
      router.refresh();
    } catch (error) {
      show({
        title: uiText('m_fa6d579605'),
        description: getUiErrorMessage(error),
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
            {uiText('remove_c3812fc')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {uiText('m_1680e3e257')}
            {integrationLabel}?
          </AlertDialogTitle>
          <AlertDialogDescription>{uiText('m_3034b39084')}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="text-sm text-muted-foreground">
          {previewError ? (
            <p className="text-destructive">
              {uiText('m_aa0faba6af')}
              {previewError}
            </p>
          ) : preview ? (
            <ul className="flex flex-col gap-1.5">
              <li>
                {uiText('m_32accb3e5e',{count:preview.accountCount})}
              </li>
              <li>
                {preview.brands.length > 0 ? (
                  <>
                    {uiText('m_c148a40349')}{' '}
                    <span className="text-foreground">
                      {preview.brands.map((brand) => brand.name).join(', ')}
                    </span>
                    .
                  </>
                ) : (
                  uiText('m_d9d0805dc9')
                )}
              </li>
              {preview.queuedPostCount > 0 ? (
                <li className="text-foreground">
                  {uiText('m_d4cc24bb3d',{count:preview.queuedPostCount})}
                </li>
              ) : null}
            </ul>
          ) : (
            <p>{uiText('m_cebab3efa8')}</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{uiText('keep_connection_2640513')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!preview}
            onClick={() => void handleRemove()}
          >
            {uiText('m_7312a31a2c')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
