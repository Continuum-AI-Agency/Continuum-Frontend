// Presentation mapping for a reference image's inlining status. Kept pure and
// separate from the node JSX so the label/tone logic is testable without a DOM.

import type { ImageNodeData } from '../types';

export interface ReferenceStatusBadge {
  label: string;
  tone: 'processing' | 'ready' | 'error';
}

export function referenceStatusBadge(
  status: ImageNodeData['referenceStatus'],
): ReferenceStatusBadge | null {
  switch (status) {
    case 'processing':
      return { label: 'Processing', tone: 'processing' };
    case 'ready':
      return { label: 'Ready', tone: 'ready' };
    case 'error':
      return { label: 'Failed', tone: 'error' };
    default:
      return null;
  }
}
