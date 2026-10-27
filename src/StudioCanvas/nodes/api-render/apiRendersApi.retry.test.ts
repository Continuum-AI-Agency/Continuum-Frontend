import { afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';

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

test('a 502 with no body is retried', async () => {
  fails(new ApiError('502 Bad Gateway', 502));
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.preflight({} as never)).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
});

test('a 429 is retried', async () => {
  fails(new ApiError('Too Many Requests', 429));
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.batchPreflight({} as never)).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
});

test('a network TypeError is retried', async () => {
  fails(new TypeError('Failed to fetch'));
  request.mockImplementationOnce(async () => ({ ok: true }));
  await expect(apiRendersApi.getRenderSet('brand', 'set')).resolves.toEqual({ ok: true });
  expect(request).toHaveBeenCalledTimes(2);
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
  fails(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), closing503());
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
  fails(new TypeError('Failed to fetch'), closing503(), closing503(), last);
  await expect(apiRendersApi.getJob('brand', 'job')).rejects.toBe(last);
  expect(request).toHaveBeenCalledTimes(4);
});
