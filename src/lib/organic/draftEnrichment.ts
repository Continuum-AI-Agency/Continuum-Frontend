// Browser client for the planner's per-draft enrichment ladder. Each call enqueues a
// durable job that enriches an EXISTING draft row in place; completion arrives over
// the calendar's Supabase Realtime subscription, not in the response.

import {
  type DraftEnrichmentConflictCode,
  type DraftEnrichmentRequest,
  type DraftEnrichmentResponse,
  draftEnrichmentRequestSchema,
  draftEnrichmentResponseSchema,
} from '@continuum/contracts';

import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

export interface DraftEnrichmentDeps {
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string | null>;
  baseUrl?: string;
}

/**
 * A 409 from the ladder. `code` names the precondition that failed, so callers can
 * distinguish "offer Rewrite" from "this draft is past the point of rewriting" without
 * string-matching the message.
 */
export class DraftEnrichmentConflictError extends Error {
  readonly code: DraftEnrichmentConflictCode;

  constructor(code: DraftEnrichmentConflictCode, message: string) {
    super(message);
    this.name = 'DraftEnrichmentConflictError';
    this.code = code;
  }
}

async function postLadderStage(
  path: string,
  request: DraftEnrichmentRequest,
  deps: DraftEnrichmentDeps,
): Promise<DraftEnrichmentResponse> {
  const body = draftEnrichmentRequestSchema.parse(request);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getToken = deps.getToken ?? getBrowserAccessToken;
  const baseUrl = deps.baseUrl ?? getApiBaseUrl();

  const token = await getToken();
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `draft enrichment failed (${response.status})`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as { message?: string; code?: string };
      if (payload.message) message = payload.message;
      code = payload.code;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    if (response.status === 409 && code) {
      throw new DraftEnrichmentConflictError(code as DraftEnrichmentConflictCode, message);
    }
    throw new Error(message);
  }
  return draftEnrichmentResponseSchema.parse(await response.json());
}

/**
 * Ladder stage 1 — write copy into `backendDraftId`. Pass `regenerate` to rewrite copy
 * that already exists; without it the Backend 409s rather than silently resuming.
 */
export function enqueueCopyGeneration(
  backendDraftId: string,
  request: DraftEnrichmentRequest,
  deps: DraftEnrichmentDeps = {},
): Promise<DraftEnrichmentResponse> {
  return postLadderStage(
    `/api/organic/agent/drafts/${backendDraftId}/generate-copy`,
    request,
    deps,
  );
}

/**
 * Ladder stage 2 — expand `backendDraftId` into a blueprint. Stage 1 auto-enqueues this
 * on success, so calling it directly is the recovery path for a draft left at text_only.
 */
export function enqueueBlueprintExpansion(
  backendDraftId: string,
  request: DraftEnrichmentRequest,
  deps: DraftEnrichmentDeps = {},
): Promise<DraftEnrichmentResponse> {
  return postLadderStage(
    `/api/organic/agent/drafts/${backendDraftId}/build-blueprint`,
    request,
    deps,
  );
}
