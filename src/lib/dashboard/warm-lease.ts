// Client-side lease that bounds how often the dashboard fires an on-demand
// brand warm. The stored value is an absolute expiry timestamp (ms). A short
// expiry is written when a warm is claimed (so an abandoned/failed attempt
// retries soon); a long expiry replaces it on success so a brand whose trends
// never populate does not refire every short window.

export const WARM_LEASE_SHORT_MS = 10 * 60 * 1000;
export const WARM_LEASE_LONG_MS = 6 * 60 * 60 * 1000;

export function warmLeaseKey(brandId: string): string {
  return `continuum:warm-lease:b:${brandId}`;
}

export function warmLeaseExpiry(now: number, ttlMs: number): string {
  return String(now + ttlMs);
}

export function isWarmLeaseOpen(rawExpiry: string | null, now: number): boolean {
  if (!rawExpiry) return true;
  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry)) return true;
  return now >= expiry;
}
