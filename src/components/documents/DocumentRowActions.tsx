'use client';

import {
  ArchiveRestore,
  BookmarkPlus,
  Download,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ACCEPTED_DOCUMENT_EXTENSIONS } from '@/lib/documents/uploadLimits';
import { cn } from '@/lib/utils';
import { RenameDocumentDialog } from './RenameDocumentDialog';
import type { DocumentView } from './types';
import { isArchived, isEphemeral } from './types';
import type { DocumentRowActionHandlers } from './useDocumentActions';

// One overflow menu instead of a growing row of icon buttons. Rename, replace,
// save-permanently, archive and delete would have made five more always-or-hover
// visible controls per row; collapsing them keeps the row readable and leaves the
// category select as the only inline control, which is the one worth glancing at.
export function DocumentRowActions({
  doc,
  actions,
  className,
}: {
  doc: DocumentView;
  actions: DocumentRowActionHandlers;
  className?: string;
}) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const archived = isArchived(doc);
  const ephemeral = isEphemeral(doc);

  return (
    <>
      {/* Owned by this menu so "Replace file…" needs no dialog — the menu item just
          opens the OS picker, which is the whole interaction. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void actions.onReplaceFile(doc, file);
          if (replaceInputRef.current) replaceInputRef.current.value = '';
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${doc.name}`}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {doc.storagePath ? (
            <>
              <DropdownMenuItem onSelect={() => actions.onOpenInline(doc.storagePath ?? '')}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void actions.onDownload(doc.storagePath ?? '')}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Download
              </DropdownMenuItem>
            </>
          ) : null}

          {!archived ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => replaceInputRef.current?.click()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Replace file…
              </DropdownMenuItem>
            </>
          ) : null}

          {ephemeral && !archived ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void actions.onSavePermanently(doc)}>
                <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
                Save to Knowledge
              </DropdownMenuItem>
            </>
          ) : null}

          <DropdownMenuSeparator />
          {archived ? (
            <>
              <DropdownMenuItem onSelect={() => void actions.onRestore(doc)}>
                <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete permanently
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void actions.onArchive(doc)}>
              <Undo2 className="mr-2 h-3.5 w-3.5" />
              Take down
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDocumentDialog
        open={renameOpen}
        currentName={doc.name}
        onOpenChange={setRenameOpen}
        onSubmit={(displayName) => actions.onRename(doc, displayName)}
      />

      {/* Take-down is reversible and gets a toast with Undo; this one is not, so it
          gets the interrupting confirmation instead. */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doc.name}” permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the file and everything indexed from it. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void actions.onDeletePermanently(doc)}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
