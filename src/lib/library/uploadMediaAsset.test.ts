import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { uploadMediaAsset } from './uploadMediaAsset';

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

  it('rejects an uppercase .AEP above the 5 GB object limit before signing', async () => {
    const calls: string[] = [];
    const client = makeClient({ calls });
    const aep = new File(['stub'], 'Campaign.AEP', { type: '' });
    Object.defineProperty(aep, 'size', { value: 5 * 1024 * 1024 * 1024 + 1 });

    await expect(
      uploadMediaAsset({ file: aep, brandId: 'b1' }, { createClient: () => client }),
    ).rejects.toThrow('file_too_large');
    expect(calls).toEqual([]);
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
