'use client';

import { useTranslations } from 'next-intl';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

type SignOutEverywhereSectionProps = {
  /** This browser's session came from an impersonation link, so it never ends the customer's
   *  sessions on their other devices. logoutEverywhereAction refuses it too; this only says so. */
  impersonating: boolean;
};

// Sign out in the sidebar ends only this browser; this ends every session of the account. It
// signs out people on other devices, so it asks first (PP-DT-C-signout-ends-every-device).
export function SignOutEverywhereSection({ impersonating }: SignOutEverywhereSectionProps) {
  const uiText = useTranslations('settings');
  const authText = useTranslations('auth');
  const { logoutEverywhere, isPending, error } = useAuth();
  const [confirming, setConfirming] = useState(false);

  if (impersonating) {
    return (
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        {authText('signOutEverywhereRefused')}
      </p>
    );
  }

  // On success the action leaves for /login; on a refusal or an error the dialog closes so the
  // reason below is not hidden behind it.
  const signOutEverywhere = async () => {
    const signedOut = await logoutEverywhere();
    if (!signedOut) setConfirming(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          {uiText('sign_out_in_the_sidebar_ends_only_this_browse_544d763')}
        </p>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="outline" disabled={isPending}>
                {uiText('sign_out_of_all_devices_8d7292e')}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{uiText('sign_out_of_all_devices_1583fe5')}</AlertDialogTitle>
              <AlertDialogDescription>
                {uiText('every_browser_and_device_signed_in_to_your_ac_cfbf52d')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>{uiText('m_77dfd2135f')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isPending}
                aria-busy={isPending}
                onClick={() => void signOutEverywhere()}
              >
                {isPending ? uiText('signing_out_08c6bd3') : uiText('sign_out_everywhere_af180fc')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
