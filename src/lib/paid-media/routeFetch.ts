// The Dashboard's reads go through the app's own /api/paid-media/* routes with a plain `fetch`,
// which the client timeout policy never covered (it bounds Supabase, the edge functions and the
// Backend): a hung route kept the Explorer's skeletons for good
// (PP-DT-C-unfinished-dashboard-hang-and-raw-error). These routes read the ad platforms through
// the reporting edge, which has taken well past the 8 s read bound, so they get three of them —
// the same allowance the Jaina history read has.

import { fetchWithTimeout, READ_TIMEOUT_MS } from '@/lib/api/timeout';

export const PAID_MEDIA_ROUTE_READ_MS = READ_TIMEOUT_MS * 3;

/** `fetch` bounded to PAID_MEDIA_ROUTE_READ_MS to the response headers; a timeout rejects as
 *  RequestTimeoutError, which loadFailureMessage words. Resolves the global `fetch` per call. */
export const paidMediaRouteFetch = fetchWithTimeout(
  () => PAID_MEDIA_ROUTE_READ_MS,
  (input, init) => fetch(input, init),
);
