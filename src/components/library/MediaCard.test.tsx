import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { LibraryPlayback, MediaAsset } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { clearLibraryPlaybackCache, fetchLibraryPlayback } from '@/lib/library/libraryPlayback';
import { MediaCard } from './MediaCard';
import { endAssetDrag, writeAssetDrag } from './views/assetDrag';

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

afterEach(() => {
  cleanup();
  endAssetDrag();
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

describe('MediaCard thumbnail', () => {
  // Tests run without next.config, so next/image wraps the chosen URL in its loader.
  const imageSrc = () => {
    const src = screen.getByAltText('Hero shot').getAttribute('src') ?? '';
    return new URL(src, 'http://localhost').searchParams.get('url') ?? src;
  };

  it('paints the small thumbnail even when the preview is the full original', () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({
          thumbnailUrl: 'https://cdn.test/render/hero-480.jpg',
          preview: {
            assetVersionId: 'version-1',
            state: 'ready',
            kind: 'image',
            role: null,
            signedUrl: 'https://cdn.test/hero.jpg',
          },
        })}
      />,
    );
    expect(imageSrc()).toBe('https://cdn.test/render/hero-480.jpg');
  });

  it('falls back to the original when the thumbnail fails to load', () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({ thumbnailUrl: 'https://cdn.test/render/hero-480.jpg' })}
      />,
    );
    fireEvent.error(screen.getByAltText('Hero shot'));
    expect(imageSrc()).toBe('https://cdn.test/hero.jpg');
  });
});

describe('MediaCard non-visual kinds', () => {
  it('paints an audio card with its duration instead of an image', () => {
    const { container } = mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({
          kind: 'audio',
          fileName: 'voiceover.mp3',
          mimeType: 'audio/mpeg',
          durationMs: 95_000,
          signedUrl: 'https://cdn.test/voiceover.mp3',
        })}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('1:35')).not.toBeNull();
  });

  it('paints a PDF as a document card, never as a broken image', () => {
    const { container } = mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({
          kind: 'image',
          fileName: 'brief.pdf',
          mimeType: 'application/pdf',
          signedUrl: 'https://cdn.test/brief.pdf',
        })}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('PDF')).not.toBeNull();
  });
});

describe('MediaCard card options', () => {
  it('shows the title and created date by default', () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset({ sizeBytes: 2048 })} />);
    expect(screen.queryByText('Hero shot')).not.toBeNull();
    expect(screen.queryByText('2.0 KB')).toBeNull();
  });

  it('shows exactly the chosen fields, including custom field values', () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({ sizeBytes: 2048, reviewStatus: 'approved' })}
        card={{ fields: ['size', 'review'] }}
        customFieldValues={[{ key: 'f1', label: 'Channel', value: 'TikTok' }]}
      />,
    );
    expect(screen.queryByText('Hero shot')).toBeNull();
    expect(screen.queryByText('2.0 KB · Approved')).not.toBeNull();
    expect(screen.queryByText('TikTok')).not.toBeNull();
  });
});

