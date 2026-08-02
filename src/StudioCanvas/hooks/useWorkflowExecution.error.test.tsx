import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';

// The Backend classifies a no-image failure and streams the reason. The canvas then
// threw it away: the post-stream check read `streamState` off the closure the
// callback was CREATED with, never the value the error frame had just set, so every
// backend-reported failure was stored on the node as "No output received from
// generation" — the one message that tells the user nothing about what to change.

mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

const { useWorkflowExecution } = await import('./useWorkflowExecution');

const sseStream = (frames: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
};

const stubFetch = (frames: string[]) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(sseStream(frames), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

const imagePayload = {
  medium: 'image' as const,
  prompt: 'a sneaker on wet concrete',
  brand_id: 'brand-1',
};

describe('executeStreamRequest error reporting', () => {
  afterEach(cleanup);

  it('returns the backend message and code from an SSE error frame', async () => {
    const restore = stubFetch([
      'event: error\ndata: {"message":"No image returned by Gemini. Retry only after changing the prompt or references.","code":"image_empty_response","retryable":false}\n\n',
    ]);

    try {
      const { result } = renderHook(() => useWorkflowExecution(), { wrapper });
      const outcome = await act(async () =>
        result.current.executeGeneration('node-1', imagePayload as never),
      );

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('changing the prompt or references');
      expect(outcome.errorCode).toBe('image_empty_response');
      expect(outcome.error).not.toBe('No output received from generation');
    } finally {
      restore();
    }
  });

  it('still reports a stream that ended with neither output nor error', async () => {
    const restore = stubFetch(['event: status\ndata: {"phase":"starting"}\n\n']);

    try {
      const { result } = renderHook(() => useWorkflowExecution(), { wrapper });
      const outcome = await act(async () =>
        result.current.executeGeneration('node-2', imagePayload as never),
      );

      expect(outcome.success).toBe(false);
      expect(outcome.error).toBe('No output received from generation');
      expect(outcome.errorCode).toBeUndefined();
    } finally {
      restore();
    }
  });
});
