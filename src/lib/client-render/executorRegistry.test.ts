import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  type ClientRenderExecutor,
  type ClientRenderExecutorContext,
  getClientRenderExecutor,
  registerClientRenderExecutor,
  registerLazyClientRenderExecutor,
} from './executorRegistry';

describe('lazy render executors', () => {
  const original = new Map<Parameters<typeof getClientRenderExecutor>[0], ClientRenderExecutor>();
  beforeEach(() => {
    original.clear();
    for (const kind of ['timeline_editor', 'planner_reel'] as const) {
      const executor = getClientRenderExecutor(kind);
      if (executor) original.set(kind, executor);
    }
  });
  afterEach(() => {
    for (const [kind, executor] of original) registerClientRenderExecutor(kind, executor);
  });

  it('loads only the requested executor and forwards its context and result', async () => {
    const result = { resultAssetIds: ['rendered-asset'], title: 'Rendered' };
    const execute = mock(async () => result);
    const load = mock(async () => execute);
    const otherLoad = mock(async () => execute);
    const unregister = registerLazyClientRenderExecutor('timeline_editor', load);
    const unregisterOther = registerLazyClientRenderExecutor('planner_reel', otherLoad);
    try {
      expect(load).not.toHaveBeenCalled();
      expect(otherLoad).not.toHaveBeenCalled();
      const context = { signal: new AbortController().signal } as ClientRenderExecutorContext;
      expect(await getClientRenderExecutor('timeline_editor')?.(context)).toBe(result);
      expect(load).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(context);
      expect(otherLoad).not.toHaveBeenCalled();
    } finally {
      unregister();
      unregisterOther();
    }
  });

  it('does not execute a job cancelled while its chunk was loading', async () => {
    const controller = new AbortController();
    const execute = mock(async () => ({ resultAssetIds: [], title: 'Unexpected' }));
    const loading = Promise.withResolvers<ClientRenderExecutor>();
    const unregister = registerLazyClientRenderExecutor('timeline_editor', () => loading.promise);
    try {
      const context = { signal: controller.signal } as ClientRenderExecutorContext;
      const pending = getClientRenderExecutor('timeline_editor')?.(context);
      controller.abort();
      loading.resolve(execute);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('propagates download errors and does not load an already cancelled job', async () => {
    const failure = new Error('Chunk unavailable');
    const load = mock(async (): Promise<ClientRenderExecutor> => {
      throw failure;
    });
    const unregister = registerLazyClientRenderExecutor('timeline_editor', load);
    try {
      const controller = new AbortController();
      const context = { signal: controller.signal } as ClientRenderExecutorContext;
      await expect(getClientRenderExecutor('timeline_editor')?.(context)).rejects.toBe(failure);
      controller.abort();
      await expect(getClientRenderExecutor('timeline_editor')?.(context)).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});
