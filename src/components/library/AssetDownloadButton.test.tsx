import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssetDownloadButton } from './AssetDownloadButton';

const realFetch = globalThis.fetch;
const realCreateElement = document.createElement.bind(document);

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  document.createElement = realCreateElement;
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
    signedUrl: 'https://cdn.test/hero.jpg',
    ...overrides,
  } as MediaAsset;
}

function stubSign(signedUrl: string) {
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? 'null'));
    return { ok: true, status: 200, json: async () => ({ signedUrl }) };
  }) as unknown as typeof fetch;
  return bodies;
}

function captureAnchor() {
  const clicked: string[] = [];
  document.createElement = ((tag: string) => {
    const element = realCreateElement(tag);
    if (tag === 'a') element.click = () => clicked.push((element as HTMLAnchorElement).href);
    return element;
  }) as typeof document.createElement;
  return clicked;
}

describe('AssetDownloadButton', () => {
  it('saves the stored original when pressed', async () => {
    const bodies = stubSign('https://cdn.test/signed');
    const clicked = captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(bodies[0]).toEqual({ brandId: 'brand-1', assetId: 'asset-1' });
    expect(clicked[0]).toBe('https://cdn.test/signed?download=hero.jpg');
  });

  it('downloads the version the reviewer is looking at, not the head', async () => {
    const bodies = stubSign('https://cdn.test/v2');
    captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} versionId="ver-2" />);

    // The name changes too: a control that would hand back different bytes than the
    // one beside it must not be called the same thing.
    fireEvent.click(screen.getByRole('button', { name: 'Download this version' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ brandId: 'brand-1', assetId: 'asset-1', versionId: 'ver-2' });
  });

  it('renders without a ToastProvider — a card outside the app shell still offers the save', () => {
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} variant="icon" />);
    expect(screen.getByRole('button', { name: 'Download' })).toBeDefined();
  });

  it('survives a failed sign without leaving the control stuck', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const clicked = captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} />);
    const button = screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement;

    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(false));
    expect(clicked).toHaveLength(0);
  });
});
