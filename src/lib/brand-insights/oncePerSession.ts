// Once-per-session guards for Trends notices and the lazy first run. Keys start with
// `organic:` so the logout purge (brandScopedStorage) clears them with the session.

export type TrendsSessionOnce = 'error-toast' | 'first-run';

export function claimOncePerSession(kind: TrendsSessionOnce, brandId: string): boolean {
  if (typeof window === 'undefined' || !brandId) return false;
  const key = `organic:trends-${kind}:${brandId}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Storage unavailable (private mode): the effect deps keep this to one call per mount.
  }
  return true;
}
