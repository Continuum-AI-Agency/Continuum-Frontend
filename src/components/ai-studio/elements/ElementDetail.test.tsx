import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { configure, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ElementRecord } from '@continuum/contracts';
import { ElementDetail } from './ElementDetail';

// A signed-preview round trip through react-query does not settle inside
// testing-library's 1s default on a loaded machine.
configure({ asyncUtilTimeout: 4000 });

const buildElement = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Aria',
  slug: 'aria',
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

const signedUrlFor = (assetId: string) => `https://storage/${assetId}.png`;

const fetchMock = mock((_url: string, init?: { body?: string }) => {
  const { assetId } = JSON.parse(init?.body ?? '{}') as { assetId: string };
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ signedUrl: signedUrlFor(assetId) }),
  });
});

const renderDetail = (
  element: ElementRecord,
  overrides: Partial<React.ComponentProps<typeof ElementDetail>> = {},
) => {
  const props = {
    element,
    brandId: 'brand-1',
    onBack: mock(() => {}),
    onGenerateReference: mock(() => {}),
    onSetDefaultReference: mock((_assetId: string) => {}),
    onSave: mock(() => {}),
    ...overrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ElementDetail {...props} />
    </QueryClientProvider>,
  );
  return props;
};

describe('ElementDetail', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it('offers to generate the first reference and says what happens meanwhile', () => {
    renderDetail(buildElement());

    expect(screen.getByRole('button', { name: /Generate reference/ })).toBeTruthy();
    expect(screen.getByText(/No reference yet/)).toBeTruthy();
    expect(screen.getByText('This image is what gets sent to the model.')).toBeTruthy();
  });

  it('reads the history strip off the reference ASSET list, newest last', async () => {
    renderDetail(
      buildElement({
        referenceHistory: ['ref-1', 'ref-2'],
        defaultReferenceAssetId: 'ref-2',
      }),
    );

    const strip = screen.getByTestId('element-history-strip');
    const thumbs = strip.querySelectorAll('button');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(thumbs[0]?.getAttribute('aria-pressed')).toBe('false');
    // The big preview is the PINNED entry, not simply the newest.
    await waitFor(() => {
      expect(screen.getByAltText('Aria reference').getAttribute('src')).toBe(signedUrlFor('ref-2'));
    });
  });

  it('pins an older reference by asset id', () => {
    const props = renderDetail(
      buildElement({
        referenceHistory: ['ref-1', 'ref-2'],
        defaultReferenceAssetId: 'ref-2',
      }),
    );

    fireEvent.click(screen.getByLabelText('Use reference 1 as default'));

    expect(props.onSetDefaultReference).toHaveBeenCalledWith('ref-1');
  });

  it('regenerates from the members', () => {
    const props = renderDetail(
      buildElement({ referenceHistory: ['ref-1'], defaultReferenceAssetId: 'ref-1' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));

    expect(props.onGenerateReference).toHaveBeenCalled();
  });

  it('cannot generate a reference for an Element with no members', () => {
    renderDetail(buildElement({ members: [] }));

    expect(
      (screen.getByRole('button', { name: /Generate reference/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('warns when a person fallback will drop members', () => {
    renderDetail(
      buildElement({
        category: 'model',
        rightsNote: 'own employee',
        members: Array.from({ length: 6 }, (_, index) => ({
          assetId: `member-${index}`,
          position: index,
        })),
      }),
    );

    expect(screen.getByText(/2 of 6 images will be dropped/)).toBeTruthy();
  });

  it('will not save a person Element that has lost its rights basis', () => {
    const props = renderDetail(
      buildElement({ category: 'character', rightsNote: 'licensed stock' }),
    );

    fireEvent.change(screen.getByLabelText('Rights basis'), { target: { value: '  ' } });

    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText('A Character Element needs a rights basis.')).toBeTruthy();
    fireEvent.click(save);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('saves edited guidelines', () => {
    const props = renderDetail(buildElement({ guidelines: 'old' }));

    fireEvent.change(screen.getByLabelText('Guidelines'), {
      target: { value: 'the matte finish, not the glossy one' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(props.onSave).toHaveBeenCalledWith({
      guidelines: 'the matte finish, not the glossy one',
      rightsNote: null,
    });
  });
});
