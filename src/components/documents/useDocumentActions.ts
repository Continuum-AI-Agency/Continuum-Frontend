'use client';

import type { DocumentCategory } from '@continuum/contracts';
import { useMemo } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { OnboardingState } from '@/lib/onboarding/state';
import type { DocumentView } from './types';
import type { DocumentMutationsHandle } from './useDocumentMutations';

// Every row action is "call a mutation, then say something true about what happened".
// That try/catch/toast shape was already inlined six times in DocumentManager; five
// more actions would have made that component unreadable, so it lives here once.
export type DocumentRowActionHandlers = {
  onOpenInline: (storagePath: string) => void;
  onDownload: (storagePath: string) => Promise<void>;
  onRename: (doc: DocumentView, displayName: string) => Promise<void>;
  onReplaceFile: (doc: DocumentView, file: File) => Promise<void>;
  onArchive: (doc: DocumentView) => Promise<void>;
  onRestore: (doc: DocumentView) => Promise<void>;
  onDeletePermanently: (doc: DocumentView) => Promise<void>;
  onSavePermanently: (doc: DocumentView) => Promise<void>;
  onCategoryChange: (documentId: string, category: DocumentCategory) => Promise<void>;
};

export function useDocumentActions(
  mutations: DocumentMutationsHandle,
  onStateChange?: (state: OnboardingState) => void,
): DocumentRowActionHandlers {
  const { show } = useToast();

  return useMemo<DocumentRowActionHandlers>(() => {
    const fail = (title: string, err: unknown, fallback: string) => {
      show({
        title,
        description: err instanceof Error ? err.message : fallback,
        variant: 'error',
      });
    };

    return {
      onOpenInline: (storagePath) => {
        if (!storagePath) return;
        void mutations
          .openInlineUrl(storagePath)
          .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
          .catch((err) => fail('Open failed', err, 'Could not open document.'));
      },

      onDownload: async (storagePath) => {
        if (!storagePath) return;
        try {
          const url = await mutations.openSignedUrl(storagePath);
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
          fail('Download failed', err, 'Could not generate a download link.');
        }
      },

      onRename: async (doc, displayName) => {
        try {
          await mutations.renameDocument(doc.id, displayName, onStateChange);
        } catch (err) {
          fail('Rename failed', err, 'Could not rename document.');
        }
      },

      onReplaceFile: async (doc, file) => {
        try {
          await mutations.replaceDocumentFile(doc.id, doc.version ?? 1, file, onStateChange);
          show({
            title: 'Replacing document',
            description: 'The new file is being indexed. The old version is kept until it is done.',
            variant: 'info',
          });
        } catch (err) {
          fail('Replace failed', err, 'Could not replace the file.');
        }
      },

      onArchive: async (doc) => {
        try {
          await mutations.archiveDocument(doc.id, onStateChange);
          show({
            title: 'Document taken down',
            description: 'Agents can no longer use it. Find it under Archived.',
            variant: 'success',
            action: {
              label: 'Undo',
              onClick: () => {
                void mutations
                  .restoreDocument(doc.id, onStateChange)
                  .catch((err) => fail('Restore failed', err, 'Could not restore document.'));
              },
            },
          });
        } catch (err) {
          fail('Take down failed', err, 'Could not take down document.');
        }
      },

      onRestore: async (doc) => {
        try {
          await mutations.restoreDocument(doc.id, onStateChange);
          // Deliberately explicit: chunks were purged on archive, so a restored
          // document is readable but NOT searchable until it is re-ingested. Saying so
          // beats letting someone assume the agent can see it again.
          show({
            title: 'Document restored',
            description: 'Replace the file to make it searchable by agents again.',
            variant: 'success',
          });
        } catch (err) {
          fail('Restore failed', err, 'Could not restore document.');
        }
      },

      onDeletePermanently: async (doc) => {
        try {
          await mutations.deleteDocumentPermanently(doc.id, onStateChange);
          show({ title: 'Document deleted', variant: 'success' });
        } catch (err) {
          fail('Delete failed', err, 'Could not delete document.');
        }
      },

      onSavePermanently: async (doc) => {
        try {
          await mutations.saveDocumentPermanently(doc.id, onStateChange);
          show({
            title: 'Saved to Knowledge',
            description: 'This document is now permanent brand knowledge for every agent.',
            variant: 'success',
          });
        } catch (err) {
          fail('Save failed', err, 'Could not save document.');
        }
      },

      onCategoryChange: async (documentId, category) => {
        try {
          await mutations.updateCategory(documentId, category, onStateChange);
        } catch (err) {
          fail('Update failed', err, 'Could not update category.');
        }
      },
    };
  }, [mutations, onStateChange, show]);
}
