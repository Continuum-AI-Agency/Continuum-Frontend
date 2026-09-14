import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const getJobMock = mock(() => Promise.resolve({ job: {} as never }));

mock.module('@/lib/api/clientRenderJobs.client', () => ({
  getClientRenderJob: getJobMock,
}));
mock.module('@/components/chat/media/ChatMedia', () => ({
  ChatMediaCarousel: ({ items }: { items: Array<{ url: string }> }) => (
    <div data-testid="rendered-media">{items.map((item) => item.url).join(',')}</div>
  ),
}));

import { PaidCreativeRenderStatus } from './PaidCreativeRenderStatus';

const renderHandle = {
  render_job_id: '11111111-1111-4111-8111-111111111111',
  brand_id: '22222222-2222-4222-8222-222222222222',
  draft_id: 'draft-1',
  clip_count: 3,
  state: 'awaiting_client_render' as const,
};

const job = (state: string, patch: Record<string, unknown> = {}) =>
  ({
    id: renderHandle.render_job_id,
    brandId: renderHandle.brand_id,
    state,
    progress: 0,
    phase: null,
    resultAssetRefs: [],
    errorMessage: null,
    ...patch,
  }) as never;

describe('PaidCreativeRenderStatus', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    cleanup();
    getJobMock.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('shows queued while ready and bounded rendering progress while active', async () => {
    getJobMock.mockResolvedValue({
      job: job('rendering', { progress: 4, phase: `Encoding ${'x'.repeat(200)}` }),
    });
    render(<PaidCreativeRenderStatus render={renderHandle} />);

    expect(screen.getByRole('status').textContent).toContain('Queued');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Rendering'));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByRole('status').textContent?.length).toBeLessThan(160);
    expect(getJobMock).toHaveBeenCalledWith(
      renderHandle.render_job_id,
      renderHandle.brand_id,
      expect.any(AbortSignal),
    );
  });

  it('signs and renders only completed exact-version Library media', async () => {
    getJobMock.mockResolvedValue({
      job: job('completed', {
        resultAssetIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        resultAssetRefs: [
          {
            asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ],
      }),
    });
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ signedUrl: 'https://signed.test/reel.mp4' }),
      } as Response),
    ) as typeof fetch;

    render(<PaidCreativeRenderStatus render={renderHandle} />);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Completed'));
    await screen.findByText('https://signed.test/reel.mp4');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/library/sign',
      expect.objectContaining({
        body: JSON.stringify({
          brandId: renderHandle.brand_id,
          assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
      }),
    );
  });

  it('surfaces completed media signing failures', async () => {
    getJobMock.mockResolvedValue({
      job: job('completed', {
        resultAssetRefs: [
          {
            asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ],
      }),
    });
    global.fetch = mock(() => Promise.resolve({ ok: false } as Response)) as typeof fetch;

    render(<PaidCreativeRenderStatus render={renderHandle} />);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Rendered media is temporarily unavailable',
    );
  });

  it('renders bounded terminal failures accessibly', async () => {
    getJobMock.mockResolvedValue({ job: job('failed', { errorMessage: 'x'.repeat(500) }) });
    render(<PaidCreativeRenderStatus render={renderHandle} />);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Failed'));
    expect(screen.getByRole('alert').textContent?.length).toBe(240);
  });
});
