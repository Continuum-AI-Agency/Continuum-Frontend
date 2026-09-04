import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { brandMdTokensSchema, type MediaAsset } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

let brandTokens: ReturnType<typeof brandMdTokensSchema.parse> | null = null;

mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({ brandTokens, isLoading: false }),
}));

import { ToastProvider } from '@/components/ui/ToastProvider';
import { AssetDetailModal } from './AssetDetailModal';

// Airtable #299: the asset detail view offered Brand quick look, Reformat, Open in
// Canvas, Edit video, Poster, Request review, Share and version history — and no way
// to get the file. This asserts the control on the RENDERED panel, for image and for
// video, which is what the record is about.

const realFetch = globalThis.fetch;

beforeEach(() => {
  // Every panel hook (comments, versions, transcript, enrichment) reads over HTTP.
  // An empty-but-well-formed answer is what an asset with no history looks like.
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ comments: [], versions: [], segments: [] }),
    text: async () => '{}',
  })) as unknown as typeof fetch;
});

afterEach(() => {
  brandTokens = null;
  cleanup();
  globalThis.fetch = realFetch;
});

function libraryAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: 'brand-1/asset-1/hero.jpg',
    fileName: 'hero.jpg',
    mimeType: 'image/jpeg',
    source: 'upload',
    status: 'ready',
    reviewStatus: 'none',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    title: 'Hero shot',
    signedUrl: 'https://cdn.test/hero.jpg',
    ...overrides,
  } as MediaAsset;
}

const mount = (ui: ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('AssetDetailModal download affordance', () => {
  it('offers a download for an image', async () => {
    mount(<AssetDetailModal brandId="brand-1" asset={libraryAsset()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeDefined());
  });

  it('shows the exact Brand Book token in Brand quick look', async () => {
    brandTokens = brandMdTokensSchema.parse({
      brand_name: 'Bench Brand',
      colors: [{ name: 'Signal red', role: 'primary', value: '#d7263d' }],
    });
    mount(<AssetDetailModal brandId="brand-1" asset={libraryAsset()} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Brand quick look' }));

    expect(await screen.findByText('Signal red (primary) #d7263d')).toBeDefined();
    expect(screen.getAllByLabelText('Brand colors: #d7263d').length).toBeGreaterThan(0);
  });

  it('offers the same download for a video — the kind the record was filed against', async () => {
    mount(
      <AssetDetailModal
        brandId="brand-1"
        asset={libraryAsset({
          kind: 'video',
          fileName: 'cut.mp4',
          mimeType: 'video/mp4',
          signedUrl: 'https://cdn.test/cut.mp4',
        })}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeDefined());
  });

  it('renders nothing at all without an asset', () => {
    const { container } = mount(
      <AssetDetailModal brandId="brand-1" asset={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
