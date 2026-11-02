// The app's own /api/paid-media/* routes are called with `fetch`, which the client timeout policy
// never covered (it bounds Supabase, the edge functions and the Backend): a hung route kept the
// Explorer's skeletons for good (PP-DT-C-unfinished-dashboard-hang-and-raw-error). Every call to
// those routes goes through this one bound, decided by URL in appRouteTimeoutPolicy — never a
// number per hook; routeFetch.guard.test.ts refuses a bare `fetch` to them.

import { appRouteTimeoutPolicy, fetchWithTimeout } from '@/lib/api/timeout';

/** `fetch` bounded by appRouteTimeoutPolicy to the response headers; a timeout rejects as
 *  RequestTimeoutError, which loadFailureMessage words. Resolves the global `fetch` per call. */
export const paidMediaRouteFetch = fetchWithTimeout(appRouteTimeoutPolicy, (input, init) =>
  fetch(input, init),
);
