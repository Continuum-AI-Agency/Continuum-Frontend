import {
  DOCUMENT_CATEGORY_DEFAULT,
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
  type DocumentRetention,
  type DocumentScope,
  toDocumentRetention,
} from '@continuum/contracts';
import type {
  DocumentErrorCode,
  DocumentKind,
  DocumentProgressStep,
  OnboardingDocument,
} from '@/lib/onboarding/state';

export type DocumentDensity = 'compact' | 'full';

export type DocumentView = OnboardingDocument;

export type ProgressLabel = {
  text: string;
  tone: 'neutral' | 'progress' | 'success' | 'error';
};

export function describeStep(doc: DocumentView): ProgressLabel {
  const step: DocumentProgressStep | undefined =
    doc.progressStep ??
    (doc.status === 'ready' ? 'ready' : doc.status === 'error' ? 'error' : 'extracting');
  const percent = typeof doc.progressPercent === 'number' ? ` ${doc.progressPercent}%` : '';
  switch (step) {
    case 'uploading':
      return { text: `Uploading${percent}`, tone: 'progress' };
    case 'extracting':
      return { text: `Extracting text${percent}`, tone: 'progress' };
    case 'chunking':
      return { text: 'Splitting content', tone: 'progress' };
    case 'embedding':
      return { text: `Indexing${percent}`, tone: 'progress' };
    case 'ready':
      return { text: 'Ready', tone: 'success' };
    case 'error':
      return { text: describeError(doc.errorCode, doc.errorMessage), tone: 'error' };
    default:
      return { text: 'Processing', tone: 'progress' };
  }
}

export function describeError(code?: DocumentErrorCode, message?: string): string {
  if (message && message.length > 0 && message.length < 120) return message;
  switch (code) {
    case 'UNSUPPORTED_FORMAT':
      return 'Format not supported';
    case 'STORAGE_FETCH_FAILED':
      return 'Could not read file';
    case 'EXTRACT_FAILED':
      return 'Extraction failed';
    case 'EMPTY_TEXT':
      return 'No text found';
    case 'EMBED_BATCH_FAILED':
      return 'Indexing failed';
    case 'CHUNK_INSERT_FAILED':
      return 'Save failed';
    default:
      return 'Processing error';
  }
}

const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  xlsx: 'Excel',
  image: 'Image',
  text: 'Text',
  markdown: 'Markdown',
  csv: 'CSV',
  json: 'JSON',
  html: 'HTML',
  unknown: 'Document',
};

export function kindLabel(doc: DocumentView): string {
  if (doc.kind) return KIND_LABEL[doc.kind];
  const dot = doc.name.lastIndexOf('.');
  if (dot >= 0) return doc.name.slice(dot + 1).toUpperCase();
  return 'Document';
}

export function documentCategoryOf(doc: DocumentView): DocumentCategory {
  return doc.category ?? DOCUMENT_CATEGORY_DEFAULT;
}

export function categoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORY_LABELS[category];
}

export type CategoryFilter = DocumentCategory | 'all';

export function filterDocumentsByCategory(
  documents: DocumentView[],
  filter: CategoryFilter,
): DocumentView[] {
  if (filter === 'all') return documents;
  return documents.filter((doc) => documentCategoryOf(doc) === filter);
}

// ---------------------------------------------------------------------------
// Lifecycle (retention / archive) — all pure so they unit-test without a DB
// ---------------------------------------------------------------------------

export function documentRetentionOf(doc: DocumentView): DocumentRetention {
  // Absent means a row written before retention shipped, and all of those are
  // curated brand knowledge.
  return toDocumentRetention(doc.retention);
}

export function isArchived(doc: DocumentView): boolean {
  return Boolean(doc.archivedAt);
}

export function isEphemeral(doc: DocumentView): boolean {
  return documentRetentionOf(doc) === 'ephemeral';
}

/**
 * Client-side expiry check. The server sweep is the authority, but it runs nightly —
 * so without this a document would keep showing as live for up to a day after it
 * expired. A permanent document is never expired regardless of a stale expires_at,
 * mirroring the retention-qualified predicate in the SQL.
 */
export function isExpired(doc: DocumentView, now: number = Date.now()): boolean {
  if (!isEphemeral(doc)) return false;
  if (!doc.expiresAt) return false;
  return new Date(doc.expiresAt).getTime() <= now;
}

export function filterDocumentsByScope(
  documents: DocumentView[],
  scope: DocumentScope,
  now: number = Date.now(),
): DocumentView[] {
  switch (scope) {
    case 'archived':
      return documents.filter(isArchived);
    case 'temporary':
      return documents.filter(
        (doc) => !isArchived(doc) && isEphemeral(doc) && !isExpired(doc, now),
      );
    default:
      return documents.filter((doc) => !isArchived(doc) && !isExpired(doc, now));
  }
}

/**
 * Human countdown for a temporary document. Days until it is swept, then hours, then
 * a plain "Expires today" so the last stretch never reads as "0d left".
 */
export function formatRetentionCountdown(
  expiresAt: string | undefined,
  now: number = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(remainingMs)) return null;
  if (remainingMs <= 0) return 'Expired';

  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d left`;

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h left`;
  return 'Expires today';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
