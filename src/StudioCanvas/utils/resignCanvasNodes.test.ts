// A canvas reloads with whatever URLs the saved row held, and every one of them has
// expired. These cover the two ways a node says where its bytes live — storage
// coordinates (backend route) and Library asset + exact version (same-origin route) —
// and what happens when only some of them can be re-signed.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { CANVAS_MEDIA_SIGN_ROUTE } from '@continuum/contracts';
import { clearSignedUrlCache } from './signedUrlCache';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b1';
const ASSET_A = '11111111-1111-4111-8111-11111111111a';
const ASSET_B = '11111111-1111-4111-8111-11111111111b';
const VERSION_A = '22222222-2222-4222-8222-22222222222a';
const VERSION_B = '22222222-2222-4222-8222-22222222222b';

let backendCalls: Array<Record<string, unknown>> = [];
let backendItems: Array<{ bucket: string; path: string; signedUrl: string }> = [];
let backendThrows = false;

mock.module('@/lib/api/http', () => ({
  request: async (input: { path: string; body: Record<string, unknown> }) => {
    backendCalls.push(input.body);
    if (backendThrows) throw new Error('canvas media sign is down');
    return { items: backendItems };
  },
}));

const { resignCanvasNodes } = await import('./resignCanvasNodes');

type SignBody = { brandId: string; assetId: string; versionId: string };
let signCalls: SignBody[] = [];
let refusedVersions: string[] = [];
const originalFetch = globalThis.fetch;

const versionUrl = (versionId: string) => `https://supabase.example/signed/${versionId}.png?fresh`;

