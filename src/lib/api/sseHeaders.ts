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
export async function authedSseHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getBrowserAccessToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}
