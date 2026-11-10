'use client';

import { RotateCcw } from 'lucide-react';
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

/** Clears the private draft only after the person confirms; nothing published is touched. */
export function DiscardEditsButton({
  disabled,
  onDiscard,
}: {
  disabled: boolean;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        <RotateCcw data-icon="inline-start" aria-hidden /> Discard edits
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all edits in this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears your private draft. The original and every published revision stay as
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onDiscard();
              }}
            >
              Discard edits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
