import { afterEach, describe, expect, it } from 'bun:test';
import {
  type LibraryPlayback,
  type MediaAsset,
  PSD_STATIC_EXPORT_ROUTE,
} from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearLibraryPlaybackCache } from '@/lib/library/libraryPlayback';
import { registerStageVideo } from '@/lib/library/videoPoster';
import { AssetDownloadButton } from './AssetDownloadButton';

const realFetch = globalThis.fetch;
const realCreateElement = document.createElement.bind(document);

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  document.createElement = realCreateElement;
  clearLibraryPlaybackCache();
  registerStageVideo(null);
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

const videoAsset = () =>
  libraryAsset({ kind: 'video', fileName: 'hero.mov', mimeType: 'video/quicktime' });

const PLAYBACK: LibraryPlayback = {
  assetId: '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22',
  assetVersionId: '1c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33',
  rungs: [
    {
      role: 'proxy_1080',
      label: '1080p',
      width: 1920,
      height: 1080,
      sizeBytes: 1000,
      mimeType: 'video/mp4',
      hdr: false,
      signedUrl: 'https://cdn.test/proxy_1080.mp4',
    },
  ],
  sprite: null,
  audioProxy: {
    signedUrl: 'https://cdn.test/audio_proxy.m4a',
    mimeType: 'audio/mp4',
    sizeBytes: 100,
  },
};

// The sign route answers `signedUrl`; the playback route answers PLAYBACK.
function stubRoutes(signedUrl: string) {
  const signBodies: unknown[] = [];
  const playbackUrls: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).startsWith('/api/library/playback')) {
      playbackUrls.push(String(url));
      return Response.json(PLAYBACK);
    }
    signBodies.push(JSON.parse(init?.body ?? 'null'));
    return { ok: true, status: 200, json: async () => ({ signedUrl }) };
  }) as unknown as typeof fetch;
  return { signBodies, playbackUrls };
}

function captureAnchor() {
  const clicked: { href: string; download: string }[] = [];
  document.createElement = ((tag: string) => {
    const element = realCreateElement(tag);
    if (tag === 'a') {
      const anchor = element as HTMLAnchorElement;
      anchor.click = () => clicked.push({ href: anchor.href, download: anchor.download });
    }
    return element;
  }) as typeof document.createElement;
  return clicked;
}

async function openMenu() {
  const trigger = screen.getByTestId('download-menu');
  await act(async () => {
    fireEvent.click(trigger);
  });
  await waitFor(() => expect(screen.queryByTestId('download-original')).not.toBeNull());
}

