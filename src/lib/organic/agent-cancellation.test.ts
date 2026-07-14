import { describe, expect, it, mock } from 'bun:test';
import {
  cancelOrganicJobOptimistically,
  confirmOrganicRunCancellation,
  requestOrganicJobCancellation,
  requestOrganicRunCancellation,
} from './agent-cancellation';

const requestDeps = (response: Response) => {
  const fetchImpl = mock(async () => response);
  return {
    deps: {
      apiBaseUrl: 'https://api.example.test',
      fetchImpl,
      getAccessToken: async () => 'access-token',
    },
    fetchImpl,
  };
};

describe('organic agent cancellation requests', () => {
  it('confirms Stop only from a successful cancelled run response', async () => {
    const { deps, fetchImpl } = requestDeps(
      Response.json({ runId: 'run-1', status: 'cancelled' }),
    );

    await expect(requestOrganicRunCancellation('run-1', deps)).resolves.toEqual({
      runId: 'run-1',
      status: 'cancelled',
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/organic/agent/runs/run-1/cancel',
    );
  });

  it('rejects Stop when the run endpoint does not confirm cancellation', async () => {
    const { deps } = requestDeps(Response.json({ error: 'still running' }, { status: 500 }));

    await expect(requestOrganicRunCancellation('run-1', deps)).rejects.toThrow(
      'Could not stop the active run.',
    );
  });

  it('confirms queued X only from a cancelled job response', async () => {
    const { deps, fetchImpl } = requestDeps(
      Response.json({ job: { jobId: 'job-1', status: 'cancelled' } }),
    );

    await expect(
      requestOrganicJobCancellation({ jobId: 'job-1', brandId: 'brand-1' }, deps),
    ).resolves.toEqual({ jobId: 'job-1', status: 'cancelled' });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ brandId: 'brand-1' }),
    });
  });

  it('accepts a truthful cooperative running cancellation acknowledgement', async () => {
    const { deps } = requestDeps(
      Response.json({
        job: { jobId: 'job-1', status: 'running', cancelRequested: true },
      }),
    );

    await expect(
      requestOrganicJobCancellation({ jobId: 'job-1', brandId: 'brand-1' }, deps),
    ).resolves.toEqual({ jobId: 'job-1', status: 'running', cancelRequested: true });
  });

  it('rejects queued X when a 200 response does not contain a cancelled job', async () => {
    const { deps } = requestDeps(Response.json({ job: null }));

    await expect(
      requestOrganicJobCancellation({ jobId: 'job-1', brandId: 'brand-1' }, deps),
    ).rejects.toThrow('Could not cancel the queued generation.');
  });
});

describe('organic cancellation UI reconciliation', () => {
  it('awaits Stop confirmation before reconciling the active run', async () => {
    let confirmRequest: (() => void) | undefined;
    const request = mock(
      () =>
        new Promise<void>((resolve) => {
          confirmRequest = resolve;
        }),
    );
    const acknowledge = mock(() => {});
    const reconcileCurrent = mock(() => {});

    const pending = confirmOrganicRunCancellation({
      runId: 'run-1',
      request,
      acknowledge,
      isCurrent: () => true,
      reconcileCurrent,
    });
    expect(acknowledge).toHaveBeenCalledTimes(0);
    expect(reconcileCurrent).toHaveBeenCalledTimes(0);

    confirmRequest?.();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(acknowledge).toHaveBeenCalledWith('run-1');
    expect(reconcileCurrent).toHaveBeenCalledTimes(1);
  });

  it('keeps the active run unreconciled when Stop fails', async () => {
    const acknowledge = mock(() => {});
    const reconcileCurrent = mock(() => {});

    await expect(
      confirmOrganicRunCancellation({
        runId: 'run-1',
        request: async () => {
          throw new Error('cancel failed');
        },
        acknowledge,
        isCurrent: () => true,
        reconcileCurrent,
      }),
    ).resolves.toEqual({ ok: false, error: 'cancel failed' });
    expect(acknowledge).toHaveBeenCalledTimes(0);
    expect(reconcileCurrent).toHaveBeenCalledTimes(0);
  });

  it('does not detach a newer run when an older Stop response arrives late', async () => {
    let currentRunId = 'run-1';
    let confirmRequest: (() => void) | undefined;
    const acknowledge = mock(() => {});
    const reconcileCurrent = mock(() => {});
    const pending = confirmOrganicRunCancellation({
      runId: 'run-1',
      request: () =>
        new Promise<void>((resolve) => {
          confirmRequest = resolve;
        }),
      acknowledge,
      isCurrent: (runId) => currentRunId === runId,
      reconcileCurrent,
    });

    currentRunId = 'run-2';
    confirmRequest?.();

    await expect(pending).resolves.toEqual({ ok: true });
    expect(acknowledge).toHaveBeenCalledWith('run-1');
    expect(reconcileCurrent).toHaveBeenCalledTimes(0);
  });

  it('removes a queued job after the X request succeeds', async () => {
    const remove = mock(() => {});
    const restore = mock(() => {});
    const confirm = mock(() => {});
    const notifyFailure = mock(() => {});

    await expect(
      cancelOrganicJobOptimistically({
        job: { jobId: 'job-1', brandId: 'brand-1', status: 'queued' },
        remove,
        restore,
        confirm,
        notifyFailure,
        request: async () => {},
      }),
    ).resolves.toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(0);
    expect(confirm).toHaveBeenCalledWith('job-1');
    expect(notifyFailure).toHaveBeenCalledTimes(0);
  });

  it('rolls back the queued job and reports the X request failure', async () => {
    const job = { jobId: 'job-1', brandId: 'brand-1', status: 'queued' };
    const remove = mock(() => {});
    const restore = mock(() => {});
    const confirm = mock(() => {});
    const notifyFailure = mock(() => {});

    await expect(
      cancelOrganicJobOptimistically({
        job,
        remove,
        restore,
        confirm,
        notifyFailure,
        request: async () => {
          throw new Error('cancel failed');
        },
      }),
    ).resolves.toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith(job);
    expect(confirm).toHaveBeenCalledTimes(0);
    expect(notifyFailure).toHaveBeenCalledWith('cancel failed');
  });
});
