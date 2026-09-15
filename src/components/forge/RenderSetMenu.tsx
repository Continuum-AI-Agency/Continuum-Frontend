'use client';

import { Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

// The one naming dialog the Render tab uses: a new or renamed render set, and "Save as inputs".
// Which set is open, and every way to change that, lives in RenderSetRail.

/** One text field in a dialog — what `window.prompt` was, without the browser chrome. */
export function NameDialog({
  open,
  title,
  description,
  initialName,
  confirmLabel,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialName: string;
  confirmLabel: string;
  /** Resolves when the work is done; the caller closes the dialog. */
  onConfirm: (name: string) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onConfirm(name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Name"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
