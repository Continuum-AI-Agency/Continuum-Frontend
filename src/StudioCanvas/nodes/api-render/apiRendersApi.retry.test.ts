// The render calls' retry, tested where it lives (renderRetry.ts) rather than through a mocked
// http: tests that mock apiRendersApi share this process, and could never swap this module out.
import { expect, mock, test } from 'bun:test';
import { ApiError, markFetchFailure, wasRetried } from '@/lib/api/errors';
import { RequestTimeoutError } from '@/lib/api/timeout';
import { RENDER_RETRY_DELAYS_MS, renderCallsThrough, retryTransient } from './renderRetry';

/** A call that fails with each error in turn, then answers; and the waits it was made to take. */
const calls = (...errors: unknown[]) => {
  const run = mock(async (): Promise<unknown> => {
    const error = errors[run.mock.calls.length - 1];
    if (error) throw error;
    return { ok: true };
  });
  const waited: number[] = [];
  const wait = async (ms: number) => {
    waited.push(ms);
  };
  return { run, waited, retry: () => retryTransient(run, { wait }) };
};

// fastify/lib/route.js answers a request that arrives while the server closes with exactly this.
const closing503 = () =>
  new ApiError('Service Unavailable', 503, undefined, {
    error: 'Service Unavailable',
    message: 'Service Unavailable',
    statusCode: 503,
  });
/** What `http.request` throws when `fetch` itself rejects: a refused connection, a dropped one. */
const cut = () => markFetchFailure(new TypeError('Failed to fetch'));

test('the backoff is 1 s, 3 s, 8 s, then the last error, marked so React Query does not retry it', async () => {
  expect(RENDER_RETRY_DELAYS_MS).toEqual([1_000, 3_000, 8_000]);
  const last = closing503();
  const { run, waited, retry } = calls(cut(), closing503(), closing503(), last);
  await expect(retry()).rejects.toBe(last);
  expect(run).toHaveBeenCalledTimes(4);
  expect(waited).toEqual([1_000, 3_000, 8_000]);
  expect(wasRetried(last)).toBe(true);
});

test('a Fastify closing 503 is retried, and the same call (same body, same token) is made again', async () => {
  const { run, waited, retry } = calls(closing503());
  await expect(retry()).resolves.toEqual({ ok: true });
  expect(run).toHaveBeenCalledTimes(2);
  expect(waited).toEqual([1_000]);
});

test('a GET poll survives a deploy cut: refused connections, then the closing 503', async () => {
  const { run, retry } = calls(cut(), cut(), closing503());
  await expect(retry()).resolves.toEqual({ ok: true });
  expect(run).toHaveBeenCalledTimes(4);
});

test('a 502/503 with no body, or any phrase that is not a backend code, is retried', async () => {
  const { run, retry } = calls(
    new ApiError('502 Bad Gateway', 502),
    new ApiError('Service Temporarily Unavailable', 503, undefined, {
      error: 'Service Temporarily Unavailable',
    }),
  );
  await expect(retry()).resolves.toEqual({ ok: true });
  expect(run).toHaveBeenCalledTimes(3);
});

test('a 429 is retried', async () => {
  const { run, retry } = calls(new ApiError('Too Many Requests', 429));
  await expect(retry()).resolves.toEqual({ ok: true });
  expect(run).toHaveBeenCalledTimes(2);
});

test.each([
  [
    'a 503 carrying a backend code',
    () =>
      new ApiError('Fonts could not be verified', 503, undefined, {
        error: 'render_fonts_unverifiable',
      }),
  ],
  [
    'a 503 whose error is a validation object',
    () =>
      new ApiError('Validation error', 503, undefined, {
        error: { formErrors: ['not yet'], fieldErrors: {} },
      }),
  ],
  ['a 504, which may still be running', () => new ApiError('504 Gateway Timeout', 504)],
  [
    'a timeout, which already waited its bound',
    () => new RequestTimeoutError('https://api/jobs', 8_000),
  ],
  [
    'a TypeError thrown while building the request',
    () => new TypeError('Converting circular structure to JSON'),
  ],
])('%s is not retried, nor marked as retried', async (_name, make) => {
  const error = make();
  const { run, waited, retry } = calls(error);
  await expect(retry()).rejects.toBe(error);
  expect(run).toHaveBeenCalledTimes(1);
  expect(waited).toEqual([]);
  expect(wasRetried(error)).toBe(false);
});

// apiRendersApi spreads these in; built on a client that answers each call once with a deploy cut,
// every call here must still come back. Remove the wrapper from one and its case fails.
test.each([
  [
    'createBatch',
    (calls: ReturnType<typeof renderCallsThrough>) => calls.createBatch({ confirmationToken: 't' }),
  ],
  [
    'batchPreflight',
    (calls: ReturnType<typeof renderCallsThrough>) => calls.batchPreflight({} as never),
  ],
  ['listJobs', (calls: ReturnType<typeof renderCallsThrough>) => calls.listJobs('brand')],
  ['getJob', (calls: ReturnType<typeof renderCallsThrough>) => calls.getJob('brand', 'job')],
  [
    'createJob',
    (calls: ReturnType<typeof renderCallsThrough>) => calls.createJob({ confirmationToken: 't' }),
  ],
  ['preflight', (calls: ReturnType<typeof renderCallsThrough>) => calls.preflight({} as never)],
  [
    'getRenderSet',
    (calls: ReturnType<typeof renderCallsThrough>) => calls.getRenderSet('brand', 'set'),
  ],
])('%s goes through retryTransient', async (_name, call) => {
  let answered = 0;
  const request = mock(async (): Promise<never> => {
    if (answered++ === 0) throw closing503();
    return { ok: true } as never;
  });
  const calls = renderCallsThrough({ request } as never, { wait: async () => undefined });
  await expect(call(calls)).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
  // The same request, body and token included, was made again.
  expect(request.mock.calls[1]).toEqual(request.mock.calls[0]);
});

test('a preflight asked once is not retried, even through a cut', async () => {
  const request = mock(async (): Promise<never> => {
    throw closing503();
  });
  const calls = renderCallsThrough({ request } as never, { wait: async () => undefined });
  await expect(calls.preflight({} as never, { retry: false })).rejects.toBeInstanceOf(ApiError);
  expect(request).toHaveBeenCalledTimes(1);
});
