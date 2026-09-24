import { describe, expect, it, mock } from 'bun:test';
import { findExistingAssetByContent } from './findExistingAssetByContent';
import { computeChecksum, type SupabaseBrowserClient } from './uploadMediaAsset';

const BRAND = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';
const file = () => new File([new Uint8Array([7, 8, 9, 10])], 'image-nanoGen-1-3.jpg');

function fakeClient(row: Record<string, unknown> | null) {
  const filters: Array<[string, ...unknown[]]> = [];
  const query = {
    select: (columns: string) => (filters.push(['select', columns]), query),
    eq: (column: string, value: unknown) => (filters.push(['eq', column, value]), query),
    is: (column: string, value: unknown) => (filters.push(['is', column, value]), query),
    not: (column: string, op: string, value: unknown) => (
      filters.push(['not', column, op, value]), query
    ),
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const client = { schema: () => ({ from: () => query }) } as unknown as SupabaseBrowserClient;
  return { client, filters };
}

const signed = (signedUrl: string) =>
  mock(async () => new Response(JSON.stringify({ signedUrl }), { status: 200 }));

describe('findExistingAssetByContent', () => {
  it('matches on the brand, the exact bytes and the size, then signs the stored asset', async () => {
    const { client, filters } = fakeClient({
      id: 'asset-1',
      bucket: 'brand-profile-assets',
      storage_path: `${BRAND}/canvas-creations/calm-green-otter.jpg`,
      head_version_id: 'version-1',
    });
    const fetchImpl = signed('https://signed.example/asset-1');

    const found = await findExistingAssetByContent(
      { file: file(), brandId: BRAND },
      { createClient: () => client, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(found).toEqual({
      assetId: 'asset-1',
      versionId: 'version-1',
      storagePath: `${BRAND}/canvas-creations/calm-green-otter.jpg`,
      bucket: 'brand-profile-assets',
      signedUrl: 'https://signed.example/asset-1',
    });
    expect(filters).toContainEqual(['eq', 'brand_id', BRAND]);
    expect(filters).toContainEqual(['eq', 'checksum', await computeChecksum(file())]);
    expect(filters).toContainEqual(['eq', 'size_bytes', 4]);
    expect(filters).toContainEqual(['is', 'deleted_at', null]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ brandId: BRAND, assetId: 'asset-1' });
  });

  it('returns null on a miss or when the stored asset cannot be signed', async () => {
    const miss = await findExistingAssetByContent(
      { file: file(), brandId: BRAND },
      {
        createClient: () => fakeClient(null).client,
        fetchImpl: signed('x') as unknown as typeof fetch,
      },
    );
    expect(miss).toBeNull();

    const unsigned = await findExistingAssetByContent(
      { file: file(), brandId: BRAND },
      {
        createClient: () =>
          fakeClient({ id: 'a', bucket: 'b', storage_path: 'p', head_version_id: 'v' }).client,
        fetchImpl: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch,
      },
    );
    expect(unsigned).toBeNull();
  });
});
