import { describe, expect, it } from 'bun:test';
import type { ScrapeResult } from '@/lib/onboarding/scrape';
import { scrapeToBrandPatch } from './JobPersistor';

// scrapeToBrandPatch is the ONLY writer of brand.name from a scrape, and its
// patch is what reaches brand_profiles.brand_name via storage.ts. It used to
// assign `scrape.title` verbatim, which is how brands named "Page Not Found |
// Framer" and "Continuum — Build continuity. Scale personalization." became
// permanent rows.
function scrape(title: string | null, url = 'https://acme.com'): ScrapeResult {
  return { url, title, colors: [] } as ScrapeResult;
}

describe('scrapeToBrandPatch', () => {
  it('reduces a scraped SEO title to the brand segment', () => {
    const patch = scrapeToBrandPatch(
      scrape('Continuum — Build continuity. Scale personalization.'),
      null,
    );
    expect(patch.brand?.name).toBe('Continuum');
  });

  it('does not persist an interstitial title, keeping the existing name', () => {
    const patch = scrapeToBrandPatch(scrape('Page Not Found | Framer'), "marcos's Brand");
    expect(patch.brand?.name).toBe("marcos's Brand");
  });

  it('falls back to the hostname when the title is junk and no name exists yet', () => {
    const patch = scrapeToBrandPatch(scrape('Sign in - Claude', 'https://acme.com/login'), '');
    expect(patch.brand?.name).toBe('acme.com');
  });

  it('keeps a clean title as-is and still carries the scraped url', () => {
    const patch = scrapeToBrandPatch(scrape('Starbucks Coffee Company'), null);
    expect(patch.brand?.name).toBe('Starbucks Coffee Company');
    expect(patch.brand?.website).toBe('https://acme.com');
  });
});
