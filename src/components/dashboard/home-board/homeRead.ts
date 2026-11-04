// What a tile holds of a Phase B Backend read (contracts home/reads). A read either carries its
// data, or says the source holds nothing, or is not here at all: the route answers 404 until the
// Backend deploys, and a read that failed is treated the same. In both the tile keeps drawing what
// it draws without the read, so a Backend read can add to a tile but never break it.

import type { HomeReadEnvelope, HomeReadMissing } from '@continuum/contracts';
import { ApiError, isFetchFailure } from '@/lib/api/errors';
import { isRequestTimeout } from '@/lib/api/timeout';

export type HomeReadLoad<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'missing'; missing: HomeReadMissing }
  | { status: 'ready'; data: T; generatedAt: string };

export function homeReadLoadOf<T>(read: HomeReadEnvelope<T>): HomeReadLoad<T> {
  if (read.state === 'ready') {
    return { status: 'ready', data: read.data, generatedAt: read.generatedAt };
  }
  return read.missing.reason === 'not_deployed'
    ? { status: 'unavailable' }
    : { status: 'missing', missing: read.missing };
}

export function readyDataOf<T>(load: HomeReadLoad<T>): T | null {
  return load.status === 'ready' ? load.data : null;
}

/** The route has not shipped or could not be reached: nothing is wrong and asking again won't
 *  help. Anything else is a Backend that answered and failed, which is worth a warning. */
export function homeReadNotHereYet(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.status === 404) ||
    isFetchFailure(error) ||
    isRequestTimeout(error)
  );
}
