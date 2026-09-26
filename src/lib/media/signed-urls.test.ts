import { afterEach, describe, expect, it, mock } from 'bun:test';

type TestHooks = {
  __testCreateSupabaseServerClient?: () => unknown;
};

const hooks = globalThis as TestHooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => hooks.__testCreateSupabaseServerClient?.(),
}));

import { displayDerivativeKey } from './mapper';
import { assetSignablePaths, mintSignedUrls } from './signed-urls';

const ORIGIN = 'https://proj.supabase.co/storage/v1';

type SignCall = { bucket: string; path: string; transform?: unknown };

function fakeStorage(options: { failPaths?: string[]; failBatchBucket?: string } = {}) {
  const single: SignCall[] = [];
  const batches: { bucket: string; paths: string[] }[] = [];
  hooks.__testCreateSupabaseServerClient = () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => {
          batches.push({ bucket, paths });
          if (bucket === options.failBatchBucket) return { data: null, error: { message: 'boom' } };
          return {
            data: paths.map((path) => ({
              path,
              signedUrl: `${ORIGIN}/object/sign/${bucket}/${path}`,
            })),
            error: null,
          };
        },
        createSignedUrl: async (path: string, _ttl: number, opts?: { transform?: unknown }) => {
          single.push({ bucket, path, transform: opts?.transform });
          if (options.failPaths?.includes(path)) return { data: null, error: { message: 'boom' } };
          return {
            data: { signedUrl: `${ORIGIN}/render/image/sign/${bucket}/${path}` },
            error: null,
          };
        },
      }),
    },
  });
  return { single, batches };
}

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
});

describe('assetSignablePaths', () => {
  it('asks for a display derivative only for resizable images with no poster', () => {
    const items = assetSignablePaths([
      { bucket: 'b', storage_path: 'photo.jpg', mime_type: 'image/jpeg' },
      { bucket: 'b', storage_path: 'anim.gif', mime_type: 'image/gif' },
      {
        bucket: 'b',
        storage_path: 'clip.mp4',
        mime_type: 'video/mp4',
        thumbnail_path: 'poster.jpg',
      },
      {
        bucket: 'b',
        storage_path: 'postered.png',
        mime_type: 'image/png',
        thumbnail_path: 'p.png',
      },
    ]);
    expect(items.filter((item) => item.displayDerivative).map((item) => item.path)).toEqual([
      'photo.jpg',
    ]);
    expect(items.filter((item) => !item.displayDerivative).map((item) => item.path)).toEqual([
      'photo.jpg',
      'anim.gif',
      'clip.mp4',
      'poster.jpg',
      'postered.png',
      'p.png',
    ]);
  });
});

describe('mintSignedUrls', () => {
  it('signs originals in one batch and each derivative on its own call with a transform', async () => {
    const calls = fakeStorage();
    const map = await mintSignedUrls([
      { bucket: 'b', path: 'a.jpg' },
      { bucket: 'b', path: 'a.jpg', displayDerivative: true },
      { bucket: 'b', path: 'c.jpg' },
    ]);

    expect(calls.batches).toEqual([{ bucket: 'b', paths: ['a.jpg', 'c.jpg'] }]);
    expect(calls.single).toHaveLength(1);
    expect(calls.single[0]?.path).toBe('a.jpg');
    expect(calls.single[0]?.transform).toMatchObject({ width: 480, height: 480 });
    expect(map.get('a.jpg')).toBe(`${ORIGIN}/object/sign/b/a.jpg`);
    expect(map.get(displayDerivativeKey('a.jpg'))).toBe(`${ORIGIN}/render/image/sign/b/a.jpg`);
  });

  it('drops only the item that failed to sign', async () => {
    fakeStorage({ failPaths: ['bad.jpg'], failBatchBucket: 'down' });
    const map = await mintSignedUrls([
      { bucket: 'b', path: 'ok.jpg' },
      { bucket: 'b', path: 'ok.jpg', displayDerivative: true },
      { bucket: 'b', path: 'bad.jpg', displayDerivative: true },
      { bucket: 'down', path: 'lost.jpg' },
      { bucket: 'down', path: 'lost.jpg', displayDerivative: true },
    ]);

    expect(map.get('ok.jpg')).toBeString();
    expect(map.get(displayDerivativeKey('ok.jpg'))).toBeString();
    expect(map.has(displayDerivativeKey('bad.jpg'))).toBe(false);
    expect(map.has('lost.jpg')).toBe(false);
    expect(map.get(displayDerivativeKey('lost.jpg'))).toBeString();
  });
});
