import { describe, expect, it } from 'bun:test';
import { brandSegmentOfTitle, isLikelyLoginTitle, resolveSafeBrandName } from './brandName';

describe('isLikelyLoginTitle', () => {
  it('flags auth/SSO interstitial titles', () => {
    for (const t of [
      'Sign in - Claude',
      'Log in to Google',
      'Sign up',
      'Continue with Apple',
      'Authentication required',
      'OAuth consent',
      'Just a moment...',
      'Redirecting…',
    ]) {
      expect(isLikelyLoginTitle(t)).toBe(true);
    }
  });

  it('does not flag genuine brand titles', () => {
    for (const t of ['Acme Coffee Roasters', 'Pizza Test', 'Nike — Just Do It']) {
      expect(isLikelyLoginTitle(t)).toBe(false);
    }
  });
});

// Every input below is a real brand_name currently persisted in
// brand_profiles.brand_profiles — these are the rows QA row 3 reported.
describe('brandSegmentOfTitle', () => {
  it('keeps the brand and drops the tagline', () => {
    const cases: Array<[string, string]> = [
      ['Continuum — Build continuity. Scale personalization.', 'Continuum'],
      ['Auditionify — Talent is everywhere. Opportunity should not be hidden.', 'Auditionify'],
      ['Teramot · Make AI Understand Your Business', 'Teramot'],
      ['Avalancha Ventures – Financiamiento de capital emprendedor', 'Avalancha Ventures'],
      ['Redis - Real-time data for agents & apps', 'Redis'],
      ['Litebox | Your go-to-market engineering team', 'Litebox'],
    ];
    for (const [title, expected] of cases) expect(brandSegmentOfTitle(title)).toBe(expected);
  });

  it('keeps the brand when the title puts it AFTER the separator', () => {
    const cases: Array<[string, string]> = [
      ['Makeup, Skincare, Fragrance, Hair & Beauty Products | Sephora', 'Sephora'],
      ['Agencia de Marketing Digital CDMX | Munnin Lab', 'Munnin Lab'],
      ['technical apparel + athletic shoes | lululemon', 'lululemon'],
      ['Funeraria en San Luis Potosí · Tangassi · El homenaje a la vida', 'Tangassi'],
    ];
    for (const [title, expected] of cases) expect(brandSegmentOfTitle(title)).toBe(expected);
  });

  it('skips generic page labels rather than returning them as the brand', () => {
    expect(brandSegmentOfTitle('Inicio | UTEC')).toBe('UTEC');
    expect(brandSegmentOfTitle('Inicio - Luxdey Lighting Academy')).toBe('Luxdey Lighting Academy');
    expect(brandSegmentOfTitle('Home | Vivo47')).toBe('Vivo47');
    expect(brandSegmentOfTitle('Home - xales')).toBe('xales');
  });

  it('leaves a title with no separator alone', () => {
    expect(brandSegmentOfTitle('Starbucks Coffee Company')).toBe('Starbucks Coffee Company');
    expect(brandSegmentOfTitle('Tienda Online de Bocamasarte')).toBe(
      'Tienda Online de Bocamasarte',
    );
  });

  it('does not split hyphenated names', () => {
    expect(brandSegmentOfTitle('Coca-Cola')).toBe('Coca-Cola');
    expect(brandSegmentOfTitle('T-Mobile')).toBe('T-Mobile');
  });
});

describe('resolveSafeBrandName', () => {
  it('uses a genuine scraped title', () => {
    expect(
      resolveSafeBrandName({ scrapeTitle: 'Acme Coffee', fallbackName: null, url: 'acme.com' }),
    ).toBe('Acme Coffee');
  });

  it('rejects a login title and falls back to the hostname', () => {
    expect(
      resolveSafeBrandName({
        scrapeTitle: 'Sign in - Claude',
        fallbackName: null,
        url: 'https://acme.com/login',
      }),
    ).toBe('acme.com');
  });

  it('rejects a login title but prefers an existing brand name over the hostname', () => {
    expect(
      resolveSafeBrandName({
        scrapeTitle: 'Sign in - Claude',
        fallbackName: 'Acme',
        url: 'acme.com',
      }),
    ).toBe('Acme');
  });

  it('caps an over-long title', () => {
    const long = 'A'.repeat(200);
    expect(
      resolveSafeBrandName({ scrapeTitle: long, fallbackName: null, url: 'x.com' }).length,
    ).toBe(80);
  });

  it('normalizes a bare hostname url without a scheme', () => {
    expect(
      resolveSafeBrandName({ scrapeTitle: '   ', fallbackName: null, url: 'acme.com/path' }),
    ).toBe('acme.com');
  });
});
