import type { useTranslations } from 'next-intl';
// Presentation mapping for a reference image's inlining status. Kept pure and
// separate from the node JSX so the label/tone logic is testable without a DOM.

import type { ImageNodeData } from '../types';

export interface ReferenceStatusBadge {
  label: string;
  tone: 'processing' | 'ready' | 'error';
}

export function referenceStatusBadge(
  status: ImageNodeData['referenceStatus'],
  t?: ReturnType<typeof useTranslations<'studio'>>,
): ReferenceStatusBadge | null {
  switch (status) {
    case 'processing':
      return { label: t?.('referenceProcessing') ?? 'Processing', tone: 'processing' };
    case 'ready':
      return { label: t?.('referenceReady') ?? 'Ready', tone: 'ready' };
    case 'error':
      return { label: t?.('referenceFailed') ?? 'Failed', tone: 'error' };
    default:
      return null;
  }
}
