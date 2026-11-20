// What the OAuth popup tells the user on its way back from a provider.
//
// Both messages are driven by the `reason` query param the backend puts on the
// redirect. On success it is an optional non-fatal warning; on failure it is the
// provider's own OAuth error code, which is developer-facing wording that has to
// be translated before a user sees it.

type PresentCallbackMessage = (source: string) => string;
const presentMessage = (source: string, present?: PresentCallbackMessage) =>
  present ? present(source) : source;

export function successMessage(reason?: string | null, present?: PresentCallbackMessage): string {
  if (reason === 'no_ads_accounts' || reason === 'ads_enrichment_failed') {
    return presentMessage('Connected, but no Google Ads accounts were found.', present);
  }
  // `mine: true` only sees channels the Google account owns directly, so a
  // channel held as a Brand Account syncs nothing. Naming the fix is the whole
  // point — the old silent success left YouTube simply absent.
  if (reason === 'no_youtube_channels') {
    return presentMessage(
      'Connected, but no YouTube channel is owned by this Google account. If your channel is a Brand Account, reconnect and pick it at the Google account chooser.',
      present,
    );
  }
  if (reason === 'youtube_enrichment_failed') {
    return presentMessage(
      "Connected, but we could not load your YouTube channels. We'll retry on the next sync.",
      present,
    );
  }
  if (reason === 'meta_partial_sync') {
    return presentMessage(
      "Connected, but some Meta accounts may be missing. We'll keep trying to load them.",
      present,
    );
  }
  return presentMessage('Integration connected.', present);
}

// Legacy non-UI callers retain diagnostics. Presented UI messages use a safe fallback for unknown codes.
export function errorMessage(reason?: string | null, present?: PresentCallbackMessage): string {
  switch (reason) {
    case 'access_denied':
    case 'user_cancelled':
      return presentMessage('You cancelled the connection.', present);
    case 'invalid_scope_error':
    case 'unauthorized_scope_error':
      return presentMessage(
        'This app is not approved for the permissions it asked for. Contact support.',
        present,
      );
    case 'missing_code':
      return presentMessage('The provider did not return an authorization code.', present);
    default:
      return present ? present('Connection failed.') : reason || 'Connection failed.';
  }
}
