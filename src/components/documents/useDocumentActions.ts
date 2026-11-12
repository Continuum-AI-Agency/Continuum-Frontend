'use client';

import type { DocumentCategory } from '@continuum/contracts';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
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
  const getUiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('common');

  const { show } = useToast();

  return useMemo<DocumentRowActionHandlers>(() => {
    const fail = (title: string, err: unknown, fallback: string) => {
      show({
        title,
        description: getUiErrorMessage(err),
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
            title: tUi('m_e8144c4c24'),
            description: tUi('m_bf472e4d80'),
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
            title: tUi('m_66558a531a'),
            description: tUi('m_a5a7345c0c'),
            variant: 'success',
            action: {
              label: tUi('undo_a8283ad'),
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
            title: tUi('m_2026f383a3'),
            description: tUi('m_c2bec20c56'),
            variant: 'success',
          });
        } catch (err) {
          fail('Restore failed', err, 'Could not restore document.');
        }
      },

      onDeletePermanently: async (doc) => {
        try {
          await mutations.deleteDocumentPermanently(doc.id, onStateChange);
          show({ title: tUi('m_e4db4d66b4'), variant: 'success' });
        } catch (err) {
          fail('Delete failed', err, 'Could not delete document.');
        }
      },

      onSavePermanently: async (doc) => {
        try {
          await mutations.saveDocumentPermanently(doc.id, onStateChange);
          show({
            title: tUi('m_137c95c29f'),
            description: tUi('m_01fc6c4a71'),
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
  }, [mutations, onStateChange, show, getUiErrorMessage, tUi]);
}
