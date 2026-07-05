import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { cutAndPersistSection, extractAndUploadAudio } from './clipClientCut';

const SECTION = {
  index: 1,
  startSec: 0,
  endSec: 30,
  title: 'Intro',
  summary: 'opening',
  hookLine: 'watch this',
  transcriptExcerpt: 'hello world',
  keepRanges: [
    { startSec: 0, endSec: 12 },
    { startSec: 14, endSec: 28 },
  ],
  words: [
    { text: 'hello', startSec: 0, endSec: 0.5 },
    { text: 'world', startSec: 0.6, endSec: 1.0 },
  ],
};
const SCORE = {
  status: 'pending' as const,
  hookPotential: null,
  comparedAgainst: null,
  computedAt: '2026-06-15T00:00:00Z',
};

function makeFakeSupabase() {
  const invoke = mock(async (_name: string, { body }: { body: Record<string, unknown> }) => {
    if (body.action === 'sign_upload') {
      const path =
        body.target === 'audio'
          ? 'clip-audio/b1/uuid.wav'
          : `clips/b1/asset-1/${body.sectionIndex}.mp4`;
      return { data: { bucket: 'media-library', path, token: 'tok' }, error: null };
    }
    if (body.action === 'register')
      return { data: { ok: true, status: 'ready', assetId: 'clip-asset-1' }, error: null };
    return { data: null, error: { message: 'unexpected action' } };
  });
  const upload = mock(async (path: string) => ({ data: { path }, error: null }));
  const client = {
    functions: { invoke },
    storage: { from: () => ({ uploadToSignedUrl: upload }) },
  };
  return { client: () => client as never, invoke, upload };
}

let revokeSpy: ReturnType<typeof mock>;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  originalRevoke = URL.revokeObjectURL;
  revokeSpy = mock(() => {});
  URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => {
  URL.revokeObjectURL = originalRevoke;
});

