import { expect, spyOn, test } from 'bun:test';
import { isFetchFailure } from '@/lib/api/errors';
import { request } from '@/lib/api/http';

// A retry may repeat what `fetch` itself refused, never a request that could not be built.
test('fetch rejecting is marked as a fetch failure; the error is the same TypeError', async () => {
  const refused = new TypeError('Failed to fetch');
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
    throw refused;
  }) as unknown as typeof fetch);
  try {
    const error = await request({ path: '/api/render/jobs' }).catch((thrown: unknown) => thrown);
    expect(error).toBe(refused);
    expect(isFetchFailure(error)).toBe(true);
  } finally {
    fetchSpy.mockRestore();
  }
});

test('a TypeError while building the request is not one', async () => {
  const body: Record<string, unknown> = {};
  body.self = body;
  const fetchSpy = spyOn(globalThis, 'fetch');
  try {
    const error = await request({ path: '/api/render/jobs', method: 'POST', body }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(TypeError);
    expect(isFetchFailure(error)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
