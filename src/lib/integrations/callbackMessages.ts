// What the OAuth popup tells the user on its way back from a provider.
//
// Both messages are driven by the `reason` query param the backend puts on the
// redirect. On success it is an optional non-fatal warning; on failure it is the
// provider's own OAuth error code, which is developer-facing wording that has to
// be translated before a user sees it.

export function successMessage(reason?: string | null): string {
  if (reason === 'no_ads_accounts' || reason === 'ads_enrichment_failed') {
    return 'Connected, but no Google Ads accounts were found.';
  }
  if (reason === 'meta_partial_sync') {
    return "Connected, but some Meta accounts may be missing. We'll keep trying to load them.";
  }
  return 'Integration connected.';
}

// Anything unrecognized falls through verbatim so support still sees the
// provider's own wording rather than a message that hides it.
export function errorMessage(reason?: string | null): string {
  switch (reason) {
    case 'access_denied':
    case 'user_cancelled':
      return 'You cancelled the connection.';
    case 'invalid_scope_error':
    case 'unauthorized_scope_error':
      return 'This app is not approved for the permissions it asked for. Contact support.';
    case 'missing_code':
      return 'The provider did not return an authorization code.';
    default:
      return reason || 'Connection failed.';
  }
}
