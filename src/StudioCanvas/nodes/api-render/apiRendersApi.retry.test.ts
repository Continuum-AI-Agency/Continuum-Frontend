import { afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { ApiError, markFetchFailure } from '@/lib/api/errors';

type Input = { path: string; body?: unknown };
const request = mock(async (_input: Input): Promise<unknown> => ({}));
mock.module('@/lib/api/http', () => ({ http: { request } }));
const { apiRendersApi, renderRetry } = await import('./apiRendersApi');

beforeAll(() => {
  renderRetry.delaysMs = [0, 0, 0];
});
afterEach(() => request.mockReset());

// fastify/lib/route.js answers a request that arrives while the server closes with exactly this.
const closing503 = () =>
  new ApiError('Service Unavailable', 503, undefined, {
    error: 'Service Unavailable',
    message: 'Service Unavailable',
    statusCode: 503,
  });
/** What `http.request` throws when `fetch` itself rejects: a refused connection, a dropped one. */
const cut = () => markFetchFailure(new TypeError('Failed to fetch'));
const fails = (...errors: unknown[]) => {
  for (const error of errors)
    request.mockImplementationOnce(async () => {
      throw error;
    });
};

test('a Fastify closing 503 is retried with the same body and token', async () => {
  fails(closing503());
  request.mockImplementationOnce(async () => ({ id: 'job' }));
  await expect(apiRendersApi.createJob({ confirmationToken: 'token' })).resolves.toEqual({
    id: 'job',
  });
  expect(request).toHaveBeenCalledTimes(2);
  const [first, second] = request.mock.calls.map(([input]) => input);
  expect(second).toEqual(first);
  expect(second?.body).toEqual({ confirmationToken: 'token' });
});

test('a 503 carrying a backend code is a domain error, not retried', async () => {
  const unverifiable = new ApiError('Fonts could not be verified', 503, undefined, {
    error: 'render_fonts_unverifiable',
    message: 'Fonts could not be verified',
  });
  fails(unverifiable);
  await expect(apiRendersApi.createBatch({ confirmationToken: 'token' })).rejects.toBe(
    unverifiable,
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test('a 502/503 with no body, or any phrase that is not a backend code, is retried', async () => {
  fails(
    new ApiError('502 Bad Gateway', 502),
    new ApiError('Bad Gateway', 502, undefined, { error: 'Bad Gateway' }),
    new ApiError('Service Temporarily Unavailable', 503, undefined, {
      error: 'Service Temporarily Unavailable',
    }),
  );
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.preflight({} as never)).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(4);
});

test('a 503 whose error is an object is the backend talking, not retried', async () => {
  const refused = new ApiError('Validation error', 503, undefined, {
    error: { formErrors: ['not yet'], fieldErrors: {} },
  });
  fails(refused);
  await expect(apiRendersApi.createJob({ confirmationToken: 'token' })).rejects.toBe(refused);
  expect(request).toHaveBeenCalledTimes(1);
});

test('a 429 is retried', async () => {
  fails(new ApiError('Too Many Requests', 429));
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.batchPreflight({} as never)).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
});

test('fetch failing is retried', async () => {
  fails(cut());
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.getRenderSet('brand', 'set')).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
});

test('a TypeError thrown while building the request is a bug, not retried', async () => {
  const bug = new TypeError('Converting circular structure to JSON');
  fails(bug);
  await expect(apiRendersApi.createBatch({ confirmationToken: 'token' })).rejects.toBe(bug);
  expect(request).toHaveBeenCalledTimes(1);
});

test('a 504 is not retried: the request may still be running', async () => {
  const gatewayTimeout = new ApiError('504 Gateway Timeout', 504);
  fails(gatewayTimeout);
  await expect(apiRendersApi.createJob({ confirmationToken: 'token' })).rejects.toBe(
    gatewayTimeout,
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test('a timeout is not retried', async () => {
  const { RequestTimeoutError } = await import('@/lib/api/timeout');
  const timedOut = new RequestTimeoutError('https://api/jobs', 8_000);
  fails(timedOut);
  await expect(apiRendersApi.listJobs('brand')).rejects.toBe(timedOut);
  expect(request).toHaveBeenCalledTimes(1);
});

test('a GET poll survives a deploy cut: refused connections, then the closing 503', async () => {
  fails(cut(), cut(), closing503());
  request.mockImplementationOnce(async () => ({ id: 'job', status: 'running' }));
  await expect(apiRendersApi.getJob('brand', 'job')).resolves.toEqual({
    id: 'job',
    status: 'running',
  });
  expect(request).toHaveBeenCalledTimes(4);
  for (const [input] of request.mock.calls) expect(input.path).toContain('/job?brandId=brand');
});

test('a cut longer than the backoff fails with the last error', async () => {
  const last = closing503();
  fails(cut(), closing503(), closing503(), last);
  await expect(apiRendersApi.getJob('brand', 'job')).rejects.toBe(last);
  expect(request).toHaveBeenCalledTimes(4);
});
