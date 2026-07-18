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
