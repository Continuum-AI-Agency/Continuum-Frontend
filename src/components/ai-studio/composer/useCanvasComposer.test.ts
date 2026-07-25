import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// Bug #222: the composer card's X did not close it. `cancel()` aborted the fetch
// and never touched the turn's status, and `dismiss()` returned right after
// calling it — so a turn whose stream had already ended stayed 'running' with a
// panel that hid only at 'idle'. These specs pin the two halves of that fix:
// Stop always SETTLES the turn, and Dismiss always RETIRES the panel.
//
// The stream is mocked at the module boundary; this file owns that mock alone
// because `mock.module` is process-wide.

type StreamArgs = { onFrame: (frame: unknown) => void; signal: AbortSignal };

let streamBehaviour: (args: StreamArgs) => Promise<void> = async () => {};

const streamCanvasComposer = mock(async (args: StreamArgs) => streamBehaviour(args));
const request = mock(async () => ({}));

mock.module('@/lib/ai-studio/composer/streamCanvasComposer', () => ({
  streamCanvasComposer,
}));
mock.module('@/lib/api/http', () => ({ http: { request } }));

const { useCanvasComposer } = await import('./useCanvasComposer');

const never = new Promise<void>(() => {});

describe('useCanvasComposer — settling and dismissing a turn', () => {
  beforeEach(() => {
    streamCanvasComposer.mockClear();
    request.mockClear();
    streamBehaviour = async () => {};
  });

  afterEach(cleanup);

  const startTurn = async (behaviour: (args: StreamArgs) => Promise<void>) => {
    streamBehaviour = behaviour;
    const hook = renderHook(() => useCanvasComposer('brand-1', 'room-1'));
    act(() => {
      void hook.result.current.submit('build me a workflow');
    });
    await waitFor(() => expect(streamCanvasComposer).toHaveBeenCalledTimes(1));
    return hook;
  };

  it('settles a turn whose stream never terminates when the user presses Stop', async () => {
    const hook = await startTurn(async () => never);
    await waitFor(() => expect(hook.result.current.state.status).toBe('running'));

    act(() => hook.result.current.cancel());

    await waitFor(() => expect(hook.result.current.state.status).toBe('done'));
    expect(hook.result.current.state.summary).toBe('(stopped)');
  });

  it('retires the panel when the X is pressed on a running turn', async () => {
    const hook = await startTurn(async () => never);
    await waitFor(() => expect(hook.result.current.state.status).toBe('running'));

    act(() => hook.result.current.dismiss());

    // Idle is the only state in which the progress card unmounts.
    await waitFor(() => expect(hook.result.current.state.status).toBe('idle'));
    expect(hook.result.current.state.graph).toBeNull();
  });

  it('retires the panel when the X is pressed on a finished turn', async () => {
    const hook = await startTurn(async ({ onFrame }) => {
      onFrame({ type: 'composer.graph', data: { nodeCount: 5, edgeCount: 4, addedNodeIds: [] } });
      onFrame({ type: 'response.done', data: { summary: 'Built it.' } });
    });
    await waitFor(() => expect(hook.result.current.state.status).toBe('done'));
    expect(hook.result.current.state.graph).not.toBeNull();

    act(() => hook.result.current.dismiss());

    await waitFor(() => expect(hook.result.current.state.status).toBe('idle'));
    expect(hook.result.current.state.graph).toBeNull();
  });
});
