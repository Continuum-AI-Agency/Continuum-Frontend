import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

type RequestOptions = { path: string; method?: string; body?: unknown };

const requestMock = mock((_options: RequestOptions) => Promise.resolve({} as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import type { ElementRecord } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { HeadlessElementReview } from './HeadlessElementReview';

configure({ asyncUtilTimeout: 4000 });

const buildElement = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Aero Bottle',
  slug: 'aero-bottle',
  category: 'product',
  guidelines: null,
  rightsNote: null,
  members: [{ assetId: 'member-1', position: 0 }],
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

const promoteCall = () =>
  requestMock.mock.calls
    .map(([options]) => options)
    .find((options) => options.path.endsWith('/headless'));

const renderReview = (element: ElementRecord) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HeadlessElementReview brandId="brand-1" element={element} />
    </QueryClientProvider>,
  );
};

describe('HeadlessElementReview — Use in auto-ads', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation((options) =>
      Promise.resolve(
        options.path.endsWith('/headless')
          ? { element: buildElement(), revision: 3, approved: true }
          : { revision: null, preparation: null },
      ),
    );
  });

  afterEach(cleanup);

  it('asks for a rights basis first when the product has none, and sends it', async () => {
    renderReview(buildElement());

    const button = (await screen.findByRole('button', {
      name: 'Use in auto-ads',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Rights basis for auto-ads'), {
      target: { value: '  own product photography ' },
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(promoteCall()).toBeTruthy());
    expect(promoteCall()).toMatchObject({
      path: '/api/media/elements/element-1/headless',
      method: 'POST',
      body: { brandId: 'brand-1', rightsNote: 'own product photography' },
    });
    expect((await screen.findByRole('status')).textContent).toContain('revision 3');
  });

  it('promotes straight away when the Element already carries its rights basis', async () => {
    renderReview(buildElement({ category: 'object', rightsNote: 'licensed, PO 991' }));

    const button = (await screen.findByRole('button', {
      name: 'Use in auto-ads',
    })) as HTMLButtonElement;
    expect(screen.queryByLabelText('Rights basis for auto-ads')).toBeNull();
    fireEvent.click(button);

    await waitFor(() => expect(promoteCall()).toBeTruthy());
    expect(promoteCall()?.body).toEqual({ brandId: 'brand-1' });
  });

  it('says why a promotion failed', async () => {
    requestMock.mockImplementation((options) =>
      options.path.endsWith('/headless')
        ? Promise.reject(new ApiError('No members to cast', 422, 'element_not_promotable'))
        : Promise.resolve({ revision: null, preparation: null }),
    );
    renderReview(buildElement({ rightsNote: 'own shots' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Use in auto-ads' }));

    expect((await screen.findByRole('alert')).textContent).toContain('No members to cast');
  });

  it('offers nothing to an Element that is not a product and has no revision', async () => {
    const { container } = renderReview(buildElement({ category: 'style' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Use in auto-ads' })).toBeNull();
    expect(container.textContent).toBe('');
  });
});
