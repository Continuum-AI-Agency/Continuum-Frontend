import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ElementRecord } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
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
    onAddReference: mock((_assetId: string) => {}),
    onRestore: mock((_revisionIndex: number) => {}),
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
    window.confirm = mock(() => true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it('offers to generate the first reference and says what happens meanwhile', () => {
    renderDetail(buildElement());

    expect(screen.getByRole('button', { name: /Generate candidate sheet/ })).toBeTruthy();
    expect(screen.getByText(/No reference sheet yet/)).toBeTruthy();
    expect(screen.getByText('The approved sheet is what gets sent to the model.')).toBeTruthy();
  });

  it('reads the history strip off the reference ASSET list, newest FIRST', async () => {
    renderDetail(
      buildElement({
        referenceHistory: ['ref-1', 'ref-2'],
        defaultReferenceAssetId: 'ref-2',
      }),
    );

    const strip = screen.getByTestId('element-history-strip');
    const thumbs = strip.querySelectorAll('button');
    expect(thumbs).toHaveLength(2);
    // Newest first, but the version NUMBER stays the stored position, so an entry keeps
    // its name when a newer one lands above it.
    expect(thumbs[0]?.getAttribute('aria-label')).toBe('Reference 2 — current default');
    expect(thumbs[1]?.getAttribute('aria-label')).toBe('Review and approve reference 1');
    expect(thumbs[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(thumbs[1]?.getAttribute('aria-pressed')).toBe('false');
    // The big preview is the PINNED entry, not simply the newest.
    await waitFor(() => {
      expect(screen.getByAltText('Aria reference sheet').getAttribute('src')).toBe(
        signedUrlFor('ref-2'),
      );
    });
  });

  it('pins an older reference by asset id', () => {
    const props = renderDetail(
      buildElement({
        referenceHistory: ['ref-1', 'ref-2'],
        defaultReferenceAssetId: 'ref-2',
      }),
    );

    fireEvent.click(screen.getByLabelText('Review and approve reference 1'));

    expect(props.onSetDefaultReference).toHaveBeenCalledWith('ref-1');
  });

  it('will not re-pin the reference that is already the default', () => {
    const props = renderDetail(
      buildElement({
        referenceHistory: ['ref-1', 'ref-2'],
        defaultReferenceAssetId: 'ref-2',
      }),
    );

    const current = screen.getByLabelText('Reference 2 — current default') as HTMLButtonElement;
    expect(current.disabled).toBe(true);
    fireEvent.click(current);
    expect(props.onSetDefaultReference).not.toHaveBeenCalled();
  });

  it('shows an unapproved sheet as a candidate, not as what gets sent', async () => {
    // `resolveElementRefs` emits the raw MEMBERS when nothing is pinned, so showing the
    // newest history entry here would print a picture the model never sees directly
    // above the words "this image is what gets sent".
    renderDetail(
      buildElement({ referenceHistory: ['ref-1', 'ref-2'], defaultReferenceAssetId: null }),
    );

    expect(await screen.findByAltText('Aria reference sheet')).toBeTruthy();
    expect(screen.getByText(/Candidate sheet/)).toBeTruthy();
    // The history itself is still there to pin from.
    expect(screen.getByTestId('element-history-strip').querySelectorAll('button')).toHaveLength(2);
  });

  it('says a generation failed instead of just stopping the spinner', () => {
    renderDetail(buildElement({ referenceHistory: ['ref-1'], defaultReferenceAssetId: 'ref-1' }), {
      generateError: new Error('element_reference_generation_failed'),
    });

    expect(screen.getByRole('alert').textContent).toContain('element_reference_generation_failed');
    // And says the failure cost nothing, which is true: append is non-destructive.
    expect(screen.getByRole('alert').textContent).toContain('Nothing changed');
  });

  it('surfaces a set-default failure', () => {
    renderDetail(
      buildElement({ referenceHistory: ['ref-1', 'ref-2'], defaultReferenceAssetId: 'ref-2' }),
      { setDefaultError: new Error('element_reference_not_in_history') },
    );

    expect(screen.getByRole('alert').textContent).toContain('element_reference_not_in_history');
  });

  it('counts real elapsed seconds while generating rather than inventing a bar', () => {
    renderDetail(buildElement({ referenceHistory: ['ref-1'], defaultReferenceAssetId: 'ref-1' }), {
      isGenerating: true,
    });

    expect(screen.getByRole('button', { name: /Generating sheet… 0s/ })).toBeTruthy();
    expect(screen.getByText('One paid image call, usually 15–20 seconds.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('marks the entry being pinned as pending', () => {
    renderDetail(
      buildElement({ referenceHistory: ['ref-1', 'ref-2'], defaultReferenceAssetId: 'ref-2' }),
      { pendingDefaultAssetId: 'ref-1' },
    );

    expect(
      (screen.getByLabelText('Review and approve reference 1') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('regenerates from the members', () => {
    const props = renderDetail(
      buildElement({ referenceHistory: ['ref-1'], defaultReferenceAssetId: 'ref-1' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Generate candidate sheet/ }));

    expect(props.onGenerateReference).toHaveBeenCalled();
  });

  it('cannot generate a reference for an Element with no members', () => {
    renderDetail(buildElement({ members: [] }));

    expect(
      (screen.getByRole('button', { name: /Generate candidate sheet/ }) as HTMLButtonElement)
        .disabled,
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

    const save = screen.getByRole('button', { name: 'Replace Element' }) as HTMLButtonElement;
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
    fireEvent.click(screen.getByRole('button', { name: 'Replace Element' }));

    expect(props.onSave).toHaveBeenCalledWith({
      name: 'Aria',
      category: 'product',
      guidelines: 'the matte finish, not the glossy one',
      rightsNote: null,
      facts: [],
      memberAssetIds: ['member-1'],
      motionAssetId: null,
      expectedUpdatedAt: '2026-08-24T00:00:00.000Z',
    });
  });
});
