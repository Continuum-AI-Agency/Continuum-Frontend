'use client';

import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
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

type DeleteDrafts = (ids: string[]) => void;

type DraftDeletionRequest = {
  ids: string[];
  deleteDrafts: DeleteDrafts;
};

type DraftDeletionConfirmationValue = {
  requestDraftDeletion: (ids: string[], deleteDrafts: DeleteDrafts) => void;
};

const DraftDeletionConfirmationContext = createContext<DraftDeletionConfirmationValue>({
  requestDraftDeletion: (ids, deleteDrafts) => deleteDrafts(ids),
});

export function DraftDeletionConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DraftDeletionRequest | null>(null);
  const requestDraftDeletion = useCallback((ids: string[], deleteDrafts: DeleteDrafts) => {
    if (ids.length === 0) return;
    setRequest({ ids: [...new Set(ids)], deleteDrafts });
  }, []);
  const count = request?.ids.length ?? 0;

  return (
    <DraftDeletionConfirmationContext.Provider value={{ requestDraftDeletion }}>
      {children}
      <AlertDialog open={request !== null} onOpenChange={(open) => !open && setRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count === 1 ? 'this draft' : `${count} drafts`}?</AlertDialogTitle>
            <AlertDialogDescription>
              {count === 1
                ? 'This removes the post from the planner. This action cannot be undone.'
                : 'These posts will be removed from the planner. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!request) return;
                request.deleteDrafts(request.ids);
                setRequest(null);
              }}
            >
              Delete {count === 1 ? 'draft' : `${count} drafts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DraftDeletionConfirmationContext.Provider>
  );
}

export function useDraftDeletionConfirmation(): DraftDeletionConfirmationValue {
  return useContext(DraftDeletionConfirmationContext);
}
