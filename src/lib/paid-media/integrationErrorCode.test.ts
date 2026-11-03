import { describe, expect, it } from 'bun:test';
import { integrationErrorCodeOf } from './integrationErrorCode';

// APP-SWEEP-paid-dashboard-raw-meta-error: Pink Elephant's paid dashboard printed Meta's own
// words — "(#200) Ad account owner has NOT grant ads_management or ads_read permission, refer
// to https://developers.facebook.com/…" — because the reporting widget dropped the typed code
// the edge sends beside the message. The code decides the sentence the person reads.
describe('integrationErrorCodeOf', () => {
  it('keeps the typed errorCode the edge sent', () => {
    expect(integrationErrorCodeOf({ error: 'anything', errorCode: 'PERMISSIONS_MISSING' })).toBe(
      'PERMISSIONS_MISSING',
    );
    expect(integrationErrorCodeOf({ error: 'x', errorCode: 'RATE_LIMITED' })).toBe('RATE_LIMITED');
  });

  it("reads Meta's permission refusal (#200) when no code came with it", () => {
    expect(
      integrationErrorCodeOf({
        error:
          '(#200) Ad account owner has NOT grant ads_management or ads_read permission, refer to https://developers.facebook.com/docs/marketing-api/overview/authorization',
      }),
    ).toBe('PERMISSIONS_MISSING');
  });

  it("reads Meta's expired or revoked session (#190) when no code came with it", () => {
    expect(
      integrationErrorCodeOf({
        error: 'Error validating access token: Session has expired (#190)',
      }),
    ).toBe('TOKEN_EXPIRED');
  });

  it('names nothing when neither a known code nor a recognisable Meta refusal is there', () => {
    expect(integrationErrorCodeOf({ error: 'Campaigns not found.' })).toBeNull();
    expect(integrationErrorCodeOf({ errorCode: 'NOT_A_CODE' })).toBeNull();
    expect(integrationErrorCodeOf(null)).toBeNull();
    expect(integrationErrorCodeOf('plain text')).toBeNull();
  });
});
