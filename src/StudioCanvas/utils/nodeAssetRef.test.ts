import { describe, expect, it, mock } from 'bun:test';
import type { StudioNode } from '../types';
import { ensureNodeAssetRef, readNodeAssetRef } from './nodeAssetRef';

const ASSET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRAND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const node = (data: Record<string, unknown>): StudioNode =>
  ({ id: 'node-1', type: 'image', position: { x: 0, y: 0 }, data }) as unknown as StudioNode;

describe('readNodeAssetRef', () => {
  it('reads the pointer under every name the canvas writes it under', () => {
    expect(readNodeAssetRef({ assetId: ASSET, assetVersionId: VERSION })).toEqual({
      assetId: ASSET,
      versionId: VERSION,
    });
    // "Open in Canvas" seeds this one; reading only `assetId` is what reported
    // "not saved to the Library" about an asset that came out of the Library.
    expect(readNodeAssetRef({ libraryAssetId: ASSET })).toEqual({ assetId: ASSET });
    expect(
      readNodeAssetRef({ renderOutputAssetId: ASSET, renderOutputAssetVersionId: VERSION }),
    ).toEqual({ assetId: ASSET, versionId: VERSION });
  });

  it("prefers a node's own render output over a reference it also holds", () => {
    expect(
      readNodeAssetRef({ renderOutputAssetId: ASSET, assetId: 'other', libraryAssetId: 'older' }),
    ).toEqual({ assetId: ASSET });
  });

  it('ignores sourceAssetId, which names the parent asset and not these bytes', () => {
    expect(readNodeAssetRef({ sourceAssetId: ASSET })).toBeNull();
  });

  it('treats blank and non-object input as no pointer', () => {
    expect(readNodeAssetRef({ assetId: '   ' })).toBeNull();
    expect(readNodeAssetRef(null)).toBeNull();
    expect(readNodeAssetRef('nope')).toBeNull();
  });
});

describe('ensureNodeAssetRef', () => {
  const params = { nodeId: 'node-1', brandId: BRAND, kind: 'image' as const };

  it('returns the pointer already on the node without touching the network', async () => {
    const register = mock(async () => ({ assetId: 'wrong', assetVersionId: null }));
    const upload = mock(async () => null);
    await expect(
      ensureNodeAssetRef(params, {
        getNodeById: () => node({ libraryAssetId: ASSET }),
        register,
        upload,
      }),
    ).resolves.toEqual({ assetId: ASSET });
    expect(register).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('registers in place when the bytes already sit in a brand bucket', async () => {
    const register = mock(async () => ({ assetId: ASSET, assetVersionId: VERSION }));
    const upload = mock(async () => null);
    const updateNodeData = mock(() => undefined);
    const triggerSave = mock(() => undefined);

    await expect(
      ensureNodeAssetRef(params, {
        getNodeById: () =>
          node({
            bucket: 'brand-profile-assets',
            sourcePath: `${BRAND}/hero.png`,
            fileName: 'hero.png',
          }),
        register,
        upload,
        updateNodeData,
        triggerSave,
      }),
    ).resolves.toEqual({ assetId: ASSET, versionId: VERSION });

    expect(upload).not.toHaveBeenCalled();
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      brandProfileId: BRAND,
      bucket: 'brand-profile-assets',
      storagePath: `${BRAND}/hero.png`,
      fileName: 'hero.png',
    });
    // Written back, or the next run and the Reformat button repeat this work.
    expect(updateNodeData).toHaveBeenCalledWith('node-1', {
      assetId: ASSET,
      assetVersionId: VERSION,
    });
    expect(triggerSave).toHaveBeenCalled();
  });

  it('uploads the bytes when the node only has a remote url', async () => {
    const register = mock(async () => null);
    const upload = mock(async () => ({
      assetId: ASSET,
      assetVersionId: VERSION,
      signedUrl: 'https://storage.test/hero.png',
      storagePath: `${BRAND}/hero.png`,
      bucket: 'brand-profile-assets',
    }));
    const fetchImpl = mock(
      async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
    ) as unknown as typeof fetch;

    await expect(
      ensureNodeAssetRef(params, {
        getNodeById: () => node({ image: 'https://images.test/photos/falcon.jpg' }),
        register,
        upload,
        fetchImpl,
        updateNodeData: () => undefined,
        triggerSave: () => undefined,
      }),
    ).resolves.toEqual({ assetId: ASSET, versionId: VERSION });

    expect(register).not.toHaveBeenCalled();
    const uploaded = upload.mock.calls[0]?.[0] as { file: File; field: string };
    expect(uploaded.file.name).toBe('falcon.jpg');
    expect(uploaded.field).toBe('image');
  });

  it('uploads once when a batch fan-out asks for the same node concurrently', async () => {
    let uploads = 0;
    const upload = mock(async () => {
      uploads += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        assetId: ASSET,
        assetVersionId: VERSION,
        signedUrl: 'u',
        storagePath: 'p',
        bucket: 'b',
      };
    });
    const deps = {
      getNodeById: () => node({ image: 'https://images.test/photos/falcon.jpg' }),
      upload,
      fetchImpl: mock(
        async () => new Response(new Blob([new Uint8Array([1])])),
      ) as unknown as typeof fetch,
      updateNodeData: () => undefined,
      triggerSave: () => undefined,
    };

    const results = await Promise.all([
      ensureNodeAssetRef(params, deps),
      ensureNodeAssetRef(params, deps),
      ensureNodeAssetRef(params, deps),
    ]);

    expect(results).toEqual([
      { assetId: ASSET, versionId: VERSION },
      { assetId: ASSET, versionId: VERSION },
      { assetId: ASSET, versionId: VERSION },
    ]);
    expect(uploads).toBe(1);
  });

  it('returns null when the node holds nothing an asset can be made from', async () => {
    await expect(
      ensureNodeAssetRef(params, { getNodeById: () => node({ fileName: 'empty.png' }) }),
    ).resolves.toBeNull();
    await expect(ensureNodeAssetRef(params, { getNodeById: () => undefined })).resolves.toBeNull();
  });
});
