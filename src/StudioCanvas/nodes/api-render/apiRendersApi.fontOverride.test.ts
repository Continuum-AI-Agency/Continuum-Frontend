import { afterEach, expect, mock, test } from 'bun:test';
import { API_RENDER_FONT_OVERRIDE_PROFILE } from '@continuum/contracts';

const request = mock(async (_input: { headers?: Record<string, string> }) => ({}));
mock.module('@/lib/api/http', () => ({ http: { request } }));
const { apiRendersApi } = await import('./apiRendersApi');
afterEach(() => request.mockClear());
test('job reads and render confirmations opt in to the font audit field', async () => {
  await apiRendersApi.listJobs('brand');
  await apiRendersApi.getJob('brand', 'job');
  await apiRendersApi.createJob({ confirmationToken: 'token' });
  await apiRendersApi.createBatch({ confirmationToken: 'token' });
  expect(request).toHaveBeenCalledTimes(4);
  for (const [input] of request.mock.calls)
    expect(input.headers?.Accept).toContain(API_RENDER_FONT_OVERRIDE_PROFILE);
});
