// The key the provider has always used. Changing it would mint a fresh id for every
// existing browser, orphaning the identity any in-flight claim was made under.
const CLIENT_ID_KEY = 'continuum:client-render:device';

/**
 * This browser's stable render-client id.
 *
 * `localStorage`, so it survives a reload — which is the whole point when a job is
 * ADDRESSED to a session: the in-memory `startedHere` set in `ownedRuns.ts` dies with
 * the tab, and a render addressed to a tab that reloaded would otherwise be stranded
 * until its address expired. Falls back to a per-session id when storage is unavailable
 * (private windows, blocked site data), which degrades to today's behaviour rather than
 * throwing inside a provider that mounts on every authenticated page.
 */
export function getClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = `browser-${crypto.randomUUID()}`;
    window.localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `session-${crypto.randomUUID()}`;
  }
}
