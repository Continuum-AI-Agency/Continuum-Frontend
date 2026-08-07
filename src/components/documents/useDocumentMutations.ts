'use client';

import { DOCUMENT_CATEGORY_DEFAULT, type DocumentCategory } from '@continuum/contracts';
import { useCallback, useState } from 'react';
import {
  createInlineDocumentUrlAction,
  createSignedDocumentUrlAction,
} from '@/app/(post-auth)/settings/actions';
import {
  archiveDocumentAction,
  deleteDocumentPermanentlyAction,
  renameDocumentAction,
  restoreDocumentAction,
  saveDocumentPermanentlyAction,
  updateDocumentCategoryAction,
} from '@/app/onboarding/actions';
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import type { OnboardingState } from '@/lib/onboarding/state';

export type UploadEntry = {
  key: string;
  file: File;
  status: 'uploading' | 'error';
  error?: string;
  category: DocumentCategory;
};

type ApplyState = (state: OnboardingState) => void;

export type DocumentMutationsHandle = {
  uploads: UploadEntry[];
  uploadFiles: (
    files: File[],
    onApplied?: ApplyState,
    category?: DocumentCategory,
  ) => Promise<{ succeeded: number; failed: number }>;
  retryUpload: (key: string, onApplied?: ApplyState) => Promise<boolean>;
  discardUpload: (key: string) => void;
  /** Swap a document's bytes, keeping its id, category and history. */
  replaceDocumentFile: (
    documentId: string,
    currentVersion: number,
    file: File,
    onApplied?: ApplyState,
  ) => Promise<void>;
  renameDocument: (
    documentId: string,
    displayName: string,
    onApplied?: ApplyState,
  ) => Promise<void>;
  /** Reversible take-down. */
  archiveDocument: (documentId: string, onApplied?: ApplyState) => Promise<void>;
  restoreDocument: (documentId: string, onApplied?: ApplyState) => Promise<void>;
  /** Irreversible; only offered from the Archived view. */
  deleteDocumentPermanently: (documentId: string, onApplied?: ApplyState) => Promise<void>;
  /** Promote a one-off chat upload to permanent brand knowledge. */
  saveDocumentPermanently: (documentId: string, onApplied?: ApplyState) => Promise<void>;
  updateCategory: (
    documentId: string,
    category: DocumentCategory,
    onApplied?: ApplyState,
  ) => Promise<void>;
  openSignedUrl: (storagePath: string) => Promise<string>;
  openInlineUrl: (storagePath: string) => Promise<string>;
};

export function useDocumentMutations(brandId: string): DocumentMutationsHandle {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  const uploadOne = useCallback(
    async (entry: UploadEntry, onApplied?: ApplyState): Promise<boolean> => {
      setUploads((prev) =>
        prev.map((p) =>
          p.key === entry.key ? { ...p, status: 'uploading', error: undefined } : p,
        ),
      );

      try {
        // Every gate, the direct-to-storage upload and the orphan cleanup live in the
        // shared uploader — this hook only owns the in-flight chip state.
        const result = await uploadBrandDocument({
          brandId,
          file: entry.file,
          category: entry.category,
          syncOnboardingState: true,
        });
        if (result.state) onApplied?.(result.state);
        setUploads((prev) => prev.filter((p) => p.key !== entry.key));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to upload ${entry.file.name}`;
        setUploads((prev) =>
          prev.map((p) => (p.key === entry.key ? { ...p, status: 'error', error: message } : p)),
        );
        return false;
      }
    },
    [brandId],
  );

  const uploadFiles = useCallback<DocumentMutationsHandle['uploadFiles']>(
    async (files, onApplied, category = DOCUMENT_CATEGORY_DEFAULT) => {
      if (files.length === 0) return { succeeded: 0, failed: 0 };
      const fresh: UploadEntry[] = files.map((file, idx) => ({
        key: `${Date.now()}-${idx}-${file.name}`,
        file,
        status: 'uploading',
        category,
      }));
      setUploads((prev) => [...prev, ...fresh]);
      let succeeded = 0;
      let failed = 0;
      for (const entry of fresh) {
        const ok = await uploadOne(entry, onApplied);
        if (ok) succeeded += 1;
        else failed += 1;
      }
      return { succeeded, failed };
    },
    [uploadOne],
  );

  const retryUpload = useCallback<DocumentMutationsHandle['retryUpload']>(
    async (key, onApplied) => {
      const entry = uploads.find((u) => u.key === key);
      if (!entry) return false;
      return uploadOne(entry, onApplied);
    },
    [uploadOne, uploads],
  );

  const discardUpload = useCallback<DocumentMutationsHandle['discardUpload']>((key) => {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  const replaceDocumentFile = useCallback<DocumentMutationsHandle['replaceDocumentFile']>(
    async (documentId, currentVersion, file, onApplied) => {
      const result = await uploadBrandDocument({
        brandId,
        file,
        syncOnboardingState: true,
        replace: { documentId, currentVersion },
      });
      if (result.state) onApplied?.(result.state);
    },
    [brandId],
  );

  const renameDocument = useCallback<DocumentMutationsHandle['renameDocument']>(
    async (documentId, displayName, onApplied) => {
      onApplied?.(await renameDocumentAction(brandId, documentId, displayName));
    },
    [brandId],
  );

  const archiveDocument = useCallback<DocumentMutationsHandle['archiveDocument']>(
    async (documentId, onApplied) => {
      onApplied?.(await archiveDocumentAction(brandId, documentId));
    },
    [brandId],
  );

  const restoreDocument = useCallback<DocumentMutationsHandle['restoreDocument']>(
    async (documentId, onApplied) => {
      onApplied?.(await restoreDocumentAction(brandId, documentId));
    },
    [brandId],
  );

  const deleteDocumentPermanently = useCallback<
    DocumentMutationsHandle['deleteDocumentPermanently']
  >(
    async (documentId, onApplied) => {
      onApplied?.(await deleteDocumentPermanentlyAction(brandId, documentId));
    },
    [brandId],
  );

  const saveDocumentPermanently = useCallback<DocumentMutationsHandle['saveDocumentPermanently']>(
    async (documentId, onApplied) => {
      onApplied?.(await saveDocumentPermanentlyAction(brandId, documentId));
    },
    [brandId],
  );

  const updateCategory = useCallback<DocumentMutationsHandle['updateCategory']>(
    async (documentId, category, onApplied) => {
      onApplied?.(await updateDocumentCategoryAction(brandId, documentId, category));
    },
    [brandId],
  );

  const openSignedUrl = useCallback<DocumentMutationsHandle['openSignedUrl']>(
    async (storagePath) => createSignedDocumentUrlAction(storagePath),
    [],
  );

  const openInlineUrl = useCallback<DocumentMutationsHandle['openInlineUrl']>(
    async (storagePath) => createInlineDocumentUrlAction(storagePath),
    [],
  );

  return {
    uploads,
    uploadFiles,
    retryUpload,
    discardUpload,
    replaceDocumentFile,
    renameDocument,
    archiveDocument,
    restoreDocument,
    deleteDocumentPermanently,
    saveDocumentPermanently,
    updateCategory,
    openSignedUrl,
    openInlineUrl,
  };
}
