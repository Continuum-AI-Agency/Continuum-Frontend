import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { libraryPlaybackSchema } from '@continuum/contracts';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
  __testMintSignedUrl?: (...args: unknown[]) => unknown;
  __testMintSignedUrls?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));
mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: (...args: unknown[]) => hooks.__testMintSignedUrl?.(...args),
  mintSignedUrls: (...args: unknown[]) => hooks.__testMintSignedUrls?.(...args),
}));

import { GET } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const HEAD_ID = '1c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33';
const OLD_ID = '2d1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a44';

function rendition(role: string, overrides: FakeRow = {}): FakeRow {
  return {
    brand_id: BRAND_ID,
    asset_id: ASSET_ID,
    asset_version_id: HEAD_ID,
    role,
    state: 'ready',
    bucket: 'media-previews',
    storage_path: `${BRAND_ID}/${ASSET_ID}/${HEAD_ID}/${role}.mp4`,
    mime_type: 'video/mp4',
    size_bytes: 1000,
    width: 1920,
    height: 1080,
    duration_ms: 12_000,
    ...overrides,
  };
}

function useDb(renditions: FakeRow[], asset: FakeRow = {}) {
  const db = new FakeDb({
    'media.assets': [
      { id: ASSET_ID, brand_id: BRAND_ID, head_version_id: HEAD_ID, deleted_at: null, ...asset },
    ],
    'media.asset_renditions': renditions,
    'media.asset_versions': [{ id: HEAD_ID, asset_id: ASSET_ID, file_name: 'hero-cut.mov' }],
  });
  const client = createFakeSupabaseClient({ db });
  hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
}

function get(params: Record<string, string>) {
  const query = new URLSearchParams({ brandId: BRAND_ID, assetId: ASSET_ID, ...params });
  return GET(new Request(`http://localhost/api/library/playback?${query.toString()}`));
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
  hooks.__testMintSignedUrls = (items: { path: string }[]) =>
    Promise.resolve(new Map(items.map((item) => [item.path, `https://signed.test/${item.path}`])));
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
  hooks.__testMintSignedUrls = undefined;
});

describe('GET /api/library/playback', () => {
  it('signs the head ladder largest first, HDR last, with the sprite and audio proxy', async () => {
    useDb([
      rendition('proxy_360', { width: 640, height: 360 }),
      rendition('hdr_proxy', { width: 1920, height: 1080 }),
      rendition('preview_video', { width: 1280, height: 720 }),
      rendition('proxy_1080'),
      rendition('scrub_sprite', {
        mime_type: 'image/jpeg',
        storage_path: 'b/a/v/scrub_sprite.jpg',
        width: 1600,
        height: 900,
      }),
      rendition('audio_proxy', {
        mime_type: 'audio/mp4',
        storage_path: 'b/a/v/audio_proxy.m4a',
        width: null,
        height: null,
        size_bytes: 400,
      }),
    ]);

    const response = await get({});
    expect(response.status).toBe(200);
    const body = libraryPlaybackSchema.parse(await response.json());

    expect(body.assetVersionId).toBe(HEAD_ID);
    expect(body.rungs.map((rung) => [rung.role, rung.label, rung.hdr])).toEqual([
      ['proxy_1080', '1080p', false],
      ['preview_video', '720p', false],
      ['proxy_360', '360p', false],
      ['hdr_proxy', 'HDR', true],
    ]);
    expect(body.rungs[0]?.signedUrl).toBe(
      `https://signed.test/${BRAND_ID}/${ASSET_ID}/${HEAD_ID}/proxy_1080.mp4`,
    );
    expect(body.sprite).toEqual({
      signedUrl: 'https://signed.test/b/a/v/scrub_sprite.jpg',
      width: 1600,
      height: 900,
      durationMs: 12_000,
    });
    expect(body.audioProxy).toEqual({
      signedUrl: 'https://signed.test/b/a/v/audio_proxy.m4a',
      mimeType: 'audio/mp4',
      sizeBytes: 400,
    });
  });

  it('lists only ready rows — an unsupported rung is not a source', async () => {
    useDb([
      rendition('proxy_2160', { state: 'unsupported', bucket: null, storage_path: null }),
      rendition('proxy_1080', { state: 'processing' }),
      rendition('preview_video'),
      rendition('poster', { mime_type: 'image/webp' }),
    ]);

    const body = libraryPlaybackSchema.parse(await (await get({})).json());
    expect(body.rungs.map((rung) => rung.role)).toEqual(['preview_video']);
    expect(body.sprite).toBeNull();
    expect(body.audioProxy).toBeNull();
  });

  it('reads the version asked for, not the head', async () => {
    useDb([
      rendition('proxy_1080'),
      rendition('proxy_540', { asset_version_id: OLD_ID, width: 960, height: 540 }),
    ]);

    const body = libraryPlaybackSchema.parse(await (await get({ versionId: OLD_ID })).json());
    expect(body.assetVersionId).toBe(OLD_ID);
    expect(body.rungs.map((rung) => rung.role)).toEqual(['proxy_540']);
  });

  it('never reads another asset’s renditions through a borrowed version id', async () => {
    useDb([rendition('proxy_1080', { asset_id: '7f1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a55' })]);

    const body = libraryPlaybackSchema.parse(await (await get({})).json());
    expect(body.rungs).toEqual([]);
  });

  it('leaves out a rendition whose URL did not sign', async () => {
    useDb([rendition('proxy_1080'), rendition('preview_video')]);
    hooks.__testMintSignedUrls = (items: { path: string }[]) =>
      Promise.resolve(
        new Map(
          items
            .filter((item) => item.path.endsWith('preview_video.mp4'))
            .map((item) => [item.path, `https://signed.test/${item.path}`]),
        ),
      );

    const body = libraryPlaybackSchema.parse(await (await get({})).json());
    expect(body.rungs.map((rung) => rung.role)).toEqual(['preview_video']);
  });

  it('drops a sprite row that carries no sheet size', async () => {
    useDb([rendition('scrub_sprite', { mime_type: 'image/jpeg', width: null, height: null })]);

    const body = libraryPlaybackSchema.parse(await (await get({})).json());
    expect(body.sprite).toBeNull();
  });

  it('404s a trashed asset even when an exact version is named', async () => {
    useDb([rendition('proxy_1080')], { deleted_at: '2026-09-01T00:00:00Z' });
    expect((await get({ versionId: HEAD_ID })).status).toBe(404);
  });

  it('404s an asset with no version to play', async () => {
    useDb([], { head_version_id: null });
    expect((await get({})).status).toBe(404);
  });

  it('rejects callers without brand access', async () => {
    useDb([rendition('proxy_1080')]);
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    expect((await get({})).status).toBe(403);
  });

  it('rejects a malformed query before touching the database', async () => {
    hooks.__testCreateSupabaseServerClient = () => {
      throw new Error('must not construct a client for a bad query');
    };
    expect((await get({ assetId: 'not-a-uuid' })).status).toBe(422);
  });

  it('names the version file, so a saved still or proxy carries the asset name', async () => {
    useDb([rendition('preview_video', { width: 1280, height: 720 })]);
    const body = libraryPlaybackSchema.parse(await (await get({})).json());
    expect(body.fileName).toBe('hero-cut.mov');
    const older = libraryPlaybackSchema.parse(await (await get({ versionId: OLD_ID })).json());
    expect(older.fileName).toBeUndefined();
  });
});
