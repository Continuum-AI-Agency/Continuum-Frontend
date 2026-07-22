'use client';

import { DOCUMENT_CATEGORY_DEFAULT, type DocumentCategory } from '@continuum/contracts';
import { useCallback, useState } from 'react';
import {
  createInlineDocumentUrlAction,
  createSignedDocumentUrlAction,
} from '@/app/(post-auth)/settings/actions';
import { removeDocumentAction, updateDocumentCategoryAction } from '@/app/onboarding/actions';
import {
  isAcceptedDocumentMime,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
} from '@/lib/documents/uploadLimits';
import type { OnboardingDocument, OnboardingState } from '@/lib/onboarding/state';
import { createBrandId } from '@/lib/onboarding/state';
import { sanitizeStorageFileName } from '@/lib/storage/sanitize';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const STORAGE_BUCKET = 'brand-docs';

export type UploadEntry = {
  key: string;
  file: File;
  status: 'uploading' | 'error';
  error?: string;
  category: DocumentCategory;
};

type UploadResponse = {
  document: OnboardingDocument;
  state: OnboardingState;
};

export type DocumentMutationsHandle = {
  uploads: UploadEntry[];
  uploadFiles: (
    files: File[],
    onApplied?: (state: OnboardingState) => void,
    category?: DocumentCategory,
  ) => Promise<{ succeeded: number; failed: number }>;
  retryUpload: (key: string, onApplied?: (state: OnboardingState) => void) => Promise<boolean>;
  discardUpload: (key: string) => void;
  removeDocument: (
    documentId: string,
    onApplied?: (state: OnboardingState) => void,
  ) => Promise<void>;
  updateCategory: (
    documentId: string,
    category: DocumentCategory,
    onApplied?: (state: OnboardingState) => void,
  ) => Promise<void>;
  openSignedUrl: (storagePath: string) => Promise<string>;
  openInlineUrl: (storagePath: string) => Promise<string>;
};

export function useDocumentMutations(brandId: string): DocumentMutationsHandle {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  const uploadOne = useCallback(
    async (entry: UploadEntry, onApplied?: (state: OnboardingState) => void): Promise<boolean> => {
      setUploads((prev) =>
        prev.map((p) =>
          p.key === entry.key ? { ...p, status: 'uploading', error: undefined } : p,
        ),
      );

      const fail = (message: string): false => {
        setUploads((prev) =>
          prev.map((p) => (p.key === entry.key ? { ...p, status: 'error', error: message } : p)),
        );
        return false;
      };

      const { file } = entry;
      if (file.size > MAX_DOCUMENT_BYTES) {
        return fail(`File exceeds ${MAX_DOCUMENT_MB} MB limit`);
      }
      if (!isAcceptedDocumentMime(file.type)) {
        return fail(`Unsupported file type: ${file.type || 'unknown'}`);
      }

      const supabase = createSupabaseBrowserClient();
      const documentId = createBrandId();
      const sanitizedFileName = sanitizeStorageFileName(file.name);
      const storagePath = `${brandId}/${documentId}/${sanitizedFileName}`;

      // Upload bytes straight to storage so large files (e.g. PDFs > 4.5 MB)
      // bypass the Vercel Function request-body cap. The route only records
      // metadata afterwards.
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) {
        return fail(uploadError.message || `Failed to upload ${file.name}`);
      }

      try {
        const response = await fetch('/api/onboarding/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            documentId,
            storagePath,
            fileName: sanitizedFileName,
            displayName: file.name,
            mimeType: file.type,
            size: file.size,
            source: 'upload',
            category: entry.category,
          }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `Upload failed (${response.status})`);
        }
        const data = (await response.json()) as UploadResponse;
        onApplied?.(data.state);
        setUploads((prev) => prev.filter((p) => p.key !== entry.key));
        return true;
      } catch (err) {
        // Recording failed after the bytes landed; remove the orphaned object.
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath])
          .catch(() => undefined);
        const message = err instanceof Error ? err.message : `Failed to upload ${file.name}`;
        return fail(message);
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

  const removeDocument = useCallback<DocumentMutationsHandle['removeDocument']>(
    async (documentId, onApplied) => {
      const nextState = await removeDocumentAction(brandId, documentId);
      onApplied?.(nextState);
    },
    [brandId],
  );

  const updateCategory = useCallback<DocumentMutationsHandle['updateCategory']>(
    async (documentId, category, onApplied) => {
      const nextState = await updateDocumentCategoryAction(brandId, documentId, category);
      onApplied?.(nextState);
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
    removeDocument,
    updateCategory,
    openSignedUrl,
    openInlineUrl,
  };
}
