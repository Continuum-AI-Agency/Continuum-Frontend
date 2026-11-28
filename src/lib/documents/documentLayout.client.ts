'use client';

import { type DocumentLayoutResponse, documentLayoutResponseSchema } from '@continuum/contracts';
import { http } from '@/lib/api/http';

// A first open runs a model call on the Backend (bounded at 120 s there), so the browser
// waits a little longer than that instead of the default job bound.
const LAYOUT_TIMEOUT_MS = 150_000;

export function readDocumentLayout(input: {
  brandId: string;
  documentId: string;
  /** The chat session that owns a one-off upload. */
  scopeKey?: string;
  refresh?: boolean;
}): Promise<DocumentLayoutResponse> {
  return http.request<DocumentLayoutResponse>({
    path: '/brand-knowledge/documents/layout',
    method: 'POST',
    body: {
      brand_id: input.brandId,
      document_id: input.documentId,
      ...(input.scopeKey ? { scope_key: input.scopeKey } : {}),
      ...(input.refresh ? { refresh: true } : {}),
    },
    schema: documentLayoutResponseSchema,
    cache: 'no-store',
    timeoutMs: LAYOUT_TIMEOUT_MS,
  });
}
