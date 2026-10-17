// The one client timeout policy for Performance+ data calls.
//
// No data call carried a client timeout except the Optimizer's, so a hung socket left Jaina,
// Campaigns, the Dashboard, the Canvas and Home as a skeleton with no clock and no named state
// (PP-L1-no-client-timeout-hang-is-a-skeleton-forever). Every read now has a bound, decided
// HERE — the Supabase browser client and `http.request` both route their `fetch` through
// `fetchWithTimeout` — and a bound that fires is a `RequestTimeoutError` the surface can name
// ("didn't answer in time") and offer a retry for. Long operations (a cycle run, an upload, a
// model call) keep a much larger budget, chosen by URL, never by the caller forgetting.

/** A read a person is waiting on: past this the surface says so instead of spinning. 8 s, not
 *  10: the intent is a named state within 15 s of opening the page, and hydration plus the
 *  account resolution ahead of the first read cost 3–5 s on the real surfaces (the Optimizer
 *  lived at 8 s before this module existed). */
export const READ_TIMEOUT_MS = 8_000;
/** A write or a job the server works on for a while (a cycle, an upload, a model call). */
export const LONG_OPERATION_TIMEOUT_MS = 120_000;

/** The sentence every timeout carries; `isRequestTimeout` recognises it after supabase-js has
 *  reduced the error to `{ message }` (PostgREST) or wrapped it in `FunctionsFetchError`. */
const TIMEOUT_MESSAGE = /didn't answer in \d+ s\.$/;

export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly url: string;
  /** postgrest-js retries a failed GET three times unless the error is an abort; this names it
   *  one, so a bound that fired is final instead of paid four times over. */
  readonly code = 'ABORT_ERR';

  constructor(url: string, timeoutMs: number) {
    super(`The server didn't answer in ${Math.round(timeoutMs / 1000)} s.`);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

const field = (error: unknown, key: string): unknown =>
  error && typeof error === 'object' ? Reflect.get(error, key) : undefined;

/** True for our own bound, for a platform `AbortSignal.timeout` firing, and for either once a
 *  client library has wrapped it (`context`, `cause`) or kept only its message. */
export function isRequestTimeout(error: unknown, depth = 0): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (!error || typeof error !== 'object') return false;
  if (field(error, 'name') === 'TimeoutError') return true;
  const message = field(error, 'message');
  if (typeof message === 'string' && TIMEOUT_MESSAGE.test(message)) return true;
  if (depth >= 3) return false;
  return (
    isRequestTimeout(field(error, 'context'), depth + 1) ||
    isRequestTimeout(field(error, 'cause'), depth + 1)
  );
}

/** Rejects with `RequestTimeoutError` when `promise` has not settled after `ms`. For promises
 *  the caller cannot hand a signal to. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError(what, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type TimedSignal = {
  signal: AbortSignal;
  timedOut: () => boolean;
  /** Stops the timer; the parent's abort still propagates. */
  clearTimer: () => void;
  /** Stops the timer and detaches from the parent. */
  clear: () => void;
};

/** A signal that aborts after `ms` or when `parent` aborts, whichever is first. `timedOut()`
 *  says which, so the caller's own abort (an unmount) is never reported as a timeout. */
export function timeoutSignal(ms: number, parent?: AbortSignal | null): TimedSignal {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) onParentAbort();
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clearTimer: () => clearTimeout(timer),
    clear: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

