import { describe, expect, it, mock } from 'bun:test';
import type { RequestOptions } from '@/lib/api/http.types';
import { requestOrganicJobRetry, retryOrganicJobOptimistically } from './agent-retry';

const okResponse = {
  job: { jobId: 'job-1', status: 'queued', draftId: 'draft-1', error: null },
};

describe('requestOrganicJobRetry', () => {
  it('POSTs the brand to the job retry path and parses the response through the contract', async () => {
    let captured: RequestOptions<unknown> | null = null;
    const request = (async (options: RequestOptions<unknown>) => {
      captured = options;
      return options.schema ? options.schema.parse(okResponse) : okResponse;
    }) as unknown as typeof import('@/lib/api/http').http.request;

    const result = await requestOrganicJobRetry({ jobId: 'job-1', brandId: 'brand-1' }, request);

    expect(captured?.path).toBe('/api/organic/agent/jobs/job-1/retry');
    expect(captured?.method).toBe('POST');
    expect(captured?.body).toEqual({ brandId: 'brand-1' });
    expect(result).toEqual(okResponse);
  });

  it('rejects a response that fails the contract schema', async () => {
    const request = (async (options: RequestOptions<unknown>) =>
      options.schema
        ? options.schema.parse({ job: { jobId: 'job-1' } })
        : {}) as unknown as typeof import('@/lib/api/http').http.request;

    await expect(
      requestOrganicJobRetry({ jobId: 'job-1', brandId: 'brand-1' }, request),
    ).rejects.toThrow();
  });

  it('propagates a transport rejection (non-ok request)', async () => {
    const request = (async () => {
      throw new Error('retry request failed');
    }) as unknown as typeof import('@/lib/api/http').http.request;

    await expect(
      requestOrganicJobRetry({ jobId: 'job-1', brandId: 'brand-1' }, request),
    ).rejects.toThrow('retry request failed');
  });
});

describe('retryOrganicJobOptimistically', () => {
  it('applies the optimistic patch and does not revert on success', async () => {
    const patch = mock(() => {});
    const revert = mock(() => {});
    const notifyFailure = mock(() => {});

    await expect(
      retryOrganicJobOptimistically({
        job: { jobId: 'job-1', brandId: 'brand-1' },
        patch,
        revert,
        notifyFailure,
        request: async () => okResponse,
      }),
    ).resolves.toBe(true);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(revert).toHaveBeenCalledTimes(0);
    expect(notifyFailure).toHaveBeenCalledTimes(0);
  });

  it('rolls back to failed and reports the reason when the retry fails', async () => {
    const patch = mock(() => {});
    const revert = mock(() => {});
    const notifyFailure = mock(() => {});

    await expect(
      retryOrganicJobOptimistically({
        job: { jobId: 'job-1', brandId: 'brand-1' },
        patch,
        revert,
        notifyFailure,
        request: async () => {
          throw new Error('retry failed');
        },
      }),
    ).resolves.toBe(false);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(revert).toHaveBeenCalledTimes(1);
    expect(notifyFailure).toHaveBeenCalledWith('retry failed');
  });
});
