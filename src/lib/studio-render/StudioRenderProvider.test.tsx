import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const show = mock(() => undefined);

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show }),
}));

mock.module('@/app/(post-auth)/settings/actions', () => ({
  switchActiveBrandAction: mock(async () => undefined),
}));

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: mock(() => undefined), refresh: mock(() => undefined) }),
}));

import { type StudioRenderOrigin, useStudioRenderStore } from './renderStore';
import {
  StudioRenderProvider,
  type StudioRenderTask,
  useStudioRenderQueue,
} from './StudioRenderProvider';

const origin = (nodeId: string): StudioRenderOrigin => ({
  brandProfileId: 'f8cf8a04-2920-4ce8-a60b-36675ef9f379',
  roomId: '999dad2e-64a0-4eb3-aefb-c10afdcc93df',
  nodeId,
  label: 'Video Editor',
  viewHref: `/ai-studio?roomId=999dad2e-64a0-4eb3-aefb-c10afdcc93df&focusNodeId=${nodeId}`,
});

let queue: ReturnType<typeof useStudioRenderQueue> | null = null;

function Harness({ children }: { children?: ReactNode }) {
  queue = useStudioRenderQueue();
  return children ?? null;
}

function completedTask(taskOrigin: StudioRenderOrigin, execute: StudioRenderTask['execute']) {
  return { origin: taskOrigin, execute } satisfies StudioRenderTask;
}

describe('StudioRenderProvider', () => {
  beforeEach(() => {
    cleanup();
    queue = null;
    show.mockClear();
    useStudioRenderStore.getState().reset();
  });

  it('runs render tasks one at a time in FIFO order and keeps a persistent completion toast', async () => {
    render(
      <StudioRenderProvider>
        <Harness />
      </StudioRenderProvider>,
    );

    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    let first: ReturnType<NonNullable<typeof queue>['enqueue']> | undefined;
    let second: ReturnType<NonNullable<typeof queue>['enqueue']> | undefined;
    act(() => {
      first = queue?.enqueue(
        completedTask(origin('one'), async ({ setPhase }) => {
          events.push('one:start');
          setPhase('rendering');
          await firstGate;
          events.push('one:end');
          return { status: 'completed', title: 'First finished' };
        }),
      );
      second = queue?.enqueue(
        completedTask(origin('two'), async () => {
          events.push('two:start');
          return { status: 'completed', title: 'Second finished' };
        }),
      );
    });

    expect(first?.accepted).toBe(true);
    expect(second?.accepted).toBe(true);
    await waitFor(() => expect(events).toEqual(['one:start']));

    await act(async () => releaseFirst?.());
    await waitFor(() => expect(events).toEqual(['one:start', 'one:end', 'two:start']));
    await waitFor(() => expect(show).toHaveBeenCalledTimes(2));

    expect(show.mock.calls[0]?.[0]).toMatchObject({
      title: 'First finished',
      durationMs: Infinity,
      action: { label: 'View' },
    });
  });

  it('deduplicates an active render for the same canvas node', async () => {
    render(
      <StudioRenderProvider>
        <Harness />
      </StudioRenderProvider>,
    );

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = completedTask(origin('same'), async () => {
      await gate;
      return { status: 'completed', title: 'Finished' };
    });

    let first: ReturnType<NonNullable<typeof queue>['enqueue']> | undefined;
    let duplicate: ReturnType<NonNullable<typeof queue>['enqueue']> | undefined;
    act(() => {
      first = queue?.enqueue(task);
      duplicate = queue?.enqueue(task);
    });
    expect(first?.accepted).toBe(true);
    expect(duplicate).toEqual({ accepted: false, jobId: first?.jobId });

    await act(async () => release?.());
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  });
});
