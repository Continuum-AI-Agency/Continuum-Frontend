// Server-side half of a brand-document upload: validate the metadata, prove the
// caller may write to the brand, prove the object actually landed, then kick off the
// embed pipeline and record the row.
//
// Extracted from the two near-identical route handlers it replaces
// (/api/onboarding/documents and /api/ai-studio/documents). Those differed in exactly
// two ways, both now parameters: whether to mirror into the onboarding state blob,
// and whether the category was coerced. The AI Studio copy did NOT coerce, so it
// could persist a value that violates brand_documents_category_check — collapsing
// them fixes that.

import {
  EPHEMERAL_DOCUMENT_TTL_DAYS,
  toDocumentCategory,
  toDocumentRetention,
} from '@continuum/contracts';
import type { OnboardingDocument, OnboardingState } from '@/lib/onboarding/state';
import { appendDocument, ensureOnboardingState } from '@/lib/onboarding/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDocumentUploadMetadata } from './uploadLimits';

const STORAGE_BUCKET = 'brand-docs';

export type RecordDocumentUploadBody = {
  brandId?: unknown;
  documentId?: unknown;
  storagePath?: unknown;
  fileName?: unknown;
  displayName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  source?: unknown;
  category?: unknown;
  retention?: unknown;
  scopeKey?: unknown;
  mode?: unknown;
  syncOnboardingState?: unknown;
};

export type RecordDocumentUploadResult =
  | { ok: true; document: OnboardingDocument; state: OnboardingState | null }
  | { ok: false; status: number; error: string };

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function objectExists(supabase: ServerClient, storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, lastSlash);
  const name = storagePath.slice(lastSlash + 1);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (error) return false;
  return (data ?? []).some((entry) => entry.name === name);
}

export async function recordDocumentUpload(
  body: RecordDocumentUploadBody,
): Promise<RecordDocumentUploadResult> {
  const metadata = {
    brandId: typeof body.brandId === 'string' ? body.brandId : undefined,
    documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
    storagePath: typeof body.storagePath === 'string' ? body.storagePath : undefined,
    fileName: typeof body.fileName === 'string' ? body.fileName : undefined,
    mimeType: typeof body.mimeType === 'string' ? body.mimeType : '',
    size: typeof body.size === 'number' ? body.size : undefined,
  };

  const validation = validateDocumentUploadMetadata(metadata);
  if (!validation.ok) {
    return { ok: false, status: validation.status, error: validation.error };
  }

  const brandId = metadata.brandId as string;
  const documentId = metadata.documentId as string;
  const storagePath = metadata.storagePath as string;
  const fileName = metadata.fileName ?? storagePath.slice(storagePath.lastIndexOf('/') + 1);
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName : fileName;
  const mimeType = metadata.mimeType;
  const size = metadata.size as number;
  const source = (
    typeof body.source === 'string' ? body.source : 'upload'
  ) as OnboardingDocument['source'];
  const category = toDocumentCategory(body.category);
  const retention = toDocumentRetention(body.retention);
  const scopeKey = typeof body.scopeKey === 'string' && body.scopeKey ? body.scopeKey : undefined;
  const replace = body.mode === 'replace';
  const syncOnboardingState = body.syncOnboardingState === true;

  // An ephemeral document with no owning session would be retrievable by nobody yet
  // still cost an embed. Reject rather than create something unreachable.
  if (retention === 'ephemeral' && !scopeKey) {
    return {
      ok: false,
      status: 400,
      error: 'scopeKey is required for an ephemeral upload',
    };
  }

  const supabase = await createSupabaseServerClient();

  // Authenticated caller required; brand membership enforced via RLS (returns
  // nothing if the user is not a member of the brand).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const { data: brandRow } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id')
    .eq('id', brandId)
    .maybeSingle();
  if (!brandRow) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  // A replace must target a document that already exists in THIS brand. Without this,
  // a caller could hand an arbitrary documentId to the edge function and rely on it to
  // decide ownership. The edge function does refuse cross-brand writes, but failing
  // here gives the user a real error instead of a silently dropped background job.
  if (replace) {
    const { data: existing } = await supabase
      .schema('brand_profiles')
      .from('brand_documents')
      .select('id')
      .eq('id', documentId)
      .eq('brand_id', brandId)
      .is('archived_at', null)
      .maybeSingle();
    if (!existing) {
      return { ok: false, status: 404, error: 'Document not found' };
    }
  }

  // Confirm the client actually uploaded the object before recording it, so we
  // never persist a document row that points at nothing.
  if (!(await objectExists(supabase, storagePath))) {
    return { ok: false, status: 422, error: 'Uploaded file not found in storage' };
  }

  if (syncOnboardingState) {
    await ensureOnboardingState(brandId);
  }

  type EmbedInvokeResult = { jobId?: string };
  const { data: invokeData, error: invokeError } =
    await supabase.functions.invoke<EmbedInvokeResult>('embed_document', {
      body: {
        brandId,
        documentId,
        source,
        category,
        storagePath,
        fileName,
        displayName,
        mimeType,
        retention,
        scopeKey,
        replace,
      },
    });

  // If processing never even started, record the document as failed instead of
  // leaving it "processing" forever — the row only ever advances to a terminal
  // state via the edge function's progress writes, so a failed kickoff would
  // otherwise hang the UI on "Extracting text" with no end state.
  const invokeFailed = Boolean(invokeError);
  if (invokeFailed) {
    console.error('embed_document invoke failed', invokeError);
  }

  // Mirrors the constant the edge function applies. Only used for the optimistic
  // response; the authoritative value arrives over Realtime from the stored row.
  const expiresAt =
    retention === 'ephemeral'
      ? new Date(Date.now() + EPHEMERAL_DOCUMENT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

  const document: OnboardingDocument = {
    id: documentId,
    name: displayName,
    source,
    category,
    retention,
    expiresAt,
    createdAt: new Date().toISOString(),
    status: invokeFailed ? 'error' : 'processing',
    progressStep: invokeFailed ? 'error' : 'uploading',
    progressPercent: 100,
    size,
    mimeType,
    storagePath,
    jobId: typeof invokeData?.jobId === 'string' ? invokeData.jobId : undefined,
    ...(invokeFailed
      ? {
          errorCode: 'INTERNAL_ERROR' as const,
          errorMessage: invokeError?.message ?? 'Could not start document processing.',
        }
      : {}),
  };

  // Ephemeral chat uploads are deliberately never mirrored into onboarding state —
  // that blob is the brand's curated intake, not a scratch space.
  const state =
    syncOnboardingState && retention === 'permanent'
      ? await appendDocument(brandId, document)
      : null;

  return { ok: true, document, state };
}
