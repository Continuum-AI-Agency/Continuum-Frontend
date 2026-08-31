import { describe, expect, it, mock } from 'bun:test';
import type { RunActionArgs } from './runAction';
import { __testing, runRemoveImageBackground } from './removeBackgroundOp';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_VERSION_ID = '55555555-5555-4555-8555-555555555555';

const completedData = {
  requestId: REQUEST_ID,
  assetId: ASSET_ID,
  versionId: VERSION_ID,
  sourceVersionId: SOURCE_VERSION_ID,
  kind: 'image' as const,
  mode: 'remove' as const,
  signedUrl: 'https://storage.test/cutout.png?sig=1',
  bucket: 'brand-profile-assets',
  storagePath: `${BRAND_ID}/cutout.png`,
  fileName: 'hero-cutout.png',
  mimeType: 'image/png',
  width: 800,
  height: 600,
  durationMs: null,
  hasAlpha: true,
};

/** An SSE body delivered in awkward chunks, because a real one always is. */
function sseResponse(frames: unknown[], chunkSize = 7): Response {
  const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
        offset += chunkSize;
      },
    }),
    { status: 200 },
  );
}

const args = (over: Partial<RunActionArgs> = {}): RunActionArgs => ({
  actionId: 'image.removeBackground',
  inputs: [{ handle: 'in', imageUrl: 'https://storage.test/hero.png', assetId: ASSET_ID }],
  config: {},
  ...over,
});

const deps = (fetchImpl: typeof fetch) => ({
  resolveBrandId: () => BRAND_ID,
  getToken: async () => 'token',
  newRequestId: () => REQUEST_ID,
  fetchImpl,
});

describe('runRemoveImageBackground', () => {
  it('reassembles the cutout from an SSE stream split mid-frame', async () => {
    const progress: number[] = [];
    const fetchImpl = mock(async () =>
      sseResponse([
        { type: 'background_removal.started', data: { requestId: REQUEST_ID } },
        {
          type: 'background_removal.progress',
          data: { requestId: REQUEST_ID, stage: 'matting', progress: 25 },
        },
        { type: 'background_removal.completed', data: completedData },
      ]),
    ) as unknown as typeof fetch;

    const output = await __testing
      .requestRemoval(
        args({ onProgress: (fraction) => progress.push(fraction) }),
        {},
        'image',
        deps(fetchImpl),
      )
      .then((done) => done);

    expect(output.assetId).toBe(ASSET_ID);
    expect(output.hasAlpha).toBe(true);
    expect(progress).toEqual([0.25, 1]);
  });

  it('surfaces the failure frame message rather than hanging for a completion', async () => {
    const fetchImpl = mock(async () =>
      sseResponse([
        {
          type: 'background_removal.failed',
          data: {
            requestId: REQUEST_ID,
            code: 'MATTE_FAILED',
            message: 'The background remover is out of GPU capacity',
            retryable: true,
          },
        },
      ]),
    ) as unknown as typeof fetch;

    await expect(__testing.requestRemoval(args(), {}, 'image', deps(fetchImpl))).rejects.toThrow(
      /out of GPU capacity/,
    );
  });

  it('says a stream that ended without finishing did not finish', async () => {
    const fetchImpl = mock(async () =>
      sseResponse([{ type: 'background_removal.started', data: { requestId: REQUEST_ID } }]),
    ) as unknown as typeof fetch;

    await expect(__testing.requestRemoval(args(), {}, 'image', deps(fetchImpl))).rejects.toThrow(
      /closed without finishing/,
    );
  });

  // The cutout is registered as a derivative OF the source, so an input with no
  // Library asset has nothing to derive from. Better a sentence than a 400.
  it('asks for the source to be saved rather than sending a request that cannot work', async () => {
    const fetchImpl = mock(async () => sseResponse([])) as unknown as typeof fetch;
    await expect(
      __testing.requestRemoval(
        args({ inputs: [{ handle: 'in', imageUrl: 'https://storage.test/hero.png' }] }),
        {},
        'image',
        deps(fetchImpl),
      ),
    ).rejects.toThrow(/Save this media to the Library first/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a completed cutout onto an image NodeOutput that keeps its lineage', async () => {
    const fetchImpl = mock(async () =>
      sseResponse([{ type: 'background_removal.completed', data: completedData }]),
    ) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const output = await runRemoveImageBackground(args(), {}, deps(fetchImpl));
      expect(output).toEqual({
        type: 'image',
        mimeType: 'image/png',
        url: completedData.signedUrl,
        storagePath: completedData.storagePath,
        storageBucket: completedData.bucket,
        assetId: ASSET_ID,
        assetVersionId: VERSION_ID,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('plateFor', () => {
  const withPlate = args({
    inputs: [
      { handle: 'in', imageUrl: 'https://storage.test/clip.mp4', assetId: ASSET_ID },
      { handle: 'background-in', blob: new Blob(['plate'], { type: 'image/png' }) },
    ],
  });

  it('ignores a wired plate in remove mode — nothing is being replaced', async () => {
    expect(await __testing.plateFor(withPlate, { mode: 'remove' })).toBeNull();
  });

  it('uses the plate in replace mode', async () => {
    expect(await __testing.plateFor(withPlate, { mode: 'replace' })).toBeInstanceOf(Blob);
  });

  it('falls through to the flat colour when replace mode has no plate wired', async () => {
    expect(await __testing.plateFor(args(), { mode: 'replace' })).toBeNull();
  });
});
