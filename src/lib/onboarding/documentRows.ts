import type { OnboardingDocument } from './state';

const DOCUMENT_SOURCE_VALUES = new Set<OnboardingDocument['source']>([
  'upload',
  'canva',
  'figma',
  'google-drive',
  'sharepoint',
  'notion',
  'website',
]);

export type BrandDocumentRow = {
  id: string;
  brand_id: string;
  name: string;
  status: string | null;
  error_message: string | null;
  type: string | null;
  source: string | null;
  created_at: string;
  updated_at: string | null;
  size?: number | null;
  storage_path?: string | null;
  external_url?: string | null;
  retention?: string | null;
  expires_at?: string | null;
  archived_at?: string | null;
};

function normalizeDocumentStatus(status: string | null): OnboardingDocument['status'] {
  if (status === 'ready' || status === 'error') {
    return status;
  }
  return 'processing';
}

function normalizeDocumentSource(
  source: string | null,
  fallback: OnboardingDocument['source'],
): OnboardingDocument['source'] {
  if (source && DOCUMENT_SOURCE_VALUES.has(source as OnboardingDocument['source'])) {
    return source as OnboardingDocument['source'];
  }
  return fallback;
}

function documentsEqual(a: OnboardingDocument, b: OnboardingDocument): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.source === b.source &&
    a.createdAt === b.createdAt &&
    a.status === b.status &&
    (a.size ?? null) === (b.size ?? null) &&
    (a.externalUrl ?? null) === (b.externalUrl ?? null) &&
    (a.storagePath ?? null) === (b.storagePath ?? null) &&
    (a.jobId ?? null) === (b.jobId ?? null) &&
    (a.errorMessage ?? null) === (b.errorMessage ?? null) &&
    (a.retention ?? 'permanent') === (b.retention ?? 'permanent') &&
    (a.expiresAt ?? null) === (b.expiresAt ?? null)
  );
}

export function mergeDocumentFromRow(
  existing: OnboardingDocument | undefined,
  row: BrandDocumentRow,
): OnboardingDocument {
  const sourceFallback = existing?.source ?? 'upload';
  const status = normalizeDocumentStatus(row.status);
  const createdAt =
    existing?.createdAt ?? row.created_at ?? row.updated_at ?? new Date().toISOString();

  const merged: OnboardingDocument = {
    id: row.id,
    name:
      typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name
        : (existing?.name ?? 'Document'),
    source: normalizeDocumentSource(row.source, sourceFallback),
    createdAt,
    status,
  };

  const size = typeof row.size === 'number' ? row.size : existing?.size;
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
    merged.size = size;
  }

  const externalUrl = row.external_url ?? existing?.externalUrl;
  if (typeof externalUrl === 'string' && externalUrl.length > 0) {
    merged.externalUrl = externalUrl;
  }

  const storagePath = row.storage_path ?? existing?.storagePath;
  if (typeof storagePath === 'string' && storagePath.length > 0) {
    merged.storagePath = storagePath;
  }

  if (row.retention === 'permanent' || row.retention === 'ephemeral') {
    merged.retention = row.retention;
  }

  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  if (!Number.isNaN(expiresAt)) {
    merged.expiresAt = new Date(expiresAt).toISOString();
  }

  if (existing?.jobId) {
    merged.jobId = existing.jobId;
  }

  if (status === 'error') {
    const errorMessage = row.error_message?.trim() || existing?.errorMessage;
    if (errorMessage) {
      merged.errorMessage = errorMessage;
    }
  }

  return merged;
}

/**
 * Rebuild the onboarding document list from brand_documents, the source of truth. Knowledge
 * archives a document by setting archived_at on its row and never touches onboarding state, so
 * an archived row must drop out of the list here or its id keeps being sent as intake evidence.
 */
export function reconcileDocuments(
  documents: OnboardingDocument[],
  rows: BrandDocumentRow[],
): { documents: OnboardingDocument[]; dirty: boolean } {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const next: OnboardingDocument[] = [];
  let dirty = false;

  for (const document of documents) {
    const row = rowsById.get(document.id);
    if (!row) {
      next.push(document);
      continue;
    }
    rowsById.delete(document.id);
    if (row.archived_at) {
      dirty = true;
      continue;
    }
    const merged = mergeDocumentFromRow(document, row);
    if (!documentsEqual(document, merged)) dirty = true;
    next.push(merged);
  }

  for (const row of rowsById.values()) {
    if (row.archived_at) continue;
    next.push(mergeDocumentFromRow(undefined, row));
    dirty = true;
  }

  return { documents: next, dirty };
}
