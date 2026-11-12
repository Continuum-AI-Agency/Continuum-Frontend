'use client';

import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('organic');
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
            <AlertDialogTitle>
              {uiText.rich('sentence_6f20a6cf1a65', { count: count })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {count === 1
                ? uiText('this_removes_the_post_from_the_planner_this_a_f998df8')
                : uiText('these_posts_will_be_removed_from_the_planner__c1854ac')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
            {/* Destructive, so the confirm button matches the red menu item that opened it. */}
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!request) return;
                request.deleteDrafts(request.ids);
                setRequest(null);
              }}
            >
              {uiText.rich('sentence_11e2719d9c48', { count: count })}
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
