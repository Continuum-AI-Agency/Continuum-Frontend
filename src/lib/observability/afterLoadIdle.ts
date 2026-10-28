/**
 * Runs `fn` once the page has finished loading and the main thread is idle.
 *
 * For work that is not critical path (analytics). Started at hydration instead, it competes for
 * a slow connection with the page's own data requests, which start at that same moment.
 */
export function afterLoadIdle(fn: () => void): void {
  // requestIdleCallback is still absent in Safari, hence the timeout fallback.
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 4_000 });
    } else {
      window.setTimeout(fn, 1_500);
    }
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
