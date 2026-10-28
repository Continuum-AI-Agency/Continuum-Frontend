import { afterEach, expect, mock, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PreviewFormat } from './FormatPreview';

// One format's Live kit with nothing to place: every row measured in it lands.
const KIT = {
  scene: { ok: true, comp: { name: 'Main', width: 1080, height: 1080 }, at: 0, layers: [] },
  variables: [],
  brandMark: null,
  comp: 'Main',
  at: 0,
  notes: [],
};
const livePreview = mock(async (_input: { format: { id: string } }): Promise<unknown> => KIT);
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { livePreview },
}));
const { useLiveFit } = await import('./livePreview');

afterEach(() => {
  cleanup();
  livePreview.mockReset();
});

const format = (id: string, ratio: string): PreviewFormat =>
  ({ id, label: id, ratio, comp: null, width: null, height: null }) as PreviewFormat;
const FORMATS = [format('square', '1:1'), format('story', '9:16')];

const renderFit = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return renderHook(
    () =>
      useLiveFit({
        brandId: '22222222-2222-4222-8222-222222222222',
        environment: 'Continuum_app',
        templateKey: '133',
        formats: FORMATS,
        enabled: true,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
};

test('one format’s kit missing leaves the template unmeasured, never measured in the other alone', async () => {
  livePreview.mockImplementation(async (input) => {
    if (input.format.id === 'story') throw new Error('kit unavailable');
    return KIT;
  });
  const { result } = renderFit();
  const seen: string[] = [];
  await waitFor(() => {
    seen.push(result.current.state);
    expect(result.current.state).toBe('unmeasured');
  });
  expect(seen).not.toContain('measured');
  // Retried twice before it counts as failed: three reads of the missing kit.
  expect(livePreview.mock.calls.filter(([input]) => input.format.id === 'story')).toHaveLength(3);
});

test('measured only once every format’s kit has landed', async () => {
  let landStory: (kit: unknown) => void = () => undefined;
  livePreview.mockImplementation(async (input) =>
    input.format.id === 'story' ? new Promise((resolve) => (landStory = resolve)) : KIT,
  );
  const { result } = renderFit();
  await waitFor(() => expect(livePreview).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.state).toBe('loading'));
  landStory(KIT);
  await waitFor(() => expect(result.current.state).toBe('measured'));
  if (result.current.state === 'measured')
    expect(result.current.fitOf({ headline: 'Hola' }).size).toBe(0);
});

test('a kit read that fails once is retried, and the template is measured', async () => {
  let storyReads = 0;
  livePreview.mockImplementation(async (input) => {
    if (input.format.id === 'story' && ++storyReads === 1) throw new Error('blip');
    return KIT;
  });
  const { result } = renderFit();
  await waitFor(() => expect(result.current.state).toBe('measured'));
  expect(storyReads).toBe(2);
});
