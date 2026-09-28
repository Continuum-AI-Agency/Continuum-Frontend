import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

const { OpenInCanvasButton } = await import('./OpenInCanvasButton');

afterEach(cleanup);

const asset = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '00000000-0000-4000-8000-0000000000b1',
  kind: 'image',
  bucket: 'media-library',
  storagePath: 'brand/hero.png',
  fileName: 'hero.png',
  mimeType: 'image/png',
  source: 'upload',
  status: 'ready',
  reviewStatus: 'none',
  tags: [],
  detectedObjects: [],
  hasImageEmbedding: false,
  createdAt: '2026-09-27T00:00:00Z',
  updatedAt: '2026-09-27T00:00:00Z',
} as unknown as MediaAsset;

describe('OpenInCanvasButton menu', () => {
  // The menu used to crash on open (a Base UI group label outside its group), which also
  // unmounted the asset dialog around it — the button could never seed a canvas.
  it('opens and lists every pre-made workflow', async () => {
    globalThis.fetch = (async () => Response.json({ assets: [] })) as unknown as typeof fetch;
    const view = render(<OpenInCanvasButton brandId={asset.brandId} asset={asset} />);
    fireEvent.click(view.getByRole('button', { name: /Open in Canvas/ }));
    await waitFor(() => {
      const items = view.getAllByRole('menuitem').map((item) => item.textContent ?? '');
      expect(items.some((text) => text.includes('Brand align'))).toBe(true);
      expect(items.some((text) => text.includes('Blank canvas'))).toBe(true);
    });
  });
});
