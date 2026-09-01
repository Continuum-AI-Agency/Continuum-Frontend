import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { MediaCard } from './MediaCard';

// Airtable #299's DoD names TWO surfaces — the detail view and the grid card. This
// covers the card half: the control has to be ON THE RENDERED CARD, for image and
// for video, not defined somewhere a user cannot reach.

// jsdom ships no IntersectionObserver and the video card's lazy `src` needs one.
// Stubbed as "never intersects", which is the off-screen state a grid card starts in.
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

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

// The real provider, not a mock: the card's own clip controls need it, and a stub
// would prove the card renders under conditions the app never gives it.
const mount = (ui: ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

const download = () => screen.queryByRole('button', { name: 'Download' });

describe('MediaCard download affordance', () => {
  it('offers a download on an image card', () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset()} />);
    expect(download()).not.toBeNull();
  });

  it('offers the same download on a video card', () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({
          kind: 'video',
          fileName: 'cut.mp4',
          mimeType: 'video/mp4',
          signedUrl: 'https://cdn.test/cut.mp4',
        })}
      />,
    );
    expect(download()).not.toBeNull();
  });

  it('offers it on the terminal skipped_* statuses — those files are intact', () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset({ status: 'skipped_long_form' })} />);
    expect(download()).not.toBeNull();
  });

  it('withholds it when the asset errored, because there are no bytes to hand back', () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset({ status: 'error' })} />);
    expect(download()).toBeNull();
  });

  it('does not open the asset when the download is pressed', () => {
    const opened: MediaAsset[] = [];
    mount(<MediaCard brandId="brand-1" asset={libraryAsset()} onOpen={(a) => opened.push(a)} />);

    const control = download();
    expect(control).not.toBeNull();
    if (control) fireEvent.click(control);

    expect(opened).toHaveLength(0);
  });
});
