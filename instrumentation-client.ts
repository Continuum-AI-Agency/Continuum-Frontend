import { bufferEarlyErrors } from '@/lib/observability/earlyErrorBuffer';

// Analytics is not critical path.
//
// `posthog-js` is ~293 KiB. Next bundles instrumentation-client into the root files,
// so a static import here put the whole library ahead of first paint on EVERY route —
// a third of the shared runtime, paid even on /login, which has nothing to report yet.
// Loading it on idle after `load` took the shared runtime from 726 KiB to 433 KiB and
// brought all six failing bundle budgets back under their ceilings.
//
// The cost is a window before `posthog.init` where `capture_exceptions` is not yet
// listening. `bufferEarlyErrors` holds anything thrown in that window and replays it
// once the library arrives, so this defers WHEN analytics loads, not whether a crash
// is reported.

if (process.env.NODE_ENV !== 'development') {
  const earlyErrors = bufferEarlyErrors(window);

  const start = () => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
          api_host: '/ingest',
          ui_host: 'https://us.posthog.com',
          defaults: '2026-01-30',
          capture_exceptions: true,
        });
        earlyErrors.flushTo(posthog);
      })
      .catch(() => {
        // Analytics failing to load must not leave listeners attached forever.
        earlyErrors.stop();
      });
  };

  // requestIdleCallback is still absent in Safari, hence the timeout fallback.
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 4_000 });
    } else {
      window.setTimeout(start, 1_500);
    }
  };

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
