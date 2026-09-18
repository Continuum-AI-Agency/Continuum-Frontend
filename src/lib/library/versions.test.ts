import { describe, expect, test } from 'bun:test';
import { uploadNewAssetVersion } from './versions';

const ticket = {
  bucket: 'media-source',
  path: 'brand/asset/v2/campaign.aep',
  token: 'signed-token',
  versionNumber: 2,
};

function fakeClient() {
  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
    storage: {
      from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }),
    },
  } as never;
}

function projectFile(): File {
  return new File(['project'], 'campaign.aep', { type: '' });
}

describe('uploadNewAssetVersion', () => {
  test('uses resumable TUS for uppercase .AEP and duplicate-safe registration', async () => {
    const resumableCalls: unknown[] = [];
    const registerCalls: unknown[] = [];
    const file = new File(['project'], 'Campaign.AEP', { type: '' });

    await uploadNewAssetVersion(
      { brandId: 'brand', assetId: 'asset', file },
      {
        createClient: fakeClient,
        signUpload: async () => ticket,
        supabaseUrl: 'https://db.test',
        resumableUpload: async (params) => {
          resumableCalls.push(params);
          return { uploadUrl: 'https://db.test/storage/v1/upload/resumable/id' };
        },
        registerVersion: async (request) => {
          registerCalls.push(request);
          return { assetId: 'asset', versionId: 'version-2', versionNumber: 2, versions: [] };
        },
        attachPreview: async () => 'awaiting_companion',
      },
    );

    expect(resumableCalls).toEqual([
      expect.objectContaining({
        bucket: 'media-source',
        objectPath: ticket.path,
        accessToken: 'user-jwt',
      }),
    ]);
    expect(registerCalls).toEqual([
      expect.objectContaining({
        mimeType: 'application/octet-stream',
        idempotencyKey: `version:asset:${ticket.path}`,
      }),
    ]);
  });

  test('registers the sha256 of the revision bytes, so the drop zone can match them', async () => {
    const registerCalls: unknown[] = [];
    await uploadNewAssetVersion(
      { brandId: 'brand', assetId: 'asset', baseVersionId: 'base', file: projectFile() },
      {
        createClient: fakeClient,
        signUpload: async () => ticket,
        supabaseUrl: 'https://db.test',
        resumableUpload: async () => ({ uploadUrl: 'https://db.test/upload/id' }),
        registerVersion: async (request) => {
          registerCalls.push(request);
          return { assetId: 'asset', versionId: 'version-2', versionNumber: 2, versions: [] };
        },
        attachPreview: async () => 'awaiting_companion',
      },
    );

    expect(registerCalls).toEqual([
      expect.objectContaining({
        baseVersionId: 'base',
        checksum: '244210e48437b6556980a70249a99369934a352429034cef9d7bd253b3bf2c01',
        integrityState: 'verified',
      }),
    ]);
  });

  test('sends no checksum for a revision above 64 MB', async () => {
    const registerCalls: Array<Record<string, unknown>> = [];
    const file = projectFile();
    Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 + 1 });
    await uploadNewAssetVersion(
      { brandId: 'brand', assetId: 'asset', file },
      {
        createClient: fakeClient,
        signUpload: async () => ticket,
        supabaseUrl: 'https://db.test',
        resumableUpload: async () => ({ uploadUrl: 'https://db.test/upload/id' }),
        registerVersion: async (request) => {
          registerCalls.push(request);
          return { assetId: 'asset', versionId: 'version-2', versionNumber: 2, versions: [] };
        },
        attachPreview: async () => 'awaiting_companion',
      },
    );

    expect(registerCalls).toHaveLength(1);
    expect('checksum' in (registerCalls[0] ?? {})).toBe(false);
    expect(registerCalls[0]?.integrityState).toBe('skipped_large_file');
  });

  test('rejects an .aep above 5 GB before signing', async () => {
    let signed = false;
    const file = new File(['stub'], 'too-large.aep', { type: '' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 * 1024 + 1 });

    await expect(
      uploadNewAssetVersion(
        { brandId: 'brand', assetId: 'asset', file },
        {
          createClient: fakeClient,
          signUpload: async () => {
            signed = true;
            return ticket;
          },
        },
      ),
    ).rejects.toThrow('file_too_large');
    expect(signed).toBe(false);
  });
});
