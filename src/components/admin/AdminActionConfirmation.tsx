'use client';

import { useTranslations } from 'next-intl';

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
  trigger?: ReactElement;
  /**
   * Controlled open state, for a control that must keep its own role — a Switch passed as
   * `trigger` would be re-rendered as a button. Omit both to let `trigger` open the dialog.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  targetEmail?: string;
  requireTypedEmail?: boolean;
  onConfirm: () => void;
};

export function AdminActionConfirmation({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  targetEmail,
  requireTypedEmail = false,
  onConfirm,
}: AdminActionConfirmationProps) {
  const uiText = useTranslations('admin');
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [typedEmail, setTypedEmail] = useState('');
  const setOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) setTypedEmail('');
  };
  const needsEmail = requireTypedEmail && Boolean(targetEmail);
  const confirmed = !needsEmail || typedEmail === targetEmail;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {needsEmail ? (
          <Label className="flex flex-col gap-2 text-sm">
            {uiText.rich('m_3e9da08fe8', {
              emailSlot: (chunks) => <span className="font-mono text-xs">{chunks}</span>,
              email: targetEmail ?? '',
            })}
            <Input
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              aria-label={uiText('m_5b0b628ed4', { v0: String(targetEmail) })}
              autoComplete="off"
              spellCheck={false}
            />
          </Label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
          {/* AlertDialogAction is a plain Button, not a Close: confirming closes explicitly. */}
          <AlertDialogAction
            disabled={!confirmed}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
