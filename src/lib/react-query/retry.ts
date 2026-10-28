// Retries that do not retry a timeout.
//
// A read that hung for its whole bound and was then retried is the bound paid twice: with the
// default `retry: 1` and the 10 s read bound, a dead socket held the Optimizer at a skeleton
// for ~17 s and the rest of Performance+ for far longer. A server that answered with an error
// may answer the retry; a server that did not answer at all gets the surface's named state and
// a Retry control instead.

import { wasRetried } from '@/lib/api/errors';
import { isRequestTimeout } from '@/lib/api/timeout';

/** Nor an error the call already retried itself (a render read through a deploy cut). */
export function retryUnlessTimeout(maxRetries: number) {
  return (failureCount: number, error: unknown): boolean =>
    failureCount < maxRetries && !isRequestTimeout(error) && !wasRetried(error);
}
