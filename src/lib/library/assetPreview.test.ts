import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// The server-preview request goes to the Backend over HTTP; record it instead.
const proxyRequests: unknown[] = [];
mock.module('./previewProxy', () => ({
  requestLibraryPreviewProxy: async (input: unknown) => {
    proxyRequests.push(input);
    return {};
  },
}));

import { attachAssetPreview } from './assetPreview';

// Just enough browser for rasterizeBrowserImage: a decoded bitmap and a canvas that encodes.
const saved = {
  createImageBitmap: (globalThis as Record<string, unknown>).createImageBitmap,
  OffscreenCanvas: (globalThis as Record<string, unknown>).OffscreenCanvas,
  HTMLCanvasElement: (globalThis as Record<string, unknown>).HTMLCanvasElement,
};
beforeEach(() => {
  (globalThis as Record<string, unknown>).HTMLCanvasElement ??= class {};
  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({
    width: 3000,
    height: 2000,
    close() {},
  });
  (globalThis as Record<string, unknown>).OffscreenCanvas = class {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob() {
      return new Blob([new Uint8Array(64)], { type: 'image/webp' });
    }
  };
});
afterEach(() => {
  proxyRequests.length = 0;
  (globalThis as Record<string, unknown>).createImageBitmap = saved.createImageBitmap;
  (globalThis as Record<string, unknown>).OffscreenCanvas = saved.OffscreenCanvas;
  (globalThis as Record<string, unknown>).HTMLCanvasElement = saved.HTMLCanvasElement;
});

function fakeClient() {
  const actions: Array<Record<string, unknown>> = [];
  const uploads: string[] = [];
  const client = {
    functions: {
      invoke: async (_name: string, { body }: { body: Record<string, unknown> }) => {
        actions.push(body);
        return body.action === 'sign_asset_rendition'
          ? {
              data: {
                renditionId: '11111111-1111-4111-8111-111111111111',
                bucket: 'media-previews',
                path: 'b/a/v/preview_image.webp',
                token: 't',
              },
              error: null,
            }
          : { data: { signedUrl: 'https://signed' }, error: null };
      },
    },
    storage: {
      from: () => ({
        uploadToSignedUrl: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
      }),
    },
    schema: () => ({
      from: () => ({
        update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }) }),
      }),
    }),
  };
  return { client: client as never, actions, uploads };
}

const ids = {
  brandId: '22222222-2222-4222-8222-222222222222',
  assetId: '33333333-3333-4333-8333-333333333333',
  assetVersionId: '44444444-4444-4444-8444-444444444444',
};

describe('attachAssetPreview — native photos', () => {
  it('stores a WebP preview_image for a JPEG instead of returning ready with nothing stored', async () => {
    const { client, actions, uploads } = fakeClient();
    const state = await attachAssetPreview({
      ...ids,
      client,
      file: new File([new Uint8Array(10)], 'hero.jpg', { type: 'image/jpeg' }),
    });
    expect(state).toBe('ready');
    expect(actions[0]).toMatchObject({
      action: 'sign_asset_rendition',
      role: 'preview_image',
      mimeType: 'image/webp',
    });
    expect(actions[1]).toMatchObject({
      action: 'complete_asset_rendition',
      renderer: 'browser-image-decoder',
    });
    expect(uploads).toEqual(['b/a/v/preview_image.webp']);
  });

  it('stores nothing for a GIF, which keeps its animation', async () => {
    const { client, actions } = fakeClient();
    const file = new File([new Uint8Array(10)], 'loop.gif', { type: 'image/gif' });
    expect(await attachAssetPreview({ ...ids, client, file })).toBe('ready');
    expect(actions).toEqual([]);
    expect(proxyRequests).toEqual([]);
  });

  it('plays audio as is, and asks the server for its AAC proxy', async () => {
    const { client, actions } = fakeClient();
    const file = new File([new Uint8Array(10)], 'voice.mp3', { type: 'audio/mpeg' });
    expect(await attachAssetPreview({ ...ids, client, file })).toBe('ready');
    expect(actions).toEqual([]);
    expect(proxyRequests).toEqual([ids]);
  });
});

describe('attachAssetPreview — a video this browser cannot decode', () => {
  // Ten bytes decode nowhere, which is exactly the browser-cannot-decode case.
  for (const [name, type] of [
    ['clip.mp4', 'video/mp4'],
    ['clip.webm', 'video/webm'],
    ['clip.mov', 'video/quicktime'],
  ] as const) {
    it(`hands ${name} to the server instead of failing the preview`, async () => {
      const { client, actions } = fakeClient();
      const file = new File([new Uint8Array(10)], name, { type });

      expect(await attachAssetPreview({ ...ids, client, file })).toBe('awaiting_companion');
      expect(actions).toEqual([
        {
          action: 'mark_asset_preview_state',
          ...ids,
          state: 'awaiting_companion',
          errorCode: 'server_preview_pending',
          errorMessage: 'Building the preview on our servers. It will appear here shortly.',
        },
      ]);
      expect(proxyRequests).toEqual([ids]);
    });
  }
});
