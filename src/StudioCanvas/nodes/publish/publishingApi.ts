import {
  type AttachOrganicCanvasCreativeRequest,
  attachOrganicCanvasCreativeResponseSchema,
  type OrganicCanvasDraftWriteRequest,
  type OrganicCanvasDraftWriteResponse,
  type OrganicCanvasTargetSearchRequest,
  type OrganicCanvasTargetSearchResponse,
  organicCanvasDraftWriteResponseSchema,
  organicCanvasTargetSearchResponseSchema,
  type PaidCanvasCreativeReplacementRequest,
  type PaidCanvasCreativeReplacementResponse,
  type PaidCanvasTargetSearchRequest,
  type PaidCanvasTargetSearchResponse,
  paidCanvasCreativeReplacementResponseSchema,
  paidCanvasTargetSearchResponseSchema,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

const queryString = (input: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return params.toString();
};

/**
 * What `/publish-intent` reports: the verdict, the facts that will ACTUALLY be sent, and
 * the hash the backend binds a confirmation to. `intent_hash` is null when the draft is
 * not publishable — there is nothing legitimate to confirm.
 */
export type OrganicPublishIntent = {
  publishable: boolean;
  blockers: { reason: string; message: string }[];
  /** Non-blocking gaps the confirmation dialog shows alongside the blockers. */
  warnings: { reason: string; message: string }[];
  platform: string;
  format: string;
  account: { id: string | null; source: string };
  caption: { present: boolean; length: number; preview: string | null };
  media: { count: number; required: number; source: string };
  intent_hash: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getBrowserAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const publishingApi = {
  searchOrganic(input: OrganicCanvasTargetSearchRequest) {
    return http.request<OrganicCanvasTargetSearchResponse>({
      path: `/api/ai-studio/publishing/organic/targets?${queryString(input)}`,
      schema: organicCanvasTargetSearchResponseSchema,
    });
  },
  /** Create a Planner draft, or edit the one this node is bound to. */
  writeOrganicDraft(input: OrganicCanvasDraftWriteRequest) {
    return http.request<OrganicCanvasDraftWriteResponse>({
      path: '/api/ai-studio/publishing/organic/drafts',
      method: 'POST',
      body: input,
      schema: organicCanvasDraftWriteResponseSchema,
    });
  },
  attachOrganic(draftId: string, input: AttachOrganicCanvasCreativeRequest) {
    return http.request<import('@continuum/contracts').AttachOrganicCanvasCreativeResponse>({
      path: `/api/ai-studio/publishing/organic/drafts/${encodeURIComponent(draftId)}/creative`,
      method: 'POST',
      body: input,
      schema: attachOrganicCanvasCreativeResponseSchema,
    });
  },
  searchPaid(input: PaidCanvasTargetSearchRequest) {
    return http.request<PaidCanvasTargetSearchResponse>({
      path: `/api/ai-studio/publishing/paid/targets?${queryString(input)}`,
      schema: paidCanvasTargetSearchResponseSchema,
    });
  },
  replacePaid(input: PaidCanvasCreativeReplacementRequest) {
    return http.request<PaidCanvasCreativeReplacementResponse>({
      path: '/api/ai-studio/publishing/paid/replacements',
      method: 'POST',
      body: input,
      schema: paidCanvasCreativeReplacementResponseSchema,
    });
  },
};

// ---------------------------------------------------------------------------
// Publishing — the planner's own routes, unchanged
// ---------------------------------------------------------------------------
//
// These are the same three endpoints the Planner's publish button drives, called
// directly rather than through `usePublishDraft` (which is bound to the planner's
// Zustand store and its `OrganicCalendarDraft` shape). The ceremony is what matters and
// it is preserved exactly: ask what will be sent, show the human THAT, publish with the
// hash their confirmation was taken against.

export async function fetchOrganicPublishIntent(
  draftId: string,
  accountId?: string | null,
): Promise<OrganicPublishIntent | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/organic/calendar/drafts/${encodeURIComponent(draftId)}/publish-intent`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(accountId ? { accountId } : {}),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as OrganicPublishIntent;
  } catch {
    return null;
  }
}

/**
 * Publish. Raw `fetch` on purpose: the response is an SSE stream and `http.request`
 * parses JSON, which cannot consume it.
 *
 * NEVER retried automatically, here or anywhere: a publish is not idempotent, and a
 * network error says nothing about whether the post went out — the request may have
 * succeeded and only the response been lost. The user retries deliberately.
 */
export async function publishOrganicDraft(args: {
  draftId: string;
  body: Record<string, unknown>;
}): Promise<ReadableStream<Uint8Array> | null> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/organic/calendar/drafts/${encodeURIComponent(args.draftId)}/publish`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify(args.body) },
  );
  if (response.status === 401) throw new Error('Your session expired. Sign in and try again.');
  return response.body;
}

/** Approve, then arm the poller. The exact pair the planner's own schedule action uses. */
export async function scheduleOrganicDraft(draftId: string): Promise<void> {
  const headers = await authHeaders();
  const base = `${getApiBaseUrl()}/api/organic/calendar/drafts/${encodeURIComponent(draftId)}`;
  const approve = await fetch(`${base}/approve`, { method: 'POST', headers, body: '{}' });
  if (!approve.ok) {
    const detail = (await approve.json().catch(() => null)) as { error?: string } | null;
    // Already approved is not a failure — it is the state we were trying to reach.
    if (detail?.error !== 'invalid_state') {
      throw new Error(detail?.error ?? 'Could not approve this draft.');
    }
  }
  const scheduled = await fetch(base, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'scheduled' }),
  });
  if (!scheduled.ok) throw new Error('Could not schedule this draft.');
}