describe('MediaCard drag to stack', () => {
  function fakeDataTransfer(): DataTransfer {
    const store = new Map<string, string>();
    return {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      get types() {
        return [...store.keys()];
      },
      effectAllowed: 'none',
      dropEffect: 'none',
    } as unknown as DataTransfer;
  }

  const cardRoot = () => screen.getByTestId('media-card');

  it('highlights as a stack target and hands the dropped ids to onStackDrop', () => {
    const drops: { target: string; sources: string[] }[] = [];
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset()}
        onStackDrop={(target, sources) => drops.push({ target: target.id, sources })}
      />,
    );
    expect(cardRoot().getAttribute('data-asset-id')).toBe('asset-1');

    const dataTransfer = fakeDataTransfer();
    writeAssetDrag({ dataTransfer }, 'brand-1', ['asset-2', 'asset-3']);
    fireEvent.dragOver(cardRoot(), { dataTransfer });
    expect(cardRoot().getAttribute('data-drop-target')).toBe('stack');
    expect(screen.getByText('Drop to stack as a new version')).not.toBeNull();

    fireEvent.drop(cardRoot(), { dataTransfer });
    expect(drops).toEqual([{ target: 'asset-1', sources: ['asset-2', 'asset-3'] }]);
    expect(cardRoot().getAttribute('data-drop-target')).toBeNull();
  });

  it('never accepts itself', () => {
    const drops: string[][] = [];
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset()}
        onStackDrop={(_target, sources) => drops.push(sources)}
      />,
    );
    const dataTransfer = fakeDataTransfer();
    writeAssetDrag({ dataTransfer }, 'brand-1', ['asset-1']);
    fireEvent.dragOver(cardRoot(), { dataTransfer });
    expect(cardRoot().getAttribute('data-drop-target')).toBeNull();
    fireEvent.drop(cardRoot(), { dataTransfer });
    expect(drops).toEqual([]);
  });

  it('ignores a drag from another brand', () => {
    const drops: string[][] = [];
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset()}
        onStackDrop={(_target, sources) => drops.push(sources)}
      />,
    );
    const dataTransfer = fakeDataTransfer();
    writeAssetDrag({ dataTransfer }, 'brand-2', ['asset-9']);
    fireEvent.drop(cardRoot(), { dataTransfer });
    expect(drops).toEqual([]);
  });
});

describe('MediaCard office documents', () => {
  it.each([
    [
      'brief.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'DOCX',
      'document',
    ],
    [
      'budget.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'XLSX',
      'spreadsheet',
    ],
    [
      'deck.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'PPTX',
      'presentation',
    ],
    ['old.xls', 'application/vnd.ms-excel', 'XLS', 'spreadsheet'],
  ])('%s says it has no preview and still offers the download', (fileName, mimeType, badge, icon) => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({
          kind: 'file',
          bucket: 'media-source',
          fileName,
          mimeType,
          signedUrl: undefined,
        })}
      />,
    );
    expect(screen.getByTestId('card-no-preview').textContent).toBe('No preview — download to open');
    expect(screen.getByTestId(`office-icon-${icon}`)).not.toBeNull();
    expect(screen.getByText(badge)).not.toBeNull();
    expect(screen.queryByText('Add companion preview')).toBeNull();
    expect(download()).not.toBeNull();
  });

  it('leaves a PDF card alone', () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset({ kind: 'file', fileName: 'deck.pdf', mimeType: 'application/pdf' })}
      />,
    );
    expect(screen.queryByTestId('card-no-preview')).toBeNull();
  });
});

describe('MediaCard hover card and dragging', () => {
  // The hover card is portalled over the neighbouring cards. Measured in the files bench: an
  // open one sat over the grid while a card was dragged to a collection. None may be open
  // (or open) while an asset drag is under way.
  const hoverCardOpen = () => document.body.textContent?.includes('Added') ?? false;
  const hover = async () => {
    const trigger = screen.getByRole('button', { name: 'Open Hero shot' });
    fireEvent.pointerEnter(trigger);
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerMove(trigger);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
  };
  const dataTransfer = () => {
    const store = new Map<string, string>();
    return {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      get types() {
        return [...store.keys()];
      },
      effectAllowed: 'none',
      dropEffect: 'none',
    } as unknown as DataTransfer;
  };

  it('opens on hover when nothing is being dragged', async () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset()} />);
    await hover();
    expect(hoverCardOpen()).toBe(true);
  });

  it('never opens while an asset drag is under way', async () => {
    mount(<MediaCard brandId="brand-1" asset={libraryAsset()} />);
    writeAssetDrag({ dataTransfer: dataTransfer() }, 'brand-1', ['asset-9']);
    await hover();
    expect(hoverCardOpen()).toBe(false);
  });

  it('closes the moment its own card starts a drag', async () => {
    mount(
      <MediaCard
        brandId="brand-1"
        asset={libraryAsset()}
        onDragAssetStart={(event, asset) => writeAssetDrag(event, 'brand-1', [asset.id])}
      />,
    );
    await hover();
    expect(hoverCardOpen()).toBe(true);
    fireEvent.dragStart(screen.getByTestId('media-card'), { dataTransfer: dataTransfer() });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(hoverCardOpen()).toBe(false);
  });
});

