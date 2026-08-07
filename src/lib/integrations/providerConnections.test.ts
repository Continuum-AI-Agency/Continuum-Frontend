// Google freezes a connection's granted scopes at consent time. Every Google
// connection in production (17 of them, 2026-08-06) was authorized before
// analytics.readonly joined GOOGLE_SCOPES, so the GA4 enumeration 403s on every
// sync and prod holds ZERO ga4_property rows — with nothing telling the user
// that only a fresh consent can fix it. These pin when we ask for one.

import { describe, expect, it } from 'bun:test';
import { GOOGLE_ANALYTICS_SCOPE, needsGoogleAnalyticsReconsent } from './providerConnections';

const OTHER_SCOPE = 'https://www.googleapis.com/auth/adwords';

describe('needsGoogleAnalyticsReconsent', () => {
  it('asks for reconsent when the sync reported the scope was never granted', () => {
    expect(
      needsGoogleAnalyticsReconsent(
        { ga4_enrichment: { ok: false, error: 'scope_not_granted' } },
        0,
      ),
    ).toBe(true);
  });

  it('stays quiet when enumeration succeeded but the user simply has no properties', () => {
    expect(needsGoogleAnalyticsReconsent({ ga4_enrichment: { ok: true } }, 0)).toBe(false);
  });

  it('reads a recorded non-empty scope list as the granted set', () => {
    expect(needsGoogleAnalyticsReconsent({ scopes: [OTHER_SCOPE] }, 0)).toBe(true);
    expect(
      needsGoogleAnalyticsReconsent({ scopes: [OTHER_SCOPE, GOOGLE_ANALYTICS_SCOPE] }, 0),
    ).toBe(false);
  });

  it('treats an empty scope list as unknown, not as missing', () => {
    // Empty means Google returned no scope string. Falls through to the
    // property-count inference rather than asserting a gap.
    expect(needsGoogleAnalyticsReconsent({ scopes: [] }, 3)).toBe(false);
    expect(needsGoogleAnalyticsReconsent({ scopes: [] }, 0)).toBe(true);
  });

  it('infers from zero synced properties on connections predating the bookkeeping', () => {
    // This is the case that covers every existing production connection: no
    // ga4_enrichment metadata, no recorded scopes, no properties.
    expect(needsGoogleAnalyticsReconsent({}, 0)).toBe(true);
  });

  it('self-clears once a property has actually synced', () => {
    expect(needsGoogleAnalyticsReconsent({}, 1)).toBe(false);
  });

  it('prefers an explicit enrichment verdict over the property-count inference', () => {
    // Succeeded with properties present but a stale/absent scope list: no nag.
    expect(needsGoogleAnalyticsReconsent({ scopes: [], ga4_enrichment: { ok: true } }, 0)).toBe(
      false,
    );
    // Scope gap reported even though properties exist from an earlier grant.
    expect(
      needsGoogleAnalyticsReconsent(
        { ga4_enrichment: { ok: false, error: 'scope_not_granted' } },
        5,
      ),
    ).toBe(true);
  });

  it('does not ask for reconsent on a transient enumeration failure', () => {
    // A 500 from Google is not a scope problem; the property-count inference
    // decides, so a user with properties already synced is left alone.
    expect(
      needsGoogleAnalyticsReconsent({ ga4_enrichment: { ok: false, error: 'backend error' } }, 2),
    ).toBe(false);
  });
});
