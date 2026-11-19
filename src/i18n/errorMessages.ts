import { ApiError, isFetchFailure } from '@/lib/api/errors';

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
};

/** An application message translated at its origin, never an external provider's diagnostic. */
export class LocalizedUiError extends Error {}

export function uiErrorKey(error: unknown): UiErrorKey {
  if (isFetchFailure(error)) return 'networkError';
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'requestCancelled';
    if (error.name === 'TimeoutError') return 'requestTimedOut';
    if (error.name === 'ZodError') return 'validationFailed';
  }
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const code = error.code.toLowerCase();
    const known = Object.hasOwn(errorKeys, code) ? errorKeys[code] : undefined;
    if (known) return known;
  }
  if (error instanceof ApiError) {
    const legacyCode = error.payload?.error;
    if (typeof legacyCode === 'string' && Object.hasOwn(errorKeys, legacyCode))
      return errorKeys[legacyCode];
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

export function uiErrorMessage(error: unknown, translate: (key: UiErrorKey) => string): string {
  return error instanceof LocalizedUiError ? error.message : translate(uiErrorKey(error));
}
