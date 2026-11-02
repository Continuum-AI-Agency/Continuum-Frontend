import type { IntegrationErrorCode } from '@continuum/contracts';

// The typed code an integration error carries decides the sentence a person reads
// (IntegrationErrorBanner); the platform's own message is never that sentence. Edges send
// `errorCode` beside `error`; a path that lost it still says which Meta refusal it was by
// Meta's own number, so (#200) and (#190) are read back into their codes.

const KNOWN_CODES: ReadonlySet<string> = new Set<IntegrationErrorCode>([
  'TOKEN_EXPIRED',
  'PERMISSIONS_MISSING',
  'INTEGRATION_NOT_LINKED',
  'RATE_LIMITED',
  'ACCOUNT_NOT_VERIFIED',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

const META_PERMISSION_REFUSAL = /\(#200\)|ads_management or ads_read permission/i;
const META_SESSION_REFUSAL = /\(#190\)|error validating access token/i;

const isKnownCode = (value: unknown): value is IntegrationErrorCode =>
  typeof value === 'string' && KNOWN_CODES.has(value);

export function integrationErrorCodeOf(body: unknown): IntegrationErrorCode | null {
  if (typeof body !== 'object' || body === null) return null;
  const code = Reflect.get(body, 'errorCode') ?? Reflect.get(body, 'code');
  if (isKnownCode(code)) return code;
  const message = Reflect.get(body, 'error');
  if (typeof message !== 'string') return null;
  if (META_PERMISSION_REFUSAL.test(message)) return 'PERMISSIONS_MISSING';
  if (META_SESSION_REFUSAL.test(message)) return 'TOKEN_EXPIRED';
  return null;
}