describe('cutAndPersistSection', () => {
  it('cuts → signs → uploads → registers, returns the assetId, and revokes the worker url', async () => {
    const { client, invoke, upload } = makeFakeSupabase();
    const splice = mock(async () => ({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
      objectUrl: 'blob:fake-clip',
      width: 1080,
      height: 1920,
      durationSec: 26,
    }));
    const stages: string[] = [];

    const result = await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
        onStage: (s) => stages.push(s),
      },
      { createClient: client, splice: splice as never },
    );

    expect(result.assetId).toBe('clip-asset-1');
    // Ordering: splice runs before any network call; sign precedes upload precedes register.
    expect(splice).toHaveBeenCalledTimes(1);
    const sliceArgs = splice.mock.calls[0][0] as { ranges: unknown[]; maxShortEdgePx?: number };
    expect(sliceArgs.ranges).toHaveLength(2);
    // Defaults to the 1080p short-edge cap when no quality is supplied.
    expect(sliceArgs.maxShortEdgePx).toBe(1080);
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      action: 'sign_upload',
      target: 'clip',
      sectionIndex: 1,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[1][1].body).toMatchObject({
      action: 'register',
      storagePath: 'clips/b1/asset-1/1.mp4',
      durationSec: 26,
    });
    expect((invoke.mock.calls[1][1].body as { score: unknown }).score).toEqual(SCORE);
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-clip');
    expect(stages).toEqual(['Cutting…', 'Uploading…', 'Saving…']);
  });

  it('forwards mapped caption words to the splice only when captions are enabled', async () => {
    const { client } = makeFakeSupabase();
    const makeSplice = () =>
      mock(async () => ({
        blob: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
        objectUrl: 'blob:c',
        width: 1,
        height: 1,
        durationSec: 5,
      }));

    const spliceOn = makeSplice();
    await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
        captionsEnabled: true,
      },
      { createClient: client, splice: spliceOn as never },
    );
    expect((spliceOn.mock.calls[0][0] as { captionWords?: unknown[] }).captionWords).toEqual([
      { text: 'hello', startSec: 0, endSec: 0.5 },
      { text: 'world', startSec: 0.6, endSec: 1.0 },
    ]);

    const spliceOff = makeSplice();
    await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
      },
      { createClient: client, splice: spliceOff as never },
    );
    expect(
      (spliceOff.mock.calls[0][0] as { captionWords?: unknown[] }).captionWords,
    ).toBeUndefined();
  });

  it('forwards the brand caption style only when captions are enabled', async () => {
    const { client } = makeFakeSupabase();
    const style = {
      textColor: '#ffffff',
      highlightColor: '#1e90ff',
      outlineColor: '#000000',
      fontFamily: 'Inter',
    };
    const makeSplice = () =>
      mock(async () => ({
        blob: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
        objectUrl: 'blob:s',
        width: 1,
        height: 1,
        durationSec: 5,
      }));

    const spliceOn = makeSplice();
    await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
        captionsEnabled: true,
        captionStyle: style,
      },
      { createClient: client, splice: spliceOn as never },
    );
    expect((spliceOn.mock.calls[0][0] as { captionStyle?: unknown }).captionStyle).toEqual(style);

    const spliceOff = makeSplice();
    await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
        captionsEnabled: false,
        captionStyle: style,
      },
      { createClient: client, splice: spliceOff as never },
    );
    expect((spliceOff.mock.calls[0][0] as { captionStyle?: unknown }).captionStyle).toBeUndefined();
  });

  it('forwards the selected 720p quality as a 720px short-edge cap to the splice', async () => {
    const { client } = makeFakeSupabase();
    const splice = mock(async () => ({
      blob: new Blob([new Uint8Array([1])], { type: 'video/mp4' }),
      objectUrl: 'blob:q',
      width: 720,
      height: 1280,
      durationSec: 20,
    }));

    await cutAndPersistSection(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        section: SECTION,
        score: SCORE,
        quality: '720p',
      },
      { createClient: client, splice: splice as never },
    );

    expect((splice.mock.calls[0][0] as { maxShortEdgePx?: number }).maxShortEdgePx).toBe(720);
  });

  it('throws the edge fn message when register returns an error envelope', async () => {
    const { client } = makeFakeSupabase();
    const badClient = () =>
      ({
        functions: {
          invoke: async (_n: string, { body }: { body: Record<string, unknown> }) =>
            body.action === 'register'
              ? { data: { ok: false, status: 'error', message: 'duplicate path' }, error: null }
              : {
                  data: { bucket: 'media-library', path: 'clips/b1/asset-1/1.mp4', token: 't' },
                  error: null,
                },
        },
        storage: { from: () => ({ uploadToSignedUrl: async () => ({ data: {}, error: null }) }) },
      }) as never;
    void client;
    const splice = mock(async () => ({
      blob: new Blob([new Uint8Array([1])]),
      objectUrl: 'blob:x',
      width: 1,
      height: 1,
      durationSec: 5,
    }));

    await expect(
      cutAndPersistSection(
        {
          brandId: 'b1',
          sourceAssetId: 'asset-1',
          sourceBlob: new Blob([]),
          section: SECTION,
          score: SCORE,
        },
        { createClient: badClient, splice: splice as never },
      ),
    ).rejects.toThrow(/duplicate path/);
    expect(revokeSpy).toHaveBeenCalledWith('blob:x');
  });
});

describe('extractAndUploadAudio', () => {
  it('extracts the wav, signs an audio upload, uploads, and returns the audio location', async () => {
    const { client, invoke, upload } = makeFakeSupabase();
    const extractAudio = mock(
      async () => new Blob([new Uint8Array([5, 5])], { type: 'audio/wav' }),
    );
    const controller = new AbortController();

    const result = await extractAndUploadAudio(
      {
        brandId: 'b1',
        sourceAssetId: 'asset-1',
        sourceBlob: new Blob([new Uint8Array([0])]),
        signal: controller.signal,
      },
      { createClient: client, extractAudio: extractAudio as never },
    );

    expect(extractAudio).toHaveBeenCalledTimes(1);
    expect(extractAudio.mock.calls[0][1]).toEqual({ signal: controller.signal });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ action: 'sign_upload', target: 'audio' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      audioBucket: 'media-library',
      audioStoragePath: 'clip-audio/b1/uuid.wav',
    });
  });
});
