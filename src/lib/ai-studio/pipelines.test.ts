import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({} as unknown));

mock.module('@/lib/api/http', () => ({
  request: requestMock,
  http: { request: requestMock },
}));

import {
  fetchPipelineCapabilities,
  readPipelineRun,
  startPipelineRun,
  waitForPipelineRun,
} from './pipelines';

const identity = {
  family_id: '11111111-1111-4111-8111-111111111111',
  revision: 2,
  contract_hash: 'a'.repeat(64),
};

const invocation = {
  brand_profile_id: '22222222-2222-4222-8222-222222222222',
  pipeline_id: '33333333-3333-4333-8333-333333333333',
  identity,
  idempotency_key: '44444444-4444-4444-8444-444444444444',
  origin: 'client' as const,
  inputs: {
    brief: { kind: 'text' as const, value: 'A precise launch brief' },
  },
  controls: {},
};

describe('pipeline capability api', () => {
  beforeEach(() => requestMock.mockReset());

  it('reads the V2 catalog through the direct Backend client', async () => {
    requestMock.mockResolvedValueOnce({ capabilities: [] } as never);

    await fetchPipelineCapabilities(invocation.brand_profile_id);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/api/ai-studio/pipeline-capabilities?brandProfileId=${invocation.brand_profile_id}`,
        cache: 'no-store',
      }),
    );
  });

  it('starts a durable run with the canonical invocation body', async () => {
    requestMock.mockResolvedValueOnce({ status: 'queued', run_id: 'run-1' } as never);

    await startPipelineRun(invocation);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/ai-studio/pipeline-runs',
        method: 'POST',
        body: invocation,
        cache: 'no-store',
      }),
    );
  });

  it('reads a durable receipt by run id', async () => {
    requestMock.mockResolvedValueOnce({ status: 'running', run_id: 'run-1' } as never);

    await readPipelineRun(invocation.brand_profile_id, '55555555-5555-4555-8555-555555555555');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/api/ai-studio/pipeline-runs/55555555-5555-4555-8555-555555555555?brandProfileId=${invocation.brand_profile_id}`,
        cache: 'no-store',
      }),
    );
  });

  it('polls queued and running receipts until the durable run settles', async () => {
    requestMock
      .mockResolvedValueOnce({
        status: 'queued',
        run_id: '55555555-5555-4555-8555-555555555555',
      } as never)
      .mockResolvedValueOnce({
        status: 'running',
        run_id: '55555555-5555-4555-8555-555555555555',
      } as never)
      .mockResolvedValueOnce({
        status: 'completed',
        run_id: '55555555-5555-4555-8555-555555555555',
      } as never);

    const receipt = await waitForPipelineRun(
      invocation.brand_profile_id,
      '55555555-5555-4555-8555-555555555555',
      { intervalMs: 0 },
    );

    expect(receipt.status).toBe('completed');
    expect(requestMock).toHaveBeenCalledTimes(3);
  });
});
