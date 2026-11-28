import { ApiError, isFetchFailure } from '@/lib/api/errors';
import { isPlainSentence } from '@/lib/api/loadFailure';

export type UiErrorKey =
  | 'unexpectedError'
  | 'networkError'
  | 'authenticationRequired'
  | 'permissionDenied'
  | 'paymentRequired'
  | 'resourceNotFound'
  | 'conflictError'
  | 'validationFailed'
  | 'rateLimited'
  | 'requestTimedOut'
  | 'requestCancelled'
  | 'serviceUnavailable'
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'accountAlreadyExists'
  | 'codeExpired';

const errorKeys: Record<string, UiErrorKey> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'accountAlreadyExists',
  otp_expired: 'codeExpired',
  session_not_found: 'authenticationRequired',
  over_request_rate_limit: 'rateLimited',
  insufficient_permissions: 'permissionDenied',
  permission_denied: 'permissionDenied',
  rate_limited: 'rateLimited',
  network_error: 'networkError',
  draft_not_found: 'resourceNotFound',
};

/** An application message translated at its origin, never an external provider's diagnostic. */
export class LocalizedUiError extends Error {}

function codeKey(error: unknown): UiErrorKey | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const code = error.code.toLowerCase();
    if (Object.hasOwn(errorKeys, code)) return errorKeys[code];
  }
  if (error instanceof ApiError) {
    const legacyCode = error.payload?.error;
    if (typeof legacyCode === 'string' && Object.hasOwn(errorKeys, legacyCode))
      return errorKeys[legacyCode];
  }
  return undefined;
}

export function uiErrorKey(error: unknown): UiErrorKey {
  if (isFetchFailure(error)) return 'networkError';
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'requestCancelled';
    if (error.name === 'TimeoutError') return 'requestTimedOut';
    if (error.name === 'ZodError') return 'validationFailed';
  }
  const known = codeKey(error);
  if (known) return known;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'authenticationRequired';
    if (error.status === 402) return 'paymentRequired';
    if (error.status === 403) return 'permissionDenied';
    if (error.status === 404) return 'resourceNotFound';
    if (error.status === 409) return 'conflictError';
    if (error.status === 400 || error.status === 422) return 'validationFailed';
    if (error.status === 429) return 'rateLimited';
    if (error.status >= 500) return 'serviceUnavailable';
  }
  return 'unexpectedError';
}

// A gateway, or Fastify closing during a deploy, answers 5xx with a phrase in `error`
// ("Service Unavailable"); a bare snake_case value there is a code, not a sentence.
const BACKEND_CODE = /^[a-z][a-z0-9_]*$/;

/** What the Backend itself said: its `message`, or a 4xx's legacy `{ error: "<sentence>" }`. */
function backendSentence(error: ApiError): string {
  const { message, error: said } = error.payload ?? {};
  if (isPlainSentence(message)) return message.trim();
  return isPlainSentence(said) && error.status < 500 && !BACKEND_CODE.test(said.trim())
    ? said.trim()
    : '';
}

/**
 * The reason to show a person: an application message translated at its origin, a known code
 * reworded, the Backend's own sentence, any other error's sentence whole, and only then the
 * generic copy for its status. A "sentence" is what `isPlainSentence` accepts: never a library
 * string, a stack or JSON. `fallback` stands in when there is no sentence.
 */
export function uiErrorSentence(
  error: unknown,
  translate: (key: UiErrorKey) => string,
  fallback?: string,
): string {
  if (error instanceof LocalizedUiError) return error.message;
  const key = uiErrorKey(error);
  if (error instanceof ApiError && !codeKey(error)) {
    const said = backendSentence(error);
    if (said) return said;
  }
  if (key !== 'unexpectedError') return translate(key);
  const message =
    error && typeof error === 'object' && 'message' in error ? error.message : undefined;
  const sentence = isPlainSentence(message) ? message.trim() : '';
  return sentence || fallback || translate(key);
}

// ponytail: one rule under two names so ~300 call sites keep their import; rename when touched.
export function uiErrorMessage(error: unknown, translate: (key: UiErrorKey) => string): string {
  return uiErrorSentence(error, translate);
}
