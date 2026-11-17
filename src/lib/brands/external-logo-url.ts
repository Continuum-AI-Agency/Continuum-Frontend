/**
 * A brand logo scraped from the brand's website is saved as its own https URL, not as a key in
 * `brand-profile-assets`. Storage cannot sign it ("Object not found"), and the browser can load
 * it as-is, so callers keep signing for storage keys only.
 */
export function isExternalLogoUrl(logoPath: string): boolean {
  return /^https?:\/\//i.test(logoPath);
}