/** How long a request may take, by what it is; null = no bound. */
export type TimeoutPolicy = (url: string, method: string) => number | null;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const requestMethod = (input: RequestInfo | URL, init?: RequestInit): string =>
  (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

/** `fetch` with the policy's bound on the time to the response headers. "Didn't answer" is the
 *  server not answering at all; a body that streams for minutes (a chat turn, a report) keeps
 *  its connection once the headers are in. A caller's own `signal` still aborts the request at
 *  any point; only the policy's timer is reported as `RequestTimeoutError`. Typed as `typeof
 *  fetch` for the clients that take one (supabase-js `global.fetch`); the Node-only
 *  `preconnect` is never called. */
export function fetchWithTimeout(policy: TimeoutPolicy, base: FetchLike = fetch): typeof fetch {
  const bounded: FetchLike = async (input, init) => {
    const url = requestUrl(input);
    const ms = policy(url, requestMethod(input, init));
    if (ms === null) return base(input, init);
    const parent = init?.signal ?? (input instanceof Request ? input.signal : null);
    const timed = timeoutSignal(ms, parent);
    try {
      return await base(input, { ...init, signal: timed.signal });
    } catch (error) {
      if (timed.timedOut()) throw new RequestTimeoutError(url, ms);
      throw error;
    } finally {
      // Stops the timer only; the parent's abort still reaches the body through the signal.
      timed.clearTimer();
    }
  };
  return bounded as unknown as typeof fetch;
}

/**
 * Edge functions that do work, not reads: a person asked for a job and expects to wait. Each
 * entry names why it is here; anything not listed is a read on the 10 s bound.
 */
const LONG_EDGE_FUNCTIONS: ReadonlySet<string> = new Set([
  // Optimizer jobs: a cycle, a preview, a suggestion, an insight, an enrollment, a convert, and
  // every apply writes to the ad platform and reads back.
  'optimizer-run',
  'optimizer-cycle-preview',
  'optimizer-suggest',
  'optimizer-insight',
  'optimizer-enroll',
  'optimizer-convert-cbo',
  'optimizer-apply-run',
  'optimizer-apply-revert',
  'optimizer-apply-approved',
  'optimizer-apply-adset-status',
  'optimizer-apply-actions',
  'optimizer-apply-action-revert',
  // Rule actions: an approval executes against the platform.
  'rule-actions',
  // Media: uploads, clips, analysis and embeddings move bytes or call a model.
  'library-upload',
  'library-share',
  'library-creative-operations',
  'clip-asset',
  'link-reel-mp4',
  'analyze_media',
  'embed_document',
  // Brand jobs: warming, reports, invites and admin writes.
  'warm-brand-now',
  'send-first-value-report',
  'get-brand-book',
  'brand_invite',
  'integration_accounts',
  'delete_brand_profile',
  'impersonate-user',
  'admin-update-tier',
  'admin-update-access',
  'admin-set-admin',
  'admin-list-users',
  'admin-access-actions',
]);

/** The Supabase client's bound, by URL: storage has none (uploads take as long as they take),
 *  a long edge function or a cache-bypassing refresh gets the long budget, every other REST,
 *  RPC, auth and edge call is a read. */
export const supabaseTimeoutPolicy: TimeoutPolicy = (url) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return READ_TIMEOUT_MS;
  }
  if (parsed.pathname.startsWith('/storage/v1/')) return null;
  const edge = /^\/functions\/v1\/([^/?]+)/.exec(parsed.pathname);
  if (edge) {
    const name = edge[1] ?? '';
    if (LONG_EDGE_FUNCTIONS.has(name)) return LONG_OPERATION_TIMEOUT_MS;
    // `refresh=true` bypasses the reporting edge cache and reads the platform live.
    if (parsed.searchParams.get('refresh') === 'true') return LONG_OPERATION_TIMEOUT_MS;
  }
  return READ_TIMEOUT_MS;
};

/** A render answered only once its file exists, so time-to-headers IS the encode: a fast cut
 *  at 1080×1920 and 60 fps, its master and its delivery copy. The render call passes it itself:
 *  routing it here by URL made this module (on every route, under http.ts) import the canvas
 *  contracts, which put /organic's first load 76 KiB over its budget. */
export const RENDER_TIMEOUT_MS = 300_000;

/** The Backend client's bound: a GET is a read; anything else may be a job. */
export const backendTimeoutPolicy: TimeoutPolicy = (_url, method) =>
  method === 'GET' ? READ_TIMEOUT_MS : LONG_OPERATION_TIMEOUT_MS;
