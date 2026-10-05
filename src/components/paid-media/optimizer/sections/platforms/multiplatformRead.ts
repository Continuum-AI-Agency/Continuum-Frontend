// What every multi-platform read does when its RPC is not deployed yet. The migrations that
// create optimizer_get_account_platform_metrics, optimizer_get_portfolio_metrics and the
// attribution RPCs ship separately from the Frontend, so for a while the page runs against a
// database that does not have them. That is a known state, not a failure: the surface says
// the numbers are not available yet and keeps today's Meta screens, instead of an error
// someone files a bug about.

/** PostgREST answers a function it does not know with PGRST202 (not in the schema cache);
 *  Postgres itself, called directly, with 42883 (undefined_function). */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

/** True when a supabase-js `{ error }` says the RPC does not exist, rather than that it failed. */
export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && MISSING_FUNCTION_CODES.has(code);
}

/** The one sentence every multi-platform surface shows while its RPC is missing. */
export const MULTIPLATFORM_UNAVAILABLE_TITLE = "Multi-platform numbers aren't available yet";

/** Thrown by a multi-platform fetcher when isMissingRpcError holds, so a query can tell
 *  "not deployed" from "failed" without retrying a function that will not appear. */
export class MissingRpcError extends Error {
  readonly rpc: string;
  constructor(rpc: string) {
    super(`${rpc} is not deployed yet`);
    this.name = 'MissingRpcError';
    this.rpc = rpc;
  }
}
