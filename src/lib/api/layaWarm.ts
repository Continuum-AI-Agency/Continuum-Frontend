import { LAYA_WARM_ROUTE, layaWarmResponseSchema } from '@continuum/contracts';
import { request } from '@/lib/api/http';

const WARM_INTERVAL_MS = 60_000;
let lastWarmAt = Number.NEGATIVE_INFINITY;

/**
 * Wake the Laya decision service the moment someone opens an AI input.
 *
 * Laya scales to zero and takes ~90s to load, so waiting for the first real
 * request means the first edit always falls back. Call this on focus/open of
 * an AI input; it is fire-and-forget, at most once a minute per tab, and a
 * failure is silent — warming is an optimisation, never a user-facing error.
 */
export function warmLaya(now: number = Date.now()): void {
  if (now - lastWarmAt < WARM_INTERVAL_MS) return;
  lastWarmAt = now;
  void request({ path: LAYA_WARM_ROUTE, method: 'POST', schema: layaWarmResponseSchema }).catch(() => undefined);
}