describe('MediaCard video scrub', () => {
  const SPRITE_PLAYBACK: LibraryPlayback = {
    assetId: '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22',
    assetVersionId: '1c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33',
    rungs: [],
    sprite: {
      signedUrl: 'https://cdn.test/scrub_sprite.jpg',
      width: 1600,
      height: 900,
      durationMs: 10_000,
    },
    audioProxy: null,
  };
  const realFetch = globalThis.fetch;
  const requests: string[] = [];
  let answer: LibraryPlayback = SPRITE_PLAYBACK;

  beforeEach(() => {
    answer = SPRITE_PLAYBACK;
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (!url.startsWith('/api/library/playback')) return new Response(null, { status: 404 });
      requests.push(url);
      return Response.json(answer);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    requests.length = 0;
    clearLibraryPlaybackCache();
  });

  // No poster and a top-of-grid index, so the card holds a src and hover-play is live.
  const videoCard = () => {
    mount(
      <MediaCard
        brandId="brand-1"
        index={0}
        asset={libraryAsset({
          kind: 'video',
          fileName: 'cut.mp4',
          mimeType: 'video/mp4',
          signedUrl: 'https://cdn.test/cut.mp4',
        })}
      />,
    );
    const video = document.querySelector('video') as HTMLVideoElement;
    video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    const calls = { plays: 0, pauses: 0 };
    video.play = async () => {
      calls.plays += 1;
    };
    video.pause = () => {
      calls.pauses += 1;
    };
    return { video, calls };
  };

  it('looks the sprite up on hover, not on mount, then scrubs by pointer x', async () => {
    const { video, calls } = videoCard();
    await act(async () => {});
    expect(requests).toEqual([]);

    fireEvent.pointerEnter(video, { clientX: 10 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('assetId=asset-1');
    // The first hover plays while the lookup is in flight, and stops once a sprite is known.
    await waitFor(() => expect(calls.pauses).toBeGreaterThan(0));

    fireEvent.pointerMove(video, { clientX: 150 });
    const overlay = screen.getByTestId('card-scrub');
    expect(overlay.dataset.tileIndex).toBe('75');
    // 1600×900 sheet → 160×90 tiles, scaled 1.25× to cover 200×100: never stretched, and
    // tile 75 (column 5, row 7) sits centred under the card.
    expect(overlay.style.backgroundSize).toBe('2000px 1125px');
    expect(overlay.style.backgroundPosition).toBe('-1000px -793.75px');

    fireEvent.pointerLeave(video);
    expect(screen.queryByTestId('card-scrub')).toBeNull();
  });

  it('arms on a move when the pointer was already over the card (no enter ever fired)', async () => {
    const { video } = videoCard();
    await act(async () => {});
    fireEvent.pointerMove(video, { clientX: 10 });
    expect(requests).toHaveLength(1);
    await act(async () => {});
    await waitFor(() => {
      fireEvent.pointerMove(video, { clientX: 150 });
      expect(screen.getByTestId('card-scrub').dataset.tileIndex).toBe('75');
    });
  });

  it('scrubs from the first hover, without playing, when the sprite is already known', async () => {
    await fetchLibraryPlayback({ brandId: 'brand-1', assetId: 'asset-1' });
    const { video, calls } = videoCard();

    fireEvent.pointerEnter(video, { clientX: 0 });
    expect(screen.getByTestId('card-scrub').dataset.tileIndex).toBe('0');
    expect(calls.plays).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it('keeps hover-play exactly as before when the clip has no sprite', async () => {
    answer = { ...SPRITE_PLAYBACK, sprite: null };
    const { video, calls } = videoCard();

    fireEvent.pointerEnter(video, { clientX: 10 });
    expect(calls.plays).toBe(1);
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {});

    fireEvent.pointerMove(video, { clientX: 150 });
    expect(screen.queryByTestId('card-scrub')).toBeNull();
    expect(calls.pauses).toBe(0);
  });
});
