import { describe, expect, it } from 'bun:test';

import { errorMessage, successMessage } from './callbackMessages';

describe('successMessage', () => {
  it('reports a clean connection when there is no warning', () => {
    expect(successMessage(null)).toBe('Integration connected.');
    expect(successMessage(undefined)).toBe('Integration connected.');
  });

  it('surfaces the non-fatal warnings a successful connect can still carry', () => {
    expect(successMessage('no_ads_accounts')).toBe(
      'Connected, but no Google Ads accounts were found.',
    );
    expect(successMessage('ads_enrichment_failed')).toBe(
      'Connected, but no Google Ads accounts were found.',
    );
    expect(successMessage('meta_partial_sync')).toContain('some Meta accounts may be missing');
  });
});

describe('errorMessage', () => {
  it('translates a scope rejection instead of showing the raw OAuth code', () => {
    const expected = 'This app is not approved for the permissions it asked for. Contact support.';
    expect(errorMessage('invalid_scope_error')).toBe(expected);
    expect(errorMessage('unauthorized_scope_error')).toBe(expected);
  });

  it('reads a denied consent as the user cancelling', () => {
    expect(errorMessage('access_denied')).toBe('You cancelled the connection.');
    expect(errorMessage('user_cancelled')).toBe('You cancelled the connection.');
  });

  it('explains a callback that arrived with no authorization code', () => {
    expect(errorMessage('missing_code')).toBe('The provider did not return an authorization code.');
  });

  it("passes an unrecognized reason through so support sees the provider's own wording", () => {
    expect(errorMessage('some_new_provider_error')).toBe('some_new_provider_error');
  });

  it('falls back to a generic failure when there is no reason at all', () => {
    expect(errorMessage(null)).toBe('Connection failed.');
    expect(errorMessage(undefined)).toBe('Connection failed.');
    expect(errorMessage('')).toBe('Connection failed.');
  });
});
