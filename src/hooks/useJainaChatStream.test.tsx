import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

const { useJainaChatStream } = await import('./useJainaChatStream');

describe('useJainaChatStream', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    globalThis.fetch = realFetch;
  });

  it('does not report an intentional reader abort as a failed request', async () => {
    let resolveReadStarted: () => void = () => {};
    const readStarted = new Promise<void>((resolve) => {
      resolveReadStarted = resolve;
    });

    globalThis.fetch = (async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Expected the stream request to carry an abort signal.');

      const reader = {
        read: () =>
          new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => {
            resolveReadStarted();
            signal.addEventListener(
              'abort',
              () => reject(new Error('BodyStreamBuffer was aborted')),
              { once: true },
            );
          }),
        cancel: async () => undefined,
      } as unknown as ReadableStreamDefaultReader<Uint8Array>;

      return {
        ok: true,
        body: { getReader: () => reader },
        text: async () => '',
      } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useJainaChatStream());
    let request: ReturnType<typeof result.current.start>;
    act(() => {
      request = result.current.start({
        query: 'Build the report.',
        adAccountId: 'act_123',
        brandId: 'brand_123',
      });
    });
    await act(async () => {
      await readStarted;
    });

    let outcome: Awaited<typeof request>;
    await act(async () => {
      result.current.detach();
      outcome = await request;
    });

    expect(outcome.error).toBeUndefined();
  });
});
