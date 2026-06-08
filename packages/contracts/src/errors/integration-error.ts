// Structured error codes for integration (Meta/Facebook) API failures.
// Edge functions emit these; the Frontend uses them to render actionable messages.

export type IntegrationErrorCode =
  | "TOKEN_EXPIRED"          // Meta OAuthException code 190 — session expired or revoked
  | "PERMISSIONS_MISSING"    // Meta code 200 — ads_read / ads_management not approved
  | "INTEGRATION_NOT_LINKED" // No access token / integration found for this brand
  | "RATE_LIMITED"           // Meta code 17 or subcode 2446079
  | "ACCOUNT_NOT_VERIFIED"   // Facebook Business Verification required
  | "UPSTREAM_UNAVAILABLE"   // 5xx from Meta — transient platform outage
  | "INTERNAL_ERROR";        // Unhandled edge function error

export interface IntegrationErrorPayload {
  error: string;
  errorCode: IntegrationErrorCode;
  retryAfter?: number;
  platform?: string;
}
