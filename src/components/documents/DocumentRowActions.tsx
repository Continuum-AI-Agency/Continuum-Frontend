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
import { useTranslations } from 'next-intl';
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
import { DocumentProjectSubmenu } from './DocumentProjectSubmenu';
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
  brandId,
  className,
}: {
  doc: DocumentView;
  actions: DocumentRowActionHandlers;
  /** Needed for the project submenu; absent on the onboarding variant, which has no brand yet. */
  brandId?: string;
  className?: string;
}) {
  const uiText = useTranslations('common');
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
          aria-label={uiText('m_2fcb3663ef', { v0: String(doc.name) })}
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
                {uiText('open_ed077f3')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void actions.onDownload(doc.storagePath ?? '')}>
                <Download className="mr-2 h-3.5 w-3.5" />
                {uiText('download_d6eafe8')}
              </DropdownMenuItem>
            </>
          ) : null}

          {!archived && brandId ? (
            <>
              <DropdownMenuSeparator />
              <DocumentProjectSubmenu brandId={brandId} doc={doc} />
            </>
          ) : null}

          {!archived ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                {uiText('m_94ac9a58b6')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => replaceInputRef.current?.click()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {uiText('m_42ecfb8083')}
              </DropdownMenuItem>
            </>
          ) : null}

          {ephemeral && !archived ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void actions.onSavePermanently(doc)}>
                <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
                {uiText('m_020fd1b143')}
              </DropdownMenuItem>
            </>
          ) : null}

          <DropdownMenuSeparator />
          {archived ? (
            <>
              <DropdownMenuItem onSelect={() => void actions.onRestore(doc)}>
                <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                {uiText('m_3cbe6d6b9a')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                {uiText('m_e63b5153bd')}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void actions.onArchive(doc)}>
              <Undo2 className="mr-2 h-3.5 w-3.5" />
              {uiText('m_ad8a1a7943')}
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
            <AlertDialogTitle>
              {uiText('m_4b267561dc')}
              {doc.name}
              {uiText('m_12c3359319')}
            </AlertDialogTitle>
            <AlertDialogDescription>{uiText('m_9f347c2eeb')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void actions.onDeletePermanently(doc)}>
              {uiText('m_e63b5153bd')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
