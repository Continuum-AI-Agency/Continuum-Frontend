// The inspector's background-removal path, from the clip to the new bin source.
//
// The op itself is exercised through its real SSE reader and its real contract schema —
// only the HTTP call is stubbed, because the matte runs on a GPU in Cloud Run.

import { describe, expect, it } from 'bun:test';
import type { TimelineItem } from '../../types';
import type { TimelineDocument } from './adapter';
import { removeClipBackground, repointClipSource } from './clipBackgroundRemoval';

const SOURCE_ASSET_ID = '11111111-1111-4111-8111-111111111111';
const CUTOUT_ASSET_ID = '22222222-2222-4222-8222-222222222222';
const CUTOUT_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const BRAND_ID = '55555555-5555-4555-8555-555555555555';

const clip = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'clip-1',
  order: 0,
  sourceNodeId: 'src-1',
  kind: 'video',
  ...over,
});

/** A still. The two lanes are separate services and the CLIP one is held back, so the
 *  plumbing tests below drive the still lane — same op, same stream reader, same
 *  contract, and the only one a request can currently reach. */
const still = () => clip({ kind: 'image' });

const sse = (events: unknown[]): string =>
  `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`;

const completed = {
  type: 'background_removal.completed',
  data: {
    requestId: REQUEST_ID,
    assetId: CUTOUT_ASSET_ID,
    versionId: CUTOUT_VERSION_ID,
    sourceVersionId: SOURCE_ASSET_ID,
    kind: 'image',
    mode: 'remove',
    signedUrl: 'https://storage.example/cutout.png?sig=1',
    bucket: 'media',
    storagePath: 'brand/cutout.png',
    fileName: 'cutout.png',
    mimeType: 'image/png',
    width: 1080,
    height: 1920,
    durationMs: null,
    hasAlpha: true,
  },
};

function stubFetch(
  body: string,
  init: ResponseInit = {},
): {
  fetchImpl: typeof fetch;
  requests: Array<Record<string, unknown>>;
} {
  const requests: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_input: RequestInfo | URL, options?: RequestInit) => {
    requests.push(JSON.parse(String(options?.body ?? '{}')));
    return new Response(body, { status: 200, ...init });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

const deps = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  getToken: async () => 'bench-token',
  newRequestId: () => REQUEST_ID,
});

describe('removeClipBackground', () => {
  it('returns the cutout as a bin source and reports the service progress', async () => {
    const { fetchImpl, requests } = stubFetch(
      sse([
        { type: 'background_removal.started', data: { requestId: REQUEST_ID } },
        {
          type: 'background_removal.progress',
          data: { requestId: REQUEST_ID, stage: 'matting', progress: 40 },
        },
        completed,
      ]),
    );
    const progress: number[] = [];

    const source = await removeClipBackground({
      item: still(),
      sourceAssetId: SOURCE_ASSET_ID,
      label: 'Hero (cutout)',
      brandId: BRAND_ID,
      durationSec: 4,
      onProgress: (fraction) => progress.push(fraction),
      deps: deps(fetchImpl),
    });

    expect(source).toEqual({
      nodeId: CUTOUT_ASSET_ID,
      kind: 'image',
      label: 'Hero (cutout)',
      sourceAssetId: CUTOUT_ASSET_ID,
      sourceVersionId: CUTOUT_VERSION_ID,
      previewUrl: 'https://storage.example/cutout.png?sig=1',
      durationSec: 4,
    });
    expect(progress).toEqual([0.4, 1]);
    // A plain cutout, never `replace`: the inspector has no plate to composite. The
    // lane is read off the clip's own kind, which is what keeps a still off the GPU job.
    expect(requests[0]).toMatchObject({
      brandId: BRAND_ID,
      sourceAssetId: SOURCE_ASSET_ID,
      kind: 'image',
      mode: 'remove',
      featherPx: 0,
    });
  });

  // The clip lane's GPU job is unreachable in production. Refusing here — before the
  // request — is what keeps a user from waiting out a matte that always fails, and it
  // has to live below the inspector too: the timeline is not the only caller.
  it('refuses a clip while the video lane is held back, before any request goes out', async () => {
    const { fetchImpl, requests } = stubFetch(sse([completed]));
    await expect(
      removeClipBackground({
        item: clip(),
        sourceAssetId: SOURCE_ASSET_ID,
        label: 'Hero',
        brandId: BRAND_ID,
        deps: deps(fetchImpl),
      }),
    ).rejects.toThrow(/Coming soon/);
    expect(requests).toHaveLength(0);
  });

  it('surfaces the service failure message rather than a generic one', async () => {
    const { fetchImpl } = stubFetch(
      sse([
        {
          type: 'background_removal.failed',
          data: {
            requestId: REQUEST_ID,
            code: 'ENTITLEMENT_REQUIRED',
            message: 'This brand has no matte entitlement',
            retryable: false,
          },
        },
      ]),
    );
    await expect(
      removeClipBackground({
        item: still(),
        sourceAssetId: SOURCE_ASSET_ID,
        label: 'Hero',
        brandId: BRAND_ID,
        deps: deps(fetchImpl),
      }),
    ).rejects.toThrow('This brand has no matte entitlement');
  });

  it('refuses without a brand, before any request goes out', async () => {
    const { fetchImpl, requests } = stubFetch(sse([completed]));
    await expect(
      removeClipBackground({
        item: still(),
        sourceAssetId: SOURCE_ASSET_ID,
        label: 'Hero',
        brandId: null,
        deps: deps(fetchImpl),
      }),
    ).rejects.toThrow('Select a brand');
    expect(requests).toHaveLength(0);
  });
});

describe('repointClipSource', () => {
  const document: TimelineDocument = {
    items: [clip(), clip({ id: 'clip-2', order: 1, sourceNodeId: 'src-2' })],
    overlayTracks: [
      { id: 'ov-1', kind: 'overlay', items: [clip({ id: 'clip-3', sourceNodeId: 'src-3' })] },
    ],
  };

  it('repoints a base clip and leaves every other placement alone', () => {
    const next = repointClipSource(document, 'clip-1', CUTOUT_ASSET_ID);
    expect(next.items[0].sourceNodeId).toBe(CUTOUT_ASSET_ID);
    expect(next.items[1].sourceNodeId).toBe('src-2');
    expect(next.overlayTracks?.[0].items[0].sourceNodeId).toBe('src-3');
  });

  it('repoints an overlay clip on its own track', () => {
    const next = repointClipSource(document, 'clip-3', CUTOUT_ASSET_ID);
    expect(next.overlayTracks?.[0].items[0].sourceNodeId).toBe(CUTOUT_ASSET_ID);
    expect(next.items.map((item) => item.sourceNodeId)).toEqual(['src-1', 'src-2']);
  });

  it('keeps the edit — trim, effects and transition are not properties of the bytes', () => {
    const edited: TimelineDocument = {
      items: [
        clip({
          trimStartSec: 1,
          effects: { warmth: 0.5 },
          transition: { type: 'fade', durationSec: 0.5 },
        }),
      ],
    };
    expect(repointClipSource(edited, 'clip-1', CUTOUT_ASSET_ID).items[0]).toMatchObject({
      sourceNodeId: CUTOUT_ASSET_ID,
      trimStartSec: 1,
      effects: { warmth: 0.5 },
      transition: { type: 'fade', durationSec: 0.5 },
    });
  });
});
