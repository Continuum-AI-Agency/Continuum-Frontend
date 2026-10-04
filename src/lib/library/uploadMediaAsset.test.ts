import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import {
  completeMcpUploadIntent,
  LIBRARY_EFFECTIVE_UPLOAD_CAP_BYTES,
  readSavedResume,
  uploadMediaAsset,
  uploadResumeKey,
  uploadSizeRefusal,
} from './uploadMediaAsset';

type InvokeResult = { data?: unknown; error?: unknown };

interface FakeClientOptions {
  sign?: InvokeResult;
  upload?: { error?: unknown };
  register?: InvokeResult;
  calls: string[];
  bodies?: Record<string, unknown>[];
}

const VALID_TICKET = {
  bucket: 'media-library',
  path: 'b1/asset-1/photo.png',
  token: 'signed-token',
  assetId: 'asset-1',
};

const VALID_REGISTER = {
  ok: true,
  status: 'ready',
  assetId: 'asset-1',
  versionId: '11111111-1111-4111-8111-111111111111',
  storagePath: 'b1/asset-1/photo.png',
  signedUrl: 'https://signed.example/photo.png',
};

function makeClient(opts: FakeClientOptions) {
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
    functions: {
      invoke: async (_name: string, args: { body: Record<string, unknown> }) => {
        const action = args.body.action;
        opts.calls.push(`invoke:${String(action)}`);
        opts.bodies?.push(args.body);
        if (action === 'sign_upload') return opts.sign ?? { data: VALID_TICKET, error: null };
        if (action === 'register') return opts.register ?? { data: VALID_REGISTER, error: null };
        if (action === 'complete_mcp_upload_intent') {
          return {
            data: {
              upload_intent_id: args.body.uploadIntentId,
              status: 'completed',
              asset_refs: args.body.assetRefs,
              updated_at: '2026-07-28T00:00:00.000Z',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    },
    storage: {
      from: (_bucket: string) => ({
        uploadToSignedUrl: async () => {
          opts.calls.push('uploadToSignedUrl');
          return opts.upload ?? { error: null };
        },
      }),
    },
  };
  return client as unknown as ReturnType<
    typeof import('@/lib/supabase/client').createSupabaseBrowserClient
  >;
}

function pngFile(): File {
  return new File(['pixels'], 'photo.png', { type: 'image/png' });
}

function mp4File(): File {
  return new File(['frames'], 'clip.mp4', { type: 'video/mp4' });
}

describe('uploadMediaAsset', () => {
  it('completes an MCP upload handoff with pinned Library versions', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({ calls, bodies });
    const result = await completeMcpUploadIntent(
      {
        brandId: '11111111-1111-4111-8111-111111111111',
        uploadIntentId: '22222222-2222-4222-8222-222222222222',
        assetRefs: [
          {
            asset_id: '33333333-3333-4333-8333-333333333333',
            version_id: '44444444-4444-4444-8444-444444444444',
          },
        ],
      },
      { createClient: () => client },
    );
    expect(calls).toEqual(['invoke:complete_mcp_upload_intent']);
    expect(result.status).toBe('completed');
  });

  it('signs, uploads, then registers in order and returns the asset coordinates', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });

    const result = await uploadMediaAsset(
      { file: pngFile(), brandId: 'b1' },
      { createClient: () => client },
    );

    expect(calls).toEqual(['invoke:sign_upload', 'uploadToSignedUrl', 'invoke:register']);
    expect(result).toEqual({
      assetId: 'asset-1',
      versionId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'b1/asset-1/photo.png',
      signedUrl: 'https://signed.example/photo.png',
      // An image never enters the poster path.
      thumbnailPath: null,
      previewState: 'ready',
    });
  });

  // analyze_media only sees bytes, so it cannot work out a duration for itself. The
  // browser has the decoded file already, and register is the call that enqueues
  // analysis — so the duration has to ride along with it or the long-form skip is
  // blind.
  it('sends a probed duration with register for a video', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({ calls, bodies });

    await uploadMediaAsset(
      { file: mp4File(), brandId: 'b1' },
      { createClient: () => client, attachPoster: async () => null, probeDuration: async () => 96 },
    );

    const register = bodies.find((body) => body.action === 'register');
    expect(register?.durationSec).toBe(96);
  });

  // Past 20 minutes a recording is transcribed on the server; the upload asks for it.
  it('asks the server to transcribe a recording longer than 20 minutes, and only that', async () => {
    const asked: unknown[] = [];
    const upload = (durationSec: number) =>
      uploadMediaAsset(
        {
          file: new File([new Uint8Array([1, 2, 3])], 'meeting.m4a', { type: 'audio/mp4' }),
          brandId: 'b1',
        },
        {
          createClient: () => makeClient({ calls: [], bodies: [] }),
          attachPreview: async () => 'ready',
          probeDuration: async () => durationSec,
          requestServerPreview: async (input) => {
            asked.push(input);
            return { state: 'skipped', signedUrl: null };
          },
        },
      );
    await upload(20 * 60 + 5);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ brandId: 'b1' });
    await upload(19 * 60);
    expect(asked).toHaveLength(1);
  });

  // A long recording is long-form too: without its duration analyze_media sends the whole
  // file through the short inline path.
  it('sends a probed duration with register for an audio recording', async () => {
    const bodies: Record<string, unknown>[] = [];
    await uploadMediaAsset(
      {
        file: new File([new Uint8Array([1, 2, 3])], 'interview.mp3', { type: 'audio/mpeg' }),
        brandId: 'b1',
      },
      {
        createClient: () => makeClient({ calls: [], bodies }),
        attachPreview: async () => 'ready',
        probeDuration: async () => 342.5,
      },
    );
    expect(bodies.find((body) => body.action === 'register')?.durationSec).toBe(342.5);
  });

  it('omits the duration for an image, and when the probe cannot read one', async () => {
    const imageCalls: string[] = [];
    const imageBodies: Record<string, unknown>[] = [];
    await uploadMediaAsset(
      { file: pngFile(), brandId: 'b1' },
      {
        createClient: () => makeClient({ calls: imageCalls, bodies: imageBodies }),
        probeDuration: async () => {
          throw new Error('an image must never reach the probe');
        },
      },
    );
    expect(imageBodies.find((b) => b.action === 'register')).not.toHaveProperty('durationSec');

    const videoCalls: string[] = [];
    const videoBodies: Record<string, unknown>[] = [];
    await uploadMediaAsset(
      { file: mp4File(), brandId: 'b1' },
      {
        createClient: () => makeClient({ calls: videoCalls, bodies: videoBodies }),
        attachPoster: async () => null,
        probeDuration: async () => null,
      },
    );
    expect(videoBodies.find((b) => b.action === 'register')).not.toHaveProperty('durationSec');
  });

  it('generates and persists a poster for a video, and reports its path', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });
    const seen: unknown[] = [];

    const result = await uploadMediaAsset(
      { file: mp4File(), brandId: 'b1' },
      {
        createClient: () => client,
        attachPoster: async (params) => {
          seen.push(params);
          return 'b1/asset-1/thumb.webp';
        },
      },
    );

    expect(result.thumbnailPath).toBe('b1/asset-1/thumb.webp');
    expect(seen).toEqual([
      { file: expect.any(File), mimeType: 'video/mp4', brandId: 'b1', assetId: 'asset-1' },
    ]);
  });

  it('never fails the upload when the poster step throws', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });

    const result = await uploadMediaAsset(
      { file: mp4File(), brandId: 'b1' },
      {
        createClient: () => client,
        attachPoster: async () => {
          throw new Error('WebCodecs unavailable');
        },
      },
    );

    expect(result.assetId).toBe('asset-1');
    expect(result.signedUrl).toBe('https://signed.example/photo.png');
    expect(result.thumbnailPath).toBeNull();
  });

  it('sends the sha256 hex of the file bytes as checksum on register', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({ calls, bodies });

    await uploadMediaAsset({ file: pngFile(), brandId: 'b1' }, { createClient: () => client });

    const register = bodies.find((b) => b.action === 'register');
    expect(register?.checksum).toBe(createHash('sha256').update('pixels').digest('hex'));
  });

  it('registers without a checksum when digesting the bytes fails', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({ calls, bodies });
    const file = pngFile();
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('file too large to buffer')),
    });

    const result = await uploadMediaAsset({ file, brandId: 'b1' }, { createClient: () => client });

    expect(result.assetId).toBe('asset-1');
    const register = bodies.find((b) => b.action === 'register');
    expect(register).toBeDefined();
    expect('checksum' in (register ?? {})).toBe(false);
  });

  it('falls back to application/octet-stream for extension-only files like .aep', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({
      calls,
      bodies,
      sign: {
        data: { ...VALID_TICKET, bucket: 'media-source', path: 'b1/asset-1/intro.aep' },
        error: null,
      },
    });
    const aep = new File(['project'], 'intro.aep', { type: '' });
    const resumableCalls: unknown[] = [];

    const result = await uploadMediaAsset(
      { file: aep, brandId: 'b1' },
      {
        createClient: () => client,
        supabaseUrl: 'https://db.test',
        resumableUpload: async (params) => {
          resumableCalls.push(params);
          return { uploadUrl: 'https://db.test/upload/id' };
        },
      },
    );

    const sign = bodies.find((b) => b.action === 'sign_upload');
    const register = bodies.find((b) => b.action === 'register');
    expect(sign?.mimeType).toBe('application/octet-stream');
    expect(register?.mimeType).toBe('application/octet-stream');
    expect(sign?.fileName).toBe('intro.aep');
    expect(calls).toEqual([
      'invoke:sign_upload',
      'invoke:register',
      'invoke:mark_asset_preview_state',
    ]);
    expect(result.previewState).toBe('awaiting_companion');
    expect(resumableCalls).toEqual([
      expect.objectContaining({
        bucket: 'media-source',
        objectPath: 'b1/asset-1/intro.aep',
        accessToken: 'user-jwt',
      }),
    ]);
  });

  it('never buffers a large project file to compute its checksum', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const client = makeClient({
      calls,
      bodies,
      sign: {
        data: { ...VALID_TICKET, bucket: 'media-source', path: 'b1/asset-1/large.aep' },
        error: null,
      },
    });
    const aep = new File(['small test body'], 'large.aep', { type: '' });
    Object.defineProperty(aep, 'size', { value: 65 * 1024 * 1024 });
    Object.defineProperty(aep, 'arrayBuffer', {
      value: () => Promise.reject(new Error('must not be called')),
    });

    await uploadMediaAsset(
      { file: aep, brandId: 'b1' },
      {
        createClient: () => client,
        supabaseUrl: 'https://db.test',
        resumableUpload: async () => ({ uploadUrl: 'https://db.test/upload/id' }),
      },
    );

    const register = bodies.find((body) => body.action === 'register');
    expect(register).toBeDefined();
    expect('checksum' in (register ?? {})).toBe(false);
  });

  it('rejects a file over the project-global storage cap before any network call', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });
    const aep = new File(['stub'], 'Campaign.AEP', { type: '' });
    Object.defineProperty(aep, 'size', { value: 600 * 1024 * 1024 });

    await expect(
      uploadMediaAsset({ file: aep, brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('Campaign.AEP is 600 MB — uploads are capped at 500 MB right now.');
    expect(calls).toEqual([]);
  });

  it('reads storage refusing the object size as the same cap sentence', async () => {
    const calls: string[] = [];
    const client = makeClient({
      calls,
      upload: { error: { message: 'The object exceeded the maximum allowed size' } },
    });

    await expect(
      uploadMediaAsset({ file: pngFile(), brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('photo.png is 0 MB — uploads are capped at 500 MB right now.');
  });

  it('maps a TUS 413 to the cap sentence', async () => {
    const client = makeClient({ calls: [] });
    const video = new File(['frames'], 'long.mp4', { type: 'video/mp4' });
    Object.defineProperty(video, 'size', { value: 40 * 1024 * 1024 });

    await expect(
      uploadMediaAsset(
        { file: video, brandId: 'b1' },
        {
          createClient: () => client,
          supabaseUrl: 'https://db.test',
          resumableUpload: async () => {
            throw new Error('resumable upload creation failed (413)');
          },
        },
      ),
    ).rejects.toThrow('long.mp4 is 40 MB — uploads are capped at 500 MB right now.');
  });

  it('sends a video bigger than one chunk through the resumable path so it can pause', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });
    const video = new File(['frames'], 'clip.mp4', { type: 'video/mp4' });
    Object.defineProperty(video, 'size', { value: 40 * 1024 * 1024 });
    Object.defineProperty(video, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
    const resumable: unknown[] = [];

    await uploadMediaAsset(
      { file: video, brandId: 'b1' },
      {
        createClient: () => client,
        supabaseUrl: 'https://db.test',
        probeDuration: async () => null,
        attachPoster: async () => null,
        resumableUpload: async (params) => {
          resumable.push(params.objectPath);
          return { uploadUrl: 'https://db.test/upload/id' };
        },
      },
    );

    expect(resumable).toEqual([VALID_TICKET.path]);
    expect(calls).not.toContain('uploadToSignedUrl');
  });

  it('refuses only above the cap', () => {
    expect(
      uploadSizeRefusal({ name: 'a.mp4', size: LIBRARY_EFFECTIVE_UPLOAD_CAP_BYTES }),
    ).toBeNull();
    expect(uploadSizeRefusal({ name: 'a.mp4', size: LIBRARY_EFFECTIVE_UPLOAD_CAP_BYTES + 1 })).toBe(
      'a.mp4 is 500 MB — uploads are capped at 500 MB right now.',
    );
  });

  it('throws when the sign response is not a valid ticket', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls, sign: { data: { bucket: 'media-library' }, error: null } });

    await expect(
      uploadMediaAsset({ file: pngFile(), brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('invalid upload ticket');
    expect(calls).toEqual(['invoke:sign_upload']);
  });

  it("surfaces the edge fn's structured error message from a non-2xx register", async () => {
    const calls: string[] = [];
    const context = new Response(
      JSON.stringify({ ok: false, status: 'error', message: 'DB insert failed: boom' }),
      { status: 500 },
    );
    const client = makeClient({
      calls,
      register: {
        data: null,
        error: { message: 'Edge Function returned a non-2xx status code', context },
      },
    });

    await expect(
      uploadMediaAsset({ file: pngFile(), brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('DB insert failed: boom');
  });

  it('throws when the direct storage upload fails', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls, upload: { error: { message: 'signature expired' } } });

    await expect(
      uploadMediaAsset({ file: pngFile(), brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('upload to storage failed: signature expired');
    expect(calls).toEqual(['invoke:sign_upload', 'uploadToSignedUrl']);
  });
});

describe('resuming across a reload', () => {
  const memoryStore = () => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
  };
  // A >6 MB file goes over TUS; the same bytes, name and mtime are "the same file" after a reload.
  const bigFile = () =>
    new File([new Uint8Array(7 * 1024 * 1024)], 'b-roll.mov', {
      type: 'video/quicktime',
      lastModified: 1_700_000_000_000,
    });

  it('keeps the ticket and TUS URL when the page goes away mid-upload, then resumes from them', async () => {
    const store = memoryStore();
    const firstBodies: Record<string, unknown>[] = [];
    await expect(
      uploadMediaAsset(
        { file: bigFile(), brandId: 'b1' },
        {
          createClient: () => makeClient({ calls: [], bodies: firstBodies }),
          supabaseUrl: 'https://db.test',
          resumeStore: store,
          resumableUpload: async (params) => {
            params.onUploadUrl?.('https://db.test/upload/resumable/abc');
            throw new Error('the tab was closed');
          },
        },
      ),
    ).rejects.toThrow('the tab was closed');
    expect(store.map.size).toBe(1);
    expect(firstBodies.filter((body) => body.action === 'sign_upload')).toHaveLength(1);

    const secondBodies: Record<string, unknown>[] = [];
    const resumedFrom: unknown[] = [];
    await uploadMediaAsset(
      { file: bigFile(), brandId: 'b1' },
      {
        createClient: () => makeClient({ calls: [], bodies: secondBodies }),
        supabaseUrl: 'https://db.test',
        resumeStore: store,
        attachPreview: async () => 'ready',
        probeDuration: async () => null,
        resumableUpload: async (params) => {
          resumedFrom.push(params.uploadUrl);
          return { uploadUrl: params.uploadUrl ?? '' };
        },
      },
    );
    // No new ticket: the same object, registered under the first attempt's asset id.
    expect(secondBodies.filter((body) => body.action === 'sign_upload')).toHaveLength(0);
    expect(resumedFrom).toEqual(['https://db.test/upload/resumable/abc']);
    expect(secondBodies.find((body) => body.action === 'register')?.assetId).toBe(
      VALID_TICKET.assetId,
    );
    // Done: nothing is left to resume.
    expect(store.map.size).toBe(0);
  });

  it('starts over once the saved ticket is older than its signed life', () => {
    const store = memoryStore();
    const file = bigFile();
    store.setItem(
      uploadResumeKey('b1', file),
      JSON.stringify({
        ticket: VALID_TICKET,
        uploadUrl: 'https://db.test/upload/resumable/abc',
        savedAt: Date.now() - 3 * 60 * 60 * 1000,
      }),
    );
    expect(readSavedResume(store, uploadResumeKey('b1', file))).toBeNull();
    expect(store.map.size).toBe(0);
  });
});

it('reserves an authored variant at registration before catalog discovery', async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = makeClient({ calls: [], bodies });
  const parent = '11111111-1111-4111-8111-111111111111';
  await uploadMediaAsset(
    { brandId: 'b1', file: new File(['aep'], 'Variant.aep'), templateVariantOf: parent },
    {
      createClient: () => client,
      attachPreview: async () => 'unsupported',
      supabaseUrl: 'https://db.test',
      resumableUpload: async () => ({ uploadUrl: 'https://db.test/upload/id' }),
    },
  );
  expect(bodies.find((body) => body.action === 'register')?.templateVariantOf).toBe(parent);
  expect(bodies.find((body) => body.action === 'sign_upload')?.templateVariantOf).toBeUndefined();
});
