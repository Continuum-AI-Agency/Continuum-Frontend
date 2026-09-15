'use client';

import type { ForgeRenderSet } from '@continuum/contracts';
import { Check, ChevronDown, FilePlus2, History, Loader2, Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

// The render set you are editing, and every way to change which one that is. Anything that
// replaces the rows on screen goes through the grid's `confirmDiscard`, the one place that asks
// first when they hold edits nobody saved — the template picker and "open in Render" use it too.

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

export function RenderSetMenu({
  sets,
  activeSet,
  confirmDiscard,
  canCreate,
  draftAvailable,
  onSwitch,
  onNew,
  onRename,
  onDelete,
  onImportDraft,
}: {
  sets: ForgeRenderSet[];
  activeSet: ForgeRenderSet | null;
  /** Runs `action` now, or after the person agrees to lose the unsaved edits on screen. */
  confirmDiscard: (action: () => void) => void;
  canCreate: boolean;
  /** An unsaved browser draft exists that is not on screen. */
  draftAvailable: boolean;
  onSwitch: (set: ForgeRenderSet) => void;
  onNew: (name: string) => Promise<void> | void;
  onRename: (name: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onImportDraft: () => void;
}) {
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="max-w-56 gap-1.5"
              aria-label="Render set"
            >
              <span className="truncate">{activeSet?.name ?? 'Unsaved set'}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-60">
          {sets.length ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Switch set</DropdownMenuLabel>
              {sets.map((set) => (
                <DropdownMenuItem
                  key={set.id}
                  onClick={() =>
                    set.id === activeSet?.id ? undefined : confirmDiscard(() => onSwitch(set))
                  }
                >
                  <Check className={set.id === activeSet?.id ? '' : 'invisible'} aria-hidden />
                  <span className="truncate">{set.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
          {sets.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem disabled={!canCreate} onClick={() => confirmDiscard(() => setDialog('new'))}>
            <FilePlus2 aria-hidden /> New set…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!activeSet} onClick={() => setDialog('rename')}>
            <Pencil aria-hidden /> Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!activeSet}
            onClick={() => setDialog('delete')}
          >
            <Trash2 aria-hidden /> Delete…
          </DropdownMenuItem>
          {draftAvailable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => confirmDiscard(onImportDraft)}>
                <History aria-hidden /> Import browser draft
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={dialog === 'new'}
        title="New render set"
        description="Starts from one row seeded with the designer's values."
        initialName="Untitled set"
        confirmLabel="Create"
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async (name) => {
          await onNew(name);
          setDialog(null);
        }}
      />
      <NameDialog
        open={dialog === 'rename'}
        title="Rename render set"
        initialName={activeSet?.name ?? ''}
        confirmLabel="Rename"
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async (name) => {
          await onRename(name);
          setDialog(null);
        }}
      />
      <AlertDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && !deleting && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{activeSet?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved rows go. Renders already made from this set stay in Renders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await onDelete();
                } finally {
                  setDeleting(false);
                  setDialog(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
