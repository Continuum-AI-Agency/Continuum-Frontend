import { notifyPaymentRequired } from '@/lib/billing/paymentRequired';

export type ApiErrorPayload = {
  message?: string;
  code?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, code?: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | undefined;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // ignore non-JSON errors
  }
  // A billing 402 gets its upgrade / buy-credits CTA here, the one place every Backend error
  // passes through; the ApiError still throws so the caller's own handling is unchanged.
  notifyPaymentRequired(response.status, payload);
  let message = payload?.message;
  if (!message && typeof payload?.error === 'string') {
    message = payload.error;
  }
  if (!message && payload?.error && typeof payload.error === 'object') {
    const err = payload.error as Record<string, unknown>;
    const fieldErrors = err.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      const fields = Object.entries(fieldErrors)
        .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(', ')}`)
        .join('; ');
      if (fields) message = `Validation error — ${fields}`;
    }
    if (!message && Array.isArray(err.formErrors) && (err.formErrors as string[]).length > 0) {
      message = (err.formErrors as string[]).join('; ');
    }
  }
  message = message || `${response.status} ${response.statusText}`;
  const code = (payload?.code ?? payload?.errorCode) as string | undefined;
  return new ApiError(message, response.status, code, payload);
}

// A snake_case code in `payload.error` (`render_fonts_unverifiable`, `template_*`), which
// `ApiError.code` does not read. A gateway, or Fastify closing during a deploy, puts a phrase there
// ("Service Unavailable") or sends no body.
const BACKEND_CODE = /^[a-z][a-z0-9_]*$/;

/** The backend answered with its own error: a snake_case code, or a validation object. */
export function hasBackendError(error: ApiError): boolean {
  const said = error.payload?.error;
  return typeof said === 'string'
    ? BACKEND_CODE.test(said)
    : typeof said === 'object' && said !== null;
}

const fetchFailures = new WeakSet<object>();

/** Marks `fetch`'s own rejection (no answer at all), told apart from a TypeError thrown while
 *  the request was being built. The error itself is untouched. */
export function markFetchFailure(error: unknown): unknown {
  if (error instanceof TypeError) fetchFailures.add(error);
  return error;
}

export const isFetchFailure = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && fetchFailures.has(error);

const retriedOut = new WeakSet<object>();

/** Marks an error a caller already retried through: one retry layer, not two stacked. */
export function markRetried(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) retriedOut.add(error);
  return error;
}

export const wasRetried = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && retriedOut.has(error);

export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export type InstagramLookupErrorKind =
  | 'account_required'
  | 'permission_denied'
  | 'facebook_login_required'
  | 'rate_limited'
  | 'lookup_unavailable'
  | 'not_found'
  | 'generic';

// Maps an error from the Instagram business_discovery endpoints (AI Studio import,
// competitor search) to a UI message kind. 409 = the brand has no connected IG
// business account (account required); 404 = the target handle is not a public
// business/creator account.
//
// IG_LOOKUP_UNAVAILABLE used to collapse into one "reconnect Instagram" message,
// which is wrong for three of the four faults behind it (Airtable #287): a
// competitor lookup denied for want of Instagram Business Discovery permission is
// not fixed by reconnecting a working account. The backend now sends `reason`
// (@continuum/meta-graph GraphUnavailableReason); an older backend that does not
// still lands on 'lookup_unavailable'.
const REASON_KINDS: Record<string, InstagramLookupErrorKind> = {
  permission: 'permission_denied',
  throttled: 'rate_limited',
  token_expired: 'lookup_unavailable',
  upstream: 'lookup_unavailable',
  requires_facebook_login: 'facebook_login_required',
};

export function instagramLookupErrorKind(error: unknown): InstagramLookupErrorKind {
  if (error instanceof ApiError) {
    if (error.code === 'IG_VIEWER_UNAVAILABLE' || error.status === 409) return 'account_required';
    if (error.code === 'IG_LOOKUP_UNAVAILABLE' || error.status === 503) {
      const reason = error.payload?.reason;
      return (typeof reason === 'string' && REASON_KINDS[reason]) || 'lookup_unavailable';
    }
    if (error.code === 'IG_ACCOUNT_NOT_FOUND' || error.status === 404) return 'not_found';
  }
  return 'generic';
}
