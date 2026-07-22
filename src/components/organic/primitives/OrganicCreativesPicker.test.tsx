import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';

// happy-dom does not expose SyntaxError on its window object, which causes
// @testing-library/dom's querySelectorAll internals to crash. Polyfill it so
// all DOM queries work correctly in this environment.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrganicCreativesPicker } from './OrganicCreativesPicker';
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Mock the library browser so we control the returned assets.
const mockSetQuery = mock();
const mockSetFilters = mock();
const mockLoadMore = mock();

mock.module('@/lib/creative-assets/useStudioLibraryBrowser', () => ({
  useStudioLibraryBrowser: mock(() => ({
    assets: [] as MediaAsset[],
    loading: false,
    hasMore: false,
    loadMore: mockLoadMore,
    query: '',
    setQuery: mockSetQuery,
    filters: { source: 'all', kind: 'all' },
    setFilters: mockSetFilters,
  })),
}));

mock.module('@/lib/creative-assets/assetUrl', () => ({
  sanitizeCreativeAssetUrl: (url: string | null | undefined) => url ?? null,
}));

mock.module('@/components/library/LibraryFilterBar', () => ({
  LibraryFilterBar: () => null,
}));

import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: 'brands/brand-1/photo.jpg',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    source: 'upload',
    status: 'ready',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    signedUrl: 'https://cdn.example.com/photo.jpg',
    ...overrides,
  };
}

describe('OrganicCreativesPicker.handleAttach', () => {
  beforeEach(() => {
    cleanup();
  });

  it('emits publishable publishingAssets when a single image is attached', () => {
    const asset = makeAsset();
    (useStudioLibraryBrowser as ReturnType<typeof mock>).mockReturnValue({
      assets: [asset],
      loading: false,
      hasMore: false,
      loadMore: mockLoadMore,
      query: '',
      setQuery: mockSetQuery,
      filters: { source: 'all', kind: 'all' },
      setFilters: mockSetFilters,
    });

    const onAttach = mock();
    const { container } = render(
      <OrganicCreativesPicker
        brandProfileId="brand-1"
        draftId="draft-1"
        attached={[]}
        onAttach={onAttach}
      />,
    );

    // Toggle the asset tile by clicking the button with aria-label = fileName.
    const tile = container.querySelector<HTMLButtonElement>('[aria-label="photo.jpg"]');
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);

    // Click "Attach selected (1)".
    const attachBtn = screen.getByText(/Attach selected/);
    fireEvent.click(attachBtn);

    expect(onAttach).toHaveBeenCalledTimes(1);
    const [publishingAssets] = onAttach.mock.calls[0] as [
      Array<{ kind: string; storagePath: string; role: string }>,
    ];
    expect(publishingAssets).toHaveLength(1);
    expect(publishingAssets[0].kind).toBe('image');
    expect(publishingAssets[0].storagePath).toBe('brands/brand-1/photo.jpg');
    // shapeUserSuppliedMedia always sets role to "primary".
    expect(publishingAssets[0].role).toBe('primary');
  });

  it('emits carousel publishingAssets with slideIndex when multiple images are attached', () => {
    const a1 = makeAsset({
      id: 'a1',
      storagePath: 's1.jpg',
      fileName: 's1.jpg',
      signedUrl: 'https://cdn/s1',
    });
    const a2 = makeAsset({
      id: 'a2',
      storagePath: 's2.jpg',
      fileName: 's2.jpg',
      signedUrl: 'https://cdn/s2',
    });

    (useStudioLibraryBrowser as ReturnType<typeof mock>).mockReturnValue({
      assets: [a1, a2],
      loading: false,
      hasMore: false,
      loadMore: mockLoadMore,
      query: '',
      setQuery: mockSetQuery,
      filters: { source: 'all', kind: 'all' },
      setFilters: mockSetFilters,
    });

    const onAttach = mock();
    const { container } = render(
      <OrganicCreativesPicker
        brandProfileId="brand-1"
        draftId="draft-1"
        attached={[]}
        onAttach={onAttach}
      />,
    );

    fireEvent.click(container.querySelector('[aria-label="s1.jpg"]')!);
    fireEvent.click(container.querySelector('[aria-label="s2.jpg"]')!);
    fireEvent.click(screen.getByText(/Attach selected/));

    const [publishingAssets] = onAttach.mock.calls[0] as [
      Array<{ kind: string; slideIndex?: number }>,
    ];
    expect(publishingAssets).toHaveLength(2);
    expect(publishingAssets[0].slideIndex).toBe(0);
    expect(publishingAssets[1].slideIndex).toBe(1);
  });

  it('does not render the Attach button when nothing is selected', () => {
    const asset = makeAsset();
    (useStudioLibraryBrowser as ReturnType<typeof mock>).mockReturnValue({
      assets: [asset],
      loading: false,
      hasMore: false,
      loadMore: mockLoadMore,
      query: '',
      setQuery: mockSetQuery,
      filters: { source: 'all', kind: 'all' },
      setFilters: mockSetFilters,
    });

    const onAttach = mock();
    render(
      <OrganicCreativesPicker
        brandProfileId="brand-1"
        draftId="draft-1"
        attached={[]}
        onAttach={onAttach}
      />,
    );

    // No tile clicked — Attach button must not appear.
    expect(screen.queryByText(/Attach selected/)).toBeNull();
    expect(onAttach).not.toHaveBeenCalled();
  });
});