beforeEach(() => {
  // resignCanvasNodes now shares one signed-URL cache across callers, and that cache
  // is module-scoped. Without this reset a later case is served the previous case's
  // URL and the backend route is never called, which is the cache behaving correctly
  // but tells this test nothing.
  clearSignedUrlCache();
  backendCalls = [];
  backendItems = [];
  backendThrows = false;
  signCalls = [];
  refusedVersions = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as SignBody;
    signCalls.push(body);
    if (url !== '/api/library/sign') throw new Error(`unexpected fetch to ${url}`);
    if (refusedVersions.includes(body.versionId)) {
      return new Response(JSON.stringify({ error: 'Asset version not found' }), { status: 404 });
    }
    return new Response(JSON.stringify({ signedUrl: versionUrl(body.versionId) }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const versionRef = (id: string, assetId: string, assetVersionId: string, type = 'image') =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      [type === 'video' ? 'video' : 'image']: 'https://supabase.example/expired.png?stale',
      sourceUrl: 'https://supabase.example/expired.png?stale',
      fileName: 'render.png',
      assetId,
      assetVersionId,
      referenceStatus: 'ready',
    },
  }) as never;

describe('resignCanvasNodes — asset + exact version references', () => {
  test('re-signs an api-render reference from its exact version and leaves the markup baseline alone', async () => {
    const [node] = await resignCanvasNodes([versionRef('ref-a', ASSET_A, VERSION_A)], BRAND_ID);

    expect(signCalls).toEqual([{ brandId: BRAND_ID, assetId: ASSET_A, versionId: VERSION_A }]);
    const data = node.data as Record<string, unknown>;
    expect(data.image).toBe(versionUrl(VERSION_A));
    expect(data.sourceUrl).toBe(versionUrl(VERSION_A));
    // `originalImage` is the markup baseline; a URL written there is frozen forever.
    expect(data).not.toHaveProperty('originalImage');
    // The durable identity survives untouched — it is what re-signs on the NEXT reload.
    expect(data.assetId).toBe(ASSET_A);
    expect(data.assetVersionId).toBe(VERSION_A);
  });

  test('a video reference lands on the video field, not the image field', async () => {
    const [node] = await resignCanvasNodes(
      [versionRef('ref-v', ASSET_A, VERSION_A, 'video')],
      BRAND_ID,
    );

    const data = node.data as Record<string, unknown>;
    expect(data.video).toBe(versionUrl(VERSION_A));
    expect(data.sourceUrl).toBe(versionUrl(VERSION_A));
    expect(data).not.toHaveProperty('image');
  });

  test('two nodes on the same asset and version cost exactly one sign', async () => {
    const nodes = await resignCanvasNodes(
      [versionRef('ref-a', ASSET_A, VERSION_A), versionRef('ref-a-copy', ASSET_A, VERSION_A)],
      BRAND_ID,
    );

    expect(signCalls.length).toBe(1);
    for (const node of nodes) {
      expect((node.data as Record<string, unknown>).image).toBe(versionUrl(VERSION_A));
    }
  });

  test('one refused pair leaves only its own node stale', async () => {
    // A batch of render outputs lands as several reference nodes. One bad row must not
    // cost the others their previews.
    refusedVersions = [VERSION_A];
    const [failed, ok] = await resignCanvasNodes(
      [versionRef('ref-a', ASSET_A, VERSION_A), versionRef('ref-b', ASSET_B, VERSION_B)],
      BRAND_ID,
    );

    expect(signCalls.length).toBe(2);
    expect((failed.data as Record<string, unknown>).image).toBe(
      'https://supabase.example/expired.png?stale',
    );
    expect((ok.data as Record<string, unknown>).image).toBe(versionUrl(VERSION_B));
  });

  test('storage coordinates win: a node carrying both is not signed twice', async () => {
    backendItems = [
      { bucket: 'media-library', path: 'brand/ref.png', signedUrl: 'https://coords.example/fresh' },
    ];
    const [node] = await resignCanvasNodes(
      [
        {
          id: 'ref-both',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            image: 'stale',
            bucket: 'media-library',
            sourcePath: 'brand/ref.png',
            assetId: ASSET_A,
            assetVersionId: VERSION_A,
          },
        } as never,
      ],
      BRAND_ID,
    );

    expect(signCalls).toEqual([]);
    expect(backendCalls.length).toBe(1);
    expect((node.data as Record<string, unknown>).image).toBe('https://coords.example/fresh');
  });

  test('a dead coordinate route still lets version references through', async () => {
    backendThrows = true;
    const nodes = await resignCanvasNodes(
      [
        {
          id: 'coords',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { image: 'stale', bucket: 'media-library', sourcePath: 'brand/ref.png' },
        } as never,
        versionRef('ref-b', ASSET_B, VERSION_B),
      ],
      BRAND_ID,
    );

    expect((nodes[0].data as Record<string, unknown>).image).toBe('stale');
    expect((nodes[1].data as Record<string, unknown>).image).toBe(versionUrl(VERSION_B));
  });

  test('the backend route is still the one that signs storage coordinates', async () => {
    backendItems = [
      { bucket: 'media-library', path: 'brand/ref.png', signedUrl: 'https://coords.example/fresh' },
    ];
    await resignCanvasNodes(
      [
        {
          id: 'coords',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { image: 'stale', bucket: 'media-library', sourcePath: 'brand/ref.png' },
        } as never,
      ],
      BRAND_ID,
    );

    expect(typeof CANVAS_MEDIA_SIGN_ROUTE).toBe('string');
    expect(backendCalls[0]?.brandProfileId).toBe(BRAND_ID);
    expect(signCalls).toEqual([]);
  });

  test('no brand means no network at all', async () => {
    const nodes = [versionRef('ref-a', ASSET_A, VERSION_A)];
    expect(await resignCanvasNodes(nodes, undefined)).toBe(nodes);
    expect(signCalls).toEqual([]);
    expect(backendCalls).toEqual([]);
  });

  test('a reference with no identity of either kind is returned untouched', async () => {
    const nodes = [
      {
        id: 'plain',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { image: 'data:image/png;base64,abc' },
      } as never,
    ];
    expect(await resignCanvasNodes(nodes, BRAND_ID)).toBe(nodes);
    expect(signCalls).toEqual([]);
    expect(backendCalls).toEqual([]);
  });
});
