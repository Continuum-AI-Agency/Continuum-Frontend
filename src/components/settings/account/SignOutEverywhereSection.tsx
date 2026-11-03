'use client';

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
import { SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING } from '@/lib/auth/impersonation';

type SignOutEverywhereSectionProps = {
  /** This browser's session came from an impersonation link, so it never ends the customer's
   *  sessions on their other devices. logoutEverywhereAction refuses it too; this only says so. */
  impersonating: boolean;
};

// Sign out in the sidebar ends only this browser; this ends every session of the account. It
// signs out people on other devices, so it asks first (PP-DT-C-signout-ends-every-device).
export function SignOutEverywhereSection({ impersonating }: SignOutEverywhereSectionProps) {
  const { logoutEverywhere, isPending, error } = useAuth();
  const [confirming, setConfirming] = useState(false);

  if (impersonating) {
    return (
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        {SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING}
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
          Sign out, in the sidebar, ends only this browser. Sign out of all devices ends every
          session of your account, this one included.
        </p>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="outline" disabled={isPending}>
                Sign out of all devices
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
              <AlertDialogDescription>
                Every browser and device signed in to your account is signed out, this one included.
                A page already open on another device can keep working for up to an hour.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isPending}
                aria-busy={isPending}
                onClick={() => void signOutEverywhere()}
              >
                {isPending ? 'Signing out…' : 'Sign out everywhere'}
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
