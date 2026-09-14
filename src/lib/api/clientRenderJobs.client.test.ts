import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import { getClientRenderJob } from './clientRenderJobs.client';

describe('getClientRenderJob', () => {
  beforeEach(() => requestMock.mockReset());

  it('requests only the named job in its originating brand', async () => {
    await getClientRenderJob('job/id', 'brand/id');

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/media/client-render-jobs/job%2Fid?brandId=brand%2Fid',
        cache: 'no-store',
      }),
    );
  });
});
