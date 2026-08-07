'use client';

// THE browser-side brand-document uploader. Previously this ~55-line sequence
// (validate -> mint id -> sanitize -> direct-to-storage -> POST metadata -> clean up
// the orphan on failure) existed verbatim in two places, and the chat composer would
// have made a third. It lives here once.
//
// Bytes go straight from the browser to Supabase Storage rather than through the API
// route, because Vercel Functions cap a request body at 4.5 MB and documents run to
// 25 MB. The route only records metadata afterwards, which is why the orphan cleanup
// below matters: a successful upload followed by a failed POST would otherwise leave
// a file nobody owns. There are 18 such orphans in prod from before this existed.

import {
  DOCUMENT_CATEGORY_DEFAULT,
  DOCUMENT_RETENTION_DEFAULT,
  type DocumentCategory,
  type DocumentRetention,
} from '@continuum/contracts';
import type { OnboardingDocument, OnboardingState } from '@/lib/onboarding/state';
import { createBrandId } from '@/lib/onboarding/state';
import { sanitizeStorageFileName } from '@/lib/storage/sanitize';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isAcceptedDocumentMime, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_MB } from './uploadLimits';

export const BRAND_DOCS_BUCKET = 'brand-docs';

export type UploadBrandDocumentParams = {
  brandId: string;
  file: File;
  category?: DocumentCategory;
  retention?: DocumentRetention;
  /**
   * Owning chat/MCP session for an ephemeral upload. Server-derived by the caller —
   * it is what scopes a one-off document to the conversation that produced it.
   */
  scopeKey?: string;
  /**
   * Mirror the upload into the onboarding state blob. Only the onboarding wizard and
   * the settings Knowledge page want this; AI Studio and chat deliberately do not,
   * so an already-onboarded brand never has its onboarding state mutated.
   */
  syncOnboardingState?: boolean;
  /**
   * Replace an existing document's bytes, keeping its id, category and history.
   * Supply the document's current version so the new object lands on a fresh path.
   */
  replace?: { documentId: string; currentVersion: number };
};

export type UploadBrandDocumentResult = {
  documentId: string;
  storagePath: string;
  document: OnboardingDocument;
  /** Only populated when syncOnboardingState was requested. */
  state: OnboardingState | null;
};

/**
 * Versioned object path. A replace writes a NEW object rather than overwriting:
 * overwriting invalidates every outstanding signed URL and exposes half-written bytes
 * while the new file uploads, whereas a new path flips `storage_path` only once the
 * bytes are confirmed present. The superseded object is freed by the purge sweep.
 *
 * Still satisfies validateDocumentUploadMetadata, which only requires the
 * `${brandId}/${documentId}/` prefix.
 */
function buildStoragePath(
  brandId: string,
  documentId: string,
  version: number,
  fileName: string,
): string {
  return `${brandId}/${documentId}/v${version}/${fileName}`;
}

export async function uploadBrandDocument({
  brandId,
  file,
  category = DOCUMENT_CATEGORY_DEFAULT,
  retention = DOCUMENT_RETENTION_DEFAULT,
  scopeKey,
  syncOnboardingState = false,
  replace,
}: UploadBrandDocumentParams): Promise<UploadBrandDocumentResult> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File exceeds ${MAX_DOCUMENT_MB} MB limit`);
  }
  if (!isAcceptedDocumentMime(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
  }

  const supabase = createSupabaseBrowserClient();
  const documentId = replace?.documentId ?? createBrandId();
  const version = replace ? replace.currentVersion + 1 : 1;
  const sanitizedFileName = sanitizeStorageFileName(file.name);
  const storagePath = buildStoragePath(brandId, documentId, version, sanitizedFileName);

  const { error: uploadError } = await supabase.storage
    .from(BRAND_DOCS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    throw new Error(uploadError.message || `Failed to upload ${file.name}`);
  }

  try {
    const response = await fetch('/api/brand-documents', {
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
        category,
        retention,
        scopeKey,
        mode: replace ? 'replace' : 'create',
        syncOnboardingState,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Upload failed (${response.status})`);
    }

    const data = (await response.json()) as {
      document: OnboardingDocument;
      state?: OnboardingState | null;
    };
    return {
      documentId,
      storagePath,
      document: data.document,
      state: data.state ?? null,
    };
  } catch (err) {
    // The bytes landed but nothing owns them. Remove the object rather than leave an
    // orphan the nightly purge has to reason about.
    await supabase.storage
      .from(BRAND_DOCS_BUCKET)
      .remove([storagePath])
      .catch(() => undefined);
    throw err instanceof Error ? err : new Error(`Failed to upload ${file.name}`);
  }
}
