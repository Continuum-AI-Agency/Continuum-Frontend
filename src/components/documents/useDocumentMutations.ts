"use client";

import { useCallback, useState } from "react";
import { DOCUMENT_CATEGORY_DEFAULT, type DocumentCategory } from "@continuum/contracts";
import type { OnboardingDocument, OnboardingState } from "@/lib/onboarding/state";
import { removeDocumentAction, updateDocumentCategoryAction } from "@/app/onboarding/actions";
import {
  createInlineDocumentUrlAction,
  createSignedDocumentUrlAction,
} from "@/app/(post-auth)/settings/actions";

export type UploadEntry = {
  key: string;
  file: File;
  status: "uploading" | "error";
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
  removeDocument: (documentId: string, onApplied?: (state: OnboardingState) => void) => Promise<void>;
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
        prev.map((p) => (p.key === entry.key ? { ...p, status: "uploading", error: undefined } : p)),
      );
      try {
        const formData = new FormData();
        formData.append("brandId", brandId);
        formData.append("file", entry.file);
        formData.append("source", "upload");
        formData.append("category", entry.category);

        const response = await fetch("/api/onboarding/documents", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `Upload failed (${response.status})`);
        }
        const data = (await response.json()) as UploadResponse;
        onApplied?.(data.state);
        setUploads((prev) => prev.filter((p) => p.key !== entry.key));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to upload ${entry.file.name}`;
        setUploads((prev) =>
          prev.map((p) => (p.key === entry.key ? { ...p, status: "error", error: message } : p)),
        );
        return false;
      }
    },
    [brandId],
  );

  const uploadFiles = useCallback<DocumentMutationsHandle["uploadFiles"]>(
    async (files, onApplied, category = DOCUMENT_CATEGORY_DEFAULT) => {
      if (files.length === 0) return { succeeded: 0, failed: 0 };
      const fresh: UploadEntry[] = files.map((file, idx) => ({
        key: `${Date.now()}-${idx}-${file.name}`,
        file,
        status: "uploading",
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

  const retryUpload = useCallback<DocumentMutationsHandle["retryUpload"]>(
    async (key, onApplied) => {
      const entry = uploads.find((u) => u.key === key);
      if (!entry) return false;
      return uploadOne(entry, onApplied);
    },
    [uploadOne, uploads],
  );

  const discardUpload = useCallback<DocumentMutationsHandle["discardUpload"]>((key) => {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  const removeDocument = useCallback<DocumentMutationsHandle["removeDocument"]>(
    async (documentId, onApplied) => {
      const nextState = await removeDocumentAction(brandId, documentId);
      onApplied?.(nextState);
    },
    [brandId],
  );

  const updateCategory = useCallback<DocumentMutationsHandle["updateCategory"]>(
    async (documentId, category, onApplied) => {
      const nextState = await updateDocumentCategoryAction(brandId, documentId, category);
      onApplied?.(nextState);
    },
    [brandId],
  );

  const openSignedUrl = useCallback<DocumentMutationsHandle["openSignedUrl"]>(
    async (storagePath) => createSignedDocumentUrlAction(storagePath),
    [],
  );

  const openInlineUrl = useCallback<DocumentMutationsHandle["openInlineUrl"]>(
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
