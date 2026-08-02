'use client';

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
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

// The general form of DraftDeletionConfirmation: any irreversible act asks first, and the
// caller awaits the answer instead of passing its effect in. Publishing and a copy rewrite
// both destroy something (a live post, an existing caption) and both used to fire on a
// single click from three different surfaces with no confirmation at all.

export type DestructiveConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  /**
   * The specific facts the user is agreeing to, rendered under the description.
   *
   * A publish confirmation that only says "this cannot be undone" asks the user to approve
   * something they cannot see. Publishing passes the resolved caption, account and format here so
   * the dialog shows what will actually be sent — and the backend binds the confirmation to
   * exactly those values, so what was shown is what posts.
   */
  details?: ReactNode;
  /**
   * Blocks the confirm button. Used when the server reports the post is not publishable: the
   * dialog still explains why, but there is nothing valid to agree to.
   */
  confirmDisabled?: boolean;
};

type DestructiveConfirmationValue = {
  requestDestructiveConfirmation: (options: DestructiveConfirmationOptions) => Promise<boolean>;
};

type PendingConfirmation = {
  options: DestructiveConfirmationOptions;
  settle: (confirmed: boolean) => void;
};

// No provider mounted means no dialog to answer, so the act proceeds — the same
// fail-open default DraftDeletionConfirmation uses. The gate that must never fail open
// (readiness) is enforced in usePublishDraft, not here.
const DestructiveConfirmationContext = createContext<DestructiveConfirmationValue>({
  requestDestructiveConfirmation: async () => true,
});

export function DestructiveConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  // Held in a ref as well so dismissal (Escape, overlay click) can resolve the promise
  // the caller is awaiting; a state read inside onOpenChange would be the stale one.
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.settle(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const requestDestructiveConfirmation = useCallback((options: DestructiveConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      // A second request while one is open declines the first rather than orphaning its
      // promise, which would leave the earlier caller awaiting forever.
      pendingRef.current?.settle(false);
      const next: PendingConfirmation = { options, settle: resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  return (
    <DestructiveConfirmationContext.Provider value={{ requestDestructiveConfirmation }}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.options.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.options.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.options.details ? (
            <div className="text-sm">{pending.options.details}</div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending?.options.confirmDisabled}
              onClick={() => settle(true)}
            >
              {pending?.options.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DestructiveConfirmationContext.Provider>
  );
}

export function useDestructiveConfirmation(): DestructiveConfirmationValue {
  return useContext(DestructiveConfirmationContext);
}
