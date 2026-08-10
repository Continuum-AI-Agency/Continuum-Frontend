'use client';

import type { ReactElement } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AdminActionConfirmationProps = {
  /** Single element: it becomes the alert-dialog trigger via Base UI `render`. */
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  targetEmail?: string;
  requireTypedEmail?: boolean;
  onConfirm: () => void;
};

export function AdminActionConfirmation({
  trigger,
  title,
  description,
  confirmLabel,
  targetEmail,
  requireTypedEmail = false,
  onConfirm,
}: AdminActionConfirmationProps) {
  const [open, setOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState('');
  const needsEmail = requireTypedEmail && Boolean(targetEmail);
  const confirmed = !needsEmail || typedEmail === targetEmail;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setTypedEmail('');
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {needsEmail ? (
          <Label className="flex flex-col gap-2 text-sm">
            Type <span className="font-mono text-xs">{targetEmail}</span> to confirm
            <Input
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              aria-label={`Type ${targetEmail} to confirm`}
              autoComplete="off"
              spellCheck={false}
            />
          </Label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!confirmed} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
