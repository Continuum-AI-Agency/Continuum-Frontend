import type { useTranslations } from 'next-intl';

type Translator = ReturnType<typeof useTranslations<'common'>>;
const LABEL_KEYS = {
  'Splitting content': 'm_732e8fee42',
  Ready: 'm_20c7c5522f',
  Processing: 'm_e63451d3cf',
  'Format not supported': 'm_6ea23ae7af',
  'Could not read file': 'm_67c01653cd',
  'Extraction failed': 'm_5991eb87a1',
  'No text found': 'm_d36e64a5fe',
  'Indexing failed': 'm_c76d04d7ec',
  'Save failed': 'm_0a44446762',
  'Processing error': 'm_089c7da45c',
  Image: 'm_50e19fda0d',
  Text: 'm_c3328c39b0',
  Document: 'document_d6bd8c0',
  Expired: 'm_a689a999a5',
  'Expires today': 'm_a2f6b366e0',
  Type: 'm_3deb745651',
  Size: 'm_b7152342a2',
  Pages: 'm_600584c2d5',
  Source: 'm_6da13addb0',
  Added: 'm_b68734c259',
  Upload: 'm_8bdf057f91',
} as const;
function translateLabel(text: string, t?: Translator) {
  return t && Object.hasOwn(LABEL_KEYS, text)
    ? t(LABEL_KEYS[text as keyof typeof LABEL_KEYS])
    : text;
}

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

export type DocumentView = OnboardingDocument & {
  /** Local watchdog verdict; never sent to the database or API. */
  uiErrorCode?: 'PROCESSING_TIMEOUT';
};

export type ProgressLabel = {
  text: string;
  tone: 'neutral' | 'progress' | 'success' | 'error';
};

export function describeStep(doc: DocumentView, t?: Translator, locale = 'en'): ProgressLabel {
  const step: DocumentProgressStep | undefined =
    doc.progressStep ??
    (doc.status === 'ready' ? 'ready' : doc.status === 'error' ? 'error' : 'extracting');
  const percent =
    typeof doc.progressPercent === 'number'
      ? ` ${new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(doc.progressPercent / 100)}`
      : '';
  switch (step) {
    case 'uploading':
      return {
        text: t ? t('m_725a6460e1', { percent }) : `Uploading${percent}`,
        tone: 'progress',
      };
    case 'extracting':
      return {
        text: t ? t('m_3015cdbd2d', { percent }) : `Extracting text${percent}`,
        tone: 'progress',
      };
    case 'chunking':
      return { text: translateLabel('Splitting content', t), tone: 'progress' };
    case 'embedding':
      return {
        text: t ? t('m_b1badb25f9', { percent }) : `Indexing${percent}`,
        tone: 'progress',
      };
    case 'ready':
      return { text: translateLabel('Ready', t), tone: 'success' };
    case 'error':
      return {
        text: describeError(doc.errorCode, doc.errorMessage, t, doc.uiErrorCode),
        tone: 'error',
      };
    default:
      return { text: translateLabel('Processing', t), tone: 'progress' };
  }
}

export function describeError(
  code?: DocumentErrorCode,
  message?: string,
  t?: Translator,
  uiErrorCode?: DocumentView['uiErrorCode'],
): string {
  if (t && !code && uiErrorCode === 'PROCESSING_TIMEOUT') return t('documentProcessingTimeout');
  if (!t && message && message.length > 0 && message.length < 120) return message;
  switch (code) {
    case 'UNSUPPORTED_FORMAT':
      return translateLabel('Format not supported', t);
    case 'STORAGE_FETCH_FAILED':
      return translateLabel('Could not read file', t);
    case 'EXTRACT_FAILED':
      return translateLabel('Extraction failed', t);
    case 'EMPTY_TEXT':
      return translateLabel('No text found', t);
    case 'EMBED_BATCH_FAILED':
      return translateLabel('Indexing failed', t);
    case 'CHUNK_INSERT_FAILED':
      return translateLabel('Save failed', t);
    default:
      return translateLabel('Processing error', t);
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

export function kindLabel(doc: DocumentView, t?: Translator): string {
  if (doc.kind) return translateLabel(KIND_LABEL[doc.kind], t);
  const dot = doc.name.lastIndexOf('.');
  if (dot >= 0) return doc.name.slice(dot + 1).toUpperCase();
  return translateLabel('Document', t);
}

export function documentCategoryOf(doc: DocumentView): DocumentCategory {
  return doc.category ?? DOCUMENT_CATEGORY_DEFAULT;
}

export function categoryLabel(category: DocumentCategory, t?: Translator): string {
  const categoryKeys = {
    brand_guidelines: 'm_aa9c2f0e93',
    design_system: 'design_system_4a86610',
    creative_strategy: 'm_8811df6a28',
    audience_persona: 'm_c600656d3b',
    product_info: 'm_9e39c5f876',
    campaign_deliverable: 'm_51032c083e',
    misc: 'm_0a893ece8e',
  } as const;
  return t ? t(categoryKeys[category]) : DOCUMENT_CATEGORY_LABELS[category];
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
  t?: Translator,
  locale = 'en',
): string | null {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(remainingMs)) return null;
  if (remainingMs <= 0) return translateLabel('Expired', t);

  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return t ? t('m_0043f05aef', { count: days }) : `${days}d left`;

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  if (hours >= 1) return t ? t('m_fe768f65ca', { count: hours }) : `${hours}h left`;
  return translateLabel('Expires today', t);
}

export function formatBytes(bytes: number, locale = 'en'): string {
  if (bytes < 1024) return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
