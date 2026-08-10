import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { InstagramTopMediaResponse, UnfurlMediaItem } from '@continuum/contracts';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { parseReferenceDropPayload } from '@/lib/ai-studio/referenceDrop';
import { ApiError } from '@/lib/api/errors';
import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});
global.getComputedStyle = global.window.getComputedStyle.bind(global.window);
global.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(Date.now()), 0) as unknown as number;
global.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
(global as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;
(global as { NodeFilter?: unknown }).NodeFilter = window.NodeFilter;

// Panel needs ReactFlow store context; render it as a plain container in tests.
mock.module('@xyflow/react', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchMock = mock(
  async (): Promise<InstagramTopMediaResponse> => ({
    account: { username: 'nasa', name: 'NASA', followersCount: 1 },
    posts: [],
  }),
);

mock.module('@/lib/api/aiStudioInstagram.client', () => ({
  fetchInstagramTopMedia: fetchMock,
}));

import { InstagramMediaBrowser } from './InstagramMediaBrowser';

const carouselResponse: InstagramTopMediaResponse = {
  account: { username: 'nasa', name: 'NASA', followersCount: 95000000 },
  posts: [
    {
      id: '1',
      shortcode: 'SC1',
      permalink: 'https://www.instagram.com/p/SC1/',
      kind: 'carousel',
      coverUrl: 'https://cdn/cover.jpg',
      mediaCount: 2,
      items: [
        { kind: 'image', url: 'https://cdn/1.jpg' },
        { kind: 'image', url: 'https://cdn/2.jpg' },
      ],
    },
  ],
};

const renderBrowser = (onPlace = mock((_items: UnfurlMediaItem[]) => {})) => {
  render(<InstagramMediaBrowser brandProfileId="b-1" onPlace={onPlace} onClose={mock(() => {})} />);
  return { onPlace };
};

// Minimal DataTransfer stand-in — the code under test only sets effectAllowed
// and one text/plain entry. The DOM's DragEvent constructor ignores a
// `dataTransfer` init, so it has to be pinned onto the event by hand.
const dragStartWithDataTransfer = (element: Element) => {
  const store = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: 'uninitialized',
    setData: (format: string, value: string) => {
      store.set(format, value);
    },
    getData: (format: string) => store.get(format) ?? '',
  };
  const event = createEvent.dragStart(element);
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  fireEvent(element, event);
  return dataTransfer;
};

const search = async (handle: string) => {
  // Wait for the mount auto-load to settle so the submit button shows "Search"
  // (not the loading spinner) and the form is interactive before we type + click.
  const searchButton = await screen.findByRole('button', { name: /search/i });
  fireEvent.change(screen.getByLabelText(/instagram username/i), { target: { value: handle } });
  await act(async () => {
    fireEvent.click(searchButton);
  });
};

describe('InstagramMediaBrowser', () => {
  beforeEach(() => {
    cleanup();
    fetchMock.mockReset();
  });

  it("searches a username and renders the account's posts", async () => {
    fetchMock.mockResolvedValue(carouselResponse);
    renderBrowser();
    await search('@nasa');

    expect(fetchMock).toHaveBeenCalledWith({
      brandId: 'b-1',
      username: 'nasa',
      signal: expect.anything(),
    });
    expect(await screen.findByText('NASA')).toBeDefined();
    expect(await screen.findByRole('button', { name: /import from carousel SC1/i })).toBeDefined();
  });

  it('opens a post and places only the selected slides', async () => {
    fetchMock.mockResolvedValue(carouselResponse);
    const { onPlace } = renderBrowser();
    await search('nasa');

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /import from carousel SC1/i }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /toggle slide 2/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add .*to canvas/i }));
    });

    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace.mock.calls[0][0]).toEqual([{ kind: 'image', url: 'https://cdn/1.jpg' }]);
  });

  it('shows the account-required notice when the brand has no connected Instagram (409)', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 409, 'IG_VIEWER_UNAVAILABLE'));
    renderBrowser();
    await search('nasa');

    await waitFor(() => {
      expect(screen.getByText(/connect an instagram business account/i)).toBeDefined();
    });
  });

  it('shows a reconnect notice when the lookup is temporarily unavailable (503)', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 503, 'IG_LOOKUP_UNAVAILABLE'));
    renderBrowser();
    await search('nasa');

    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeDefined();
    });
  });

  // #249/#250: the tiles used to emit no drag payload at all, so both canvas drop
  // paths (which read CREATIVE_ASSET_DRAG_TYPE / reactflow-node-data / text/plain)
  // saw nothing and dropping an Instagram photo did nothing.
  it('emits a drag payload the canvas drop resolver can read, from a post tile', async () => {
    fetchMock.mockResolvedValue(carouselResponse);
    renderBrowser();
    await search('nasa');

    const tile = await screen.findByRole('button', { name: /import from carousel SC1/i });
    const dataTransfer = dragStartWithDataTransfer(tile);

    // Must match the canvas dropzone's dropEffect or Chrome swallows the drop.
    expect(dataTransfer.effectAllowed).toBe(STUDIO_ASSET_DROP_EFFECT);
    expect(parseReferenceDropPayload(dataTransfer.getData('text/plain'))).toEqual({
      kind: 'remote',
      publicUrl: 'https://cdn/cover.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('emits a drag payload from an individual carousel slide tile', async () => {
    fetchMock.mockResolvedValue(carouselResponse);
    renderBrowser();
    await search('nasa');

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /import from carousel SC1/i }));
    });

    const slide = await screen.findByRole('button', { name: /toggle slide 2/i });
    const dataTransfer = dragStartWithDataTransfer(slide);

    expect(dataTransfer.effectAllowed).toBe(STUDIO_ASSET_DROP_EFFECT);
    expect(parseReferenceDropPayload(dataTransfer.getData('text/plain'))).toEqual({
      kind: 'remote',
      publicUrl: 'https://cdn/2.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('shows a not-found notice for a private or unknown handle', async () => {
    fetchMock.mockRejectedValue(new ApiError('nope', 404, 'IG_ACCOUNT_NOT_FOUND'));
    renderBrowser();
    await search('ghost');

    await waitFor(() => {
      expect(screen.getByText(/no public business or creator account/i)).toBeDefined();
    });
  });
});