describe('AssetDownloadButton — labelled menu', () => {
  it('saves the stored original from the menu', async () => {
    const { signBodies } = stubRoutes('https://cdn.test/signed');
    const clicked = captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} />);

    expect(screen.getByRole('button', { name: 'Download' })).toBeDefined();
    await openMenu();
    fireEvent.click(screen.getByTestId('download-original'));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(signBodies[0]).toEqual({ brandId: 'brand-1', assetId: 'asset-1', download: 'hero.jpg' });
    expect(clicked[0]?.href).toBe('https://cdn.test/signed?download=hero.jpg');
  });

  it('downloads the version the reviewer is looking at, not the head', async () => {
    const { signBodies } = stubRoutes('https://cdn.test/v2');
    captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} versionId="ver-2" />);

    // The name changes too: a control that would hand back different bytes than the
    // one beside it must not be called the same thing.
    expect(screen.getByRole('button', { name: 'Download this version' })).toBeDefined();
    await openMenu();
    fireEvent.click(screen.getByTestId('download-original'));

    await waitFor(() => expect(signBodies).toHaveLength(1));
    expect(signBodies[0]).toEqual({
      brandId: 'brand-1',
      assetId: 'asset-1',
      versionId: 'ver-2',
      download: 'hero.jpg',
    });
  });

  it('looks playback up only when the menu opens, then offers each proxy by name', async () => {
    const { playbackUrls } = stubRoutes('https://cdn.test/signed');
    const clicked = captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={videoAsset()} versionId="ver-2" />);
    await act(async () => {});
    expect(playbackUrls).toEqual([]);

    await openMenu();
    await waitFor(() => expect(screen.queryByTestId('download-proxy-proxy_1080')).not.toBeNull());
    expect(playbackUrls[0]).toContain('versionId=ver-2');

    fireEvent.click(screen.getByTestId('download-proxy-proxy_1080'));
    expect(clicked.at(-1)).toEqual({
      href: 'https://cdn.test/proxy_1080.mp4?download=hero-1080p.mp4',
      download: 'hero-1080p.mp4',
    });
  });

  it('offers the audio proxy as an .m4a', async () => {
    stubRoutes('https://cdn.test/signed');
    const clicked = captureAnchor();
    render(
      <AssetDownloadButton
        brandId="brand-1"
        asset={libraryAsset({ kind: 'audio', fileName: 'vo.aiff', mimeType: 'audio/aiff' })}
      />,
    );

    await openMenu();
    await waitFor(() => expect(screen.queryByTestId('download-proxy-audio_proxy')).not.toBeNull());
    fireEvent.click(screen.getByTestId('download-proxy-audio_proxy'));
    expect(clicked.at(-1)?.download).toBe('vo-proxy.m4a');
    // A still is a video's frame; audio has none to offer.
    expect(screen.queryByTestId('download-still')).toBeNull();
  });

  it('never looks playback up for an image', async () => {
    const { playbackUrls } = stubRoutes('https://cdn.test/signed');
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} />);

    await openMenu();
    await act(async () => {});
    expect(playbackUrls).toEqual([]);
    expect(screen.queryByTestId('download-still')).toBeNull();
  });

  it('saves and downloads both PSD formats for the exact viewed version', async () => {
    const brandId = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';
    const assetId = '4ab235c6-33df-4b63-9380-7e0b1f32f871';
    const versionId = '1c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33';
    const requests: unknown[] = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      expect(String(url).endsWith(PSD_STATIC_EXPORT_ROUTE)).toBe(true);
      const body = JSON.parse(init?.body ?? '{}');
      requests.push(body);
      return Response.json({
        assetId,
        versionId,
        fileName: `art.${body.format === 'jpeg' ? 'jpg' : 'png'}`,
        mimeType: `image/${body.format}`,
        signedUrl: 'https://cdn.test/psd-export',
      });
    }) as typeof fetch;
    const clicked = captureAnchor();
    render(
      <AssetDownloadButton
        brandId={brandId}
        asset={libraryAsset({ id: assetId, kind: 'file', fileName: 'art.PSD' })}
        versionId={versionId}
      />,
    );
    for (const format of ['png', 'jpeg']) {
      await openMenu();
      fireEvent.click(screen.getByTestId(`download-psd-${format}`));
      await waitFor(() => expect(clicked).toHaveLength(format === 'png' ? 1 : 2));
      expect(requests.at(-1)).toEqual({ brandId, assetId, versionId, format });
      expect(clicked.at(-1)?.download).toBe(`art.${format === 'jpeg' ? 'jpg' : 'png'}`);
    }
  });

  it('offers a still only while a video is on stage', async () => {
    stubRoutes('https://cdn.test/signed');
    const { unmount } = render(<AssetDownloadButton brandId="brand-1" asset={videoAsset()} />);
    await openMenu();
    expect(screen.getByTestId('download-still').hasAttribute('data-disabled')).toBe(true);
    unmount();

    registerStageVideo(document.createElement('video'));
    render(<AssetDownloadButton brandId="brand-1" asset={videoAsset()} />);
    await openMenu();
    expect(screen.getByTestId('download-still').hasAttribute('data-disabled')).toBe(false);
  });
});

describe('AssetDownloadButton — grid card icon', () => {
  it('keeps the one-click original download', async () => {
    const { signBodies, playbackUrls } = stubRoutes('https://cdn.test/signed');
    const clicked = captureAnchor();
    render(<AssetDownloadButton brandId="brand-1" asset={videoAsset()} variant="icon" />);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(signBodies[0]).toEqual({ brandId: 'brand-1', assetId: 'asset-1', download: 'hero.mov' });
    expect(playbackUrls).toEqual([]);
    expect(screen.queryByTestId('download-menu')).toBeNull();
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
    render(<AssetDownloadButton brandId="brand-1" asset={libraryAsset()} variant="icon" />);
    const button = screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement;

    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(false));
    expect(clicked).toHaveLength(0);
  });
});
