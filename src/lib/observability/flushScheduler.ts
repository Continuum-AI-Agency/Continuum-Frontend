import { flushLogs } from './otelLogs';

type AfterFn = (task: () => unknown) => void;

let afterFn: Promise<AfterFn | null> | null = null;

/**
 * `next/server` only resolves inside the Next bundle — benches and specs import the logger under
 * plain Bun, where this import rejects. A rejected load degrades to "no auto-flush", and those
 * callers flush explicitly instead.
 */
function loadAfter(): Promise<AfterFn | null> {
  afterFn ??= import('next/server').then((mod) => mod.after as AfterFn).catch(() => null);
  return afterFn;
}

/**
 * Resolving `after` up front matters: a cold instance's first log would otherwise race the import
 * against the end of the request, and a flush registered after the response is dropped.
 */
export async function warmFlushScheduler(): Promise<void> {
  await loadAfter();
}

/**
 * Registers the flush as post-response work. The `.then` continuation stays inside the request's
 * async context, so `after` still sees the request scope.
 */
export function scheduleFlush(): void {
  void loadAfter().then((after) => {
    if (!after) return;
    try {
      after(() => flushLogs());
    } catch {
      // Called outside a request scope (module init, background task) — the caller owns the flush.
    }
  });
}
