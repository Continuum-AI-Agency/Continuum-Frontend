import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

// Headers for the hand-rolled SSE POSTs (AI Studio generation, canvas node runs).
//
// These calls stream the response themselves, so they cannot go through
// http.request — but they still hit the backend directly. resolveWorkflowInitUrl
// only routes via the bearer-attaching Next proxy when NEXT_PUBLIC_API_URL is
// same-origin, and in production it is api.trycontinuum.ai, so nothing upstream
// adds the Authorization header for us. The backend's brand-access guard rejects
// the call without it.
//
// One helper so the two callers cannot drift apart on this again.
//
// Throws rather than sending a headerless request: a missing token used to produce
// an opaque backend 401 ("brand access denied") that had nothing to do with brand
// access — the caller is expected to catch this and surface a clear sign-in error.
export async function authedSseHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getBrowserAccessToken();
  if (!token) {
    throw new Error('Not signed in — please sign in again and retry.');
  }
  return {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}
